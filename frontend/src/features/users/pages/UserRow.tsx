import { memo } from 'react'
import { TableRow, TableCell, Chip, IconButton } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { UserListItem } from '../users.types'

export interface UserRowProps {
  /** Row data from the users store (referentially stable unless the row changes). */
  user: UserListItem
  /** Whether the caller is allowed to delete (drives delete-action visibility). */
  canDelete: boolean
  /** Edit action; must be referentially stable (useCallback) to preserve the memo. */
  onEdit: (user: UserListItem) => void
  /** Delete action; must be referentially stable (useCallback) to preserve the memo. */
  onDelete: (user: UserListItem) => void
}

/**
 * Memoized user table row — the strongest `memo` boundary in this app. While the
 * page re-renders on every search keystroke, the table body does not change, so a
 * referentially-stable `user`/`canDelete`/`onEdit`/`onDelete` prop set lets React
 * skip re-rendering the rows entirely. Keep handlers stable with `useCallback`
 * (keyed by row id) in the caller; a naive inline arrow would defeat the memo.
 */
export const UserRow = memo(function UserRow({ user, canDelete, onEdit, onDelete }: UserRowProps) {
  return (
    <TableRow hover>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        {user.firstName} {user.lastName}
      </TableCell>
      <TableCell>{user.roles.join(', ') || '—'}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={user.status}
          color={user.status === 'active' ? 'success' : user.status === 'locked' ? 'warning' : 'default'}
          variant="outlined"
        />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <IconButton size="small" onClick={() => onEdit(user)} aria-label={`Edit ${user.email}`}>
          <EditIcon fontSize="small" />
        </IconButton>
        {canDelete && (
          <IconButton size="small" color="error" onClick={() => onDelete(user)} aria-label={`Delete ${user.email}`}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  )
})
