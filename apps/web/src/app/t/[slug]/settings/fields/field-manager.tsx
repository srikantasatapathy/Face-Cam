'use client'

import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { FieldType, type FieldDefinitionDto } from '@facecam/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function FieldManager({ initial }: { initial: FieldDefinitionDto[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const active = initial.filter((definition) => definition.archivedAt === null)
  const archived = initial.filter((definition) => definition.archivedAt !== null)

  async function act(
    id: string,
    action: 'archive' | 'restore' | 'toggleRequired',
    field?: FieldDefinitionDto,
  ) {
    setPending(id)
    setError(null)
    try {
      if (action === 'archive') await api.delete(`/member-fields/${id}`)
      else if (action === 'restore') await api.post(`/member-fields/${id}/restore`)
      else await api.patch(`/member-fields/${id}`, { required: !field?.required })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.')
    } finally {
      setPending(null)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...active]
    const target = index + direction
    if (target < 0 || target >= next.length) return

    const a = next[index]
    const b = next[target]
    if (!a || !b) return
    next[index] = b
    next[target] = a

    setPending('reorder')
    try {
      await api.patch('/member-fields/reorder', { ids: next.map((definition) => definition.id) })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reorder.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert>{error}</Alert>}

      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-content-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Required</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {active.map((definition, index) => (
              <tr key={definition.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="text-content">{definition.label}</div>
                  <div className="font-mono text-xs text-content-muted">{definition.key}</div>
                </td>
                <td className="px-4 py-3 text-content-muted">{definition.type}</td>
                <td className="px-4 py-3 text-content-muted">{definition.group ?? '—'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => act(definition.id, 'toggleRequired', definition)}
                    disabled={pending !== null}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      definition.required
                        ? 'bg-brand/15 text-brand'
                        : 'bg-content-muted/15 text-content-muted'
                    }`}
                  >
                    {definition.required ? 'Required' : 'Optional'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || pending !== null}
                      className="rounded border border-line px-1.5 text-content-muted disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === active.length - 1 || pending !== null}
                      className="rounded border border-line px-1.5 text-content-muted disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => act(definition.id, 'archive')}
                    disabled={pending !== null}
                    className="text-sm text-content-muted underline hover:text-danger"
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {adding ? (
        <AddFieldForm onDone={() => setAdding(false)} />
      ) : (
        <div>
          <Button onClick={() => setAdding(true)}>Add a field</Button>
        </div>
      )}

      {archived.length > 0 && (
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-content-muted">
            Archived
          </h2>
          <p className="mb-3 mt-1 text-sm text-content-muted">
            These no longer appear on the form, but the values already saved against them are kept.
            Restoring one brings that data back into view.
          </p>
          <ul className="flex flex-col gap-2">
            {archived.map((definition) => (
              <li key={definition.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-content">
                  {definition.label}{' '}
                  <span className="font-mono text-xs text-content-muted">{definition.key}</span>
                </span>
                <button
                  onClick={() => act(definition.id, 'restore')}
                  disabled={pending !== null}
                  className="text-sm text-brand underline"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AddFieldForm({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [type, setType] = useState<string>(FieldType.TEXT)
  const [group, setGroup] = useState('')
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  // The key is what the value is stored under and can never change afterwards,
  // so it is derived from the label rather than asked for separately.
  const effectiveKey = key || camelCase(label)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setFieldErrors({})

    try {
      await api.post('/member-fields', {
        key: effectiveKey,
        label,
        type,
        required,
        group: group || undefined,
        options:
          type === FieldType.SELECT
            ? options
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
      })
      onDone()
      router.refresh()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else setError('Could not reach the server.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-card border border-line bg-surface p-6" noValidate>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-muted">
        New field
      </h2>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" error={fieldErrors.label}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            disabled={pending}
          />
        </Field>

        <Field
          label="Key"
          error={fieldErrors.key}
          hint="Where the value is stored. Cannot be changed later."
        >
          <Input value={effectiveKey} onChange={(e) => setKey(e.target.value)} disabled={pending} />
        </Field>

        <Field label="Type" error={fieldErrors.type}>
          <Select value={type} onChange={(e) => setType(e.target.value)} disabled={pending}>
            {Object.values(FieldType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Group" hint="Used to group fields on the form.">
          <Input value={group} onChange={(e) => setGroup(e.target.value)} disabled={pending} />
        </Field>

        {type === FieldType.SELECT && (
          <div className="sm:col-span-2">
            <Field label="Options" error={fieldErrors.options} hint="Separate with commas.">
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Red, Blue, Green"
                disabled={pending}
              />
            </Field>
          </div>
        )}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-content">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          disabled={pending}
          className="h-4 w-4 rounded border-line accent-[rgb(var(--brand-primary))]"
        />
        Required. Existing members are not affected, but the next save will need it.
      </label>

      <div className="mt-5 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add field'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function camelCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
}
