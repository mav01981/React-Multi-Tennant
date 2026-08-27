import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { useAuthStore, selectIsAuthenticated } from '../auth.store'
import { ERROR_CODE } from '../auth.types'
import { ApiClientError } from '@/shared/api/client'

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const login = useAuthStore((s) => s.login)

  const [tenantSlug, setTenantSlug] = useState('acme')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Already signed in → skip the login screen.
  if (isAuthenticated) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    try {
      await login({ tenantSlug: tenantSlug.trim().toLowerCase(), email, password })
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiClientError && err.code === ERROR_CODE.ACCOUNT_LOCKED) {
        setError('Account is locked. Contact support.')
      } else if (err instanceof ApiClientError && err.code === ERROR_CODE.INVALID_CREDENTIALS) {
        setError('Email or password is incorrect.')
      } else if (err instanceof ApiClientError && err.code === ERROR_CODE.TENANT_NOT_FOUND) {
        setError('Unknown workspace. Check the tenant name.')
      } else if (err instanceof ApiClientError && err.code === ERROR_CODE.TENANT_SUSPENDED) {
        setError('This workspace is suspended. Contact support.')
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
      }
    }
  }

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', mt: 10, px: 2 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h5" component="h1" gutterBottom align="center">
          Sign in
        </Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2, mt: 2 }}>
          <TextField
            label="Workspace"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            required
            fullWidth
            helperText="Your organization's tenant slug"
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            autoComplete="current-password"
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={isLoading} sx={{ mt: 1 }}>
            {isLoading ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
