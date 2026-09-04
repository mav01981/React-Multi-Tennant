import { create } from 'zustand'
import type { LoginRequest, LoginResponse, UserDto } from './auth.types'
import { authApi } from './api'
import { ApiClientError, refreshAccessToken, setAuthHandlers } from '@/shared/api/client'
import { ROLE } from '@/features/roles/permissions'

// Only non-secret values may live in localStorage: the tenant slug (a workspace
// name, not a credential) and a boolean hint that a session may exist, so boot
// skips a pointless refresh round-trip for logged-out visitors. Tokens never do:
// the access token lives in memory only, the refresh token in an HttpOnly cookie.
const STORAGE_KEYS = {
  tenantSlug: 'tenantSlug',
  hasSession: 'hasSession'
} as const

function readStoredTenantSlug(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEYS.tenantSlug)
}

function hasSessionHint(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEYS.hasSession) === '1'
}

function setSessionHint(present: boolean): void {
  if (typeof window === 'undefined') return
  if (present) window.localStorage.setItem(STORAGE_KEYS.hasSession, '1')
  else window.localStorage.removeItem(STORAGE_KEYS.hasSession)
}

interface AuthState {
  user: UserDto | null
  accessToken: string | null
  /** Slug of the workspace the session belongs to (multi-tenancy). */
  tenantSlug: string | null
  isLoading: boolean
  error: string | null
  /** True once the initial boot hydration (silent re-auth) has settled. */
  isInitialized: boolean

  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
  initialize: () => Promise<void>
  setUser: (user: UserDto | null) => void
}

const initialTenantSlug = readStoredTenantSlug()

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  tenantSlug: initialTenantSlug,
  isLoading: false,
  error: null,
  isInitialized: false,

  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const response: LoginResponse = await authApi.login(credentials)
      // Persist the tenant slug only on success (setSession), so a failed login
      // never leaks the attempted workspace into state or localStorage.
      setSession(set, response, credentials.tenantSlug)
    } catch (err) {
      set({ error: extractError(err) })
      throw err
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      /* clear session locally even if the network call fails (feat-01 §3.4) */
    }
    clearSession(set)
  },

  fetchCurrentUser: async () => {
    if (!get().accessToken) return
    try {
      const user = await authApi.me()
      set({ user })
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        clearSession(set)
      }
      throw err
    }
  },

  /**
   * Boot hydration (called from main.tsx). Settles the `isInitialized` gate that
   * the App splash waits on. Because the root is mounted first, this runs without
   * ever blocking first paint. It always flips `isInitialized` — whether silent
   * re-auth succeeds, finds no session hint, or fails outright.
   *
   * Silent re-auth: with no in-memory access token, the HttpOnly refresh cookie
   * is exchanged for a fresh access token (+ user) via POST /auth/refresh.
   */
  initialize: async () => {
    try {
      if (get().accessToken) {
        await get().fetchCurrentUser()
      } else if (hasSessionHint()) {
        const session = await refreshAccessToken()
        if (session) {
          set({ accessToken: session.accessToken, user: session.user })
        }
        // A null result already cleared the session (incl. the hint) via the
        // client's onSessionCleared handler.
      }
    } finally {
      // Settle on success AND failure so the splash never hangs the app.
      set({ isInitialized: true })
    }
  },

  setUser: (user) => set({ user })
}))

// ── Selectors (Zustand recomputed slices) ──────────────────────────────
export const selectIsAuthenticated = (s: AuthState) => !!s.accessToken
export const selectIsAdmin = (s: AuthState) => s.user?.roles.includes(ROLE.ADMIN) ?? false
export const selectIsManager = (s: AuthState) => s.user?.roles.includes(ROLE.MANAGER) ?? false
export const selectFullName = (s: AuthState) => (s.user ? `${s.user.firstName} ${s.user.lastName}` : '')
export const selectInitials = (s: AuthState) => (s.user ? `${s.user.firstName[0]}${s.user.lastName[0]}` : '')

// ── Session helpers + client-handler registration ──────────────────────
type SetState = (partial: Partial<AuthState>) => void

function setSession(set: SetState, response: LoginResponse, tenantSlug?: string): void {
  // Access token lives in memory only. The refresh token was delivered by the
  // server as an HttpOnly cookie — it never reaches this code.
  set({
    accessToken: response.accessToken,
    user: response.user,
    ...(tenantSlug !== undefined ? { tenantSlug } : {})
  })
  setSessionHint(true)
  // Persist the tenant slug only when provided (successful login). The refresh
  // path calls setSession without it, preserving the already-active workspace.
  if (tenantSlug !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.tenantSlug, tenantSlug)
  }
}

function clearSession(set: SetState): void {
  set({ user: null, accessToken: null })
  setSessionHint(false)
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}

/**
 * Register handlers so the API client's interceptor can read/update session
 * state when it performs a silent refresh (single source of truth for the
 * session lives here in the store). No circular import: the client never
 * imports this module.
 * NOTE: there is deliberately no store-level `refreshAccessToken()` action.
 * Token refresh lives entirely in the API client's silent-refresh interceptor
 * (`shared/api/client.ts` → `doRefresh`/`refreshOnce`), which reads the access
 * token via the `setAuthHandlers` callbacks and writes rotated tokens back
 * through `onSessionUpdated`. The refresh token itself is an HttpOnly cookie:
 * the browser attaches it to /auth/refresh automatically and no script can
 * read or set it.
 */
setAuthHandlers({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getTenantSlug: () => useAuthStore.getState().tenantSlug,
  onSessionUpdated: (accessToken) => {
    setSessionHint(true)
    useAuthStore.setState({ accessToken })
  },
  onSessionCleared: () => clearSession(useAuthStore.setState.bind(useAuthStore))
})
