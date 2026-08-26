using Identity.Api.Common;
using Identity.Application.Contracts;
using Identity.Domain;
using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Api.Endpoints;

public static class UsersEndpoints
{
    public static RouteGroupBuilder MapUsersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/users")
            .RequireAuthorization();

        group.MapGet("", ListUsers);
        group.MapGet("/me", GetCurrentUser);
        group.MapPut("/me", UpdateCurrentUser);
        group.MapPost("/me/password", ChangePassword);
        group.MapGet("/{id:guid}", GetUser);
        group.MapPost("", CreateUser);
        group.MapPut("/{id:guid}", UpdateUser);
        group.MapDelete("/{id:guid}", DeleteUser);

        return group;
    }

    private static async Task<IResult> GetCurrentUser(
        HttpContext http,
        UserManager<ApplicationUser> userManager)
    {
        var user = await GetCallerAsync(http, userManager);
        if (user is null)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        var roles = await userManager.GetRolesAsync(user);
        return Results.Ok(UserDto.From(user, roles));
    }

    private static async Task<IResult> UpdateCurrentUser(
        UpdateProfileRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager)
    {
        var user = await GetCallerAsync(http, userManager);
        if (user is null)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        if (request.FirstName is not null && !IsValidName(request.FirstName) ||
            request.LastName is not null && !IsValidName(request.LastName))
            return Error(http, 400, ErrorCodes.ValidationFailed, "Names are required and must be 1 to 100 characters.");

        if (request.FirstName is not null)
            user.FirstName = request.FirstName.Trim();
        if (request.LastName is not null)
            user.LastName = request.LastName.Trim();

        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
            return Error(http, 400, ErrorCodes.ValidationFailed, string.Join("; ", result.Errors.Select(e => e.Description)));

        var roles = await userManager.GetRolesAsync(user);
        return Results.Ok(UserDto.From(user, roles));
    }

    private static async Task<IResult> ChangePassword(
        ChangePasswordRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager)
    {
        var user = await GetCallerAsync(http, userManager);
        if (user is null)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        if (string.IsNullOrWhiteSpace(request.CurrentPassword) || string.IsNullOrWhiteSpace(request.NewPassword))
            return Error(http, 400, ErrorCodes.ValidationFailed, "Current password and new password are required.");

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == "PasswordMismatch"))
                return Error(http, 401, ErrorCodes.InvalidCredentials, "Current password is incorrect.");
            return Error(http, 400, ErrorCodes.ValidationFailed, string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        return Results.NoContent();
    }

    private static async Task<ApplicationUser?> GetCallerAsync(
        HttpContext http,
        UserManager<ApplicationUser> userManager)
    {
        var subject = http.User.FindFirst("sub")?.Value ??
            http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(subject, out var userId) ||
            AuthHelpers.GetTenantId(http) is not { } tenantId)
            return null;

        // The token's tid claim must match the stored user (multi-tenancy guard).
        var user = await userManager.FindByIdAsync(userId.ToString());
        return user is not null && user.TenantId == tenantId ? user : null;
    }

    private static bool IsValidName(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length is >= 1 and <= 100;
    }

    /// <summary>Resolves the caller's tenant from the tid claim, or null.</summary>
    private static Guid? CallerTenant(HttpContext http) => AuthHelpers.GetTenantId(http);

    /// <summary>List users with pagination and filtering (scoped to the caller's tenant). Admin only.</summary>
    private static async Task<IResult> ListUsers(
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db,
        int page = 1,
        int pageSize = 10,
        string? search = null,
        string? role = null,
        string? status = null,
        string sortBy = "createdAt",
        string sortDir = "desc")
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.UsersRead))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to view users.");
        if (CallerTenant(http) is not { } tenantId)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        // Clamp pagination
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        // Build query — always constrained to the caller's tenant
        var query = userManager.Users.Where(u => u.TenantId == tenantId);

        // Apply search filter (case-insensitive substring on email, firstName, lastName)
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLower();
            query = query.Where(u =>
                (u.Email != null && u.Email.ToLower().Contains(term)) ||
                u.FirstName.ToLower().Contains(term) ||
                u.LastName.ToLower().Contains(term));
        }

        // Apply status filter
        if (!string.IsNullOrWhiteSpace(status) && status != "all")
        {
            var targetStatus = status.ToLower() switch
            {
                "active" => UserStatus.Active,
                "locked" => UserStatus.Locked,
                "disabled" => UserStatus.Disabled,
                _ => UserStatus.Active
            };
            query = query.Where(u => u.Status == targetStatus);
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            var roleUserIds = (await TenantRoles.GetUsersInRoleAsync(db, tenantId, role))
                .Select(u => u.Id).ToArray();
            query = query.Where(u => roleUserIds.Contains(u.Id));
        }

        // Get total count before pagination
        var totalCount = await query.CountAsync();

        // Apply sorting (only allow certain fields for safety)
        var allowedSortBy = sortBy.ToLower() switch
        {
            "email" => "Email",
            "firstname" => "FirstName",
            "lastname" => "LastName",
            "status" => "Status",
            _ => "CreatedAt"
        };

        query = sortDir.ToLower() == "asc"
            ? query.OrderBy(u => EF.Property<object>(u, allowedSortBy))
            : query.OrderByDescending(u => EF.Property<object>(u, allowedSortBy));

        // Apply pagination
        var users = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Map to DTOs with roles
        var userItems = new List<UserListItem>();
        foreach (var user in users)
        {
            var roles = await userManager.GetRolesAsync(user);
            userItems.Add(UserListItem.From(user, roles));
        }

        var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);
        return Results.Json(
            new UserListResponse(userItems.ToArray(), totalCount, page, pageSize, totalPages),
            statusCode: 200);
    }

    /// <summary>Get a single user by ID (tenant-scoped). Admin only.</summary>
    private static async Task<IResult> GetUser(
        string id,
        HttpContext http,
        UserManager<ApplicationUser> userManager)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.UsersRead))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to view users.");
        if (CallerTenant(http) is not { } tenantId)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        if (!Guid.TryParse(id, out var userId))
            return Error(http, 404, ErrorCodes.NotFound, "User not found.");

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.TenantId != tenantId)
            return Error(http, 404, ErrorCodes.NotFound, "User not found.");

        var roles = await userManager.GetRolesAsync(user);
        return Results.Ok(UserDto.From(user, roles));
    }

    /// <summary>Create a new user in the caller's tenant. Admin only.</summary>
    private static async Task<IResult> CreateUser(
        CreateUserRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.UsersWrite))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to create users.");
        if (CallerTenant(http) is not { } tenantId)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        // Validate
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.FirstName) ||
            string.IsNullOrWhiteSpace(request.LastName) || string.IsNullOrWhiteSpace(request.Password))
            return Error(http, 400, ErrorCodes.ValidationFailed, "Email, firstName, lastName, and password are required.");
        if (request.Roles.Contains(Permissions.PlatformAdminRole, StringComparer.OrdinalIgnoreCase))
            return Error(http, 403, ErrorCodes.Forbidden, "The platform admin role cannot be assigned.");

        // Email uniqueness is scoped to the caller's tenant.
        if (await DbSeeder.FindUserInTenantAsync(db, tenantId, request.Email) is not null)
            return Error(http, 409, ErrorCodes.EmailExists, "A user with this email already exists in this workspace.");

        // Create user
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            EmailConfirmed = true,
            Status = UserStatus.Active,
            TenantId = tenantId
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            var message = string.Join("; ", result.Errors.Select(e => e.Description));
            return Error(http, 400, ErrorCodes.ValidationFailed, message);
        }

        // Assign roles within the user's own tenant
        if (request.Roles.Length > 0)
        {
            var roleResult = await TenantRoles.AssignAsync(db, user, request.Roles.Distinct());
            if (!roleResult.Succeeded)
            {
                var message = string.Join("; ", roleResult.Errors.Select(e => e.Description));
                return Error(http, 400, ErrorCodes.ValidationFailed, message);
            }
        }

        var roles = await userManager.GetRolesAsync(user);
        return Results.Json(UserDto.From(user, roles), statusCode: 201);
    }

    /// <summary>Update a user (tenant-scoped). Admin only.</summary>
    private static async Task<IResult> UpdateUser(
        string id,
        UpdateUserRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.UsersWrite))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to update users.");
        if (CallerTenant(http) is not { } tenantId)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        if (!Guid.TryParse(id, out var userId))
            return Error(http, 404, ErrorCodes.NotFound, "User not found.");

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.TenantId != tenantId)
            return Error(http, 404, ErrorCodes.NotFound, "User not found.");

        var currentRoles = await userManager.GetRolesAsync(user);
        var requestedStatus = request.Status?.ToLowerInvariant() switch
        {
            null or "" => user.Status,
            "active" => UserStatus.Active,
            "locked" => UserStatus.Locked,
            "disabled" => UserStatus.Disabled,
            _ => (UserStatus?)null
        };
        if (requestedStatus is null)
            return Error(http, 400, ErrorCodes.ValidationFailed, "Status must be active, locked, or disabled.");
        if (request.Roles is not null && request.Roles.Contains(Permissions.PlatformAdminRole, StringComparer.OrdinalIgnoreCase))
            return Error(http, 403, ErrorCodes.Forbidden, "The platform admin role cannot be assigned.");

        var requestedRoles = request.Roles?.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var remainsActiveAdmin = requestedStatus == UserStatus.Active &&
            (requestedRoles is null || requestedRoles.Contains("Admin", StringComparer.OrdinalIgnoreCase));
        if (currentRoles.Contains("Admin", StringComparer.OrdinalIgnoreCase) && !remainsActiveAdmin &&
            await IsLastActiveAdminAsync(db, tenantId, user))
            return Error(http, 409, ErrorCodes.LastActiveAdmin, "The last active admin cannot be locked, disabled, or removed from the Admin role.");

        // Update fields
        if (!string.IsNullOrWhiteSpace(request.Email) && request.Email != user.Email)
        {
            // Email uniqueness is scoped to this tenant.
            var existing = await DbSeeder.FindUserInTenantAsync(db, tenantId, request.Email);
            if (existing is not null && existing.Id != user.Id)
                return Error(http, 409, ErrorCodes.EmailExists, "A user with this email already exists in this workspace.");
            user.Email = request.Email;
            user.UserName = request.Email;
        }

        if (!string.IsNullOrWhiteSpace(request.FirstName))
            user.FirstName = request.FirstName;

        if (!string.IsNullOrWhiteSpace(request.LastName))
            user.LastName = request.LastName;

        if (!string.IsNullOrWhiteSpace(request.Status))
            user.Status = requestedStatus.Value;

        var updateResult = await userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var message = string.Join("; ", updateResult.Errors.Select(e => e.Description));
            return Error(http, 400, ErrorCodes.ValidationFailed, message);
        }

        // Update roles — replaced within the user's own tenant
        if (request.Roles is not null)
        {
            var replaceResult = await TenantRoles.ReplaceAsync(db, user, requestedRoles ?? Array.Empty<string>());
            if (!replaceResult.Succeeded)
            {
                var message = string.Join("; ", replaceResult.Errors.Select(e => e.Description));
                return Error(http, 400, ErrorCodes.ValidationFailed, message);
            }
        }

        var roles = await userManager.GetRolesAsync(user);
        return Results.Ok(UserDto.From(user, roles));
    }

    /// <summary>Delete (soft-delete via status=disabled) a user (tenant-scoped). Admin only.</summary>
    private static async Task<IResult> DeleteUser(
        string id,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        AppDbContext db)
    {
        if (!await AuthHelpers.HasPermissionAsync(http, userManager, Permissions.UsersDelete))
            return Error(http, 403, ErrorCodes.Forbidden, "You do not have permission to delete users.");
        if (CallerTenant(http) is not { } tenantId)
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        if (!Guid.TryParse(id, out var userId))
            return Error(http, 404, ErrorCodes.NotFound, "User not found.");

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.TenantId != tenantId)
            return Results.NoContent(); // Idempotent

        if (user.Status == UserStatus.Active &&
            await TenantRoles.IsInRoleAsync(db, user, "Admin") &&
            await IsLastActiveAdminAsync(db, tenantId, user))
            return Error(http, 409, ErrorCodes.LastActiveAdmin, "The last active admin cannot be deleted.");

        user.Status = UserStatus.Disabled;
        var updateResult = await userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var message = string.Join("; ", updateResult.Errors.Select(e => e.Description));
            return Error(http, 400, ErrorCodes.ValidationFailed, message);
        }
        return Results.NoContent();
    }

    // ── helpers ────────────────────────────────────────────

    /// <summary>Whether the target is the only active Admin within their tenant.</summary>
    private static async Task<bool> IsLastActiveAdminAsync(AppDbContext db, Guid tenantId, ApplicationUser target)
    {
        var activeAdmins = await TenantRoles.GetUsersInRoleAsync(db, tenantId, "Admin");
        return activeAdmins.Count(user => user.Status == UserStatus.Active) == 1 &&
            activeAdmins.Any(user => user.Id == target.Id);
    }

    private static IResult Error(HttpContext http, int status, string code, string message)
    {
        var requestId = http.Request.Headers.TryGetValue("X-Request-Id", out var rid) ? rid.ToString() : null;
        return Results.Json(new ApiErrorResponse(new ApiError(code, message, RequestId: requestId)), statusCode: status);
    }

    private static IResult Error(HttpContext http, int status)
    {
        return Results.NoContent();
    }
}
