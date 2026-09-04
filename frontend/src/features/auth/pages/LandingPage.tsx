import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Avatar from '@mui/material/Avatar'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import { useAuthStore, selectFullName, selectInitials, selectIsAdmin, selectIsManager } from '../auth.store'
import { useUiStore } from '@/shared/ui/ui.store'
import { useHasPermission, useRolesStore } from '@/features/roles/roles.store'

export function LandingPage(): React.JSX.Element {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const fullName = useAuthStore(selectFullName)
  const initials = useAuthStore(selectInitials)
  const isAdmin = useAuthStore(selectIsAdmin)
  const isManager = useAuthStore(selectIsManager)
  const logout = useAuthStore((s) => s.logout)
  const themeMode = useUiStore((s) => s.themeMode)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const canReadUsers = useHasPermission('users.read')
  const canReadRoles = useHasPermission('roles.read')
  // feat-05 TEN-07: tenant administration UI is platform-admin only.
  const canReadTenants = useHasPermission('tenants.read')

  // The roles catalog is loaded lazily; nothing fetches it on the landing route
  // itself (unlike the RequirePermission-guarded admin routes), so trigger it
  // here. Without this, a fresh login lands on an empty catalog and every
  // permission-gated button evaluates to false until the user navigates away.
  const hasLoadedRoles = useRolesStore((s) => s.hasLoaded)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  useEffect(() => {
    if (!hasLoadedRoles) void fetchRoles()
  }, [hasLoadedRoles, fetchRoles])

  async function handleLogout(): Promise<void> {
    await logout() // always clears local session (feat-01 §3.4)
    navigate('/login', { replace: true })
  }

  const pills: string[] = []
  if (isAdmin) pills.push('Admin')
  if (isManager) pills.push('Manager')
  pills.push('User')

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 8, px: 2, position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 0, right: 15 }}>
        <Tooltip title={themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <IconButton onClick={toggleTheme} aria-label="Toggle theme">
            {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Workspace
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip
                label={tenantSlug ?? 'Unknown workspace'}
                size="small"
                color="primary"
                variant="outlined"
                aria-label="Current workspace"
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 44, height: 44 }}>{initials}</Avatar>
            <Box>
              <Typography variant="h6" sx={{ display: 'block' }}>
                {fullName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {canReadUsers && (
              <Button variant="outlined" onClick={() => navigate('/users')}>
                Users
              </Button>
            )}
            {canReadRoles && (
              <Button variant="outlined" onClick={() => navigate('/roles')}>
                Roles
              </Button>
            )}
            <Button variant="outlined" onClick={() => navigate('/profile')}>
              Profile
            </Button>
            {canReadTenants && (
              <Button variant="outlined" onClick={() => navigate('/tenants')}>
                Tenants
              </Button>
            )}
            <Button variant="contained" color="primary" onClick={handleLogout}>
              Log out
            </Button>
          </Box>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Roles
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {pills.map((role) => (
              <Chip key={role} label={role} size="small" />
            ))}
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
