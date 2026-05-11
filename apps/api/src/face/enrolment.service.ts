import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '../common/context/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { StorageKind, buildStorageKey } from '../storage/storage.interface'
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface'
import { AntiSpoofClient } from './antispoof.client'
import { ComprefaceClient } from './compreface.client'
import { FaceDataService } from './face-data.service'

export interface EnrolmentImage {
  buffer: Buffer
  originalname?: string
}

export interface EnrolmentResult {
  memberId: string
  enrolled: number
  failed: Array<{ index: number; reason: string }>
  faceEnrolledAt: string
}

/** Fewer than this and recognition is unreliable at a real doorway. */
const MIN_IMAGES = 2
const MAX_IMAGES = 8
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

@Injectable()
export class EnrolmentService {
  private readonly logger = new Logger(EnrolmentService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly compreface: ComprefaceClient,
    private readonly antiSpoof: AntiSpoofClient,
    private readonly faceData: FaceDataService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * Enrols a member's face from several captures.
   *
   * Order of checks matters and is not arbitrary:
   *
   *   1. Consent, before a single byte of biometric data is processed. This is
   *      the legal gate and it comes first.
   *   2. The tenant's own collection, so faces land in the right place.
   *   3. Per-image: anti-spoof score, then CompreFace, then our storage and row.
   *
   * Partial success is reported honestly rather than rolled back. Three good
   * captures out of four is a usable enrolment, and discarding them because the
   * fourth was blurred would make the admin redo all of it.
   */
  async enrol(memberId: string, images: EnrolmentImage[]): Promise<EnrolmentResult> {
    if (images.length < MIN_IMAGES) {
      throw new BadRequestException({
        code: 'TOO_FEW_IMAGES',
        message:
          `Send at least ${MIN_IMAGES} photos. A single head-on photo enrols fine and then ` +
          `fails to match at an angled doorway camera.`,
      })
    }

    if (images.length > MAX_IMAGES) {
      throw new BadRequestException({
        code: 'TOO_MANY_IMAGES',
        message: `Send at most ${MAX_IMAGES} photos.`,
      })
    }

    const member = await this.prisma.db.member.findUnique({ where: { id: memberId } })
    if (!member) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' })

    // 1. Consent gate.
    if (!member.consentAt) {
      throw new ConflictException({
        code: 'CONSENT_REQUIRED',
        message:
          'No biometric consent is recorded for this member. Record consent before enrolling ' +
          'a face.',
      })
    }

    // 2. The tenant's collection.
    const apiKey = await this.faceData.tenantApiKey()
    if (!apiKey) {
      throw new ConflictException({
        code: 'FACE_ENGINE_NOT_PROVISIONED',
        message:
          'This organization has no face collection yet. A platform administrator can provision ' +
          'one from the console.',
      })
    }

    const tenantId = RequestContext.requireTenantId()
    const subject = this.subjectFor(member.id, member.code)
    const settings = await this.prisma.db.tenantSettings.findUnique({ where: { tenantId } })
    const storeImages = !settings?.storeEmbeddingOnly

    const failed: EnrolmentResult['failed'] = []
    let enrolled = 0

    for (const [index, image] of images.entries()) {
      if (image.buffer.byteLength > MAX_IMAGE_BYTES) {
        failed.push({ index, reason: 'Image is too large' })
        continue
      }

      try {
        const spoof = await this.antiSpoof.score(image.buffer)

        if (this.antiSpoof.enforcing && spoof.ready && spoof.score !== null) {
          const threshold = settings?.rejectSpoofAbove
          if (threshold !== null && threshold !== undefined && spoof.score > threshold) {
            failed.push({ index, reason: 'Photo looks like a screen or a print, not a live face' })
            continue
          }
        }

        const added = await this.compreface.addFace(apiKey, subject, image.buffer)

        // Stored only when the tenant wants the raw photo kept. With
        // `storeEmbeddingOnly` the image is used and discarded, which is a
        // meaningful privacy option to be able to offer.
        let imageRef: string | null = null
        if (storeImages) {
          imageRef = buildStorageKey({
            tenantId,
            kind: StorageKind.ENROLMENT,
            id: randomUUID(),
          })
          await this.storage.put(imageRef, image.buffer, 'image/jpeg')
        }

        await this.prisma.db.faceTemplate.create({
          data: {
            tenantId,
            memberId,
            comprefaceImageId: added.imageId,
            comprefaceSubject: subject,
            imageRef,
            spoofScore: spoof.score,
            enrolledBy: RequestContext.userId ?? null,
          } satisfies Prisma.FaceTemplateUncheckedCreateInput,
        })

        enrolled += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        this.logger.warn(`Enrolment image ${index} failed for member ${memberId}: ${reason}`)
        failed.push({ index, reason: this.readableFailure(reason) })
      }
    }

    if (enrolled === 0) {
      throw new BadRequestException({
        code: 'ENROLMENT_FAILED',
        message:
          'None of the photos could be enrolled. Usually this means no clear face was found. ' +
          'Try again in better light.',
        details: { images: failed.map((entry) => `Photo ${entry.index + 1}: ${entry.reason}`) },
      })
    }

    const updated = await this.prisma.db.member.update({
      where: { id: memberId },
      data: { faceEnrolledAt: new Date() },
    })

    this.logger.log(`Enrolled ${enrolled} faces for member ${memberId} (${failed.length} failed)`)

    return {
      memberId,
      enrolled,
      failed,
      faceEnrolledAt: (updated.faceEnrolledAt ?? new Date()).toISOString(),
    }
  }

  /**
   * The CompreFace subject name.
   *
   * The member id is included because it is stable and unique, while a member
   * code can be reassigned when a student leaves and their roll number is
   * reused. The code is appended purely so a human browsing the CompreFace UI
   * can tell who a subject is.
   */
  private subjectFor(memberId: string, code: string): string {
    return `${memberId}|${code}`.slice(0, 200)
  }

  private readableFailure(reason: string): string {
    if (/no face|not found|400/i.test(reason)) return 'No clear face found in this photo'
    if (/unreachable|timed out|ECONNREFUSED/i.test(reason)) return 'The face engine is unavailable'
    return 'Could not process this photo'
  }
}
