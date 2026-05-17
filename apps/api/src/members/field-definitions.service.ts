import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  buildMemberSchema,
  fieldsForTemplate,
  type CreateFieldDefinitionInput,
  type FieldDefinition,
  type FieldDefinitionDto,
  type ReorderFieldDefinitionsInput,
  type UpdateFieldDefinitionInput,
} from '@facecam/shared'
import type { MemberFieldDefinition, Prisma } from '@prisma/client'
import { RequestContext } from '../common/context/request-context'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class FieldDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seeds a new tenant's fields from its template.
   *
   * Runs inside the caller's transaction so a tenant is never created with a
   * half-populated field set. The seeded rows belong to the organization from
   * that moment: they can be edited, reordered or archived freely.
   */
  static seedData(
    tenantId: string,
    template: string,
  ): Prisma.MemberFieldDefinitionCreateManyInput[] {
    return fieldsForTemplate(template).map((field) => ({
      tenantId,
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options ?? [],
      group: field.group ?? null,
      sortOrder: field.sortOrder,
      helpText: field.helpText ?? null,
      maxLength: field.maxLength ?? null,
      min: field.min ?? null,
      max: field.max ?? null,
    }))
  }

  /** Active definitions in display order. Archived ones are excluded. */
  async list(includeArchived = false): Promise<FieldDefinitionDto[]> {
    const rows = await this.prisma.db.memberFieldDefinition.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map(toDto)
  }

  /**
   * The validation schema for this tenant's members, rebuilt from the current
   * definitions on every call.
   *
   * Deliberately not cached: an admin who adds a required field expects the
   * next save to enforce it, and a stale schema would either reject valid data
   * or accept invalid data. The query is a single indexed read.
   */
  async memberSchema() {
    const definitions = await this.activeDefinitions()
    return buildMemberSchema(definitions)
  }

  async activeDefinitions(): Promise<FieldDefinition[]> {
    const rows = await this.prisma.db.memberFieldDefinition.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    })
    return rows.map(toFieldDefinition)
  }

  async create(input: CreateFieldDefinitionInput): Promise<FieldDefinitionDto> {
    const tenantId = RequestContext.requireTenantId()

    const clash = await this.prisma.db.memberFieldDefinition.findFirst({
      where: { key: input.key },
    })
    if (clash) {
      throw new ConflictException({
        code: 'FIELD_KEY_TAKEN',
        message:
          clash.archivedAt === null
            ? `A field with the key "${input.key}" already exists.`
            : `An archived field uses the key "${input.key}". Restore it instead of recreating it, ` +
              `so existing member values are not orphaned.`,
      })
    }

    const last = await this.prisma.db.memberFieldDefinition.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })

    const created = await this.prisma.db.memberFieldDefinition.create({
      data: {
        tenantId,
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
        options: input.options,
        group: input.group ?? null,
        helpText: input.helpText ?? null,
        maxLength: input.maxLength ?? null,
        min: input.min ?? null,
        max: input.max ?? null,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    })

    return toDto(created)
  }

  async update(id: string, input: UpdateFieldDefinitionInput): Promise<FieldDefinitionDto> {
    await this.assertExists(id)

    const updated = await this.prisma.db.memberFieldDefinition.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.options !== undefined ? { options: input.options } : {}),
        ...(input.group !== undefined ? { group: input.group } : {}),
        ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
        ...(input.maxLength !== undefined ? { maxLength: input.maxLength } : {}),
        ...(input.min !== undefined ? { min: input.min } : {}),
        ...(input.max !== undefined ? { max: input.max } : {}),
      },
    })

    return toDto(updated)
  }

  /**
   * Archives rather than deletes.
   *
   * The values already stored under this key stay in `members.attributes`
   * untouched. The field disappears from forms and from validation, and
   * restoring it brings the data back into view rather than resurrecting an
   * empty column. Hard-deleting would silently destroy data an organization
   * spent hours entering.
   */
  async archive(id: string): Promise<FieldDefinitionDto> {
    await this.assertExists(id)
    const archived = await this.prisma.db.memberFieldDefinition.update({
      where: { id },
      data: { archivedAt: new Date(), required: false },
    })
    return toDto(archived)
  }

  async restore(id: string): Promise<FieldDefinitionDto> {
    await this.assertExists(id)
    const restored = await this.prisma.db.memberFieldDefinition.update({
      where: { id },
      data: { archivedAt: null },
    })
    return toDto(restored)
  }

  async reorder(input: ReorderFieldDefinitionsInput): Promise<FieldDefinitionDto[]> {
    const tenantId = RequestContext.requireTenantId()

    // One transaction: a partial reorder would leave the form in an order
    // nobody chose. `withTenantTx` sets the RLS session variable once for the
    // whole batch, so the tenant filter has to be written explicitly here.
    await this.prisma.withTenantTx(async (tx) => {
      for (const [index, id] of input.ids.entries()) {
        await tx.memberFieldDefinition.updateMany({
          where: { id, tenantId },
          data: { sortOrder: (index + 1) * 10 },
        })
      }
    })

    return this.list()
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.db.memberFieldDefinition.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!found) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Field not found' })
    }
  }
}

function toFieldDefinition(row: MemberFieldDefinition): FieldDefinition {
  return {
    key: row.key,
    label: row.label,
    type: row.type,
    required: row.required,
    options: row.options,
    group: row.group ?? undefined,
    sortOrder: row.sortOrder,
    helpText: row.helpText ?? undefined,
    maxLength: row.maxLength ?? undefined,
    min: row.min ?? undefined,
    max: row.max ?? undefined,
  }
}

function toDto(row: MemberFieldDefinition): FieldDefinitionDto {
  return {
    ...toFieldDefinition(row),
    id: row.id,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }
}
