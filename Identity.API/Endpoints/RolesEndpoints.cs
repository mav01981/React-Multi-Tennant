using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Application.UseCases;
using Identity.Domain;

namespace Identity.Api.Endpoints;

/// <summary>
/// Read-only role catalog for the caller's tenant. Permission-gated centrally via the
/// roles.read filter; adding/editing roles is out of v1 scope.
/// </summary>
public static class RolesEndpoints
{
    public static RouteGroupBuilder MapRolesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/roles")
            .RequireAuthorization();

        group.MapGet("", ListRoles).RequirePermission(Permissions.RolesRead);

        return group;
    }

    private static async Task<IResult> ListRoles(HttpContext http, RoleUseCases roles) =>
        (await roles.ListAsync(CallerResolution.Resolve(http).TenantId)).ToHttp(http);
}