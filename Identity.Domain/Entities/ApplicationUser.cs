using Microsoft.AspNetCore.Identity;

namespace Identity.Domain.Entities;

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