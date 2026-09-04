import type {
  UserListResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateProfileRequest,
  ChangePasswordRequest
} from './users.types'
import type { RoleName } from '@/features/roles/permissions'
import type { UserDto } from '@/features/auth/auth.types'
import { apiFetch } from '@/shared/api/client'

export interface UsersListParams {
  page?: number
  pageSize?: number
  search?: string
  role?: RoleName
  status?: 'all' | 'active' | 'locked' | 'disabled'
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const usersApi = {
  async getAll(params: UsersListParams = {}, signal?: AbortSignal): Promise<UserListResponse> {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.search) query.set('search', params.search)
    if (params.role) query.set('role', params.role)
    if (params.status && params.status !== 'all') query.set('status', params.status)
    if (params.sortBy) query.set('sortBy', params.sortBy)
    if (params.sortDir) query.set('sortDir', params.sortDir)

    const queryStr = query.toString()
    const path = queryStr ? `/users?${queryStr}` : '/users'
    return apiFetch<UserListResponse>(path, { method: 'GET', ...(signal ? { signal } : {}) })
  },

  async getById(id: string): Promise<UserDto> {
    return apiFetch<UserDto>(`/users/${id}`, { method: 'GET' })
  },

  async getMe(signal?: AbortSignal): Promise<UserDto> {
    return apiFetch<UserDto>('/users/me', { method: 'GET', signal })
  },

  async updateMe(data: UpdateProfileRequest): Promise<UserDto> {
    return apiFetch<UserDto>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    return apiFetch<void>('/users/me/password', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async create(data: CreateUserRequest): Promise<UserDto> {
    return apiFetch<UserDto>('/users', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async update(id: string, data: UpdateUserRequest): Promise<UserDto> {
    return apiFetch<UserDto>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async delete(id: string): Promise<void> {
    return apiFetch<void>(`/users/${id}`, { method: 'DELETE' })
  }
}
