import { z } from 'zod'
import { FieldType } from './enums'

/**
 * A tenant-configurable member attribute.
 * Mirrors the `member_field_definitions` table.
 */
export interface FieldDefinition {
  key: string
  label: string
  type: FieldType
  required: boolean
  /** Allowed values for `select` fields. Ignored for every other type. */
  options?: string[]
  /** UI grouping, e.g. "Academic" or "Employment". */
  group?: string
  sortOrder: number
  helpText?: string
  maxLength?: number
  min?: number
  max?: number
}

const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{5,19}$/

/** Builds the Zod validator for a single field, before optionality is applied. */
function baseSchemaFor(field: FieldDefinition): z.ZodTypeAny {
  switch (field.type) {
    case FieldType.TEXT:
      return z
        .string()
        .trim()
        .max(field.maxLength ?? 500)

    case FieldType.EMAIL:
      return z.string().trim().toLowerCase().email('Must be a valid email address')

    case FieldType.PHONE:
      return z.string().trim().regex(PHONE_PATTERN, 'Must be a valid phone number')

    case FieldType.NUMBER: {
      let schema = z.coerce.number({ invalid_type_error: 'Must be a number' })
      if (field.min !== undefined) schema = schema.min(field.min)
      if (field.max !== undefined) schema = schema.max(field.max)
      return schema
    }

    case FieldType.DATE:
      // Stored as an ISO date string (YYYY-MM-DD) so it survives JSON round-trips.
      return z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')
        .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a real calendar date')

    case FieldType.SELECT: {
      const options = field.options ?? []
      if (options.length === 0) {
        // A select with no options can never validate. Fail loudly at build time
        // rather than silently rejecting every submission.
        return z.never({ invalid_type_error: `Field "${field.key}" has no options configured` })
      }
      return z.enum(options as [string, ...string[]])
    }

    case FieldType.BOOLEAN:
      return z.coerce.boolean()

    default:
      return z.string()
  }
}

/**
 * Generates a Zod object schema from a tenant's field definitions.
 *
 * The same function runs in the API (request validation) and in the web app
 * (form validation), so the two can never disagree about what is acceptable.
 *
 * Optional fields accept null, undefined and empty string, all of which
 * normalize to undefined so blank inputs are not stored as empty strings.
 */
export function buildAttributesSchema(definitions: FieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of definitions) {
    const base = baseSchemaFor(field)

    if (field.required) {
      shape[field.key] =
        field.type === FieldType.TEXT
          ? (base as z.ZodString).min(1, `${field.label} is required`)
          : base
    } else {
      shape[field.key] = z.preprocess(
        (value) => (value === '' || value === null ? undefined : value),
        base.optional(),
      )
    }
  }

  // Unknown keys are stripped rather than rejected, so removing a field
  // definition does not break clients still sending the old payload.
  return z.object(shape).strip()
}

/** Core member columns that exist for every tenant regardless of template. */
export const memberCoreSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Member code is required')
    .max(64, 'Member code must be 64 characters or fewer'),
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(200, 'Full name must be 200 characters or fewer'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .regex(PHONE_PATTERN)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export type MemberCoreInput = z.infer<typeof memberCoreSchema>

/**
 * Biometric consent, carried on the member payload.
 *
 * Declared here rather than imported from `./member` to keep this module free
 * of cycles, since `member.ts` already imports from it.
 *
 * This must be part of the member schema, not validated separately: a plain
 * `z.object` strips unknown keys, so a consent block sent alongside a member
 * would be discarded before reaching the database. Silently losing the record
 * of who agreed to biometric processing is the worst possible failure here.
 */
const memberConsentSchema = z.object({
  granted: z.boolean(),
  version: z.string().trim().min(1).max(32),
})

/** Full member payload: fixed columns, dynamic attributes, and consent. */
export function buildMemberSchema(definitions: FieldDefinition[]) {
  return memberCoreSchema.extend({
    attributes: buildAttributesSchema(definitions),
    consent: memberConsentSchema.optional(),
  })
}
