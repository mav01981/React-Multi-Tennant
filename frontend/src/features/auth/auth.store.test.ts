import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserDto, LoginResponse } from './auth.types'
import { ApiClientError } from '@/shared/api/client'
import {
  useAuthStore,
  selectIsAuthenticated,
  selectIsAdmin,
  selectIsManager,
  selectFullName,
  selectInitials
} from './auth.store'

// Mock the auth API module so the store does not hit the network.
const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    me: vi.fn()
  }
}))

vi.mock('./api', () => ({ authApi: authApiMock }))

const user: UserDto = {
  id: 'user-1',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Adams',
  roles: ['Admin'],
  status: 'active',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  tenantId: '00000000-0000-0000-0000-000000000001'
}

const loginResponse: LoginResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 900,
  user
}

const baseState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  error: null,
  isInitialized: false
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(baseState)
  vi.clearAllMocks()
})

describe('auth store – login', () => {
  it('sets the session and persists tokens to localStorage on success', async () => {
    authApiMock.login.mockResolvedValue(loginResponse)

    await useAuthStore.getState().login({ tenantSlug: 'acme', email: user.email, password: 'pw' })

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('access-token')
    expect(state.refreshToken).toBe('refresh-token')
    expect(state.tenantSlug).toBe('acme')
    expect(state.user).toEqual(user)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(localStorage.getItem('accessToken')).toBe('access-token')
    expect(localStorage.getItem('refreshToken')).toBe('refresh-token')
    expect(localStorage.getItem('tenantSlug')).toBe('acme')
  })

  it('records the error, re-throws, and resets loading on failure', async () => {
    const err = new Error('Invalid credentials')
    authApiMock.login.mockRejectedValue(err)

    await expect(useAuthStore.getState().login({ tenantSlug: 'acme', email: 'x', password: 'y' })).rejects.toThrow(
      'Invalid credentials'
    )

    const state = useAuthStore.getState()
    expect(state.error).toBe('Invalid credentials')
    expect(state.accessToken).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('does not persist the attempted tenant slug when login fails', async () => {
    // A previous valid workspace is restored/stored; the failed attempt must not clobber it.
    localStorage.setItem('tenantSlug', 'existing-tenant')
    useAuthStore.setState({ tenantSlug: 'existing-tenant' })
    authApiMock.login.mockRejectedValue(new Error('no such workspace'))

    await expect(useAuthStore.getState().login({ tenantSlug: 'acme', email: 'x', password: 'y' })).rejects.toThrow(
      'no such workspace'
    )

    expect(localStorage.getItem('tenantSlug')).toBe('existing-tenant')
    expect(useAuthStore.getState().tenantSlug).toBe('existing-tenant')
  })
})

describe('auth store – logout / fetchCurrentUser', () => {
  it('clears the local session even when the API call fails', async () => {
    useAuthStore.setState({ user, accessToken: 'at', refreshToken: 'rt' })
    localStorage.setItem('accessToken', 'at')
    localStorage.setItem('refreshToken', 'rt')
    authApiMock.logout.mockRejectedValue(new Error('network down'))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
  })

  it('skips fetchCurrentUser when there is no access token', async () => {
    await useAuthStore.getState().fetchCurrentUser()
    expect(authApiMock.me).not.toHaveBeenCalled()
  })

  it('populates the user from /me', async () => {
    useAuthStore.setState({ accessToken: 'at' })
    authApiMock.me.mockResolvedValue(user)

    await useAuthStore.getState().fetchCurrentUser()
    expect(useAuthStore.getState().user).toEqual(user)
  })

  it('clears the session when /me fails with a 401', async () => {
    useAuthStore.setState({ accessToken: 'at', refreshToken: 'rt', user })
    localStorage.setItem('accessToken', 'at')
    localStorage.setItem('refreshToken', 'rt')
    authApiMock.me.mockRejectedValue(new ApiClientError(401, 'UNAUTHENTICATED', 'expired'))

    await expect(useAuthStore.getState().fetchCurrentUser()).rejects.toThrow(ApiClientError)

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('auth store – initialize (silent re-auth on boot)', () => {
  it('marks initialized immediately when there is no stored token', async () => {
    useAuthStore.setState({ accessToken: null, isInitialized: false })

    await useAuthStore.getState().initialize()

    expect(authApiMock.me).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isInitialized).toBe(true)
  })

  it('hydrates the user and marks initialized when a token is restored', async () => {
    useAuthStore.setState({ accessToken: 'at', isInitialized: false })
    authApiMock.me.mockResolvedValue(user)

    await useAuthStore.getState().initialize()

    expect(authApiMock.me).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(useAuthStore.getState().isInitialized).toBe(true)
  })

  it('clears the session yet still marks initialized when /me fails', async () => {
    useAuthStore.setState({ accessToken: 'at', refreshToken: 'rt', user, isInitialized: false })
    localStorage.setItem('accessToken', 'at')
    localStorage.setItem('refreshToken', 'rt')
    authApiMock.me.mockRejectedValue(new ApiClientError(401, 'UNAUTHENTICATED', 'expired'))

    await expect(useAuthStore.getState().initialize()).rejects.toThrow(ApiClientError)

    expect(authApiMock.me).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    // The splash must never be left hanging — even a failed /me settles the gate.
    expect(useAuthStore.getState().isInitialized).toBe(true)
  })
})

describe('auth store – setUser action', () => {
  it('swaps the authenticated user', () => {
    useAuthStore.getState().setUser(user)
    expect(useAuthStore.getState().user).toEqual(user)
  })

  it('accepts null to clear the user', () => {
    useAuthStore.setState({ user })
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('auth store selectors', () => {
  it('selectIsAuthenticated reflects the presence of an access token', () => {
    const S = {} as Parameters<typeof selectIsAuthenticated>[0]
    expect(selectIsAuthenticated({ ...S, accessToken: 'at' })).toBe(true)
    expect(selectIsAuthenticated({ ...S, accessToken: null })).toBe(false)
  })

  it('selectIsAdmin / selectIsManager look up the user roles', () => {
    const state = useAuthStore.getState()
    expect(selectIsAdmin(state)).toBe(false)
    expect(selectIsManager(state)).toBe(false)

    useAuthStore.setState({ user })
    expect(selectIsAdmin(useAuthStore.getState())).toBe(true)
    expect(selectIsManager(useAuthStore.getState())).toBe(false)

    useAuthStore.setState({ user: { ...user, roles: ['Manager'] } })
    expect(selectIsManager(useAuthStore.getState())).toBe(true)
  })

  it('composes display values for the landing header', () => {
    useAuthStore.setState({ user })
    expect(selectFullName(useAuthStore.getState())).toBe('Ann Adams')
    expect(selectInitials(useAuthStore.getState())).toBe('AA')

    useAuthStore.setState({ user: null })
    expect(selectFullName(useAuthStore.getState())).toBe('')
    expect(selectInitials(useAuthStore.getState())).toBe('')
  })
})
