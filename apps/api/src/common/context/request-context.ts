import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request state carried implicitly through the call stack.
 *
 * `tenantId` is the important one: it is set once by the tenant resolution
 * middleware and read by the Prisma extension, so no query has to remember to
 * filter by tenant. See PROJECT_DESCRIPTION.md section 4.
 */
export interface RequestStore {
  correlationId: string
  tenantId?: string
  tenantSlug?: string
  userId?: string
  userRole?: string
}

const storage = new AsyncLocalStorage<RequestStore>()

export const RequestContext = {
  run<T>(store: RequestStore, callback: () => T): T {
    return storage.run(store, callback)
  },

  get(): RequestStore | undefined {
    return storage.getStore()
  },

  get correlationId(): string {
    return storage.getStore()?.correlationId ?? 'no-context'
  },

  /**
   * The tenant this request belongs to, or undefined for platform-level
   * (super admin) requests.
   */
  get tenantId(): string | undefined {
    return storage.getStore()?.tenantId
  },

  /**
   * Same as `tenantId` but throws when absent. Use inside tenant-scoped code
   * paths where a missing tenant is a programming error, never a valid state.
   */
  requireTenantId(): string {
    const tenantId = storage.getStore()?.tenantId
    if (!tenantId) {
      throw new Error('Tenant context is required here but was not set on this request')
    }
    return tenantId
  },

  get userId(): string | undefined {
    return storage.getStore()?.userId
  },

  /** Mutates the current store. Only middleware and guards should call this. */
  set(patch: Partial<RequestStore>): void {
    const store = storage.getStore()
    if (store) Object.assign(store, patch)
  },
}
