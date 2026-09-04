# ADR-0005: Hand-Rolled List State via a Store Factory (not React Query/SWR)

- Status: Accepted
- Date: 2026-09-05

## Context

The admin surfaces (`users`, `tenants`) and any future paginated list page need four things: fetch a server-backed paginated + filterable list with abort-race guarding, keep pagination/search/filter state, run CRUD, and keep the UI consistent after mutations. Two or more near-identical feature stores were emerging (the second was about to be a copy-paste of the first), and — unlike the auth store (ADR-0003) and the framework picks (ADR-0001/0002) — no decision record documented this choice.

The main candidates: adopt a data-fetching library (TanStack Query aka React Query, or SWR, which also ship server-cache, de-duplication, and background invalidation) vs. keep the existing Zustand store and DRY it by extracting a shared factory.

## Decision

Code a small generic `createListStore` factory (`frontend/src/shared/store/createListStore.ts`) on top of the existing Zustand stack, and drive the `users`/`tenants` feature stores through it rather than adopting React Query/SWR.

The factory owns everything a list page repeats:
- Abort-controller race guarding (only the latest in-flight request may commit).
- Pagination state + selectors (total/next/prev pages).
- CRUD action shapes (create/delete refetch so page + count stay in sync with the active filters; update merges in place; delete clears selection).
- Search/filter setters that reset to page 1 and refetch.

A feature store becomes a thin adapter supplying its `api`, filter type, `toParams`, and the few genuinely feature-specific bits (how an `update` merges, and `onUpdated` side-effects such as refreshing auth).

## Consequences

- Pro: no new runtime dependency; reuses the existing Zustand selector/imperative model already documented in `fe-state-management.md`; fully granular control over pagination/form state; a small, tested API; the second and future resources are cheap, consistent copies.
- Pro: no abort-race or stale-page warts to re-implement per feature — one tested implementation.
- Con: no server-cache/background-invalidation story the way React Query/SWR provide; each list remount refetches by design (fine for this admin-CRUD shape).
- Con: a small amount of bespoke, project-specific abstraction must be maintained, along with tests (`createListStore.test.ts`), instead of a battle-tested library's guarantees.

## Alternatives considered

- **TanStack Query / React Query:** deferred — its main wins (auto-cache, de-dupe, background invalidation) are not needed for these low-volume admin CRUD lists; pagination + filters are already owned by the store, and introducing Query would mean mapping server-cache state back into Zustand (or adopting Query's cache as source of truth), adding a dependency with no near-term gain. Revisit if a resource needs cross-view caching or optimistic invalidation at scale.
- **SWR:** same reasoning as React Query; deferred.
- **Copy the store per feature (the status quo before this ADR):** rejected — the second list store was already ~90% duplicated logic; a third would be the third copy.
- **A root/app-wide store with a cross-cutting list slice:** considered, but list state is inherently per-resource and per-feature, so tightly scoped factories + colocated feature stores were chosen (matches §1 of `fe-state-management.md`).

Related: `frontend/src/features/users/users.store.ts`, `frontend/src/features/tenants/tenants.store.ts`, `frontend/src/shared/store/createListStore.test.ts`, `docs/frontend/fe-state-management.md`.