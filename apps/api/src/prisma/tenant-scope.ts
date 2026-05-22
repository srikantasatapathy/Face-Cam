import { Prisma, PrismaClient } from '@prisma/client'
import { RequestContext } from '../common/context/request-context'

/**
 * Tenant isolation, enforced twice.
 *
 * Layer 1, here: every query against a tenant-owned model gets a `tenantId`
 * filter injected. A query with no tenant in context throws rather than running
 * unscoped.
 *
 * Layer 2, in Postgres: this extension runs each query inside a transaction
 * that sets `app.tenant_id`, which the Row Level Security policies read. The
 * client this extension is attached to connects as `facecam_app`, a non-owner,
 * non-superuser role, so the policies genuinely bind it. If layer 1 were
 * removed entirely, the database would still refuse to return another tenant's
 * rows. There is a test that proves exactly that.
 *
 * See PROJECT_DESCRIPTION.md section 4.
 */

/**
 * Tenant-owned models and the column holding their tenant.
 *
 * `Tenant` is deliberately absent: it is the root of the hierarchy, not a child
 * of one. A guard test fails the build if a model with a `tenantId` column is
 * missing from this map, because such a model would be queried unscoped.
 */
export const TENANT_SCOPED_MODELS: Record<string, string> = {
  TenantBranding: 'tenantId',
  TenantSettings: 'tenantId',
  User: 'tenantId',
  AuditLog: 'tenantId',
  Member: 'tenantId',
  MemberFieldDefinition: 'tenantId',
  FaceTemplate: 'tenantId',
}

/** Operations whose `where` clause identifies the rows being read or changed. */
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
])

/** Operations that write new rows and therefore need the tenant stamped on. */
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'upsert'])

export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Refusing to run ${model}.${operation} without a tenant context. ` +
        `Either the request is missing tenant resolution, or this is a platform-level ` +
        `operation, which must use the superuser client rather than prisma.db.`,
    )
    this.name = 'MissingTenantContextError'
  }
}

export class PlatformScopeOnAppClientError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} was called under asPlatform() on the tenant-scoped client. ` +
        `That client is bound by Row Level Security and would silently return nothing. ` +
        `Use the superuser client (prisma.<model>) for platform-level queries.`,
    )
    this.name = 'PlatformScopeOnAppClientError'
  }
}

/** `MemberFieldDefinition` -> `memberFieldDefinition`, Prisma's delegate key. */
function delegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

export function tenantScopeExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const field = TENANT_SCOPED_MODELS[model]

          // Not a tenant-owned model. Nothing to scope, and no RLS policy.
          if (!field) return query(args)

          // Platform-wide reads must not come through this client: it is bound
          // by RLS and would return an empty result rather than an error, which
          // is the most confusing possible failure.
          if (RequestContext.isPlatformScope) {
            throw new PlatformScopeOnAppClientError(model, operation)
          }

          const tenantId = RequestContext.tenantId
          if (!tenantId) throw new MissingTenantContextError(model, operation)

          const scoped = args as Record<string, unknown>

          if (WHERE_OPERATIONS.has(operation)) {
            // Prisma 5+ accepts non-unique filters alongside a unique one, so
            // findUnique/update/delete carry the tenant too. A row owned by
            // another tenant then reads as "not found" rather than "forbidden",
            // which is what we want: 403 would confirm the record exists.
            scoped.where = { ...((scoped.where as object) ?? {}), [field]: tenantId }
          }

          if (CREATE_OPERATIONS.has(operation)) {
            if (operation === 'upsert') {
              scoped.where = { ...((scoped.where as object) ?? {}), [field]: tenantId }
              scoped.create = { ...((scoped.create as object) ?? {}), [field]: tenantId }
            } else if (Array.isArray(scoped.data)) {
              scoped.data = (scoped.data as Record<string, unknown>[]).map((row) => ({
                ...row,
                [field]: tenantId,
              }))
            } else {
              scoped.data = { ...((scoped.data as object) ?? {}), [field]: tenantId }
            }
          }

          const delegate = (base as unknown as Record<string, Record<string, unknown>>)[
            delegateKey(model)
          ]
          const call = delegate?.[operation] as
            ((input: unknown) => Prisma.PrismaPromise<unknown>) | undefined

          // Operations without a delegate equivalent still run, just without the
          // RLS session variable. Layer 1 has already scoped them.
          if (typeof call !== 'function') return query(scoped)

          // `set_config(..., true)` is transaction-local, which is essential:
          // connections are pooled and shared between requests, so a
          // session-level value would leak one tenant's scope into another
          // request. The array form of $transaction keeps this to a single
          // round trip.
          const [, result] = await base.$transaction([
            base.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`,
            call.call(delegate, scoped),
          ])

          return result
        },
      },
    },
  })
}
