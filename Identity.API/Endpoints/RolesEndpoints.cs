using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Domain;
using Identity.Domain.Entities;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Api.Endpoints;

public static class RolesEndpoints
{
    public static RouteGroupBuilder MapRolesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/roles")
            .RequireAuthorization();

        group.MapGet("", ListRoles);

        return group;
    }

    /// <summary>
    /// Read-only role catalog for the caller's tenant.
    /// Permission-gated on <c>roles.read</c>; adding/editing roles is out of v1 scope.
    /// </summary>
    private static async Task<IResult> ListRoles(
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.RolesRead))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to view roles.");
        if (AuthHelpers.GetTenantId(http) is not { } tenantId)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        var roles = await db.Roles
            .Where(r => r.TenantId == tenantId)
            .OrderBy(r => r.NormalizedName)
            .ToListAsync();
        var dtos = roles
            .Select(r => new RoleDto(r.Id.ToString(), r.Name ?? string.Empty, Permissions.For(r.Name ?? string.Empty).ToArray()))
            .ToArray();
        return Results.Json(dtos);
    }

    private static IResult Error(HttpContext http, int status, string code, string message)
    {
        var requestId = http.Request.Headers.TryGetValue("X-Request-Id", out var rid) ? rid.ToString() : null;
        return Results.Json(new ApiErrorResponse(new ApiError(code, message, RequestId: requestId)), statusCode: status);
    }
}
