import { cache } from 'react'
import { ApiError, api } from './api'
import type { TenantBranding } from './theme'

/** Public tenant profile used to theme and label the portal before login. */
export interface TenantProfile {
  id: string
  slug: string
  name: string
  template: 'education' | 'corporate'
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  logoUrl: string | null
  branding: TenantBranding
}

/**
 * Resolves a tenant by subdomain slug.
 *
 * Returns null when the slug does not exist, which the layout turns into a 404.
 * Nothing here requires authentication: it is only the name, logo and colours
 * needed to render the login screen correctly branded.
 *
 * `cache` dedupes the call across the layout and any page in the same render.
 */
export const getTenantBySlug = cache(async (slug: string): Promise<TenantProfile | null> => {
  try {
    return await api.get<TenantProfile>(`/public/tenants/${encodeURIComponent(slug)}`, {
      // Not cached: a suspension or a branding change must show up immediately,
      // and this is a single indexed lookup by slug.
      cache: 'no-store',
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
})
