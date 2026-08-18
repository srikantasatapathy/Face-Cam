import { getTenantBySlug } from '@/lib/tenant'
import { brandingToStyle } from '@/lib/theme'
import type { Metadata } from 'next'
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
 * Branding is resolved on the server and written straight onto the wrapper as
 * CSS custom properties, so a white-labelled portal never paints in the
 * platform's colours first. `data-template` selects the vertical's look.
 */
export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)

  if (!tenant) notFound()

  return (
    <div
      data-template={tenant.template}
      data-tenant={tenant.slug}
      style={brandingToStyle(tenant.branding)}
      className="min-h-screen bg-surface-sunken"
    >
      {tenant.status === 'suspended' && (
        <div className="bg-danger px-4 py-2 text-center text-sm font-medium text-content-inverted">
          This account is suspended. Attendance capture is paused. Your records are safe and remain
          available to view and export.
        </div>
      )}
      {tenant.status === 'past_due' && (
        <div className="bg-warning px-4 py-2 text-center text-sm font-medium text-content-inverted">
          Payment is overdue. Service continues for now, but will pause if it stays unpaid.
        </div>
      )}
      {children}
    </div>
  )
}
