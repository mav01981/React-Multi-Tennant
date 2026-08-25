namespace VueAuth.Api.Common;

/// <summary>
/// Central role → permission map (feat-04 §2 / §4). The backend authorizes at
/// permission granularity — a role name is only an aggregate. In v1 the role set is
/// static (adding/editing roles is out of feature scope), so the map lives in code
/// rather than a per-role join table (see be-ef-migrations.md §"permission modeling
/// decision" — a string array in code is kept for read-only roles).
/// </summary>
public static class Permissions
{
    // Canonical dots.notated permission ids (feat-04 §2 representative set).
    public const string UsersRead = "users.read";
    public const string UsersWrite = "users.write";
    public const string UsersDelete = "users.delete";
    public const string RolesRead = "roles.read";
    public const string ProfileRead = "profile.read";
    public const string ProfileWrite = "profile.write";

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Map =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Admin"] = new[] { UsersRead, UsersWrite, UsersDelete, RolesRead, ProfileRead, ProfileWrite },
            ["Manager"] = new[] { UsersRead, UsersWrite, ProfileRead, ProfileWrite },
            ["User"] = new[] { ProfileRead, ProfileWrite }
        };

    /// <summary>Resolves the permission set for a role name; unknown roles resolve to empty (no crash).</summary>
    public static IReadOnlyList<string> For(string roleName) =>
        Map.TryGetValue(roleName, out var perms) ? perms : Array.Empty<string>();
}