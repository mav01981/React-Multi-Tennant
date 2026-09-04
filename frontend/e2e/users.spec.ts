import { test, expect, type Page } from '@playwright/test'
import { loginAs, PLATFORM_ADMIN } from './helpers'

function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function goToUsers(page: Page): Promise<void> {
  await loginAs(page, PLATFORM_ADMIN)
  await page.goto('/users')
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
}

test.describe('Admin user management', () => {
  test('creates, searches, edits and deletes a user', async ({ page }) => {
    await goToUsers(page)

    const email = `e2e-${uniqueSuffix()}@example.com`

    // Create
    await page.getByRole('button', { name: 'New user' }).click()
    const form = page.locator('form')
    await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible()
    await form.getByLabel('Email').fill(email)
    await form.getByLabel('First name').fill('E2E')
    await form.getByLabel('Last name').fill('Fresh')
    await form.getByLabel('Password').fill('PlayMe-1!')
    await form.getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: 'ReadOnly', exact: true }).click()
    await form.getByRole('button', { name: 'Create user', exact: true }).click()

    const row = page.locator('tr', { hasText: email })
    await expect(row).toBeVisible()
    await expect(row.getByText('ReadOnly')).toBeVisible()
    await expect(page.getByText('User created')).toBeVisible()

    // Search narrows the list
    await page.getByPlaceholder('Search users...').fill(email)
    await expect(row).toBeVisible()
    await page.getByPlaceholder('Search users...').fill('no-match-at-all')
    await expect(page.getByText('No users found')).toBeVisible()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(row).toBeVisible()

    // Edit → rename
    await page.getByRole('button', { name: `Edit ${email}` }).click()
    const editForm = page.locator('form')
    await expect(page.getByRole('heading', { name: 'Edit user' })).toBeVisible()
    await editForm.getByLabel('First name').fill('Renamed')
    await editForm.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('User updated')).toBeVisible()
    await expect(row.getByText('Renamed Fresh')).toBeVisible()

    // Delete permanently removes the row
    await page.getByRole('button', { name: `Delete ${email}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('User deleted')).toBeVisible()
    // DELETE is a hard delete (the user record is removed), so the list refetch
    // no longer contains the row at all.
    await expect(row).not.toBeVisible()
  })

  test('blocks deleting the sole active admin', async ({ page }) => {
    await goToUsers(page)

    const adminRow = page.locator('tr', { hasText: PLATFORM_ADMIN.email })
    await expect(adminRow).toBeVisible()
    await page.getByRole('button', { name: `Delete ${PLATFORM_ADMIN.email}` }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog).toContainText(/last active admin/i)
  })
})
