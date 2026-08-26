using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Application.UseCases;
using Identity.Domain;

namespace Identity.Api.Endpoints;

/// <summary>
/// Tenant-scoped user administration and self-service profile routes. Permission
/// enforcement is centralized in <see cref="PermissionFilterExtensions"/>; all business
/// rules live in the Application-layer use cases.
/// </summary>
public static class UsersEndpoints
{
    public static RouteGroupBuilder MapUsersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/users")
            .RequireAuthorization();

        // Self-service profile (no extra permission beyond authentication).
        group.MapGet("/me", GetCurrentUser);
        group.MapPut("/me", UpdateCurrentUser);
        group.MapPost("/me/password", ChangePassword);

        // Administration (permission-gated via endpoint filters).
        group.MapGet("", ListUsers).RequirePermission(Permissions.UsersRead);
        group.MapGet("/{id:guid}", GetUser).RequirePermission(Permissions.UsersRead);
        group.MapPost("", CreateUser).RequirePermission(Permissions.UsersWrite);
        group.MapPut("/{id:guid}", UpdateUser).RequirePermission(Permissions.UsersWrite);
        group.MapDelete("/{id:guid}", DeleteUser).RequirePermission(Permissions.UsersDelete);

        return group;
    }

    private static async Task<IResult> GetCurrentUser(HttpContext http, ProfileUseCases profile) =>
        (await profile.GetMeAsync(CallerResolution.Resolve(http))).ToHttp(http);

    private static async Task<IResult> UpdateCurrentUser(UpdateProfileRequest request, HttpContext http, ProfileUseCases profile) =>
        (await profile.UpdateProfileAsync(CallerResolution.Resolve(http), request)).ToHttp(http);

    private static async Task<IResult> ChangePassword(ChangePasswordRequest request, HttpContext http, ProfileUseCases profile) =>
        (await profile.ChangePasswordAsync(CallerResolution.Resolve(http), request)).ToHttp(http);

    private static async Task<IResult> ListUsers(HttpContext http, UserAdminUseCases users,
        string? search = null, string? role = null, string? status = null,
        int page = 1, int pageSize = 50, string sortBy = "createdAt", string sortDir = "asc") =>
        (await users.ListAsync(CallerResolution.Resolve(http).TenantId,
            new UserListRequest(page, pageSize, search, role, status, sortBy, sortDir)))
            .ToHttp(http);

    private static async Task<IResult> GetUser(Guid id, HttpContext http, UserAdminUseCases users) =>
        (await users.GetAsync(id, CallerResolution.Resolve(http).TenantId)).ToHttp(http);

    private static async Task<IResult> CreateUser(CreateUserRequest request, HttpContext http, UserAdminUseCases users) =>
        (await users.CreateAsync(CallerResolution.Resolve(http).TenantId, request)).ToHttp(http);

    private static async Task<IResult> UpdateUser(Guid id, UpdateUserRequest request, HttpContext http, UserAdminUseCases users) =>
        (await users.UpdateAsync(CallerResolution.Resolve(http).TenantId, id, request)).ToHttp(http);

    private static async Task<IResult> DeleteUser(Guid id, HttpContext http, UserAdminUseCases users) =>
        (await users.DeleteAsync(CallerResolution.Resolve(http).TenantId, id)).ToHttp(http);
}