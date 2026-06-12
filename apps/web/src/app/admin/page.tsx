import { StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import type { Paginated, TenantSummary } from '@facecam/shared'
import { cookies } from 'next/headers'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SuperAdminOverviewPage() {
  const cookie = (await cookies()).toString()
  const tenants = await api.get<Paginated<TenantSummary>>('/admin/tenants?pageSize=200', {
    cookie,
    cache: 'no-store',
  })

  const byStatus = tenants.items.reduce<Record<string, number>>((counts, tenant) => {
    counts[tenant.status] = (counts[tenant.status] ?? 0) + 1
    return counts
  }, {})

  const statuses = ['active', 'trial', 'past_due', 'suspended', 'cancelled']

  return (
    <div>
      <h1 className="text-2xl font-semibold text-content">Platform overview</h1>
      <p className="mt-1 text-content-muted">{tenants.total} organizations registered</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statuses.map((status) => (
          <div key={status} className="rounded-card border border-line bg-surface p-4">
            <p className="text-2xl font-semibold text-content">{byStatus[status] ?? 0}</p>
            <div className="mt-1">
              <StatusBadge status={status} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Link href="/admin/tenants" className="text-sm text-brand underline">
          Manage organizations
        </Link>
      </div>
    </div>
  )
}
