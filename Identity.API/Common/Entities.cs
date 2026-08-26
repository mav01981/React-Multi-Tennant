using Microsoft.AspNetCore.Identity;

namespace Identity.Api.Common;

/// <summary>A tenant workspace. Every user/business object belongs to exactly one tenant.</summary>
public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    /// <summary>Soft-delete marker (feat-05 §5). Non-null hides the tenant from lists and blocks logins.</summary>
    public DateTimeOffset? DeletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum TenantStatus
{
    Active = 0,
    Suspended = 1,
}

/// <summary>An application user, extending the Identity user with profile + tenant fields.</summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }
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

    /// <summary>The tenant that owns this role. Role names are unique within a tenant.</summary>
    public Guid TenantId { get; set; }
}

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