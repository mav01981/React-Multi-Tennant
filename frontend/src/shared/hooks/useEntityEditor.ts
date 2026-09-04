import { useCallback, useReducer } from 'react'

/**
 * Local state for a CRUD page's create/edit dialog and delete confirmation.
 *
 * The dialog and confirm-delete panels are a small state machine: opening create
 * resets the form, starting an edit resets plus fills the form, closing clears
 * everything. Keeping these as one reducer makes every transition explicit and
 * impossible to half-apply (e.g. `showCreate && editingId` can never drift apart).
 *
 * `searchInput` is deliberately NOT part of this — it is a single independent
 * value with its own debounce and lives as a plain `useState` in the caller.
 */

export interface EntityEditorState<T, F> {
  /** Whether the create/edit panel is visible. */
  showCreate: boolean
  /** Id of the entity being edited, or null when creating a new one. */
  editingId: string | null
  /** Live form values, seeded from an existing entity on edit. */
  form: F
  /** Inline validation/API error shown inside the form dialog. */
  formError: string | null
  /** Entity queued for deletion, or null when the confirm dialog is closed. */
  deleteTarget: T | null
  /** Error shown inside the delete confirmation dialog. */
  deleteError: string | null
}

type Action<T, F> =
  | { type: 'OPEN_CREATE'; form: F }
  | { type: 'START_EDIT'; id: string; form: F }
  | { type: 'RESET' }
  | { type: 'UPDATE_FORM'; patch: Partial<F> }
  | { type: 'SET_FORM_ERROR'; message: string | null }
  | { type: 'OPEN_DELETE'; target: T }
  | { type: 'CLOSE_DELETE' }
  | { type: 'SET_DELETE_ERROR'; message: string | null }

function reducer<T, F>(state: EntityEditorState<T, F>, action: Action<T, F>): EntityEditorState<T, F> {
  switch (action.type) {
    case 'OPEN_CREATE':
      return { ...state, showCreate: true, editingId: null, form: action.form, formError: null }
    case 'START_EDIT':
      // Editing implies the dialog is open; never leave both create + edit set.
      return { ...state, showCreate: true, editingId: action.id, form: action.form, formError: null }
    case 'RESET':
      return { ...state, showCreate: false, editingId: null, formError: null }
    case 'UPDATE_FORM':
      return { ...state, form: { ...state.form, ...action.patch } }
    case 'SET_FORM_ERROR':
      return { ...state, formError: action.message }
    case 'OPEN_DELETE':
      return { ...state, deleteTarget: action.target, deleteError: null }
    case 'CLOSE_DELETE':
      return { ...state, deleteTarget: null, deleteError: null }
    case 'SET_DELETE_ERROR':
      return { ...state, deleteError: action.message }
  }
}

export interface EntityEditorApi<T, F> {
  state: EntityEditorState<T, F>
  openCreate: () => void
  startEdit: (id: string, form: F) => void
  resetForm: () => void
  updateForm: (patch: Partial<F>) => void
  setFormError: (message: string | null) => void
  openDelete: (target: T) => void
  closeDelete: () => void
  setDeleteError: (message: string | null) => void
}

/**
 * Reducer-backed panel state for a create/edit + delete CRUD page.
 *
 * @param emptyForm The "blank" form shape used when opening the create dialog.
 * @returns readonly state plus imperative actions for each valid transition.
 */
export function useEntityEditorState<T, F>(emptyForm: F): EntityEditorApi<T, F> {
  const [state, dispatch] = useReducer(reducer<T, F>, {
    showCreate: false,
    editingId: null,
    form: emptyForm,
    formError: null,
    deleteTarget: null,
    deleteError: null
  })

  // All actions are memoized against the (stable) `dispatch` so their references
  // survive re-renders. This keeps the callers' `useCallback` row handlers stable
  // in turn, which is what lets memoized row components (UserRow/TenantRow) skip
  // re-rendering while the page re-renders on unrelated state (e.g. search input).
  const openCreate = useCallback(() => dispatch({ type: 'OPEN_CREATE', form: emptyForm }), [dispatch, emptyForm])
  const startEdit = useCallback((id: string, form: F) => dispatch({ type: 'START_EDIT', id, form }), [dispatch])
  const resetForm = useCallback(() => dispatch({ type: 'RESET' }), [dispatch])
  const updateForm = useCallback((patch: Partial<F>) => dispatch({ type: 'UPDATE_FORM', patch }), [dispatch])
  const setFormError = useCallback(
    (message: string | null) => dispatch({ type: 'SET_FORM_ERROR', message }),
    [dispatch]
  )
  const openDelete = useCallback((target: T) => dispatch({ type: 'OPEN_DELETE', target }), [dispatch])
  const closeDelete = useCallback(() => dispatch({ type: 'CLOSE_DELETE' }), [dispatch])
  const setDeleteError = useCallback(
    (message: string | null) => dispatch({ type: 'SET_DELETE_ERROR', message }),
    [dispatch]
  )

  return {
    state,
    openCreate,
    startEdit,
    resetForm,
    updateForm,
    setFormError,
    openDelete,
    closeDelete,
    setDeleteError
  }
}
