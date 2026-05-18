'use client'

import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SignOutButton({ redirectTo = '/login' }: { redirectTo?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    try {
      await api.post('/auth/logout')
    } finally {
      // Navigate regardless: a failed logout call must not strand the user on a
      // page they believe they have left.
      router.replace(redirectTo)
      router.refresh()
    }
  }

  return (
    <button
      onClick={signOut}
      disabled={pending}
      className="text-sm text-content-muted underline hover:text-content disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
