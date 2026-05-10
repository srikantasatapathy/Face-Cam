import type { SessionUser } from '@facecam/shared'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ApiError, api } from './api'

/**
 * The signed-in user, or null.
 *
 * Server-side calls carry no cookie jar of their own, so the incoming request's
 * cookies are forwarded explicitly. Never cached: a stale session would let a
 * signed-out or suspended user keep seeing a page they should not.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  try {
    return await api.get<SessionUser>('/auth/me', {
      cookie: cookieHeader,
      cache: 'no-store',
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

/** Requires a session, sending the visitor to `loginPath` when there is none. */
export async function requireSession(loginPath = '/login'): Promise<SessionUser> {
  const session = await getSession()
  if (!session) redirect(loginPath)
  return session
}
