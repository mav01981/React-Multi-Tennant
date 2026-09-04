import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

/**
 * Suspense fallback shown while a lazily-loaded route chunk is fetched and
 * evaluated. Kept tiny and eager so it renders instantly during navigation.
 */
export function RouteFallback(): React.JSX.Element {
  return (
    <Box
      aria-label="Loading"
      aria-busy="true"
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
    >
      <CircularProgress />
    </Box>
  )
}
