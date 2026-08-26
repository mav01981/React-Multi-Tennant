# Backend: Identity Configuration (ASP.NET Core 10)

> **Scope:** Backend-only — how ASP.NET Core Identity handles token issuance, JWT validation, authorities, and the token store.
> **Source of truth:** `contracts/auth-flow.md`, `contracts/api-contract.md`.

---

## 1. Dependencies & Component Roles (.NET 10)

| Concern | Package (.NET 10) | Role |
|---------|-------------------|------|
| Identity + EF stores | `Microsoft.AspNetCore.Identity.EntityFrameworkCore` `10.0.x` | User/role stores, user manager, sign-in manager |
| Password hashing | built-in `PasswordHasher<TUser>` (`Microsoft.Extensions.Identity.Core`) | PBKDF2 hashing, lockout/attempts counters |
| JWT bearer auth | `Microsoft.AspNetCore.Authentication.JwtBearer` `10.0.x` | Validates `Authorization: Bearer` access tokens |
| JWT signing/claims | `Microsoft.IdentityModel.JsonWebTokens` (transitive) | Mint + validate JWT (RS256, `jti`, claims) |
| ORM / stores | `Microsoft.EntityFrameworkCore` `10.0.x` | DbContext for user/role/token persistence |
| Authorization | built-in policy authorization (`Microsoft.AspNetCore.Authorization`) | Permission-based `[Authorize(Policy=...)]` |
| Rate limiting | built-in (`Microsoft.AspNetCore.RateLimiting`) | Auth endpoint throttling, `429` + `Retry-After` |

## 2. Token Issuance

| Token | Algorithm | Issuer | TTL |
|-------|-----------|--------|-----|
| Access JWT | RS256 (public/private) | `reactauth-identity` | 900 s (15 min) |
| Refresh | opaque, hashed at rest | — | 2 592 000 s (30 d) |

Access JWT claims: `sub`, `email`, `roles`, `iat`, `exp`, `jti`, `iss` (see `auth-flow.md` §1).

### `jwt` / identity configuration (target shape)

```yaml
identity:
  issuer: ${IDENTITY_ISSUER}
  audience: ${IDENTITY_AUDIENCE}
  accessTtlSeconds: 900
  refreshTtlSeconds: 2592000
  jwksUrl: ${JWKS_URL}
  clockSkewSeconds: 30
  passwordHash: BCrypt
```

## 3. Authorization Model

- Backend guards check **permission/authority**, not bare role names (see `feat-04` §4).
- A `User` is assigned 1..N roles; each role maps to a set of authorities.
- Map: role → authorities constant (e.g. `Admin → {USERS_READ, USERS_WRITE, USERS_DELETE, ROLES_READ}`).

| Endpoint | Required authority |
|----------|--------------------|
| `GET /auth/me` | any authenticated |
| `GET /users` | `USERS_READ` |
| `POST/PUT/DELETE /users/*` | `USERS_WRITE` |
| `GET /roles` | `ROLES_READ` |

## 4. Token Store (Refresh Rotation)

- Persist hashed refresh reference; attach a **family id** so reuse detection can revoke all descendants (per `auth-flow.md` §4).
- Logout and locked-account events revoke the family.

### Table shape (refresh_tokens)

| Column | Type |
|--------|------|
| `family_id` | uuid |
| `user_id` | uuid FK |
| `token_hash` | string (opaque) |
| `created_at`, `expires_at` | timestamptz |
| `revoked_at` | timestamptz \| null |

## 5. Rate Limit & Lockout

| Event | Response | Server behavior |
|-------|----------|-----------------|
| N failed logins | `422 ACCOUNT_LOCKED` | lock user record, revoke refresh family |
| Burst login/refresh/otp | `429 TOO_MANY_REQUESTS` | throttle with `Retry-After` |

---

## 6. Related Specs
- `contracts/auth-flow.md` — lifecycle this config implements.
- `contracts/api-contract.md` — error codes / endpoints.
- `backend/be-ef-migrations.md` — token/user tables.
- `backend/be-security-headers.md` — transport hardening around identity.