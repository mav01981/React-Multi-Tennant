import { create } from 'zustand'
import type { UserListItem, UserFilters, CreateUserRequest, UpdateUserRequest } from './users.types'
import type { RoleName } from '@/features/roles/permissions'
import { usersApi } from './api'
import { useAuthStore } from '@/features/auth/auth.store'

// Guards against filter-storm races on the list page: a stale (superceded)
// response must never overwrite a newer one, so only the latest in-flight
// request is allowed to commit its result into state.
let fetchAbortController: AbortController | null = null

interface UsersState {
  // ── State ──────────────────────────────
  items: UserListItem[]
  totalCount: number
  selectedUserId: string | null
  filters: UserFilters
  isLoading: boolean
  error: string | null

  // ── Actions ──────────────────────────
  fetchUsers: () => Promise<void>
  createUser: (data: CreateUserRequest) => Promise<void>
  updateUser: (id: string, data: UpdateUserRequest) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  setPage: (page: number) => void
  setSearch: (search: string) => void
  setRole: (role: RoleName | null) => void
  setStatus: (status: 'all' | 'active' | 'locked' | 'disabled') => void
  setSelectedUserId: (id: string | null) => void
  clearError: () => void
}

// ── Selectors ──────────────────────────────────────────
export const selectSelectedUser = (s: UsersState) => s.items.find((u) => u.id === s.selectedUserId) ?? null

export const selectTotalPages = (s: UsersState) => Math.ceil(s.totalCount / s.filters.pageSize)

export const selectHasNextPage = (s: UsersState) => s.filters.page < selectTotalPages(s)

export const selectHasPrevPage = (s: UsersState) => s.filters.page > 1

export const useUsersStore = create<UsersState>((set, get) => ({
  items: [],
  totalCount: 0,
  selectedUserId: null,
  filters: {
    search: '',
    role: null,
    status: 'all',
    page: 1,
    pageSize: 10
  },
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    // Cancel the previous in-flight request (if any) before starting a new one.
    fetchAbortController?.abort()
    const controller = new AbortController()
    fetchAbortController = controller
    set({ isLoading: true, error: null })
    try {
      const { filters } = get()
      const response = await usersApi.getAll(
        {
          page: filters.page,
          pageSize: filters.pageSize,
          search: filters.search || undefined,
          role: filters.role || undefined,
          status: filters.status
        },
        controller.signal
      )
      if (controller.signal.aborted) return
      set({ items: response.items, totalCount: response.totalCount })
    } catch (err) {
      // A superceded request is expected to abort — ignore it. This is what keeps
      // a slow stale response from clobbering the freshest one.
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : 'Failed to load users'
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

  createUser: async (data) => {
    try {
      const newUser = await usersApi.create(data)
      set((s) => ({
        items: [newUser, ...s.items],
        totalCount: s.totalCount + 1,
        error: null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user'
      set({ error: message })
      throw err
    }
  },

  updateUser: async (id, data) => {
    try {
      const updated = await usersApi.update(id, data)
      set((s) => ({
        items: s.items.map((u) => (u.id === id ? { ...u, ...updated } : u)),
        error: null
      }))

      // If admin updated their own user, refresh auth state (feat-02 §3)
      const authStore = useAuthStore.getState()
      const currentUser = authStore.user
      if (currentUser && id === currentUser.id) {
        await authStore.fetchCurrentUser()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user'
      set({ error: message })
      throw err
    }
  },

  deleteUser: async (id) => {
    try {
      await usersApi.delete(id)
      set((s) => ({
        items: s.items.filter((u) => u.id !== id),
        totalCount: Math.max(0, s.totalCount - 1),
        selectedUserId: s.selectedUserId === id ? null : s.selectedUserId,
        error: null
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user'
      set({ error: message })
      throw err
    }
  },

  setPage: (page) => {
    const totalPages = selectTotalPages(get())
    const lastPage = Math.max(1, totalPages)
    set((s) => ({ filters: { ...s.filters, page: Math.min(Math.max(1, page), lastPage) } }))
    get().fetchUsers()
  },

  setSearch: (search) => {
    set((s) => ({ filters: { ...s.filters, search, page: 1 } }))
    get().fetchUsers()
  },

  setRole: (role) => {
    set((s) => ({ filters: { ...s.filters, role, page: 1 } }))
    get().fetchUsers()
  },

  setStatus: (status) => {
    set((s) => ({ filters: { ...s.filters, status, page: 1 } }))
    get().fetchUsers()
  },

  setSelectedUserId: (id) => {
    set({ selectedUserId: id })
  },

  clearError: () => {
    set({ error: null })
  }
}))
