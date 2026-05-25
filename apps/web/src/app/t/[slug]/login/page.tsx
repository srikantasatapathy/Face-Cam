import { LoginForm } from '@/components/login-form'
import { getSession } from '@/lib/session'
import { getTenantBySlug } from '@/lib/tenant'
import { TenantStatus } from '@facecam/shared'
import { notFound, redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

/** Portal sign in, branded with the organization's own name and colours. */
export default async function TenantLoginPage({ params }: Props) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const session = await getSession()
  // Only skip the form for a session belonging to THIS portal. A session for a
  // different organization must not silently pass as signed in here.
  if (session?.tenantSlug === slug) redirect('/')

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="" className="mx-auto mb-3 h-12 w-auto" />
          ) : null}
          <h1 className="text-2xl font-semibold text-content">{tenant.name}</h1>
          <p className="mt-1 text-sm text-content-muted">Attendance portal</p>
        </div>

        {tenant.status === TenantStatus.SUSPENDED && (
          <div className="mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            This account is suspended. You can still sign in to view and export your records.
          </div>
        )}

        <div className="rounded-card border border-line bg-surface p-6">
          <LoginForm tenantSlug={slug} />
        </div>
      </div>
    </main>
  )
}
