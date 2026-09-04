import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { useAuthStore } from '../auth.store'
import { ERROR_CODE } from '../auth.types'
import { ApiClientError } from '@/shared/api/client'

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: { login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), me: vi.fn() }
}))
vi.mock('../api', () => ({ authApi: authApiMock }))

const loginUser = {
  id: 'u1',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Adams',
  roles: ['User'],
  status: 'active',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  tenantId: '00000000-0000-0000-0000-000000000001'
}

function renderLogin(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>HOME_MARKER</div>} />
      </Routes>
    </MemoryRouter>
  )
}

async function submitCredentials(email: string, password: string): Promise<void> {
  const user = userEvent.setup()
  // MUI appends a required '*' to the label text, so match loosely.
  await user.type(screen.getByLabelText(/email/i), email)
  await user.type(screen.getByLabelText(/password/i), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  localStorage.clear()
  authApiMock.login.mockReset()
  useAuthStore.setState({ user: null, accessToken: null, isLoading: false, error: null })
})

describe('LoginPage', () => {
  it('renders the sign-in form', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('navigates home and records the session after a successful login', async () => {
    authApiMock.login.mockResolvedValue({
      accessToken: 'access-token',
      expiresIn: 900,
      user: loginUser
    })

    renderLogin()
    await submitCredentials('ann@example.com', 'pw')

    expect(await screen.findByText('HOME_MARKER')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('access-token')
    expect(authApiMock.login).toHaveBeenCalledWith({ tenantSlug: 'acme', email: 'ann@example.com', password: 'pw' })
  })

  it('shows a friendly message for invalid credentials', async () => {
    authApiMock.login.mockRejectedValue(new ApiClientError(401, ERROR_CODE.INVALID_CREDENTIALS, 'Invalid credentials'))

    renderLogin()
    await submitCredentials('ann@example.com', 'wrong')

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
  })

  it('shows a lockout message for a locked account', async () => {
    authApiMock.login.mockRejectedValue(new ApiClientError(423, ERROR_CODE.ACCOUNT_LOCKED, 'Account locked'))

    renderLogin()
    await submitCredentials('ann@example.com', 'pw')

    expect(await screen.findByText('Account is locked. Contact support.')).toBeInTheDocument()
  })

  it('redirects an already authenticated user to the landing page', () => {
    useAuthStore.setState({ accessToken: 'existing' })
    renderLogin()
    expect(screen.getByText('HOME_MARKER')).toBeInTheDocument()
  })
})
