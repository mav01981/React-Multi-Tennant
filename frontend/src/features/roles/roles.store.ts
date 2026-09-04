import { useMemo } from 'react'
import { create } from 'zustand'
import type { RoleDto } from '@/features/users/users.types'
import type { Permission } from './permissions'
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
    } catch {
      // Fail closed: a user without `roles.read` (e.g. Manager/ReadOnly) cannot
      // fetch the catalog and gets a 403. Mark it loaded-but-empty so permission
      // guards evaluate to "denied" and redirect, instead of leaving the UI stuck
      // loading forever (and never mounting the app).
      set({ roles: [], hasLoaded: true })
    } finally {
      set({ isLoading: false })
    }
  }
}))

// ── Selectors ──────────────────────────────────────────────
export const selectRoles = (s: RolesState) => s.roles

/**
 * Whether the current authenticated user holds a given permission (feat-04 §5).
 * The `permission` argument is the `Permission` union — a typo'd literal like
 * `'users.reads'` fails to compile. This catalog lookup (server-fetched roles)
 * is the single source of truth for permission checks; there is deliberately
 * no static role → permission map on the frontend.
 */
export function useHasPermission(permission: Permission): boolean {
  const user = useAuthStore((s) => s.user)
  const roles = useRolesStore((s) => s.roles)

  // Memoize the (pure) catalog lookup so it isn't recomputed on every render —
  // the role catalog is static for the session, so `roles`/`user` change rarely
  // and this recomputation cost is then paid once per change, not per render.
  return useMemo(() => {
    // No identity or no role catalog loaded → nothing is granted (fail closed).
    if (!user || roles.length === 0) return false

    const grantedRoles = user.roles
    return roles
      .filter((role) => grantedRoles.includes(role.name))
      .some((role) => role.permissions.includes(permission))
  }, [user, roles, permission])
}
