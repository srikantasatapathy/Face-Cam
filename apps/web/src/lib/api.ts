import type { ApiErrorBody } from '@facecam/shared'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

/**
 * Typed error carrying the API's standard envelope, so callers can branch on
 * `code` and render `details` against form fields without re-parsing anything.
 */
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
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Forwarded so server components can pass the incoming request's cookies. */
  cookie?: string
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, cookie, headers, ...rest } = options

  const isFormData = body instanceof FormData

  const response = await fetch(`${API_URL}/api${path}`, {
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
