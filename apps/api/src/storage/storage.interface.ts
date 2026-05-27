/**
 * One interface, two backends, chosen by the `FILE_UPLOAD` environment
 * variable. Switching between local disk and S3 is a config change, never a
 * code change. See PROJECT_DESCRIPTION.md section 8.
 */

export interface StoredObject {
  key: string
  size: number
  contentType: string
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE')

export interface StorageService {
  /** Writes an object, overwriting any existing one at the same key. */
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>

  get(key: string): Promise<Buffer>

  exists(key: string): Promise<boolean>

  delete(key: string): Promise<void>

  /** Removes every object under a prefix, used when erasing a member or tenant. */
  deletePrefix(prefix: string): Promise<number>

  /**
   * A time-limited URL for reading the object.
   *
   * The local driver returns a signed API path rather than a direct file URL,
   * because face images must never be reachable from a public static mount.
   */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>

  /** Reported by the health check so a misconfigured bucket surfaces early. */
  describe(): { driver: string; location: string }
}

export const StorageKind = {
  /** Enrolment photos. Retained for the life of the member record. */
  ENROLMENT: 'enrolment',
  /** Attendance snapshots. Deleted on a rolling window by the retention job. */
  SNAPSHOT: 'snapshot',
  /** Tenant logos and other branding assets. Not personal data. */
  BRANDING: 'branding',
} as const
export type StorageKind = (typeof StorageKind)[keyof typeof StorageKind]

/**
 * Builds the object key.
 *
 * Sharded by tenant, kind and month so that a member erasure, a tenant
 * deletion, and the nightly snapshot retention job are all prefix operations
 * rather than full scans. Filenames are UUIDs: client-supplied names are never
 * trusted, and a predictable key would make one person's face image guessable
 * from another's.
 */
export function buildStorageKey(input: {
  tenantId: string
  kind: StorageKind
  id: string
  extension?: string
  at?: Date
}): string {
  const at = input.at ?? new Date()
  const year = at.getUTCFullYear()
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  const extension = (input.extension ?? 'jpg').replace(/^\./, '')

  return `tenants/${input.tenantId}/${input.kind}/${year}/${month}/${input.id}.${extension}`
}

/** Prefix covering every object belonging to a member, for erasure. */
export function memberPrefix(tenantId: string): string {
  return `tenants/${tenantId}/`
}
