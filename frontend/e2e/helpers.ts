import { expect, type Page } from '@playwright/test'

// The API is reached directly (bypasses the Vite proxy) so seeding and login can
// happen from test code reliably.
export const API_BASE = 'http://localhost:5099/api/v1'

export const PLATFORM_ADMIN = {
  tenantSlug: 'platform',
  email: 'admin@example.com',
  password: 'ChangeMe-Admin-1!'
} as const

export interface Credentials {
  tenantSlug: string
  email: string
  password: string
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string }
}

/** Direct API login — returns the token pair. */
export async function apiLogin(creds: Credentials): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': creds.tenantSlug },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  })
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`)
  return (await res.json()) as LoginResponse
}

/**
 * Seeds a full authenticated session without going through the login UI: performs
 * a real API login, writes the access/refresh tokens + tenant slug into the page's
 * localStorage, then reloads so `main.tsx` bootstrap hydrates the auth state.
 */
export async function loginAs(page: Page, creds: Credentials): Promise<void> {
  const tokens = await apiLogin(creds)
  await page.goto('/login')
  await page.evaluate(
    ({ access, refresh, tenant }) => {
      window.localStorage.setItem('accessToken', access)
      window.localStorage.setItem('refreshToken', refresh)
      window.localStorage.setItem('tenantSlug', tenant)
    },
    { access: tokens.accessToken, refresh: tokens.refreshToken, tenant: creds.tenantSlug }
  )
  await page.goto('/')
}

/** Creates a user via the API using an admin bearer token. */
export async function apiCreateUser(
  adminToken: string,
  tenantSlug: string,
  data: { email: string; firstName: string; lastName: string; password: string; roles: string[] }
): Promise<void> {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantSlug,
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error(`User create failed (${res.status}): ${await res.text()}`)
}

/** Picks a Role inside the create/edit user form (the only <select> in that form). */
export async function selectRoleInForm(page: Page, form: ReturnType<Page['locator']>, role: string): Promise<void> {
  await form.getByRole('combobox').click()
  await page.getByRole('option', { name: role, exact: true }).click()
}

export { expect }
export type { Page }
