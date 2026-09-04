import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useUsersStore } from '../users.store'
import type { CreateUserRequest, UpdateUserRequest } from '../users.types'
import { UserRow } from './UserRow'
import { useUiStore } from '@/shared/ui/ui.store'
import { useRolesStore, useHasPermission } from '@/features/roles/roles.store'
import { useTenantsStore } from '@/features/tenants/tenants.store'
import type { RoleName } from '@/features/roles/permissions'
import { useEntityEditorState } from '@/shared/hooks/useEntityEditor'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'

type UserForm = CreateUserRequest & { status: 'active' | 'locked' | 'disabled' }

const EMPTY_FORM: UserForm = { email: '', firstName: '', lastName: '', password: '', roles: [], status: 'active' }

export function UsersPage(): React.JSX.Element {
  // Single data slice + single actions slice (both with shallow equality) instead
  // of ~15 granular subscriptions, so a store change runs two selector comparisons
  // rather than many. Data fields and the action references are stable/hashable,
  // keeping re-renders correct while trimming the subscription overhead.
  const { items, isLoading, totalCount, error, filters } = useUsersStore(
    useShallow((s) => ({
      items: s.items,
      isLoading: s.isLoading,
      totalCount: s.totalCount,
      error: s.error,
      filters: s.filters
    }))
  )
  const {
    fetchList: fetchUsers,
    setPage,
    setSearch,
    setFilters,
    createItem: createUser,
    updateItem: updateUser,
    deleteItem: deleteUser
  } = useUsersStore(
    useShallow((s) => ({
      fetchList: s.fetchList,
      setPage: s.setPage,
      setSearch: s.setSearch,
      setFilters: s.setFilters,
      createItem: s.createItem,
      updateItem: s.updateItem,
      deleteItem: s.deleteItem
    }))
  )
  const addToast = useUiStore((s) => s.addToast)

  const [searchInput, setSearchInput] = useState(filters.search)
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const roleDtos = useRolesStore((s) => s.roles)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  const roles = roleDtos.map((role) => role.name)
  const canDelete = useHasPermission('users.delete')
  // Cross-tenant creation: `tenants.read` is granted exclusively to PlatformAdmin.
  const canCrossTenant = useHasPermission('tenants.read')
  const tenantItems = useTenantsStore((s) => s.items)
  const fetchTenants = useTenantsStore((s) => s.fetchList)
  const [tenantSlug, setTenantSlug] = useState('')
  const {
    state: { showCreate, editingId, form, deleteTarget, deleteError },
    openCreate,
    startEdit,
    resetForm,
    updateForm,
    openDelete,
    closeDelete,
    setDeleteError
  } = useEntityEditorState<(typeof items)[number], UserForm>(EMPTY_FORM)
  // Derived pagination (matches the store's selectTotalPages/selectHasNextPage/selectHasPrevPage).
  const totalPages = Math.ceil(totalCount / filters.pageSize)
  const hasNextPage = filters.page < totalPages
  const hasPrevPage = filters.page > 1

  useEffect(() => {
    fetchUsers()
    void fetchRoles() // lazy-cached once (hasLoaded guard) in the roles store
  }, [fetchUsers, fetchRoles])

  // PlatformAdmins need the workspace list for the create-form tenant picker.
  useEffect(() => {
    if (canCrossTenant) void fetchTenants()
  }, [canCrossTenant, fetchTenants])

  useEffect(() => {
    if (debouncedSearch !== filters.search) setSearch(debouncedSearch)
  }, [debouncedSearch, filters.search, setSearch])

  // Referentially stable (useCallback) so the memoized UserRow can skip re-rendering:
  // this handler closes over the page's editor actions but never the row data itself.
  const startEditUser = useCallback(
    (user: (typeof items)[number]) => {
      startEdit(user.id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        password: '',
        roles: user.roles,
        status: user.status
      })
    },
    [startEdit]
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      if (editingId) {
        const update: UpdateUserRequest = {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          roles: form.roles,
          status: form.status
        }
        await updateUser(editingId, update)
        addToast('User updated', 'success')
      } else {
        await createUser({
          ...form,
          // Only sent for PlatformAdmins who picked a workspace in the create form.
          tenantSlug: canCrossTenant && tenantSlug ? tenantSlug : undefined
        })
        addToast('User created', 'success')
        setTenantSlug('')
      }
      resetForm()
    } catch {
      // The store exposes the API error above the table.
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteUser(deleteTarget.id)
      addToast('User deleted', 'success')
      closeDelete()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        User Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search users..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => {
              setSearchInput('')
              setSearch('')
            }}
          >
            Clear
          </Button>
          <Button variant="contained" color="success" onClick={openCreate}>
            New user
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {canCrossTenant && (
            <TextField
              select
              size="small"
              label="Workspace"
              value={filters.tenantSlug ?? ''}
              onChange={(e) => setFilters({ tenantSlug: e.target.value || null })}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">Your workspace</MenuItem>
              {tenantItems.map((tenant) => (
                <MenuItem key={tenant.id} value={tenant.slug}>
                  {tenant.displayName} ({tenant.slug})
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            label="Role"
            value={filters.role ?? ''}
            onChange={(e) => setFilters({ role: (e.target.value || null) as RoleName | null })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All roles</MenuItem>
            {roles.map((role) => (
              <MenuItem key={role} value={role}>
                {role}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="locked">Locked</MenuItem>
            <MenuItem value="disabled">Disabled</MenuItem>
          </TextField>
        </Box>
      </Paper>

      {(showCreate || editingId) && (
        <Paper elevation={2} sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            {editingId ? 'Edit user' : 'Create user'}
          </Typography>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
          >
            <TextField
              required
              type="email"
              label="Email"
              value={form.email}
              onChange={(e) => updateForm({ email: e.target.value })}
            />
            <TextField
              required
              label="First name"
              value={form.firstName}
              onChange={(e) => updateForm({ firstName: e.target.value })}
            />
            <TextField
              required
              label="Last name"
              value={form.lastName}
              onChange={(e) => updateForm({ lastName: e.target.value })}
            />
            {!editingId && (
              <TextField
                required
                type="password"
                label="Password"
                value={form.password}
                onChange={(e) => updateForm({ password: e.target.value })}
              />
            )}
            {!editingId && canCrossTenant && (
              <TextField
                select
                label="Workspace"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                helperText="Defaults to your own workspace."
              >
                <MenuItem value="">Your workspace</MenuItem>
                {tenantItems.map((tenant) => (
                  <MenuItem key={tenant.id} value={tenant.slug}>
                    {tenant.displayName} ({tenant.slug})
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select
              label="Role"
              value={form.roles[0] ?? ''}
              onChange={(e) => updateForm({ roles: e.target.value ? [e.target.value as RoleName] : [] })}
            >
              <MenuItem value="">No role</MenuItem>
              {roles.map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </TextField>
            {editingId && (
              <TextField
                select
                label="Status"
                value={form.status}
                onChange={(e) => updateForm({ status: e.target.value as UserForm['status'] })}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="locked">Locked</MenuItem>
                <MenuItem value="disabled">Disabled</MenuItem>
              </TextField>
            )}
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 1, mt: 1 }}>
              <Button type="submit" variant="contained">
                {editingId ? 'Save changes' : 'Create user'}
              </Button>
              <Button type="button" variant="outlined" color="inherit" onClick={resetForm}>
                Cancel
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Typography>No users found</Typography>
      ) : (
        <Paper elevation={1}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Roles</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    canDelete={canDelete}
                    onEdit={startEditUser}
                    onDelete={openDelete}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
            <Typography variant="body2">
              Page {filters.page} of {totalPages} (Total: {totalCount} users)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" onClick={() => setPage(filters.page - 1)} disabled={!hasPrevPage}>
                Previous
              </Button>
              <Button variant="contained" onClick={() => setPage(filters.page + 1)} disabled={!hasNextPage}>
                Next
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Delete confirmation (simple modal → local state */}
      <Dialog open={deleteTarget !== null} onClose={closeDelete} maxWidth="xs" fullWidth>
        <DialogTitle>Delete user</DialogTitle>
        <DialogContent>
          <Typography>
            Delete user <strong>{deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''}</strong>?
            This cannot be undone.
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDelete} color="inherit">
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
