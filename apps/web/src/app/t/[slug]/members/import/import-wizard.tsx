'use client'

import { Alert, Button, Field, Select } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { IMPORTABLE_CORE_FIELDS, type FieldDefinitionDto, type ImportReport } from '@facecam/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Row = Record<string, string>

/**
 * Three steps: choose a file, map its columns, review the result.
 *
 * The file is parsed in the browser and posted as rows, so the server never
 * has to deal with encodings, delimiters or Excel's quirks. The dry run always
 * runs first, and the commit button only appears once the report is clean.
 */
export function ImportWizard({ definitions }: { definitions: FieldDefinitionDto[] }) {
  const router = useRouter()
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const targets = [
    ...IMPORTABLE_CORE_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      required: field.required,
    })),
    ...definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      required: definition.required,
    })),
  ]

  async function onFile(file: File) {
    setError(null)
    setReport(null)

    const text = await file.text()
    const parsed = parseCsv(text)

    if (parsed.length < 2) {
      setError('That file has a header row but no data rows.')
      return
    }

    const [headerRow, ...dataRows] = parsed as [string[], ...string[][]]
    setHeaders(headerRow)
    setRows(
      dataRows.map((cells) => Object.fromEntries(headerRow.map((h, i) => [h, cells[i] ?? '']))),
    )

    // Auto-map columns whose header matches a target key or label, which
    // handles most real spreadsheets without any clicking.
    const guessed: Record<string, string> = {}
    for (const target of targets) {
      const match = headerRow.find(
        (header) =>
          normalise(header) === normalise(target.key) ||
          normalise(header) === normalise(target.label),
      )
      if (match) guessed[target.key] = match
    }
    setMapping(guessed)
  }

  async function run(dryRun: boolean) {
    setPending(true)
    setError(null)
    try {
      const result = await api.post<ImportReport>('/members/import', {
        rows,
        mapping,
        dryRun,
        updateExisting: false,
      })
      setReport(result)
      if (!dryRun && result.created + result.updated > 0) {
        router.push('/members')
        router.refresh()
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach the server.')
    } finally {
      setPending(false)
    }
  }

  const missingRequired = targets.filter((t) => t.required && !mapping[t.key])
  const canCheck = rows.length > 0 && missingRequired.length === 0

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert>{error}</Alert>}

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
          1. Choose a CSV file
        </h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onFile(file)
          }}
          className="block w-full text-sm text-content file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-content-inverted"
        />
        {rows.length > 0 && (
          <p className="mt-2 text-sm text-content-muted">
            {rows.length} data rows, {headers.length} columns.
          </p>
        )}
      </section>

      {headers.length > 0 && (
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
            2. Match the columns
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {targets.map((target) => (
              <Field key={target.key} label={target.required ? `${target.label} *` : target.label}>
                <Select
                  value={mapping[target.key] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [target.key]: event.target.value }))
                  }
                  disabled={pending}
                >
                  <option value="">Skip</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <p className="mt-3 text-sm text-warning">
              Still to match: {missingRequired.map((t) => t.label).join(', ')}
            </p>
          )}

          <div className="mt-4">
            <Button onClick={() => run(true)} disabled={!canCheck || pending}>
              {pending ? 'Checking…' : 'Check the file'}
            </Button>
          </div>
        </section>
      )}

      {report && (
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
            3. Result
          </h2>

          <div className="flex flex-wrap gap-6 text-sm">
            <span className="text-content">
              <strong>{report.totalRows}</strong> rows
            </span>
            <span className="text-success">
              <strong>{report.valid}</strong> ready
            </span>
            <span className={report.errors.length > 0 ? 'text-danger' : 'text-content-muted'}>
              <strong>{report.errors.length}</strong> problems
            </span>
          </div>

          {report.errors.length > 0 ? (
            <>
              <p className="mt-4 text-sm text-content-muted">
                Fix these in your spreadsheet and upload again. Row numbers match what you see
                there, counting the header as row 1.
              </p>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-control border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-line bg-surface-sunken text-left text-content-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.errors.map((problem, index) => (
                      <tr key={index} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{problem.row}</td>
                        <td className="px-3 py-2 text-content-muted">{problem.field}</td>
                        <td className="px-3 py-2">{problem.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className="mb-3 text-sm text-content-muted">
                Every row checks out. Imported members are added without biometric consent, which
                has to be recorded per person before any face can be enrolled.
              </p>
              <Button onClick={() => run(false)} disabled={pending}>
                {pending ? 'Importing…' : `Import ${report.valid} members`}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Minimal RFC 4180 parser: handles quoted fields, embedded commas, escaped
 * quotes and both line-ending styles. Enough for spreadsheet exports, and
 * avoids shipping a parser library for one screen.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const source = text.replace(/^﻿/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell.trim())
      cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else cell += char
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell.trim())
    if (row.some((value) => value !== '')) rows.push(row)
  }

  return rows
}
