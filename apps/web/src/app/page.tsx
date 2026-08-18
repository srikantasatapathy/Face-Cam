import Link from 'next/link'

/** Apex domain landing page. Tenant portals live on their own subdomains. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-brand">Face-Cam</p>
        <h1 className="mt-2 text-4xl font-semibold text-content">
          Face recognition attendance, in the browser
        </h1>
        <p className="mt-4 text-content-muted">
          Each organization gets its own portal at{' '}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-sm">
            your-org.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3100'}
          </code>
          .
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-control bg-brand px-4 py-2 font-medium text-content-inverted"
        >
          Sign in
        </Link>
        <Link
          href="/admin"
          className="rounded-control border border-line px-4 py-2 font-medium text-content"
        >
          Super admin
        </Link>
      </div>
    </main>
  )
}
