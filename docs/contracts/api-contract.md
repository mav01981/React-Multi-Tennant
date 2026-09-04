# API Contract — Shared Source of Truth

> **Status:** Draft · **Owner:** Backend + Frontend (both must conform)
> This file is the authoritative boundary between the React client and the ASP.NET Core Identity backend. Any DTO shape, endpoint, error, or header change must be reflected here first.

---

## 1. Conventions

| Rule | Value |
|------|-------|
| Base path | `/api/v1` |
| Media type | `application/json` (request & response) |
| Charset | `UTF-8` |
| Endpoint naming | `kebab-case` resource paths, `camelCase` JSON fields |
| Date format | ISO 8601 / RFC 3339 UTC (`2026-08-24T14:30:00Z`) |
| Service | `Identity-API` |

### Absence semantics
- **Nullable fields** are explicit JSON `null`, **never omitted**.
- **Empty collections** serialize as `[]`, never `null`.
- Unknown/missing fields MUST NOT break the client; the client tolerates additive extensions.

---

## 2. Headers

**Request headers**

| Header | When | Example |
|--------|------|---------|
| `Authorization` | Always on authenticated routes | `Authorization: Bearer <accessToken>` |
| `Content-Type` | Any body-bearing request | `application/json` |
| `Accept-Language` | Optional, localization | `en-US` |
| `X-Request-Id` | Optional, correlation id (echoed on response) | `X-Request-Id: 9f8c...` |

**Response headers**

| Header | When | Example |
|--------|------|---------|
| `Content-Type` | Always | `application/json; charset=utf-8` |
| `X-Request-Id` | Echoed from request | — |
| `Retry-After` | On `429 Too Many Requests` | `Retry-After: 45` |
| `WWW-Authenticate` | On `401 Unauthorized` | `Bearer realm="api", error="invalid_token"` |

> **Token transport:** the **access token** is body-only and, on the client, kept **in memory only** (never localStorage); the **refresh token** is delivered as an **`HttpOnly` cookie**, never in a JSON body. See `auth-flow.md`.

---

## 3. Error Envelope

All non-2xx responses use a single shape:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect.",
    "details": [
      { "field": "email", "message": "must be a valid email address" }
    ],
    "requestId": "9f8c5a2b-..."
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `code` | string | Machine-readable, stable, `SCREAMING_SNAKE_CASE` |
| `message` | string | Human-readable summary; client may surface directly |
| `details` | array | Optional field-level validation errors |
| `requestId` | string | Optional correlation id for support |

**Canonical error codes**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_FAILED` | Body failed schema validation |
| 401 | `UNAUTHENTICATED` | Missing/expired/invalid token |
| 401 | `INVALID_CREDENTIALS` | Login rejected |
| 401 | `REFRESH_TOKEN_REVOKED` | Refresh token no longer valid |
| 403 | `FORBIDDEN` | Authenticated but not permitted |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `EMAIL_EXISTS` | Unique-constraint conflict |
| 422 | `ACCOUNT_LOCKED` | User is locked out |
| 429 | `TOO_MANY_REQUESTS` | Rate-limited |
| 500 | `INTERNAL_ERROR` | Unhandled server fault |

---

## 4. Endpoints

### 4.1 Auth

| Method | Path | Auth | Request → Response |
|--------|------|------|---------------------|
| `POST` | `/api/v1/auth/register` | Public | `RegisterRequest` → `201 LoginResponse` (+ `Location`) |
| `POST` | `/api/v1/auth/login` | Public | `LoginRequest` → `LoginResponse` |
| `POST` | `/api/v1/auth/refresh` | Public (valid refresh cookie required) | no body (`credentials: 'include'`) → `LoginResponse` |
| `POST` | `/api/v1/auth/logout` | Bearer | — → `204 No Content` |
| `GET`  | `/api/v1/auth/me` | Bearer | — → `UserDto` |

### 4.2 Users (Admin)

| Method | Path | Auth | Request → Response |
|--------|------|------|---------------------|
| `GET`  | `/api/v1/users` | Bearer (Admin) | query → `UserListResponse` |
| `GET`  | `/api/v1/users/{id}` | Bearer (Admin) | — → `UserDto` |
| `POST` | `/api/v1/users` | Bearer (Admin) | `CreateUserRequest` → `UserDto` (201). Optional `tenantSlug` — accepted **only** from a caller holding `tenants.read` (PlatformAdmin); creates the user in that workspace instead of the caller's own (unknown/deleted slug → `404`, suspended → `422 TENANT_SUSPENDED`) |
| `PUT`  | `/api/v1/users/{id}` | Bearer (Admin) | `UpdateUserRequest` → `UserDto` |
| `DELETE` | `/api/v1/users/{id}` | Bearer (Admin) | — → `204 No Content` (hard delete: the record is permanently removed; re-deleting is idempotent `204`) |

### 4.3 Profile Self-Service

| Method | Path | Auth | Request → Response |
|--------|------|------|---------------------|
| `GET`  | `/api/v1/users/me` | Bearer | — → `UserDto` |
| `PUT`  | `/api/v1/users/me` | Bearer | `UpdateProfileRequest` → `UserDto` |
| `POST` | `/api/v1/users/me/password` | Bearer | `ChangePasswordRequest` → `204 No Content` |

### 4.4 Roles

| Method | Path | Auth | Request → Response |
|--------|------|------|---------------------|
| `GET`  | `/api/v1/roles` | Bearer | — → `RoleDto[]` |

---
## 5. DTO Definitions

### Auth

```jsonc
// RegisterRequest              (self-signup; roles always assigned server-side as ["User"])
{ "email": "string", "password": "string", "firstName": "string", "lastName": "string" }

// LoginRequest
{ "email": "string", "password": "string" }

// RefreshRequest — optional body fallback for NON-BROWSER clients only.
// Browsers authenticate POST /auth/refresh purely via the HttpOnly `refreshToken`
// cookie (empty body, credentials: 'include'); the cookie wins when present.
{ "accessToken": "string", "refreshToken": "string" }

// LoginResponse (JSON body only — the rotated refresh token never appears here;
// it is delivered as an HttpOnly cookie). Access token is kept in memory only.
{
  "accessToken": "string",   // short-lived JWT (15 min)
  "expiresIn": 900,          // seconds until accessToken expiry
  "user": { /* UserDto */ }
}
```

### User (authoritative member shape)

```jsonc
// UserDto
{
  "id": "string (uuid)",
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "roles": ["string"],            // e.g. ["Admin","Manager"]
  "status": "active" | "locked" | "disabled",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}

// CreateUserRequest         (Admin creates a user, may assign roles)
{ "email", "firstName", "lastName", "password", "roles": ["string"] }

// UpdateUserRequest         (Admin edits; all fields optional)
{ "email?", "firstName?", "lastName?", "status?", "roles?" }

// UpdateProfileRequest      (self-service; all fields optional)
{ "firstName?", "lastName?" }

// ChangePasswordRequest
{ "currentPassword": "string", "newPassword": "string" }
```

### User List (paginated)

```jsonc
{
  "items": [ /* UserListItem */ ],
  "totalCount": 235,
  "page": 1,
  "pageSize": 10,
  "totalPages": 24
}

// UserListItem = UserDto minus nested/sensitive fields
```

### Roles

```jsonc
// RoleDto
{ "id": "string", "name": "string", "permissions": ["string"] }
```
## 6. Pagination, Filtering, Sorting

**Query params (list endpoints):**

| Param | Rule |
|-------|------|
| `page` | 1-based, default `1` |
| `pageSize` | default `10`, max `100` |
| `search` | optional; case-insensitive substring on `email`, `firstName`, `lastName` |
| `role` | optional; filter by exact role name |
| `status` | optional; `all` (default) \| `active` \| `locked` |
| `sortBy` | optional; whitelisted field, default `createdAt` |
| `sortDir` | `asc` \| `desc`, default `desc` |
| `tenantSlug` | `GET /users` only; optional. Lists that workspace's users instead of the caller's own — accepted **only** from a caller holding `tenants.read` (PlatformAdmin); otherwise `403` (unknown/deleted slug → `404`, suspended → `422 TENANT_SUSPENDED`) |

**Clipping rules:** server clamps `pageSize` to `[1,100]` and `page` to `[1,∞)`. Out-of-range `page` returns empty `items` but valid `totalCount`.

---

## 7. Status Code Reference

| Status | Typical | Body |
|--------|---------|------|
| 200 | Success read/update | DTO / DTO[] |
| 201 | Created | `UserDto` (+ optional `Location`) |
| 204 | No content | none |
| 400 | Bad request | error envelope |
| 401 | Unauthenticated | error envelope |
| 403 | Forbidden | error envelope |
| 404 | Not found | error envelope |
| 409 | Conflict | error envelope |
| 429 | Rate limit | error envelope (+ `Retry-After`) |
| 500 | Server error | error envelope |

---

## 8. Versioning & Change Control

- Breaking changes bump `/v1` → `/v2`.
- Additive changes (new optional fields, new error codes) are allowed within a version.
- Every change updates this file **before** any code lands.