# Frontend: Routing & Guards (React Router v6)

> **Scope:** Frontend-only — how the React Router protects views by auth state.
> **Source of truth:** `features/feat-01-authentication.md`, `features/feat-04-role-permissions.md`, `frontend/fe-state-management.md`.

---

## 1. Route Map

Routes are declared in `frontend/src/app/App.tsx`. Guards are **layout routes** —
a guard component renders `<Outlet />` to allow, or `<Navigate />` to bounce.

| Path | View | Guard |
|------|------|-------|
| `/login` | `LoginPage` | none (the page itself redirects authed users to `/`) |
| `/` | `LandingPage` | `ProtectedRoute` |
| `/profile` | `ProfilePage` | `ProtectedRoute` |
| `/users` | `UsersPage` | `ProtectedRoute` + `AdminOnly` (`users.read`) |
| `/roles` | `RolesPage` | `ProtectedRoute` + `RequirePermission('roles.read')` |
| `/tenants` | `TenantsPage` | `ProtectedRoute` + `RequirePermission('tenants.read')` |
| `*` | → `Navigate to="/" replace` | none |

## 2. Guard Components

### `ProtectedRoute` / `GuestOnly`
`frontend/src/features/auth/guards/ProtectedRoute.tsx`

```tsx
export function ProtectedRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  if (isAuthenticated) return <Outlet />
  return <Navigate to="/login" replace />
}

export function GuestOnly(): React.JSX.Element {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}
```

`ProtectedRoute` is a nested layout route around every authenticated view;
`GuestOnly` is available for guest-only subtrees (currently `LoginPage` handles
its own redirect inline).

### `RequirePermission(permission)` — permission-based
`frontend/src/features/roles/PermissionRoute.tsx`

```tsx
export function RequirePermission({ permission }: { permission: string }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const hasLoaded = useRolesStore((s) => s.hasLoaded)
  const fetchRoles = useRolesStore((s) => s.fetchRoles)
  const hasPermission = useHasPermission(permission)

  useEffect(() => {
    if (!hasLoaded) void fetchRoles()   // lazily load the catalog once
  }, [hasLoaded, fetchRoles])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!hasLoaded) return null           // awaiting role cache (fail closed)
  return hasPermission ? <Outlet /> : <Navigate to="/" replace />
}
```

Guards are **permission**-based (`users.read`, `roles.read`, `tenants.read`),
not bare role names — a Manager holding `users.read` may open the Users view
while a plain User is bounced (feat-04 §4/§5).

### `AdminOnly`
`frontend/src/features/users/guards/AdminOnly.tsx` — thin alias for
`<RequirePermission permission="users.read" />`.

## 3. Wiring — Nested Layout Routes

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<ProtectedRoute />}>
    <Route path="/" element={<LandingPage />} />
    <Route path="/profile" element={<ProfilePage />} />
    <Route element={<AdminOnly />}>
      <Route path="/users" element={<UsersPage />} />
    </Route>
    <Route element={<RequirePermission permission="roles.read" />}>
      <Route path="/roles" element={<RolesPage />} />
    </Route>
    <Route element={<RequirePermission permission="tenants.read" />}>
      <Route path="/tenants" element={<TenantsPage />} />
    </Route>
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

Guards compose by nesting: `AdminOnly` and `RequirePermission` sit **inside**
`ProtectedRoute`, so authentication is resolved before any permission check.

## 4. Ordering & Priorities

1. **Boot hydration first** — `App` renders an `AuthSplash` until
   `auth.isInitialized` is true (see `fe-state-management.md` §8), so no guard
   ever evaluates against a half-hydrated session or flashes a wrong redirect.
2. `ProtectedRoute` (authentication) wraps everything else; permission guards
   only run for already-authenticated users.
3. `RequirePermission` awaits the role catalog (`hasLoaded`) before deciding, so
   a cold cache cannot deny a legitimate user.
4. Denied access is a **silent redirect** — `/login` for anonymous users, `/`
   for authenticated users lacking the permission.

## 5. Role-Derived Guards vs Backend

- Frontend guards are **UX conveniences**, never security boundaries.
- The backend enforces the same permission checks (`feat-04` §4) — the client
  must treat a `403` from any API as authoritative and surface a
  not-authorized state.

## 6. Edge Cases

| Case | Expected |
|------|----------|
| Token expired mid-nav | `apiFetch` performs a single-flight refresh + replay; on failure the session clears and the user lands on `/login` |
| Guest visits `/users` | `ProtectedRoute` → `Navigate to="/login"` |
| Authed user lacking `users.read` | `AdminOnly` → `Navigate to="/"` |
| Roles catalog not yet loaded | `RequirePermission` renders `null` and fetches it; no premature redirect |
| Deep link to a guarded route | Boot hydration (`initialize`) settles first, then guards apply with fresh state |
| Unknown path | `*` route redirects to `/` (then `ProtectedRoute` applies) |

---

## 7. Related Specs
- `frontend/fe-state-management.md` — `auth`/`roles` stores + hydration timing.
- `features/feat-01-authentication.md` — auth lifecycle driving these guards.
- `features/feat-04-role-permissions.md` — permission semantics the guards rely on.
- `features/feat-05-superadmin-tenant-management.md` — the `/tenants` guard.