import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
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
import { TenantsService } from './tenants.service'

/**
 * Platform console. Every route here is super-admin only, declared once at the
 * class level so a new endpoint cannot be added without the restriction.
 */
@ApiTags('admin/tenants')
@Controller('admin/tenants')
@Roles(UserRole.SUPER_ADMIN)
export class AdminTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @Audited('tenant.create', 'Tenant')
  @ApiOperation({ summary: 'Register an organization and its first administrator' })
  create(
    @Body(new ZodValidationPipe(createTenantSchema)) body: CreateTenantInput,
  ): Promise<TenantDetail> {
    return this.tenants.create(body)
  }

  @Get()
  @ApiOperation({ summary: 'List organizations' })
  list(
    @Query(new ZodValidationPipe(listTenantsSchema)) query: ListTenantsQuery,
  ): Promise<Paginated<TenantSummary>> {
    return this.tenants.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'One organization' })
  findOne(@Param('id') id: string): Promise<TenantDetail> {
    return this.tenants.findById(id)
  }

  @Patch(':id')
  @Audited('tenant.update', 'Tenant')
  @ApiOperation({ summary: 'Update plan, billing details or timezone' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) body: UpdateTenantInput,
  ): Promise<TenantDetail> {
    return this.tenants.update(id, body)
  }

  @Post(':id/suspend')
  @Audited('tenant.suspend', 'Tenant')
  @ApiOperation({ summary: 'Pause capture and enrolment, leaving data readable' })
  suspend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suspendTenantSchema)) body: SuspendTenantInput,
  ): Promise<TenantDetail> {
    return this.tenants.suspend(id, body)
  }

  @Post(':id/reactivate')
  @Audited('tenant.reactivate', 'Tenant')
  @ApiOperation({ summary: 'Restore full service' })
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
  @ApiOperation({ summary: 'Public profile of a portal, for branding the login page' })
  async bySlug(@Param('slug') slug: string): Promise<PublicTenantProfile> {
    const profile = await this.tenants.publicProfile(slug.toLowerCase())
    if (!profile) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Portal not found' })
    }
    return profile
  }
}
