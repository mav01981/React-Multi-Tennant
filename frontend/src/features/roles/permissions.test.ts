import { describe, it, expect } from 'vitest'
import { PERMISSION, ROLE, hasPermission, type RoleName, type Permission } from './permissions'

const adminRoles: RoleName[] = [ROLE.ADMIN]
const readOnlyRoles: RoleName[] = [ROLE.READ_ONLY]

describe('hasPermission (typed helper)', () => {
  it('grants a permission held by one of the roles', () => {
    expect(hasPermission(adminRoles, 'users.read')).toBe(true)
    expect(hasPermission(adminRoles, PERMISSION.USERS_DELETE)).toBe(true)
    expect(hasPermission<'tenants.read'>([ROLE.PLATFORM_ADMIN], 'tenants.read')).toBe(true)
  })

  it('denies a permission the roles do not grant', () => {
    expect(hasPermission(readOnlyRoles, 'users.delete')).toBe(false)
    expect(hasPermission([ROLE.MANAGER], 'tenants.read')).toBe(false)
  })

  it('fails closed for missing or empty roles', () => {
    expect(hasPermission(null, 'users.read')).toBe(false)
    expect(hasPermission(undefined, 'users.read')).toBe(false)
    expect(hasPermission([], 'users.read')).toBe(false)
  })

  it('fails closed for unknown role names at runtime', () => {
    // Unknown role names cannot be constructed as RoleName at compile time;
    // a runtime payload cast to the type still fails closed.
    expect(hasPermission(['Unknown' as RoleName], 'users.read')).toBe(false)
  })

  it('catches typo permission strings at compile time', () => {
    // The helper only accepts the Permission union; a plain string must be
    // a compile error, asserted with @ts-expect-error below.
    const typo: string = 'users.reads'
    // @ts-expect-error 'users.reads' is not assignable to Permission
    expect(hasPermission(adminRoles, typo)).toBe(false)
    const valid: Permission = 'users.read'
    expect(valid).toBe('users.read')
  })
})
