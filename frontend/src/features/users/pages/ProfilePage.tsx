import { useEffect, useState, useActionState } from 'react'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const addToast = useUiStore((state) => state.addToast)

  useEffect(() => {
    // The fetch effect only loads the user into the store. Deriving the form
    // names is left to the single `[user]`-driven effect below, so there is
    // exactly one source of truth for that local state.
    const controller = new AbortController()
    usersApi
      .getMe(controller.signal)
      .then((current) => {
        useAuthStore.getState().setUser(current)
      })
      .catch((err: unknown) => {
        // Ignore errors caused by unmounting (abort) — the component is gone.
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load profile')
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (user) setNames({ firstName: user.firstName, lastName: user.lastName })
  }, [user])

  // Each form gets its own useActionState: error + pending + action in one hook.
  // isPending disables the submit buttons, preventing double-submits.
  const [profileError, submitProfile, isSavingProfile] = useActionState(
    async (_prev: string | null, names: UpdateProfileRequest): Promise<string | null> => {
      try {
        const updated = await usersApi.updateMe(names)
        useAuthStore.getState().setUser(updated)
        addToast('Profile updated', 'success')
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'Failed to update profile'
      }
    },
    null
  )

  const [passwordError, submitPassword, isChangingPassword] = useActionState(
    async (_prev: string | null, passwords: ChangePasswordRequest): Promise<string | null> => {
      if (!passwordPolicy.test(passwords.newPassword)) {
        return 'New password must be at least 8 characters and include upper, lower, number, and special characters.'
      }
      try {
        await usersApi.changePassword(passwords)
        setPasswords({ currentPassword: '', newPassword: '' })
        addToast('Password changed', 'success')
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'Failed to change password'
      }
    },
    null
  )

  const updateProfile = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submitProfile(names)
  }

  const changePassword = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submitPassword(passwords)
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 6, px: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        My profile
      </Typography>
      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Profile details
        </Typography>
        <Box component="form" onSubmit={updateProfile} sx={{ display: 'grid', gap: 2 }}>
          {profileError && <Alert severity="error">{profileError}</Alert>}
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
          <Button type="submit" variant="contained" disabled={isSavingProfile} sx={{ justifySelf: 'start' }}>
            {isSavingProfile ? 'Saving…' : 'Save profile'}
          </Button>
        </Box>
      </Paper>

      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Change password
        </Typography>
        <Box component="form" onSubmit={changePassword} sx={{ display: 'grid', gap: 2 }}>
          {passwordError && <Alert severity="error">{passwordError}</Alert>}
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
          <Button type="submit" variant="contained" disabled={isChangingPassword} sx={{ justifySelf: 'start' }}>
            {isChangingPassword ? 'Changing…' : 'Change password'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
