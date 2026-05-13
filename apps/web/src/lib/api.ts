import type { ApiErrorBody } from '@facecam/shared'

/**
 * In the browser, requests go to the portal's own origin and Next proxies them
 * to the API (see next.config.mjs). That keeps auth cookies first-party to the
 * portal and gives every subdomain its own cookie jar.
 *
 * On the server there is no proxy to go through, so calls hit the API directly
 * and the caller forwards the incoming request's cookies explicitly.
 */
const SERVER_BASE = process.env.API_URL ?? 'http://localhost:4000'
const isServer = typeof window === 'undefined'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** True when the failure is a field-level validation problem. */
  get isValidation(): boolean {
    return this.code === 'VALIDATION_FAILED'
  }

  /** Field errors keyed by form field name, ready to render beside inputs. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [field, messages] of Object.entries(this.details ?? {})) {
      if (messages[0]) result[field] = messages[0]
    }
    return result
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Server components pass the incoming request's cookie header through. */
  cookie?: string
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, cookie, headers, ...rest } = options
  const isFormData = body instanceof FormData
  const url = isServer ? `${SERVER_BASE}/api${path}` : `/api${path}`

  const response = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : undefined

  if (!response.ok) {
    const error = payload as ApiErrorBody | undefined
    throw new ApiError(
      response.status,
      error?.code ?? 'ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
      error?.correlationId,
    )
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}
