import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { Observable, tap } from 'rxjs'
import { PrismaService } from '../../prisma/prisma.service'
import { RequestContext } from '../context/request-context'
import { AUDIT_SPEC, type AuditSpec } from '../decorators/audited.decorator'

/**
 * Writes an audit row for routes marked @Audited, after they succeed.
 *
 * Failed attempts are not recorded here: the exception filter already logs
 * them, and an audit trail of things that did not happen makes the real record
 * harder to read.
 *
 * Writing the row must never break the request that triggered it, so failures
 * are logged and swallowed. An audit system that can take down the feature it
 * observes gets disabled.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.getAllAndOverride<AuditSpec>(AUDIT_SPEC, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!spec || context.getType() !== 'http') return next.handle()

    const request = context.switchToHttp().getRequest<Request>()

    return next.handle().pipe(
      tap({
        next: (result) => void this.record(spec, request, result),
      }),
    )
  }

  private async record(spec: AuditSpec, request: Request, result: unknown): Promise<void> {
    try {
      const entityId =
        result && typeof result === 'object' && 'id' in result
          ? String((result as { id: unknown }).id)
          : normaliseHeader(request.params?.id)

      await RequestContext.asPlatform(() =>
        this.prisma.auditLog.create({
          data: {
            tenantId: RequestContext.tenantId ?? null,
            actorUserId: RequestContext.userId ?? null,
            action: spec.action,
            entity: spec.entity,
            entityId,
            // Request bodies can carry passwords and personal data, so only the
            // route and method are kept, never the payload.
            metadata: { method: request.method, path: request.route?.path ?? request.path },
            ipAddress: request.ip ?? null,
            userAgent: normaliseHeader(request.headers['user-agent']),
            correlationId: RequestContext.correlationId,
          },
        }),
      )
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${spec.action}`,
        error instanceof Error ? error.stack : String(error),
      )
    }
  }
}

/**
 * Headers and route params can both surface as arrays when repeated. Keep the
 * first value so the audit row always stores a plain string.
 */
function normaliseHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
