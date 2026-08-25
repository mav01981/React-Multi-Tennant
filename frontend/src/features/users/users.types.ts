import type { UserDto } from '@/features/auth/auth.types'

// User list item (same as UserDto for now, but kept separate per contract)
export type UserListItem = UserDto

export interface UserListResponse {
  items: UserListItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateUserRequest {
  email: string
  firstName: string
  lastName: string
  password: string
  roles: string[]
}

export interface UpdateUserRequest {
  email?: string
  firstName?: string
  lastName?: string
  status?: 'active' | 'locked' | 'disabled'
  roles?: string[]
}

export interface UpdateProfileRequest {
  firstName?: string
  lastName?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface RoleDto {
  id: string
  name: string
  permissions: string[]
}

export interface UserFilters {
  search: string
  role: string | null
  status: 'all' | 'active' | 'locked' | 'disabled'
  page: number
  pageSize: number
}
