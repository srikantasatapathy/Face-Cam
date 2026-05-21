'use client'

import { ApiError, api } from '@/lib/api'
import { Alert, Button, Field, Input } from '@/components/ui'
import type { LoginResponse } from '@facecam/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Used by both the platform console and the tenant portals.
 *
 * `tenantSlug` is what confines the credentials to one organization: present on
 * a portal, absent on the apex domain where only super admins sign in.
 */
export function LoginForm({ tenantSlug }: { tenantSlug?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})

    try {
      const result = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
        ...(tenantSlug ? { tenantSlug } : {}),
      })

      router.replace(result.redirectTo)
      router.refresh()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Could not reach the server. Check your connection and try again.')
      }
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert>{error}</Alert>}

      <Field label="Email" error={fieldErrors.email}>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </Field>

      <Field label="Password" error={fieldErrors.password}>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
