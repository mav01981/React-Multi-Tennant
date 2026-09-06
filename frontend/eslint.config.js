import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '*.tsbuildinfo',
      '*.tsbuildinfo.*',
      '.lighthanterc.cjs',
      '.lighthouserc.cjs'
    ]
  },

  // Base recommended rules (ECMAScript), on top of which TypeScript rules layer.
  js.configs.recommended,

  // TypeScript-aware recommended rules (type-checked rules intentionally off to
  // keep lint fast and orthogonal to `tsc`/`npm run typecheck`).
  ...tseslint.configs.recommended,

    // Applies to all frontend source + tooling config. Browser globals for `src`,
  // Node globals for config/tooling files (both are TS here).
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts', 'playwright.config.ts', 'scripts/**/*.{mjs,cjs}', '.lighthanterc.cjs', '**/*.cjs'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },

  // CommonJS config/script files legitimately use require() — the
  // no-require-imports rule (from tseslint.recommended) targets TS source,
  // not .cjs files. Turn it off for the *.cjs glob so LHCI/puppeteer CJS
  // tooling lints cleanly.
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },

  // React Hooks rules — the explicit "at minimum" ask: flag hook-rule violations
  // and missing/stale dependency arrays.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // Turn off any stylistic rules so Prettier owns formatting (no conflicts).
  prettier
)
