using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Application.UseCases;
using Identity.Domain;

namespace Identity.Api.Endpoints;

/// <summary>
/// Tenant administration routes. PlatformAdmin-only, enforced centrally by the
/// tenants.read/tenants.write permission filters; business rules live in
/// <see cref="TenantAdminUseCases"/>.
/// </summary>
public static class TenantsEndpoints
{
    public static RouteGroupBuilder MapTenantsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/tenants")
            .RequireAuthorization();

        group.MapGet("", ListTenants).RequirePermission(Permissions.TenantsRead);
        group.MapPost("", CreateTenant).RequirePermission(Permissions.TenantsWrite);
        group.MapPut("/{id:guid}", UpdateTenant).RequirePermission(Permissions.TenantsWrite);
        group.MapDelete("/{id:guid}", DeleteTenant).RequirePermission(Permissions.TenantsWrite);

        return group;
    }

    private static async Task<IResult> ListTenants(HttpContext http, TenantAdminUseCases tenants,
        string? search = null, int page = 1, int pageSize = 50) =>
        (await tenants.ListAsync(search, page, pageSize)).ToHttp(http);

    private static async Task<IResult> CreateTenant(CreateTenantRequest request, HttpContext http, TenantAdminUseCases tenants) =>
        (await tenants.CreateAsync(request)).ToHttp(http);

    private static async Task<IResult> UpdateTenant(string id, UpdateTenantRequest request, HttpContext http, TenantAdminUseCases tenants) =>
        (await tenants.UpdateAsync(id, request)).ToHttp(http);

    private static async Task<IResult> DeleteTenant(string id, HttpContext http, TenantAdminUseCases tenants) =>
        (await tenants.DeleteAsync(id)).ToHttp(http);
}