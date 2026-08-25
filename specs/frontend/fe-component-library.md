# Frontend: Component Library

> **Scope:** Frontend-only — shared UI components and how they bind to Pinia stores.
> **Source of truth:** `frontend/fe-state-management.md`, plan.md §3.

---

## 1. Shared Components

| Component | Purpose | State source |
|-----------|---------|--------------|
| `AppNavbar` | Site nav, user avatar | `auth` store (`fullName`, `initials`, `isAdmin`) |
| `Sidebar` | Collapsible nav rail | `ui` store (`sidebarCollapsed`) |
| `Toasts` | Global notifications (root) | `ui` store (`toasts[]`) |
| `Modal` | Generic overlay shell | `ui` store (`activeModal`) |
| `UsersTable` | Paginated admin table | `users` store (`items`, `filters`, `isLoading`) |
| `Pagination` | Page controls | `users` store (`page`, `totalPages`, `hasNextPage`...) |
| `UserForm` | Create/edit user | `roles` store (dropdowns) + `users` store (submit) |
| `RoleBadge` | Role chip | `auth` store (`roles`) |

## 2. Data-Binding Rules

- **Reads** use `storeToRefs(store)` for reactive values.
- **Writes/actions** call store actions directly (never mutate store refs from a component unless the store exposes a setter).
- **Toasts** and **modals** are drawn from any depth but rendered at the root via the `ui` store.

## 3. Toast & Modal Contracts

```ts
// ui store
addToast({ message, type, duration? })        // auto-removes after duration ?? 4000ms
openModal(name: string) / closeModal()
```

## 4. Table ↔ Search ↔ Pagination Flow

```
search input ──debounce──▶ usersStore.setSearch(q) ──▶ fetchUsers() (page reset to 1)
page buttons ───────────▶ usersStore.setPage(n)  ──▶ fetchUsers()
delete action ───▶ uiStore.openModal('confirm-delete') + usersStore.selectedUserId = id
confirm ─────────▶ usersStore.deleteUser(id) ──▶ uiStore.addToast({type:'success'})
```

## 5. Role Dropdown

Options derive from the **`roles` store** (fetched lazily once); the current user's granted roles come from the **`auth` store** `user.roles`.

---

## 6. Related Specs
- `frontend/fe-state-management.md` — store shapes consumed here.
- `features/feat-02-user-management.md` — table + modal flows.
- `features/feat-04-role-permissions.md` — role dropdown data.