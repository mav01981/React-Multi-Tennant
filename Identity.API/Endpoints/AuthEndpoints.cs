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

    private static async Task<IResult> Login(LoginRequest request, HttpContext http, AuthUseCases auth)
    {
        var result = await auth.LoginAsync(
            request,
            http.Request.Headers.TryGetValue(ApiContract.TenantHeader, out var slugValues)
                ? slugValues.ToString()
                : null);
        if (result.IsSuccess && result.Value is not null)
        {
            // The long-lived credential is delivered as an HttpOnly cookie, never
            // in the JSON body where injected scripts could read it.
            RefreshTokenCookie.Set(http, result.Value.RefreshToken!, result.Value.RefreshTtlSeconds);
        }
        return result.ToHttp(http);
    }

    private static async Task<IResult> Refresh(HttpContext http, AuthUseCases auth)
    {
        // Browsers present the refresh token via the HttpOnly cookie and send no
        // body at all; the JSON body (when present) remains a fallback for
        // non-browser API clients. Binding is therefore done manually and only
        // when a body actually exists — an empty POST must not fail model binding.
        RefreshRequest? request = null;
        if (http.Request.ContentLength is > 0)
        {
            try
            {
                request = await http.Request.ReadFromJsonAsync<RefreshRequest>();
            }
            catch
            {
                /* malformed body → treated as absent; cookie still wins */
            }
        }
        var rawToken = RefreshTokenCookie.Read(http) ?? request?.RefreshToken;
        var result = await auth.RefreshAsync(rawToken);
        if (result.IsSuccess && result.Value is not null)
            RefreshTokenCookie.Set(http, result.Value.RefreshToken!, result.Value.RefreshTtlSeconds);
        return result.ToHttp(http);
    }

    private static async Task<IResult> Logout(HttpContext http, AuthUseCases auth)
    {
        var result = (await auth.LogoutAsync(CallerResolution.Resolve(http))).ToHttp(http);
        RefreshTokenCookie.Delete(http);
        return result;
    }

    private static async Task<IResult> Me(HttpContext http, ProfileUseCases profile) =>
        (await profile.GetMeAsync(CallerResolution.Resolve(http))).ToHttp(http);
}