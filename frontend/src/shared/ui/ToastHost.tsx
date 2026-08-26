import Snackbar from '@mui/material/Snackbar'
import Alert, { type AlertColor } from '@mui/material/Alert'
import { useUiStore } from './ui.store'

// Map the ui store's toast type to an MUI Alert severity.
const SEVERITY: Record<string, AlertColor> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info'
}

/**
 * Global toasts host (Store Integration): subscribes to the `ui`
 * store's toasts and renders each as an MUI Snackbar + Alert. One Alert per
 * toast so severity styling and dismiss apply per notification.
 */
export function ToastHost(): React.JSX.Element {
  const toasts = useUiStore((state) => state.toasts)
  const removeToast = useUiStore((state) => state.removeToast)

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1400 }}>
      {toasts.map((toast) => (
        <Snackbar
          key={toast.id}
          open
          autoHideDuration={4000}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          onClose={() => removeToast(toast.id)}
        >
          <Alert
            severity={SEVERITY[toast.type] ?? 'info'}
            variant="filled"
            onClose={() => removeToast(toast.id)}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      ))}
    </div>
  )
}