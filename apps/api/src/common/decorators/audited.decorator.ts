import { SetMetadata } from '@nestjs/common'

export interface AuditSpec {
  action: string
  entity: string
}

export const AUDIT_SPEC = 'auditSpec'

/**
 * Records this route's successful invocations in `audit_logs`.
 *
 * Applied per route rather than to every mutation, so the log stays a record of
 * consequential administrative actions instead of a firehose nobody reads.
 */
export const Audited = (action: string, entity: string) =>
  SetMetadata(AUDIT_SPEC, { action, entity } satisfies AuditSpec)
