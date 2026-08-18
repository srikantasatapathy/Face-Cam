import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { ApiErrorBody } from '@facecam/shared'
import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import { RequestContext } from '../context/request-context'

/**
 * Turns every thrown error into the single response shape declared in
 * `ApiErrorBody`, so the web client only ever parses one error format.
 *
 * Internal error messages are never leaked in production: a 500 returns a
 * generic message and the detail goes to the log under the correlation ID.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const { status, code, message, details } = this.normalize(exception)
    const correlationId = RequestContext.correlationId

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(`[${correlationId}] ${request.method} ${request.url} -> ${status} ${code}`)
    }

    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details ? { details } : {}),
    }

    response.status(status).json(body)
  }

  private normalize(exception: unknown): {
    status: number
    code: string
    message: string
    details?: Record<string, string[]>
  } {
    if (exception instanceof ZodError) {
      const details: Record<string, string[]> = {}
      for (const issue of exception.issues) {
        const path = issue.path.join('.') || '_'
        details[path] = [...(details[path] ?? []), issue.message]
      }
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'VALIDATION_FAILED',
        message: 'The submitted data is not valid',
        details,
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()

      if (typeof payload === 'string') {
        return { status, code: this.codeForStatus(status), message: payload }
      }

      const record = payload as Record<string, unknown>
      return {
        status,
        code: typeof record.code === 'string' ? record.code : this.codeForStatus(status),
        message:
          typeof record.message === 'string'
            ? record.message
            : Array.isArray(record.message)
              ? record.message.join(', ')
              : exception.message,
        details: record.details as Record<string, string[]> | undefined,
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    }
  }

  private codeForStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_FAILED',
      429: 'RATE_LIMITED',
      503: 'SERVICE_UNAVAILABLE',
    }
    return map[status] ?? 'ERROR'
  }
}
