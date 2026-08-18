import { tenantSlugFromHost } from '@facecam/shared'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Maps `<slug>.<ROOT_DOMAIN>` onto the `/t/[slug]` route tree.
 *
 * The tenant is identified by hostname, never by a path segment the user can
 * type, so a tenant admin cannot reach another tenant's portal by editing the
 * URL. `tenantSlugFromHost` returns null for the apex domain, for reserved
 * slugs and for multi-label subdomains, all of which fall through to the
 * platform routes.
 *
 * Local development: `acme.localhost:3100` resolves without any hosts-file
 * changes in current browsers.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3100'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const slug = tenantSlugFromHost(host, ROOT_DOMAIN)
  const { pathname, search } = request.nextUrl

  // Apex domain: platform marketing, auth and the super admin console.
  if (!slug) {
    // /t/* is an internal rewrite target and must not be reachable directly,
    // otherwise the hostname check above could be bypassed by path.
    if (pathname.startsWith('/t/')) {
      return new NextResponse(null, { status: 404 })
    }
    return NextResponse.next()
  }

  // Tenant portal: rewrite so the slug is available to the route tree while
  // the address bar keeps showing the tenant's own subdomain.
  const url = request.nextUrl.clone()
  url.pathname = `/t/${slug}${pathname}`
  url.search = search

  const response = NextResponse.rewrite(url)
  response.headers.set('x-tenant-slug', slug)
  return response
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
