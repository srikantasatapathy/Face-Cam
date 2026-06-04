'use client'

import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { TenantTemplate, slugify, type TenantDetail } from '@facecam/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3100'

export function CreateTenantForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [template, setTemplate] = useState<string>(TenantTemplate.EDUCATION)
  const [adminFullName, setAdminFullName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  // The slug follows the name until the user edits it directly, after which it
  // stays put. It is frozen once the organization exists, because changing it
  // would break every bookmark and kiosk pointing at the old address.
  const effectiveSlug = slugTouched ? slug : slugify(name)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})

    try {
      const tenant = await api.post<TenantDetail>('/admin/tenants', {
        name,
        slug: effectiveSlug || undefined,
        template,
        adminFullName,
        adminEmail,
        adminPassword,
      })

      router.replace(`/admin/tenants/${tenant.id}`)
      router.refresh()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Could not reach the server. Try again.')
      }
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert>{error}</Alert>}

      <Field label="Organization name" error={fieldErrors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={pending} />
      </Field>

      <Field
        label="Portal address"
        error={fieldErrors.slug}
        hint={
          effectiveSlug
            ? `Portal will be ${effectiveSlug}.${rootDomain}. This cannot be changed later.`
            : 'Derived from the name. This cannot be changed later.'
        }
      >
        <Input
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          disabled={pending}
        />
      </Field>

      <Field
        label="Template"
        error={fieldErrors.template}
        hint="Sets the member fields and the look of the portal. Both are editable afterwards."
      >
        <Select value={template} onChange={(e) => setTemplate(e.target.value)} disabled={pending}>
          <option value={TenantTemplate.EDUCATION}>School or college</option>
          <option value={TenantTemplate.CORPORATE}>Company</option>
        </Select>
      </Field>

      <hr className="border-line" />

      <p className="text-sm font-medium text-content">First administrator</p>

      <Field label="Full name" error={fieldErrors.adminFullName}>
        <Input
          value={adminFullName}
          onChange={(e) => setAdminFullName(e.target.value)}
          required
          disabled={pending}
        />
      </Field>

      <Field label="Email" error={fieldErrors.adminEmail}>
        <Input
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
          disabled={pending}
        />
      </Field>

      <Field
        label="Temporary password"
        error={fieldErrors.adminPassword}
        hint="At least 12 characters. Share it with the administrator over a separate channel."
      >
        <Input
          type="text"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          required
          disabled={pending}
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Register organization'}
      </Button>
    </form>
  )
}
