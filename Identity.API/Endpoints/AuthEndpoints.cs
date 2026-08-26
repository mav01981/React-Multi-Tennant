using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Application.UseCases;

namespace Identity.Api.Endpoints;

/// <summary>
/// Authentication routes. Thin HTTP adapter only: bind the request, delegate to the
/// Application-layer use cases, and map the result to an HTTP response.
/// </summary>
public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/auth");

        group.MapPost("/login", Login).RequireRateLimiting("auth");
        group.MapPost("/refresh", Refresh).RequireRateLimiting("auth");
        group.MapPost("/logout", Logout).RequireAuthorization();
        group.MapGet("/me", Me).RequireAuthorization();

        return group;
    }

    private static async Task<IResult> Login(LoginRequest request, HttpContext http, AuthUseCases auth) =>
        (await auth.LoginAsync(
            request,
            http.Request.Headers.TryGetValue(ApiContract.TenantHeader, out var slugValues)
                ? slugValues.ToString()
                : null))
            .ToHttp(http);

    private static async Task<IResult> Refresh(RefreshRequest request, HttpContext http, AuthUseCases auth) =>
        (await auth.RefreshAsync(request.RefreshToken)).ToHttp(http);

    private static async Task<IResult> Logout(HttpContext http, AuthUseCases auth) =>
        (await auth.LogoutAsync(CallerResolution.Resolve(http))).ToHttp(http);

    private static async Task<IResult> Me(HttpContext http, ProfileUseCases profile) =>
        (await profile.GetMeAsync(CallerResolution.Resolve(http))).ToHttp(http);
}