using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Persistence;

/// <summary>
/// Unit-of-work port over the shared EF Core context. Handlers stage changes through
/// repositories/stores and commit once, atomically, at the end of the use case.
/// </summary>
public sealed class EfUnitOfWork(AppDbContext db) : IUnitOfWork
{
    public Task CommitAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}

/// <summary>
/// EF Core implementation of the tenant persistence port. Tenant listings and login
/// lookups never surface soft-deleted workspaces.
/// </summary>
public sealed class TenantRepository(AppDbContext db) : ITenantRepository
{
    public Task<Tenant?> FindBySlugAsync(string slug, CancellationToken ct = default) =>
        db.Tenants.FirstOrDefaultAsync(
            t => t.Slug == slug.ToLowerInvariant() && t.DeletedAt == null, ct);

    public Task<Tenant?> FindByIdAsync(Guid id, CancellationToken ct = default) =>
        db.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task<bool> SlugExistsAsync(string slug, CancellationToken ct = default) =>
        db.Tenants.AnyAsync(t => t.Slug == slug.ToLowerInvariant(), ct);

    public async Task<(IReadOnlyList<Tenant> Items, int TotalCount)> ListAsync(
        string? search, int page, int pageSize, CancellationToken ct = default)
    {
        var tenants = db.Tenants.AsNoTracking().Where(t => t.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            tenants = tenants.Where(t =>
                t.Name.ToLower().Contains(term) ||
                t.DisplayName.ToLower().Contains(term) ||
                t.Slug.ToLower().Contains(term));
        }

        tenants = tenants.OrderBy(t => t.CreatedAt);

        var totalCount = await tenants.CountAsync(ct);
        var items = await tenants
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }

    public void Add(Tenant tenant) => db.Tenants.Add(tenant);
}