import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequirePermission } from './PermissionRoute'
import { useAuthStore } from '@/features/auth/auth.store'
import { useRolesStore } from './roles.store'
import type { RoleDto } from '@/features/users/users.types'
import type { UserDto } from '@/features/auth/auth.types'

// Prevent the lazy role fetch in RequirePermission from hitting the network.
vi.mock('./roles.api', () => ({ rolesApi: { getAll: vi.fn().mockResolvedValue([]) } }))

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

const roleCatalog: RoleDto[] = [
  { id: 'r1', name: 'Admin', permissions: ['users.read', 'users.write', 'roles.read'] },
  { id: 'r2', name: 'ReadOnly', permissions: [] }
]

function renderGuarded(): void {
  render(
    <MemoryRouter initialEntries={['/guarded']}>
      <Routes>
        <Route path="/login" element={<div>LOGIN_MARKER</div>} />
        <Route path="/" element={<div>ROOT_MARKER</div>} />
        <Route path="/guarded" element={<RequirePermission permission="users.read" />}>
          <Route index element={<div>GUARDED_MARKER</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ user: null, accessToken: null, isLoading: false, error: null })
  useRolesStore.setState({ roles: [], isLoading: false, hasLoaded: false })
})

describe('RequirePermission', () => {
  it('bounces unauthenticated users to /login', () => {
    renderGuarded()
    expect(screen.getByText('LOGIN_MARKER')).toBeInTheDocument()
  })

  it('denies a user who lacks the required permission', () => {
    useAuthStore.setState({ user: { ...user, roles: ['ReadOnly'] }, accessToken: 'token' })
    useRolesStore.setState({ roles: roleCatalog, hasLoaded: true })
    renderGuarded()
    expect(screen.getByText('ROOT_MARKER')).toBeInTheDocument()
    expect(screen.queryByText('GUARDED_MARKER')).not.toBeInTheDocument()
  })

  it('grants access when the user holds the required permission', () => {
    useAuthStore.setState({ user, accessToken: 'token' })
    useRolesStore.setState({ roles: roleCatalog, hasLoaded: true })
    renderGuarded()
    expect(screen.getByText('GUARDED_MARKER')).toBeInTheDocument()
  })
})
