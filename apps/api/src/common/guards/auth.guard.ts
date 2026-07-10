import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_COOKIE, type AccessTokenClaims } from '@facecam/shared'
import type { Request } from 'express'
import { TokenService } from '../../auth/token.service'
import { RequestContext } from '../context/request-context'
import { IS_PUBLIC } from '../decorators/public.decorator'

/**
 * Verifies the access token and establishes the tenant context.
 *
 * The tenant comes from the token's claims, never from the request. A user can
 * change the hostname or forge a header; they cannot change a signed claim. So
 * there is no mismatch to reconcile between "which portal is this" and "who is
 * this", and no way to act on another tenant by editing a request.
 *
 * `tokenVersion` is checked on refresh rather than here. Verifying it on every
 * request would add a database round-trip to each call; the access token's
 * short lifetime bounds how long a revoked session survives.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<Request>()
    const token = this.extractToken(request)

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue',
      })
    }

    const claims = await this.tokens.verifyAccess(token)
    if (!claims) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
      })
    }

    RequestContext.set({
      userId: claims.sub,
      userRole: claims.role,
      tenantId: claims.tenantId ?? undefined,
      tenantSlug: claims.tenantSlug ?? undefined,
    })

    ;(request as Request & { user: AccessTokenClaims }).user = claims
    return true
  }

  private extractToken(request: Request): string | null {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies
    const fromCookie = cookies?.[AUTH_COOKIE.ACCESS]
    if (fromCookie) return fromCookie

    // Bearer is accepted for kiosk devices and for API testing, which have no
    // cookie jar. Browsers always use the httpOnly cookie.
    const header = request.headers.authorization
    if (header?.startsWith('Bearer ')) return header.slice(7)

    return null
  }
}
