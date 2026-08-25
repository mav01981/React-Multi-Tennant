# Feature: Role & Permissions

> **Scope:** Unified — role definitions, per-role permission sets, and their enforcement on frontend (guards/UI) and backend (authorization).
>

---

## 1. Overview

Roles are named bundles of permissions. The backend assigns one or more roles to a user, and every API call enforces role-based authorization. The frontend caches `RoleDto[]` in the `roles` store and uses role claims for UI gating and route guards.

## 2. Role / Permission Model

| Role | Meaning | Representative permissions |
|------|---------|----------------------------|
| `Admin` | Full control of users & config | `users.read`, `users.write`, `users.delete`, `roles.read` |
| `Manager` | Moderate user administration | `users.read`, `users.write` (no delete) |
| `User` | Default member | `profile.read`, `profile.write` |

**Permission granularity:** backend authorizes by **permission**, not bare role name. Route guards on the frontend may consult either, but backend MUST authorize at permission granularity.

## 3. Frontend Behavior (`roles` store)

1. **Cache**: `fetchRoles()` loads once (`hasLoaded` guard) at app init or first dropdown need — see load strategy below.
2. **Guard use** (`fe-routing-guards.md`): `Admin` / `Manager` booleans derive from claimed roles via `selectIsAdmin` / `selectIsManager`.
3. **UI use**: role dropdown options in user management; permission chips when viewing a role.

### Load strategy (`stores/roles.ts`, Zustand)

```ts
// lazily cached once, guarded by hasLoaded
export const useRolesStore = create<RolesState>((set, get) => ({
  roles: [],
  isLoading: false,
  hasLoaded: false,
  fetchRoles: async () => {
    if (get().hasLoaded) return          // lazy, once
    set({ isLoading: true })
    try {
      const roles = await rolesApi.getAll()
      set({ roles, hasLoaded: true })
    } finally {
      set({ isLoading: false })
    }
  }
}))
```

## 4. Backend Behavior

- `GET /roles` → `RoleDto[]`, permission-gated (typically `roles.read` or Admin).
- Authorization is **per-permission** at the guard layer; role name is only an aggregate.
- Invalidation: if a role's permissions change, cached claims are stale only until the next token refresh (access TTL caps exposure).
- Adding/editing roles is out of feature scope for v1 unless explicitly requested.

## 5. Acceptance

| Scenario | Expected |
|----------|----------|
| Admin opens Users view | `users.read` satisfied → allowed |
| Manager tries delete | No `users.delete` → `403` + delete UI hidden |
| User opens Users view | `403` frontend guard + backend `403` |
| Roles endpoint first open | Lazy-load once, cached thereafter |

## 6. Edge Cases

| Case | Expected |
|------|----------|
| Role removed from user mid-session | Guarded UI updates after next `me` fetch |
| All roles empty | treated as `User` default; no crash |
| Permission-only endpoint vs role guard | Backend wins; frontend hides UI, backend rejects |

---

## 7. Related Specs
- `contracts/api-contract.md` — `RoleDto` + roles endpoint.
- `frontend/fe-routing-guards.md` — role-based route guards.
- `frontend/fe-state-management.md` — `roles` store + `auth` role getters.
- `backend/be-identity-config.md` — authorities/permissions wiring.