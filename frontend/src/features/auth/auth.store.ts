import { create } from 'zustand'
import type { LoginRequest, LoginResponse, UserDto } from './auth.types'
import { authApi } from './api'
import { ApiClientError, setAuthHandlers } from '@/shared/api/client'

const STORAGE_KEYS = {
  access: 'accessToken',
  refresh: 'refreshToken',
  tenantSlug: 'tenantSlug'
} as const

function readStoredSession(): {
  accessToken: string | null
  refreshToken: string | null
  tenantSlug: string | null
} {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null, tenantSlug: null }
  return {
    accessToken: window.localStorage.getItem(STORAGE_KEYS.access),
    refreshToken: window.localStorage.getItem(STORAGE_KEYS.refresh),
    tenantSlug: window.localStorage.getItem(STORAGE_KEYS.tenantSlug)
  }
}

interface AuthState {
  user: UserDto | null
  accessToken: string | null
  refreshToken: string | null
  /** Slug of the workspace the session belongs to (multi-tenancy). */
  tenantSlug: string | null
  isLoading: boolean
  error: string | null
  /** True once the initial boot hydration (silent re-auth) has settled. */
  isInitialized: boolean

  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
  refreshAccessToken: () => Promise<string | null>
  initialize: () => Promise<void>
  setUser: (user: UserDto | null) => void
}

const initial = readStoredSession()

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: initial.accessToken,
  refreshToken: initial.refreshToken,
  tenantSlug: initial.tenantSlug,
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

  refreshAccessToken: async () => {
    const { accessToken, refreshToken } = get()
    if (!refreshToken || !accessToken) return null
    const response: LoginResponse = await authApi.refresh({
      accessToken,
      refreshToken
    })
    setSession(set, response)
    return response.accessToken
  },

  /**
   * Boot hydration (called from main.tsx). Settles the `isInitialized` gate that
   * the App splash waits on. Because the root is mounted first, this runs without
   * ever blocking first paint. It always flips `isInitialized` — whether silent
   * re-auth succeeds, finds no stored token, or fails outright.
   */
  initialize: async () => {
    if (!get().accessToken) {
      set({ isInitialized: true })
      return
    }
    try {
      await get().fetchCurrentUser()
    } finally {
      // Settle on success AND failure so the splash never hangs the app, even if
      // /me throws in a way fetchCurrentUser did not already swallow.
      set({ isInitialized: true })
    }
  },

  setUser: (user) => set({ user })
}))

// ── Selectors (Zustand recomputed slices) ──────────────────────────────
export const selectIsAuthenticated = (s: AuthState) => !!s.accessToken
export const selectIsAdmin = (s: AuthState) => s.user?.roles.includes('Admin') ?? false
export const selectIsManager = (s: AuthState) => s.user?.roles.includes('Manager') ?? false
export const selectFullName = (s: AuthState) => (s.user ? `${s.user.firstName} ${s.user.lastName}` : '')
export const selectInitials = (s: AuthState) => (s.user ? `${s.user.firstName[0]}${s.user.lastName[0]}` : '')

// ── Session helpers + client-handler registration ──────────────────────
type SetState = (partial: Partial<AuthState>) => void

function setSession(set: SetState, response: LoginResponse, tenantSlug?: string): void {
  set({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    ...(tenantSlug !== undefined ? { tenantSlug } : {})
  })
  window.localStorage.setItem(STORAGE_KEYS.access, response.accessToken)
  window.localStorage.setItem(STORAGE_KEYS.refresh, response.refreshToken)
  // Persist the tenant slug only when provided (successful login). The refresh
  // path calls setSession without it, preserving the already-active workspace.
  if (tenantSlug !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.tenantSlug, tenantSlug)
  }
}

function clearSession(set: SetState): void {
  set({ user: null, accessToken: null, refreshToken: null })
  window.localStorage.removeItem(STORAGE_KEYS.access)
  window.localStorage.removeItem(STORAGE_KEYS.refresh)
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}

/**
 * Register handlers so the API client's interceptor can read/update session
 * state and localStorage when it performs a silent refresh (single source of
 * truth for the session lives here in the store). No circular import: the
 * client never imports this module.
 */
setAuthHandlers({
  getTokens: () => ({
    accessToken: useAuthStore.getState().accessToken,
    refreshToken: useAuthStore.getState().refreshToken
  }),
  getTenantSlug: () => useAuthStore.getState().tenantSlug,
  onSessionUpdated: (tokens) =>
    useAuthStore.setState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }),
  onSessionCleared: () => clearSession(useAuthStore.setState.bind(useAuthStore))
})
