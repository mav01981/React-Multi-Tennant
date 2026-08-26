using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.TestSupport;

namespace Identity.Infrastructure.UnitTests;

/// <summary>
/// Verifies <see cref="TenantUserValidator"/> enforces email/username uniqueness *within a tenant*,
/// while still allowing the same value across different tenants (multi-tenancy invariant).
/// </summary>
public class TenantUserValidatorTests : IDisposable
{
    private readonly TestServices _svc = new();
    private readonly TenantUserValidator _validator = new();

    private async Task<ApplicationUser> SeedAsync(Guid tenantId, string username, string email)
    {
        var user = new ApplicationUser
        {
            UserName = username,
            Email = email,
            FirstName = "Test",
            LastName = "User",
            TenantId = tenantId,
        };
        var result = await _svc.Users.CreateAsync(user, "Password-1!");
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(e => e.Description)));
        return user;
    }

    [Fact]
    public async Task Validate_Succeeds_For_Unique_User_In_Tenant()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = new ApplicationUser
        {
            UserName = "alice",
            Email = "alice@acme.test",
            TenantId = tenant.Id,
        };

        // Act
        var result = await _validator.ValidateAsync(_svc.Users, user);

        // Assert
        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task Validate_Rejects_Duplicate_Email_Within_Tenant()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        await SeedAsync(tenant.Id, "alice", "alice@acme.test");
        var duplicate = new ApplicationUser
        {
            UserName = "alice2", // different username so only email collides
            Email = "alice@acme.test",
            TenantId = tenant.Id,
        };

        // Act
        var result = await _validator.ValidateAsync(_svc.Users, duplicate);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains(result.Errors, e => e.Code == "DuplicateEmail");
    }

    [Fact]
    public async Task Validate_Rejects_Duplicate_Username_Within_Tenant()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        await SeedAsync(tenant.Id, "alice", "alice@acme.test");
        var duplicate = new ApplicationUser
        {
            UserName = "alice",
            Email = "different@acme.test",
            TenantId = tenant.Id,
        };

        // Act
        var result = await _validator.ValidateAsync(_svc.Users, duplicate);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains(result.Errors, e => e.Code == "DuplicateUserName");
    }

    [Fact]
    public async Task Validate_Allows_Same_Email_Across_Tenants()
    {
        // Arrange
        var tenantA = await _svc.CreateTenantAsync("acme");
        var tenantB = await _svc.CreateTenantAsync("globex");
        await SeedAsync(tenantA.Id, "alice", "alice@acme.test");

        var crossTenant = new ApplicationUser
        {
            UserName = "alice",
            Email = "alice@acme.test",
            TenantId = tenantB.Id,
        };

        // Act
        var result = await _validator.ValidateAsync(_svc.Users, crossTenant);

        // Assert
        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task Validate_Rejects_Empty_Username()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = new ApplicationUser
        {
            UserName = "   ",
            Email = "x@example.com",
            TenantId = tenant.Id,
        };

        // Act
        var result = await _validator.ValidateAsync(_svc.Users, user);

        // Assert
        Assert.False(result.Succeeded);
        Assert.Contains(result.Errors, e => e.Code == "InvalidUserName");
    }

    [Fact]
    public async Task Validate_Ignores_The_Same_User_Identified_By_Id()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var existing = await SeedAsync(tenant.Id, "alice", "alice@acme.test");

        // Mutate email/username on the same user — validator must not flag it as a duplicate.
        existing.Email = "still@acme.test";
        existing.NormalizedEmail = "STILL@ACME.TEST";

        // Act
        var result = await _validator.ValidateAsync(_svc.Users, existing);

        // Assert
        Assert.True(result.Succeeded);
    }

    public void Dispose() => _svc.Dispose();
}