namespace Identity.Domain;

/// <summary>
/// Central role → permission map == The backend authorizes at
/// permission granularity — a role name is only an aggregate. Roles are per-tenant
/// (Admin/Manager/ReadOnly seeded for each tenant) plus a platform-wide
/// <c>PlatformAdmin</c> that can manage tenants.
/// </summary>
public static class Permissions
{
    // Canonical dots.notated permission ids (representative set).
    public const string UsersRead = "users.read";
    public const string UsersWrite = "users.write";
    public const string UsersDelete = "users.delete";
    public const string RolesRead = "roles.read";
    public const string ProfileRead = "profile.read";
    public const string ProfileWrite = "profile.write";
    public const string TenantsRead = "tenants.read";
    public const string TenantsWrite = "tenants.write";

    /// <summary>Default per-tenant role catalog. Each tenant is seeded with exactly these.</summary>
    public static readonly IReadOnlyList<string> DefaultTenantRoles = new[] { "Admin", "Manager", "ReadOnly" };

    /// <summary>The reserved role granted to the platform bootstrap super-admin.</summary>
    public const string PlatformAdminRole = "PlatformAdmin";

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Map =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Admin"] = [UsersRead, UsersWrite, UsersDelete, RolesRead, ProfileRead, ProfileWrite],
            ["Manager"] = [UsersRead, UsersWrite, ProfileRead, ProfileWrite],
            ["ReadOnly"] = [UsersRead, RolesRead, ProfileRead, ProfileWrite],
            [PlatformAdminRole] = [TenantsRead, TenantsWrite, UsersRead, RolesRead, ProfileRead, ProfileWrite]
        };

    /// <summary>Resolves the permission set for a role name; unknown roles resolve to empty (no crash).</summary>
    public static IReadOnlyList<string> For(string roleName) =>
        Map.TryGetValue(roleName, out var perms) ? perms : Array.Empty<string>();

    /// <summary>Whether the name is part of the known catalog (assignable roles + platform admin).</summary>
    public static bool IsKnownRole(string roleName) => Map.ContainsKey(roleName);
}