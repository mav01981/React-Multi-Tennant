# Feature: Profile Self-Service

> **Scope:** Unified — authenticated users view and edit their own profile and change their password.
> **Source of truth:** `contracts/api-contract.md`.

---

## 1. Overview

Any authenticated user can read and update their own identity (`firstName`, `lastName`) and change their password. This is distinct from admin user management — self-service operates on the caller's own record only.

## 2. User Stories

| ID | Story | Acceptance criteria |
|----|-------|---------------------|
| PRO-01 | As a user I can view my profile | `GET /users/me` → `UserDto` |
| PRO-02 | As a user I can edit my names | `PUT /users/me` → updated `UserDto` |
| PRO-03 | As a user I can change my password | Requires current password; returns 204 |
| PRO-04 | As a user my changed profile reflects in the navbar | Auth store refreshes after update |

## 3. Frontend Behavior

1. **Profile read:** `useAuthStore(s => s.user)` is the primary source; `GET /users/me` used to revalidate on the profile view.
2. **Profile update:**
   - `PUT /users/me` with `UpdateProfileRequest`.
   - On success, sync `useAuthStore.setState({ user: updated })` so the navbar (`selectFullName`, `selectInitials`, avatar) updates immediately.
3. **Password change:**
   - `currentPassword` required; validate `newPassword` against policy (length, complexity).
   - On success — 204 — and **keep the session** (only a new password hash on the backend, tokens untouched).
   - Client shows a success toast (`ui` store).

## 4. Backend Behavior

- Endpoint resolves the caller from the Bearer token (`sub` claim), never a body `id` — prevents IDOR.
- Name updates validate non-empty, length caps.
- Password change verifies `currentPassword` before re-hashing; on mismatch → `401 INVALID_CREDENTIALS` (or generic failure to avoid enumeration).
- No role escalation is possible from self-service — roles are immutable here.

## 5. Edge Cases

| Case | Expected |
|------|----------|
| Unauthenticated profile access | `401 UNAUTHENTICATED` → redirect login |
| Password policy violation | `400 VALIDATION_FAILED` with field details |
| Wrong current password | 401, no token change |
| User id in body ≠ token | Token wins; body id ignored |

---

## 6. Related Specs
- `contracts/api-contract.md` — profile DTOs + endpoints.
- `contracts/auth-flow.md` — session continuity on password change.
- `frontend/fe-state-management.md` — `auth` store hydration.
- `backend/be-ef-migrations.md` — profile fields on `users` table.