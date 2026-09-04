import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, TableBody } from '@mui/material'
import { TenantRow } from './TenantRow'
import type { TenantDto } from '../tenants.types'

const tenant: TenantDto = {
  id: 't9',
  name: 'Acme',
  displayName: 'Acme Inc',
  slug: 'acme',
  status: 'active',
  createdAt: '2025-01-01T00:00:00Z'
}

const platform: TenantDto = { ...tenant, id: 't0', name: 'Platform', displayName: 'Platform', slug: 'platform' }

// MUI table cells only render correctly inside a Table context.
function renderRow(overrides: Partial<React.ComponentProps<typeof TenantRow>> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onToggleStatus: vi.fn(),
    onDelete: vi.fn()
  }
  const props = { tenant, ...handlers, ...overrides }
  render(
    <Table>
      <TableBody>
        <TenantRow {...props} />
      </TableBody>
    </Table>
  )
  return handlers
}

describe('TenantRow', () => {
  it('renders name, display name, slug and status', () => {
    renderRow()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Acme Inc')).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('calls onEdit with the row tenant when edit is clicked', () => {
    const { onEdit } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Edit acme' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(tenant)
  })

  it('labels active tenants Suspend and calls onToggleStatus with the tenant', () => {
    const { onToggleStatus } = renderRow()
    const toggle = screen.getByRole('button', { name: 'Suspend' })
    expect(toggle).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(onToggleStatus).toHaveBeenCalledTimes(1)
    expect(onToggleStatus).toHaveBeenCalledWith(tenant)
  })

  it('calls onDelete with the row tenant (unless disabled for platform)', () => {
    const { onDelete } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Delete acme' }))
    expect(onDelete).toHaveBeenCalledWith(tenant)
  })

  it('disables delete for the reserved platform tenant', () => {
    const { onDelete } = renderRow({ tenant: platform })
    const del = screen.getByRole('button', { name: 'Delete platform' })
    expect(del).toBeDisabled()
    fireEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
  })
})
