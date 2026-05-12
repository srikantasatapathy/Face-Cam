import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { RequestContext } from '../common/context/request-context'
import { EncryptionService } from '../common/crypto/encryption.service'
import { PrismaService } from '../prisma/prisma.service'
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface'
import { ComprefaceClient } from './compreface.client'

export interface FaceErasureReport {
  memberId: string
  templatesRemoved: number
  imagesRemoved: number
  comprefaceCleared: boolean
}

/**
 * Deletion of biometric data, across all three places it lives.
 *
 * A face exists in the CompreFace collection, as an image in our storage, and
 * as a row in `face_templates`. "Deleted" has to mean all three, or a consent
 * withdrawal is a lie and a deletion request is unmet.
 *
 * The ordering matters: CompreFace first, then storage, then the database row.
 * If CompreFace fails, nothing else is touched and the caller gets an error, so
 * the operation can be retried from a known state. Removing our row first would
 * leave an orphaned face still matching at the kiosk with nothing pointing at
 * it. See PROJECT_DESCRIPTION.md section 12.
 */
@Injectable()
export class FaceDataService {
  private readonly logger = new Logger(FaceDataService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly compreface: ComprefaceClient,
    private readonly encryption: EncryptionService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * Removes every face for one member, leaving the member record intact.
   *
   * Used both when re-enrolling from scratch and as part of withdrawing
   * consent.
   */
  async eraseMemberFaces(memberId: string): Promise<FaceErasureReport> {
    const member = await this.prisma.db.member.findUnique({ where: { id: memberId } })
    if (!member) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' })
    }

    const templates = await this.prisma.db.faceTemplate.findMany({ where: { memberId } })

    if (templates.length === 0) {
      return { memberId, templatesRemoved: 0, imagesRemoved: 0, comprefaceCleared: true }
    }

    // 1. CompreFace. Done first, and allowed to throw: if the engine still
    //    holds the face, the person can still be recognised, so reporting
    //    success here would be false.
    const apiKey = await this.tenantApiKey()
    const subject = templates.find((template) => template.comprefaceSubject)?.comprefaceSubject

    let comprefaceCleared = true
    if (apiKey && subject) {
      await this.compreface.deleteSubject(apiKey, subject)
    } else if (!apiKey) {
      // No collection was ever provisioned, so there is nothing there to clear.
      comprefaceCleared = templates.every((template) => !template.comprefaceImageId)
    }

    // 2. Stored images. A failure here is logged but does not abort: the
    //    biometric template is already gone, and a stranded image is a smaller
    //    problem than leaving the face enrolled while the row says otherwise.
    let imagesRemoved = 0
    for (const template of templates) {
      if (!template.imageRef) continue
      try {
        await this.storage.delete(template.imageRef)
        imagesRemoved += 1
      } catch (error) {
        this.logger.error(
          `Failed to delete stored image ${template.imageRef}: ${String(error)}. ` +
            `This must be cleaned up manually.`,
        )
      }
    }

    // 3. Our rows.
    const { count } = await this.prisma.db.faceTemplate.deleteMany({ where: { memberId } })
    await this.prisma.db.member.update({
      where: { id: memberId },
      data: { faceEnrolledAt: null },
    })

    this.logger.log(
      `Erased ${count} face templates for member ${memberId} ` +
        `(${imagesRemoved} images, compreface=${comprefaceCleared})`,
    )

    return { memberId, templatesRemoved: count, imagesRemoved, comprefaceCleared }
  }

  /**
   * Withdraws biometric consent.
   *
   * Withdrawal is not a flag: keeping the templates after consent is withdrawn
   * would mean processing biometric data without a lawful basis. So this always
   * erases the faces too, and the two cannot be separated by an API caller.
   */
  async withdrawConsent(memberId: string, reason?: string): Promise<FaceErasureReport> {
    const report = await this.eraseMemberFaces(memberId)

    await this.prisma.db.member.update({
      where: { id: memberId },
      data: {
        consentAt: null,
        consentVersion: null,
        consentRecordedBy: null,
        consentWithdrawnAt: new Date(),
        consentWithdrawnReason: reason ?? null,
      },
    })

    this.logger.log(`Consent withdrawn for member ${memberId}`)
    return report
  }

  /** Records consent for a member who was added without it, typically by import. */
  async recordConsent(memberId: string, version: string): Promise<void> {
    const member = await this.prisma.db.member.findUnique({ where: { id: memberId } })
    if (!member) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' })
    }

    await this.prisma.db.member.update({
      where: { id: memberId },
      data: {
        consentAt: new Date(),
        consentVersion: version,
        consentRecordedBy: RequestContext.userId ?? null,
        consentWithdrawnAt: null,
        consentWithdrawnReason: null,
      },
    })
  }

  /** True when this member may have a face enrolled. */
  async hasConsent(memberId: string): Promise<boolean> {
    const member = await this.prisma.db.member.findUnique({
      where: { id: memberId },
      select: { consentAt: true },
    })
    return Boolean(member?.consentAt)
  }

  /**
   * Enrolled faces for a member, each with a short-lived link to its image.
   *
   * Signed rather than direct: an enrolment photo is biometric data, so the URL
   * expires and cannot be shared or bookmarked usefully.
   */
  async listMemberFaces(memberId: string) {
    const templates = await this.prisma.db.faceTemplate.findMany({
      where: { memberId },
      orderBy: { createdAt: 'asc' },
    })

    return Promise.all(
      templates.map(async (template) => ({
        id: template.id,
        createdAt: template.createdAt.toISOString(),
        spoofScore: template.spoofScore,
        imageUrl: template.imageRef ? await this.storage.signedUrl(template.imageRef) : null,
      })),
    )
  }

  /** The tenant's CompreFace key, decrypted. Null before provisioning. */
  async tenantApiKey(): Promise<string | null> {
    const tenantId = RequestContext.requireTenantId()

    const tenant = await RequestContext.asPlatform(() =>
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { comprefaceApiKeyEnc: true },
      }),
    )

    if (!tenant?.comprefaceApiKeyEnc) return null
    return this.encryption.decrypt(tenant.comprefaceApiKeyEnc)
  }
}
