import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUiStore } from './ui.store'

describe('ui store – theme mode', () => {
  beforeEach(() => {
    localStorage.removeItem('themeMode')
    useUiStore.setState({ themeMode: 'light', toasts: [] })
  })

  it('defaults to light when nothing is persisted', () => {
    expect(useUiStore.getState().themeMode).toBe('light')
  })

  it('toggles between light and dark and persists the choice', () => {
    useUiStore.getState().toggleTheme()
    expect(useUiStore.getState().themeMode).toBe('dark')
    expect(localStorage.getItem('themeMode')).toBe('dark')

    useUiStore.getState().toggleTheme()
    expect(useUiStore.getState().themeMode).toBe('light')
    expect(localStorage.getItem('themeMode')).toBe('light')
  })
})

describe('ui store – toasts', () => {
  beforeEach(() => {
    useUiStore.setState({ themeMode: 'light', toasts: [] })
    // Created fresh per test so the global restore/clear mocks do not leak state.
    // Return unique, deterministic ids so removeToast behaves like production.
    let uid = 0
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
      () => `toast-${++uid}` as ReturnType<typeof crypto.randomUUID>
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a toast with the supplied message and severity', () => {
    useUiStore.getState().addToast('Profile saved', 'success')

    const toasts = useUiStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ id: 'toast-1', message: 'Profile saved', type: 'success' })
  })

  it('defaults the severity to info and auto-removes after the timeout', () => {
    vi.useFakeTimers()
    useUiStore.getState().addToast('Heads up')

    expect(useUiStore.getState().toasts).toHaveLength(1)
    expect(useUiStore.getState().toasts[0].type).toBe('info')

    vi.advanceTimersByTime(4000)
    expect(useUiStore.getState().toasts).toHaveLength(0)
  })

  it('removes a toast on demand', () => {
    useUiStore.getState().addToast('First', 'info')
    useUiStore.getState().addToast('Second', 'warning')

    const second = useUiStore.getState().toasts[1]
    useUiStore.getState().removeToast(second.id)

    const remaining = useUiStore.getState().toasts
    expect(remaining).toHaveLength(1)
    expect(remaining[0].message).toBe('First')
  })
})
