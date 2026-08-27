import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { RoleDto } from '@/features/users/users.types'
import type { UserDto } from '@/features/auth/auth.types'
import { useRolesStore, useHasPermission } from './roles.store'
import { useAuthStore } from '@/features/auth/auth.store'
import { rolesApi } from './roles.api'

vi.mock('./roles.api', () => ({
  rolesApi: { getAll: vi.fn() }
}))

const rolesApiMock = rolesApi.getAll as unknown as ReturnType<typeof vi.fn>

const roleCatalog: RoleDto[] = [
  { id: 'r1', name: 'Admin', permissions: ['users.read', 'users.write', 'users.delete', 'roles.read', 'profile.read'] },
  { id: 'r2', name: 'Manager', permissions: ['users.read', 'profile.read'] },
  { id: 'r3', name: 'User', permissions: ['profile.read'] }
]

const user: UserDto = {
  id: 'u1',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Adams',
  roles: ['Admin'],
  status: 'active',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  tenantId: '00000000-0000-0000-0000-000000000001'
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isLoading: false, error: null })
  useRolesStore.setState({ roles: [], isLoading: false, hasLoaded: false })
})

describe('roles store – lazy-once fetch', () => {
  it('loads the catalog exactly once across multiple calls', async () => {
    rolesApiMock.mockResolvedValue(roleCatalog)

    await useRolesStore.getState().fetchRoles()
    await useRolesStore.getState().fetchRoles() // guarded by hasLoaded

    const state = useRolesStore.getState()
    expect(state.roles).toEqual(roleCatalog)
    expect(state.hasLoaded).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(rolesApiMock).toHaveBeenCalledTimes(1)
  })
})

describe('useHasPermission', () => {
  it('fails closed when there is no current user', () => {
    useRolesStore.setState({ roles: roleCatalog, hasLoaded: true })
    const { result } = renderHook(() => useHasPermission('users.read'))
    expect(result.current).toBe(false)
  })

  it('denies a permission the role catalog does not grant', () => {
    useAuthStore.setState({ user: { ...user, roles: ['User'] } })
    useRolesStore.setState({ roles: roleCatalog, hasLoaded: true })

    const { result } = renderHook(() => useHasPermission('users.read'))
    expect(result.current).toBe(false)
  })

  it('grants a permission held by one of the user’s roles', () => {
    useAuthStore.setState({ user })
    useRolesStore.setState({ roles: roleCatalog, hasLoaded: true })

    const { result } = renderHook(() => useHasPermission('users.write'))
    expect(result.current).toBe(true)
  })

  it('grants a permission if any applicable role includes it', () => {
    // A Manager holds users.read via the catalog, not Admin.
    useAuthStore.setState({ user: { ...user, roles: ['Manager'] } })
    useRolesStore.setState({ roles: roleCatalog, hasLoaded: true })

    const { result } = renderHook(() => useHasPermission('users.read'))
    expect(result.current).toBe(true)
  })
})
