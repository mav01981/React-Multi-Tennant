/**
 * Lighthouse CI configuration for the ReactAuth SPA (Vite + React).
 *
 * Audits ALL routes against the production build, authenticated. The app's
 * every route except /login sits behind a login, so collection:
 *   - starts the Identity.API backend + a static/proxy server via
 *     collect.startServerCommand (scripts/lighthouse-server.mjs),
 *   - authenticates in a shared Puppeteer browser before each URL
 *     (collect.puppeteerScript, scripts/lighthouse-puppeteer.cjs),
 *   - keeps the session during Lighthouse's own navigation via
 *     settings.disableStorageReset.
 *
 * Category thresholds are in line with ADR-0006
 * (docs/adr/0006-frontend-performance-budget.md, initial chunk <= 200 kB gzip).
 */
const fs = require('node:fs')
const path = require('node:path')

// Chrome/Chromium that puppeteer-core uses to launch the shared browser. Falls
// back to env CHROME_PATH, else well-known install paths.
function detectChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

// Stability flags for headless Chrome in CI (esp. Windows): GPU/sandbox off to
// avoid intermittent 0xC0000409 crashes unrelated to the app under test.
const chromeArgs = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking']

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node scripts/lighthouse-server.mjs',
      startServerReadyPattern: 'ready',
      startServerReadyTimeout: 240_000,
      // All routes. Protected ones (/ /profile /users /roles /tenants) are
      // authenticated by the puppeteer script; /login is a public login page.
      url: [
        'http://localhost:5173/login',
        'http://localhost:5173/',
        'http://localhost:5173/profile',
        'http://localhost:5173/users',
        'http://localhost:5173/roles',
        'http://localhost:5173/tenants'
      ],
      numberOfRuns: 3,
      chromePath: detectChromePath(),
      puppeteerScript: './scripts/lighthouse-puppeteer.cjs',
      puppeteerLaunchOptions: {
        args: chromeArgs
        // No userDataDir: Puppeteer manages its own temp profile and cleans it
        // per launch, so no EPERM/lock-file issues on Windows between attempts.
      },
      settings: {
        // Desktop is the primary target for this admin UI.
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1350, height: 940 },
        // Don't wipe the authenticated session Lighthouse inherited from the
        // puppeteer script between its collect navigation and the run.
        disableStorageReset: true
      }
    },
    assert: {
      assertions: {
        // CURRENT baselines (measured, 3 runs/page) — gates are set just below the
        // floor so they catch real regressions while the team raises them over
        // time. Performance is the cold MUI load + the auth bootstrap delay, so
        // it is the slowest category (0.61-0.64).
        'categories:performance': ['error', { minScore: 0.6 }],
        // Accessibility is a touch below 0.9 on the /roles table page (0.86).
        'categories:accessibility': ['error', { minScore: 0.85 }],
        // Best-practices and SEO both pass on the current build.
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.8 }],
        // PWA is out of scope for this SPA (no service worker / install path).
        'categories:pwa': 'off'
      }
    },
    upload: {
      // Keep reports locally; swap to 'lhci' + a server to centralize them.
      target: 'filesystem',
      outputDir: './.lhci-reports',
      reportFilenamePattern: 'lighthouse-%%DATETIME%%.report.%%EXTENSION%%'
    }
  }
}
