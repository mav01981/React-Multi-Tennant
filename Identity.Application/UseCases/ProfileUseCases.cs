using Identity.Application.Abstractions;
using Identity.Application.Contracts;

namespace Identity.Application.UseCases;

/// <summary>Self-service profile use cases for the authenticated caller.</summary>
public sealed class ProfileUseCases(IUserRepository users, IUserAccountService accounts)
{
    /// <summary>
    /// The caller's own profile. The tid claim must match the stored user — guards
    /// against a stale token after a user was moved between tenants.
    /// </summary>
    public async Task<UseCaseResult<UserDto>> GetMeAsync(CallerInfo caller)
    {
        if (caller.IsEmpty)
            return UseCaseResult<UserDto>.Fail(401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        if (caller.TenantId == Guid.Empty)
            return UseCaseResult<UserDto>.Fail(401, ErrorCodes.Unauthenticated, "Invalid token tenant.");

        var user = await users.FindByIdAsync(caller.UserId);

        if (user is null || user.TenantId != caller.TenantId)
            return UseCaseResult<UserDto>.Fail(401, ErrorCodes.Unauthenticated, "User no longer exists.");

        var roles = await users.GetRoleNamesAsync(user);
        return UseCaseResult<UserDto>.Ok(UserDto.From(user, roles));
    }

    public async Task<UseCaseResult<UserDto>> UpdateProfileAsync(CallerInfo caller, UpdateProfileRequest request)
    {
        var user = await users.FindByIdAsync(caller.UserId);

        if (user is null || user.TenantId != caller.TenantId)
            return UseCaseResult<UserDto>.Fail(401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        if (request.FirstName is not null && !IsValidName(request.FirstName) ||
            request.LastName is not null && !IsValidName(request.LastName))
            return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed, "Names are required and must be 1 to 100 characters.");

        if (request.FirstName is not null)
            user.FirstName = request.FirstName.Trim();

        if (request.LastName is not null)
            user.LastName = request.LastName.Trim();

        var result = await accounts.UpdateAsync(user);

        if (!result.Succeeded)
            return UseCaseResult<UserDto>.Fail(400, ErrorCodes.ValidationFailed,
                string.Join("; ", result.Errors.Select(e => e.Description)));

        var roles = await users.GetRoleNamesAsync(user);
        return UseCaseResult<UserDto>.Ok(UserDto.From(user, roles));
    }

    public async Task<UseCaseResult<Unit>> ChangePasswordAsync(CallerInfo caller, ChangePasswordRequest request)
    {
        var user = await users.FindByIdAsync(caller.UserId);
        if (user is null || user.TenantId != caller.TenantId)
            return UseCaseResult<Unit>.Fail(401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        if (string.IsNullOrWhiteSpace(request.CurrentPassword) || string.IsNullOrWhiteSpace(request.NewPassword))
            return UseCaseResult<Unit>.Fail(400, ErrorCodes.ValidationFailed, "Current password and new password are required.");

        var result = await accounts.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == "PasswordMismatch"))
                return UseCaseResult<Unit>.Fail(401, ErrorCodes.InvalidCredentials, "Current password is incorrect.");
            return UseCaseResult<Unit>.Fail(400, ErrorCodes.ValidationFailed,
                string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        return UseCaseResult<Unit>.NoContent();
    }

    private static bool IsValidName(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length is >= 1 and <= 100;
    }
}