import { useCallback, useEffect, useActionState, useOptimistic, useState, startTransition, useTransition } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import { useTenantsStore, selectTotalPages, selectHasNextPage, selectHasPrevPage } from '../tenants.store'
import type { TenantDto } from '../tenants.types'
import { TenantRow } from './TenantRow'
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
  const fetchTenants = useTenantsStore((s) => s.fetchList)
  const setPage = useTenantsStore((s) => s.setPage)
  const setSearch = useTenantsStore((s) => s.setSearch)
  const createTenant = useTenantsStore((s) => s.createItem)
  const updateTenant = useTenantsStore((s) => s.updateItem)
  const deleteTenant = useTenantsStore((s) => s.deleteItem)
  const addToast = useUiStore((s) => s.addToast)

  // Pagination/filter changes run inside a transition so the current rows stay
  // mounted (dimmed) while the next page loads. The full-screen spinner is
  // reserved for the true initial load only. (Named startListTransition because
  // the top-level startTransition below serves the optimistic delete path.)
  const [isPending, startListTransition] = useTransition()
  const changeList = (update: () => void): void => startListTransition(update)

  // Per-row status-toggle feedback: true while the Suspend/Reactivate request is
  // in flight (see toggleStatus below).
  const [isToggling, startToggling] = useTransition()

  // Optimistic delete (React 19): rows vanish from the table the moment delete is
  // confirmed, before the API round-trip. The store still owns the truth — if the
  // delete fails, React reverts the optimistic state when the transition settles
  // and the row reappears with the store error shown above the table.
  const [visibleItems, hideDeletedRow] = useOptimistic(items, (current, deletedId: string) =>
    current.filter((tenant) => tenant.id !== deletedId)
  )

  const [searchInput, setSearchInput] = useState(filters.search)
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const {
    state: { showCreate, editingId, form, deleteTarget, deleteError },
    openCreate,
    startEdit,
    resetForm,
    updateForm,
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

  // Referentially stable (useCallback) so the memoized TenantRow can skip re-rendering.
  const startEditTenant = useCallback(
    (tenant: TenantDto) => {
      startEdit(tenant.id, { name: tenant.name, displayName: tenant.displayName, slug: tenant.slug })
    },
    [startEdit]
  )

  // Create/edit submit via useActionState: error + pending state + action in one
  // hook. isPending disables the submit button, preventing double-submits. The
  // editor state is snapshotted into the payload since actions run deferred.
  const [formError, submitTenantForm, isSubmitting] = useActionState(
    async (
      _prev: string | null,
      payload: { editingId: string | null; form: typeof EMPTY_FORM }
    ): Promise<string | null> => {
      const { name, displayName, slug } = payload.form
      try {
        if (payload.editingId) {
          await updateTenant(payload.editingId, { name, displayName })
          addToast('Tenant updated', 'success')
        } else {
          await createTenant({ name, displayName: displayName || name, slug: slug.trim().toLowerCase() })
          addToast('Tenant created', 'success')
        }
        resetForm()
        return null
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'SLUG_EXISTS') {
          return 'A tenant with this slug already exists.'
        }
        return err instanceof Error ? err.message : 'Request failed'
      }
    },
    null
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    submitTenantForm({ editingId, form })
  }

  const toggleStatus = useCallback(
    (tenant: TenantDto) => {
      const next = tenant.status === 'active' ? 'suspended' : 'active'
      // Async transition: isPending stays true until the request settles, so the
      // row's chip can disable + spin instead of giving no feedback on click.
      startToggling(async () => {
        try {
          await updateTenant(tenant.id, { status: next })
          addToast(`Tenant ${next === 'suspended' ? 'suspended' : 'reactivated'}`, 'success')
        } catch (err) {
          addToast(err instanceof Error ? err.message : 'Failed to change status', 'error')
        }
      })
    },
    [updateTenant, addToast]
  )

  const confirmDelete = () => {
    if (!deleteTarget) return
    setDeleteError(null)
    const deletedId = deleteTarget.id
    // startTransition with an async action is what makes useOptimistic revert on
    // failure: React discards the optimistic value when the action settles.
    startTransition(async () => {
      hideDeletedRow(deletedId)
      try {
        await deleteTenant(deletedId)
        addToast('Tenant deleted', 'success')
        closeDelete()
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      }
    })
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

      {isLoading && items.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : visibleItems.length === 0 ? (
        <Typography>No tenants found</Typography>
      ) : (
        <Paper elevation={1} sx={{ opacity: isPending || isLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Display name</TableCell>
                  <TableCell>Slug</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleItems.map((tenant) => (
                  <TenantRow
                    key={tenant.id}
                    tenant={tenant}
                    isToggling={isToggling}
                    onEdit={startEditTenant}
                    onToggleStatus={toggleStatus}
                    onDelete={openDelete}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
            <Typography variant="body2">
              Page {filters.page} of {totalPages} (Total: {totalCount} tenants)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                onClick={() => changeList(() => setPage(filters.page - 1))}
                disabled={!hasPrevPage}
              >
                Previous
              </Button>
              <Button
                variant="contained"
                onClick={() => changeList(() => setPage(filters.page + 1))}
                disabled={!hasNextPage}
              >
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
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : editingId ? 'Save' : 'Create'}
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
