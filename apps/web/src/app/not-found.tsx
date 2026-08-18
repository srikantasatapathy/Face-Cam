import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold text-content">Portal not found</h1>
      <p className="text-content-muted">
        No organization is registered at this address. Check the URL, or contact your administrator.
      </p>
      <Link href="/" className="text-brand underline">
        Go to Face-Cam
      </Link>
    </main>
  )
}
