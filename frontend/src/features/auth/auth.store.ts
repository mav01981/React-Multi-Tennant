import { create } from 'zustand'
import type { LoginRequest, LoginResponse, UserDto } from './auth.types'
import { authApi } from './api'
import { setAuthHandlers } from '@/shared/api/client'

const STORAGE_KEYS = {
  access: 'accessToken',
  refresh: 'refreshToken'
} as const

function readStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null }
  return {
    accessToken: window.localStorage.getItem(STORAGE_KEYS.access),
    refreshToken: window.localStorage.getItem(STORAGE_KEYS.refresh)
  }
}

interface AuthState {
  user: UserDto | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  error: string | null

  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
  refreshAccessToken: () => Promise<string | null>
}

const initial = readStoredTokens()

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: initial.accessToken,
  refreshToken: initial.refreshToken,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const response: LoginResponse = await authApi.login(credentials)
      setSession(set, response)
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
    } catch {
      // The interceptor already retried + cleared the session on unrecoverable
      // 401s; ensure local state is wiped so the UI shows the login screen.
      clearSession(set)
    }
  },

  refreshAccessToken: async () => {
    const { accessToken, refreshToken } = get()
    if (!refreshToken || !accessToken) return null
    const response: LoginResponse = await authApi.refresh({ accessToken, refreshToken })
    setSession(set, response)
    return response.accessToken
  }
}))

// ── Selectors (Zustand recomputed slices) ──────────────────────────────
export const selectIsAuthenticated = (s: AuthState) => !!s.accessToken
export const selectIsAdmin = (s: AuthState) => s.user?.roles.includes('Admin') ?? false
export const selectIsManager = (s: AuthState) => s.user?.roles.includes('Manager') ?? false
export const selectFullName = (s: AuthState) =>
  s.user ? `${s.user.firstName} ${s.user.lastName}` : ''
export const selectInitials = (s: AuthState) =>
  s.user ? `${s.user.firstName[0]}${s.user.lastName[0]}` : ''

// ── Session helpers + client-handler registration ──────────────────────
type SetState = (partial: Partial<AuthState>) => void

function setSession(set: SetState, response: LoginResponse): void {
  set({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user
  })
  window.localStorage.setItem(STORAGE_KEYS.access, response.accessToken)
  window.localStorage.setItem(STORAGE_KEYS.refresh, response.refreshToken)
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
  getTokens: () => ({ accessToken: useAuthStore.getState().accessToken, refreshToken: useAuthStore.getState().refreshToken }),
  onSessionUpdated: (tokens) => useAuthStore.setState({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
  onSessionCleared: () => clearSession(useAuthStore.setState.bind(useAuthStore))
})
