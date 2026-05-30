import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  UserRole,
  createTenantSchema,
  listTenantsSchema,
  suspendTenantSchema,
  updateTenantSchema,
  type CreateTenantInput,
  type ListTenantsQuery,
  type Paginated,
  type PublicTenantProfile,
  type SuspendTenantInput,
  type TenantDetail,
  type TenantSummary,
  type UpdateTenantInput,
} from '@facecam/shared'
import { Audited } from '../common/decorators/audited.decorator'
import { Public } from '../common/decorators/public.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { ApiZodBody, ApiZodQuery } from '../common/swagger/zod-openapi'
import { TenantsService } from './tenants.service'

/**
 * Platform console. Every route here is super-admin only, declared once at the
 * class level so a new endpoint cannot be added without the restriction.
 */
@ApiTags('admin/tenants')
@Controller('admin/tenants')
@Roles(UserRole.SUPER_ADMIN)
@ApiCookieAuth('fc_at')
@ApiResponse({ status: 401, description: 'Not signed in' })
@ApiResponse({ status: 403, description: 'Not a super admin' })
export class AdminTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @Audited('tenant.create', 'Tenant')
  @ApiOperation({
    summary: 'Register an organization and its first administrator',
    description:
      'Creates the tenant, its branding and settings rows, and its first admin in one ' +
      'transaction. The portal address is derived from the name when `slug` is omitted, and ' +
      'is frozen afterwards.',
  })
  @ApiZodBody(createTenantSchema)
  @ApiResponse({ status: 201, description: 'Organization registered' })
  @ApiResponse({ status: 409, description: 'Portal address reserved or unavailable' })
  create(
    @Body(new ZodValidationPipe(createTenantSchema)) body: CreateTenantInput,
  ): Promise<TenantDetail> {
    return this.tenants.create(body)
  }

  @Get()
  @ApiOperation({ summary: 'List organizations' })
  @ApiZodQuery(listTenantsSchema)
  list(
    @Query(new ZodValidationPipe(listTenantsSchema)) query: ListTenantsQuery,
  ): Promise<Paginated<TenantSummary>> {
    return this.tenants.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'One organization' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'No such organization' })
  findOne(@Param('id') id: string): Promise<TenantDetail> {
    return this.tenants.findById(id)
  }

  @Patch(':id')
  @Audited('tenant.update', 'Tenant')
  @ApiOperation({
    summary: 'Update plan, billing details or timezone',
    description: 'Slug and template are absent by design: both are frozen after creation.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiZodBody(updateTenantSchema)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) body: UpdateTenantInput,
  ): Promise<TenantDetail> {
    return this.tenants.update(id, body)
  }

  @Post(':id/suspend')
  @Audited('tenant.suspend', 'Tenant')
  @ApiOperation({
    summary: 'Pause capture and enrolment, leaving data readable',
    description:
      'Suspension is not a lockout. Attendance capture and enrolment stop; dashboards, ' +
      'reports and exports keep working and no data is deleted.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiZodBody(suspendTenantSchema)
  suspend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suspendTenantSchema)) body: SuspendTenantInput,
  ): Promise<TenantDetail> {
    return this.tenants.suspend(id, body)
  }

  @Post(':id/provision-face-engine')
  @Audited('tenant.provisionFaceEngine', 'Tenant')
  @ApiOperation({
    summary: 'Create this organization face collection, or confirm it exists',
    description:
      'Runs automatically at registration. Exposed as a retry because the first attempt can ' +
      'fail for reasons unrelated to the tenant, such as CompreFace restarting. Safe to re-run.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async provisionFaceEngine(@Param('id') id: string): Promise<TenantDetail> {
    await this.tenants.provisionFaceEngine(id)
    return this.tenants.findById(id)
  }

  @Post(':id/reactivate')
  @Audited('tenant.reactivate', 'Tenant')
  @ApiOperation({ summary: 'Restore full service' })
  @ApiParam({ name: 'id', format: 'uuid' })
  reactivate(@Param('id') id: string): Promise<TenantDetail> {
    return this.tenants.reactivate(id)
  }
}

/**
 * Unauthenticated. Serves only what the login screen needs to render itself in
 * the right name and colours, which the visitor is about to see anyway.
 */
@ApiTags('public')
@Controller('public/tenants')
export class PublicTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'Public profile of a portal, for branding the login page',
    description:
      'Unauthenticated. Returns only the name, logo and colours needed to render the login ' +
      'screen, which the visitor is about to see anyway.',
  })
  @ApiParam({ name: 'slug', example: 'st-xavier-high-school' })
  @ApiResponse({ status: 404, description: 'No such portal' })
  async bySlug(@Param('slug') slug: string): Promise<PublicTenantProfile> {
    const profile = await this.tenants.publicProfile(slug.toLowerCase())
    if (!profile) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Portal not found' })
    }
    return profile
  }
}
