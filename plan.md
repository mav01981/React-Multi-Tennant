

# React (TypeScript) + ASP.NET Core Identity — Plan

## State Management Architecture

### Why We Need It

| Concern | Without State Management | With Zustand Stores |
|---------|------------------------|-------------------|
| **Auth persistence** | Prop-drilling token through components | Centralized `auth` store with localStorage sync |
| **User list caching** | Re-fetch on every navigation | `users` store with cache invalidation |
| **Role/permission checks** | Repeated API calls | `roles` store loaded once at app init |
| **UI state** (modals, toasts) | Scattered refs | `ui` store for global overlays |
| **Form state** | Lost on unmount | Optional `forms` store for draft persistence |

### Store Composition

```
┌─────────────────────────────────────────┐
│         Zustand Store Tree             │
├─────────────┬─────────────┬─────────────┤
│    auth     │   users     │     ui      │
│   store     │   store     │   store     │
├─────────────┼─────────────┼─────────────┤
│ • user      │ • items[]   │ • sidebar   │
│ • token     │ • total     │   collapsed │
│ • isLoading │ • filters   │ • toasts[]  │
│ • error     │ • selected  │ • modals    │
│             │   UserId    │             │
└─────────────┴─────────────┴─────────────┘
         │              │            │
         ▼              ▼            ▼
    localStorage    API Cache    Component
    JWT tokens      pagination   local state
```

---

## 1. Store Definitions

### `auth` Store — Authentication & Identity

```typescript
// stores/auth.ts
import { create } from 'zustand'
import type { UserDto, LoginRequest, LoginResponse } from '@/types/auth'
import { authApi } from '@/api/auth'

interface AuthState {
  // ── State ──────────────────────────────
  user: UserDto | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  error: string | null

  // ── Actions ──────────────────────────
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
  refreshAccessToken: () => Promise<string | null>
}

// Selectors (Zustand equivalent of Pinia getters) — composed outside the store
// so components re-render only when their specific slice changes.
export const selectIsAuthenticated = (s: AuthState) => !!s.accessToken
export const selectIsAdmin = (s: AuthState) => s.user?.roles.includes('Admin') ?? false
export const selectIsManager = (s: AuthState) => s.user?.roles.includes('Manager') ?? false
export const selectFullName = (s: AuthState) =>
  s.user ? `${s.user.firstName} ${s.user.lastName}` : ''
export const selectInitials = (s: AuthState) =>
  s.user ? `${s.user.firstName[0]}${s.user.lastName[0]}` : ''

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const response: LoginResponse = await authApi.login(credentials)
      setSession(set, response)
    } catch (err) {
      set({ error: extractError(err) })
      throw err
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    try { await authApi.logout() } catch {}
    clearSession(set)
  },

  fetchCurrentUser: async () => {
    if (!get().accessToken) return
    try {
      const user = await authApi.me()
      set({ user })
    } catch {
      await get().logout()
    }
  },

  refreshAccessToken: async () => {
    const { accessToken, refreshToken } = get()
    if (!refreshToken || !accessToken) return null
    try {
      const response = await authApi.refresh({ accessToken, refreshToken })
      setSession(set, response)
      return response.accessToken
    } catch {
      clearSession(set)
      return null
    }
  }
}))

// ── Helpers ────────────────────────────
type SetState = (partial: Partial<AuthState>) => void

function setSession(set: SetState, response: LoginResponse): void {
  set({ accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user })
  localStorage.setItem('accessToken', response.accessToken)
  localStorage.setItem('refreshToken', response.refreshToken)
}

function clearSession(set: SetState): void {
  set({ user: null, accessToken: null, refreshToken: null })
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}
```

---

### `users` Store — User Management (Admin)

```typescript
// stores/users.ts
import { create } from 'zustand'
import type { UserListItem, UserListResponse, CreateUserRequest, UpdateUserRequest } from '@/types/users'
import { usersApi } from '@/api/users'

interface UserFilters {
  search: string
  role: string | null
  status: 'all' | 'active' | 'locked'
  page: number
  pageSize: number
}

interface UsersState {
  // ── State ──────────────────────────────
  items: UserListItem[]
  totalCount: number
  selectedUserId: string | null
  filters: UserFilters
  isLoading: boolean
  error: string | null

  // ── Actions ──────────────────────────
  fetchUsers: () => Promise<void>
  createUser: (data: CreateUserRequest) => Promise<void>
  updateUser: (id: string, data: UpdateUserRequest) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  setPage: (page: number) => void
  setSearch: (search: string) => void
}

// Selectors (getters) — recomputed from state on read, safe in React via useUsersStore(selector)
export const selectSelectedUser = (s: UsersState) =>
  s.items.find(u => u.id === s.selectedUserId) ?? null
export const selectTotalPages = (s: UsersState) =>
  Math.ceil(s.totalCount / s.filters.pageSize)
export const selectHasNextPage = (s: UsersState) =>
  s.filters.page < selectTotalPages(s)
export const selectHasPrevPage = (s: UsersState) => s.filters.page > 1

export const useUsersStore = create<UsersState>((set, get) => ({
  items: [],
  totalCount: 0,
  selectedUserId: null,
  filters: {
    search: '',
    role: null,
    status: 'all',
    page: 1,
    pageSize: 10
  },
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null })
    try {
      const { filters } = get()
      const response: UserListResponse = await usersApi.getAll({
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined
      })
      set({ items: response.items, totalCount: response.totalCount })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load users' })
    } finally {
      set({ isLoading: false })
    }
  },

  createUser: async (data) => {
    const newUser = await usersApi.create(data)
    set(s => ({ items: [newUser, ...s.items], totalCount: s.totalCount + 1 }))
  },

  updateUser: async (id, data) => {
    const updated = await usersApi.update(id, data)
    set(s => ({
      items: s.items.map(u => u.id === id ? { ...u, ...updated } : u)
    }))
  },

  deleteUser: async (id) => {
    await usersApi.delete(id)
    set(s => ({
      items: s.items.filter(u => u.id !== id),
      totalCount: s.totalCount - 1
    }))
  },

  setPage: (page) => {
    set(s => ({ filters: { ...s.filters, page } }))
    get().fetchUsers()
  },

  setSearch: (search) => {
    set(s => ({ filters: { ...s.filters, search, page: 1 } }))
    get().fetchUsers()
  }
}))
```

---

### `roles` Store — Role & Permission Cache

```typescript
// stores/roles.ts
import { create } from 'zustand'
import type { RoleDto } from '@/types/roles'
import { rolesApi } from '@/api/roles'

interface RolesState {
  roles: RoleDto[]
  isLoading: boolean
  hasLoaded: boolean
  fetchRoles: () => Promise<void>
}

export const useRolesStore = create<RolesState>((set, get) => ({
  roles: [],
  isLoading: false,
  hasLoaded: false,

  fetchRoles: async () => {
    if (get().hasLoaded) return
    set({ isLoading: true })
    try {
      const roles = await rolesApi.getAll()
      set({ roles, hasLoaded: true })
    } finally {
      set({ isLoading: false })
    }
  }
}))
```

---

### `ui` Store — Global UI State

```typescript
// stores/ui.ts
import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

interface UiState {
  themeMode: 'light' | 'dark'
  sidebarCollapsed: boolean
  toasts: Toast[]
  activeModal: string | null
  toggleTheme: () => void
  toggleSidebar: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  openModal: (name: string) => void
  closeModal: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  // Persist theme preference (mirrors accessToken localStorage hydration pattern)
  themeMode: (localStorage.getItem('themeMode') as 'light' | 'dark') ?? 'light',
  sidebarCollapsed: false,
  toasts: [],
  activeModal: null,

  toggleTheme: () => set(s => {
    const next = s.themeMode === 'light' ? 'dark' : 'light'
    localStorage.setItem('themeMode', next)
    return { themeMode: next }
  }),

  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9)
    set(s => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => get().removeToast(id), toast.duration ?? 4000)
  },

  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  openModal: (name) => set({ activeModal: name }),

  closeModal: () => set({ activeModal: null })
}))
```

---

## 2. Store-to-Store Communication

```typescript
// Pattern: Auth store triggers users refresh on role change
// stores/users.ts — inside updateUser action:
import { useAuthStore } from './auth'

async function updateUser(id: string, data: UpdateUserRequest) {
  const updated = await usersApi.update(id, data)
  const authStore = useAuthStore.getState()
  const currentUser = authStore.user

  // If admin updated their own roles, refresh auth state
  if (currentUser && id === currentUser.id) {
    await useAuthStore.getState().fetchCurrentUser()
  }
}
```

---

## 3. Component Usage Patterns

```tsx
// views/UsersListView.tsx
import { useUsersStore, selectSelectedUser } from '@/stores/users'
import { useAuthStore, selectIsAdmin } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

export function UsersListView() {
  // Subscribe to granular slices — React re-renders only when these change.
  const items = useUsersStore(s => s.items)
  const isLoading = useUsersStore(s => s.isLoading)
  const filters = useUsersStore(s => s.filters)
  const totalPages = useUsersStore(selectTotalPages)
  const isAdmin = useAuthStore(selectIsAdmin)

  const uiStore = useUiStore.getState()

  function handleDelete(id: string) {
    uiStore.openModal('confirm-delete')
    useUsersStore.setState({ selectedUserId: id })
  }

  async function confirmDelete() {
    const { selectedUserId, deleteUser } = useUsersStore.getState()
    if (!selectedUserId) return
    await deleteUser(selectedUserId)
    useUiStore.getState().addToast({ message: 'User deleted', type: 'success' })
    useUiStore.getState().closeModal()
  }

  // ...render table rows from `items`, pagination from `totalPages`
}
```

---

## 4. Store Hydration on App Mount

```typescript
// main.tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import { useAuthStore } from '@/stores/auth'

const bootstrap = async () => {
  // Hydrate auth state before first render
  // Attempt silent re-auth if tokens exist (localStorage is read in store init)
  if (useAuthStore.getState().accessToken) {
    await useAuthStore.getState().fetchCurrentUser()
  }

  const container = document.getElementById('root')!
  createRoot(container).render(
    <BrowserRouter>
      {/* MUI ThemeProvider reads ui.themeMode for light/dark palette */}
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  )
}

bootstrap()
```

---

## 5. Do We Need State Management? — Decision Matrix

| Feature | Store Needed? | Reason |
|---------|--------------|--------|
| Login/logout | ✅ **Yes** | Token must persist across routes |
| Current user info | ✅ **Yes** | Referenced by navbar, guards, multiple views |
| User list (admin) | ✅ **Yes** | Pagination, filters, selection state span views |
| Role definitions | ✅ **Yes** | Cache once, use everywhere (dropdowns, guards) |
| Toast notifications | ✅ **Yes** | Triggered from deep components, shown at root |
| Modal state | ⚠️ **Maybe** | Simple modals: local state. Multi-step: store |
| Form drafts | ⚠️ **Maybe** | Only if navigating away should preserve input |
| Theme/dark mode | ✅ **Yes** | Persist preference, apply globally |

---

## Modern React File Organization (2026)

The frontend uses a feature-oriented structure. Route composition and application
bootstrap live under `app/`; feature code owns its API functions, state, types,
components, and pages; `shared/` contains only reusable code with no feature
knowledge. This keeps changes discoverable and prevents a broad `components/`,
`hooks/`, or `types/` directory from becoming a second dependency graph.

```
src/
├── app/
│   ├── App.tsx                 # Route tree and top-level providers
│   ├── main.tsx                # Browser bootstrap and auth hydration
│   ├── routes.tsx              # Route definitions and lazy boundaries
│   └── providers/
│       ├── ThemeProvider.tsx   # MUI createTheme bound to ui.themeMode
│       ├── AppRouter.tsx       # Router & route providers
│       └── ErrorBoundary.tsx   # Error provider
├── features/
│   ├── auth/
│   │   ├── api.ts              # login, logout, me, refresh
│   │   ├── auth.store.ts       # Zustand session state and actions
│   │   ├── auth.types.ts       # Login and identity contracts
│   │   ├── components/         # Login form and auth-specific UI (MUI)
│   │   ├── pages/              # LoginPage
│   │   └── guards/             # ProtectedRoute and role guards
│   ├── users/
│   │   ├── api.ts              # Admin user CRUD
│   │   ├── users.store.ts      # List cache, filters, selection
│   │   ├── users.types.ts
│   │   ├── components/         # MUI Table, Dialog, FilterBar
│   │   └── pages/              # UsersPage
│   └── roles/
│       ├── api.ts
│       ├── roles.store.ts      # Role definition cache
│       └── roles.types.ts
├── shared/
│   ├── api/
│   │   ├── client.ts           # Fetch wrapper and refresh single-flight
│   │   └── errors.ts           # Shared API error parsing
│   ├── components/             # Thin MUI wrappers (Button, Dialog, Toast, loaders)
│   ├── hooks/                  # Cross-feature React hooks only
│   ├── lib/                    # Pure utilities and configuration
│   ├── styles/                 # MUI theme tokens, base.css, font setup
│   └── types/                  # Contracts shared by multiple features
└── vite-env.d.ts
```

### Organization Rules

- Use React functional components with hooks for all frontend UI; do not add new class components.
- A feature may import from `shared/`, but `shared/` never imports a feature.
- Keep feature-specific types beside the API or state that owns them; promote a
  type to `shared/types/` only after at least two features use it.
- Prefer direct feature imports such as `@/features/auth/auth.store`; avoid
  barrel files until they solve a demonstrated import-cycle or public-API need.
- Keep route pages thin: data fetching and mutations belong to the feature API
  or store, while page components compose feature components.
- Use `React.lazy` at route boundaries when the application gains enough pages
  for code splitting to matter; do not introduce lazy loading for the initial
  login and landing path prematurely.

### Migration From The Current Tree

The current `src/App.tsx` and `src/main.tsx` move to `src/app/`; `views/LoginView`
and `views/LandingView` become feature pages; `components/ProtectedRoute` moves
to `features/auth/guards/`; and the existing `api/`, `stores/`, and `types/`
modules move into their owning feature or `shared/` directory. The public
behavior and Zustand contracts stay unchanged during this reorganization.

---

## 6. UI Framework — Material UI (MUI)

### Why MUI

We adopt **Material UI (MUI)** as the single component library for the frontend.
It provides production-grade React components (buttons, forms, data tables,
dialogs, navigation) that plug directly into our Zustand stores — replacing the
hand-rolled `Button`, `Modal`, `Toast`, and loading primitives that earlier
sections listed under `shared/components/`.

| Need (previous plan) | Home-rolled | With MUI |
|----------------------|-------------|----------|
| Buttons, inputs, cards | Custom `shared/components` | `@mui/material` `Button`, `TextField`, `Card` |
| Confirm / modal dialogs | Custom `Modal` + `ui.activeModal` | MUI `Dialog` routed by `ui.activeModal` |
| Toasts | Custom toast host | MUI `Snackbar` + `Alert` host wired to `ui.toasts` |
| Data table + pagination | Hand-built table | MUI `Table`, or `@mui/x-data-grid` for advanced grids |
| Icons | Font icons / inline SVGs | `@mui/icons-material` |
| Loaders / skeletons | Custom loading UI | `CircularProgress`, `LinearProgress`, `Skeleton` |

### Dependencies

```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
# optional: npm install @mui/x-data-grid
```

MUI uses **Emotion** as its styling engine (imported for `sx` overrides and custom
`styled` components). It ships as plain JS/CSS with first-class TypeScript and Vite
support (via `@vitejs/plugin-react`), and needs no runtime CSS framework of its own.

### Theme Architecture

A single MUI `ThemeProvider` sits at the app root (in `app/providers/`) and builds
its palette from the `ui` store, so light/dark preference persists across reloads:

```tsx
// app/providers/ThemeProvider.tsx
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { useMemo, type ReactNode } from 'react'
import { useUiStore } from '@/stores/ui'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useUiStore(s => s.themeMode) // 'light' | 'dark'
  const theme = useMemo(
    () => createTheme({
      palette: { mode },
      typography: { fontFamily: ['Inter', 'Roboto', 'sans-serif'].join(',') },
      shape: { borderRadius: 8 }
    }),
    [mode]
  )
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />          {/* normalize CSS + apply palette background */}
      {children}
    </MuiThemeProvider>
  )
}
```

### Store Integration

- The `ui` store owns theme + overlay concerns: `themeMode`, `sidebarCollapsed`,
  `toasts`, `activeModal`. It exposes `toggleTheme`, which flips the mode and
  persists it to `localStorage` (`themeMode` key).
- **Toasts** render from a single MUI `Snackbar`/`Alert` host subscribed to
  `ui.toasts`; each `Toast.type` maps to an `Alert` `severity` (`success`,
  `error`, `warning`, `info`).
- **Modals** route by `ui.activeModal`: a small map/switch turns the modal id into
  an MUI `Dialog` (e.g. `confirm-delete`). Confirm/cancel dispatch the existing
  `closeModal` action and the store's mutation action.
- **Forms** use MUI `TextField`/`Select` as controlled inputs; submission goes
  through the feature store/API exactly as in §3 — MUI only handles presentation.
- Keep business logic in the Zustand stores; MUI components read state and emit
  actions. Do not call `setState` from inside MUI event handlers other than via the
  store's own actions.

### Design Tokens & Migration

- Define shared tokens (spacing, radius, color, typography) inside the MUI `theme`
  object rather than a parallel SCSS token pipeline; let `shared/styles/` keep only
  `base.css`, font loading, and a couple of global utilities MUI cannot express.
- Feature components consume the theme through `useTheme()` / `sx` props; avoid
  magic hex values scattered in files.
- MUI components are plain React components, so the existing testing approach in
  §7 is unchanged — we assert against Zustand store behavior, not DOM/CSS.


## 7. Testing Strategy

> **Guiding principle:** Test the behavior a user or integrator can observe, not the implementation. Zustand stores, API DTOs, and auth flows are the seams we assert against. Each store/controller is exercised twice — once in isolation (unit) and once through the public surface it exposes (contract/component).

### 7.1 Pyramid Overview

| Tier | Scope | Tooling | Speed |
|------|-------|---------|-------|
| **Unit** | Store actions, services, serializers, auth helpers | Vitest (FE) / **xUnit** + Moq (BE) | Fast, isolated |
| **Contract / API** | DTO shapes, endpoints, error envelope, refresh rotation | MSW smoke / ASP.NET `WebApplicationFactory` + `TestClient` (BE) | Fast, no real I/O |
| **Integration** | Store↔API, EF queries against test DB, refresh interceptor | Vitest + MSW; xUnit + in-memory/test DB | Medium |
| **Component / E2E** | Full user journeys (login → CRUD → logout) | Vitest + React Testing Library; Playwright | Slow, few |

### 7.2 Frontend (React + Zustand)

**Framework:** Vitest + React Testing Library (`@testing-library/react`); **Mock Service Worker (MSW)** for API stubs; **Playwright** for browser E2E.

**Unit — feature stores (`features/*/*.store.ts`)**

| Store | Golden-path case | Key assertion |
|-------|------------------|---------------|
| `auth` | `login()` success with mocked `authApi` | tokens + `user` set; localStorage writes happen |
| `auth` | `login()` failure | `error` populated, `throw` re-raised, session unchanged |
| `auth` | `refreshAccessToken()` when token expired | new pair persisted, old tokens replaced |
| `auth` | `fetchCurrentUser()` on `401` | falls through to `logout()` → `clearSession()` |
| `users` | `fetchUsers` success/failure | `items`+`totalCount` replaced; `isLoading` toggles |
| `users` | `createUser` / `deleteUser` | optimistic `unshift` / filter removes row |
| `users` | `updateUser` on self | calls `fetchCurrentUser()` (cross-store) |
| `ui` | `addToast` / `removeToast` | toast auto-expires; manual removal filters list |

**Testing notes**
- Mock the `*/api/*` layer (MSW or hand-stubbed `authApi`) — never hit a live backend in unit tests.
- Use **fake timers** (`vi.useFakeTimers()`) for `addToast` auto-dismiss assertions.
- Verify selector-derived values against mocked state: `selectIsAdmin`, `selectIsManager`, `selectFullName`, `selectInitials`.
- **Zustand reset:** use `useAuthStore.setState({ ...initState }, true)` (second arg replaces) or `useAuthStore.setState(initial, true)` before each test so stores don't leak state between cases — or reconstruct the store with module-level `reset` helpers.

**Component tests — `views/*.tsx`**
- Render a view with the real Zustand stores but stubbed API layer (React Testing Library `render()` + `screen` queries).
- `UsersListView` → assert delete flow: `openModal('confirm-delete')` → `deleteUser` → success toast + modal closes.
- Assert selector-subscribed values render reactively after a store action (e.g. items list updates after `deleteUser`).

**E2E — Playwright**
- Login → redirect landing → reload **keeps session** (silent re-auth).
- Expired access token: a request still succeeds (refresh + replay).
- Admin: create → search → edit → delete a user, with modal + toast appearing.
- Logout → tokens gone from localStorage → login page shown.

### 7.3 Backend (ASP.NET Core)

**Framework:** **xUnit** + **Moq** for unit/slice tests; repository tests against an isolated test database; `WebApplicationFactory` + `TestClient` against a spun-up test instance for the contract suite.

**Unit — service & helper layer**

| Class | Tests |
|-------|-------|
| `AuthController` / auth service | verify credentials, lockout branch, token pair minting |
| `RefreshTokenService` | rotate on success; **revoke whole family** on reuse |
| `LogoutService` | always revoke + idempotent (204 on repeat) |
| `UserService` | password hashing, email-uniqueness conflict, soft-delete |

**Contract tests (`WebApplicationFactory` + `TestClient`)**

Boundary-critical assertions pinned to `specs/contracts/*`:

| Contract | Assertion |
|----------|-----------|
| Auth | `POST /auth/login` happy path → 200 + `LoginResponse` |
| Auth | bad creds → `401 INVALID_CREDENTIALS` envelope |
| Auth | `refresh` misuse → `401 REFRESH_TOKEN_REVOKED` |
| Users | `GET /users?page=&pageSize=&search=` → clamped page, exact shape |
| Errors | every non-2xx returns the single error envelope (code/message/details) |
| Headers | HSTS/CSP/CORS headers present on all responses |

**Integration — repository + migrations**
- Repository (EF) tests via xUnit against an isolated test schema: user CRUD, roles/permissions resolution, refresh-family persistence.
- Migration smoke test: apply `0001..0006` against a blank schema, assert bootstrap admin seeded and idempotent on re-run.

### 7.4 Coverage Targets

| Area | Required coverage (line) |
|------|--------------------------|
| `auth` store actions | 100% |
| `users` store actions | 100% |
| `ui` store actions | 100% |
| Backend auth/refresh/logout paths | 100% |
| Backend user CRUD + validation | ≥80% |
| Contract/error-envelope bindings | 100% (key scenarios) |

### 7.5 Definitions

- **Unit-testable seam:** mock any module that performs I/O (fetch, DB, JWT), assert behavior, no live network.
- **Isolation:** every test constructs its own instance/session so a failure in one does not corrupt another.
- **Test net naming:** mirror production folder structure under `__tests__/` (e.g. `stores/auth.spec.ts`), matching `specs/` doc alongside.

## 8. Architecture & Docker Deployment

### 8.1 Top-Level Architecture

Every layer runs in its own container. A single reverse proxy (the FE nginx image) serves the compiled React assets **and** forwards `/api/*` to the backend, so the browser only ever talks to one origin — keeping CORS and token cookie handling trivial.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Browser / Client                             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ :80
                                ▼
                     ┌───────────────────────┐
                     │  frontend (nginx)     │  FE:8000
                     │  ├─ serves /          │
                     │  └─ proxy /api/* ─────┼──────────┐
                     └───────────────────────┘          │
                                                        ▼
                                              ┌─────────────────────────┐
                                              │  backend (ASP.NET Core) │  BE:8080
                                              │  /auth  /users  /roles  │
                                              └────────────┬────────────┘
                                                           ▼
                                              ┌─────────────────────────┐
                                              │  db (PostgreSQL)        │  DB:5432
                                              │  users/roles/refresh    │
                                              └─────────────────────────┘
```

| Layer | Runtime | Role | Outbound |
|-------|---------|------|----------|
| **FE** | nginx (static) + Vite build artifacts | Serves React TS SPA; proxies `/api` | → Backend via proxy |
| **BE** | ASP.NET Core 10 (`mcr.microsoft.com/dotnet/runtime`) | Identity, user/role APIs, EF migrations | → PostgreSQL |
---

### 8.2 Backend Container — `backend/Dockerfile`

Two-stage build: a build image compiles the .NET service, the runtime image runs only the packaged artifact (no toolchain at runtime).

```dockerfile
# ── Stage 1: build & compile ─────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10-alpine AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/App -c Release -o /build/out
RUN dotnet tooling run sql -- migrate "0001..0006" --config production

# ── Stage 2: slim runtime ────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/runtime:10-alpine AS runtime
WORKDIR /app
COPY --from=build /build/out/ ./
EXPOSE 8080
HEALTHCHECK  --interval=15s --timeout=5s \
  CMD wget -qO- http://localhost:8080/health || exit 1
ENTRYPOINT ["./App","--listen",":8080"]
```

---

### 8.3 Frontend Container — `frontend/Dockerfile`

Two stages again: build the React TS bundle (Vite), then serve the static output behind nginx. The nginx conf is the single proxy hop that keeps FE origin == BE origin.

```dockerfile
# ── Stage 1: build the static app ────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build          # emits /app/dist (React TS bundle)

# ── Stage 2: serve + reverse proxy ───────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

`frontend/nginx.conf` — serves the SPA and forwards API calls to the backend container:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # React SPA fallback: all non-asset paths → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy: keep a single browser origin
    location ~ ^/api/(.*)$ {
        proxy_pass http://backend:8080/api/$1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### 8.4 Docker Compose — `compose.yaml` (project root)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: vueauth
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
    restart: unless-stopped
    environment:
      DATABASE_URL: "postgresql://postgres:change-me@db:5432/vueauth"
      IDENTITY_ISSUER: "vueauth-identity"
      IDENTITY_AUDIENCE: "vueauth-client"
      ACCESS_TTL_SECONDS: 900
      REFRESH_TTL_SECONDS: 2592000
      JWKS_URL: ""
      SECURITY_PASSWORD_SALT: "<set-at-first-run>"
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy

volumes:
  pgdata:
```

---

### 8.5 Startup Flow & Runbook

1. `docker compose up -d` — brings up `db` → `backend` → `frontend` in dependency order (health-gated).
2. `frontend` boots nginx, serves the SPA at `http://localhost:${FRONTEND_PORT}`, proxies `/api/*` → `backend:8080`.
3. `backend` (already migrated during build) serves auth/user/role routes; `/health` endpoint drives the gate.
4. First admin: the seeded bootstrap account accepts the env-configured email + one-time generated password (must be rotated on first login).

| Command | Effect |
|---------|--------|
| `docker compose up --build` | Rebuild FE/BE images, then start |
| `docker compose down` | Stop all, keep `pgdata` volume |
| `docker compose down` + remove volume | Full reset (drop DB) |
| `docker compose run` with override mounts | Dev overrides per side |

> **Dev-mode override:** for hot-reload during backend/dev, mount the source tree instead of the baked image; likewise `vite` serves the FE hot. Compose override mounts allow per-machine tweaks without editing shared files.

---

### 8.6 Environment Variables (source of truth)

All secrets surface through Compose `variables`/`.env` — never hardcoded:

| Name | Component | Purpose |
|------|-----------|---------|
| `POSTGRES_USER / PASSWORD / DB` | `db`, `backend` | DB auth + DSN |
| `DATABASE_URL` | `backend` | Postgres DSN passed to EF |
| `IDENTITY_ISSUER` / `IDENTITY_AUDIENCE` | `backend` JWT | JWT `iss` / `aud` claims |
| `ACCESS_TTL_SECONDS` / `REFRESH_TTL_SECONDS` | `backend` JWT | Token lifetimes (900 / 2592000) |
| `SECURITY_PASSWORD_SALT` | `backend` hashing | Password hash pepper (rotate on first boot) |
| `FRONTEND_PORT` / `BACKEND_PORT` / `DB_PORT` | `compose` | Host-side port bindings |
| `VITE_API_BASE_URL` | `frontend` | Falls back to same-origin `/api` in prod |
| `JWKS_URL` | `backend` JWT | Optional external authority override |

For the full list and accepted values mirror `specs/backend/be-identity-config.md` §2 and the contract error table.

---
## Summary

| Store | Responsibility | Persistence |
|-------|---------------|-------------|
| `auth` | Identity, tokens, login state | localStorage |
| `users` | Admin user list, CRUD, filters | In-memory (API cache) |
| `roles` | Role definitions for dropdowns/guards | In-memory (lazy load) |
| `ui` | Toasts, modals, layout, **theme mode** | localStorage (themeMode) / in-memory |

**Bottom line:** Yes, we need dedicated state management. Zustand gives us type-safe, modular stores that scale from auth through admin CRUD to global UI — with minimal boilerplate, granular selector subscriptions for React performance, and a tiny API surface that keeps our components lean.