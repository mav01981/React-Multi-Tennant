import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/auth.store'
import { AuthSplash } from './AuthSplash'
import { ProtectedRoute } from '@/features/auth/guards/ProtectedRoute'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { LandingPage } from '@/features/auth/pages/LandingPage'
import { AdminOnly } from '@/features/users/guards/AdminOnly'
import { RequirePermission } from '@/features/roles/PermissionRoute'
import { ToastHost } from '@/shared/ui/ToastHost'
import { RouteFallback } from '@/shared/ui/RouteFallback'

// Per-route code splitting: keep the login/landing path eager; defer the
// secondary administration pages to their own chunks. Each import resolves the
// page's named export as lazy's required default export, so the feature files
// and their tests stay untouched.
const ProfilePage = lazy(() => import('@/features/users/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const UsersPage = lazy(() => import('@/features/users/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const RolesPage = lazy(() => import('@/features/roles/RolesPage').then((m) => ({ default: m.RolesPage })))
const TenantsPage = lazy(() => import('@/features/tenants/pages/TenantsPage').then((m) => ({ default: m.TenantsPage })))

export default function App(): React.JSX.Element {
  // Render-first bootstrap: keep the routed tree (and its auth guards) hidden
  // behind a splash until the silent re-auth + role warm-up has settled. This
  // prevents flashing the login page or a user-less landing during hydration,
  // while main.tsx mounts the root immediately (never blocking on network I/O).
  const isInitialized = useAuthStore((s) => s.isInitialized)
  if (!isInitialized) return <AuthSplash />

  return (
    <>
      <ToastHost />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route element={<AdminOnly />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>
            <Route element={<RequirePermission permission="roles.read" />}>
              <Route path="/roles" element={<RolesPage />} />
            </Route>
            <Route element={<RequirePermission permission="tenants.read" />}>
              <Route path="/tenants" element={<TenantsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
