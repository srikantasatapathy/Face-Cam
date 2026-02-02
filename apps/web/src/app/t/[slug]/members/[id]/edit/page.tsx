import { MemberForm } from '@/components/members/member-form'
import { api } from '@/lib/api'
import { getFieldDefinitions, requirePortal } from '@/lib/portal'
import type { MemberDto } from '@facecam/shared'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function EditMemberPage({
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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href={`/members/${id}`} className="text-sm text-content-muted underline">
        Back
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold text-content">Edit {member.fullName}</h1>
      <MemberForm definitions={definitions} template={tenant.template} member={member} />
    </main>
  )
}
