namespace Identity.Domain.Entities;

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