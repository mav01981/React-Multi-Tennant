using Microsoft.AspNetCore.Identity;

namespace VueAuth.Api.Common;

/// <summary>An application user, extending the Identity user with profile + account fields.</summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public UserStatus Status { get; set; } = UserStatus.Active;
    public int FailedLoginCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum UserStatus
{
    Active = 0,
    Locked = 1,
    Disabled = 2,
}

public class ApplicationRole : IdentityRole<Guid>
{
    public ApplicationRole() { }
    public ApplicationRole(string name) : base(name) { }
}

/// <summary>A refresh-token family. Revoking the family invalidates every descendant token.</summary>
public class RefreshFamily
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
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
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}