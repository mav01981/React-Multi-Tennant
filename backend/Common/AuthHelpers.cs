using Microsoft.AspNetCore.Identity;

namespace VueAuth.Api.Common;

/// <summary>
/// Reusable authorization helpers shared by the endpoint groups. Backend enforces
/// per-permission checks (feat-04 §4) mirroring the role map in <see cref="Permissions"/>.
/// </summary>
public static class AuthHelpers
{
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