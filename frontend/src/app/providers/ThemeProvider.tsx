import { useMemo, type ReactNode } from 'react'
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { useUiStore } from '@/shared/ui/ui.store'

/**
 * MUI theme provider bound to the `ui` store's themeMode (light/dark) preference. The theme is memoized to avoid unnecessary recompositions on every render.
 * The palette is recomposed whenever the persisted light/dark preference changes,
 * and CssBaseline normalizes styles + applies the palette background globally.
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const mode = useUiStore((s) => s.themeMode)

  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode },
        typography: {
          fontFamily: ['Inter', 'Roboto', 'sans-serif'].join(',')
        },
        shape: { borderRadius: 8 }
      }),
    [mode]
  )

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  )
}