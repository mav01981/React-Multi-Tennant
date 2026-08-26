using Identity.Api.Common;

namespace Identity.API.UnitTests;

/// <summary>Verifies the DTO projection helpers (<see cref="UserDto.From"/> / <see cref="TenantDto.From"/>).</summary>
public class DtoTests
{
    [Fact]
    public void UserDto_From_Projects_All_Fields()
    {
        // Arrange
        var now = new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = "bob@example.com",
            FirstName = "Bob",
            LastName = "Builder",
            Status = UserStatus.Active,
            CreatedAt = now,
            UpdatedAt = now,
            TenantId = Guid.NewGuid(),
        };

        // Act
        var dto = UserDto.From(user, new[] { "Admin", "Manager" });

        // Assert
        Assert.Equal(user.Id.ToString(), dto.Id);
        Assert.Equal("bob@example.com", dto.Email);
        Assert.Equal("Bob", dto.FirstName);
        Assert.Equal("Builder", dto.LastName);
        Assert.Equal("active", dto.Status);
        Assert.Equal(now.ToString("O"), dto.CreatedAt);
        Assert.Equal(now.ToString("O"), dto.UpdatedAt);
        Assert.Equal(user.TenantId.ToString(), dto.TenantId);
        Assert.Equal(new[] { "Admin", "Manager" }, dto.Roles);
    }

    [Fact]
    public void UserDto_From_Handles_Null_Email_As_Empty()
    {
        // Arrange
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = null,
            FirstName = "X",
            LastName = "Y",
            TenantId = Guid.NewGuid(),
        };

        // Act
        var dto = UserDto.From(user, Array.Empty<string>());

        // Assert
        Assert.Equal(string.Empty, dto.Email);
    }

    [Fact]
    public void TenantDto_From_Projects_Tenant_Fields()
    {
        // Arrange
        var now = new DateTimeOffset(2025, 2, 3, 4, 5, 6, TimeSpan.Zero);
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = "Acme Inc",
            DisplayName = "Acme Display",
            Slug = "acme",
            Status = TenantStatus.Active,
            CreatedAt = now,
        };

        // Act
        var dto = TenantDto.From(tenant);

        // Assert
        Assert.Equal(tenant.Id.ToString(), dto.Id);
        Assert.Equal("Acme Inc", dto.Name);
        Assert.Equal("Acme Display", dto.DisplayName);
        Assert.Equal("acme", dto.Slug);
        Assert.Equal("active", dto.Status);
        Assert.Equal(now.ToString("O"), dto.CreatedAt);
    }
}