import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'

const mockUser = {
  id: 'u1',
  email: 'admin@example.com',
  firstName: 'Ann',
  lastName: 'Adams',
  roles: ['PlatformAdmin'],
  status: 'active',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  tenantId: '00000000-0000-0000-0000-000000000000'
}

vi.mock('../auth.store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: mockUser, logout: vi.fn() }),
  selectFullName: () => 'Ann Adams',
  selectInitials: () => 'AA',
  selectIsAdmin: () => false,
  selectIsManager: () => false
}))

// Controlled permission map per test.
let permissions: string[] = []
vi.mock('@/features/roles/roles.store', () => ({
  useHasPermission: (permission: string) => permissions.includes(permission),
  // Catalog treated as already loaded so the landing page's fetch effect is a no-op.
  useRolesStore: (selector: (s: { hasLoaded: boolean; fetchRoles: () => void }) => unknown) =>
    selector({ hasLoaded: true, fetchRoles: vi.fn() })
}))

function renderLanding(): void {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  )
}

describe('LandingPage – Tenants nav visibility (feat-05 TEN-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissions = []
  })

  it('shows the Tenants button only when the user holds tenants.read', () => {
    permissions = ['tenants.read']
    renderLanding()
    expect(screen.getByRole('button', { name: 'Tenants' })).toBeInTheDocument()
  })

  it('hides the Tenants button for users without tenants.read', () => {
    permissions = ['users.read', 'roles.read'] // e.g. a tenant-local admin
    renderLanding()
    expect(screen.queryByRole('button', { name: 'Tenants' })).not.toBeInTheDocument()
    // Other nav buttons remain visible per their own permission gates.
    expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roles' })).toBeInTheDocument()
  })
})
