using Identity.Api.Common;
using Microsoft.EntityFrameworkCore;

namespace Identity.API.UnitTests;

/// <summary>
/// Verifies tenant-scoped role operations in <see cref="TenantRoles"/>. Because role names
/// repeat across tenants, every operation must stay scoped by TenantId (a core multi-tenancy
/// invariant). Uses an isolated InMemory context per test.
/// </summary>
public class TenantRolesTests : IDisposable
{
    private readonly TestServices _svc = new();

    [Fact]
    public async Task FindOrCreate_Creates_Role_With_NormalizedName()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");

        // Act
        var role = await TenantRoles.FindOrCreateAsync(_svc.Db, tenant.Id, "Admin");

        // Assert
        Assert.NotNull(role);
        Assert.Equal(tenant.Id, role.TenantId);
        Assert.Equal("ADMIN", role.NormalizedName);
    }

    [Fact]
    public async Task FindOrCreate_Is_Idempotent()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");

        // Act
        var first = await TenantRoles.FindOrCreateAsync(_svc.Db, tenant.Id, "Admin");
        var second = await TenantRoles.FindOrCreateAsync(_svc.Db, tenant.Id, "Admin");

        // Assert
        Assert.Same(first, second);
        Assert.Equal(1, await _svc.Db.Roles.CountAsync());
    }

    [Fact]
    public async Task Roles_With_Same_Name_Are_Independent_Across_Tenants()
    {
        // Arrange
        var tenantA = await _svc.CreateTenantAsync("acme");
        var tenantB = await _svc.CreateTenantAsync("globex");

        // Act
        var roleA = await TenantRoles.FindOrCreateAsync(_svc.Db, tenantA.Id, "Admin");
        var roleB = await TenantRoles.FindOrCreateAsync(_svc.Db, tenantB.Id, "Admin");

        // Assert
        Assert.NotEqual(roleA.Id, roleB.Id);
        Assert.Equal(tenantA.Id, roleA.TenantId);
        Assert.Equal(tenantB.Id, roleB.TenantId);
    }

    [Fact]
    public async Task Assign_Adds_Memberships_Idempotently()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test");

        // Act
        await TenantRoles.AssignAsync(_svc.Db, user, new[] { "Admin" });
        await TenantRoles.AssignAsync(_svc.Db, user, new[] { "Admin" });

        // Assert
        Assert.True(await TenantRoles.IsInRoleAsync(_svc.Db, user, "Admin"));
        Assert.Equal(1, await _svc.Db.UserRoles.CountAsync());
    }

    [Fact]
    public async Task Assign_Rejects_Unknown_Role()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test");

        // Act
        var result = await TenantRoles.AssignAsync(_svc.Db, user, new[] { "SuperUser" });

        // Assert
        Assert.False(result.Succeeded);
        Assert.Equal("UnknownRole", result.Errors.First().Code);
    }

    [Fact]
    public async Task Assign_Rejects_PlatformAdmin_Role()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test");

        // Act
        var result = await TenantRoles.AssignAsync(_svc.Db, user, new[] { Permissions.PlatformAdminRole });

        // Assert
        Assert.False(result.Succeeded);
        Assert.Equal("ForbiddenRole", result.Errors.First().Code);
    }

    [Fact]
    public async Task Replace_Swaps_Role_Memberships()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test", roles: new[] { "Admin" });

        // Act
        var result = await TenantRoles.ReplaceAsync(_svc.Db, user, new[] { "Manager" });

        // Assert
        Assert.True(result.Succeeded);
        Assert.False(await TenantRoles.IsInRoleAsync(_svc.Db, user, "Admin"));
        Assert.True(await TenantRoles.IsInRoleAsync(_svc.Db, user, "Manager"));
    }

    [Fact]
    public async Task IsInRole_Is_Scoped_To_The_Users_Tenant()
    {
        // Arrange
        var tenantA = await _svc.CreateTenantAsync("acme");
        var tenantB = await _svc.CreateTenantAsync("globex");
        await TenantRoles.FindOrCreateAsync(_svc.Db, tenantB.Id, "Admin"); // same-named role in another tenant
        var userA = await _svc.CreateUserAsync(tenantA, "alice@acme.test", roles: new[] { "Admin" });

        // Act
        var inOwnTenant = await TenantRoles.IsInRoleAsync(_svc.Db, userA, "Admin");
        var inOtherRole = await TenantRoles.IsInRoleAsync(_svc.Db, userA, "Manager");

        // Assert
        Assert.True(inOwnTenant);
        Assert.False(inOtherRole);

        // Cross-tenant safety: userA must never surface as a member of tenant B's "Admin" role.
        var tenantsBAdmins = await TenantRoles.GetUsersInRoleAsync(_svc.Db, tenantB.Id, "Admin");
        Assert.DoesNotContain(tenantsBAdmins, u => u.Id == userA.Id);
    }

    [Fact]
    public async Task GetUsersInRole_Returns_Only_Tenants_Members()
    {
        // Arrange
        var tenantA = await _svc.CreateTenantAsync("acme");
        var tenantB = await _svc.CreateTenantAsync("globex");
        var alice = await _svc.CreateUserAsync(tenantA, "alice@acme.test", roles: new[] { "Admin" });
        var bob = await _svc.CreateUserAsync(tenantA, "bob@acme.test", roles: new[] { "Manager" });
        await _svc.CreateUserAsync(tenantB, "carol@globex.test", roles: new[] { "Admin" });

        // Act
        var adminsOfA = await TenantRoles.GetUsersInRoleAsync(_svc.Db, tenantA.Id, "Admin");

        // Assert
        Assert.Contains(adminsOfA, u => u.Id == alice.Id);
        Assert.DoesNotContain(adminsOfA, u => u.Id == bob.Id);
        Assert.DoesNotContain(adminsOfA, u => u.Id == tenantB.Id);
    }

    public void Dispose() => _svc.Dispose();
}