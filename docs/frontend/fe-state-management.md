# Frontend: State Management (Pinia)

> **Scope:** Frontend-only — how the React  client manages application state.


---

## 1. Store Composition

```
┌─────────────────────────────────────────┐
│           Pinia Root Store             │
├─────────────┬─────────────┬─────────────┤
│   auth      │   users     │     ui      │
├─────────────┼─────────────┼─────────────┤
│ • user      │ • items[]   │ • sidebar   │
│ • token     │ • total     │   collapsed │
│ • isLoading │ • filters   │ • toasts[]  │
│ • error     │ • selected  │ • modals    │
│             │   UserId    │             │
└─────────────┴─────────────┴─────────────┘
         │              │            │
         ▼              ▼            ▼
    localStorage    API Cache    Component
    JWT tokens      pagination   local state
```

`roles` store (cache) is created but not shown in the diagram above; see §5.

## 2. `auth` Store — Identity, Tokens, Login State

**State:** `user: UserDto|null`, `accessToken`, `refreshToken` (seeded from localStorage), `isLoading`, `error`.
**Getters:** `isAuthenticated`, `isAdmin`, `isManager`, `fullName`, `initials`.
**Actions:** `login`, `logout`, `fetchCurrentUser`, `refreshAccessToken`.

### Session helpers

```ts
setSession(resp: LoginResponse) {
  accessToken = resp.accessToken; refreshToken = resp.refreshToken; user = resp.user
  localStorage.setItem('accessToken', resp.accessToken)
  localStorage.setItem('refreshToken', resp.refreshToken)
}
clearSession() {
  user = null; accessToken = null; refreshToken = null
  localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken')
}
```

**Rules:**
- Token persistence is localStorage-backed (matches `auth-flow.md` §2).
- `logout()` always runs `clearSession()` even if the API call fails.
- `refreshAccessToken()` clears the session and returns `null` on any failure.

## 3. `users` Store — Admin User CRUD + Filters

**State:** `items[]`, `totalCount`, `selectedUserId`, `filters {search, role, status, page, pageSize}`, `isLoading`, `error`.
**Getters:** `selectedUser`, `totalPages`, `hasNextPage`, `hasPrevPage`.
**Actions:** `fetchUsers`, `createUser`, `updateUser`, `deleteUser`, `setPage`, `setSearch`.

### Cross-store rule

```ts
async function updateUser(id, data) {
  const authStore = useAuthStore()
  const updated = await usersApi.update(id, data)
  if (id === authStore.user?.id) await authStore.fetchCurrentUser() // self have roles changed
}
```

## 4. `ui` Store — Global Overlay State

**State:** `sidebarCollapsed`, `toasts[]`, `activeModal`.
**Actions:** `toggleSidebar`, `addToast`, `removeToast`, `openModal`, `closeModal`.

```ts
interface Toast { id: string; message: string; type: 'success'|'error'|'warning'|'info'; duration?: number }
```

## 5. `roles` Store — On-Demand Cache

**State:** `roles: RoleDto[]`, `isLoading`, `hasLoaded`.
**Action:** `fetchRoles()` (guarded to load once).

## 6. Component Usage Pattern

```ts
import { storeToRefs } from 'pinia'
import { useUsersStore, useAuthStore, useUiStore }

const usersStore = useUsersStore(); const authStore = useAuthStore(); const uiStore = useUiStore()
const { items, isLoading, totalPages, filters } = storeToRefs(usersStore)
const { isAdmin } = storeToRefs(authStore)

function handleDelete(id: string) {
  uiStore.openModal('confirm-delete')
  usersStore.selectedUserId = id
}
```

**Rules:**
- Extract reactive state with `storeToRefs` (never destructure a store directly inside `<template>`).
- Call actions directly on the store instance.

## 7. Store Hydration on App Mount

```ts
// main.ts
const pinia = createPinia(); app.use(pinia); app.use(router)
const authStore = useAuthStore()
if (authStore.accessToken) await authStore.fetchCurrentUser() // silent re-auth
app.mount('#app')
```

## 8. Decision Matrix (from plan §5)

| Feature | Store needed? |
|---------|---------------|
| Login/logout | ✅ `auth` — token persists across routes |
| Current user | ✅ `auth` — navbar, guards, views |
| User list (admin) | ✅ `users` — pagination + filters |
| Role definitions | ✅ `roles` — cached once |
| Toast notifications | ✅ `ui` |
| Modal state | ⚠️ single→local; multi-step→`ui` |
| Form drafts | ⚠️ only if draft persistence needed |
| Theme/dark mode | ✅ `ui` — persist preference |

---

## 9. Related Specs
- `contracts/auth-flow.md` — session/token rules this store implements.
- `features/feat-01-authentication.md`, `feat-02-user-management.md`.
- `frontend/fe-routing-guards.md` — guard derives from `auth` store.
- `frontend/fe-component-library.md` — components that consume these stores.