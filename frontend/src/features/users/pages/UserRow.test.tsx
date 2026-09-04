import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, TableBody } from '@mui/material'
import { UserRow } from './UserRow'
import type { UserListItem } from '../users.types'

const user: UserListItem = {
  id: 'u1',
  email: 'alice@acme.com',
  firstName: 'Alice',
  lastName: 'Adams',
  roles: ['Admin'],
  status: 'active',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  tenantId: 't1'
}

// MUI table cells only render correctly inside a Table context.
function renderRow(overrides: Partial<React.ComponentProps<typeof UserRow>> = {}) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn() }
  const props = { user, canDelete: true, ...handlers, ...overrides }
  render(
    <Table>
      <TableBody>
        <UserRow {...props} />
      </TableBody>
    </Table>
  )
  return handlers
}

describe('UserRow', () => {
  it('renders email, name, roles and status', () => {
    renderRow()
    expect(screen.getByText('alice@acme.com')).toBeInTheDocument()
    expect(screen.getByText('Alice Adams')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('calls onEdit with the row user when the edit button is clicked', () => {
    const { onEdit } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Edit alice@acme.com' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(user)
  })

  it('shows the delete button and calls onDelete with the row user when canDelete', () => {
    const { onDelete } = renderRow({ canDelete: true })
    fireEvent.click(screen.getByRole('button', { name: 'Delete alice@acme.com' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(user)
  })

  it('hides the delete button when canDelete is false', () => {
    renderRow({ canDelete: false })
    expect(screen.queryByRole('button', { name: 'Delete alice@acme.com' })).not.toBeInTheDocument()
  })
})
