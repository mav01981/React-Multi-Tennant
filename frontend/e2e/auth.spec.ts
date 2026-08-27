import { test, expect } from '@playwright/test'
import { PLATFORM_ADMIN } from './helpers'

test.describe('Authentication flows', () => {
  test('unauthenticated visitors are redirected to the login screen', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('logs in a valid platform admin and lands on the dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Workspace').fill(PLATFORM_ADMIN.tenantSlug)
    await page.getByLabel('Email').fill(PLATFORM_ADMIN.email)
    await page.getByLabel('Password').fill(PLATFORM_ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/(?!login)/)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await expect(page.getByText(PLATFORM_ADMIN.email)).toBeVisible()
  })

  test('rejects a wrong password with a visible error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Workspace').fill(PLATFORM_ADMIN.tenantSlug)
    await page.getByLabel('Email').fill(PLATFORM_ADMIN.email)
    await page.getByLabel('Password').fill('totally-wrong-1!')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Email or password is incorrect.')).toBeVisible()
  })

  test('rejects an unknown workspace with a visible error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Workspace').fill('no-such-tenant')
    await page.getByLabel('Email').fill(PLATFORM_ADMIN.email)
    await page.getByLabel('Password').fill(PLATFORM_ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Unknown workspace. Check the tenant name.')).toBeVisible()
  })
})
