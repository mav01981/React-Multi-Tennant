import { createServer, request } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Serves the production SPA build (`./dist`) so Lighthouse can analyze the real
 * shipped assets, and proxies `/api` to the Identity.API backend that it starts
 * itself. This is the collect.startServerCommand target (see .lighthouserc.cjs).
 *
 * Auth matters: every route except `/login` requires a session, and the pages
 * fetch real data from the API. A bare static server cannot authenticate or
 * load that data, so we run the actual backend + a proxy in one command.
 */
const here = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(here, '..')
const repoRoot = resolve(frontendDir, '..')
const distDir = join(frontendDir, 'dist')

const FRONTEND_PORT = Number(process.env.LIGHTHOUSE_FRONTEND_PORT || 5173)
const API_PORT = Number(process.env.LIGHTHOUSE_API_PORT || 5099)
const API_ORIGIN = `http://localhost:${API_PORT}`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

function waitForHealth(origin, timeoutMs) {
  return new Promise((resolveHealth, rejectHealth) => {
    const start = Date.now()
    const poll = async () => {
      try {
        const res = await fetch(`${origin}/health`)
        if (res.ok) return resolveHealth()
      } catch {
        /* backend not up yet */
      }
      if (Date.now() - start > timeoutMs) return rejectHealth(new Error(`backend at ${origin} did not become ready`))
      setTimeout(poll, 500)
    }
    poll()
  })
}

let server

function shutdown() {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(backend.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      backend.kill('SIGTERM')
    }
  } catch {
    /* backend already gone */
  }
  server?.close()
  process.exit(0)
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? join(distDir, 'index.html') : join(distDir, pathname)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA navigation fallback: any non-asset path hands back index.html.
    filePath = join(distDir, 'index.html')
  }
  // Guard against path traversal outside the dist dir.
  const rel = relative(distDir, filePath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  res.setHeader('Content-Type', MIME[extname(filePath).toLowerCase()] || 'application/octet-stream')
  createReadStream(filePath).pipe(res)
}

function proxyApi(req, res) {
  const target = new URL(req.url, API_ORIGIN)
  const headers = { ...req.headers, host: target.host }
  const proxyReq = request(
    {
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )
  proxyReq.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502)
    res.end(`Bad gateway: ${err.message}`)
  })
  req.pipe(proxyReq)
}

// --- start the backend (EF InMemory auto-reseeds admin@example.com) ---
const backend = spawn(
  'dotnet',
  ['run', '--no-launch-profile', '--project', 'Identity.API', '--urls', `http://localhost:${API_PORT}`],
  {
    cwd: repoRoot,
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development' },
    stdio: 'inherit'
  }
)
backend.on('exit', (code) => {
  if (code !== 0) console.error(`Identity.API exited with code ${code}; serving /api will fail`)
})

server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${FRONTEND_PORT}`)
  const pathname = decodeURIComponent(url.pathname)
  if (pathname.startsWith('/api')) {
    proxyApi(req, res)
  } else {
    serveStatic(req, res, pathname)
  }
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await waitForHealth(API_ORIGIN, 240_000)
console.log(`Identity.API healthy on ${API_ORIGIN}`)

server.listen(FRONTEND_PORT, () => {
  console.log(`ready on http://localhost:${FRONTEND_PORT} (serving ${distDir})`)
})
