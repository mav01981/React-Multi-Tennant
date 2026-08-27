import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from '@/features/auth/auth.store'

describe('App bootstrap splash', () => {
  beforeEach(() => {
    useAuthStore.setState({ isInitialized: false, accessToken: null })
  })

  it('shows a splash instead of blank content while auth is hydrating', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('renders the routed app once initialization settles', () => {
    useAuthStore.setState({ isInitialized: true })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    // Initialized + unauthenticated → auth guard redirects to the login screen.
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument()
  })
})
