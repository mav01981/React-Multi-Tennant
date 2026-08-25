# Backend: EF Migrations (Entity Framework)

> **Scope:** Backend-only — the database schema that backs identity, users, roles, permissions, and refresh-token family revocation.
> **Source of truth:** `contracts/api-contract.md`, `backend/be-identity-config.md`.

---

## 1. Migration Strategy

- **ORM:** Entity Framework Core migrations (incremental, additive).
- **Naming:** `Nnnn_name`, sequential, never rewritten once applied.
- **Idempotence:** every migration safe to re-run; use `if not exists` guards where the backend supports it.
- **Destructive ops:** performed via explicit, reviewed migrations only (never edited in place).

## 2. Schema

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `email` | text unique | case-insensitive unique index |
| `first_name` | text | |
| `last_name` | text | |
| `password_hash` | text | BCrypt/Argon2 |
| `status` | enum: `active` \| `locked` \| `disabled` | default `active` |
| `failed_login_count` | int | lockout tracking |
| `created_at`, `updated_at` | timestamptz | |

### `roles`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `name` | text unique | e.g. `Admin`, `Manager`, `User` |
| `permissions` | text[] (or FK join) | see note below |

> **Permission modeling decision:** start with a **string-array column** for v1 simplicity (`["USERS_READ", ...]`). Split into a join table (`role_permissions`) only when role editing is added. Record that decision in the migration comment.

### `user_roles` (join)

| Column | Type |
|--------|------|
| `user_id` | uuid FK → users |
| `role_id` | uuid FK → roles |
| `assigned_at` | timestamptz |

### `refresh_tokens`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `family_id` | uuid FK → refresh_families |
| `user_id` | uuid FK → users |
| `token_hash` | text (opaque) |
| `created_at`, `expires_at` | timestamptz |
| `revoked_at` | timestamptz null |

### `refresh_families`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `user_id` | uuid FK → users |
| `revoked_at` | timestamptz null |

## 3. Migration Sequence (v1)

| Migration | Adds |
|-----------|------|
| `0001_create_users` | `users` table + unique email index |
| `0002_create_roles` | `roles` table + seed Admin/Manager/User |
| `0003_create_permissions` | seed permission data, `role_permissions` join |
| `0004_create_user_roles` | join table + seed the first bootstrap admin |
| `0005_create_refresh_tokens` | `refresh_families` + `refresh_tokens` |
| `0006_seed_bootstrap_admin` | role assignment for the initial admin account |

## 4. Seed / Bootstrap

- **Bootstrap admin** is created by an idempotent seed (env-configured email + a one-time generated password that must be rotated).
- Role seeds must include the default `User` role every account receives.

---

## 5. Related Specs
- `contracts/api-contract.md` — DTOs these tables serialize.
- `backend/be-identity-config.md` — token-store tables + lockout fields.
- `features/feat-02-user-management.md` — CRUD over `users`.