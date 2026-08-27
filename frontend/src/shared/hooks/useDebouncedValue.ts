import { useEffect, useState } from 'react'

/**
 * Returns a copy of `value` that only updates after `delay` ms pass with no
 * further change — the classic debounced-input primitive. Each change to
 * `value` (or `delay`) cancels the pending timer and restarts it, so a rapidly
 * typed search string settles only once the user actually pauses.
 *
 * This centralises the timer + cleanup bookkeeping that call sites would
 * otherwise hand-write with a `useEffect` + `setTimeout`/`clearTimeout` pair.
 *
 * Typical search-box usage — sync the settled value into a store filter:
 * @example
 *   const debounced = useDebouncedValue(searchInput, 300)
 *   useEffect(() => {
 *     if (debounced !== filters.search) setSearch(debounced)
 *   }, [debounced, filters.search, setSearch])
 *
 * @param value The raw value to debounce (e.g. live `searchInput` state).
 * @param delay Debounce window in milliseconds (default 300).
 * @returns The value that has been stable for `delay` ms.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
