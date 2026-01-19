'use client'

import { DynamicField, groupDefinitions } from '@/components/members/dynamic-field'
import { Alert, Button, Field, Input } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import {
  CONSENT_VERSION,
  TEMPLATE_CODE_LABEL,
  type FieldDefinitionDto,
  type MemberDto,
} from '@facecam/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Create and edit form for a member.
 *
 * The fixed columns are hard-coded because the platform itself depends on them;
 * everything else is rendered from the tenant's field definitions.
 */
export function MemberForm({
  definitions,
  template,
  member,
}: {
  definitions: FieldDefinitionDto[]
  template: string
  member?: MemberDto
}) {
  const router = useRouter()
  const editing = Boolean(member)

  const [code, setCode] = useState(member?.code ?? '')
  const [fullName, setFullName] = useState(member?.fullName ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [attributes, setAttributes] = useState<Record<string, unknown>>(member?.attributes ?? {})
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  const codeLabel = TEMPLATE_CODE_LABEL[template] ?? 'Member code'
  const alreadyConsented = Boolean(member?.consentAt)

  function setAttribute(key: string, value: unknown) {
    setAttributes((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})

    const payload = {
      code,
      fullName,
      email: email || undefined,
      phone: phone || undefined,
      attributes,
      ...(consent && !alreadyConsented
        ? { consent: { granted: true, version: CONSENT_VERSION } }
        : {}),
    }

    try {
      const saved = editing
        ? await api.patch<MemberDto>(`/members/${member!.id}`, payload)
        : await api.post<MemberDto>('/members', payload)

      router.replace(`/members/${saved.id}`)
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
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {error && <Alert>{error}</Alert>}

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-muted">
          Identity
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${codeLabel} *`} error={fieldErrors.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={pending}
            />
          </Field>
          <Field label="Full name *" error={fieldErrors.fullName}>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={pending}
            />
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="Phone" error={fieldErrors.phone}>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
      </section>

      {groupDefinitions(definitions).map(([group, fields]) => (
        <section key={group} className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-muted">
            {group}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((definition) => (
              <DynamicField
                key={definition.key}
                definition={definition}
                value={attributes[definition.key]}
                error={fieldErrors[`attributes.${definition.key}`]}
                disabled={pending}
                onChange={setAttribute}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-content-muted">
          Biometric consent
        </h2>

        {alreadyConsented ? (
          <p className="text-sm text-content-muted">
            Consent was recorded on {new Date(member!.consentAt!).toLocaleDateString()} under notice
            version {member!.consentVersion}. Withdrawing consent is a separate action.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-content-muted">
              A face may only be enrolled after consent is recorded. Without it this person can
              still be added and marked present manually, but not scanned.
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={pending}
                className="mt-1 h-4 w-4 rounded border-line accent-[rgb(var(--brand-primary))]"
              />
              <span className="text-sm text-content">
                This person, or their guardian, has been shown the biometric processing notice
                (version {CONSENT_VERSION}) and agreed to it.
              </span>
            </label>
          </>
        )}
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Add member'}
        </Button>
        <Link
          href={member ? `/members/${member.id}` : '/members'}
          className="rounded-control border border-line px-4 py-2 text-sm font-medium text-content"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
