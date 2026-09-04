import type { LoginRequest, LoginResponse, UserDto } from './auth.types'
import { apiFetch } from '@/shared/api/client'

export const authApi = {
  login(credentials: LoginRequest): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      auth: false,
      headers: { 'X-Tenant-Id': credentials.tenantSlug }
    })
  },

  me(): Promise<UserDto> {
    return apiFetch<UserDto>('/auth/me', { method: 'GET' })
  },

  logout(): Promise<void> {
    return apiFetch<void>('/auth/logout', { method: 'POST' })
  }
}
