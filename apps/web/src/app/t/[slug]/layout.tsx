import { SignOutButton } from '@/components/sign-out-button'
import { getSession } from '@/lib/session'
import { getTenantBySlug } from '@/lib/tenant'
import { brandingToStyle } from '@/lib/theme'
import { TEMPLATE_MEMBER_LABEL, TenantStatus } from '@facecam/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface TenantLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TenantLayoutProps): Promise<Metadata> {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  return { title: tenant ? `${tenant.name} · Attendance` : 'Not found' }
}

/**
 * Tenant portal shell.
 *
 * Branding is resolved on the server and written onto the wrapper as CSS
 * custom properties, so a white-labelled portal never paints in the platform's
 * colours first. `data-template` selects the vertical's look.
 */
export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const session = await getSession()
  const signedIn = session?.tenantSlug === slug
  const labels = TEMPLATE_MEMBER_LABEL[tenant.template] ?? { singular: 'Member', plural: 'Members' }

  return (
    <div
      data-template={tenant.template}
      data-tenant={tenant.slug}
      style={brandingToStyle(tenant.branding)}
      className="min-h-screen bg-surface-sunken"
    >
      {tenant.status === TenantStatus.SUSPENDED && (
        <div className="bg-danger px-4 py-2 text-center text-sm font-medium text-content-inverted">
          This account is suspended. Attendance capture is paused. Your records are safe and remain
          available to view and export.
        </div>
      )}
      {tenant.status === TenantStatus.PAST_DUE && (
        <div className="bg-warning px-4 py-2 text-center text-sm font-medium text-content-inverted">
          Payment is overdue. Service continues for now, but will pause if it stays unpaid.
        </div>
      )}

      {signedIn && (
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-semibold text-content">
                {tenant.name}
              </Link>
              <nav className="flex gap-1 text-sm">
                <Link href="/" className="rounded-control px-3 py-1.5 hover:bg-surface-sunken">
                  Dashboard
                </Link>
                <Link
                  href="/members"
                  className="rounded-control px-3 py-1.5 text-content-muted hover:bg-surface-sunken"
                >
                  {labels.plural}
                </Link>
                <Link
                  href="/settings/fields"
                  className="rounded-control px-3 py-1.5 text-content-muted hover:bg-surface-sunken"
                >
                  Fields
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-sm leading-tight text-content">{session!.fullName}</p>
                <p className="text-xs leading-tight text-content-muted">{session!.email}</p>
              </div>
              <SignOutButton redirectTo="/login" />
            </div>
          </div>
        </header>
      )}

      {children}
    </div>
  )
}
