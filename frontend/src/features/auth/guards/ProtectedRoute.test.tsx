import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute, GuestOnly } from './ProtectedRoute'
import { useAuthStore } from '../auth.store'

function renderGuarded(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN_MARKER</div>} />
        <Route path="/" element={<div>ROOT_MARKER</div>} />
        <Route path="/protected" element={<ProtectedRoute />}>
          <Route index element={<div>PROTECTED_MARKER</div>} />
        </Route>
        <Route path="/guest" element={<GuestOnly />}>
          <Route index element={<div>GUEST_MARKER</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isLoading: false, error: null })
})

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    renderGuarded('/protected')
    expect(screen.getByText('LOGIN_MARKER')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED_MARKER')).not.toBeInTheDocument()
  })

  it('renders the protected outlet for an authenticated user', () => {
    useAuthStore.setState({ accessToken: 'token' })
    renderGuarded('/protected')
    expect(screen.getByText('PROTECTED_MARKER')).toBeInTheDocument()
  })
})

describe('GuestOnly', () => {
  it('renders the outlet for guests', () => {
    renderGuarded('/guest')
    expect(screen.getByText('GUEST_MARKER')).toBeInTheDocument()
  })

  it('redirects an authenticated user to the home page', () => {
    useAuthStore.setState({ accessToken: 'token' })
    renderGuarded('/guest')
    expect(screen.getByText('ROOT_MARKER')).toBeInTheDocument()
  })
})
