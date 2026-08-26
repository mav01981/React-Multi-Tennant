namespace Identity.Domain.Entities;

/// <summary>A refresh-token family. Revoking the family invalidates every descendant token.</summary>
public class RefreshFamily
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid TenantId { get; set; }
    public ApplicationUser? User { get; set; }
    public ICollection<RefreshToken> Tokens { get; set; } = new List<RefreshToken>();
    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsRevoked => RevokedAt is not null;

    /// <summary>Mints the family's first token (at login).</summary>
    public RefreshToken IssueToken(string tokenHash, DateTimeOffset issuedAt, DateTimeOffset expiresAt)
    {
        var token = new RefreshToken
        {
            FamilyId = Id,
            UserId = UserId,
            TenantId = TenantId,
            TokenHash = tokenHash,
            CreatedAt = issuedAt,
            ExpiresAt = expiresAt,
        };
        Tokens.Add(token);
        return token;
    }

    /// <summary>
    /// Rotation: revokes the presented token and mints a fresh descendant in the same
    /// family. Keeps the family tree consistent so reuse detection can flag ancestors.
    /// </summary>
    public RefreshToken RotateToken(RefreshToken presented, string newTokenHash, DateTimeOffset now, DateTimeOffset newExpiry)
    {
        presented.Revoke(now);
        return IssueToken(newTokenHash, now, newExpiry);
    }

    /// <summary>Revokes the whole family — used when reuse of a revoked token is detected.</summary>
    public void RevokeAll(DateTimeOffset when)
    {
        RevokedAt ??= when;
        foreach (var token in Tokens)
            token.Revoke(when);
    }
}

/// <summary>A single opaque refresh token bound to a family. Only the SHA-256 hash is persisted.</summary>
public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FamilyId { get; set; }
    public RefreshFamily? Family { get; set; }
    public Guid UserId { get; set; }
    public Guid TenantId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsRevoked => RevokedAt is not null;

    public bool IsExpired(DateTimeOffset now) => ExpiresAt < now;

    public void Revoke(DateTimeOffset when) => RevokedAt ??= when;

    /// <summary>Whether the token is still spendable (never revoked and unexpired).</summary>
    public bool IsUsable(DateTimeOffset now) => !IsRevoked && !IsExpired(now);
}