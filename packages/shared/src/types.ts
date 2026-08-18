/** Transport-level contracts shared by the API and the web app. */

/** Standard error body returned by the API's global exception filter. */
export interface ApiErrorBody {
  statusCode: number
  code: string
  message: string
  /** Field-level validation errors, keyed by field path. */
  details?: Record<string, string[]>
  correlationId: string
  timestamp: string
  path: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationQuery {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

/** Resolved tenant context attached to every tenant-scoped request. */
export interface TenantContext {
  tenantId: string
  slug: string
  template: string
  status: string
  timezone: string
}

/** Health check payload returned by GET /health. */
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down'
  uptimeSeconds: number
  version: string
  checks: Record<string, HealthCheck>
}

export interface HealthCheck {
  status: 'up' | 'down' | 'disabled'
  latencyMs?: number
  message?: string
}
