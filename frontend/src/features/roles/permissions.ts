/**
 * Single source of truth for role/permission *strings* on the frontend.
 *
 * Mirrors `Identity.Domain/Permissions.cs` on the backend. Permission and role
 * names are modeled as literal-union types (derived from the const objects
 * below), never raw `string` — so a typo like `'users.reads'` or `'Admni'` is
 * caught at compile time instead of silently failing closed at runtime.
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

/**
 * Code-based role → permission map, mirrored from `Permissions.Map` on the
 * backend. Used by the pure `hasPermission` helper; the `roles` store's
 * catalog-driven hook remains the runtime source of truth for UI gating.
 */
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  [ROLE.ADMIN]: [
    PERMISSION.USERS_READ,
    PERMISSION.USERS_WRITE,
    PERMISSION.USERS_DELETE,
    PERMISSION.ROLES_READ,
    PERMISSION.PROFILE_READ,
    PERMISSION.PROFILE_WRITE
  ],
  [ROLE.MANAGER]: [PERMISSION.USERS_READ, PERMISSION.USERS_WRITE, PERMISSION.PROFILE_READ, PERMISSION.PROFILE_WRITE],
  [ROLE.READ_ONLY]: [PERMISSION.PROFILE_READ, PERMISSION.PROFILE_WRITE],
  [ROLE.PLATFORM_ADMIN]: [
    PERMISSION.TENANTS_READ,
    PERMISSION.TENANTS_WRITE,
    PERMISSION.USERS_READ,
    PERMISSION.USERS_WRITE,
    PERMISSION.USERS_DELETE,
    PERMISSION.ROLES_READ,
    PERMISSION.PROFILE_READ,
    PERMISSION.PROFILE_WRITE
  ]
}

/**
 * Pure (non-hook) permission check with compile-time typing:
 *
 * ```ts
 * hasPermission(user.roles, 'users.read')      // ✅
 * hasPermission(user.roles, 'users.reads')     // ❌ compile error (typo)
 * hasPermission<'tenants.write'>(roles, 'tenants.write') // explicit type arg
 * ```
 *
 * Unknown/absent role grants fail closed (`false`), matching the backend.
 */
export function hasPermission<const P extends Permission>(
  userRoles: readonly RoleName[] | null | undefined,
  permission: P
): boolean {
  if (!userRoles || userRoles.length === 0) return false
  return userRoles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}
