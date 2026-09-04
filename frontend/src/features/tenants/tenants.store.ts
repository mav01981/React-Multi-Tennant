import { createListStore } from '@/shared/store/createListStore'
import type { TenantDto, TenantFilters, CreateTenantRequest, UpdateTenantRequest } from './tenants.types'
import { tenantsApi, type TenantsListParams } from './api'

const listStore = createListStore<
  TenantDto,
  TenantFilters,
  CreateTenantRequest,
  UpdateTenantRequest,
  TenantsListParams
>({
  nouns: { singular: 'tenant', plural: 'tenants' },
  api: {
    getAll: (params, signal) => tenantsApi.getAll(params, signal),
    create: (data) => tenantsApi.create(data),
    update: (id, data) => tenantsApi.update(id, data),
    remove: (id) => tenantsApi.remove(id)
  },
  initialFilters: { search: '', page: 1, pageSize: 10 },
  toParams: (filters) => ({
    page: filters.page,
    pageSize: filters.pageSize,
    search: filters.search || undefined
  })
  // Tenants wholesale-replace an item on update (no partial merge), which is the
  // factory's default `mergeItem` behavior — no override needed here.
})

// The shared factory uses generic action/field names; re-export the store and
// the feature-scoped selector names so existing consumers/tests are unchanged.
export const useTenantsStore = listStore.store
export const selectSelectedTenant = listStore.selectSelectedItem
export const selectTotalPages = listStore.selectTotalPages
export const selectHasNextPage = listStore.selectHasNextPage
export const selectHasPrevPage = listStore.selectHasPrevPage
