import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import { usersApi } from '../api'
import type { ChangePasswordRequest, UpdateProfileRequest } from '../users.types'
import { useAuthStore } from '@/features/auth/auth.store'
import { useUiStore } from '@/shared/ui/ui.store'

const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

export function ProfilePage(): React.JSX.Element {
  const user = useAuthStore((state) => state.user)
  const [names, setNames] = useState<UpdateProfileRequest>({ firstName: '', lastName: '' })
  const [passwords, setPasswords] = useState<ChangePasswordRequest>({ currentPassword: '', newPassword: '' })
  const [error, setError] = useState<string | null>(null)
  const addToast = useUiStore((state) => state.addToast)

  useEffect(() => {
    // The fetch effect only loads the user into the store. Deriving the form
    // names is left to the single `[user]`-driven effect below, so there is
    // exactly one source of truth for that local state.
    const controller = new AbortController()
    usersApi.getMe(controller.signal).then((current) => {
      useAuthStore.setState({ user: current })
    }).catch((err: unknown) => {
      // Ignore errors caused by unmounting (abort) — the component is gone.
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      }
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (user) setNames({ firstName: user.firstName, lastName: user.lastName })
  }, [user])

  async function updateProfile(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      const updated = await usersApi.updateMe(names)
      useAuthStore.setState({ user: updated })
      addToast('Profile updated', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    if (!passwordPolicy.test(passwords.newPassword)) {
      setError('New password must be at least 8 characters and include upper, lower, number, and special characters.')
      return
    }
    try {
      await usersApi.changePassword(passwords)
      setPasswords({ currentPassword: '', newPassword: '' })
      addToast('Password changed', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    }
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 6, px: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        My profile
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Profile details
        </Typography>
        <Box component="form" onSubmit={updateProfile} sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="First name"
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
            value={names.firstName ?? ''}
            onChange={(event) => setNames({ ...names, firstName: event.target.value })}
            fullWidth
          />
          <TextField
            label="Last name"
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
            value={names.lastName ?? ''}
            onChange={(event) => setNames({ ...names, lastName: event.target.value })}
            fullWidth
          />
          <Button type="submit" variant="contained" sx={{ justifySelf: 'start' }}>
            Save profile
          </Button>
        </Box>
      </Paper>

      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Change password
        </Typography>
        <Box component="form" onSubmit={changePassword} sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Current password"
            type="password"
            required
            value={passwords.currentPassword}
            onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
            fullWidth
          />
          <TextField
            label="New password"
            type="password"
            required
            value={passwords.newPassword}
            onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
            fullWidth
            helperText="At least 8 characters with upper, lower, number, and special characters."
          />
          <Button type="submit" variant="contained" sx={{ justifySelf: 'start' }}>
            Change password
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}