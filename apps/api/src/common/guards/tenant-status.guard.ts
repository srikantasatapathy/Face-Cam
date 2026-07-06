import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TenantStatus, UserRole, WRITABLE_TENANT_STATUSES } from '@facecam/shared'
import type { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { RequestContext } from '../context/request-context'
import { IS_PUBLIC } from '../decorators/public.decorator'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Enforces the suspension policy from PROJECT_DESCRIPTION.md section 10.
 *
 * Suspension is deliberately not a lockout. A suspended organization keeps full
 * read access to its own dashboards, reports and exports, and only loses the
 * ability to write: no attendance capture, no new enrolments. Cutting a school
 * off from its own attendance history over an unpaid invoice produces
 * chargebacks and reputational damage out of all proportion to the debt.
 *
 * Super admins are exempt, since suspending and reactivating are themselves
 * writes against a suspended tenant.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request>()
    if (READ_METHODS.has(request.method)) return true

    if (RequestContext.userRole === UserRole.SUPER_ADMIN) return true

    const tenantId = RequestContext.tenantId
    if (!tenantId) return true

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    })

    if (!tenant) return true

    if (!WRITABLE_TENANT_STATUSES.includes(tenant.status as TenantStatus)) {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message:
          'This account is suspended. Your records remain available to view and export. ' +
          'Contact support to restore full service.',
      })
    }

    return true
  }
}
