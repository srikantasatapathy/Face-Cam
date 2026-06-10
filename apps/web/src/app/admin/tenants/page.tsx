import { StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import type { Paginated, TenantSummary } from '@facecam/shared'
import { cookies } from 'next/headers'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3100'

export default async function TenantsPage() {
  const cookie = (await cookies()).toString()
  const tenants = await api.get<Paginated<TenantSummary>>('/admin/tenants?pageSize=200', {
    cookie,
    cache: 'no-store',
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-content">Organizations</h1>
          <p className="mt-1 text-content-muted">{tenants.total} registered</p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="rounded-control bg-brand px-4 py-2 text-sm font-medium text-content-inverted"
        >
          Register organization
        </Link>
      </div>

      {tenants.items.length === 0 ? (
        <div className="mt-8 rounded-card border border-dashed border-line p-10 text-center">
          <p className="text-content">No organizations yet</p>
          <p className="mt-1 text-sm text-content-muted">
            Register the first one to create its portal.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-content-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Portal</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Users</th>
                <th className="px-4 py-3 font-medium">Renews</th>
              </tr>
            </thead>
            <tbody>
              {tenants.items.map((tenant) => (
                <tr key={tenant.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/tenants/${tenant.id}`} className="text-brand underline">
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-content-muted">
                    {tenant.slug}.{rootDomain}
                  </td>
                  <td className="px-4 py-3 capitalize text-content-muted">{tenant.template}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3 text-content-muted">{tenant.userCount}</td>
                  <td className="px-4 py-3 text-content-muted">
                    {tenant.validUntil ? new Date(tenant.validUntil).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
