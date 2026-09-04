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
  user: { id: string; email: string }
}

/** Direct API login — returns the (body) response. The refresh token arrives as an HttpOnly cookie. */
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
 * a real API login through the browser context's request client, so the HttpOnly
 * refresh cookie lands in the context's cookie jar. Only the (non-secret) tenant
 * slug is written to localStorage; the SPA then silently re-auths on boot by
 * exchanging the cookie at POST /auth/refresh.
 */
export async function loginAs(page: Page, creds: Credentials): Promise<void> {
  await page.goto('/login')
  // The login response sets the HttpOnly refresh cookie on the shared context
  // store, which the SPA silently exchanges at POST /auth/refresh on boot. The
  // page renderer does not ingest a freshly-set cookie synchronously, so the
  // boot refresh can race ahead of it and fire with no token (401). We make
  // this deterministic: each attempt does a fresh login (new token), navigates,
  // and waits for the refresh to actually succeed — observed as the cookie
  // value rotating. If the race is lost the attempt throws and we retry. This
  // keeps seeded-session tests reliable without weakening the auth flow.
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await page.context().request.post(`${API_BASE}/auth/login`, {
      headers: { 'X-Tenant-Id': creds.tenantSlug },
      data: { email: creds.email, password: creds.password }
    })
    if (!res.ok()) throw new Error(`Login failed (${res.status()}): ${await res.text()}`)
    await page.evaluate((tenant) => {
      window.localStorage.setItem('tenantSlug', tenant)
      window.localStorage.setItem('hasSession', '1')
    }, creds.tenantSlug)
    const preCookie = (await page.context().cookies()).find((c) => c.name === 'refreshToken')?.value
    await page.goto('/')
    try {
      await expect
        .poll(
          async () => {
            const cookie = (await page.context().cookies()).find((c) => c.name === 'refreshToken')?.value
            return cookie && cookie !== preCookie
          },
          { timeout: 8_000 }
        )
        .toBe(true)
      return
    } catch {
      // Boot refresh lost the race (or the token was revoked by reuse detection);
      // retry from a fresh login.
    }
  }
  throw new Error('loginAs: authenticated session never established after 5 attempts')
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
