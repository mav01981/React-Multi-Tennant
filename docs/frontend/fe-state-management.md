# Frontend: State Management (Zustand)

> **Scope:** Frontend-only — how the React client manages application state.
> **Stack:** React 18 + TypeScript + Vite + Zustand (see `adr/0001-react-frontend-stack.md`).
> **Code:** `frontend/src/features/*/*.store.ts`, `frontend/src/shared/ui/ui.store.ts`.

---

## 1. Store Composition

There is **no root store**. Zustand stores are standalone modules created with
`create()`, one per domain, colocated with their feature:

```
 frontend/src/features/auth/auth.store.ts         auth
 frontend/src/features/users/users.store.ts       users
 frontend/src/features/tenants/tenants.store.ts   tenants
 frontend/src/features/roles/roles.store.ts       roles
 frontend/src/shared/ui/ui.store.ts               ui
```

Each store is plain module scope — no provider, no context, no `app.use()`.
Components subscribe with hooks; non-React code (the API client) reads state
imperatively via `useStore.getState()` (see §7).

| Store | Owns | Persistence |
|-------|------|-------------|
| `auth` | `user`, tokens, `tenantSlug`, boot state | localStorage (tokens + tenant slug) |
| `users` | admin user list, filters, pagination | none (API cache + abort guard) |
| `tenants` | tenant list, filters, pagination | none (API cache + abort guard) |
| `roles` | role catalog + permission cache | none (static, fail closed) |
| `ui` | theme mode, toasts | localStorage (`themeMode`) |

## 2. `auth` Store — Identity, Tokens, Login State

**State:** `user: UserDto | null`, `accessToken`, `refreshToken`, `tenantSlug`,
`isLoading`, `error`, `isInitialized` (tokens + tenant slug seeded from
localStorage at module init).

**Selectors (exported pure functions):** `selectIsAuthenticated`,
`selectIsAdmin`, `selectIsManager`, `selectFullName`, `selectInitials`.

**Actions:** `login`, `logout`, `fetchCurrentUser`, `refreshAccessToken`,
`initialize`, `setUser`.

### Session helpers

```ts
function setSession(set, response: LoginResponse, tenantSlug?: string): void {
  set({ accessToken: response.accessToken, refreshToken: response.refreshToken,
        user: response.user, ...(tenantSlug !== undefined ? { tenantSlug } : {}) })
  localStorage.setItem('accessToken', response.accessToken)
  localStorage.setItem('refreshToken', response.refreshToken)
  if (tenantSlug !== undefined) localStorage.setItem('tenantSlug', tenantSlug)
}

function clearSession(set): void {
  set({ user: null, accessToken: null, refreshToken: null })
  localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken')
}
```

**Rules:**
- Token persistence is localStorage-backed (matches `contracts/auth-flow.md` §2).
- `login()` passes the attempted `tenantSlug` into `setSession`, so the workspace
  slug is persisted **only on success** — a failed login never leaks it into
  state or storage. The slug travels to the API as an explicit `X-Tenant-Id`
  header on the login request itself (`features/auth/api.ts`).
- `logout()` always runs `clearSession()` even if the API call fails.
- `fetchCurrentUser()` clears the session on a 401/403 and re-throws; other
  errors propagate untouched.
- `refreshAccessToken()` returns the new access token, or `null` when no tokens
  are present; on a rejected refresh it re-throws. Clearing the session on a
  failed *silent* refresh is the API client's job (`doRefresh` →
  `onSessionCleared`).
- `setUser(user | null)` is the single entry point for swapping the identity, so
  future derived state / side effects stay inside the store instead of being
  skipped by raw `setState({ user })` calls.
- `initialize()` is the boot hydration gate (see §8) and always settles
  `isInitialized`, whether silent re-auth succeeds, finds no token, or fails.

### Client-handler registration

At module load the store registers itself with `setAuthHandlers()` so the API
client can read/rotate tokens without importing the store (no circular import):

```ts
setAuthHandlers({
  getTokens, getTenantSlug,
  onSessionUpdated: (tokens) => useAuthStore.setState({ ...tokens }),
  onSessionCleared: () => clearSession(useAuthStore.setState.bind(useAuthStore))
})
```

## 3. `users` Store — Admin User CRUD + Filters

**State:** `items[]`, `totalCount`, `selectedUserId`,
`filters { search, role, status, page, pageSize }`, `isLoading`, `error`.

**Selectors:** `selectSelectedUser`, `selectTotalPages`, `selectHasNextPage`,
`selectHasPrevPage`.

**Actions:** `fetchUsers`, `createUser`, `updateUser`, `deleteUser`, `setPage`,
`setSearch`, `setRole`, `setStatus`, `setSelectedUserId`, `clearError`.

**Rules:**
- `setSearch` / `setRole` / `setStatus` reset `page` to 1 and refetch.
- `setPage` clamps to `[1, totalPages]` and refetches.
- Mutating actions update `items`/`totalCount` from the API response and
  re-throw on failure so the page keeps its own error handling.

### Request-cancellation race guard

`fetchUsers` holds a module-level `AbortController` and **aborts any in-flight
request before starting a new one**, so rapidly changing filters can never let a
stale response overwrite a fresh one. An aborted request commits nothing and
suppresses its error; only the latest request may clear `isLoading`.

```ts
fetchUsers: async () => {
  fetchAbortController?.abort()                  // cancel the previous request
  const controller = new AbortController()
  fetchAbortController = controller
  set({ isLoading: true, error: null })
  try {
    const { filters } = get()
    const response = await usersApi.getAll({ ...filters }, controller.signal)
    if (controller.signal.aborted) return        // superseded → commit nothing
    set({ items: response.items, totalCount: response.totalCount })
  } catch (err) {
    if (controller.signal.aborted) return
    set({ error: err instanceof Error ? err.message : 'Failed to load users' })
  } finally {
    if (fetchAbortController === controller) {   // only the latest clears loading
      fetchAbortController = null
      set({ isLoading: false })
    }
  }
}
```

### Cross-store rule

```ts
async function updateUser(id: string, data: UpdateUserRequest) {
  const updated = await usersApi.update(id, data)
  set(/* patch items in place */)
  // If an admin edited their own user, refresh identity (roles may have changed):
  const authStore = useAuthStore.getState()
  if (authStore.user && id === authStore.user.id) await authStore.fetchCurrentUser()
}
```

## 4. `tenants` Store — Superadmin Tenant CRUD

Same shape and conventions as `users` (§3), including the abort race guard:
**state** `items[]`, `totalCount`, `selectedTenantId`,
`filters { search, page, pageSize }`, `isLoading`, `error`; **selectors**
`selectSelectedTenant`, `selectTotalPages`, `selectHasNextPage`,
`selectHasPrevPage`; **actions** `fetchTenants`, `createTenant`, `updateTenant`,
`deleteTenant`, `setPage`, `setSearch`, `setSelectedTenantId`, `clearError`.

## 5. `roles` Store — On-Demand Cache

**State:** `roles: RoleDto[]`, `isLoading`, `hasLoaded`.
**Action:** `fetchRoles()` (guarded by `hasLoaded` to load exactly once).

**Fail closed:** a caller without `roles.read` receives a 403; the store treats
that as *loaded-but-empty* (`roles: []`, `hasLoaded: true`) rather than throwing,
so permission guards resolve to "denied" instead of leaving the UI stuck loading.

**Permission hook** (memoized, fail-closed):

```ts
export function useHasPermission(permission: string): boolean {
  const user = useAuthStore((s) => s.user)
  const roles = useRolesStore((s) => s.roles)
  return useMemo(() => {
    if (!user || roles.length === 0) return false
    return roles.filter(r => user.roles.includes(r.name))
                .some(r => r.permissions.includes(permission))
  }, [user, roles, permission])
}
```

## 6. `ui` Store — Theme + Toasts

**State:** `themeMode: 'light' | 'dark'` (persisted to localStorage key
`themeMode`), `toasts[]`.

**Actions:** `toggleTheme`, `addToast(message, type = 'info')`, `removeToast(id)`.

```ts
interface Toast { id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }
```

`addToast` auto-removes the toast after 4000 ms. There is **no global modal
store** — dialogs are local state via the `useEntityEditorState` hook (§7).

## 7. Component Usage Pattern

```tsx
import { useShallow } from 'zustand/react/shallow'
import { useUsersStore } from '@/features/users/users.store'
import { useAuthStore, selectIsAdmin } from '@/features/auth/auth.store'
import { useUiStore } from '@/shared/ui/ui.store'

const items = useUsersStore((s) => s.items)          // subscribe to a slice
const isAdmin = useAuthStore(selectIsAdmin)          // …or an exported selector

// Group several stable fields/actions into ONE subscription (shallow equality):
const { items, isLoading, filters } = useUsersStore(
  useShallow((s) => ({ items: s.items, isLoading: s.isLoading, filters: s.filters }))
)
const { createUser, deleteUser } = useUsersStore(
  useShallow((s) => ({ createUser: s.createUser, deleteUser: s.deleteUser }))
)
useUiStore.getState().addToast('User deleted', 'success')  // actions are plain functions
```

**Rules:**
- Always pass a **selector** — `useStore()` with no selector re-renders on every
  store change.
- Use `useShallow` for object slices; never build a fresh object literal without
  it (new identity each render → re-render on every store change).
- Select **actions** into a shallow slice too: they are stable references, so
  the slice never triggers re-renders.
- Use `useStore.getState()` for **imperative** access outside render (event
  handlers, boot code, other stores, the API client) — never to subscribe.
- Derived values come from exported selectors or are computed locally; wrap
  pure/expensive derivations in `useMemo`.
- Never mutate store state from a component: call actions (or the store's own
  `set` inside its definition).

## 8. Store Hydration on App Mount

The root mounts **first**, synchronously — first paint is never blocked by
network I/O. Hydration then runs in the background and the routed tree is gated
on `auth.isInitialized`, with an `AuthSplash` replacing what would otherwise be
a blank screen:

```tsx
// frontend/src/app/main.tsx
const root = createRoot(document.getElementById('root')!)
root.render(<StrictMode><BrowserRouter><ThemeProvider><App /></ThemeProvider></BrowserRouter></StrictMode>)

void (async () => {
  await useAuthStore.getState().initialize()          // silent re-auth via /auth/me
  if (useAuthStore.getState().accessToken) {
    await useRolesStore.getState().fetchRoles()       // warm the permission cache
  }
})().catch((err) => {
  console.error('App bootstrap failed:', err)
  useAuthStore.setState({ isInitialized: true })      // never leave the splash up
})
```

```tsx
// frontend/src/app/App.tsx
const isInitialized = useAuthStore((s) => s.isInitialized)
if (!isInitialized) return <AuthSplash />
```

Guards therefore never evaluate against a half-hydrated session, and a rejected
bootstrap always reaches the login screen.

## 9. Decision Matrix (from plan §5)

| Feature | Store needed? |
|---------|---------------|
| Login/logout | ✅ `auth` — tokens persist across routes |
| Current user | ✅ `auth` — navbar, guards, views |
| User list (admin) | ✅ `users` — pagination + filters + abort guard |
| Tenant list (platform admin) | ✅ `tenants` — same conventions as `users` |
| Role definitions | ✅ `roles` — cached once, fails closed |
| Permission checks | ✅ `roles` — `useHasPermission` |
| Toast notifications | ✅ `ui` |
| Theme / dark mode | ✅ `ui` — persisted preference |
| Modal state | ⚠️ local via `useEntityEditorState` (no global modal store) |
| Form drafts | ⚠️ local via `useEntityEditorState` |

---

## 10. Related Specs
- `contracts/auth-flow.md` — session/token rules this store implements.
- `features/feat-01-authentication.md`, `feat-02-user-management.md`,
  `feat-05-superadmin-tenant-management.md`.
- `frontend/fe-routing-guards.md` — guards derive from the `auth`/`roles` stores.
- `frontend/fe-component-library.md` — components that consume these stores.