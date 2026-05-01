import { z } from 'zod'
import { RESERVED_SLUGS, TenantStatus, TenantTemplate } from './enums'
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN } from './slug'

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH, `Must be at least ${SLUG_MIN_LENGTH} characters`)
  .max(SLUG_MAX_LENGTH, `Must be at most ${SLUG_MAX_LENGTH} characters`)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and hyphens only')
  .refine((value) => !RESERVED_SLUGS.includes(value), 'This address is reserved')

/**
 * Creating an organization also creates its first administrator. A tenant with
 * no way to sign in is not a usable state, so the two are one operation.
 */
export const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Enter the organization name').max(200),
  /** Derived from the name when omitted. Frozen once issued. */
  slug: slugField.optional(),
  template: z.enum([TenantTemplate.EDUCATION, TenantTemplate.CORPORATE]),
  timezone: z.string().trim().min(1).default('Asia/Kolkata'),
  billingEmail: z.string().trim().toLowerCase().email().optional(),
  plan: z.string().trim().max(50).optional(),
  validUntil: z.string().datetime().optional(),

  adminFullName: z.string().trim().min(2, "Enter the administrator's name").max(200),
  adminEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  adminPassword: z.string().min(12, 'Use at least 12 characters').max(200),
})

export type CreateTenantInput = z.infer<typeof createTenantSchema>

/** `slug` and `template` are absent on purpose: both are frozen after creation. */
export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  timezone: z.string().trim().min(1).optional(),
  billingEmail: z.string().trim().toLowerCase().email().nullable().optional(),
  plan: z.string().trim().max(50).nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
})

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>

export const suspendTenantSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason, it is shown in the audit log').max(500),
})

export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>

export const listTenantsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().optional(),
  status: z
    .enum([
      TenantStatus.TRIAL,
      TenantStatus.ACTIVE,
      TenantStatus.PAST_DUE,
      TenantStatus.SUSPENDED,
      TenantStatus.CANCELLED,
    ])
    .optional(),
})

export type ListTenantsQuery = z.infer<typeof listTenantsSchema>

export interface TenantBrandingDto {
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  accentColor: string
  fontFamily: string | null
  customBrandingEnabled: boolean
}

export interface TenantSummary {
  id: string
  name: string
  slug: string
  template: TenantTemplate
  status: TenantStatus
  plan: string | null
  validUntil: string | null
  createdAt: string
  userCount: number
}

export interface TenantDetail extends TenantSummary {
  timezone: string
  billingEmail: string | null
  suspendedAt: string | null
  suspendedReason: string | null
  branding: TenantBrandingDto
  /** True once a CompreFace collection has been provisioned for this tenant. */
  faceEngineReady: boolean
}

/**
 * The unauthenticated view of a tenant, used to brand the login screen before
 * anyone has signed in. Contains only what is needed to render that page.
 */
export interface PublicTenantProfile {
  id: string
  slug: string
  name: string
  template: TenantTemplate
  status: TenantStatus
  logoUrl: string | null
  branding: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
    fontFamily: string | null
  }
}
