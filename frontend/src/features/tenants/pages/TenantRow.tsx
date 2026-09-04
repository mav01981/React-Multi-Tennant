import { memo } from 'react'
import { TableRow, TableCell, Chip, IconButton } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { TenantDto } from '../tenants.types'

export interface TenantRowProps {
  /** Row data from the tenants store (referentially stable unless the row changes). */
  tenant: TenantDto
  /** Edit action; must be referentially stable (useCallback) to preserve the memo. */
  onEdit: (tenant: TenantDto) => void
  /** Suspend/reactivate action; must be referentially stable to preserve the memo. */
  onToggleStatus: (tenant: TenantDto) => void
  /** Delete action; must be referentially stable to preserve the memo. */
  onDelete: (tenant: TenantDto) => void
}

/**
 * Memoized tenant table row — the strong `memo` boundary for the superadmin view.
 * While the page re-renders on every search keystroke the table body is unchanged,
 * so a referentially-stable prop set lets React skip the rows. Keep handlers stable
 * with `useCallback` in the caller; inline arrows would defeat the memo.
 */
export const TenantRow = memo(function TenantRow({ tenant, onEdit, onToggleStatus, onDelete }: TenantRowProps) {
  return (
    <TableRow hover>
      <TableCell>{tenant.name}</TableCell>
      <TableCell>{tenant.displayName}</TableCell>
      <TableCell>{tenant.slug}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={tenant.status}
          color={tenant.status === 'active' ? 'success' : 'warning'}
          variant="outlined"
        />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <IconButton size="small" onClick={() => onEdit(tenant)} aria-label={`Edit ${tenant.slug}`}>
          <EditIcon fontSize="small" />
        </IconButton>
        <Chip
          component="button"
          size="small"
          clickable
          label={tenant.status === 'active' ? 'Suspend' : 'Reactivate'}
          color={tenant.status === 'active' ? 'warning' : 'success'}
          onClick={() => onToggleStatus(tenant)}
          sx={{ mr: 1 }}
        />
        <IconButton
          size="small"
          color="error"
          disabled={tenant.slug === 'platform'}
          onClick={() => onDelete(tenant)}
          aria-label={`Delete ${tenant.slug}`}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  )
})
