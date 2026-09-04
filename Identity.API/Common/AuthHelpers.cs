using Identity.Application.Contracts;
using Identity.Domain;
using Identity.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace Identity.Api.Common;

/// <summary>
/// The refresh token is a long-lived credential, so it never travels in a JSON body
/// readable by scripts: it is issued as an HttpOnly, SameSite=Strict cookie scoped
/// to the auth path, making it invisible to JavaScript (XSS cannot exfiltrate it)
/// and unavailable to cross-site requests. Secure is on except in development,
/// where the API runs over plain HTTP on localhost (a trustworthy context).
/// </summary>
public static class RefreshTokenCookie
{
    public const string Name = "refreshToken";

    /// <summary>Scoped so the cookie rides only on /auth requests (login/refresh/logout).</summary>
    private static CookieOptions Options(bool secure, int? maxAgeSeconds = null) => new()
    {
        HttpOnly = true,
        Secure = secure,
        SameSite = SameSiteMode.Strict,
        Path = ApiContract.BasePath + "/auth",
        IsEssential = true,
        MaxAge = maxAgeSeconds is null ? null : TimeSpan.FromSeconds(maxAgeSeconds.Value)
    };

    /// <summary>True except in the development environment (plain-HTTP localhost).</summary>
    public static bool IsSecure(HttpContext http) =>
        !http.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment();

    public static void Set(HttpContext http, string token, int ttlSeconds) =>
        http.Response.Cookies.Append(Name, token, Options(IsSecure(http), ttlSeconds));

    public static string? Read(HttpContext http) =>
        http.Request.Cookies.TryGetValue(Name, out var value) ? value : null;

    public static void Delete(HttpContext http) =>
        http.Response.Cookies.Delete(Name, Options(IsSecure(http)));
}

/// <summary>
/// Reusable authorization helpers shared by the endpoint groups. Backend enforces
/// per-permission checks  mirroring the role map in <see cref="Permissions"/>.
/// </summary>
public static class AuthHelpers
{
    /// <summary>
    /// Resolves the caller's tenant from the Bearer token's <c>tid</c> claim.
    /// Returns null when the token carries no valid tenant (treated as unauthenticated
    /// by callers). The JWT claim is authoritative — client headers are ignored for
    /// authenticated requests so cross-tenant access can't be forged by swapping them.
    /// </summary>
    public static Guid? GetTenantId(HttpContext http)
    {
        var tid = http.User.FindFirst("tid")?.Value;
        return Guid.TryParse(tid, out var tenantId) ? tenantId : null;
    }

    /// <summary>Loads the caller resolved from the token subject, or null.</summary>
    public static Task<ApplicationUser?> FindCallerAsync(
        HttpContext http,
        UserManager<ApplicationUser> userManager)
    {
        var subject = http.User.FindFirst("sub")?.Value ??
            http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(subject, out var userId)
            ? userManager.FindByIdAsync(userId.ToString())
            : Task.FromResult<ApplicationUser?>(null);
    }

    /// <summary>
    /// Resolves the caller from the Bearer token (<c>sub</c> claim, since
    /// MapInboundClaims=false keeps the literal sub) and checks whether any of
    /// their roles grant the requested permission. Unknown role names resolve to an
    /// empty permission set, so they grant nothing.
    /// </summary>
    public static async Task<bool> HasPermissionAsync(
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        string permission)
    {
        var subject = http.User.FindFirst("sub")?.Value ??
            http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var user = Guid.TryParse(subject, out var userId)
            ? await userManager.FindByIdAsync(userId.ToString())
            : await userManager.FindByEmailAsync(http.User.FindFirst("email")?.Value ?? string.Empty);
        if (user is null)
            return false;

        var roles = await userManager.GetRolesAsync(user);
        return roles.Any(role => Permissions.For(role).Contains(permission));
    }
}