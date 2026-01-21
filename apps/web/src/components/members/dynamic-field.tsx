'use client'

import { Field, Input, Select } from '@/components/ui'
import { FieldType, type FieldDefinitionDto } from '@facecam/shared'

/**
 * Renders one tenant-defined field.
 *
 * The input type comes from the definition, so an organization that adds a
 * "House" field gets a working input without any code change. The same
 * definitions generate the Zod schema the API validates against, so what this
 * form accepts and what the server accepts cannot drift.
 */
export function DynamicField({
  definition,
  value,
  error,
  disabled,
  onChange,
}: {
  definition: FieldDefinitionDto
  value: unknown
  error?: string
  disabled?: boolean
  onChange: (key: string, value: unknown) => void
}) {
  const label = definition.required ? `${definition.label} *` : definition.label
  const common = {
    id: `field-${definition.key}`,
    disabled,
    required: definition.required,
  }

  const text = value === undefined || value === null ? '' : String(value)

  if (definition.type === FieldType.SELECT) {
    return (
      <Field label={label} error={error} hint={definition.helpText ?? undefined}>
        <Select
          {...common}
          value={text}
          onChange={(event) => onChange(definition.key, event.target.value)}
        >
          <option value="">Not set</option>
          {(definition.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    )
  }

  if (definition.type === FieldType.BOOLEAN) {
    return (
      <Field label={label} error={error} hint={definition.helpText ?? undefined}>
        <label className="flex items-center gap-2 py-2">
          <input
            {...common}
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(event) => onChange(definition.key, event.target.checked)}
            className="h-4 w-4 rounded border-line accent-[rgb(var(--brand-primary))]"
          />
          <span className="text-sm text-content-muted">Yes</span>
        </label>
      </Field>
    )
  }

  const inputType = {
    [FieldType.TEXT]: 'text',
    [FieldType.NUMBER]: 'number',
    [FieldType.DATE]: 'date',
    [FieldType.EMAIL]: 'email',
    [FieldType.PHONE]: 'tel',
  }[definition.type as Exclude<FieldType, 'select' | 'boolean'>]

  return (
    <Field label={label} error={error} hint={definition.helpText ?? undefined}>
      <Input
        {...common}
        type={inputType}
        value={text}
        maxLength={definition.maxLength ?? undefined}
        min={definition.min ?? undefined}
        max={definition.max ?? undefined}
        onChange={(event) => onChange(definition.key, event.target.value)}
      />
    </Field>
  )
}

/** Groups definitions by their `group` label, preserving display order. */
export function groupDefinitions(
  definitions: FieldDefinitionDto[],
): Array<[string, FieldDefinitionDto[]]> {
  const groups = new Map<string, FieldDefinitionDto[]>()

  for (const definition of definitions) {
    const key = definition.group ?? 'Other'
    const bucket = groups.get(key)
    if (bucket) bucket.push(definition)
    else groups.set(key, [definition])
  }

  return [...groups.entries()]
}
