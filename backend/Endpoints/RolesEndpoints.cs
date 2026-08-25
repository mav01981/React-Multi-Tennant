using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VueAuth.Api.Common;

namespace VueAuth.Api.Endpoints;

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
    /// Read-only role catalog (feat-04 §4). Permission-gated on <c>roles.read</c>;
    /// adding/editing roles is out of v1 feature scope.
    /// </summary>
    private static async Task<IResult> ListRoles(
        RoleManager<ApplicationRole> roleManager,
        UserManager<ApplicationUser> userManager,
        HttpContext http)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.RolesRead))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to view roles.");

        var roles = await roleManager.Roles.ToListAsync();
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
