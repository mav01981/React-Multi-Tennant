using Identity.Domain;
using Identity.Domain.Entities;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Identity;

/// <summary>
/// Per-tenant role operations. Role names (Admin/Manager/ReadOnly) repeat in every
/// tenant, so Identity's global name-based APIs (<c>AddToRoleAsync</c>,
/// <c>IsInRoleAsync</c>, <c>GetUsersInRoleAsync</c>) would be ambiguous — they match
/// on NormalizedName alone and could bind to another tenant's role row. All role
/// reads/writes therefore go through this class, which always scopes by TenantId.
/// Reads of a user's role names via <c>userManager.GetRolesAsync</c> stay safe: a
/// user only ever holds memberships to roles inside their own tenant.
/// </summary>
public static class TenantRoles
{
    /// <summary>Finds a role within a tenant by (case-insensitive) name.</summary>
    public static Task<ApplicationRole?> FindAsync(AppDbContext db, Guid tenantId, string name)
    {
        var normalized = Normalize(name);
        return db.Roles.SingleOrDefaultAsync(r => r.TenantId == tenantId && r.NormalizedName == normalized);
    }

    /// <summary>Finds a role within a tenant, creating it if missing.</summary>
    public static async Task<ApplicationRole> FindOrCreateAsync(AppDbContext db, Guid tenantId, string name)
    {
        var role = await FindAsync(db, tenantId, name);
        if (role is not null) return role;

        role = new ApplicationRole(name) { TenantId = tenantId, NormalizedName = Normalize(name) };
        db.Roles.Add(role);
        await db.SaveChangesAsync();
        return role;
    }

    /// <summary>Seeds the default per-tenant role catalog for a tenant (idempotent).</summary>
    public static async Task SeedDefaultRolesAsync(AppDbContext db, Guid tenantId)
    {
        foreach (var name in Permissions.DefaultTenantRoles)
            await FindOrCreateAsync(db, tenantId, name);
    }

    /// <summary>Adds the user to the named roles *within their own tenant* (idempotent).</summary>
    public static async Task<IdentityResult> AssignAsync(
        AppDbContext db, ApplicationUser user, IEnumerable<string> roleNames)
    {
        foreach (var name in roleNames.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(name))
                return IdentityResult.Failed(new IdentityError { Code = "InvalidRole", Description = "Role names cannot be empty." });

            // Only names present in the permission map are assignable; PlatformAdmin is
            // never assignable through the API.
            if (!Permissions.IsKnownRole(name))
            {
                return IdentityResult.Failed(new IdentityError { Code = "UnknownRole", Description = $"Unknown role '{name}'." });
            }

            if (name.Equals(Permissions.PlatformAdminRole, StringComparison.OrdinalIgnoreCase))
                return IdentityResult.Failed(new IdentityError { Code = "ForbiddenRole", Description = "The platform admin role cannot be assigned." });

            var role = await FindOrCreateAsync(db, user.TenantId, name);
            var exists = await db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == role.Id);
            if (!exists)
                db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = user.Id, RoleId = role.Id });
        }
        await db.SaveChangesAsync();
        return IdentityResult.Success;
    }

    /// <summary>Replaces the user's memberships with exactly the given role set (within their tenant).</summary>
    public static async Task<IdentityResult> ReplaceAsync(
        AppDbContext db, ApplicationUser user, IEnumerable<string> roleNames)
    {
        var requested = roleNames.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var currentRoles = await db.UserRoles
            .Where(ur => ur.UserId == user.Id)
            .Join(db.Roles.Where(r => r.TenantId == user.TenantId),
                ur => ur.RoleId, r => r.Id, (ur, r) => r)
            .ToListAsync();

        var removeIds = currentRoles
            .Where(r => !requested.Contains(r.Name ?? string.Empty))
            .Select(r => r.Id)
            .ToList();

        if (removeIds.Count > 0)
        {
            var rows = await db.UserRoles.Where(ur => ur.UserId == user.Id && removeIds.Contains(ur.RoleId)).ToListAsync();
            db.UserRoles.RemoveRange(rows);
        }

        var add = await AssignAsync(db, user, requested);
        if (!add.Succeeded) return add;

        await db.SaveChangesAsync();
        return IdentityResult.Success;
    }

    /// <summary>Tenant-scoped replacement for <c>UserManager.IsInRoleAsync</c>.</summary>
    public static async Task<bool> IsInRoleAsync(AppDbContext db, ApplicationUser user, string roleName)
    {
        var role = await FindAsync(db, user.TenantId, roleName);
        if (role is null) return false;
        return await db.UserRoles.AnyAsync(ur => ur.UserId == user.Id && ur.RoleId == role.Id);
    }

    /// <summary>Tenant-scoped replacement for <c>UserManager.GetUsersInRoleAsync</c>.</summary>
    public static async Task<List<ApplicationUser>> GetUsersInRoleAsync(AppDbContext db, Guid tenantId, string roleName)
    {
        var role = await FindAsync(db, tenantId, roleName);
        if (role is null) return new List<ApplicationUser>();

        return await db.Users
            .Where(u => u.TenantId == tenantId &&
                db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == role.Id))
            .ToListAsync();
    }

    private static string Normalize(string name) => name.ToUpperInvariant();
}