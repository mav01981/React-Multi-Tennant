using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using System.Security.Claims;

namespace Identity.Api.Common;

/// <summary>
/// Declarative, centralized permission enforcement for minimal APIs. Attaches an
/// endpoint filter that resolves the caller from the Bearer token and checks the
/// requested permission via <see cref="IPermissionChecker"/>. Replaces the
/// hand-repeated <c>if (!await AuthHelpers.HasPermissionAsync(...))</c> blocks.
/// Usage: <c>.RequirePermission(Permissions.UsersRead)</c>.
/// </summary>
public static class PermissionFilterExtensions
{
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, string permission) =>
        builder.AddEndpointFilter(async (context, next) =>
        {
            var checker = context.HttpContext.RequestServices.GetRequiredService<IPermissionChecker>();
            var caller = CallerResolution.Resolve(context.HttpContext);

            if (caller.IsEmpty ||
                !await checker.HasPermissionAsync(caller.UserId, permission, context.HttpContext.RequestAborted))
            {
                return UseCaseMapping.Failure(
                    StatusCodes.Status403Forbidden,
                    ErrorCodes.Forbidden,
                    "You do not have permission to perform this action.",
                    context.HttpContext);
            }

            return await next(context);
        });
}

/// <summary>
/// Resolves the authenticated caller from the <c>sub</c>/<c>tid</c> claims into a
/// <see cref="CallerInfo"/>. The JWT claims are authoritative — client headers are
/// ignored for authenticated requests so cross-tenant access can't be forged.
/// </summary>
public static class CallerResolution
{
    public static CallerInfo Resolve(HttpContext http)
    {
        var subject = http.User.FindFirst("sub")?.Value ??
            http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var tenant = http.User.FindFirst("tid")?.Value;

        return new CallerInfo(
            Guid.TryParse(subject, out var userId) ? userId : Guid.Empty,
            Guid.TryParse(tenant, out var tenantId) ? tenantId : Guid.Empty);
    }
}