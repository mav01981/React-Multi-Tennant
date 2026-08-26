using Identity.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace Identity.Application.Abstractions;

/// <summary>
/// Port over the per-tenant role catalog. Role names repeat across tenants, so every
/// operation here is scoped by tenant (never by normalized name alone).
/// </summary>
public interface IRoleCatalog
{
    /// <summary>All roles defined in the tenant, ordered by normalized name.</summary>
    Task<IReadOnlyList<(Guid Id, string Name)>> ListForTenantAsync(Guid tenantId, CancellationToken ct = default);

    /// <summary>Adds the user to the named roles within the user's own tenant (idempotent).</summary>
    Task<IdentityResult> AssignAsync(ApplicationUser user, IEnumerable<string> roleNames, CancellationToken ct = default);

    /// <summary>Replaces the user's memberships with exactly the given role set (within their tenant).</summary>
    Task<IdentityResult> ReplaceAsync(ApplicationUser user, IEnumerable<string> roleNames, CancellationToken ct = default);

    /// <summary>Seeds the default role catalog for a freshly created tenant (persists itself).</summary>
    Task SeedDefaultRolesAsync(Guid tenantId, CancellationToken ct = default);
}