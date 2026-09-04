using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using Identity.Application.UseCases;
using Identity.Domain;
using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.Infrastructure.Persistence;
using Identity.TestSupport;
using Microsoft.EntityFrameworkCore;

namespace Identity.Application.UnitTests;

/// <summary>
/// End-to-end tests for the Application-layer use cases, driven through the real
/// Infrastructure adapters (EF Core InMemory + ASP.NET Core Identity) so the migrated
/// business rules â€” refresh rotation/reuse detection, tenant suspension, per-tenant
/// email uniqueness and the last-active-admin invariant â€” are verified in place.
/// </summary>
public class UseCaseTests : IDisposable
{
    private readonly TestServices _svc = new();
    private readonly FakeTokens _tokens = new();

    private AuthUseCases NewAuth() => new(
        new TenantRepository(_svc.Db),
        new UserRepository(_svc.Db),
        new UserAccountService(_svc.Users),
        new RefreshTokenStore(_svc.Db),
        _tokens,
        new EfUnitOfWork(_svc.Db));

    private UserAdminUseCases NewUsers() => new(
        new UserRepository(_svc.Db),
        new UserAccountService(_svc.Users),
        new RoleCatalog(_svc.Db));

    [Fact]
    public async Task Login_With_Valid_Credentials_Issues_Token_Pair_And_Persists_Family()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        await _svc.CreateUserAsync(tenant, "alice@acme.test", roles: new[] { "Admin" });
        var auth = NewAuth();

        // Act
        var result = await auth.LoginAsync(new LoginRequest("alice@acme.test", "Password-1!"), "acme");

        // Assert
        Assert.True(result.IsSuccess);
        Assert.NotEmpty(result.Value!.AccessToken);
        Assert.NotEmpty(result.Value!.RefreshToken!);
        Assert.Equal(600, result.Value.ExpiresIn);
        Assert.Contains("Admin", result.Value.User.Roles);
        Assert.Equal(1, await _svc.Db.RefreshFamilies.CountAsync());
    }

    [Fact]
    public async Task Login_Without_Tenant_Header_Fails_Validation()
    {
        var result = await NewAuth().LoginAsync(new LoginRequest("a@b.test", "x"), null);
        Assert.Equal(400, result.StatusCode);
        Assert.Equal(ErrorCodes.ValidationFailed, result.ErrorCode);
    }

    [Fact]
    public async Task Login_With_Suspended_Tenant_Is_Blocked()
    {
        var tenant = await _svc.CreateTenantAsync("suspended");
        await _svc.CreateUserAsync(tenant, "bob@suspended.test");
        _svc.Db.Tenants.Single().Status = TenantStatus.Suspended;
        await _svc.Db.SaveChangesAsync();

        var result = await NewAuth().LoginAsync(new LoginRequest("bob@suspended.test", "Password-1!"), "suspended");

        Assert.Equal(422, result.StatusCode);
        Assert.Equal(ErrorCodes.TenantSuspended, result.ErrorCode);
    }

    [Fact]
    public async Task Refresh_Rotates_And_Reusing_The_Old_Token_Revokes_The_Family()
    {
        // Arrange: login â†’ refresh once â†’ present the ORIGINAL token again.
        var tenant = await _svc.CreateTenantAsync("acme");
        await _svc.CreateUserAsync(tenant, "alice@acme.test");
        var auth = NewAuth();
        var login = await auth.LoginAsync(new LoginRequest("alice@acme.test", "Password-1!"), "acme");
        var original = login.Value!.RefreshToken!;

        // Act 1: rotate.
        var rotated = await auth.RefreshAsync(original);
        Assert.True(rotated.IsSuccess);
        Assert.NotEqual(original, rotated.Value!.RefreshToken!);

        // Act 2: reuse of the already-rotated (revoked) token â†’ family revoked.
        var reuse = await auth.RefreshAsync(original);

        // Assert
        Assert.Equal(401, reuse.StatusCode);
        Assert.Equal(ErrorCodes.RefreshTokenRevoked, reuse.ErrorCode);
        var family = await _svc.Db.RefreshFamilies.Include(f => f.Tokens).SingleAsync();
        Assert.True(family.IsRevoked);
        Assert.All(family.Tokens, t => Assert.True(t.IsRevoked));
    }

    [Fact]
    public async Task Logout_Revokes_All_Families_For_The_Caller()
    {
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test");
        var auth = NewAuth();
        await auth.LoginAsync(new LoginRequest("alice@acme.test", "Password-1!"), "acme");

        var result = await auth.LogoutAsync(new CallerInfo(user.Id, tenant.Id));

        Assert.True(result.IsSuccess);
        var family = await _svc.Db.RefreshFamilies.SingleAsync();
        Assert.True(family.IsRevoked);
    }

    [Fact]
    public async Task Create_Duplicate_Email_In_Same_Tenant_Is_Rejected()
    {
        var tenant = await _svc.CreateTenantAsync("acme");
        await _svc.CreateUserAsync(tenant, "taken@acme.test");

        var result = await NewUsers().CreateAsync(tenant.Id,
            new CreateUserRequest("taken@acme.test", "A", "B", "secret-1", ["Manager"]));

        Assert.Equal(409, result.StatusCode);
        Assert.Equal(ErrorCodes.EmailExists, result.ErrorCode);
    }

    [Fact]
    public async Task Create_Succeeds_And_Assigns_Roles_Within_The_Tenant()
    {
        var tenant = await _svc.CreateTenantAsync("acme");

        var result = await NewUsers().CreateAsync(tenant.Id,
            new CreateUserRequest("newbie@acme.test", "New", "Bie", "secret-1", ["Manager"]));

        Assert.True(result.IsSuccess);
        Assert.Equal(201, result.StatusCode);
        Assert.Contains("Manager", result.Value!.Roles);
    }

    [Fact]
    public async Task Create_Rejects_PlatformAdmin_Role_Assignment()
    {
        var tenant = await _svc.CreateTenantAsync("acme");

        var result = await NewUsers().CreateAsync(tenant.Id,
            new CreateUserRequest("root@acme.test", "R", "T", "secret-1", ["PlatformAdmin"]));

        Assert.Equal(403, result.StatusCode);
        Assert.Equal(ErrorCodes.Forbidden, result.ErrorCode);
    }

    [Fact]
    public async Task Delete_The_Last_Active_Admin_Is_Rejected()
    {
        var tenant = await _svc.CreateTenantAsync("acme");
        var admin = await _svc.CreateUserAsync(tenant, "admin@acme.test", roles: new[] { "Admin" });

        var result = await NewUsers().DeleteAsync(tenant.Id, admin.Id);

        Assert.Equal(409, result.StatusCode);
        Assert.Equal(ErrorCodes.LastActiveAdmin, result.ErrorCode);
        Assert.Equal(UserStatus.Active, (await _svc.Db.Users.SingleAsync(u => u.Id == admin.Id)).Status);
    }

    [Fact]
    public async Task Delete_A_Non_Admin_User_Soft_Disables_Them()
    {
        var tenant = await _svc.CreateTenantAsync("acme");
        await _svc.CreateUserAsync(tenant, "admin@acme.test", roles: new[] { "Admin" });
        var member = await _svc.CreateUserAsync(tenant, "member@acme.test");

        var result = await NewUsers().DeleteAsync(tenant.Id, member.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(UserStatus.Disabled, (await _svc.Db.Users.SingleAsync(u => u.Id == member.Id)).Status);
    }

    [Fact]
    public async Task Update_Demoting_The_Last_Active_Admin_Is_Rejected()
    {
        var tenant = await _svc.CreateTenantAsync("acme");
        var admin = await _svc.CreateUserAsync(tenant, "admin@acme.test", roles: new[] { "Admin" });

        var result = await NewUsers().UpdateAsync(tenant.Id, admin.Id,
            new UpdateUserRequest(Roles: ["ReadOnly"]));

        Assert.Equal(409, result.StatusCode);
        Assert.Equal(ErrorCodes.LastActiveAdmin, result.ErrorCode);
    }

    [Fact]
    public async Task Update_Cannot_Strip_The_Reserved_PlatformAdmin_Role()
    {
        // Arrange: a platform-root account seeded directly (the reserved role is never
        // API-assignable), plus the role row that DbSeeder would have created.
        var tenant = await _svc.CreateTenantAsync("acme");
        var root = await _svc.CreateUserAsync(tenant, "root@platform.test");
        var role = await TenantRoles.FindOrCreateAsync(_svc.Db, tenant.Id, Permissions.PlatformAdminRole);
        _svc.Db.UserRoles.Add(new Microsoft.AspNetCore.Identity.IdentityUserRole<Guid> { UserId = root.Id, RoleId = role.Id });
        await _svc.Db.SaveChangesAsync();

        // Act: attempt to replace PlatformAdmin with an ordinary role.
        var result = await NewUsers().UpdateAsync(tenant.Id, root.Id,
            new UpdateUserRequest(Roles: ["ReadOnly"]));

        // Assert: rejected, role intact, account untouched.
        Assert.Equal(403, result.StatusCode);
        Assert.Equal(ErrorCodes.Forbidden, result.ErrorCode);

        var rolesAfter = await _svc.Db.UserRoles.Where(ur => ur.UserId == root.Id)
            .Join(_svc.Db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name!)
            .ToListAsync();
        Assert.Contains(Permissions.PlatformAdminRole, rolesAfter);

        var stillRoot = await _svc.Db.Users.SingleAsync(u => u.Id == root.Id);
        Assert.Equal(UserStatus.Active, stillRoot.Status);
    }

    public void Dispose() => _svc.Dispose();

    /// <summary>Deterministic token provider stub: unique raw refresh tokens + SHA-256 hashing.</summary>
    private sealed class FakeTokens : ITokenProvider
    {
        public string Issuer => "test-issuer";
        public string Audience => "test-audience";
        public int AccessTtlSeconds => 600;
        public int RefreshTtlSeconds => 3600;

        private int _n;

        public string CreateAccessToken(ApplicationUser user, IEnumerable<string> roles, DateTimeOffset now) =>
            $"access:{user.Id}:{++_n}";

        public (string Raw, string Hash) CreateRefreshToken()
        {
            var raw = $"refresh-{Guid.NewGuid():N}";
            return (raw, HashRefreshToken(raw));
        }

        public string HashRefreshToken(string raw) =>
            Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(raw)));
    }
}
