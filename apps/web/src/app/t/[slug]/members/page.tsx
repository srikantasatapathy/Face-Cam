import { StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { getFieldDefinitions, requirePortal } from '@/lib/portal'
import {
  TEMPLATE_CODE_LABEL,
  TEMPLATE_MEMBER_LABEL,
  type FieldDefinitionDto,
  type MemberDto,
  type Paginated,
} from '@facecam/shared'
import Link from 'next/link'
import { MemberFilters } from './member-filters'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function MembersPage({ params, searchParams }: Props) {
  const { slug } = await params
  const query = await searchParams
  const { tenant, cookie } = await requirePortal(slug)

  const search = new URLSearchParams()
  if (query.search) search.set('search', query.search)
  if (query.attribute && query.attributeValue) {
    search.set('attribute', query.attribute)
    search.set('attributeValue', query.attributeValue)
  }
  search.set('page', query.page ?? '1')

  const [members, definitions] = await Promise.all([
    api.get<Paginated<MemberDto>>(`/members?${search}`, { cookie, cache: 'no-store' }),
    getFieldDefinitions(cookie),
  ])

  const labels = TEMPLATE_MEMBER_LABEL[tenant.template] ?? { singular: 'Member', plural: 'Members' }
  const codeLabel = TEMPLATE_CODE_LABEL[tenant.template] ?? 'Code'

  // Show at most two dynamic columns, otherwise the table stops being scannable
  // on the tenants that define fifteen fields.
  const columns: FieldDefinitionDto[] = definitions.slice(0, 2)

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-content">{labels.plural}</h1>
          <p className="mt-1 text-sm text-content-muted">{members.total} on the roll</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/members/export.csv"
            className="rounded-control border border-line px-4 py-2 text-sm font-medium text-content"
          >
            Export CSV
          </a>
          <Link
            href="/members/import"
            className="rounded-control border border-line px-4 py-2 text-sm font-medium text-content"
          >
            Import
          </Link>
          <Link
            href="/members/new"
            className="rounded-control bg-brand px-4 py-2 text-sm font-medium text-content-inverted"
          >
            Add {labels.singular.toLowerCase()}
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <MemberFilters definitions={definitions} />
      </div>

      {members.items.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line p-12 text-center">
          <p className="text-content">No {labels.plural.toLowerCase()} found</p>
          <p className="mt-1 text-sm text-content-muted">
            {query.search || query.attributeValue
              ? 'Try clearing the filters.'
              : `Add one, or import a spreadsheet to get started.`}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-content-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{codeLabel}</th>
                <th className="px-4 py-3 font-medium">Name</th>
                {columns.map((definition) => (
                  <th key={definition.key} className="px-4 py-3 font-medium">
                    {definition.label}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Consent</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.items.map((member) => (
                <tr key={member.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-content-muted">{member.code}</td>
                  <td className="px-4 py-3">
                    <Link href={`/members/${member.id}`} className="text-brand underline">
                      {member.fullName}
                    </Link>
                  </td>
                  {columns.map((definition) => (
                    <td key={definition.key} className="px-4 py-3 text-content-muted">
                      {String(member.attributes[definition.key] ?? '—')}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {member.consentAt ? (
                      <span className="text-xs text-success">Recorded</span>
                    ) : (
                      <span className="text-xs text-warning">Not recorded</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={member.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {members.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-content-muted">
          <span>
            Page {members.page} of {members.totalPages}
          </span>
          <div className="flex gap-2">
            {members.page > 1 && (
              <Link
                href={`/members?${new URLSearchParams({ ...query, page: String(members.page - 1) } as Record<string, string>)}`}
                className="rounded-control border border-line px-3 py-1.5 text-content"
              >
                Previous
              </Link>
            )}
            {members.page < members.totalPages && (
              <Link
                href={`/members?${new URLSearchParams({ ...query, page: String(members.page + 1) } as Record<string, string>)}`}
                className="rounded-control border border-line px-3 py-1.5 text-content"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
