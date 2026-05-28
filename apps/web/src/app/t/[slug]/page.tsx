import { SignOutButton } from '@/components/sign-out-button'
import { getSession } from '@/lib/session'
import { getTenantBySlug } from '@/lib/tenant'
import { TEMPLATE_MEMBER_LABEL } from '@facecam/shared'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

/** Tenant admin dashboard shell. Populated in Phase 6. */
export default async function TenantDashboardPage({ params }: Props) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const session = await getSession()
  // A session belonging to a different organization is not a session here.
  // Without this check, an admin of one portal would land on another's
  // dashboard shell simply because a cookie happened to be present.
  if (!session || session.tenantSlug !== slug) redirect('/login')

  const labels = TEMPLATE_MEMBER_LABEL[tenant.template] ?? {
    singular: 'Member',
    plural: 'Members',
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-content">{tenant.name}</h1>
          <p className="mt-1 text-content-muted">
            {labels.plural} attendance dashboard. Metrics arrive in Phase 6.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-content">{session.fullName}</p>
          <p className="mb-1 text-xs text-content-muted">{session.email}</p>
          <SignOutButton redirectTo="/login" />
        </div>
      </div>
    </main>
  )
}
