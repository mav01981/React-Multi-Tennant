import { RequirePermission } from '@/features/roles/PermissionRoute'

/**
 * Admin user-management route guard. Gated on the `users.read` permission (not a
 * bare role name) per feat-04 §5 — a Manager holding `users.read` may open the
 * Users view, while a plain User is bounced. The backend independently enforces
 * the same permission so this stays a UX convenience, never a security boundary.
 */
export function AdminOnly(): React.JSX.Element {
  return <RequirePermission permission="users.read" />
}
