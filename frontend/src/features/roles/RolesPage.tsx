import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import { useRolesStore } from './roles.store'

const PERMISSION_COLOR: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'default'> =
  {
    'users.read': 'primary',
    'users.write': 'warning',
    'users.delete': 'error',
    'roles.read': 'info',
    'profile.read': 'success',
    'profile.write': 'success'
  }

/**
 * Read-only Roles & Permissions view (feat-04 §3.3). Demonstrates the lazy-once
 * `roles` store cache and renders permission chips per role. Adding/editing roles
 * is explicitly out of scope for v1 (feat-04 §4), so this view only lists.
 */
export function RolesPage(): React.JSX.Element {
  const roles = useRolesStore((s) => s.roles)
  const isLoading = useRolesStore((s) => s.isLoading)
  const hasLoaded = useRolesStore((s) => s.hasLoaded)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)

  useEffect(() => {
    if (!hasLoaded) void fetchRoles() // loads once, cached thereafter
  }, [hasLoaded, fetchRoles])

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', mt: 6, px: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Roles &amp; Permissions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Read-only catalog. Permissions drive both the UI guards and the backend authorization for protected endpoints.
      </Typography>

      {isLoading && !hasLoaded ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : roles.length === 0 ? (
        <Typography>No roles loaded.</Typography>
      ) : (
        roles.map((role) => (
          <Paper key={role.id} elevation={1} sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" component="h2">
              {role.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              {role.permissions.map((permission) => (
                <Chip
                  key={permission}
                  label={permission}
                  size="small"
                  variant="outlined"
                  color={PERMISSION_COLOR[permission] ?? 'default'}
                />
              ))}
            </Box>
          </Paper>
        ))
      )}
    </Box>
  )
}
