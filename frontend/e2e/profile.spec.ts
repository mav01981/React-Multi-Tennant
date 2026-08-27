import { test, expect, type Page } from '@playwright/test'
import { apiCreateUser, apiLogin, loginAs, PLATFORM_ADMIN } from './helpers'

// Profile edits use a dedicated user so we never mutate the bootstrap admin's
// credentials (the rest of the suite depends on admin@example.com staying valid).
const PROFILE = {
  tenantSlug: 'platform',
  email: `profile-${Date.now().toString(36)}@example.com`,
  password: 'ProfileStart-1!'
}

async function seedProfileUser(): Promise<void> {
  const admin = await apiLogin(PLATFORM_ADMIN)
  await apiCreateUser(admin.accessToken, PLATFORM_ADMIN.tenantSlug, {
    email: PROFILE.email,
    firstName: 'Profile',
    lastName: 'Seed',
    password: PROFILE.password,
    roles: ['ReadOnly']
  })
}

async function goToProfile(page: Page): Promise<void> {
  await loginAs(page, { ...PROFILE })
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible()
}

test.beforeAll(async () => {
  await seedProfileUser()
})

test.describe('Profile self-service', () => {
  test('updates name and shows a success toast', async ({ page }) => {
    await goToProfile(page)

    await page.getByLabel('First name').fill('Updated')
    await page.getByLabel('Last name').fill('Name')
    await page.getByRole('button', { name: 'Save profile' }).click()

    await expect(page.getByText('Profile updated')).toBeVisible()
  })

  test('rejects a weak new password before calling the API', async ({ page }) => {
    await goToProfile(page)

    await page.getByLabel('Current password').fill(PROFILE.password)
    await page.getByLabel('New password').fill('short')
    await page.getByRole('button', { name: 'Change password' }).click()

    // Client-side policy check surfaces an error Alert without hitting the API.
    await expect(page.locator('[role="alert"]')).toContainText(/New password must be at least 8 characters/i)
  })

  test('changes the password then reverts without losing the session', async ({ page }) => {
    await goToProfile(page)
    const temp = 'Profile-2ChangePass!'

    await page.getByLabel('Current password').fill(PROFILE.password)
    await page.getByLabel('New password').fill(temp)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()

    // The existing access token survives a password change — change it back so
    // the disabled fixture user remains usable and the revert itself is covered.
    await page.getByLabel('Current password').fill(temp)
    await page.getByLabel('New password').fill(PROFILE.password)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()
  })
})
