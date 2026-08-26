// Tenants feature DTOs
export interface TenantDto {
  id: string
  name: string
  displayName: string
  slug: string
  status: 'active' | 'suspended'
  createdAt: string
}

export interface TenantListResponse {
  items: TenantDto[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateTenantRequest {
  name: string
  displayName: string
  slug: string
}

export interface UpdateTenantRequest {
  name?: string
  displayName?: string
  status?: 'active' | 'suspended'
}

export interface TenantFilters {
  search: string
  page: number
  pageSize: number
}
