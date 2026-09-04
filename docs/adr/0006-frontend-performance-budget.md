# ADR-0006: Frontend Performance Budget and Optimization Strategy

- Status: Accepted
- Date: 2026-09-05

## Context

The frontend docs record component-authoring rules (`fe-state-management.md`, `fe-component-library.md` mention `useMemo`/`useShallow` in passing), but nothing answers "when do we lazy-load?" or "when do we memoize?" — those decisions were being made ad hoc per PR (per-route `React.lazy` in `App.tsx`, memoized `UserRow`/`TenantRow`). The app is currently a small admin-CRUD SPA (~7 routes, MUI-based), so this ADR is written *early and short*, as a written answer rather than an after-the-fact retrofit.

Measured production output (`npx vite build`, gzip):

| Chunk | Raw | gzip | Loaded |
|-------|-----|------|--------|
| `index` (app shell: React, router, Zustand, MUI, login/landing) | 435 kB | **139 kB** | eagerly |
| `UsersPage` | 11 kB | 4.1 kB | on `/users` |
| `TenantsPage` | 6.4 kB | 2.6 kB | on `/tenants` |
| `ProfilePage` | 2.8 kB | 1.1 kB | on `/profile` |
| `RolesPage` | 1.2 kB | 0.7 kB | on `/roles` |

## Decision

### Budget

- **Initial chunk (`index`, gzip): ≤ 200 kB.** Current 139 kB. This is the number to watch; it moves almost entirely via new dependencies, not new pages.
- **Any single lazy route chunk: ≤ 30 kB gzip.** Keeps route splits meaningful — a route chunk approaching the initial budget should instead have its own dependencies re-examined.
- **First navigation (initial chunk + one route chunk): ≤ 230 kB gzip.**
- Budgets are checked with the `vite build` size table when adding a dependency, a page, or a large feature. Exceeding a budget requires either shrinking the change or a written exception in the PR referencing this ADR.

### Code-splitting policy

- Keep the **login/landing path eager** (first paint must not wait on a chunk fetch); lazy-load every **secondary/admin page** per route (`React.lazy` + single `Suspense` with `RouteFallback`).
- Never split shared infrastructure (API client, stores, guards, theme, toasts) — it is needed by the eager path and splitting it only adds waterfall requests.

### Memoization policy

- **Do not memoize by default.** Memoize a component only when it demonstrably re-renders on unrelated state at meaningful cost (e.g. table rows re-rendering on every search keystroke), verified with the React DevTools Profiler.
- When a row is extracted into a `React.memo` component, **all handler props must be `useCallback`-stable in the same change** (keyed by store actions, never by row data — the row entity is passed as an argument). A memo without stable handlers is worse than no memo: it pays the comparison cost and re-renders anyway.
- Keep store subscriptions selective (`useShallow` slices, exported selectors) per `fe-state-management.md` — that, not `memo`, is the primary re-render control.

### Dependency rule

MUI/React dominate the initial chunk. Adding a heavyweight dependency (charts, date pickers, data grid, editor) must be justified against the initial-chunk budget and imported narrowly (per-component MUI imports, no icon barrels); such a feature belongs in a lazy route chunk, not the eager path.

## Consequences

- Pro: "when lazy / when memo" has a written answer a PR can point to; budgets are concrete and measurable from a standard build.
- Pro: the current shape already complies, so the ADR codifies practice rather than mandating work.
- Con: budgets are hand-checked, not CI-enforced; drift is possible until a gate exists (see alternatives).
- Con: gzip numbers vary slightly between builds/environments; treat the table as approximate and the thresholds with ~10% slack.

## Alternatives considered

- **`size-limit` (or `bundlesize`) CI gate:** the natural next step; deferred until the first budget violation or the second heavy dependency, since the manual build check is currently sufficient and CI steps were just expanded.
- **React Router's route-level `lazy()` API:** equivalent capability; the current `React.lazy` + `.then(m => ({ default: m.x }))` form works with named exports without touching feature files. Revisit only if migrating to route-object `lazy()` anyway.
- **Manual-chunk vendor splitting (e.g. splitting MUI out of `index`):** rejected for now — it adds a request without reducing first-load bytes at this size; revisit if the initial chunk nears the budget.
- **List virtualization (`react-window`):** not needed at current page sizes (server-paginated, ≤ page-size rows); the memoized-row strategy covers the realistic range.

Related: `frontend/src/app/App.tsx`, `frontend/src/shared/ui/RouteFallback.tsx`, `frontend/src/features/users/pages/UserRow.tsx`, `frontend/src/features/tenants/pages/TenantRow.tsx`, `docs/frontend/fe-state-management.md`, `docs/frontend/fe-component-library.md`, `plan.md` (Organization Rules).