using Identity.Domain.Entities;

namespace Identity.Application.Abstractions;

/// <summary>
/// Application-layer port for minting access JWTs and opaque, hashed refresh tokens.
/// The concrete RS256/JWKS implementation lives in the Infrastructure layer so the
/// Application layer never depends on a JWT library directly.
/// </summary>
public interface ITokenProvider
{
    /// <summary>JWT issuer claim value.</summary>
    string Issuer { get; }

    /// <summary>JWT audience claim value.</summary>
    string Audience { get; }

    /// <summary>Access-token lifetime, in seconds.</summary>
    int AccessTtlSeconds { get; }

    /// <summary>Refresh-token lifetime, in seconds.</summary>
    int RefreshTtlSeconds { get; }

    /// <summary>Mints an RS256 access JWT carrying the standard auth claims.</summary>
    string CreateAccessToken(ApplicationUser user, IEnumerable<string> roles, DateTimeOffset now);

    /// <summary>Creates an opaque refresh token plus its SHA-256 hash for at-rest storage.</summary>
    (string Raw, string Hash) CreateRefreshToken();

    /// <summary>Hashes a raw refresh token for storage and comparison.</summary>
    string HashRefreshToken(string raw);
}