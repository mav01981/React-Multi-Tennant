import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * postinstall patch for the chrome-launcher bundled with Lighthouse.
 *
 * On Windows, chrome-launcher's `destroyTmp()` calls `rmSync(userDataDir)`
 * immediately after `taskkill /F`. Chrome is usually already dead ("process
 * not found"), but its file handles in the temp profile dir are not yet
 * released, so the rmSync throws `EPERM: Permission denied`. That error is
 * thrown synchronously from `kill()` and crashes the whole Lighthouse run
 * (exit code 1) even though the report was already generated.
 *
 * The fix: wrap that rmSync in a try/catch that swallows a transient cleanup
 * EPERM. Results are saved before kill/cleanup, so a failed prune is harmless,
 * and the `close` handler's second destroyTmp() normally succeeds once handles
 * are released.
 */
const MARK = '/* patched: ignore transient EPERM during chrome profile cleanup */'

// All the bundled chrome-launcher copies we may need to patch.
const candidates = [
  'node_modules/@lhci/cli/node_modules/lighthouse/node_modules/chrome-launcher/dist/chrome-launcher.js',
  'node_modules/lighthouse/node_modules/chrome-launcher/dist/chrome-launcher.js'
]

const from = 'rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 10 });'
const patched = `try {\n    ${from}\n  } catch (_e) {\n    ${MARK}\n  }`

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

for (const rel of candidates) {
  const file = resolve(root, rel)
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    continue // path not present in this install; nothing to patch
  }
  if (src.includes(MARK)) {
    continue // already patched
  }
  if (!src.includes(from)) {
    console.warn(`[patch-chrome-launcher] source pattern not found in ${rel}; skipping`)
    continue
  }
  writeFileSync(file, src.replace(from, patched))
  console.log(`[patch-chrome-launcher] patched ${rel}`)
}
