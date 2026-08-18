import { getTenantBySlug } from '@/lib/tenant'
import { TEMPLATE_MEMBER_LABEL } from '@facecam/shared'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

/** Tenant admin dashboard shell. Populated in Phase 6. */
export default async function TenantDashboardPage({ params }: Props) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  const labels = TEMPLATE_MEMBER_LABEL[tenant.template] ?? {
    singular: 'Member',
    plural: 'Members',
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold text-content">{tenant.name}</h1>
      <p className="mt-1 text-content-muted">
        {labels.plural} attendance dashboard. Metrics arrive in Phase 6.
      </p>
    </main>
  )
}
