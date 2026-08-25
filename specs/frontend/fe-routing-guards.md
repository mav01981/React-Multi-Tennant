# Frontend: Routing & Guards

> **Scope:** Frontend-only — how the Vue Router protects views by auth state.
> **Source of truth:** `features/feat-01-authentication.md`, `features/feat-04-role-permissions.md`, `frontend/fe-state-management.md`.

---

## 1. Route Map

| Path | View | Guard |
|------|------|-------|
| `/login` | Login | `guestOnly` (redirect home if authed) |
| `/` | Dashboard | `requiresAuth` |
| `/profile` | Profile self-service | `requiresAuth` |
| `/users` | User list (admin) | `requiresAuth` + `requiresRole('Admin')` |
| `/:pathMatch(.*)*` | 404 | none |

## 2. Guards

### `requiresAuth`
```ts
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated)
    return { name: 'login', query: { redirect: to.fullPath } }
})
```

### `requiresRole(role)` meta-based
```ts
// route meta: { requiresAuth: true, roles: ['Admin'] }
if (to.meta.roles && !to.meta.roles.some(r => auth.user?.roles.includes(r)))
  return { name: 'not-authorized' } // or a 403 view
```

## 3. Ordering & Priorities

1. Resolve auth first (`auth` store is hydrated on mount).
2. `requiresAuth` before `requiresRole` (roles are meaningless unauthenticated).
3. Anonymous access is a silent redirect to `/login` with `redirect` passthrough so post-login navigation returns the user.

## 4. Role-Derived Guards vs Backend

- Frontend guards are **UX conveniences**, never security boundaries.
- Backend enforces the same role/permission checks (see `feat-04` §4) — the client must treat a `403` from any API as authoritative and surface a not-authorized state.

## 5. Edge Cases

| Case | Expected |
|------|----------|
| Token expired mid-nav | RequiresAuth triggers interceptor refresh; if fails, redirect login |
| Guest visits `/users` | Redirect `/login?redirect=/users` |
| Admin gone, initial store empty | Wait for `fetchCurrentUser` resolve before first route resolve |
| Deep link to guarded route | Hydration runs, then guard applies with fresh state |

---

## 6. Related Specs
- `frontend/fe-state-management.md` — `auth` store + hydration timing.
- `features/feat-01-authentication.md` — auth lifecycle driving these guards.
- `features/feat-04-role-permissions.md` — role semantics the guards rely on.