import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastHost } from './ToastHost'
import { useUiStore } from './ui.store'

beforeEach(() => {
  useUiStore.setState({ themeMode: 'light', toasts: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastHost', () => {
  it('renders an empty host when there are no toasts', () => {
    render(<ToastHost />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a toast pushed to the ui store and removes it on demand', () => {
    render(<ToastHost />)

    act(() => {
      useUiStore.getState().addToast('Profile saved', 'success')
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Profile saved')

    const id = useUiStore.getState().toasts[0].id
    act(() => {
      useUiStore.getState().removeToast(id)
    })

    expect(screen.queryByText('Profile saved')).not.toBeInTheDocument()
  })

  it('auto-dismisses a toast after its timeout elapses', () => {
    vi.useFakeTimers()
    render(<ToastHost />)

    act(() => {
      useUiStore.getState().addToast('Expiring soon', 'info')
    })
    expect(screen.getByText('Expiring soon')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Expiring soon')).not.toBeInTheDocument()
  })
})
