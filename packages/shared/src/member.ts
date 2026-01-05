import { z } from 'zod'
import { FieldType, MemberStatus } from './enums'
import type { FieldDefinition } from './field-schema'

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

const fieldKey = z
  .string()
  .trim()
  .min(1, 'Enter a field key')
  .max(64)
  .regex(
    /^[a-z][a-zA-Z0-9]*$/,
    'Start with a lowercase letter, then letters and numbers only (camelCase)',
  )

const fieldTypeEnum = z.enum([
  FieldType.TEXT,
  FieldType.NUMBER,
  FieldType.DATE,
  FieldType.SELECT,
  FieldType.EMAIL,
  FieldType.PHONE,
  FieldType.BOOLEAN,
])

const fieldShape = {
  label: z.string().trim().min(1, 'Enter a label').max(100),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1)).default([]),
  group: z.string().trim().max(64).nullable().optional(),
  helpText: z.string().trim().max(200).nullable().optional(),
  maxLength: z.number().int().positive().max(10_000).nullable().optional(),
  min: z.number().int().nullable().optional(),
  max: z.number().int().nullable().optional(),
}

/**
 * A `select` with no options can never validate, so it is rejected at the point
 * of definition rather than silently failing every member submission later.
 */
const requireOptionsForSelect = (
  value: { type?: string; options?: string[] },
  ctx: z.RefinementCtx,
) => {
  if (value.type === FieldType.SELECT && (value.options ?? []).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Add at least one option',
    })
  }
}

export const createFieldDefinitionSchema = z
  .object({ key: fieldKey, type: fieldTypeEnum, ...fieldShape })
  .superRefine(requireOptionsForSelect)

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>

/**
 * `key` and `type` are absent by design.
 *
 * Renaming a key would orphan the value already stored under it on every
 * existing member; changing a type would invalidate values that were valid when
 * written. Both require creating a new field and migrating deliberately.
 */
export const updateFieldDefinitionSchema = z
  .object({ ...fieldShape, label: fieldShape.label.optional(), type: fieldTypeEnum.optional() })
  .superRefine(requireOptionsForSelect)

export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionSchema>

export const reorderFieldDefinitionsSchema = z.object({
  /** Field definition ids in their new display order. */
  ids: z.array(z.string().uuid()).min(1),
})

export type ReorderFieldDefinitionsInput = z.infer<typeof reorderFieldDefinitionsSchema>

export interface FieldDefinitionDto extends FieldDefinition {
  id: string
  archivedAt: string | null
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export interface MemberDto {
  id: string
  code: string
  fullName: string
  email: string | null
  phone: string | null
  status: MemberStatus
  attributes: Record<string, unknown>
  consentAt: string | null
  consentVersion: string | null
  faceEnrolledAt: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

/**
 * The consent record attached when a member is created.
 *
 * Face templates are biometric data. Recording *that* someone consented is not
 * enough: the version of the notice they agreed to has to be recoverable years
 * later. See PROJECT_DESCRIPTION.md section 12.
 */
export const consentSchema = z.object({
  granted: z.boolean(),
  version: z.string().trim().min(1).max(32),
})

export type ConsentInput = z.infer<typeof consentSchema>

/** The current biometric consent notice. Bump when the wording changes. */
export const CONSENT_VERSION = '2026-08-v1'

export const listMembersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  /** Matches against name, code, email and phone. */
  search: z.string().trim().optional(),
  status: z.enum([MemberStatus.ACTIVE, MemberStatus.INACTIVE, MemberStatus.ARCHIVED]).optional(),
  /** Filter by a dynamic attribute, e.g. `attr.class=10` */
  attribute: z.string().trim().optional(),
  attributeValue: z.string().trim().optional(),
  sortBy: z.enum(['fullName', 'code', 'createdAt']).default('fullName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type ListMembersQuery = z.infer<typeof listMembersSchema>

export const archiveMemberSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/**
 * Maps CSV column headers onto member fields.
 * Keys are the target field (`code`, `fullName`, or an attribute key);
 * values are the CSV header to read from.
 */
export const importMappingSchema = z.record(z.string(), z.string())

export const importMembersSchema = z.object({
  /** Parsed CSV rows, header row already removed. */
  rows: z.array(z.record(z.string(), z.string())).min(1, 'The file has no data rows').max(5000),
  mapping: importMappingSchema,
  /** When true, nothing is written; only the validation report is returned. */
  dryRun: z.boolean().default(true),
  /** Update existing members matched by code rather than reporting a conflict. */
  updateExisting: z.boolean().default(false),
  consentVersion: z.string().trim().max(32).optional(),
})

export type ImportMembersInput = z.infer<typeof importMembersSchema>

export interface ImportRowError {
  /** 1-based, counting the header as row 1, so it matches what a spreadsheet shows. */
  row: number
  field: string
  message: string
}

export interface ImportReport {
  dryRun: boolean
  totalRows: number
  valid: number
  created: number
  updated: number
  skipped: number
  errors: ImportRowError[]
}

/** Fixed columns every import can target, regardless of template. */
export const IMPORTABLE_CORE_FIELDS = [
  { key: 'code', label: 'Member code', required: true },
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
] as const
