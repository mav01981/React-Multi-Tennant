import { test, expect, type Page } from '@playwright/test'
import { loginAs, PLATFORM_ADMIN, selectWorkspaceInForm, filterUsersByWorkspace } from './helpers'

function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function goToTenants(page: Page): Promise<void> {
  await loginAs(page, PLATFORM_ADMIN)
  await page.goto('/tenants')
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible()
}

/** Creates a tenant through the Tenants UI and returns its unique slug. */
async function createTenantViaUi(page: Page): Promise<string> {
  const slug = `e2e-${uniqueSuffix()}`
  await page.getByRole('button', { name: 'New Tenant' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // MUI required fields append an asterisk to the label (e.g. "Name *"), so match by
  // a start-anchored regex — exact "Name" would never match, and plain "Name" is a
  // substring of "Display name".
  await dialog.getByLabel(/^Name/).fill(`E2E Tenant ${slug}`)
  await dialog.getByLabel(/^Display name/).fill(`E2E Workspace ${slug}`)
  await dialog.getByLabel(/^Slug/).fill(slug)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Tenant created')).toBeVisible()
  return slug
}

test.describe('Tenant provisioning', () => {
  test('creates a tenant, rejects a duplicate slug, and soft-deletes it (hidden from list)', async ({ page }) => {
    await goToTenants(page)
    const slug = await createTenantViaUi(page)

    const row = page.locator('tr', { hasText: slug })
    await expect(row).toBeVisible()
    await expect(row.getByText('active')).toBeVisible()

    // Duplicate slug is rejected with an inline error in the dialog.
    await page.getByRole('button', { name: 'New Tenant' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/^Name/).fill('Duplicate')
    await dialog.getByLabel('Slug').fill(slug)
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).toContainText('A tenant with this slug already exists.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Soft-delete: confirmation modal, then the row is hidden from the list.
    await page.getByRole('button', { name: `Delete ${slug}` }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Tenant deleted')).toBeVisible()
    await expect(row).not.toBeVisible()
  })

  test('provisions an admin user into a new tenant, then signs in as them', async ({ page }) => {
    await goToTenants(page)
    const slug = await createTenantViaUi(page)

    // The new workspace starts empty: filter to it and observe zero users.
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await filterUsersByWorkspace(page, slug)
    await expect(page.getByText('No users found')).toBeVisible()

    // Create the workspace's admin via the create-form Workspace picker.
    const email = `admin-${slug}@example.com`
    await page.getByRole('button', { name: 'New user' }).click()
    const form = page.locator('form')
    await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible()
    await form.getByLabel('Email').fill(email)
    await form.getByLabel('First name').fill('Workspace')
    await form.getByLabel('Last name').fill('Admin')
    await form.getByLabel('Password').fill('PlayMe-1!')
    await selectWorkspaceInForm(page, form, slug)
    await form.getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: 'Admin', exact: true }).click()
    await form.getByRole('button', { name: 'Create user', exact: true }).click()
    await expect(page.getByText('User created')).toBeVisible()

    // The list is still filtered to the new workspace, so the row shows there.
    const row = page.locator('tr', { hasText: email })
    await expect(row).toBeVisible()
    // "Admin" must match the role cell exactly — the row also contains the email and
    // the "Workspace Admin" name, both of which contain/equal loose text fragments.
    await expect(row.getByRole('cell', { name: 'Admin', exact: true })).toBeVisible()

    // Sign out and sign in as the new workspace admin.
    await page.goto('/')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel('Workspace').fill(slug)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('PlayMe-1!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/(?!login)/)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    // Landing page shows the workspace the session belongs to (workspace chip).
    await expect(page.getByLabel('Current workspace')).toHaveText(slug)

    // Tenant admins have no tenant-administration UI (feat-05 TEN-07) and no
    // Workspace filter on the Users page (that control is PlatformAdmin-only).
    await expect(page.getByRole('button', { name: 'Tenants' })).toHaveCount(0)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
    await expect(page.getByLabel('Workspace', { exact: true })).toHaveCount(0)
  })

  test('platform admin deletes a user from another workspace via the Workspace filter', async ({ page }) => {
    // Regression: with the Workspace filter listing another workspace's users,
    // DELETE used to silently no-op (204 without removing the record), so the row
    // reappeared after the refetch. It must actually disappear.
    await goToTenants(page)
    const slug = await createTenantViaUi(page)

    await page.goto('/users')
    await filterUsersByWorkspace(page, slug)
    const email = `doomed-${slug}@example.com`
    await page.getByRole('button', { name: 'New user' }).click()
    const form = page.locator('form')
    await form.getByLabel('Email').fill(email)
    await form.getByLabel('First name').fill('Doomed')
    await form.getByLabel('Last name').fill('Member')
    await form.getByLabel('Password').fill('PlayMe-1!')
    await selectWorkspaceInForm(page, form, slug)
    await form.getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: 'ReadOnly', exact: true }).click()
    await form.getByRole('button', { name: 'Create user', exact: true }).click()

    const row = page.locator('tr', { hasText: email })
    await expect(row).toBeVisible()

    // Hard delete removes the record; the refetched (filtered) list drops the row.
    await page.getByRole('button', { name: `Delete ${email}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('User deleted')).toBeVisible()
    await expect(page.getByText('No users found')).toBeVisible()
  })
})
