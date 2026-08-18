import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'
import { RequestContext } from '../context/request-context'

/** Paths that would flood the log with no diagnostic value. */
const SKIP_PATHS = new Set(['/health', '/health/live', '/health/ready', '/favicon.ico'])

/**
 * One log line per request, tagged with the correlation ID and the resolved
 * tenant. Request and response bodies are deliberately never logged, because
 * they can contain face images and personal data.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()

    const http = context.switchToHttp()
    const request = http.getRequest<Request>()

    if (SKIP_PATHS.has(request.path)) return next.handle()

    const startedAt = Date.now()

    return next.handle().pipe(
      tap({
        next: () => this.log(request, http.getResponse<Response>().statusCode, startedAt),
        // Errors are logged by AllExceptionsFilter, which knows the final status.
        error: () => undefined,
      }),
    )
  }

  private log(request: Request, statusCode: number, startedAt: number): void {
    const store = RequestContext.get()
    const tenant = store?.tenantSlug ? ` tenant=${store.tenantSlug}` : ''
    const duration = Date.now() - startedAt

    this.logger.log(
      `[${store?.correlationId ?? '-'}]${tenant} ${request.method} ${request.originalUrl} ` +
        `${statusCode} ${duration}ms`,
    )
  }
}
