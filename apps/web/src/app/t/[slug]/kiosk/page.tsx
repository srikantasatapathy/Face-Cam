import { getTenantBySlug } from '@/lib/tenant'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Attendance kiosk shell.
 *
 * The camera, in-browser face detection and the recognition loop are built in
 * Phase 4. This page already carries `data-surface="kiosk"`, which disables
 * text selection, long-press callouts and pinch zoom, because the page runs
 * unattended on a wall-mounted tablet all day.
 */
export default async function KioskPage({ params }: Props) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  if (!tenant) notFound()

  return (
    <main
      data-surface="kiosk"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-content p-8 text-content-inverted"
    >
      <p className="text-sm uppercase tracking-widest opacity-60">{tenant.name}</p>
      <h1 className="text-3xl font-semibold">Attendance kiosk</h1>
      <p className="max-w-md text-center opacity-70">
        Camera capture, quality gating and recognition are implemented in Phase 4.
      </p>
    </main>
  )
}
