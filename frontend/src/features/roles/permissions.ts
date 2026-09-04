/**
 * Single source of truth for role/permission *strings* on the frontend.
 *
 * Mirrors `Identity.Domain/Permissions.cs` on the backend. Permission and role
 * names are modeled as literal-union types (derived from the const objects
 * below), never raw `string` — so a typo like `'users.reads'` or `'Admni'` is
 * caught at compile time instead of silently failing closed at runtime.
 *
 * NOTE: this module intentionally does NOT define a role → permission map.
 * Runtime gating goes through `useHasPermission` in `roles.store.ts`, which
 * checks the server-fetched role catalog (`GET /roles`) — the backend remains
 * the only source of truth for which role grants which permission. A previous
 * hand-synced `ROLE_PERMISSIONS` map here was deleted: it was dead at runtime
 * and a maintenance trap (edits to it silently changed nothing).
 */

/** Canonical permission ids (`resource.action`), kept in sync with the backend. */
export const PERMISSION = {
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
  USERS_DELETE: 'users.delete',
  ROLES_READ: 'roles.read',
  PROFILE_READ: 'profile.read',
  PROFILE_WRITE: 'profile.write',
  TENANTS_READ: 'tenants.read',
  TENANTS_WRITE: 'tenants.write'
} as const

/** Union of all valid permission ids. */
export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION]

/** Canonical role names seeded by the backend (per-tenant catalog + platform). */
export const ROLE = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  READ_ONLY: 'ReadOnly',
  PLATFORM_ADMIN: 'PlatformAdmin'
} as const

/** Union of all valid role names. */
export type RoleName = (typeof ROLE)[keyof typeof ROLE]


