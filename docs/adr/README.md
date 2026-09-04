# Architecture Decision Records

ADRs record durable technology and architecture choices for reactAuth. Each record captures the context, decision, consequences, and alternatives considered.

| ID | Decision | Status |
|----|----------|--------|
| [0001](0001-react-frontend-stack.md) | React + TypeScript + Vite + Zustand | Accepted |
| [0002](0002-aspnet-core-identity-backend.md) | ASP.NET Core 10 + Identity + EF Core | Accepted |
| [0003](0003-token-based-authentication.md) | JWT access tokens + opaque rotating refresh tokens | Accepted |
| [0004](0004-inmemory-development-database.md) | EF Core InMemory for the runnable demo | Accepted |
| [0005](0005-list-store-factory-vs-react-query.md) | Hand-rolled `createListStore` factory over React Query/SWR for list CRUD | Accepted |
| [0006](0006-frontend-performance-budget.md) | Frontend performance budget (initial chunk ≤ 200 kB gzip) + lazy/memo policy | Accepted |

New decisions should use the next sequential ID and update this index.
