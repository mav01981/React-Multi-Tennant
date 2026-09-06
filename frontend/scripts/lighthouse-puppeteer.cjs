/**
 * Puppeteer script for Lighthouse CI multi-page collection.
 *
 * Runs once per URL (before that URL's Lighthouse runs) inside the single
 * browser LHCI shares with Lighthouse (via the debug port). It authenticates
 * so every protected route can be audited with a real session:
 *
 *   - For `/login` it does nothing but load the page (the public login form).
 *   - For every other route it performs a real login THROUGH the app origin's
 *     `/api` proxy (same origin -> the HttpOnly refresh cookie is set for
 *     localhost and the backend returns a fresh access token), seeds the
 *     app's non-secret localStorage (tenantSlug / hasSession), then navigates
 *     to the target URL and waits for the SPA to finish booting (splash-gone).
 *
 * Auth persists into Lighthouse's own navigations because collect.settings
 * `.disableStorageReset` is true (see .lighthouserc.cjs), so Lighthouse does
 * NOT clear the origin's cookies/localStorage between runs.
 */
const FRONTEND_PORT = Number(process.env.LIGHTHOUSE_FRONTEND_PORT || 5173)
const ORIGIN = `http://localhost:${FRONTEND_PORT}`

// The EF InMemory backend reseeds this bootstrap admin on startup (matches e2e).
const ADMIN = {
  email: 'admin@example.com',
  password: 'ChangeMe-Admin-1!',
  tenant: 'platform'
}

const SPLASH_SELECTOR = '[aria-label="Loading"]'

/** Log in via the app origin's /api proxy, then seed the app's localStorage. */
async function login(page) {
  const result = await page.evaluate(async (creds) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': creds.tenant },
      body: JSON.stringify({ email: creds.email, password: creds.password })
    })
    if (!res.ok) throw new Error(`Login failed (${res.status})`)
  }, ADMIN)
  await page.evaluate((tenant) => {
    window.localStorage.setItem('tenantSlug', tenant)
    window.localStorage.setItem('hasSession', '1')
  }, ADMIN.tenant)
  return result
}

/**
 * Wait until the app's auth splash is gone (boot settled). Returns true when the
 * page resolved to real content, or false on timeout.
 */
async function waitForReady(page) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const state = await page.evaluate((sel) => {
      const splash = document.querySelector(sel)
      return {
        splashGone: !splash,
        path: window.location.pathname
      }
    }, SPLASH_SELECTOR)
    if (state.splashGone) return state
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  }
  return null
}

module.exports = async function lighthouseAuth(browser, { url }) {
  const target = new URL(url)
  const page = await browser.newPage()

  try {
    if (target.pathname === '/login') {
      // Public login form — audit it as an unauthenticated visitor.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await waitForReady(page)
      return
    }

    // Protected route: authenticate, then navigate to the target and let the
    // SPA boot (exchanging the refresh cookie). Retry the cookie-race like the
    // e2e helpers do: a fresh login per attempt makes it deterministic.
    let lastError
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await login(page)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        const ready = await waitForReady(page)
        if (!ready) throw new Error('app did not settle (timed out waiting for splash)')
        if (ready.path === '/login') throw new Error('redirected to /login (session not established)')
        return
      } catch (err) {
        lastError = err
      }
    }
    throw lastError || new Error(`unable to authenticate for ${url}`)
  } finally {
    await page.close()
  }
}
