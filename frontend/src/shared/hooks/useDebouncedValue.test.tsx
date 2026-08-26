import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns the initial value on first render, before any timer elapses', () => {
    const { result } = renderHook(() => useDebouncedValue('users', 300))
    expect(result.current).toBe('users')
  })

  it('emits a changed value only after the delay elapses', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    // Debounce not yet elapsed → still the previous settled value.
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('ab')
  })

  it('restarts the timer on each change, so only the trailing value wins', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'abc' }) // new keystroke at 200ms → pending timer is cancelled
    act(() => {
      vi.advanceTimersByTime(200)
    })
    // 400ms elapsed overall, but the latest change was only 200ms ago.
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('abc')
  })
})