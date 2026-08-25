using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VueAuth.Api.Common;
using VueAuth.Api.Data;
using VueAuth.Api.Services;

namespace VueAuth.Api.Endpoints;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup(ApiContract.BasePath + "/auth");

        group.MapPost("/login", Login).RequireRateLimiting("auth");
        group.MapPost("/refresh", Refresh).RequireRateLimiting("auth");
        group.MapPost("/logout", Logout).RequireAuthorization();
        group.MapGet("/me", Me).RequireAuthorization();

        return group;
    }

    private static async Task<IResult> Login(
        LoginRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        TokenService tokens,
        AppDbContext db)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return Error(http, 400, ErrorCodes.ValidationFailed, "Email and password are required.");

        var user = await userManager.FindByEmailAsync(request.Email);
        var passwordOk = user is not null && await userManager.CheckPasswordAsync(user, request.Password);

        if (user is null || !passwordOk)
        {
            if (user is not null)
                await userManager.AccessFailedAsync(user);
            return Error(http, 401, ErrorCodes.InvalidCredentials, "Email or password is incorrect.");
        }

        var locked = await userManager.IsLockedOutAsync(user) || user.Status == UserStatus.Disabled;
        if (locked)
        {
            await RevokeAllForAsync(db, user.Id);
            return Error(http, 422, ErrorCodes.AccountLocked, "Account is locked. Contact support.");
        }

        await userManager.ResetAccessFailedCountAsync(user);
        signInManager.AuthenticationScheme = IdentityConstants.BearerScheme;

        var now = DateTimeOffset.UtcNow;
        var roles = await userManager.GetRolesAsync(user);
        var access = tokens.CreateAccessToken(user, roles, now);
        var (rawRefresh, refreshHash) = TokenService.CreateRefreshToken();

        var family = new RefreshFamily { UserId = user.Id };
        db.RefreshFamilies.Add(family);
        db.RefreshTokens.Add(new RefreshToken
        {
            FamilyId = family.Id,
            UserId = user.Id,
            TokenHash = refreshHash,
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(tokens.RefreshTtlSeconds)
        });
        await db.SaveChangesAsync();

        return Results.Json(new LoginResponse(access, rawRefresh, tokens.AccessTtlSeconds, UserDto.From(user, roles)), statusCode: 200);
    }

    private static async Task<IResult> Refresh(
        RefreshRequest request,
        HttpContext http,
        UserManager<ApplicationUser> userManager,
        TokenService tokens,
        AppDbContext db)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return Error(http, 401, ErrorCodes.Unauthenticated, "Refresh token is required.");

        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == TokenService.HashRefreshToken(request.RefreshToken));
        if (stored is null)
            return Error(http, 401, ErrorCodes.RefreshTokenRevoked, "Refresh token is invalid.");

        var family = await db.RefreshFamilies.Include(f => f.Tokens).SingleAsync(f => f.Id == stored.FamilyId);

        // Reuse of a revoked token → revoke the entire family; forces re-login (auth-flow.md §4).
        if (stored.RevokedAt is not null || family.RevokedAt is not null)
        {
            family.RevokedAt = DateTimeOffset.UtcNow;
            foreach (var t in family.Tokens) t.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Error(http, 401, ErrorCodes.RefreshTokenRevoked, "Refresh token reuse detected.");
        }

        if (stored.ExpiresAt < DateTimeOffset.UtcNow)
            return Error(http, 401, ErrorCodes.RefreshTokenRevoked, "Refresh token has expired.");

        var user = await userManager.FindByIdAsync(stored.UserId.ToString());
        var locked = user is null || await userManager.IsLockedOutAsync(user) || user.Status == UserStatus.Disabled;
        if (locked)
        {
            family.RevokedAt = DateTimeOffset.UtcNow;
            foreach (var t in family.Tokens) t.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return user is null
                ? Error(http, 401, ErrorCodes.RefreshTokenRevoked, "Refresh token is invalid.")
                : Error(http, 422, ErrorCodes.AccountLocked, "Account is locked.");
        }

        // Rotate: revoke the presented token, mint a new descendant in the same family.
        var now = DateTimeOffset.UtcNow;
        stored.RevokedAt = now;
        var (rawRefresh, _) = TokenService.CreateRefreshToken();
        db.RefreshTokens.Add(new RefreshToken
        {
            FamilyId = family.Id,
            UserId = stored.UserId,
            TokenHash = TokenService.HashRefreshToken(rawRefresh),
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(tokens.RefreshTtlSeconds)
        });
        await db.SaveChangesAsync();

        var roles = await userManager.GetRolesAsync(user!);
        var access = tokens.CreateAccessToken(user!, roles, now);
        return Results.Json(new LoginResponse(access, rawRefresh, tokens.AccessTtlSeconds, UserDto.From(user!, roles)), statusCode: 200);
    }
private static async Task<IResult> Logout(HttpContext http, AppDbContext db)
    {
        var userId = http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                     ?? http.User.FindFirst("sub")?.Value;
        if (Guid.TryParse(userId, out var id))
            await RevokeAllForAsync(db, id);
        return Results.NoContent(); // idempotent: always 204
    }

    private static async Task<IResult> Me(HttpContext http, UserManager<ApplicationUser> userManager)
    {
        var userIdClaim = http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                          ?? http.User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(userIdClaim, out var id))
            return Error(http, 401, ErrorCodes.Unauthenticated, "Invalid token subject.");

        var user = await userManager.FindByIdAsync(id.ToString());
        if (user is null)
            return Error(http, 401, ErrorCodes.Unauthenticated, "User no longer exists.");

        var roles = await userManager.GetRolesAsync(user);
        return Results.Ok(UserDto.From(user, roles));
    }

    // ── helpers ──────────────────────────────────────────

    private static async Task RevokeAllForAsync(AppDbContext db, Guid userId)
    {
        var families = await db.RefreshFamilies.Where(f => f.UserId == userId).Include(f => f.Tokens).ToListAsync();
        foreach (var f in families)
        {
            f.RevokedAt = DateTimeOffset.UtcNow;
            foreach (var t in f.Tokens) t.RevokedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    private static IResult Error(HttpContext http, int status, string code, string message)
    {
        var requestId = http.Request.Headers.TryGetValue("X-Request-Id", out var rid) ? rid.ToString() : null;
        return Results.Json(new ApiErrorResponse(new ApiError(code, message, RequestId: requestId)), statusCode: status);
    }
}