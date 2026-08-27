import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useTenantsStore, selectTotalPages, selectHasNextPage, selectHasPrevPage } from '../tenants.store'
import type { TenantDto } from '../tenants.types'
import { ApiClientError } from '@/shared/api/client'
import { useUiStore } from '@/shared/ui/ui.store'
import { useEntityEditorState } from '@/shared/hooks/useEntityEditor'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'

const EMPTY_FORM = { name: '', displayName: '', slug: '' }

/**
 * Superadmin tenant management view (feat-05). Gated by `tenants.read` via
 * RequirePermission; the backend independently enforces the same permission.
 */
export function TenantsPage(): React.JSX.Element {
  const items = useTenantsStore((s) => s.items)
  const isLoading = useTenantsStore((s) => s.isLoading)
  const totalCount = useTenantsStore((s) => s.totalCount)
  const filters = useTenantsStore((s) => s.filters)
  const error = useTenantsStore((s) => s.error)
  const fetchTenants = useTenantsStore((s) => s.fetchTenants)
  const setPage = useTenantsStore((s) => s.setPage)
  const setSearch = useTenantsStore((s) => s.setSearch)
  const createTenant = useTenantsStore((s) => s.createTenant)
  const updateTenant = useTenantsStore((s) => s.updateTenant)
  const deleteTenant = useTenantsStore((s) => s.deleteTenant)
  const addToast = useUiStore((s) => s.addToast)

  const [searchInput, setSearchInput] = useState(filters.search)
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const {
    state: { showCreate, editingId, form, formError, deleteTarget, deleteError },
    openCreate,
    startEdit,
    resetForm,
    updateForm,
    setFormError,
    openDelete,
    closeDelete,
    setDeleteError
  } = useEntityEditorState<TenantDto, typeof EMPTY_FORM>(EMPTY_FORM)
  const totalPages = useTenantsStore(selectTotalPages)
  const hasNextPage = useTenantsStore(selectHasNextPage)
  const hasPrevPage = useTenantsStore(selectHasPrevPage)

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  useEffect(() => {
    // Only push the search filter (which triggers a fetch) once typing has
    // settled AND the value actually differs from the applied filter.
    if (debouncedSearch !== filters.search) setSearch(debouncedSearch)
  }, [debouncedSearch, filters.search, setSearch])

  const startEditTenant = (tenant: TenantDto) => {
    startEdit(tenant.id, { name: tenant.name, displayName: tenant.displayName, slug: tenant.slug })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    try {
      if (editingId) {
        await updateTenant(editingId, { name: form.name, displayName: form.displayName })
        addToast('Tenant updated', 'success')
      } else {
        await createTenant({
          name: form.name,
          displayName: form.displayName || form.name,
          slug: form.slug.trim().toLowerCase()
        })
        addToast('Tenant created', 'success')
      }
      resetForm()
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SLUG_EXISTS') {
        setFormError('A tenant with this slug already exists.')
      } else {
        setFormError(err instanceof Error ? err.message : 'Request failed')
      }
    }
  }

  const toggleStatus = async (tenant: TenantDto) => {
    const next = tenant.status === 'active' ? 'suspended' : 'active'
    try {
      await updateTenant(tenant.id, { status: next })
      addToast(`Tenant ${next === 'suspended' ? 'suspended' : 'reactivated'}`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to change status', 'error')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteTenant(deleteTarget.id)
      addToast('Tenant deleted', 'success')
      closeDelete()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Tenants
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Platform-wide workspace administration (superadmin only).
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <TextField
          label="Search tenants"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ width: 320 }}
        />
        <Button variant="contained" onClick={openCreate}>
          New Tenant
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => useTenantsStore.getState().clearError()}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Typography>No tenants found</Typography>
      ) : (
        <Paper elevation={1}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Display name</TableCell>
                  <TableCell>Slug</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((tenant) => (
                  <TableRow key={tenant.id} hover>
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
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => startEditTenant(tenant)}
                        aria-label={`Edit ${tenant.slug}`}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <Chip
                        component="button"
                        size="small"
                        clickable
                        label={tenant.status === 'active' ? 'Suspend' : 'Reactivate'}
                        color={tenant.status === 'active' ? 'warning' : 'success'}
                        onClick={() => toggleStatus(tenant)}
                        sx={{ mr: 1 }}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        disabled={tenant.slug === 'platform'}
                        onClick={() => openDelete(tenant)}
                        aria-label={`Delete ${tenant.slug}`}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
            <Typography variant="body2">
              Page {filters.page} of {totalPages} (Total: {totalCount} tenants)
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

      {/* Create / edit dialog. Real <form> so Enter in any field submits (feat-05). */}
      <Dialog open={showCreate} onClose={resetForm} maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogTitle>{editingId ? 'Edit tenant' : 'New tenant'}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Name" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} required />
            <TextField
              label="Display name"
              value={form.displayName}
              onChange={(e) => updateForm({ displayName: e.target.value })}
            />
            <TextField
              label="Slug"
              value={form.slug}
              onChange={(e) => updateForm({ slug: e.target.value })}
              required
              disabled={editingId !== null}
              helperText={editingId ? 'Slug is immutable after creation.' : 'Lowercase letters, digits and hyphens.'}
            />
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={resetForm} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!form.name.trim() || (!editingId && !form.slug.trim())}>
              {editingId ? 'Save' : 'Create'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Delete confirmation (feat-05 TEN-06: modal before delete) */}
      <Dialog open={deleteTarget !== null} onClose={closeDelete} maxWidth="xs" fullWidth>
        <DialogTitle>Delete tenant</DialogTitle>
        <DialogContent>
          <Typography>
            Delete tenant <strong>{deleteTarget?.displayName}</strong> (<code>{deleteTarget?.slug}</code>)? Its users
            will no longer be able to sign in. This cannot be undone.
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
