import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './providers/ThemeProvider'
import { useAuthStore } from '@/features/auth/auth.store'
import { useRolesStore } from '@/features/roles/roles.store'

// Hydrate auth state before first render: if an access token was
// seeded from localStorage, attempt silent re-auth against /auth/me; on failure
// the store clears the session and the user sees the login screen.
const bootstrap = async (): Promise<void> => {
  if (useAuthStore.getState().accessToken) {
    await useAuthStore.getState().fetchCurrentUser()
  }

  // Warm the roles cache (feat-04 §3): lazily loaded once at app init when there
  // is an active session, so permission-derived nav/guards are correct on paint.
  if (useAuthStore.getState().accessToken) {
    await useRolesStore.getState().fetchRoles()
  }

  const container = document.getElementById('root')!
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        {/* MUI ThemeProvider reads ui.themeMode for the light/dark palette */}
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>
  )
}

void bootstrap()
