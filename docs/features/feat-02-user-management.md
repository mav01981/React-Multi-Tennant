# Feature: User Management (Admin)

> **Scope:** Unified — admin CRUD over the user collection on both frontend and backend.
> **Source of truth:** `contracts/api-contract.md`.

---

## 1. Overview

Admins list, filter, paginate, create, edit, and delete users. The frontend `users` store holds the page state (items, totalCount, filters, selection) and calls the admin endpoints.

## 2. User Stories

| ID | Story | Acceptance criteria |
|----|-------|---------------------|
| USR-01 | As an admin I want a paginated user list | Table shows one page; total count visible |
| USR-02 | As an admin I can search users | Client-side debounce → `GET /users?search=` |
| USR-03 | As an admin I can filter by role/status | Combined with search + pagination |
| USR-04 | As an admin I can create a user | New user appears without full refetch |
| USR-05 | As an admin I can edit a user | Inline/panel updates; row refreshes |
| USR-06 | As an admin I can delete a user | Removed after confirmation modal |

## 3. Frontend Behavior (`users` store)

| Action | API | Store effect |
|--------|-----|--------------|
| `fetchUsers()` | `GET /users` | replace `items`, update `totalCount`, `isLoading` |
| `createUser(data)` | `POST /users` | `items.unshift(newUser)`, `totalCount++` |
| `updateUser(id, data)` | `PUT /users/{id}` | replace row in place; refresh auth if self |
| `deleteUser(id)` | `DELETE /users/{id}` | `items.filter(...)`, `totalCount--` |
| `setPage(n)` | refetch with new page | page clamped to `[1,totalPages]` |
| `setSearch(s)` | refetch page 1 | resets page to 1 |

### Auth-store coupling
When an admin edits their **own** roles/status, `updateUser` calls `useAuthStore.getState().fetchCurrentUser()` so identity recomputes and the `selectIsAdmin` / `selectIsManager` selectors reflect the change.

## 4. Backend Behavior

- Owner-only (`Role: Admin`); others → `403 FORBIDDEN`.
- `GET /users` applies pagination, `search`, `role`, `status`, sort — all per `api-contract.md` §6.
- `POST /users` validates email uniqueness → `409 EMAIL_EXISTS`; hashes the password.
- `DELETE /users/{id}` is a hard delete — the user record is permanently removed (the confirm dialog warns this cannot be undone); the last-active-admin guardrail still applies (`409 LAST_ACTIVE_ADMIN`).
- `POST /users` accepts an optional `tenantSlug`: only callers holding `tenants.read` (i.e. PlatformAdmin) may use it to create a user in an existing active workspace; roles resolve against the **target** tenant's catalog. Everyone else creates users in their own tenant and cannot escape it.
- `GET /users` accepts the same optional `tenantSlug` (PlatformAdmin-only, same guards): the platform admin can browse any active workspace's users; the UsersPage shows the Workspace filter only for these callers. `PUT /users/{id}` and `DELETE /users/{id}` follow the same rule — a `tenants.read` holder may update/delete a user of any existing active workspace (a cross-tenant attempt by anyone else is an explicit `403`, never a silent no-op).
- Guardrails: an admin MUST be able to delete their own account (choose; needs explicit product decision), and should never be able to lock out the last active admin without warning.

## 5. Store API (frontend target shape — `stores/users.ts`, Zustand)

```ts
useUsersStore: {
  // state
  items, totalCount, selectedUserId, filters, isLoading, error,
  // derived values via selectors (useUsersStore(selector))
  selectSelectedUser, selectTotalPages, selectHasNextPage, selectHasPrevPage,
  // actions
  fetchUsers, createUser, updateUser, deleteUser, setPage, setSearch
}
```

## 6. Edge Cases

| Case | Expected |
|------|----------|
| Search matches 0 rows | Empty `items`, `totalCount` 0, no error |
| Page beyond bounds | Empty page, still valid `totalCount` |
| Concurrent admin edits | Last-write-wins on update; row replace |
| Delete currently-selected | Clear `selectedUserId` |

---

## 7. Related Specs
- `contracts/api-contract.md` — list DTOs + pagination contract.
- `frontend/fe-state-management.md` — `users` store.
- `frontend/fe-routing-guards.md` — admin route guard.
- `backend/be-ef-migrations.md` — user table schema.