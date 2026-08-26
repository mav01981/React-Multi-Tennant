using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Identity.Infrastructure.Identity;

/// <summary>
/// Mints RS256 access JWTs and opaque, hashed refresh tokens.
/// For local dev the RSA key is ephemeral and generated at startup;
/// in production it is supplied via JWKS.
/// Implements the <see cref="ITokenProvider"/> application port.
/// </summary>
public class TokenService : ITokenProvider
{
    private readonly RsaSecurityKey _signingKey;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _accessTtlSeconds;
    private readonly int _refreshTtlSeconds;

    public TokenService(IConfiguration config)
    {
        var rsa = RSA.Create(2048);
        _signingKey = new RsaSecurityKey(rsa) { KeyId = "dev-" + Guid.NewGuid().ToString("N")[..8] };
        _issuer = config["Jwt:Issuer"] ?? "reactauth-identity";
        _audience = config["Jwt:Audience"] ?? "reactauth-client";
        _accessTtlSeconds = config.GetValue("Jwt:AccessTtlSeconds", 900);
        _refreshTtlSeconds = config.GetValue("Jwt:RefreshTtlSeconds", 2592000);
    }

    /// <summary>RS256 signing key (exposed to the composition root for token validation).</summary>
    public RsaSecurityKey SigningKey => _signingKey;

    public string Issuer => _issuer;
    public string Audience => _audience;
    public int AccessTtlSeconds => _accessTtlSeconds;
    public int RefreshTtlSeconds => _refreshTtlSeconds;

    /// <summary>Mints an RS256 access JWT carrying the standard auth claims.</summary>
    public string CreateAccessToken(ApplicationUser user, IEnumerable<string> roles, DateTimeOffset now)
    {
        var expires = now.AddSeconds(_accessTtlSeconds);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            // Multi-tenancy: the tenant scope travels with the token; every
            // authenticated request is authorized against this claim, never a header.
            new("tid", user.TenantId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iss, _issuer),
            new(JwtRegisteredClaimNames.Iat, new DateTimeOffset(now.UtcDateTime, TimeSpan.Zero).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };
        foreach (var role in roles.Distinct())
            claims.Add(new Claim(ClaimTypes.Role, role));

        var identity = new ClaimsIdentity(claims);
        var handler = new JsonWebTokenHandler();
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _issuer,
            Audience = _audience,
            Subject = identity,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            IssuedAt = now.UtcDateTime,
            SigningCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.RsaSha256)
        };
        return handler.CreateToken(descriptor);
    }

    /// <summary>Creates an opaque refresh token plus its SHA-256 hash for at-rest storage.</summary>
    public (string Raw, string Hash) CreateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        var raw = Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var hash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
        return (raw, hash);
    }

    public string HashRefreshToken(string raw) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
}