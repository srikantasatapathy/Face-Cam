import { StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { getFieldDefinitions, requirePortal } from '@/lib/portal'
import { TEMPLATE_CODE_LABEL, type MemberDto } from '@facecam/shared'
import Link from 'next/link'
import { ArchiveMemberButton } from './archive-button'

export const dynamic = 'force-dynamic'

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { tenant, cookie } = await requirePortal(slug)

  const [member, definitions] = await Promise.all([
    api.get<MemberDto>(`/members/${id}`, { cookie, cache: 'no-store' }),
    getFieldDefinitions(cookie),
  ])

  const codeLabel = TEMPLATE_CODE_LABEL[tenant.template] ?? 'Code'

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/members" className="text-sm text-content-muted underline">
        Back to list
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-content">{member.fullName}</h1>
          <p className="mt-1 font-mono text-sm text-content-muted">
            {codeLabel}: {member.code}
          </p>
          <div className="mt-2">
            <StatusBadge status={member.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/members/${member.id}/edit`}
            className="rounded-control border border-line px-4 py-2 text-sm font-medium text-content"
          >
            Edit
          </Link>
          <ArchiveMemberButton memberId={member.id} archived={Boolean(member.archivedAt)} />
        </div>
      </div>

      <section
        className={`mt-6 rounded-card border px-4 py-3 text-sm ${
          member.consentAt
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-warning/30 bg-warning/10 text-warning'
        }`}
      >
        {member.consentAt ? (
          <>
            <strong>Biometric consent recorded</strong> on{' '}
            {new Date(member.consentAt).toLocaleDateString()} under notice {member.consentVersion}.
          </>
        ) : (
          <>
            <strong>No biometric consent on record.</strong> This person cannot be face-enrolled
            until consent is captured. Edit the member to record it.
          </>
        )}
      </section>

      <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
        <Row label="Email" value={member.email} />
        <Row label="Phone" value={member.phone} />
        {definitions.map((definition) => (
          <Row
            key={definition.key}
            label={definition.label}
            value={formatValue(member.attributes[definition.key])}
          />
        ))}
        <Row
          label="Face enrolled"
          value={
            member.faceEnrolledAt
              ? new Date(member.faceEnrolledAt).toLocaleDateString()
              : 'Not yet (Phase 3)'
          }
        />
        <Row label="Added" value={new Date(member.createdAt).toLocaleDateString()} />
      </dl>
    </main>
  )
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className="mt-0.5 text-content">{value ?? '—'}</dd>
    </div>
  )
}
