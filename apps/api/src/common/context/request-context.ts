import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request state carried implicitly through the call stack.
 *
 * `tenantId` is the important one: it is set once by the auth guard from the
 * JWT's claims and read by the Prisma extension, so no query has to remember to
 * filter by tenant. See PROJECT_DESCRIPTION.md section 4.
 */
export interface RequestStore {
  correlationId: string
  tenantId?: string
  tenantSlug?: string
  userId?: string
  userRole?: string
  /**
   * Set only inside `asPlatform`. Allows a query to run across every tenant,
   * which is legitimate for the super admin console and illegitimate everywhere
   * else. Never set this from request data.
   */
  platformScope?: boolean
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

  get tenantSlug(): string | undefined {
    return storage.getStore()?.tenantSlug
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

  get userRole(): string | undefined {
    return storage.getStore()?.userRole
  },

  get isPlatformScope(): boolean {
    return storage.getStore()?.platformScope === true
  },

  /**
   * Runs `callback` with tenant scoping lifted, so queries span every tenant.
   *
   * Only super admin code paths may use this, and every call site should be
   * obvious on sight. If you are reaching for this inside a tenant feature, the
   * design is wrong.
   *
   * The flag is restored afterwards, including when the callback throws, so a
   * failed platform query cannot leave the rest of the request unscoped.
   */
  async asPlatform<T>(callback: () => Promise<T>): Promise<T> {
    const store = storage.getStore()
    if (!store) {
      throw new Error('asPlatform called outside of a request context')
    }

    const previous = store.platformScope
    store.platformScope = true
    try {
      return await callback()
    } finally {
      store.platformScope = previous
    }
  },

  /** Mutates the current store. Only middleware and guards should call this. */
  set(patch: Partial<RequestStore>): void {
    const store = storage.getStore()
    if (store) Object.assign(store, patch)
  },
}
