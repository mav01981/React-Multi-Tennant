# VueAuth — Specifications Index

This folder is the **specification layer** underpinning `plan.md`. It decomposes the plan into unified feature specs, a shared boundary (contracts), and side-of-the-stack implementation specs.

---

## Directory Layout

```
specs/
├── adr/                         # Architecture Decision Records
│   ├── README.md
│   ├── 0001-react-frontend-stack.md
│   ├── 0002-aspnet-core-identity-backend.md
│   ├── 0003-token-based-authentication.md
│   └── 0004-inmemory-development-database.md
├── features/                    # ONE spec per feature — describes BOTH sides
│   ├── feat-01-authentication.md
│   ├── feat-02-user-management.md
│   ├── feat-03-profile-self-service.md
│   ├── feat-04-role-permissions.md
│   └── feat-05-registration.md
├── contracts/                   # SHARED boundary — single source of truth
│   ├── api-contract.md          # DTOs, endpoints, error shapes, headers
│   └── auth-flow.md             # JWT lifecycle, refresh rotation, logout cleanup
├── frontend/                    # FRONTEND-only implementation details
│   ├── fe-state-management.md
│   ├── fe-routing-guards.md
│   └── fe-component-library.md
└── backend/                     # BACKEND-only implementation details
    ├── be-identity-config.md
    ├── be-ef-migrations.md
    └── be-security-headers.md
```

## Reading Order

| Layer | Purpose | Audience |
|-------|---------|----------|
| `features/` | What each feature must do end-to-end | Product, both teams |
| `contracts/` | The exact boundary both sides implement against | Backend + frontend |
| `frontend/`, `backend/` | How each side implements the contracts | Respective side only |

**Rule of precedence:** if a feature spec and a contract disagree, the **contract wins** — it is the authoritative boundary. Any conflict is a bug in the spec.

## Cross-Reference Map

| Spec | Implements / consumes |
|------|-----------------------|
| `feat-01-authentication` | `contracts/auth-flow.md`, `api-contract.md`, `be-identity-config.md`, `fe-state-management.md` |
| `feat-02-user-management` | `api-contract.md`, `fe-state-management.md`, `be-ef-migrations.md`, `fe-routing-guards.md` |
| `feat-03-profile-self-service` | `api-contract.md`, `auth-flow.md`, `fe-state-management.md` |
| `feat-04-role-permissions` | `api-contract.md`, `fe-routing-guards.md`, `fe-state-management.md`, `be-identity-config.md` |
| `feat-05-registration` | `api-contract.md`, `auth-flow.md`, `feat-01-authentication`, `fe-routing-guards.md`, `be-identity-config.md` |
| `api-contract.md` | referenced by every feature + both implementation folders |
| `auth-flow.md` | referenced by `feat-01/03`, `be-identity-config`, `be-security-headers` |

## Updating Specs

Architecture decisions are recorded in [`adr/`](adr/). Add a new sequential ADR when a technology or durable architecture choice changes, then update the ADR index.

Work top-down so the boundary (contracts) stays canonical:

1. Change the **`features/`** story + acceptance criteria.
2. Update **`contracts/`** first if a DTO, endpoint, error, or header changed.
3. Then reconcile the affected **`frontend/`** / **`backend/`** implementation spec.
4. Never document a boundary change in code before it lands in the contract file.