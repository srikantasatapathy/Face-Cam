'use client'

import { Input, Select } from '@/components/ui'
import { FieldType, type FieldDefinitionDto } from '@facecam/shared'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

/**
 * Search plus one dynamic-attribute filter.
 *
 * Only `select` fields are offered as filters: they have a known, finite set of
 * values, so the filter is a dropdown that always matches something. Free-text
 * fields would need their own distinct-value query and mostly return nothing.
 */
export function MemberFilters({ definitions }: { definitions: FieldDefinitionDto[] }) {
  const router = useRouter()
  const params = useSearchParams()

  const [search, setSearch] = useState(params.get('search') ?? '')
  const [attribute, setAttribute] = useState(params.get('attribute') ?? '')
  const [attributeValue, setAttributeValue] = useState(params.get('attributeValue') ?? '')

  const filterable = definitions.filter(
    (definition) => definition.type === FieldType.SELECT && (definition.options?.length ?? 0) > 0,
  )
  const selected = filterable.find((definition) => definition.key === attribute)

  function apply(next: Partial<Record<string, string>>) {
    const query = new URLSearchParams()
    const merged = { search, attribute, attributeValue, ...next }

    if (merged.search) query.set('search', merged.search)
    if (merged.attribute && merged.attributeValue) {
      query.set('attribute', merged.attribute)
      query.set('attributeValue', merged.attributeValue)
    }

    router.push(`/members?${query}`)
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        apply({})
      }}
    >
      <Input
        placeholder="Search name, code, email or phone"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full max-w-xs"
      />

      {filterable.length > 0 && (
        <>
          <Select
            value={attribute}
            onChange={(event) => {
              setAttribute(event.target.value)
              setAttributeValue('')
            }}
            className="w-auto"
          >
            <option value="">Filter by…</option>
            {filterable.map((definition) => (
              <option key={definition.key} value={definition.key}>
                {definition.label}
              </option>
            ))}
          </Select>

          {selected && (
            <Select
              value={attributeValue}
              onChange={(event) => {
                setAttributeValue(event.target.value)
                apply({ attributeValue: event.target.value })
              }}
              className="w-auto"
            >
              <option value="">Any</option>
              {(selected.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </>
      )}

      <button
        type="submit"
        className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-content"
      >
        Search
      </button>

      {(search || attributeValue) && (
        <button
          type="button"
          onClick={() => {
            setSearch('')
            setAttribute('')
            setAttributeValue('')
            router.push('/members')
          }}
          className="px-2 py-2 text-sm text-content-muted underline"
        >
          Clear
        </button>
      )}
    </form>
  )
}
