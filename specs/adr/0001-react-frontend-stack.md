# ADR-0001: React Frontend Stack

- Status: Accepted
- Date: 2026-08-25

## Context

The client needs a typed single-page application with guarded routes, shared authentication state, user-management state, and a fast local development loop. The repository is organized around feature-owned React components and API clients.

## Decision

Use React 18 with TypeScript, Vite, and Zustand:

- React provides the component and routing host.
- TypeScript defines API and store contracts at compile time.
- Vite provides development serving, proxying, and production bundling.
- Zustand owns cross-route auth, user-management, and UI toast state.

## Consequences

The frontend stays small and feature-oriented with minimal framework overhead. State updates are explicit and selector-based. The team owns conventions for API synchronization and does not get a larger batteries-included framework or server-state cache by default.

## Alternatives considered

- Vue 3 + Pinia: consistent with the original specification wording, but the implemented client and package manifest are React-based.
- Redux Toolkit: more ceremony than the current application needs.
- Next.js: server rendering and framework routing are unnecessary for this client-only API application.
