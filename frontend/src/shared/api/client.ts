import type { ApiErrorResponse, LoginResponse } from '@/features/auth/auth.types'

/**
 * Thin fetch wrapper implementing the feat-01 interceptor contract:
 *   - attaches the Bearer access token to authenticated requests
 *   - on a 401 (that isn't an auth/refresh call) triggers a single-flight
 *     refresh, then replays the original request with the new token
 *   - on refresh failure clears the session (via handler) and surfaces the error
 *
 * To avoid a circular import with the auth store, the store registers callbacks
 * here (setAuthHandlers) that the client uses to read/update session + storage.
 */

export interface AuthHandlers {
  /** In-memory access token only — the refresh token lives in an HttpOnly cookie. */
  getAccessToken: () => string | null
  /** Tenant slug of the active session; sent as X-Tenant-Id on every request. */
  getTenantSlug: () => string | null
  /** Receives the fresh access token after a successful silent refresh. */
  onSessionUpdated: (accessToken: string) => void
  onSessionCleared: () => void
}

let baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
let handlers: AuthHandlers | null = null

export function configureClient(overrideBaseUrl?: string): void {
  if (overrideBaseUrl) baseUrl = overrideBaseUrl
}

export function setAuthHandlers(h: AuthHandlers): void {
  handlers = h
}

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: ApiErrorResponse['error']['details']
  constructor(status: number, code: string, message: string, details?: ApiErrorResponse['error']['details']) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function doRefresh(): Promise<LoginResponse | null> {
  if (!handlers) return null
  try {
    // The refresh token itself rides in the HttpOnly cookie (SameSite=Strict) —
    // it is never present in JavaScript, so nothing to put in the body here.
    // credentials:'include' keeps this working if the API is ever served from a
    // different origin than the SPA (the backend CORS policy must then allow it).
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(handlers.getTenantSlug() ? { 'X-Tenant-Id': handlers.getTenantSlug()! } : {})
      }
    })
    if (!res.ok) {
      handlers.onSessionCleared()
      return null
    }
    const data = (await res.json()) as LoginResponse
    handlers.onSessionUpdated(data.accessToken)
    return data
  } catch {
    handlers.onSessionCleared()
    return null
  }
}

// Single-flight: only one refresh request in flight at a time; concurrent 401s
let refreshing: Promise<LoginResponse | null> | null = null

async function refreshOnce(): Promise<LoginResponse | null> {
  if (refreshing) return refreshing
  refreshing = doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

/**
 * Silent re-auth used by the auth store on boot: exchanges the HttpOnly refresh
 * cookie for a fresh access token. Resolves null when there is no valid session.
 */
export function refreshAccessToken(): Promise<LoginResponse | null> {
  return refreshOnce()
}

const AUTH_ENDPOINTS = new Set(['/auth/login', '/auth/refresh'])

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, ...rest } = init
  const token = handlers?.getAccessToken()
  const headers = new Headers(rest.headers)
  if (rest.body) headers.set('Content-Type', 'application/json')
  // Multi-tenancy: the workspace slug rides along on every request. After login the
  // JWT's tid claim is authoritative, but the header is what carries it pre-auth.
  // Callers may pass an explicit X-Tenant-Id (e.g. the login form's Workspace field) —
  // that wins over any stale slug left over from a previous session in the store.
  const tenantSlug = handlers?.getTenantSlug()
  if (tenantSlug && !headers.has('X-Tenant-Id')) headers.set('X-Tenant-Id', tenantSlug)
  if (auth && token) headers.set('Authorization', `Bearer ${token}`)

  const doRequest = (): Promise<Response> => fetch(`${baseUrl}${path}`, { ...rest, headers })

  let response = await doRequest()

  if (response.status === 401 && auth && !AUTH_ENDPOINTS.has(path)) {
    // Access token expired → refresh once and replay the original request.
    const refreshed = await refreshOnce()
    if (refreshed) {
      const retryHeaders = new Headers(headers)
      retryHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`)
      response = await fetch(`${baseUrl}${path}`, { ...rest, headers: retryHeaders })
    }
  }

  if (!response.ok) {
    let parsed: ApiErrorResponse | null = null
    try {
      parsed = (await response.json()) as ApiErrorResponse
    } catch {
      /* non-JSON error body */
    }
    throw new ApiClientError(
      response.status,
      parsed?.error?.code ?? 'HTTP_ERROR',
      parsed?.error?.message ?? `Request failed (${response.status})`,
      parsed?.error?.details
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
