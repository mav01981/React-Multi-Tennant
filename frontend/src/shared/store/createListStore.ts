import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * Generic factory for the paginated-list CRUD stores (users, tenants, and any
 * future resource that copies this shape — e.g. a third resource would otherwise
 * be the third copy of this ~90%-duplicated logic).
 *
 * It owns everything the feature stores used to duplicate:
 *   - Abort-controller race guarding on fetch (only the latest in-flight request
 *     may commit its result, so a stale response never clobbers a fresh one).
 *   - Pagination state + selectors (total/next/previous pages).
 *   - CRUD action shapes (create/delete refetch so the page and count stay in
 *     sync with pagination and active filters; update merges in place; delete
 *     also clears any selection).
 *   - Search/filter setters that reset to page 1 and refetch.
 *
 * A feature store becomes a thin adapter that supplies its API, filter type and
 * the few genuinely feature-specific details:
 *   - how an `update` response merges into an existing list item (`mergeItem`)
 *   - side-effects after an update (`onUpdated`, e.g. refresh auth when a user
 *     edits themself)
 */

/** The subset of a resource's filters that every list page shares. */
export interface ListFiltersBase {
  search: string
  page: number
  pageSize: number
}

/** The api contract the factory drives — abstracting the differing CRUD shapes. */
export interface ListApi<T, CreateReq, UpdateReq, Params> {
  getAll: (params: Params, signal?: AbortSignal) => Promise<{ items: T[]; totalCount: number }>
  create: (data: CreateReq) => Promise<T>
  update: (id: string, data: UpdateReq) => Promise<T>
  /** Deleting goes through `remove` because feature apis name it `delete` or `remove`. */
  remove: (id: string) => Promise<void>
}

/** Readable state slice shared by every list store. */
export interface ListStoreState<T, F> {
  items: T[]
  totalCount: number
  /** Id of the currently "selected" item (if any); cleared when it is deleted. */
  selectedId: string | null
  filters: F
  isLoading: boolean
  error: string | null
}

/** Action slice shared by every list store. */
export interface ListStoreActions<F, CreateReq, UpdateReq> {
  fetchList: () => Promise<void>
  createItem: (data: CreateReq) => Promise<void>
  updateItem: (id: string, data: UpdateReq) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  setPage: (page: number) => void
  setSearch: (search: string) => void
  setFilters: (patch: Partial<F>) => void
  setSelectedId: (id: string | null) => void
  clearError: () => void
}

export type ListStore<T, F, CreateReq, UpdateReq> = ListStoreState<T, F> & ListStoreActions<F, CreateReq, UpdateReq>
export interface CreateListStoreConfig<
  T extends { id: string },
  F extends ListFiltersBase,
  CreateReq,
  UpdateReq,
  Params
> {
  /** Singular/plural labels used to build fallback error messages (e.g. 'user'/'users'). */
  nouns: { singular: string; plural: string }
  api: ListApi<T, CreateReq, UpdateReq, Params>
  initialFilters: F
  /** Maps the store's filters to the api's list-query params (feature-specific fields). */
  toParams: (filters: F) => Params
  /** How a server `update` response merges into the existing item. Defaults to replace. */
  mergeItem?: (existing: T, updated: T) => T
  /** Runs after a successful `updateItem` (e.g. refresh auth when a user edits themself). */
  onUpdated?: (id: string, updated: T) => Promise<void> | void
}

export interface ListStoreHandle<T, F, CreateReq, UpdateReq> {
  store: UseBoundStore<StoreApi<ListStore<T, F, CreateReq, UpdateReq>>>
  selectSelectedItem: (s: ListStore<T, F, CreateReq, UpdateReq>) => T | null
  selectTotalPages: (s: ListStore<T, F, CreateReq, UpdateReq>) => number
  selectHasNextPage: (s: ListStore<T, F, CreateReq, UpdateReq>) => boolean
  selectHasPrevPage: (s: ListStore<T, F, CreateReq, UpdateReq>) => boolean
}

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
export function createListStore<T extends { id: string }, F extends ListFiltersBase, CreateReq, UpdateReq, Params>(
  config: CreateListStoreConfig<T, F, CreateReq, UpdateReq, Params>
): ListStoreHandle<T, F, CreateReq, UpdateReq> {
  const { nouns, api, initialFilters, toParams, onUpdated } = config
  const mergeItem = config.mergeItem ?? ((_existing: T, updated: T) => updated)

  const loadError = `Failed to load ${nouns.plural}`
  const createError = `Failed to create ${nouns.singular}`
  const updateError = `Failed to update ${nouns.singular}`
  const deleteError = `Failed to delete ${nouns.singular}`

  // Guards against filter-storm races on the list page: a stale (superceded)
  // response must never overwrite a newer one, so only the latest in-flight
  // request is allowed to commit its result into state.
  let fetchAbortController: AbortController | null = null

  const store = create<ListStore<T, F, CreateReq, UpdateReq>>((set, get) => ({
    items: [],
    totalCount: 0,
    selectedId: null,
    filters: initialFilters,
    isLoading: false,
    error: null,

    fetchList: async () => {
      // Cancel the previous in-flight request (if any) before starting a new one.
      fetchAbortController?.abort()
      const controller = new AbortController()
      fetchAbortController = controller
      set({ isLoading: true, error: null })
      try {
        const { filters } = get()
        const response = await api.getAll(toParams(filters), controller.signal)
        if (controller.signal.aborted) return
        set({ items: response.items, totalCount: response.totalCount })
      } catch (err) {
        // A superceded request is expected to abort — ignore it. This is what keeps
        // a slow stale response from clobbering the freshest one.
        if (controller.signal.aborted) return
        set({ error: toErrorMessage(err, loadError) })
      } finally {
        // Only the latest request clears the spinner; an aborted (older) one must
        // not flip isLoading off while a newer request is still running.
        if (fetchAbortController === controller) {
          fetchAbortController = null
          set({ isLoading: false })
        }
      }
    },

    createItem: async (data) => {
      try {
        await api.create(data)
        set({ error: null })
        await get().fetchList()
      } catch (err) {
        set({ error: toErrorMessage(err, createError) })
        throw err
      }
    },

    updateItem: async (id, data) => {
      try {
        const updated = await api.update(id, data)
        set((s) => ({
          items: s.items.map((item) => (item.id === id ? mergeItem(item, updated) : item)),
          error: null
        }))
        await onUpdated?.(id, updated)
      } catch (err) {
        set({ error: toErrorMessage(err, updateError) })
        throw err
      }
    },

    deleteItem: async (id) => {
      try {
        await api.remove(id)
        // Clear the selection if the deleted row was selected, then refetch so
        // the page backfills from the next page (and the count stays accurate)
        // instead of leaving a locally-spliced, short page behind.
        set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId, error: null }))
        await get().fetchList()
      } catch (err) {
        set({ error: toErrorMessage(err, deleteError) })
        throw err
      }
    },

    setPage: (page) => {
      const totalPages = Math.max(1, Math.ceil(get().totalCount / get().filters.pageSize))
      set((s) => ({ filters: { ...s.filters, page: Math.min(Math.max(1, page), totalPages) } }))
      get().fetchList()
    },

    setSearch: (search) => {
      set((s) => ({ filters: { ...s.filters, search, page: 1 } }))
      get().fetchList()
    },

    setFilters: (patch) => {
      set((s) => ({ filters: { ...s.filters, ...patch, page: 1 } }))
      get().fetchList()
    },

    setSelectedId: (id) => {
      set({ selectedId: id })
    },

    clearError: () => {
      set({ error: null })
    }
  }))

  // ── Selectors ──────────────────────────────────────────
  const selectSelectedItem = (s: ListStore<T, F, CreateReq, UpdateReq>) =>
    s.items.find((item) => item.id === s.selectedId) ?? null

  const selectTotalPages = (s: ListStore<T, F, CreateReq, UpdateReq>) => Math.ceil(s.totalCount / s.filters.pageSize)

  const selectHasNextPage = (s: ListStore<T, F, CreateReq, UpdateReq>) => s.filters.page < selectTotalPages(s)

  const selectHasPrevPage = (s: ListStore<T, F, CreateReq, UpdateReq>) => s.filters.page > 1

  return { store, selectSelectedItem, selectTotalPages, selectHasNextPage, selectHasPrevPage }
}
