import { MemberForm } from '@/components/members/member-form'
import { getFieldDefinitions, requirePortal } from '@/lib/portal'
import { TEMPLATE_MEMBER_LABEL } from '@facecam/shared'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function NewMemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { tenant, cookie } = await requirePortal(slug)
  const definitions = await getFieldDefinitions(cookie)

  const labels = TEMPLATE_MEMBER_LABEL[tenant.template] ?? { singular: 'Member', plural: 'Members' }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/members" className="text-sm text-content-muted underline">
        Back to {labels.plural.toLowerCase()}
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold text-content">
        Add {labels.singular.toLowerCase()}
      </h1>
      <MemberForm definitions={definitions} template={tenant.template} />
    </main>
  )
}
