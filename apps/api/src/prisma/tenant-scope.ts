import { Prisma } from '@prisma/client'
import { RequestContext } from '../common/context/request-context'

/**
 * Automatic tenant scoping for every Prisma query.
 *
 * The rule this enforces: a query against a tenant-owned table must state which
 * tenant it is for. Not "should" — must. If neither a tenant context nor an
 * explicit platform scope is present, the query throws rather than running
 * unscoped. A crash is recoverable; silently returning another organization's
 * student photos is not.
 *
 * This is the primary isolation control. Row Level Security is the backstop
 * (see the rls migration). Both are required by PROJECT_DESCRIPTION.md
 * section 4.
 */

/**
 * Tenant-owned models and the column holding their tenant.
 *
 * `Tenant` itself is deliberately absent: it is the root of the hierarchy, not
 * a child of one. Anything added here is protected automatically; anything
 * forgotten here is not, so this map must be updated whenever a tenant-owned
 * model is added.
 */
export const TENANT_SCOPED_MODELS: Record<string, string> = {
  TenantBranding: 'tenantId',
  TenantSettings: 'tenantId',
  User: 'tenantId',
  AuditLog: 'tenantId',
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
        `operation that must be wrapped in RequestContext.asPlatform().`,
    )
    this.name = 'MissingTenantContextError'
  }
}

export function tenantScopeExtension() {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const field = TENANT_SCOPED_MODELS[model]

          // Not a tenant-owned model. Nothing to scope.
          if (!field) return query(args)

          // Explicit platform-level access, e.g. the super admin listing every
          // organization. Opting in is deliberate and greppable.
          if (RequestContext.isPlatformScope) return query(args)

          const tenantId = RequestContext.tenantId
          if (!tenantId) throw new MissingTenantContextError(model, operation)

          const scoped = args as Record<string, unknown>

          if (WHERE_OPERATIONS.has(operation)) {
            // Prisma 5+ accepts non-unique filters alongside a unique one, so
            // findUnique/update/delete can carry the tenant too. A row owned by
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

          return query(scoped)
        },
      },
    },
  })
}
