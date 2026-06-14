import { SignOutButton } from '@/components/sign-out-button'
import { requireSession } from '@/lib/session'
import { UserRole } from '@facecam/shared'
import Link from 'next/link'
import { redirect } from 'next/navigation'

/**
 * Super admin console shell. Lives on the apex domain only, never on a tenant
 * subdomain, so the platform console is not reachable from a tenant's origin.
 *
 * The role check is here rather than on each page: a new page under /admin is
 * protected the moment it is created.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession('/login')
  if (session.role !== UserRole.SUPER_ADMIN) redirect('/')

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-line bg-surface p-5">
        <div>
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
          </nav>
        </div>

        <div className="border-t border-line pt-4">
          <p className="truncate text-sm text-content">{session.fullName}</p>
          <p className="mb-2 truncate text-xs text-content-muted">{session.email}</p>
          <SignOutButton redirectTo="/login" />
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
