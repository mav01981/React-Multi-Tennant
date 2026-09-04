import { createListStore } from '@/shared/store/createListStore'
import type { UserListItem, UserFilters, CreateUserRequest, UpdateUserRequest } from './users.types'
import { usersApi, type UsersListParams } from './api'
import { useAuthStore } from '@/features/auth/auth.store'

const listStore = createListStore<UserListItem, UserFilters, CreateUserRequest, UpdateUserRequest, UsersListParams>({
  nouns: { singular: 'user', plural: 'users' },
  api: {
    getAll: (params, signal) => usersApi.getAll(params, signal),
    create: (data) => usersApi.create(data),
    update: (id, data) => usersApi.update(id, data),
    remove: (id) => usersApi.delete(id)
  },
  initialFilters: { search: '', role: null, status: 'all', tenantSlug: null, page: 1, pageSize: 10 },
  toParams: (filters) => ({
    page: filters.page,
    pageSize: filters.pageSize,
    search: filters.search || undefined,
    role: filters.role || undefined,
    status: filters.status,
    tenantSlug: filters.tenantSlug || undefined
  }),
  // Users merge a partial server response onto the existing item rather than
  // wholesale replacing it (unlike tenants), so delegate that to `mergeItem`.
  mergeItem: (existing, updated) => ({ ...existing, ...updated }),
  // If admin updated their own user, refresh auth state (feat-02 §3).
  onUpdated: async (id) => {
    const authStore = useAuthStore.getState()
    const currentUser = authStore.user
    if (currentUser && id === currentUser.id) {
      await authStore.fetchCurrentUser()
    }
  }
})

// The shared factory uses generic action/field names; re-export the store and
// the feature-scoped selector names so existing consumers/tests are unchanged.
export const useUsersStore = listStore.store
export const selectSelectedUser = listStore.selectSelectedItem
export const selectTotalPages = listStore.selectTotalPages
export const selectHasNextPage = listStore.selectHasNextPage
export const selectHasPrevPage = listStore.selectHasPrevPage
