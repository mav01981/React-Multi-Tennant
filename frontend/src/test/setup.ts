import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Ensure the DOM is torn down between tests regardless of environment globals.
afterEach(() => {
  cleanup()
})

beforeEach(() => {
  // Start each test from a clean storage surface (stores mirror localStorage).
  window.localStorage.clear()
})