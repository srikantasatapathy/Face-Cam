import { Injectable, Logger } from '@nestjs/common'
import {
  CONSENT_VERSION,
  type ImportMembersInput,
  type ImportReport,
  type ImportRowError,
} from '@facecam/shared'
import type { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { RequestContext } from '../common/context/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { FieldDefinitionsService } from './field-definitions.service'

/** Row 1 is the header in any spreadsheet, so data starts at row 2. */
const FIRST_DATA_ROW = 2

@Injectable()
export class MemberImportService {
  private readonly logger = new Logger(MemberImportService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly fields: FieldDefinitionsService,
  ) {}

  /**
   * Validates, and optionally commits, a batch of member rows.
   *
   * Two behaviours matter more than they look:
   *
   * 1. **Dry run is the default.** An admin uploading 800 students gets a full
   *    error report before anything is written, rather than discovering row 412
   *    was malformed after 411 rows already landed.
   *
   * 2. **The commit is all-or-nothing.** A partial import leaves an
   *    organization unable to tell which rows made it, and re-uploading then
   *    trips duplicate-code errors on the half that succeeded.
   */
  async run(input: ImportMembersInput): Promise<ImportReport> {
    const tenantId = RequestContext.requireTenantId()
    const schema = await this.fields.memberSchema()
    const definitions = await this.fields.activeDefinitions()
    const attributeKeys = new Set(definitions.map((definition) => definition.key))

    const errors: ImportRowError[] = []
    const prepared: Array<{ row: number; data: Prisma.MemberCreateManyInput }> = []
    const seenCodes = new Map<string, number>()

    for (const [index, raw] of input.rows.entries()) {
      const rowNumber = index + FIRST_DATA_ROW
      const payload = this.mapRow(raw, input.mapping, attributeKeys)

      let parsed
      try {
        parsed = await schema.parseAsync(payload)
      } catch (error) {
        if (error instanceof ZodError) {
          for (const issue of error.issues) {
            errors.push({
              row: rowNumber,
              field: issue.path.join('.') || '_',
              message: issue.message,
            })
          }
          continue
        }
        throw error
      }

      // Duplicates within the file itself. Reported against the second
      // occurrence, naming the first, because that is the row to go and fix.
      const previous = seenCodes.get(parsed.code)
      if (previous !== undefined) {
        errors.push({
          row: rowNumber,
          field: 'code',
          message: `Duplicate of the code on row ${previous} in this file`,
        })
        continue
      }
      seenCodes.set(parsed.code, rowNumber)

      prepared.push({
        row: rowNumber,
        data: {
          tenantId,
          code: parsed.code,
          fullName: parsed.fullName,
          email: parsed.email ?? null,
          phone: parsed.phone ?? null,
          attributes: parsed.attributes as Prisma.InputJsonValue,
          consentAt: null,
          consentVersion: null,
        },
      })
    }

    // Codes already present in the database.
    const existing = await this.prisma.db.member.findMany({
      where: { code: { in: prepared.map((entry) => entry.data.code) } },
      select: { id: true, code: true },
    })
    const existingByCode = new Map(existing.map((member) => [member.code, member.id]))

    const toCreate: typeof prepared = []
    const toUpdate: typeof prepared = []

    for (const entry of prepared) {
      const existingId = existingByCode.get(entry.data.code)
      if (!existingId) {
        toCreate.push(entry)
      } else if (input.updateExisting) {
        toUpdate.push(entry)
      } else {
        errors.push({
          row: entry.row,
          field: 'code',
          message: `A member with the code "${entry.data.code}" already exists`,
        })
      }
    }

    const report: ImportReport = {
      dryRun: input.dryRun,
      totalRows: input.rows.length,
      valid: toCreate.length + toUpdate.length,
      created: 0,
      updated: 0,
      skipped: input.rows.length - (toCreate.length + toUpdate.length),
      errors,
    }

    // Nothing is written while any row is invalid. Importing "the good ones"
    // leaves the admin reconciling two lists by hand.
    if (input.dryRun || errors.length > 0) return report

    const consentVersion = input.consentVersion || CONSENT_VERSION

    await this.prisma.$transaction(async (tx) => {
      if (toCreate.length > 0) {
        await tx.member.createMany({ data: toCreate.map((entry) => entry.data) })
      }

      for (const entry of toUpdate) {
        const id = existingByCode.get(entry.data.code)
        if (!id) continue
        await tx.member.update({
          where: { id },
          data: {
            fullName: entry.data.fullName,
            email: entry.data.email,
            phone: entry.data.phone,
            attributes: entry.data.attributes as Prisma.InputJsonValue,
          },
        })
      }
    })

    report.created = toCreate.length
    report.updated = toUpdate.length

    this.logger.log(
      `Imported members for tenant ${tenantId}: ` +
        `${report.created} created, ${report.updated} updated`,
    )

    // Consent is deliberately NOT granted by import. A spreadsheet cannot
    // record that a person agreed to biometric processing; that has to be
    // captured per member. Imported members exist but cannot be face-enrolled
    // until someone records their consent.
    void consentVersion

    return report
  }

  /** Applies the column mapping, splitting core columns from dynamic attributes. */
  private mapRow(
    raw: Record<string, string>,
    mapping: Record<string, string>,
    attributeKeys: Set<string>,
  ): Record<string, unknown> {
    const core: Record<string, unknown> = {}
    const attributes: Record<string, unknown> = {}

    for (const [target, column] of Object.entries(mapping)) {
      if (!column) continue
      const value = (raw[column] ?? '').trim()

      if (attributeKeys.has(target)) {
        attributes[target] = value
      } else {
        core[target] = value
      }
    }

    return { ...core, attributes }
  }
}
