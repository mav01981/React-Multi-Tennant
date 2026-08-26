using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Domain;
using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Api.Endpoints;

/// <summary>
/// Tenant administration endpoints. PlatformAdmin only —
/// guarded by the <c>tenants.read</c> / <c>tenants.write</c> permissions.
/// </summary>
public static class TenantsEndpoints
{
    public static RouteGroupBuilder MapTenantsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/tenants")
            .RequireAuthorization();

        group.MapGet("", ListTenants);
        group.MapPost("", CreateTenant);
        group.MapPut("/{id:guid}", UpdateTenant);
        group.MapDelete("/{id:guid}", DeleteTenant);

        return group;
    }

    private static async Task<IResult> ListTenants(
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db,
        string? search = null,
        int page = 1,
        int pageSize = 50)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.TenantsRead))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to view tenants.");

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = db.Tenants
            .Where(t => t.DeletedAt == null)
            .OrderBy(t => t.CreatedAt)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(t =>
                t.Name.ToLower().Contains(term) ||
                t.DisplayName.ToLower().Contains(term) ||
                t.Slug.ToLower().Contains(term));
        }

        var totalCount = await query.CountAsync();
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);
        var tenants = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Results.Json(new TenantListResponse(
            tenants.Select(TenantDto.From).ToArray(),
            totalCount, page, pageSize, totalPages));
    }

    private static async Task<IResult> CreateTenant(
        CreateTenantRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.TenantsWrite))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to create tenants.");

        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Slug))
            return Error(http, 400, ErrorCodes.ValidationFailed, "Name and slug are required.");
        if (!IsValidSlug(request.Slug))
            return Error(http, 400, ErrorCodes.ValidationFailed, "Slug must be 1-100 lowercase letters, digits or hyphens.");

        var slug = request.Slug.Trim().ToLowerInvariant();
        if (slug == DbSeeder.PlatformTenantSlug || await db.Tenants.AnyAsync(t => t.Slug == slug))
            return Error(http, 409, ErrorCodes.SlugExists, "A tenant with this slug already exists.");

        var tenant = new Tenant
        {
            Name = request.Name.Trim(),
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? request.Name.Trim() : request.DisplayName.Trim(),
            Slug = slug
        };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();

        // Every tenant starts with its default role catalog.
        await TenantRoles.SeedDefaultRolesAsync(db, tenant.Id);

        return Results.Json(TenantDto.From(tenant), statusCode: 201);
    }

    private static async Task<IResult> UpdateTenant(
        string id,
        UpdateTenantRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.TenantsWrite))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to update tenants.");

        if (!Guid.TryParse(id, out var tenantId))
            return Error(http, 404, ErrorCodes.NotFound, "Tenant not found.");

        var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Id == tenantId);
        if (tenant is null)
            return Error(http, 404, ErrorCodes.NotFound, "Tenant not found.");

        var requestedStatus = request.Status?.ToLowerInvariant() switch
        {
            null or "" => tenant.Status,
            "active" => TenantStatus.Active,
            "suspended" => TenantStatus.Suspended,
            _ => (TenantStatus?)null
        };
        if (requestedStatus is null)
            return Error(http, 400, ErrorCodes.ValidationFailed, "Status must be active or suspended.");
        if (tenant.Slug == DbSeeder.PlatformTenantSlug && requestedStatus == TenantStatus.Suspended)
            return Error(http, 400, ErrorCodes.ValidationFailed, "The platform tenant cannot be suspended.");

        if (!string.IsNullOrWhiteSpace(request.Name))
            tenant.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.DisplayName))
            tenant.DisplayName = request.DisplayName.Trim();
        tenant.Status = requestedStatus.Value;
        tenant.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Results.Ok(TenantDto.From(tenant));
    }

    /// <summary>Soft-delete (feat-05 §5): stamp DeletedAt; the platform tenant is protected.</summary>
    private static async Task<IResult> DeleteTenant(
        string id,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.TenantsWrite))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to delete tenants.");

        if (!Guid.TryParse(id, out var tenantId))
            return Error(http, 404, ErrorCodes.NotFound, "Tenant not found.");

        var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Id == tenantId);
        if (tenant is null || tenant.DeletedAt != null)
            return Error(http, 404, ErrorCodes.NotFound, "Tenant not found.");
        if (tenant.Slug == DbSeeder.PlatformTenantSlug)
            return Error(http, 400, ErrorCodes.ValidationFailed, "The platform tenant cannot be deleted.");

        tenant.DeletedAt = DateTimeOffset.UtcNow;
        tenant.Status = TenantStatus.Suspended;
        tenant.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static bool IsValidSlug(string slug) =>
        slug.Length is >= 1 and <= 100 && slug.All(c => char.IsLetterOrDigit(c) && !char.IsUpper(c) || c == '-');

    private static IResult Error(HttpContext http, int status, string code, string message)
    {
        var requestId = http.Request.Headers.TryGetValue("X-Request-Id", out var rid) ? rid.ToString() : null;
        return Results.Json(new ApiErrorResponse(new ApiError(code, message, RequestId: requestId)), statusCode: status);
    }
}
