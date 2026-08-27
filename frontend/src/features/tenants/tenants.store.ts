import { create } from 'zustand'
import type { TenantFilters, CreateTenantRequest, UpdateTenantRequest } from './tenants.types'
import { tenantsApi } from './api'

// Guards against filter-storm races on the list page: a stale (superceded)
// response must never overwrite a newer one, so only the latest in-flight
// request is allowed to commit its result into state.
let fetchAbortController: AbortController | null = null

interface TenantsState {
  // ── State ──────────────────────────────
  items: import('./tenants.types').TenantDto[]
  totalCount: number
  selectedTenantId: string | null
  filters: TenantFilters
  isLoading: boolean
  error: string | null

  // ── Actions ──────────────────────────
  fetchTenants: () => Promise<void>
  createTenant: (data: CreateTenantRequest) => Promise<void>
  updateTenant: (id: string, data: UpdateTenantRequest) => Promise<void>
  deleteTenant: (id: string) => Promise<void>
  setPage: (page: number) => void
  setSearch: (search: string) => void
  setSelectedTenantId: (id: string | null) => void
  clearError: () => void
}

// ── Selectors ──────────────────────────────────────────
export const selectSelectedTenant = (s: TenantsState) => s.items.find((t) => t.id === s.selectedTenantId) ?? null

export const selectTotalPages = (s: TenantsState) => Math.ceil(s.totalCount / s.filters.pageSize)

export const selectHasNextPage = (s: TenantsState) => s.filters.page < selectTotalPages(s)

export const selectHasPrevPage = (s: TenantsState) => s.filters.page > 1

export const useTenantsStore = create<TenantsState>((set, get) => ({
  items: [],
  totalCount: 0,
  selectedTenantId: null,
  filters: {
    search: '',
    page: 1,
    pageSize: 10
  },
  isLoading: false,
  error: null,

  fetchTenants: async () => {
    // Cancel the previous in-flight request (if any) before starting a new one.
    fetchAbortController?.abort()
    const controller = new AbortController()
    fetchAbortController = controller
    set({ isLoading: true, error: null })
    try {
      const { filters } = get()
      const response = await tenantsApi.getAll(
        {
          page: filters.page,
          pageSize: filters.pageSize,
          search: filters.search || undefined
        },
        controller.signal
      )
      if (controller.signal.aborted) return
      set({ items: response.items, totalCount: response.totalCount })
    } catch (err) {
      // A superceded request is expected to abort — ignore it. This is what keeps
      // a slow stale response from clobbering the freshest one.
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : 'Failed to load tenants'
      set({ error: message })
    } finally {
      // Only the latest request clears the spinner; an aborted (older) one must
      // not flip isLoading off while a newer request is still running.
      if (fetchAbortController === controller) {
        fetchAbortController = null
        set({ isLoading: false })
      }
    }
  },

  createTenant: async (data) => {
    try {
      const newTenant = await tenantsApi.create(data)
      set((s) => ({
        items: [newTenant, ...s.items],
        totalCount: s.totalCount + 1,
        error: null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create tenant'
      set({ error: message })
      throw err
    }
  },

  updateTenant: async (id, data) => {
    try {
      const updated = await tenantsApi.update(id, data)
      set((s) => ({
        items: s.items.map((t) => (t.id === id ? updated : t)),
        error: null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update tenant'
      set({ error: message })
      throw err
    }
  },

  deleteTenant: async (id) => {
    try {
      await tenantsApi.remove(id)
      set((s) => ({
        items: s.items.filter((t) => t.id !== id),
        totalCount: Math.max(0, s.totalCount - 1),
        selectedTenantId: s.selectedTenantId === id ? null : s.selectedTenantId,
        error: null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete tenant'
      set({ error: message })
      throw err
    }
  },

  setPage: (page) => {
    const totalPages = selectTotalPages(get())
    const lastPage = Math.max(1, totalPages)
    set((s) => ({ filters: { ...s.filters, page: Math.min(Math.max(1, page), lastPage) } }))
    get().fetchTenants()
  },

  setSearch: (search) => {
    set((s) => ({ filters: { ...s.filters, search, page: 1 } }))
    get().fetchTenants()
  },

  setSelectedTenantId: (id) => {
    set({ selectedTenantId: id })
  },

  clearError: () => {
    set({ error: null })
  }
}))
