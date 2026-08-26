# Feature: Authentication

> **Scope:** Unified — covers both frontend (React + TypeScript + Zustand) and backend (ASP.NET Core Identity).
> **Source of truth:** `plan.md` §1 (store definitions), `contracts/api-contract.md` and `contracts/auth-flow.md`. This spec codifies the feature-level behavior those contracts enable and the `auth` store implements.

---

## 1. Overview

Users log in with email + password, obtain a short-lived access token and a long-lived refresh token, persist the session, and silently re-authenticate on subsequent app mounts. Logout revokes the server-side token family and clears all local state.

## 2. User Stories

| ID | Story | Acceptance criteria |
|----|-------|----------------------|
| AUT-01 | As a user I can log in with valid credentials | Tokens returned, `auth` store hydrated, redirected to landing |
| AUT-02 | As a user I remain logged in after reload | Silent re-auth via `me` + refresh on mount |
| AUT-03 | As a user I can log out | Server family revoked, localStorage + store cleared, redirected to login |
| AUT-04 | As a user with an expired access token my request still succeeds | Interceptor refreshes once and replays |
| AUT-05 | As a locked user I cannot log in | `422 ACCOUNT_LOCKED`, no token minted |

## 3. Frontend Behavior

1. **Login** (`POST /auth/login`) →
   - `authApi.login()` returns `LoginResponse`.
   - `setSession()` persists `accessToken` + `refreshToken` to localStorage and hydrates `user`.
2. **App mount hydration** (`main.tsx`): `useAuthStore.getState().accessToken` is seeded from localStorage; if present, call `fetchCurrentUser()` (→ `GET /auth/me`); on 401, refresh; on refresh failure, `clearSession()` — before `createRoot` renders.
3. **API interceptor (401 handling):**
   - Single-flight refresh (concurrent 401s coalesce).
   - Replay original request with the new token.
   - Refresh failure → `clearSession()` + redirect `/login`.
4. **Logout:** always `clearSession()` even if the network call errors.

### Acceptance
- [ ] `selectIsAuthenticated` returns true only while an access token is present.
- [ ] A 401 from any request never leaks an unhandled error to the user before refresh is attempted.

## 4. Backend Behavior

1. **Verify credentials** (constant-time compare of password hash), apply lockout / rate-limit checks.
2. **Mint pair** — access JWT (15 min) + opaque refresh token (30 days), store a hashed refresh reference.
3. **`/auth/refresh`** validates the presented refresh token, **rotates** (new pair), revokes the prior refresh, and revokes the whole family on reuse.
4. **`/auth/logout`** revokes the refresh family server-side (idempotent, always 204).

### Response rules (per `api-contract.md`)
- Success → `200 LoginResponse`.
- Bad creds → `401 INVALID_CREDENTIALS`.
- Locked → `422 ACCOUNT_LOCKED`.
- Refresh misuse → `401 REFRESH_TOKEN_REVOKED`.

## 5. Acceptance (E2E happy path)

```
[1] POST /auth/login {email,password}            → 200 tokens+user
[2] GET  /auth/me        Bearer <accessToken>   → 200 user
[3] user sleeps until token expires
[4] GET  /auth/me        Bearer <expired>       → 401
[5] POST /auth/refresh   {access, refresh}      → 200 (new pair)
[6] replay of [4] with new token               → 200 user
[7] POST /auth/logout    Bearer <new>          → 204
[8] reuse old refresh                          → 401 REFRESH_TOKEN_REVOKED
```

## 6. Edge Cases

| Case | Expected |
|------|----------|
| Refresh + login race | Single-flight refresh prevents pair clobbering |
| Two tabs, one logs out | Other tab's refresh fails → forced re-login |
| Token missing on guarded route | Redirect to login, no crash |
| Clock skew | 30s grace on `iat`/`exp` |

---

## 7. Related Specs
- `contracts/auth-flow.md` — JWT lifecycle, rotation, revocation.
- `contracts/api-contract.md` — DTOs and error codes.
- `frontend/fe-state-management.md` — `auth` store implementation.
- `backend/be-identity-config.md` — token minting + store.
- `backend/be-security-headers.md` — header hardening around auth.