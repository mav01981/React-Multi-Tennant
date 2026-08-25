import type { RoleDto } from '@/features/users/users.types'
import { apiFetch } from '@/shared/api/client'

/**
 * Roles catalog API (feat-04 §4). Read-only in v1 — GET /roles returns the
 * role → permission map the frontend uses for dropdowns and permission chips.
 * Fetching is centralized here so the `roles` store owns the single cache.
 */
export const rolesApi = {
  getAll(): Promise<RoleDto[]> {
    return apiFetch<RoleDto[]>('/roles', { method: 'GET' })
  }
}