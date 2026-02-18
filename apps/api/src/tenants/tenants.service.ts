import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  TenantStatus,
  UserRole,
  slugify,
  validateSlug,
  type CreateTenantInput,
  type ListTenantsQuery,
  type PublicTenantProfile,
  type SuspendTenantInput,
  type TenantDetail,
  type TenantSummary,
  type UpdateTenantInput,
} from '@facecam/shared'
import type { Paginated } from '@facecam/shared'
import type { Prisma, Tenant, TenantBranding } from '@prisma/client'
import { AuthService } from '../auth/auth.service'
import { RequestContext } from '../common/context/request-context'
import { FieldDefinitionsService } from '../members/field-definitions.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the organization, its branding and settings rows, and its first
   * administrator, all in one transaction.
   *
   * A tenant that exists but has no administrator cannot be signed into and has
   * to be repaired by hand, so partial success is not an acceptable outcome
   * here.
   */
  async create(input: CreateTenantInput): Promise<TenantDetail> {
    const slug = await this.resolveSlug(input.slug ?? slugify(input.name))
    const passwordHash = await AuthService.hashPassword(input.adminPassword)

    const tenant = await RequestContext.asPlatform(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: {
            name: input.name,
            slug,
            template: input.template,
            timezone: input.timezone,
            billingEmail: input.billingEmail ?? null,
            plan: input.plan ?? null,
            validUntil: input.validUntil ? new Date(input.validUntil) : null,
            status: TenantStatus.TRIAL,
            branding: { create: {} },
            settings: { create: {} },
          },
          include: { branding: true },
        })

        await tx.user.create({
          data: {
            tenantId: created.id,
            email: input.adminEmail,
            passwordHash,
            fullName: input.adminFullName,
            role: UserRole.ORG_ADMIN,
          },
        })

        // Seed the member fields for this vertical. Inside the same transaction
        // because a tenant whose field set half-loaded would render a broken
        // enrolment form with no obvious cause.
        await tx.memberFieldDefinition.createMany({
          data: FieldDefinitionsService.seedData(created.id, input.template),
        })

        return created
      }),
    )

    this.logger.log(`Created tenant ${tenant.slug} (${tenant.id})`)

    // TODO(Phase 3): provision the tenant's CompreFace face collection here.
    return this.toDetail(tenant, tenant.branding, 1)
  }

  async list(query: ListTenantsQuery): Promise<Paginated<TenantSummary>> {
    const where: Prisma.TenantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, rows] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { users: true } } },
      }),
    ])

    return {
      items: rows.map((row) => this.toSummary(row, row._count.users)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async findById(id: string): Promise<TenantDetail> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { branding: true, _count: { select: { users: true } } },
    })

    if (!tenant)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' })

    return this.toDetail(tenant, tenant.branding, tenant._count.users)
  }

  async update(id: string, input: UpdateTenantInput): Promise<TenantDetail> {
    await this.assertExists(id)

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
        ...(input.plan !== undefined ? { plan: input.plan } : {}),
        ...(input.validUntil !== undefined
          ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
          : {}),
      },
      include: { branding: true, _count: { select: { users: true } } },
    })

    return this.toDetail(tenant, tenant.branding, tenant._count.users)
  }

  /**
   * Suspends service without touching data.
   *
   * Attendance capture and enrolment stop; dashboards, reports and exports keep
   * working. See TenantStatusGuard for where that is enforced, and
   * PROJECT_DESCRIPTION.md section 10 for why suspension is not a lockout.
   */
  async suspend(id: string, input: SuspendTenantInput): Promise<TenantDetail> {
    await this.assertExists(id)

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedReason: input.reason,
      },
      include: { branding: true, _count: { select: { users: true } } },
    })

    this.logger.warn(`Suspended tenant ${tenant.slug}: ${input.reason}`)
    return this.toDetail(tenant, tenant.branding, tenant._count.users)
  }

  async reactivate(id: string): Promise<TenantDetail> {
    await this.assertExists(id)

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.ACTIVE,
        suspendedAt: null,
        suspendedReason: null,
      },
      include: { branding: true, _count: { select: { users: true } } },
    })

    this.logger.log(`Reactivated tenant ${tenant.slug}`)
    return this.toDetail(tenant, tenant.branding, tenant._count.users)
  }

  /**
   * The unauthenticated profile used to brand a portal's login screen.
   *
   * Returns null rather than throwing for an unknown slug, so the caller can
   * render a 404 page. Cancelled tenants are treated as non-existent: their
   * portal should stop resolving entirely.
   */
  async publicProfile(slug: string): Promise<PublicTenantProfile | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { branding: true },
    })

    if (!tenant || tenant.status === TenantStatus.CANCELLED) return null

    const branding = tenant.branding
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      template: tenant.template,
      status: tenant.status,
      logoUrl: branding?.logoUrl ?? null,
      branding: {
        primaryColor: branding?.primaryColor ?? '#2563eb',
        secondaryColor: branding?.secondaryColor ?? '#1e40af',
        accentColor: branding?.accentColor ?? '#f59e0b',
        fontFamily: branding?.fontFamily ?? null,
      },
    }
  }

  /**
   * Ensures the slug is legal and free, appending a numeric suffix when the
   * derived one is taken. Two schools called "St Xavier" must both be able to
   * register without a human resolving the clash.
   */
  private async resolveSlug(candidate: string): Promise<string> {
    const base = slugify(candidate)

    const invalid = validateSlug(base)
    if (invalid) {
      throw new ConflictException({
        code: 'INVALID_SLUG',
        message:
          invalid === 'reserved'
            ? 'That portal address is reserved. Choose another.'
            : 'That portal address is not valid.',
      })
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
      const taken = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
      if (!taken) return slug
    }

    throw new ConflictException({
      code: 'SLUG_UNAVAILABLE',
      message: 'Could not derive a free portal address. Provide one explicitly.',
    })
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true } })
    if (!exists) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Organization not found' })
    }
  }

  private toSummary(tenant: Tenant, userCount: number): TenantSummary {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      template: tenant.template,
      status: tenant.status,
      plan: tenant.plan,
      validUntil: tenant.validUntil?.toISOString() ?? null,
      createdAt: tenant.createdAt.toISOString(),
      userCount,
    }
  }

  private toDetail(
    tenant: Tenant,
    branding: TenantBranding | null,
    userCount: number,
  ): TenantDetail {
    return {
      ...this.toSummary(tenant, userCount),
      timezone: tenant.timezone,
      billingEmail: tenant.billingEmail,
      suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
      suspendedReason: tenant.suspendedReason,
      faceEngineReady: Boolean(tenant.comprefaceApiKeyEnc),
      branding: {
        logoUrl: branding?.logoUrl ?? null,
        primaryColor: branding?.primaryColor ?? '#2563eb',
        secondaryColor: branding?.secondaryColor ?? '#1e40af',
        accentColor: branding?.accentColor ?? '#f59e0b',
        fontFamily: branding?.fontFamily ?? null,
        customBrandingEnabled: branding?.customBrandingEnabled ?? false,
      },
    }
  }
}
