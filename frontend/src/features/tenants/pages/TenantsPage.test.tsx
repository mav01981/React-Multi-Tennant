import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TenantsPage } from './TenantsPage'
import { useTenantsStore } from '../tenants.store'

const { tenantsApiMock } = vi.hoisted(() => ({
  tenantsApiMock: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }
}))
// ../api resolves to tenants/api.ts — the module the store imports as './api'.
vi.mock('../api', () => ({ tenantsApi: tenantsApiMock }))

const { addToastMock } = vi.hoisted(() => ({ addToastMock: vi.fn() }))
vi.mock('@/shared/ui/ui.store', () => ({
  useUiStore: (selector: (s: unknown) => unknown) =>
    selector({
      themeMode: 'light' as const,
      toasts: [],
      toggleTheme: vi.fn(),
      addToast: addToastMock,
      removeToast: vi.fn()
    })
}))

const baseState = {
  items: [],
  totalCount: 0,
  selectedTenantId: null,
  filters: { search: '', page: 1, pageSize: 10 },
  isLoading: false,
  error: null
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useTenantsStore.setState(baseState)
  tenantsApiMock.getAll.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 0 })
})

describe('TenantsPage create dialog form', () => {
  it('wraps the fields in a real <form> and submits via onSubmit (Enter)', async () => {
    const created = {
      id: 't9',
      name: 'Acme',
      displayName: 'Acme Inc',
      slug: 'acme',
      status: 'active',
      createdAt: '2025-01-01T00:00:00Z'
    }
    tenantsApiMock.create.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <TenantsPage />
      </MemoryRouter>
    )
    // Flush the initial fetch effect before opening the dialog.
    await screen.findByText('No tenants found')

    fireEvent.click(screen.getByRole('button', { name: 'New Tenant' }))

    // The submit action is now a form onSubmit, not a button onClick. (MUI Dialog
    // renders through a portal into document.body, so query the document.)
    const form = document.querySelector('form')
    expect(form).toBeInTheDocument()

    // The submit button is type="submit" inside the form (Enter triggers submit).
    const submitButton = screen.getByRole('button', { name: 'Create' })
    expect(submitButton).toHaveAttribute('type', 'submit')
    expect(submitButton.closest('form')).toBe(form)

    // Order of textboxes in the dialog: Name, Display name, Slug.
    const [nameInput, displayInput, slugInput] = within(form!).getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Acme' } })
    fireEvent.change(displayInput, { target: { value: 'Acme Inc' } })
    fireEvent.change(slugInput, { target: { value: 'acme' } })

    // Clicking the type="submit" button triggers the form's onSubmit — the same
    // submission path triggered by pressing Enter inside a field.
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(tenantsApiMock.create).toHaveBeenCalledWith({
        name: 'Acme',
        displayName: 'Acme Inc',
        slug: 'acme'
      })
    })
    expect(addToastMock).toHaveBeenCalledWith('Tenant created', 'success')
  })
})
