import { getSession } from '@/lib/session'
import { getTenantBySlug, type TenantProfile } from '@/lib/tenant'
import type { FieldDefinitionDto, SessionUser } from '@facecam/shared'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { api } from './api'

export interface PortalContext {
  tenant: TenantProfile
  session: SessionUser
  cookie: string
}

/**
 * Resolves everything a portal page needs, and refuses anything else.
 *
 * A session belonging to a different organization is treated as no session at
 * all. Without that check, an admin of one portal holding a valid cookie would
 * render another organization's page shell before any API call failed.
 */
export async function requirePortal(slug: string): Promise<PortalContext> {
  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const session = await getSession()
  if (!session || session.tenantSlug !== slug) redirect('/login')

  return { tenant, session, cookie: (await cookies()).toString() }
}

/** This organization's active member fields, in display order. */
export function getFieldDefinitions(cookie: string): Promise<FieldDefinitionDto[]> {
  return api.get<FieldDefinitionDto[]>('/member-fields', { cookie, cache: 'no-store' })
}
