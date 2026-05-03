/**
 * Enums shared by the API and the web app.
 * These mirror the Prisma enums. Keep both in sync.
 */

export const TenantTemplate = {
  EDUCATION: 'education',
  CORPORATE: 'corporate',
} as const
export type TenantTemplate = (typeof TenantTemplate)[keyof typeof TenantTemplate]

export const TenantStatus = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
} as const
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus]

/** Statuses in which a tenant may still perform write operations. */
export const WRITABLE_TENANT_STATUSES: TenantStatus[] = [
  TenantStatus.TRIAL,
  TenantStatus.ACTIVE,
  TenantStatus.PAST_DUE,
]

export const UserRole = {
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  OPERATOR: 'operator',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const MemberStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
} as const
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus]

export const AttendanceDirection = {
  IN: 'in',
  OUT: 'out',
} as const
export type AttendanceDirection = (typeof AttendanceDirection)[keyof typeof AttendanceDirection]

export const AttendanceSource = {
  FACE: 'face',
  PIN: 'pin',
  MANUAL: 'manual',
} as const
export type AttendanceSource = (typeof AttendanceSource)[keyof typeof AttendanceSource]

export const AttendanceDayStatus = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  HALF_DAY: 'half_day',
  HOLIDAY: 'holiday',
  LEAVE: 'leave',
} as const
export type AttendanceDayStatus = (typeof AttendanceDayStatus)[keyof typeof AttendanceDayStatus]

export const FieldType = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  EMAIL: 'email',
  PHONE: 'phone',
  BOOLEAN: 'boolean',
} as const
export type FieldType = (typeof FieldType)[keyof typeof FieldType]

export const StorageDriver = {
  LOCAL: 'local',
  AWS: 'aws',
} as const
export type StorageDriver = (typeof StorageDriver)[keyof typeof StorageDriver]

export const AntiSpoofMode = {
  LOG: 'log',
  ENFORCE: 'enforce',
} as const
export type AntiSpoofMode = (typeof AntiSpoofMode)[keyof typeof AntiSpoofMode]

/**
 * Subdomain slugs that can never be assigned to a tenant because they collide
 * with platform routes or common infrastructure hostnames.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'smtp',
  'static',
  'assets',
  'cdn',
  'superadmin',
  'super-admin',
  'support',
  'status',
  'docs',
  'help',
  'billing',
  'auth',
  'login',
  'dashboard',
  'kiosk',
  'test',
  'staging',
  'dev',
]

export const UserStatus = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  INVITED: 'invited',
} as const
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]
