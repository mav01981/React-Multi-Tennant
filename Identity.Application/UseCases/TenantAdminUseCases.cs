using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using Identity.Domain.Entities;

namespace Identity.Application.UseCases;

/// <summary>
/// PlatformAdmin-only tenant lifecycle use cases (list / create / update /
/// soft-delete). Enforces slug validation/uniqueness and the platform-tenant
/// protections owned by the <see cref="Tenant"/> aggregate.
/// </summary>
public sealed class TenantAdminUseCases(ITenantRepository tenants, IRoleCatalog roles, IUnitOfWork unitOfWork)
{
    public async Task<UseCaseResult<TenantListResponse>> ListAsync(string? search, int page, int pageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var (items, totalCount) = await tenants.ListAsync(search, page, pageSize);
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        return UseCaseResult<TenantListResponse>.Ok(new TenantListResponse(
            [.. items.Select(TenantDto.From)], totalCount, page, pageSize, totalPages));
    }

    public async Task<UseCaseResult<TenantDto>> CreateAsync(CreateTenantRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Slug))
            return UseCaseResult<TenantDto>.Fail(400, ErrorCodes.ValidationFailed, "Name and slug are required.");
        if (!IsValidSlug(request.Slug))
            return UseCaseResult<TenantDto>.Fail(400, ErrorCodes.ValidationFailed, "Slug must be 1-100 lowercase letters, digits or hyphens.");

        var slug = request.Slug.Trim().ToLowerInvariant();
        if (Tenant.IsReservedSlug(slug) || await tenants.SlugExistsAsync(slug))
            return UseCaseResult<TenantDto>.Fail(409, ErrorCodes.SlugExists, "A tenant with this slug already exists.");

        var tenant = new Tenant
        {
            Name = request.Name.Trim(),
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? request.Name.Trim() : request.DisplayName.Trim(),
            Slug = slug
        };
        tenants.Add(tenant);

        // Every tenant starts with its default role catalog.
        await roles.SeedDefaultRolesAsync(tenant.Id);
        await unitOfWork.CommitAsync();

        return UseCaseResult<TenantDto>.Ok(TenantDto.From(tenant), 201);
    }

    public async Task<UseCaseResult<TenantDto>> UpdateAsync(string id, UpdateTenantRequest request)
    {
        if (!Guid.TryParse(id, out var tenantId))
            return UseCaseResult<TenantDto>.Fail(404, ErrorCodes.NotFound, "Tenant not found.");

        var tenant = await tenants.FindByIdAsync(tenantId);
        if (tenant is null)
            return UseCaseResult<TenantDto>.Fail(404, ErrorCodes.NotFound, "Tenant not found.");

        var requestedStatus = request.Status?.ToLowerInvariant() switch
        {
            null or "" => tenant.Status,
            "active" => TenantStatus.Active,
            "suspended" => TenantStatus.Suspended,
            _ => (TenantStatus?)null
        };
        if (requestedStatus is null)
            return UseCaseResult<TenantDto>.Fail(400, ErrorCodes.ValidationFailed, "Status must be active or suspended.");
        // Aggregate invariant: the platform workspace can never be suspended.
        if (!tenant.MayTransitionTo(requestedStatus.Value))
            return UseCaseResult<TenantDto>.Fail(400, ErrorCodes.ValidationFailed, "The platform tenant cannot be suspended.");

        if (!string.IsNullOrWhiteSpace(request.Name))
            tenant.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.DisplayName))
            tenant.DisplayName = request.DisplayName.Trim();
        tenant.Status = requestedStatus.Value;
        tenant.UpdatedAt = DateTimeOffset.UtcNow;

        await unitOfWork.CommitAsync();
        return UseCaseResult<TenantDto>.Ok(TenantDto.From(tenant));
    }

    /// <summary>Soft-delete (feat-05 §5): stamps DeletedAt on the aggregate.</summary>
    public async Task<UseCaseResult<Unit>> DeleteAsync(string id)
    {
        if (!Guid.TryParse(id, out var tenantId))
            return UseCaseResult<Unit>.Fail(404, ErrorCodes.NotFound, "Tenant not found.");

        var tenant = await tenants.FindByIdAsync(tenantId);
        if (tenant is null || tenant.DeletedAt != null)
            return UseCaseResult<Unit>.Fail(404, ErrorCodes.NotFound, "Tenant not found.");
        if (tenant.IsPlatform)
            return UseCaseResult<Unit>.Fail(400, ErrorCodes.ValidationFailed, "The platform tenant cannot be deleted.");

        tenant.MarkDeleted(DateTimeOffset.UtcNow);
        await unitOfWork.CommitAsync();

        return UseCaseResult<Unit>.NoContent();
    }

    private static bool IsValidSlug(string slug) =>
        slug.Length is >= 1 and <= 100 && slug.All(c => char.IsLetterOrDigit(c) && !char.IsUpper(c) || c == '-');
}