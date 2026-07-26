import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  UserStatus,
  type AccessTokenClaims,
  type LoginInput,
  type SessionUser,
} from '@facecam/shared'
import type { Tenant, User } from '@prisma/client'
import * as argon2 from 'argon2'
import { RequestContext } from '../common/context/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { TokenService } from './token.service'

/**
 * A hash of a value nobody knows, compared against when the email does not
 * exist. Without it, a missing account returns noticeably faster than a wrong
 * password, which turns the login form into an account-enumeration oracle.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$Vh1Z3jU8lNSt9GFHVBpJqfKqRDxLHXBpTIOJQwuTLOo'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id })
  }

  /**
   * Authenticates against exactly one portal.
   *
   * With a `tenantSlug` the lookup is confined to that organization's users;
   * without one it is confined to super admins. The same address administering
   * two organizations therefore yields two separate accounts, and credentials
   * for one portal are useless against another.
   */
  async login(input: LoginInput): Promise<{
    user: SessionUser
    accessToken: string
    refreshToken: string
  }> {
    const tenant = input.tenantSlug ? await this.findTenant(input.tenantSlug) : null

    if (input.tenantSlug && !tenant) {
      // The portal does not exist. Same message as a bad password, so the
      // response cannot be used to discover which organizations are registered.
      await argon2.verify(DUMMY_HASH, input.password).catch(() => false)
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: INVALID })
    }

    // Reading `users` before authentication has to bypass tenant scoping,
    // because the tenant context is only established once we know who this is.
    // The query is still confined to a single tenant by the explicit filter.
    const user = await RequestContext.asPlatform(() =>
      this.prisma.user.findFirst({
        where: { email: input.email, tenantId: tenant?.id ?? null },
      }),
    )

    if (!user) {
      await argon2.verify(DUMMY_HASH, input.password).catch(() => false)
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: INVALID })
    }

    this.assertUsable(user)

    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false)
    if (!valid) {
      await this.recordFailure(user)
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: INVALID })
    }

    await RequestContext.asPlatform(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
    )

    return this.issueSession(user, tenant)
  }

  /**
   * Exchanges a refresh token for a fresh pair.
   *
   * The token's `ver` is compared against the user's current `tokenVersion`, so
   * bumping that column invalidates every outstanding session at once. That is
   * what makes "sign out everywhere" and a password change actually effective.
   */
  async refresh(refreshToken: string): Promise<{
    user: SessionUser
    accessToken: string
    refreshToken: string
  }> {
    const claims = await this.tokens.verifyRefresh(refreshToken)
    if (!claims) throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: EXPIRED })

    const user = await RequestContext.asPlatform(() =>
      this.prisma.user.findUnique({ where: { id: claims.sub } }),
    )

    if (!user || user.tokenVersion !== claims.ver) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH', message: EXPIRED })
    }

    this.assertUsable(user)

    const tenant = user.tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: user.tenantId } })
      : null

    return this.issueSession(user, tenant)
  }

  /** Invalidates every session for the user by bumping their token version. */
  async logoutEverywhere(userId: string): Promise<void> {
    await RequestContext.asPlatform(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    )
  }

  async currentUser(userId: string): Promise<SessionUser | null> {
    const user = await RequestContext.asPlatform(() =>
      this.prisma.user.findUnique({ where: { id: userId } }),
    )
    if (!user) return null

    const tenant = user.tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: user.tenantId } })
      : null

    return this.toSessionUser(user, tenant)
  }

  private async issueSession(user: User, tenant: Tenant | null) {
    const claims: AccessTokenClaims = {
      sub: user.id,
      role: user.role as AccessTokenClaims['role'],
      tenantId: user.tenantId,
      tenantSlug: tenant?.slug ?? null,
      ver: user.tokenVersion,
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess(claims),
      this.tokens.signRefresh({ sub: user.id, ver: user.tokenVersion }),
    ])

    return { user: this.toSessionUser(user, tenant), accessToken, refreshToken }
  }

  private toSessionUser(user: User, tenant: Tenant | null): SessionUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as SessionUser['role'],
      tenantId: user.tenantId,
      tenantSlug: tenant?.slug ?? null,
    }
  }

  private findTenant(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } })
  }

  private assertUsable(user: User): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: `Too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`,
      })
    }

    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been disabled. Contact your administrator.',
      })
    }
  }

  private async recordFailure(user: User): Promise<void> {
    const failures = user.failedLoginCount + 1
    const locked = failures >= MAX_FAILED_LOGINS

    await RequestContext.asPlatform(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: locked ? 0 : failures,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        },
      }),
    )

    if (locked) {
      this.logger.warn(`Account locked after ${MAX_FAILED_LOGINS} failed logins: ${user.id}`)
    }
  }
}

const INVALID = 'Email or password is incorrect'
const EXPIRED = 'Your session has expired. Please sign in again.'
