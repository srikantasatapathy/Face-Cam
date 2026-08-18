import { RESERVED_SLUGS } from './enums'

export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 40
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Derives a URL-safe subdomain slug from an organization name.
 * The result still has to be checked for uniqueness and against RESERVED_SLUGS.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

export type SlugValidationError =
  'too_short' | 'too_long' | 'invalid_characters' | 'reserved' | null

/** Returns null when the slug is acceptable, otherwise the reason it is not. */
export function validateSlug(slug: string): SlugValidationError {
  if (slug.length < SLUG_MIN_LENGTH) return 'too_short'
  if (slug.length > SLUG_MAX_LENGTH) return 'too_long'
  if (!SLUG_PATTERN.test(slug)) return 'invalid_characters'
  if (RESERVED_SLUGS.includes(slug)) return 'reserved'
  return null
}

/**
 * Extracts the tenant slug from a Host header.
 * Returns null for the apex domain, for reserved slugs, and for unknown hosts,
 * all of which must be treated as "no tenant" rather than as a lookup miss.
 */
export function tenantSlugFromHost(host: string, rootDomain: string): string | null {
  const cleanHost = host.toLowerCase().split(':')[0] ?? ''
  const cleanRoot = rootDomain.toLowerCase().split(':')[0] ?? ''
  if (!cleanHost || !cleanRoot) return null
  if (cleanHost === cleanRoot) return null
  if (!cleanHost.endsWith(`.${cleanRoot}`)) return null

  const slug = cleanHost.slice(0, -(cleanRoot.length + 1))
  // Only single-label subdomains are tenants. `a.b.root` is not a tenant host.
  if (slug.includes('.')) return null
  if (validateSlug(slug) !== null) return null
  return slug
}
