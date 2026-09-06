import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Runs `lhci autorun` (collect -> assert -> upload) with hardening for Windows.
 *
 * Why this wrapper exists:
 * The bundled Lighthouse (via chrome-launcher) creates a temp Chrome profile and
 * deletes it right after the audit. On Windows that cleanup throws
 * `EPERM: Permission denied` because a file handle in the profile dir is still
 * locked (often by AV / Windows Defender real-time scanning). The gather itself
 * succeeds — the deletion just makes Lighthouse exit 1 and abort the run.
 *
 * Mitigations:
 *  1. The postinstall hook (scripts/patch-chrome-launcher.mjs) wraps chrome-
 *     launcher's destroyTmp() in a try/catch so the transient cleanup EPERM is
 *     swallowed (the report is already written), so a failed prune can't abort
 *     the run.
 *  2. TMP/TEMP/TMPDIR point at a local dir under the repo so profile temp files
 *     never land in the system TEMP that AVs tend to watch.
 *  3. If a run still fails with a transient runtime error (Chrome crash during
 *     collect, a locked temp dir, a network blip) — but NOT an assertion/budget
 *     failure — we retry up to 3 attempts.
 *
 * Puppeteer is given no userDataDir, so it manages its own temp profile and
 * cleans it up per launch; that keeps this wrapper free of any profile-dir
 * state (no lock files, no lingering processes between attempts).
 */
const root = dirname(fileURLToPath(import.meta.url))
// lhci must run from the frontend dir (parent of ./scripts) so it resolves
// ./.lighthouserc.cjs and the backend/static server it references.
const frontendDir = resolve(root, '..')
const tmpDir = resolve(frontendDir, '.lighthouseci-tmp')
mkdirSync(tmpDir, { recursive: true })

const command = 'npx lhci autorun --config=./.lighthouserc.cjs'

function run() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, {
      cwd: frontendDir,
      env: { ...process.env, TEMP: tmpDir, TMP: tmpDir, TMPDIR: tmpDir },
      // Inherit stdout, but tee stderr so we can detect the transient error
      // signature for the retry while still showing it on the terminal.
      stdio: ['inherit', 'inherit', 'pipe'],
      shell: true
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      process.stderr.write(chunk)
    })
    child.on('exit', (code) => {
      if (code === 0) resolveRun()
      else rejectRun(new Error(`lhci autorun exited with code ${code}${stderr ? `\n${stderr}` : ''}`))
    })
    child.on('error', rejectRun)
  })
}

// Only transient runtime failures (Chrome crashing during collect, or the
// Windows temp-profile cleanup EPERM race) are retried. Real gate failures —
// a category score dropping below its budget — print an "Assertion" message
// and are re-thrown immediately so the budget gate still protects the app.
const looksNonRetryable = (err) => /assertion/i.test(String(err.message))

const maxAttempts = 3
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await run()
    break
  } catch (err) {
    if (attempt === maxAttempts || looksNonRetryable(err)) throw err
    console.error(`Lighthouse CI attempt ${attempt} failed with a transient runtime error; retrying...`)
    console.error(`  ${err.message}`)
  }
}
