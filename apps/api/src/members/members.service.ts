import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  CONSENT_VERSION,
  MemberStatus,
  type ConsentInput,
  type ListMembersQuery,
  type MemberDto,
  type Paginated,
} from '@facecam/shared'
import type { Member, Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { RequestContext } from '../common/context/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { FieldDefinitionsService } from './field-definitions.service'

export interface MemberWriteInput {
  code: string
  fullName: string
  email?: string
  phone?: string
  attributes: Record<string, unknown>
  consent?: ConsentInput
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fields: FieldDefinitionsService,
  ) {}

  /**
   * Validates a payload against this tenant's current field definitions.
   *
   * The schema is generated at request time from the same definitions the web
   * form renders, so the API and the form cannot disagree about what is
   * acceptable. Errors are thrown as ZodError and turned into field-level
   * `details` by the global exception filter.
   */
  async validate(payload: unknown): Promise<MemberWriteInput> {
    const schema = await this.fields.memberSchema()
    return schema.parseAsync(payload) as Promise<MemberWriteInput>
  }

  async list(query: ListMembersQuery): Promise<Paginated<MemberDto>> {
    const where: Prisma.MemberWhereInput = {
      // Archived members are hidden unless asked for. Their attendance history
      // still exists; they are simply no longer part of the roll.
      ...(query.status ? { status: query.status } : { archivedAt: null }),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
      // Containment against the JSONB column, which the GIN index serves.
      ...(query.attribute && query.attributeValue
        ? { attributes: { path: [query.attribute], equals: query.attributeValue } }
        : {}),
    }

    const [total, rows] = await Promise.all([
      this.prisma.db.member.count({ where }),
      this.prisma.db.member.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    return {
      items: rows.map(toDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async findById(id: string): Promise<MemberDto> {
    const member = await this.prisma.db.member.findUnique({ where: { id } })
    if (!member) throw notFound()
    return toDto(member)
  }

  async create(input: MemberWriteInput): Promise<MemberDto> {
    const tenantId = RequestContext.requireTenantId()
    await this.assertCodeFree(input.code)

    const member = await this.prisma.db.member.create({
      data: {
        tenantId,
        code: input.code,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        attributes: input.attributes as Prisma.InputJsonValue,
        ...this.consentColumns(input.consent),
      },
    })

    return toDto(member)
  }

  async update(id: string, input: MemberWriteInput): Promise<MemberDto> {
    const existing = await this.prisma.db.member.findUnique({ where: { id } })
    if (!existing) throw notFound()

    if (input.code !== existing.code) await this.assertCodeFree(input.code)

    const member = await this.prisma.db.member.update({
      where: { id },
      data: {
        code: input.code,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        attributes: input.attributes as Prisma.InputJsonValue,
        // Consent is only ever added, never revoked by an ordinary edit.
        // Withdrawing consent is a separate, deliberate action.
        ...(existing.consentAt ? {} : this.consentColumns(input.consent)),
      },
    })

    return toDto(member)
  }

  /**
   * Archives a member. Their attendance history stays intact, because a report
   * for last March must still show the students who were enrolled last March.
   */
  async archive(id: string): Promise<MemberDto> {
    const existing = await this.prisma.db.member.findUnique({ where: { id } })
    if (!existing) throw notFound()

    const member = await this.prisma.db.member.update({
      where: { id },
      data: { status: MemberStatus.ARCHIVED, archivedAt: new Date() },
    })
    return toDto(member)
  }

  async restore(id: string): Promise<MemberDto> {
    const existing = await this.prisma.db.member.findUnique({ where: { id } })
    if (!existing) throw notFound()

    const member = await this.prisma.db.member.update({
      where: { id },
      data: { status: MemberStatus.ACTIVE, archivedAt: null },
    })
    return toDto(member)
  }

  /** Every non-archived member, for CSV export. */
  async exportAll(): Promise<MemberDto[]> {
    const rows = await this.prisma.db.member.findMany({
      where: { archivedAt: null },
      orderBy: { code: 'asc' },
    })
    return rows.map(toDto)
  }

  private consentColumns(consent: ConsentInput | undefined) {
    if (!consent?.granted) return {}
    return {
      consentAt: new Date(),
      consentVersion: consent.version || CONSENT_VERSION,
      consentRecordedBy: RequestContext.userId ?? null,
    }
  }

  private async assertCodeFree(code: string): Promise<void> {
    const clash = await this.prisma.db.member.findFirst({ where: { code }, select: { id: true } })
    if (clash) {
      throw new ConflictException({
        code: 'MEMBER_CODE_TAKEN',
        message: `The code "${code}" is already used by another member.`,
        details: { code: [`"${code}" is already in use`] },
      })
    }
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message: 'Member not found' })
}

function toDto(member: Member): MemberDto {
  return {
    id: member.id,
    code: member.code,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone,
    status: member.status,
    attributes: (member.attributes ?? {}) as Record<string, unknown>,
    consentAt: member.consentAt?.toISOString() ?? null,
    consentVersion: member.consentVersion,
    faceEnrolledAt: member.faceEnrolledAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    archivedAt: member.archivedAt?.toISOString() ?? null,
  }
}

export { ZodError }
