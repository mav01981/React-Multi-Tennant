using Microsoft.AspNetCore.Identity;

namespace Identity.Api.Common;

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