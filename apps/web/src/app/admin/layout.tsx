import Link from 'next/link'

/**
 * Super admin console shell. Lives on the apex domain only, never on a tenant
 * subdomain, so the platform console is not reachable from a tenant's origin.
 *
 * Auth is added in Phase 1; this is the layout shell.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-line bg-surface p-5">
        <p className="text-sm font-semibold text-content">Face-Cam</p>
        <p className="mt-0.5 text-xs text-content-muted">Platform console</p>

        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link href="/admin" className="rounded-control px-3 py-2 hover:bg-surface-sunken">
            Overview
          </Link>
          <Link
            href="/admin/tenants"
            className="rounded-control px-3 py-2 text-content-muted hover:bg-surface-sunken"
          >
            Organizations
          </Link>
          <Link
            href="/admin/billing"
            className="rounded-control px-3 py-2 text-content-muted hover:bg-surface-sunken"
          >
            Billing
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
