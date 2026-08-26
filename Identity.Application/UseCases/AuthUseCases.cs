using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using Identity.Domain.Entities;

namespace Identity.Application.UseCases;

/// <summary>
/// Authentication use cases: login (with tenant-suspension and lockout rules),
/// refresh-token rotation with reuse detection, and logout.
/// </summary>
public sealed class AuthUseCases(
    ITenantRepository tenants,
    IUserRepository users,
    IUserAccountService accounts,
    IRefreshTokenStore refreshTokens,
    ITokenProvider jwt,
    IUnitOfWork unitOfWork)
{
    public async Task<UseCaseResult<LoginResponse>> LoginAsync(LoginRequest request, string? tenantSlug)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return UseCaseResult<LoginResponse>.Fail(400, ErrorCodes.ValidationFailed, "Email and password are required.");

        // Multi-tenancy: the caller identifies their workspace via X-Tenant-Id (slug).
        if (string.IsNullOrWhiteSpace(tenantSlug))
            return UseCaseResult<LoginResponse>.Fail(400, ErrorCodes.ValidationFailed,
                $"The {ApiContract.TenantHeader} header is required.");

        var tenant = await tenants.FindBySlugAsync(tenantSlug.Trim().ToLowerInvariant());
        if (tenant is null)
            return UseCaseResult<LoginResponse>.Fail(404, ErrorCodes.TenantNotFound, "Unknown tenant.");
        if (tenant.Status == TenantStatus.Suspended)
            return UseCaseResult<LoginResponse>.Fail(422, ErrorCodes.TenantSuspended, "This workspace is suspended. Contact support.");

        // Email lookup is scoped to the tenant (emails are unique per tenant only).
        var user = await users.FindInTenantByEmailAsync(tenant.Id, request.Email);
        var passwordOk = user is not null && await accounts.CheckPasswordAsync(user, request.Password);

        if (user is null || !passwordOk)
        {
            if (user is not null)
                await accounts.RecordFailedLoginAsync(user);
            return UseCaseResult<LoginResponse>.Fail(401, ErrorCodes.InvalidCredentials, "Email or password is incorrect.");
        }

        if (await accounts.IsLockedOutAsync(user) || user.Status == UserStatus.Disabled)
        {
            await refreshTokens.RevokeAllForUserAsync(user.Id);
            await unitOfWork.CommitAsync();
            return UseCaseResult<LoginResponse>.Fail(422, ErrorCodes.AccountLocked, "Account is locked. Contact support.");
        }

        await accounts.ResetFailedLoginsAsync(user);

        var now = DateTimeOffset.UtcNow;
        var roles = await users.GetRoleNamesAsync(user);
        var access = jwt.CreateAccessToken(user, roles, now);
        var (rawRefresh, refreshHash) = jwt.CreateRefreshToken();

        var family = new RefreshFamily { UserId = user.Id, TenantId = tenant.Id };
        family.IssueToken(refreshHash, now, now.AddSeconds(jwt.RefreshTtlSeconds));
        await refreshTokens.AddFamilyAsync(family);
        await unitOfWork.CommitAsync();

        return UseCaseResult<LoginResponse>.Ok(new LoginResponse(access, rawRefresh, jwt.AccessTtlSeconds, UserDto.From(user, roles)));
    }

    public async Task<UseCaseResult<LoginResponse>> RefreshAsync(string? rawRefreshToken)
    {
        if (string.IsNullOrWhiteSpace(rawRefreshToken))
            return UseCaseResult<LoginResponse>.Fail(401, ErrorCodes.Unauthenticated, "Refresh token is required.");

        var stored = await refreshTokens.FindByTokenHashAsync(jwt.HashRefreshToken(rawRefreshToken));
        if (stored?.Family is null)
            return UseCaseResult<LoginResponse>.Fail(401, ErrorCodes.RefreshTokenRevoked, "Refresh token is invalid.");

        var family = stored.Family;
        var now = DateTimeOffset.UtcNow;

        // Reuse of a revoked token → revoke the entire family; forces re-login.
        if (stored.IsRevoked || family.IsRevoked)
        {
            family.RevokeAll(now);
            await unitOfWork.CommitAsync();
            return UseCaseResult<LoginResponse>.Fail(401, ErrorCodes.RefreshTokenRevoked, "Refresh token reuse detected.");
        }

        if (stored.IsExpired(now))
            return UseCaseResult<LoginResponse>.Fail(401, ErrorCodes.RefreshTokenRevoked, "Refresh token has expired.");

        // Tenant suspension cuts off refresh as well as login.
        var tenant = await tenants.FindByIdAsync(stored.TenantId);
        if (tenant is null || tenant.Status != TenantStatus.Active)
            return UseCaseResult<LoginResponse>.Fail(422, ErrorCodes.TenantSuspended, "This workspace is suspended. Contact support.");

        var user = await users.FindByIdAsync(stored.UserId);
        var locked = user is null || user.TenantId != stored.TenantId ||
            await accounts.IsLockedOutAsync(user) || user.Status == UserStatus.Disabled;
        if (locked)
        {
            family.RevokeAll(now);
            await unitOfWork.CommitAsync();
            return user is null
                ? UseCaseResult<LoginResponse>.Fail(401, ErrorCodes.RefreshTokenRevoked, "Refresh token is invalid.")
                : UseCaseResult<LoginResponse>.Fail(422, ErrorCodes.AccountLocked, "Account is locked.");
        }

        // Rotate: revoke the presented token, mint a new descendant in the same family.
        var (rawRefresh, newHash) = jwt.CreateRefreshToken();
        var fresh = family.RotateToken(stored, newHash, now, now.AddSeconds(jwt.RefreshTtlSeconds));
        await refreshTokens.AddTokenAsync(fresh); // explicit add — see IRefreshTokenStore.AddTokenAsync
        await unitOfWork.CommitAsync();

        var roles = await users.GetRoleNamesAsync(user!);
        var access = jwt.CreateAccessToken(user!, roles, now);
        return UseCaseResult<LoginResponse>.Ok(new LoginResponse(access, rawRefresh, jwt.AccessTtlSeconds, UserDto.From(user!, roles)));
    }

    /// <summary>Idempotent: always reports success without a payload.</summary>
    public async Task<UseCaseResult<Unit>> LogoutAsync(CallerInfo caller)
    {
        if (!caller.IsEmpty)
        {
            await refreshTokens.RevokeAllForUserAsync(caller.UserId);
            await unitOfWork.CommitAsync();
        }
        return UseCaseResult<Unit>.NoContent();
    }
}