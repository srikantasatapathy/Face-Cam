import { LoginForm } from '@/components/login-form'
import { getSession } from '@/lib/session'
import { UserRole } from '@facecam/shared'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Sign in · Face-Cam' }

/**
 * Apex-domain sign in. Only super admins have accounts here; organization staff
 * sign in on their own portal, which is what keeps one portal's credentials
 * from working on another.
 */
export default async function PlatformLoginPage() {
  const session = await getSession()
  if (session) redirect(session.role === UserRole.SUPER_ADMIN ? '/admin' : '/')

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-medium uppercase tracking-widest text-brand">Face-Cam</p>
          <h1 className="mt-1 text-2xl font-semibold text-content">Platform console</h1>
          <p className="mt-1 text-sm text-content-muted">
            Organization staff sign in at their own portal address.
          </p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
