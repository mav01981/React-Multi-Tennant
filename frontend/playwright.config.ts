import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Playwright E2E config. The webServer array launches BOTH the ASP.NET Core
// (Identity.API, EF InMemory, port 5099) and the Vite dev server (port 5173,
// which proxies /api -> http://localhost:5099). Because the API uses an
// in-memory DB, every run reseeds a clean dataset (admin@example.com /
// ChangeMe-Admin-1! in the `platform` workspace, plus the `acme` demo tenant).

const frontend = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(frontend, '..')

export default defineConfig({
  testDir: './e2e',
  // The specs share one running backend with mutable user data (create/edit/
  // delete/password-change). Run serially on a single worker to avoid races.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: 'dotnet run --no-launch-profile --project Identity.API --urls http://localhost:5099',
      url: 'http://localhost:5099/health',
      cwd: repoRoot,
      timeout: 240_000,
      env: { ASPNETCORE_ENVIRONMENT: 'Development', ASPNETCORE_URLS: 'http://localhost:5099' },
      // Always start a fresh server (and fresh in-memory seed) so tests are
      // deterministic regardless of any already-running instance.
      reuseExistingServer: false
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      cwd: frontend,
      timeout: 90_000,
      reuseExistingServer: false
    }
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
