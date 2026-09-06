import { useActionState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useFormStatus } from 'react-dom'
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

function SubmitButton(): React.JSX.Element {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="contained" size="large" disabled={pending} sx={{ mt: 1 }}>
      {pending ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
    </Button>
  )
}

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((s) => s.login)

  // Returns the error message to display, or null on success (which navigates).
  async function loginAction(_prevError: string | null, formData: FormData): Promise<string | null> {
    const tenantSlug = String(formData.get('tenantSlug') ?? '')
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')
    try {
      await login({ tenantSlug: tenantSlug.trim().toLowerCase(), email, password })
      navigate('/', { replace: true })
      return null
    } catch (err) {
      if (err instanceof ApiClientError && err.code === ERROR_CODE.ACCOUNT_LOCKED) {
        return 'Account is locked. Contact support.'
      } else if (err instanceof ApiClientError && err.code === ERROR_CODE.INVALID_CREDENTIALS) {
        return 'Email or password is incorrect.'
      } else if (err instanceof ApiClientError && err.code === ERROR_CODE.TENANT_NOT_FOUND) {
        return 'Unknown workspace. Check the tenant name.'
      } else if (err instanceof ApiClientError && err.code === ERROR_CODE.TENANT_SUSPENDED) {
        return 'This workspace is suspended. Contact support.'
      }
      return err instanceof Error ? err.message : 'Login failed. Please try again.'
    }
  }

  // isPending is intentionally not destructured here — SubmitButton reads it via useFormStatus.
  const [error, formAction] = useActionState(loginAction, null)

  // Already signed in → skip the login screen.
  if (isAuthenticated) return <Navigate to="/" replace />

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', mt: 10, px: 2 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h5" component="h1" gutterBottom align="center">
          Sign in
        </Typography>
        <Box component="form" action={formAction} sx={{ display: 'grid', gap: 2, mt: 2 }}>
          <TextField
            label="Workspace"
            name="tenantSlug"
            required
            fullWidth
            helperText="Your organization's tenant slug"
          />
          <TextField label="Email" name="email" type="email" required fullWidth autoComplete="email" />
          <TextField
            label="Password"
            name="password"
            type="password"
            required
            fullWidth
            autoComplete="current-password"
          />
          {error && <Alert severity="error">{error}</Alert>}
          <SubmitButton />
        </Box>
      </Paper>
    </Box>
  )
}
