import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

interface UiState {
  themeMode: ThemeMode
  toasts: Toast[]
  toggleTheme: () => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

// Persist theme preference (mirrors the accessToken localStorage hydration pattern).
const THEME_KEY = 'themeMode'

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

export const useUiStore = create<UiState>((set) => ({
  themeMode: readThemeMode(),
  toasts: [],
  toggleTheme: () =>
    set((state) => {
      const next: ThemeMode = state.themeMode === 'light' ? 'dark' : 'light'
      window.localStorage.setItem(THEME_KEY, next)
      return { themeMode: next }
    }),
  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), 4000)
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))