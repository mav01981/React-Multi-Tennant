import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/guards/ProtectedRoute'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { LandingPage } from '@/features/auth/pages/LandingPage'
import { AdminOnly } from '@/features/users/guards/AdminOnly'
import { UsersPage } from '@/features/users/pages/UsersPage'
import { ProfilePage } from '@/features/users/pages/ProfilePage'
import { RolesPage } from '@/features/roles/RolesPage'
import { RequirePermission } from '@/features/roles/PermissionRoute'
import { ToastHost } from '@/shared/ui/ToastHost'

export default function App(): React.JSX.Element {
  return (
    <>
      <ToastHost />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
