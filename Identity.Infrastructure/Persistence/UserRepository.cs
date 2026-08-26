using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of the user read/query port. Every query is scoped by
/// tenant where the domain demands it — emails are unique per tenant, not globally.
/// </summary>
public sealed class UserRepository(AppDbContext db) : IUserRepository
{
    public Task<ApplicationUser?> FindByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);

    public Task<ApplicationUser?> FindInTenantByEmailAsync(Guid tenantId, string email, CancellationToken ct = default)
    {
        var normalized = NormalizeEmail(email);
        return db.Users.FirstOrDefaultAsync(
            u => u.TenantId == tenantId && u.NormalizedEmail == normalized, ct);
    }

    public async Task<IReadOnlyList<string>> GetRoleNamesAsync(ApplicationUser user, CancellationToken ct = default)
    {
        var names = await db.UserRoles.AsNoTracking()
            .Where(ur => ur.UserId == user.Id)
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { r.Name, r.TenantId })
            .Where(x => x.TenantId == user.TenantId)
            .Select(x => x.Name!)
            .ToListAsync(ct);
        return names;
    }

    public async Task<IReadOnlyList<ApplicationUser>> ListUsersInRoleAsync(Guid tenantId, string roleName, CancellationToken ct = default)
    {
        var normalized = roleName.ToUpperInvariant();
        var role = await db.Roles.AsNoTracking()
            .SingleOrDefaultAsync(r => r.TenantId == tenantId && r.NormalizedName == normalized, ct);
        if (role is null)
            return Array.Empty<ApplicationUser>();

        var users = await db.Users.AsNoTracking()
            .Where(u => u.TenantId == tenantId &&
                db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == role.Id))
            .ToListAsync(ct);
        return users;
    }

    public async Task<(IReadOnlyList<ApplicationUser> Items, int TotalCount)> ListAsync(UserListQuery query, CancellationToken ct = default)
    {
        var users = db.Users.AsNoTracking().Where(u => u.TenantId == query.TenantId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLowerInvariant();
            users = users.Where(u =>
                u.Email!.ToLower().Contains(term) ||
                u.FirstName.ToLower().Contains(term) ||
                u.LastName.ToLower().Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(query.Role))
        {
            var normalizedRole = query.Role.ToUpperInvariant();
            users = users.Where(u => db.UserRoles.Any(ur => ur.UserId == u.Id &&
                db.Roles.Any(r => r.Id == ur.RoleId && r.TenantId == query.TenantId && r.NormalizedName == normalizedRole)));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            if (Enum.TryParse<UserStatus>(query.Status, true, out var status))
                users = users.Where(u => u.Status == status);
            else
                return (Array.Empty<ApplicationUser>(), 0);
        }

        var desc = string.Equals(query.SortDir, "desc", StringComparison.OrdinalIgnoreCase);
        users = (query.SortBy?.ToLowerInvariant()) switch
        {
            "email" => desc ? users.OrderByDescending(u => u.Email) : users.OrderBy(u => u.Email),
            "firstname" => desc ? users.OrderByDescending(u => u.FirstName) : users.OrderBy(u => u.FirstName),
            "lastname" => desc ? users.OrderByDescending(u => u.LastName) : users.OrderBy(u => u.LastName),
            "updatedat" => desc ? users.OrderBy(u => u.UpdatedAt) : users.OrderByDescending(u => u.UpdatedAt),
            _ => desc ? users.OrderByDescending(u => u.CreatedAt) : users.OrderBy(u => u.CreatedAt)
        };

        var totalCount = await users.CountAsync(ct);
        var items = await users
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }

    private static string NormalizeEmail(string email) => email.Trim().ToUpperInvariant();
}