import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

/**
 * Shown until the app's auth bootstrap (silent re-auth / roles warm) settles.
 * Keeping it a tiny, mount-in-place splash means the root renders instantly and
 * users see a progress indicator instead of the blank white screen that would
 * result from blocking first paint on network I/O.
 */
export function AuthSplash(): React.JSX.Element {
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
