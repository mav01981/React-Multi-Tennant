// api-contract.md DTOs (subset for the auth feature)
export interface UserDto {
  id: string
  email: string
  firstName: string
  lastName: string
  roles: string[]
  status: 'active' | 'locked' | 'disabled'
  createdAt: string
  updatedAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshRequest {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: UserDto
}

export interface ApiErrorDetail {
  field?: string
  message: string
}

export interface ApiError {
  code: string
  message: string
  details?: ApiErrorDetail[] | null
  requestId?: string | null
}

export interface ApiErrorResponse {
  error: ApiError
}

export const ERROR_CODE = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  REFRESH_TOKEN_REVOKED: 'REFRESH_TOKEN_REVOKED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
}
