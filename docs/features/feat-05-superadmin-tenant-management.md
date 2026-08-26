# Feature: Superadmin — Tenant Management

> **Scope:** Unified — platform-level CRUD over tenants on both frontend (React + TypeScript + Zustand) and backend (ASP.NET Core Identity).
> **Source of truth:** `plan.md` §9 (multi-tenancy), `contracts/api-contract.md`. This spec codifies the feature-level behavior of the `tenants` endpoints and the `tenants` store.

---

## 1. Overview

A **Superadmin** (`PlatformAdmin` role, living only in the reserved `platform` tenant) manages the fleet of tenants: list, search, create, edit (name/displayName/status), and deactivate. Every other user belongs to **exactly one** tenant; emails are unique *per tenant*, and roles are scoped per tenant. Creating a tenant seeds its default role catalog.

## 2. User Stories

| ID | Story | Acceptance criteria |
|----|-------|----------------------|
| TEN-01 | As a superadmin I want a paginated tenant list | Table shows one page; total count visible |
| TEN-02 | As a superadmin I can search tenants | Debounced query → `GET /tenants?search=` |
| TEN-03 | As a superadmin I can create a tenant | `201 TenantDto`; default roles seeded |
| TEN-04 | As a superadmin I can edit a tenant | Name/displayName/status update; row refreshes |
| TEN-05 | As a superadmin I can suspend/reactivate a tenant | Suspended tenant logins rejected with `422 TENANT_SUSPENDED` |
| TEN-06 | As a superadmin I can delete a tenant | Removed after confirmation modal (soft-delete) |
| TEN-07 | As any non-platform user I must NOT see tenants | No route access, no UI entry, backend `403` |

## 3. Role & Permission Model

| Role | Meaning | Permissions |
|------|---------|-------------|
| `PlatformAdmin` | Superadmin, exists only in the `platform` tenant | `tenants.read`, `tenants.write` |

- Backend authorizes at **permission** granularity (same rule as feat-04); `PlatformAdmin` is just the aggregate.
- The platform tenant's role catalog is NOT visible to regular tenant admins — `GET /roles` is tenant-scoped and never leaks `PlatformAdmin`.
- A tenant-local `Admin` has no tenant-management capability whatsoever.

## 4. Frontend Behavior (`tenants` store)

| Action | API | Store effect |
|--------|-----|--------------|
| `fetchTenants()` | `GET /tenants` | replace `items`, update `totalCount`, toggle `isLoading` |
| `createTenant(data)` | `POST /tenants` | `items.unshift(newTenant)`, `totalCount++` |
| `updateTenant(id, data)` | `PUT /tenants/{id}` | replace row in place |
| `deleteTenant(id)` | `DELETE /tenants/{id}` | `items.filter(...)`, `totalCount--` |
| `setPage(n)` | refetch with new page | page clamped to `[1,totalPages]` |
| `setSearch(s)` | refetch page 1 | resets page to 1 |

```ts
useTenantsStore: {
  // state
  items, totalCount, selectedTenantId, filters, isLoading, error,
  // selectors
  selectSelectedTenant, selectTotalPages, selectHasNextPage, selectHasPrevPage,
  // actions
  fetchTenants, createTenant, updateTenant, deleteTenant, setPage, setSearch
}
```


### Routing & guards
- Route `/tenants` guarded by the `PlatformAdmin` permission check (extends `fe-routing-guards.md`).
- Nav entry rendered only when the auth-store role claims include `PlatformAdmin`.
- Login page keeps its free-text workspace field; superadmins log in with `X-Tenant-Id: platform`.

## 5. Backend Behavior

- All `/tenants/*` endpoints require `tenants.read` / `tenants.write`; everyone else → `403 FORBIDDEN`.
- `GET /tenants` applies pagination + `search` per `api-contract.md`.
- `POST /tenants` validates:
  - `slug` uniqueness across all tenants → `409 SLUG_EXISTS`
  - reserved slugs (e.g. `platform`) are rejected → `409 SLUG_EXISTS`
  - On success: creates tenant **and seeds its default role catalog** (`201 TenantDto`).
- `PUT /tenants/{id}`:
  - status transitions `active ↔ suspended`; suspending blocks new logins with `422 TENANT_SUSPENDED` (existing tokens expire naturally — access TTL caps exposure).
  - Suspending/deleting the **platform** tenant itself → `400 VALIDATION_FAILED`.
- `DELETE /tenants/{id}` is a soft-delete; platform tenant protected as above.
- Cross-tenant safety unchanged: authenticated non-tenant calls remain scoped by the `tid` claim; `X-Tenant-Id` header is only authoritative pre-auth.

## 6. Response rules (per `api-contract.md`)

| Case | Status |
|------|--------|
| List / get / update success | `200` |
| Create success | `201 TenantDto` |
| Missing/duplicate/reserved slug | `409 SLUG_EXISTS` |
| Unknown tenant id | `404 TENANT_NOT_FOUND` |
| Non-platform caller | `403 FORBIDDEN` |
| Login into suspended tenant | `422 TENANT_SUSPENDED` |

## 7. Edge Cases

| Case | Expected |
|------|----------|
| Search matches 0 rows | Empty `items`, `totalCount` 0, no error |
| Suspend tenant mid-session | Existing sessions keep working until token refresh fails/expiry |
| Duplicate slug | `409`, store surfaces field error, row untouched |
| Platform tenant suspended by mistake | Rejected server-side (`400`); UI disables the action |
| Delete currently-selected tenant | Clear `selectedTenantId` |
| Concurrent edits | Last-write-wins; row replace |

## 8. Acceptance (E2E happy path)

See `backend/e2e-tenants.ps1` for the executable version:

```
[1] POST /auth/login without X-Tenant-Id            → 400 VALIDATION_FAILED
[2] POST /auth/login unknown slug                   → 404 TENANT_NOT_FOUND
[3] POST /auth/login acme admin                     → 200 (users/roles scoped to tid)
[6] GET  /tenants as acme admin                     → 403 (no tenants.read)
[7] POST /tenants as PlatformAdmin                  → 201 (+ seeded default roles)
    reserved/duplicate slug                         → 409 SLUG_EXISTS
[8] PUT  /tenants/{id} suspended → login            → 422 TENANT_SUSPENDED
    PUT  /tenants/{platform} suspended              → 400
    reactivate                                      → 200
```

## 9. Related Specs
- `plan.md` multi-tenancy model, `PlatformAdmin` bootstrap.
- `contracts/api-contract.md` — `TenantDto` + tenants endpoints.
- `feat-04-role-permissions.md` — permission-granular authorization pattern.
- `frontend/fe-routing-guards.md` — platform-only route guard.
- `frontend/fe-state-management.md` — `tenants` store conventions.
- `backend/e2e-tenants.ps1` — end-to-end verification script.
