using Identity.Domain.Entities;

namespace Identity.Application.Abstractions;

/// <summary>
/// Read/query port over user aggregates. All lookups are tenant-scoped where the
/// domain demands it (emails are unique per tenant, not globally).
/// </summary>
public interface IUserRepository
{
    Task<ApplicationUser?> FindByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Finds a user by (normalized) email within a single tenant.</summary>
    Task<ApplicationUser?> FindInTenantByEmailAsync(Guid tenantId, string email, CancellationToken ct = default);

    /// <summary>The caller's role names — resolved from memberships to roles inside the user's own tenant.</summary>
    Task<IReadOnlyList<string>> GetRoleNamesAsync(ApplicationUser user, CancellationToken ct = default);

    /// <summary>Members of the named role within a tenant.</summary>
    Task<IReadOnlyList<ApplicationUser>> ListUsersInRoleAsync(Guid tenantId, string roleName, CancellationToken ct = default);

    /// <summary>Paged / filtered / sorted user list confined to one tenant.</summary>
    Task<(IReadOnlyList<ApplicationUser> Items, int TotalCount)> ListAsync(UserListQuery query, CancellationToken ct = default);
}