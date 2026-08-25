import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, selectIsAuthenticated } from '../auth.store'

/** Guest-only wrapper: authenticated users are bounced to the landing view. */
export function GuestOnly(): React.JSX.Element {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}

export function ProtectedRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  if (isAuthenticated) return <Outlet />
  return <Navigate to="/login" replace />
}
