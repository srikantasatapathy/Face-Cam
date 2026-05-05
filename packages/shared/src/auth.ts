import { z } from 'zod'
import type { UserRole } from './enums'

/**
 * Login is always scoped to one portal.
 *
 * `tenantSlug` is sent when the user is on a tenant subdomain and omitted on
 * the apex domain, where only super admins sign in. Scoping the lookup this way
 * means an org admin's credentials cannot be used against a different
 * organization's portal, even when the same person administers both.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  tenantSlug: z.string().trim().toLowerCase().optional(),
})

export type LoginInput = z.infer<typeof loginSchema>

/** The authenticated user as the client sees them. Never includes a token. */
export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  tenantId: string | null
  tenantSlug: string | null
}

export interface LoginResponse {
  user: SessionUser
  /** Where the client should land after signing in, based on role. */
  redirectTo: string
}

/** Claims carried by the access token. Kept small: it travels on every request. */
export interface AccessTokenClaims {
  sub: string
  role: UserRole
  tenantId: string | null
  tenantSlug: string | null
  /** Bumped on logout-everywhere and password change to invalidate old tokens. */
  ver: number
}

export const AUTH_COOKIE = {
  ACCESS: 'fc_at',
  REFRESH: 'fc_rt',
} as const

/** Failed logins allowed before the account locks. */
export const MAX_FAILED_LOGINS = 5

/** How long an account stays locked after exceeding the limit. */
export const LOCKOUT_MINUTES = 15
