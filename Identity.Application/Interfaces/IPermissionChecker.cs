namespace Identity.Application.Abstractions;

/// <summary>
/// Centralized authorization port: whether the user holding the given role
/// memberships is granted <paramref name="permission"/>. Unknown roles grant nothing.
/// Implemented in Infrastructure on top of the Identity role store; consumed by the
/// presentation layer's permission filter so checks are never hand-repeated.
/// </summary>
public interface IPermissionChecker
{
    Task<bool> HasPermissionAsync(Guid userId, string permission, CancellationToken ct = default);
}