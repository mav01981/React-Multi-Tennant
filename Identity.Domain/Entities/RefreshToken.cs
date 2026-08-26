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
}