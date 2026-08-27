import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './providers/ThemeProvider'
import { useAuthStore } from '@/features/auth/auth.store'
import { useRolesStore } from '@/features/roles/roles.store'

// Mount immediately — first paint is NEVER blocked by network I/O. Auth state
// (and the roles cache) is hydrated asynchronously below: until `isInitialized`
// flips, the routed App renders a lightweight splash instead of a blank screen,
// then reconciles through the reactive stores once hydration settles. A slow or
// hung API therefore delays auth, never the mount, and the app can no longer
// fail to render on a rejected bootstrap.
const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <BrowserRouter>
      {/* MUI ThemeProvider reads ui.themeMode for the light/dark palette */}
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
)

void (async () => {
  // Hydrate auth: if an access token was seeded from localStorage, attempt silent
  // re-auth against /auth/me; on failure the store clears the session and the
  // user sees the login screen.
  await useAuthStore.getState().initialize()

  // Warm the roles cache (feat-04 §3): lazily loaded once at app init when there
  // is an active session, so permission-derived nav/guards are correct on paint.
  // The roles store fails closed — a user without `roles.read` gets a 403 and the
  // store marks the catalog loaded-empty rather than throwing.
  if (useAuthStore.getState().accessToken) {
    await useRolesStore.getState().fetchRoles()
  }
})().catch((err) => {
  // Last-resort guard: a rejected bootstrap must never leave the app stuck on
  // the splash. Mark initialized so the (unguarded) app renders and the user at
  // least reaches the login screen.
  console.error('App bootstrap failed:', err)
  useAuthStore.setState({ isInitialized: true })
})
