using Identity.Domain.Entities;

namespace Identity.Application.Abstractions;

/// <summary>Unit-of-work port: commits all pending repository changes atomically.</summary>
public interface IUnitOfWork
{
    Task CommitAsync(CancellationToken ct = default);
}

/// <summary>Tenant-scoped persistence port for workspace entities.</summary>
public interface ITenantRepository
{
    Task<Tenant?> FindBySlugAsync(string slug, CancellationToken ct = default);
    Task<Tenant?> FindByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> SlugExistsAsync(string slug, CancellationToken ct = default);
    /// <summary>Paged list of non-deleted tenants with optional search.</summary>
    Task<(IReadOnlyList<Tenant> Items, int TotalCount)> ListAsync(
        string? search, int page, int pageSize, CancellationToken ct = default);
    void Add(Tenant tenant);
}