import { create } from 'zustand'
import type { RoleDto } from '@/features/users/users.types'
import { rolesApi } from './roles.api'
import { useAuthStore } from '@/features/auth/auth.store'

/**
 * `roles` store — lazy on-demand cache. Roles are static
 * in v1, so they are fetched exactly once (`hasLoaded` guard) and cached for the
 * rest of the session; role dropdowns and the permission guard share this cache.
 */
export interface RolesState {
  roles: RoleDto[]
  isLoading: boolean
  hasLoaded: boolean
  fetchRoles: () => Promise<void>
}

export const useRolesStore = create<RolesState>((set, get) => ({
  roles: [],
  isLoading: false,
  hasLoaded: false,

  fetchRoles: async () => {
    if (get().hasLoaded) return // lazy, once
    set({ isLoading: true })
    try {
      const roles = await rolesApi.getAll()
      set({ roles, hasLoaded: true })
    } finally {
      set({ isLoading: false })
    }
  }
}))

// ── Selectors ──────────────────────────────────────────────
export const selectRoles = (s: RolesState) => s.roles

/** Whether the current authenticated user holds a given permission (feat-04 §5). */
export function useHasPermission(permission: string): boolean {
  const user = useAuthStore((s) => s.user)
  const roles = useRolesStore((s) => s.roles)

  // No identity or no role catalog loaded → nothing is granted (fail closed).
  if (!user || roles.length === 0) return false

  const grantedRoles = user.roles
  return roles
    .filter((role) => grantedRoles.includes(role.name))
    .some((role) => role.permissions.includes(permission))
}