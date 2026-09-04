using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using Identity.Domain;
using Identity.Domain.Entities;

namespace Identity.Application.UseCases;

/// <summary>
/// Tenant-scoped user administration use cases (list / get / create / update /
/// delete). All invariants enforced here: per-tenant email uniqueness, PlatformAdmin
/// assignability, and the "last active admin" protection owned by the Tenant domain
/// model.
/// </summary>
public sealed class UserAdminUseCases(
    IUserRepository users,
    IUserAccountService accounts,
    IRoleCatalog roles,
    ITenantRepository tenants,
    IPermissionChecker permissions)
{
    /// <summary>
    /// Resolves the workspace a user-admin operation should act on: the caller's own
    /// tenant by default, or the tenant named by <paramref name="tenantSlug"/> — which
    /// only a caller holding <see cref="Permissions.TenantsRead"/> (i.e. PlatformAdmin,
    /// the sole role granted it) may do, and only for an existing, non-deleted, active
    /// workspace. Returns the target tenant id, or the failure to propagate.
    /// </summary>
    private async Task<(Guid? TenantId, (int StatusCode, string ErrorCode, string ErrorMessage)? Error)>
        ResolveTargetTenantAsync(Guid callerTenantId, Guid callerUserId, string? tenantSlug)
    {
        if (string.IsNullOrWhiteSpace(tenantSlug))
            return (callerTenantId, null);

        var slug = tenantSlug.Trim().ToLowerInvariant();
        var callerTenant = await tenants.FindByIdAsync(callerTenantId);
        if (callerTenant is not null && callerTenant.Slug.Equals(slug, StringComparison.OrdinalIgnoreCase))
            return (callerTenantId, null); // Redundant own-tenant slug — no elevation needed.

        if (!await permissions.HasPermissionAsync(callerUserId, Permissions.TenantsRead))
            return (null, (403, ErrorCodes.Forbidden, "Only the platform administrator can work with another workspace's users."));

        var target = await tenants.FindBySlugAsync(slug);
        if (target is null || target.DeletedAt is not null)
            return (null, (404, ErrorCodes.NotFound, "Workspace not found."));
        if (target.Status == TenantStatus.Suspended)
            return (null, (422, ErrorCodes.TenantSuspended, "Cannot work with a suspended workspace."));

        return (target.Id, null);
    }

    /// <summary>List users with pagination and filtering (scoped to the caller's tenant,
    /// or to a PlatformAdmin-selected workspace via <see cref="UserListRequest.TenantSlug"/>).</summary>
    public async Task<UseCaseResult<UserListResponse>> ListAsync(Guid callerTenantId, Guid callerUserId, UserListRequest request)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        var targetTenant = await ResolveTargetTenantAsync(callerTenantId, callerUserId, request.TenantSlug);
        if (targetTenant.Error is not null)
            return UseCaseResult<UserListResponse>.Fail(targetTenant.Error.Value.StatusCode, targetTenant.Error.Value.ErrorCode, targetTenant.Error.Value.ErrorMessage);
        var tenantId = targetTenant.TenantId!.Value;

        var (items, totalCount) = await users.ListAsync(new UserListQuery(
            tenantId, page, pageSize, request.Search, request.Role, request.Status,
            request.SortBy, request.SortDir));

        var userItems = new List<UserListItem>();
        foreach (var user in items)
        {
            var roleNames = await users.GetRoleNamesAsync(user);
            userItems.Add(UserListItem.From(user, roleNames));
        }

        var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);
        return UseCaseResult<UserListResponse>.Ok(
            new UserListResponse(userItems.ToArray(), totalCount, page, pageSize, totalPages));
    }

    public async Task<UseCaseResult<UserDto>> GetAsync(Guid userId, Guid tenantId)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || user.TenantId != tenantId)
            return UseCaseResult<UserDto>.Fail(404, ErrorCodes.NotFound, "User not found.");

        var roles = await users.GetRoleNamesAsync(user);
        return UseCaseResult<UserDto>.Ok(UserDto.From(user, roles));
    }

    /// <summary>
    /// Creates a user. By default the user lands in the caller's own tenant. A
    /// PlatformAdmin (the only role granted <see cref="Permissions.TenantsRead"/>)
    /// may additionally pass <paramref name="request.TenantSlug"/> to create the
    /// user in any existing, non-deleted, active workspace; the roles are resolved
    /// against that target tenant's catalog.
    /// </summary>
    public async Task<UseCaseResult<UserDto>> CreateAsync(Guid callerTenantId, Guid callerUserId, CreateUserRequest request)
    {
        // Validate
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.FirstName) ||
            string.IsNullOrWhiteSpace(request.LastName) || string.IsNullOrWhiteSpace(request.Password))
            return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, "Email, firstName, lastName, and password are required.");
        if (request.Roles.Contains(Permissions.PlatformAdminRole, StringComparer.OrdinalIgnoreCase))
            return UseCaseResult<UserDto>.Fail(403, ErrorCodes.Forbidden, "The platform admin role cannot be assigned.");

        // Resolve the target workspace: the caller's own, unless a TenantSlug is given.
        var targetTenant = await ResolveTargetTenantAsync(callerTenantId, callerUserId, request.TenantSlug);
        if (targetTenant.Error is not null)
            return UseCaseResult<UserDto>.Fail(targetTenant.Error.Value.StatusCode, targetTenant.Error.Value.ErrorCode, targetTenant.Error.Value.ErrorMessage);
        var targetTenantId = targetTenant.TenantId!.Value;

        // Email uniqueness is scoped to the target tenant.
        if (await users.FindInTenantByEmailAsync(targetTenantId, request.Email) is not null)
            return UseCaseResult<UserDto>.Fail(409, ErrorCodes.EmailExists, "A user with this email already exists in this workspace.");

        // Create user
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            EmailConfirmed = true,
            Status = UserStatus.Active,
            TenantId = targetTenantId
        };

        var result = await accounts.CreateWithPasswordAsync(user, request.Password);
        if (!result.Succeeded)
        {
            var message = string.Join("; ", result.Errors.Select(e => e.Description));
            return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, message);
        }

        // Assign roles within the user's own (target) tenant
        if (request.Roles.Length > 0)
        {
            var roleResult = await roles.AssignAsync(user, request.Roles.Distinct());
            if (!roleResult.Succeeded)
            {
                var message = string.Join("; ", roleResult.Errors.Select(e => e.Description));
                return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, message);
            }
        }

        var assignedRoles = await users.GetRoleNamesAsync(user);
        return UseCaseResult<UserDto>.Ok(UserDto.From(user, assignedRoles), 201);
    }

    /// <summary>
    /// Authorizes acting on a user record that may belong to a different workspace
    /// than the caller's. This is what backs the PlatformAdmin Workspace filter: rows
    /// listed from another tenant must be update- and delete-able by the same caller.
    /// Only holders of <see cref="Permissions.TenantsRead"/> (i.e. PlatformAdmin) may
    /// cross workspaces, and only into an existing, non-deleted, active one.
    /// </summary>
    private async Task<UseCaseResult<Unit>?> AuthorizeCrossTenantUserAsync(Guid callerTenantId, Guid callerUserId, ApplicationUser user)
    {
        if (user.TenantId == callerTenantId)
            return null; // Own tenant — nothing to elevate.

        if (!await permissions.HasPermissionAsync(callerUserId, Permissions.TenantsRead))
            return UseCaseResult<Unit>.Fail(403, ErrorCodes.Forbidden, "Only the platform administrator can manage another workspace's users.");

        var tenant = await tenants.FindByIdAsync(user.TenantId);
        if (tenant is null || tenant.DeletedAt is not null)
            return UseCaseResult<Unit>.Fail(404, ErrorCodes.NotFound, "Workspace not found.");
        if (tenant.Status == TenantStatus.Suspended)
            return UseCaseResult<Unit>.Fail(422, ErrorCodes.TenantSuspended, "Cannot work with a suspended workspace.");

        return null;
    }

    public async Task<UseCaseResult<UserDto>> UpdateAsync(Guid callerTenantId, Guid callerUserId, Guid userId, UpdateUserRequest request)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return UseCaseResult<UserDto>.Fail(404, ErrorCodes.NotFound, "User not found.");

        var denied = await AuthorizeCrossTenantUserAsync(callerTenantId, callerUserId, user);
        if (denied is not null)
            return UseCaseResult<UserDto>.Fail(
                denied.StatusCode,
                denied.ErrorCode ?? ErrorCodes.InternalError,
                denied.ErrorMessage ?? "An unexpected authorization error occurred.");

        // All tenant-scoped work below happens in the user's own workspace.
        var tenantId = user.TenantId;

        var currentRoles = await users.GetRoleNamesAsync(user);
        var requestedStatus = request.Status?.ToLowerInvariant() switch
        {
            null or "" => user.Status,
            "active" => UserStatus.Active,
            "locked" => UserStatus.Locked,
            "disabled" => UserStatus.Disabled,
            _ => (UserStatus?)null
        };
        if (requestedStatus is null)
            return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, "Status must be active, locked, or disabled.");
        if (request.Roles is not null && request.Roles.Contains(Permissions.PlatformAdminRole, StringComparer.OrdinalIgnoreCase))
            return UseCaseResult<UserDto>.Fail(403, ErrorCodes.Forbidden, "The platform admin role cannot be assigned.");
        if (currentRoles.Contains(Permissions.PlatformAdminRole, StringComparer.OrdinalIgnoreCase) && request.Roles is not null)
            return UseCaseResult<UserDto>.Fail(403, ErrorCodes.Forbidden, "The platform admin role is reserved and cannot be removed or replaced.");

        var requestedRoles = request.Roles?.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var futureRoles = (IReadOnlyList<string>?)(requestedRoles ?? currentRoles);
        var remainsActiveAdmin = requestedStatus == UserStatus.Active &&
           futureRoles is not null && futureRoles.Any(Permissions.IsAdministratorRole);

        // Domain invariant: the last active administrator cannot be demoted/locked/disabled.
        // Administrators include both per-tenant Admins and the PlatformAdmin root account.
        if (Tenant.LosingItsOnlyActiveAdmin(
                targetCurrentlyAdmin: currentRoles.Any(Permissions.IsAdministratorRole),
                targetRemainsActiveAdmin: remainsActiveAdmin,
                adminsInRole: await ListAdministratorsAsync(tenantId),
                targetUserId: user.Id))
            return UseCaseResult<UserDto>.Fail(409, ErrorCodes.LastActiveAdmin, "The last active admin cannot be locked, disabled, or removed from the Admin role.");

        // Update fields
        if (!string.IsNullOrWhiteSpace(request.Email) && request.Email != user.Email)
        {
            // Email uniqueness is scoped to this tenant.
            var existing = await users.FindInTenantByEmailAsync(tenantId, request.Email);
            if (existing is not null && existing.Id != user.Id)
                return UseCaseResult<UserDto>.Fail(409, ErrorCodes.EmailExists, "A user with this email already exists in this workspace.");
            user.Email = request.Email;
            user.UserName = request.Email;
        }

        if (!string.IsNullOrWhiteSpace(request.FirstName))
            user.FirstName = request.FirstName;

        if (!string.IsNullOrWhiteSpace(request.LastName))
            user.LastName = request.LastName;

        if (!string.IsNullOrWhiteSpace(request.Status))
            user.Status = requestedStatus.Value;

        var updateResult = await accounts.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var message = string.Join("; ", updateResult.Errors.Select(e => e.Description));
            return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, message);
        }

        // Update roles — replaced within the user's own tenant
        if (request.Roles is not null)
        {
            var replaceResult = await roles.ReplaceAsync(user, requestedRoles ?? Array.Empty<string>());
            if (!replaceResult.Succeeded)
            {
                var message = string.Join("; ", replaceResult.Errors.Select(e => e.Description));
                return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, message);
            }
        }

        var newRoles = await users.GetRoleNamesAsync(user);
        return UseCaseResult<UserDto>.Ok(UserDto.From(user, newRoles));
    }

    /// <summary>Every administrator of a tenant: per-tenant Admins plus any PlatformAdmin roots.</summary>
    private async Task<IReadOnlyList<ApplicationUser>> ListAdministratorsAsync(Guid tenantId)
    {
        var admins = new List<ApplicationUser>(await users.ListUsersInRoleAsync(tenantId, Permissions.TenantAdminRole));
        admins.AddRange(await users.ListUsersInRoleAsync(tenantId, Permissions.PlatformAdminRole));
        return admins;
    }

    /// <summary>
    /// Hard-deletes a user (permanently removes the record). Scoped to the caller's
    /// own tenant unless the caller holds <see cref="Permissions.TenantsRead"/>
    /// (PlatformAdmin), who may delete users of any existing active workspace —
    /// including rows surfaced by the Workspace-filtered list.
    /// </summary>
    public async Task<UseCaseResult<Unit>> DeleteAsync(Guid callerTenantId, Guid callerUserId, Guid userId)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return UseCaseResult<Unit>.NoContent(); // Idempotent

        var denied = await AuthorizeCrossTenantUserAsync(callerTenantId, callerUserId, user);
        if (denied is not null)
            return denied;
        var tenantId = user.TenantId;

        var roleNames = await users.GetRoleNamesAsync(user);
        if (user.Status == UserStatus.Active &&
            Tenant.LosingItsOnlyActiveAdmin(
                targetCurrentlyAdmin: roleNames.Any(Permissions.IsAdministratorRole),
                targetRemainsActiveAdmin: false,
                adminsInRole: await ListAdministratorsAsync(tenantId),
                targetUserId: user.Id))
            return UseCaseResult<Unit>.Fail(409, ErrorCodes.LastActiveAdmin, "The last active admin cannot be deleted.");

        var deleteResult = await accounts.DeleteAsync(user);
        if (!deleteResult.Succeeded)
        {
            var message = string.Join("; ", deleteResult.Errors.Select(e => e.Description));
            return UseCaseResult<Unit>.Fail(400, ErrorCodes.ValidationFailed, message);
        }
        return UseCaseResult<Unit>.NoContent();
    }
}