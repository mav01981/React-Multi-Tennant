using System.Text.Json.Serialization;
using Identity.Domain.Entities;

namespace Identity.Application.Contracts;

/// <summary>Boundary DTOs exposed over the HTTP API.</summary>
public static class ApiContract
{
    public const string BasePath = "/api/v1";

    /// <summary>Tenant slug carried on login (and optionally other pre-auth calls).</summary>
    public const string TenantHeader = "X-Tenant-Id";
}

public record LoginRequest(string Email, string Password);

public record RefreshRequest(string AccessToken, string RefreshToken);

public record LoginResponse(string AccessToken, int ExpiresIn, UserDto User)
{
    /// <summary>
    /// Rotated refresh token for the session. Deliberately excluded from the JSON
    /// body: it is delivered to browsers as an HttpOnly cookie (see
    /// Identity.Api.Common.RefreshTokenCookie). It remains part of this record so
    /// the Application layer keeps a single result type.
    /// </summary>
    [JsonIgnore]
    public string? RefreshToken { get; init; }

    /// <summary>Lifetime (seconds) for the refresh-token cookie. Not serialized.</summary>
    [JsonIgnore]
    public int RefreshTtlSeconds { get; init; }
}

public record UserDto(
    string Id,
    string Email,
    string FirstName,
    string LastName,
    string[] Roles,
    string Status,
    string CreatedAt,
    string UpdatedAt,
    string TenantId)
{
    public static UserDto From(ApplicationUser user, IEnumerable<string> roles) => new(
        user.Id.ToString(),
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        [.. roles],
        user.Status.ToString().ToLowerInvariant(),
        user.CreatedAt.ToString("O"),
        user.UpdatedAt.ToString("O"),
        user.TenantId.ToString());
}

public record ApiErrorResponse(ApiError Error);

public record ApiError(string Code, string Message, IReadOnlyList<ApiErrorDetail>? Details = null, string? RequestId = null);

public record ApiErrorDetail(string Field, string Message);

// User Management (Admin)
public record CreateUserRequest(string Email, string FirstName, string LastName, string Password, string[] Roles);

public record UpdateUserRequest(string? Email = null, string? FirstName = null, string? LastName = null, string? Status = null, string[]? Roles = null);

public record UpdateProfileRequest(string? FirstName = null, string? LastName = null);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UserListItem(
    string Id,
    string Email,
    string FirstName,
    string LastName,
    string[] Roles,
    string Status,
    string CreatedAt,
    string UpdatedAt,
    string TenantId)
{
    public static UserListItem From(ApplicationUser user, IEnumerable<string> roles) => new(
        user.Id.ToString(),
        user.Email ?? string.Empty,
        user.FirstName,
        user.LastName,
        roles.ToArray(),
        user.Status.ToString().ToLowerInvariant(),
        user.CreatedAt.ToString("O"),
        user.UpdatedAt.ToString("O"),
        user.TenantId.ToString());
}

public record UserListResponse(UserListItem[] Items, int TotalCount, int Page, int PageSize, int TotalPages);

public record RoleDto(string Id, string Name, string[] Permissions);

// ── Tenants (PlatformAdmin only) ─────────────────────────────
public record CreateTenantRequest(string Name, string DisplayName, string Slug);

public record UpdateTenantRequest(string? Name = null, string? DisplayName = null, string? Status = null);

public record TenantListResponse(TenantDto[] Items, int TotalCount, int Page, int PageSize, int TotalPages);

public record TenantDto(
    string Id,
    string Name,
    string DisplayName,
    string Slug,
    string Status,
    string CreatedAt)
{
    public static TenantDto From(Tenant t) => new(
        t.Id.ToString(),
        t.Name,
        t.DisplayName,
        t.Slug,
        t.Status.ToString().ToLowerInvariant(),
        t.CreatedAt.ToString("O"));
}

public static class ErrorCodes
{
    public const string InvalidCredentials = "INVALID_CREDENTIALS";
    public const string Unauthenticated = "UNAUTHENTICATED";
    public const string RefreshTokenRevoked = "REFRESH_TOKEN_REVOKED";
    public const string AccountLocked = "ACCOUNT_LOCKED";
    public const string ValidationFailed = "VALIDATION_FAILED";
    public const string InternalError = "INTERNAL_ERROR";
    public const string TooManyRequests = "TOO_MANY_REQUESTS";
    public const string Forbidden = "FORBIDDEN";
    public const string NotFound = "NOT_FOUND";
    public const string EmailExists = "EMAIL_EXISTS";
    public const string LastActiveAdmin = "LAST_ACTIVE_ADMIN";
    public const string TenantNotFound = "TENANT_NOT_FOUND";
    public const string TenantSuspended = "TENANT_SUSPENDED";
    public const string SlugExists = "SLUG_EXISTS";
}