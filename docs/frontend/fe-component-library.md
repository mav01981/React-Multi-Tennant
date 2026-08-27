# Frontend: Shared UI & Component Conventions

> **Scope:** Frontend-only — shared UI primitives and how they bind to the Zustand stores.
> **Source of truth:** `frontend/fe-state-management.md`
> **Stack:** MUI (Material UI) for primitives; feature-owned pages under `frontend/src/features/*/pages/`.

---

## 1. Shared Modules

There is no bespoke widget library — MUI supplies the primitives (`Paper`,
`Table`, `TextField`, `Button`, `Dialog`, `Chip`, `Avatar`, `Alert`,
`CircularProgress`, …) and the app layers guards, hosts, and hooks on top:

| Module | Location | Purpose | State source |
|--------|----------|---------|--------------|
| `ThemeProvider` | `app/providers/ThemeProvider.tsx` | MUI theme bound to the light/dark preference | `ui` store (`themeMode`) |
| `AuthSplash` | `app/AuthSplash.tsx` | Boot splash shown until auth hydration settles | `auth` store (`isInitialized`) |
| `ToastHost` | `shared/ui/ToastHost.tsx` | Global toast renderer, mounted at the app root | `ui` store (`toasts[]`) |
| `ProtectedRoute` / `GuestOnly` | `features/auth/guards/ProtectedRoute.tsx` | Auth layout-route guards | `auth` store (`selectIsAuthenticated`) |
| `RequirePermission` | `features/roles/PermissionRoute.tsx` | Permission layout-route guard | `roles` store + `useHasPermission` |
| `AdminOnly` | `features/users/guards/AdminOnly.tsx` | Alias for `RequirePermission('users.read')` | as above |
| `useEntityEditorState` | `shared/hooks/useEntityEditor.ts` | Reducer-backed create/edit + delete-dialog state machine for CRUD pages | local (no store) |
| `useDebouncedValue` | `shared/hooks/useDebouncedValue.ts` | Debounced input primitive (300 ms search) | local |
| `apiFetch` / `ApiClientError` | `shared/api/client.ts` | Fetch wrapper: bearer token, `X-Tenant-Id`, single-flight 401 refresh + replay | `auth` store via `setAuthHandlers` |

## 2. Data-Binding Rules (Zustand)

- **Reads** subscribe with a selector: `useUsersStore((s) => s.items)` or an
  exported selector such as `selectIsAdmin`. Never call `useStore()` bare.
- **Grouped reads/actions** use `useShallow` slices — a fresh object literal
  without it re-renders on every store change.
- **Writes** go through store actions. Components never assign store state
  directly; `set` lives inside the store definition only.
- **Derived values** come from exported selectors or local computation
  (`useMemo` for pure/expensive derivations).
- **Imperative access** outside render (event handlers, boot, other stores)
  uses `useStore.getState()`.
- **Toasts** are raised from anywhere via `useUiStore.getState().addToast(...)`
  and rendered once at the root by `ToastHost`.

## 3. Toast Contract

```ts
// shared/ui/ui.store.ts
addToast(message: string, type?: 'success' | 'error' | 'warning' | 'info') // default 'info'
removeToast(id: string)
```

`addToast` auto-removes the toast after 4000 ms — no `duration` parameter.
Call sites pass a message plus a type, e.g. `addToast('User created', 'success')`.

**There is no global modal store.** Create/edit and delete-confirmation dialogs
are local state owned by the page via `useEntityEditorState`, which models the
panel lifecycle as an explicit reducer (open create / start edit / reset /
update form / open delete / close delete) so the two can never drift apart
(e.g. `showCreate && editingId` is impossible).

## 4. Table ↔ Search ↔ Pagination Flow

```
search input ──debounce 300 ms──▶ usersStore.setSearch(q) ──▶ fetchUsers()  (page → 1, aborts prior request)
page buttons ────────────▶ usersStore.setPage(n)  ──▶ fetchUsers()          (clamped to [1, totalPages])
role / status selects ───▶ usersStore.setRole(...) / setStatus(...) ─▶ fetchUsers()  (page → 1)
"Clear" button ──────────▶ setSearchInput('') + usersStore.setSearch('')
New user / Edit ─────────▶ useEntityEditorState.openCreate() / startEdit(id, form)
form submit ─────────────▶ usersStore.createUser(form) / updateUser(id, form) ─▶ addToast('User created' | 'User updated', 'success')
Delete ──────────────────▶ useEntityEditorState.openDelete(target) → confirm → usersStore.deleteUser(id) ─▶ addToast('User deleted', 'success')
```

`fetchUsers`/`fetchTenants` abort any in-flight request before starting a new
one (see `fe-state-management.md` §3), so rapid filter changes cannot let a
stale response overwrite a fresh one.

## 5. Role Dropdown

Options derive from the **`roles` store** (fetched lazily once, `hasLoaded`
guard); the current user's granted roles come from the **`auth` store**
`user.roles`. The create/edit user form maps `roles` → `{ role.name }` for the
`<select>` options.

---

## 6. Related Specs
- `frontend/fe-state-management.md` — store shapes consumed here.
- `frontend/fe-routing-guards.md` — the guard components listed above.
- `features/feat-02-user-management.md` — table + dialog flows.
- `features/feat-04-role-permissions.md` — role dropdown data.
- `features/feat-05-superadmin-tenant-management.md` — tenant CRUD page.