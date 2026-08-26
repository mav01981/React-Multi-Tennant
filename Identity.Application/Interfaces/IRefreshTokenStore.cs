using Identity.Domain.Entities;

namespace Identity.Application.Abstractions;

/// <summary>
/// Persistence port for refresh-token families and their descendant tokens.
/// Mutations mark tracked entities; the surrounding handler commits via
/// <see cref="IUnitOfWork"/> so each use case stays atomic.
/// </summary>
public interface IRefreshTokenStore
{
    /// <summary>Finds a stored token by its SHA-256 hash, including its family and sibling tokens.</summary>
    Task<RefreshToken?> FindByTokenHashAsync(string tokenHash, CancellationToken ct = default);

    Task AddFamilyAsync(RefreshFamily family, CancellationToken ct = default);

    /// <summary>
    /// Persists a freshly minted rotation descendant explicitly. Explicit adds are
    /// required here: a token created in-memory and attached only via the tracked
    /// family's navigation would be mistaken for an existing row (its key is already
    /// assigned), turning the insert into a failing UPDATE.
    /// </summary>
    Task AddTokenAsync(RefreshToken token, CancellationToken ct = default);

    /// <summary>
    /// Revokes every family/token ever issued to the user (logout and lockout paths).
    /// Mutations are staged; commit via <see cref="IUnitOfWork"/>.
    /// </summary>
    Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default);
}