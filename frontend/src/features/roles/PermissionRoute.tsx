import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, selectIsAuthenticated } from '@/features/auth/auth.store'
import { useRolesStore, useHasPermission } from './roles.store'

/**
 * Route guard gated on a **permission** (not a bare role name), per feat-04 §4/§5.
 * Lazily loads the roles catalog once (hasLoaded) before deciding, so we never
 * flash a wrong redirect while the cache is still cold. Notably this lets a
 * Manager holding `users.read` reach the Users view while still denying it to a
 * plain User — the backend independently enforces the same permission.
 */
export function RequirePermission({ permission }: { permission: string }): React.JSX.Element | null {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const hasLoaded = useRolesStore((s) => s.hasLoaded)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  const hasPermission = useHasPermission(permission)

  useEffect(() => {
    if (!hasLoaded) void fetchRoles()
  }, [hasLoaded, fetchRoles])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!hasLoaded) return null // awaiting role cache
  return hasPermission ? <Outlet /> : <Navigate to="/" replace />
}