import type {
  TenantDto,
  TenantListResponse,
  CreateTenantRequest,
  UpdateTenantRequest
} from './tenants.types'
import { apiFetch } from '@/shared/api/client'

export interface TenantsListParams {
  page?: number
  pageSize?: number
  search?: string
}

export const tenantsApi = {
  async getAll(params: TenantsListParams = {}): Promise<TenantListResponse> {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.search) query.set('search', params.search)

    const queryStr = query.toString()
    const path = queryStr ? `/tenants?${queryStr}` : '/tenants'
    return apiFetch<TenantListResponse>(path, { method: 'GET' })
  },

  async create(data: CreateTenantRequest): Promise<TenantDto> {
    return apiFetch<TenantDto>('/tenants', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async update(id: string, data: UpdateTenantRequest): Promise<TenantDto> {
    return apiFetch<TenantDto>(`/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async remove(id: string): Promise<void> {
    return apiFetch<void>(`/tenants/${id}`, { method: 'DELETE' })
  }
}
