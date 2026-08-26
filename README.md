# IdentityReact — React + ASP.NET Core Identity

Multi-tenant identity demo implementing the feature specs in [`docs/features/`](docs/features/):

| Feature | Spec |
|---------|------|
| Authentication — login, session persistence, silent re-auth, single-flight token refresh, logout with family revocation | [`feat-01`](docs/features/feat-01-authentication.md) |
| User management — admin CRUD with pagination, search, filters | [`feat-02`](docs/features/feat-02-user-management.md) |
| Profile self-service — view/edit own profile, change password | [`feat-03`](docs/features/feat-03-profile-self-service.md) |
| Roles & permissions — permission-granular authorization, lazy role cache | [`feat-04`](docs/features/feat-04-role-permissions.md) |
| **Superadmin tenant management** — platform-wide tenant CRUD, suspend/reactivate, soft-delete | [`feat-05`](docs/features/feat-05-superadmin-tenant-management.md) |

| Layer | Tech | Location |
|-------|------|----------|
| Frontend | React 18 + TypeScript + Zustand + MUI + Vite | [`frontend/`](frontend/) |
| Backend | ASP.NET Core 10 (Identity) + EF Core | [`backend/`](backend/) |

## Multi-tenancy

- Every user belongs to exactly one tenant; emails are unique per tenant and roles are scoped per tenant.
- Login resolves the workspace from the `X-Tenant-Id` header (the login form's *Workspace* field); after that the JWT's `tid` claim is authoritative.
- A reserved `platform` tenant hosts the bootstrap **PlatformAdmin** super-admin (`admin@example.com` / `ChangeMe-Admin-1!`), who can manage all tenants via `GET/POST/PUT/DELETE /api/v1/tenants`.
- Suspending a tenant rejects new logins with `422 TENANT_SUSPENDED`; deleting is a soft-delete.

## Backend

```
cd backend
dotnet run --urls http://localhost:5099
```

- Endpoints (base `/api/v1`): `auth/*`, `users/*`, `roles`, `tenants` — see [`docs/contracts/api-contract.md`](docs/contracts/api-contract.md).
- JWT: RS256 access token (15 min), opaque refresh token (30 days) with rotation + family revocation on reuse.
- E2E smoke tests (require the server running):
  ```
  powershell -ExecutionPolicy Bypass -File .\e2e.ps1          # auth
  powershell -ExecutionPolicy Bypass -File .\e2e-users.ps1    # user management
  powershell -ExecutionPolicy Bypass -File .\e2e-roles.ps1    # roles
  powershell -ExecutionPolicy Bypass -File .\e2e-profile.ps1  # profile self-service
  powershell -ExecutionPolicy Bypass -File .\e2e-tenants.ps1  # tenant management
  ```
- Bootstrap seed (idempotent, `appsettings.json` → `Seed`): the `platform` tenant, default role catalog
  per tenant (`Admin` / `Manager` / `ReadOnly`), and the PlatformAdmin user —
  `admin@example.com` / `ChangeMe-Admin-1!`. **Rotate in production.**

## Frontend

```bash
cd frontend
npm install
npm run dev          # serves on http://localhost:5173, proxies /api -> http://localhost:5099
npm test             # vitest unit/component tests
npm run build        # type-check + production bundle
```

- Feature modules under `src/features/` — each owns its store, API client, guards and pages:
  - `features/auth` — Zustand `auth` store (`selectIsAuthenticated`, …), login page, route guard.
  - `features/users` — user management + profile self-service.
  - `features/roles` — lazily-cached roles catalog + `RequirePermission` route guard (`useHasPermission`).
  - `features/tenants` — superadmin tenant administration (`/tenants`, gated by `tenants.read`).
- API client implements the **single-flight refresh + replay** interceptor — `src/shared/api/client.ts`; it also attaches `X-Tenant-Id` on every request.
- Hydration: `src/app/main.tsx` calls `fetchCurrentUser()` and loads the role catalog before first render (silent re-auth).
- Light/dark theme is a client-side preference persisted in `localStorage` (`themeMode`) — not synced to the backend.

## Specs

Requirement docs live in [`docs/`](docs/) (features + contracts + frontend/backend specs). Durable technology choices are recorded in [`docs/adr/`](docs/adr/).

## Notes / limitations

- EF Core **InMemory** provider is used for a zero-setup runnable demo. For production,
  switch to Postgres per [`docs/identity/id-ef-migrations.md`](docs/identity/id-ef-migrations.md).
- The RSA signing key is generated in-memory at startup; production should supply JWKS.
- Local dev serves CORS for any origin and a relaxed CSP — restrict in production
  ([`docs/identity/id-security-headers.md`](docs/identity/id-security-headers.md)).
