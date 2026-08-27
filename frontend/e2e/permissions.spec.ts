import { test, expect } from '@playwright/test'
import { apiCreateUser, apiLogin, loginAs, PLATFORM_ADMIN } from './helpers'

const suffix = Date.now().toString(36)
const READONLY = { tenantSlug: 'platform', email: `reader-${suffix}@example.com`, password: 'ReadPass-9!' }

test.beforeAll(async () => {
  const admin = await apiLogin(PLATFORM_ADMIN)
  await apiCreateUser(admin.accessToken, PLATFORM_ADMIN.tenantSlug, {
    email: READONLY.email,
    firstName: 'Role',
    lastName: 'Reader',
    password: READONLY.password,
    roles: ['ReadOnly']
  })
})

test.describe('Permission-based access (feat-04)', () => {
  test('an admin can open user management and sees delete actions', async ({ page }) => {
    await loginAs(page, PLATFORM_ADMIN)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()

    // Admin / PlatformAdmin hold users.delete, so every row shows a delete action.
    await expect(page.locator('button[aria-label^="Delete "]').first()).toBeVisible()
  })

  test('a ReadOnly user is denied the user-management route and redirected home', async ({ page }) => {
    await loginAs(page, READONLY)
    await page.goto('/users')

    // users.read is not granted to a ReadOnly member, so the route guard
    // (and, independently, the backend) deny /users and bounce to the landing page.
    await expect(page).toHaveURL(/\/(?!users)/)
    await expect(page.getByRole('heading', { name: 'User Management' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Users' })).toHaveCount(0)
  })
})
