import { StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import type { TenantDetail } from '@facecam/shared'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { TenantStatusActions } from './status-actions'

export const dynamic = 'force-dynamic'

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3100'

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookie = (await cookies()).toString()
  const tenant = await api.get<TenantDetail>(`/admin/tenants/${id}`, { cookie, cache: 'no-store' })

  const rows: Array<[string, string]> = [
    ['Portal', `${tenant.slug}.${rootDomain}`],
    ['Type', tenant.template],
    ['Timezone', tenant.timezone],
    ['Plan', tenant.plan ?? '—'],
    ['Renews', tenant.validUntil ? new Date(tenant.validUntil).toLocaleDateString() : '—'],
    ['Billing email', tenant.billingEmail ?? '—'],
    ['Users', String(tenant.userCount)],
    ['Face engine', tenant.faceEngineReady ? 'Provisioned' : 'Not provisioned yet'],
    ['Registered', new Date(tenant.createdAt).toLocaleDateString()],
  ]

  return (
    <div className="max-w-3xl">
      <Link href="/admin/tenants" className="text-sm text-content-muted underline">
        Back to organizations
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-content">{tenant.name}</h1>
          <div className="mt-2">
            <StatusBadge status={tenant.status} />
          </div>
        </div>
      </div>

      {tenant.status === 'suspended' && tenant.suspendedReason && (
        <div className="mt-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <strong>Suspended:</strong> {tenant.suspendedReason}
          {tenant.suspendedAt && (
            <span className="opacity-80"> ({new Date(tenant.suspendedAt).toLocaleString()})</span>
          )}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-content-muted">{label}</dt>
            <dd className="mt-0.5 capitalize text-content">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 rounded-card border border-line bg-surface p-6">
        <h2 className="text-lg font-medium text-content">Service</h2>
        <p className="mt-1 text-sm text-content-muted">
          Suspending pauses attendance capture and enrolment. Dashboards, reports and exports keep
          working, and no data is deleted.
        </p>
        <div className="mt-4">
          <TenantStatusActions tenantId={tenant.id} status={tenant.status} name={tenant.name} />
        </div>
      </div>
    </div>
  )
}
