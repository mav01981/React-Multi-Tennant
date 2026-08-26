namespace Identity.Domain.Entities;

/// <summary>A tenant workspace. Every user/business object belongs to exactly one tenant.</summary>
public class Tenant
{
    /// <summary>The reserved bootstrap workspace slug. Its tenant hosts the PlatformAdmin role.</summary>
    public const string PlatformSlug = "platform";

    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    /// <summary>Soft-delete marker (feat-05 §5). Non-null hides the tenant from lists and blocks logins.</summary>
    public DateTimeOffset? DeletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Whether this is the immutable bootstrap platform workspace.</summary>
    public bool IsPlatform => Slug == PlatformSlug;

    /// <summary>Whether the given slug collides with a reserved workspace slug.</summary>
    public static bool IsReservedSlug(string slug) =>
        slug.Trim().ToLowerInvariant() == PlatformSlug;

    /// <summary>
    /// Domain invariant: an active Admin membership may only be stripped when another
    /// active administrator remains. Used by update/demote/disable/delete flows so the
    /// "last active admin" rule cannot be bypassed by a future endpoint forgetting the
    /// check. <paramref name="adminsInRole"/> is the tenant-scoped snapshot of members
    /// currently holding the Admin role.
    /// </summary>
    public static bool LosingItsOnlyActiveAdmin(
        bool targetCurrentlyAdmin,
        bool targetRemainsActiveAdmin,
        IReadOnlyCollection<ApplicationUser> adminsInRole,
        Guid targetUserId)
        => targetCurrentlyAdmin && !targetRemainsActiveAdmin &&
           IsSoleActiveAdmin(adminsInRole, targetUserId);

    private static bool IsSoleActiveAdmin(IReadOnlyCollection<ApplicationUser> adminsInRole, Guid targetUserId)
        => adminsInRole.Any(a => a.Id == targetUserId) &&
           adminsInRole.Count(a => a.Id != targetUserId && a.Status == UserStatus.Active) == 0;

    /// <summary>Soft-delete stamp (feat-05 §5): hides the tenant and blocks logins.</summary>
    public void MarkDeleted(DateTimeOffset when)
    {
        DeletedAt = when;
        Status = TenantStatus.Suspended;
        UpdatedAt = when;
    }

    /// <summary>Transitions the workspace state after validating platform protections.</summary>
    public bool MayTransitionTo(TenantStatus target) =>
        !(IsPlatform && target == TenantStatus.Suspended);
}

public enum TenantStatus
{
    Active = 0,
    Suspended = 1,
}