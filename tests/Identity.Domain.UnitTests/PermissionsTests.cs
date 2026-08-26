using Identity.Domain;

namespace Identity.Domain.UnitTests;


/// <summary>
/// Verifies the central role → permission catalog. These are pure functions, so each
/// test follows the AAA pattern against <see cref="Permissions.For"/> / <see cref="Permissions.IsKnownRole"/>.
/// </summary>
public class PermissionsTests
{
    [Fact]
    public void Admin_Has_All_Tenant_Management_Permissions()
    {
        // Arrange
        const string role = "Admin";
        var expected = new[]
        {
            Permissions.UsersRead, Permissions.UsersWrite, Permissions.UsersDelete,
            Permissions.RolesRead, Permissions.ProfileRead, Permissions.ProfileWrite,
        };

        // Act
        var actual = Permissions.For(role);

        // Assert
        Assert.Equal(expected.OrderBy(x => x), actual.OrderBy(x => x));
    }

    [Fact]
    public void Manager_Can_Manage_Users_But_Not_Delete_Or_Read_Roles()
    {
        // Arrange
        const string role = "Manager";

        // Act
        var perms = Permissions.For(role);

        // Assert
        Assert.Contains(Permissions.UsersWrite, perms);
        Assert.DoesNotContain(Permissions.UsersDelete, perms);
        Assert.DoesNotContain(Permissions.RolesRead, perms);
    }

    [Fact]
    public void PlatformAdmin_Has_Tenant_Scoped_Permissions()
    {
        // Arrange
        const string role = Permissions.PlatformAdminRole;

        // Act
        var perms = Permissions.For(role);

        // Assert
        Assert.Contains(Permissions.TenantsRead, perms);
        Assert.Contains(Permissions.TenantsWrite, perms);
        Assert.DoesNotContain(Permissions.UsersDelete, perms);
    }

    [Fact]
    public void Unknown_Role_Resolves_To_Empty_Permission_Set()
    {
        // Arrange
        const string role = "DoesNotExist";

        // Act
        var perms = Permissions.For(role);

        // Assert
        Assert.Empty(perms);
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Manager")]
    [InlineData("ReadOnly")]
    [InlineData("PlatformAdmin")]
    public void Known_Roles_Are_Recognized(string role)
    {
        // Act
        var known = Permissions.IsKnownRole(role);

        // Assert
        Assert.True(known);
    }

    [Fact]
    public void Role_Lookup_Is_Case_Insensitive()
    {
        // Arrange
        const string mixedCase = "aDmIn";

        // Act
        var perms = Permissions.For(mixedCase);
        var known = Permissions.IsKnownRole(mixedCase);

        // Assert
        Assert.NotEmpty(perms);
        Assert.True(known);
    }
}