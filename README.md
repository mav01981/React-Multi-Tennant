# IdentityReact — React + ASP.NET Core Identity

Implementation of **`specs/features/feat-01-authentication.md`**: login, session persistence,
silent re-auth, single-flight token refresh, logout with server-side family revocation.

| Layer | Tech | Location |
|-------|------|----------|
| Frontend | React 18 + TypeScript + Zustand + Vite | [`frontend/`](frontend/) |
| Backend | ASP.NET Core 10 (Identity) + EF Core | [`backend/`](backend/) |

## Backend

```
cd backend
dotnet run --urls http://localhost:5099
```

- Endpoints (base `/api/v1`): `auth/login`, `auth/refresh`, `auth/logout`, `auth/me` — see `specs/contracts/api-contract.md`.
- JWT: RS256 access token (15 min), opaque refresh token (30 days) with rotation + family revocation on reuse.
- Run the E2E smoke test (requires the server running): `powershell -ExecutionPolicy Bypass -File .\e2e.ps1`
- Bootstrap admin (idempotent seed, `appsettings.json` → `Seed`):
  `admin@example.com` / `ChangeMe-Admin-1!` — **rotate on first login in production.**

## Frontend

```bash
cd frontend
npm install
npm run dev          # serves on http://localhost:5173, proxies /api -> http://localhost:5099
npm run build        # type-check + production bundle
```

- Zustand `auth` store with selectors (`selectIsAuthenticated`, `selectIsAdmin`, …) — `src/stores/auth.ts`.
- API client implements the **single-flight refresh + replay** interceptor — `src/api/client.ts`.
- Hydration: `src/main.tsx` calls `fetchCurrentUser()` before first render (silent re-auth).

## Specs

Requirement docs live in [`specs/`](specs/) (features + contracts + implementation specs). Durable technology choices are recorded in [`specs/adr/`](specs/adr/).

## Notes / limitations

- EF Core **InMemory** provider is used for a zero-setup runnable demo. For production,
  switch to Postgres per `specs/backend/be-ef-migrations.md`.
- The RSA signing key is generated in-memory at startup; production should supply JWKS.
- Local dev serves CORS for any origin and a relaxed CSP — restrict in production
  (`specs/backend/be-security-headers.md`).