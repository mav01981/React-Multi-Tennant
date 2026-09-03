import type { UserDto } from '@/features/auth/auth.types'
import type { RoleName, Permission } from '@/features/roles/permissions'

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
  roles: RoleName[]
}

export interface UpdateUserRequest {
  email?: string
  firstName?: string
  lastName?: string
  status?: 'active' | 'locked' | 'disabled'
  roles?: RoleName[]
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
  name: RoleName
  permissions: Permission[]
}

export interface UserFilters {
  search: string
  role: RoleName | null
  status: 'all' | 'active' | 'locked' | 'disabled'
  page: number
  pageSize: number
}
