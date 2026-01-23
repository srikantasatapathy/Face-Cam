import { api } from '@/lib/api'
import { requirePortal } from '@/lib/portal'
import type { FieldDefinitionDto } from '@facecam/shared'
import { FieldManager } from './field-manager'

export const dynamic = 'force-dynamic'

export default async function FieldSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { cookie } = await requirePortal(slug)

  const definitions = await api.get<FieldDefinitionDto[]>('/member-fields?includeArchived=true', {
    cookie,
    cache: 'no-store',
  })

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-content">Member fields</h1>
      <p className="mb-6 mt-1 text-sm text-content-muted">
        These fields make up your enrolment form. They were seeded from your organization type and
        are yours to change.
      </p>
      <FieldManager initial={definitions} />
    </main>
  )
}
