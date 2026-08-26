namespace Identity.Application.Abstractions;

/// <summary>
/// Tenant-scoped query parameters for the paged user list. Field names mirror the
/// original endpoint contract: search / role / status filters plus sortBy/sortDir.
/// </summary>
public sealed record UserListQuery(
    Guid TenantId,
    int Page,
    int PageSize,
    string? Search,
    string? Role,
    string? Status,
    string SortBy,
    string SortDir);