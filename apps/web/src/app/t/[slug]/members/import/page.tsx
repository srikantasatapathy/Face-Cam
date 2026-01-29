import { getFieldDefinitions, requirePortal } from '@/lib/portal'
import Link from 'next/link'
import { ImportWizard } from './import-wizard'

export const dynamic = 'force-dynamic'

export default async function ImportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { cookie } = await requirePortal(slug)
  const definitions = await getFieldDefinitions(cookie)

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/members" className="text-sm text-content-muted underline">
        Back to list
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-content">Import from a spreadsheet</h1>
      <p className="mb-6 mt-1 text-sm text-content-muted">
        Every row is checked before anything is saved. If any row has a problem, nothing is written,
        so you never end up with half an import.
      </p>
      <ImportWizard definitions={definitions} />
    </main>
  )
}
