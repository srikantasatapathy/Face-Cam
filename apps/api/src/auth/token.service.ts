import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { AccessTokenClaims } from '@facecam/shared'
import { AppConfigService } from '../config/app-config.service'

export interface RefreshTokenClaims {
  sub: string
  ver: number
}

/**
 * Issues and verifies the two tokens.
 *
 * Access and refresh are signed with different secrets so a leaked access token
 * cannot be replayed as a refresh token, and vice versa.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async signAccess(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.auth.accessSecret,
      expiresIn: Math.floor(this.ttlMs(this.config.auth.accessTtl) / 1000),
    })
  }

  async signRefresh(claims: RefreshTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.auth.refreshSecret,
      expiresIn: Math.floor(this.ttlMs(this.config.auth.refreshTtl) / 1000),
    })
  }

  /** Returns null on any failure. Callers treat that as "not authenticated". */
  async verifyAccess(token: string): Promise<AccessTokenClaims | null> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.auth.accessSecret,
      })
    } catch {
      return null
    }
  }

  async verifyRefresh(token: string): Promise<RefreshTokenClaims | null> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenClaims>(token, {
        secret: this.config.auth.refreshSecret,
      })
    } catch {
      return null
    }
  }

  /** Milliseconds, for cookie maxAge. Accepts the `15m` / `7d` duration form. */
  ttlMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration)
    if (!match) throw new Error(`Unsupported duration: ${duration}`)

    const amount = Number(match[1])
    const unit = match[2] as 's' | 'm' | 'h' | 'd'
    const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
    return amount * multiplier
  }
}
