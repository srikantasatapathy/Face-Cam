import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { RequestContext } from '../context/request-context'

export const CORRELATION_ID_HEADER = 'x-correlation-id'

/**
 * Opens the AsyncLocalStorage scope for the request and stamps a correlation ID
 * on it. Everything downstream (logging, error responses, the tenant middleware)
 * relies on this running first.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[CORRELATION_ID_HEADER]
    const correlationId =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 100
        ? incoming
        : randomUUID()

    res.setHeader(CORRELATION_ID_HEADER, correlationId)

    RequestContext.run({ correlationId }, () => next())
  }
}
