using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Identity;

/// <summary>
/// <see cref="IRoleCatalog"/> implementation that delegates to the tenant-scoped
/// static role helpers so per-tenant scoping rules live in exactly one place.
/// </summary>
public sealed class RoleCatalog(AppDbContext db) : IRoleCatalog
{
    public async Task<IReadOnlyList<(Guid Id, string Name)>> ListForTenantAsync(Guid tenantId, CancellationToken ct = default)
    {
        var roles = await db.Roles.AsNoTracking()
            .Where(r => r.TenantId == tenantId)
            .OrderBy(r => r.NormalizedName)
            .Select(r => new { r.Id, Name = r.Name ?? string.Empty })
            .ToListAsync(ct);
        return roles.Select(r => (r.Id, r.Name)).ToList();
    }

    public async Task<IdentityResult> AssignAsync(ApplicationUser user, IEnumerable<string> roleNames, CancellationToken ct = default) =>
        await TenantRoles.AssignAsync(db, user, roleNames);

    public async Task<IdentityResult> ReplaceAsync(ApplicationUser user, IEnumerable<string> roleNames, CancellationToken ct = default) =>
        await TenantRoles.ReplaceAsync(db, user, roleNames);

    public async Task SeedDefaultRolesAsync(Guid tenantId, CancellationToken ct = default) =>
        await TenantRoles.SeedDefaultRolesAsync(db, tenantId);
}

/// <summary>
/// Centralized permission resolution: unions the permissions granted by every role the
/// caller holds. Unknown roles grant nothing. Consumed by the API layer's endpoint
/// filter so per-endpoint authorization is declarative.
/// </summary>
public sealed class PermissionChecker(UserManager<ApplicationUser> userManager) : IPermissionChecker
{
    public async Task<bool> HasPermissionAsync(Guid userId, string permission, CancellationToken ct = default)
    {
        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null)
            return false;

        var roles = await userManager.GetRolesAsync(user);
        return roles.Any(role => Domain.Permissions.For(role).Contains(permission));
    }
}