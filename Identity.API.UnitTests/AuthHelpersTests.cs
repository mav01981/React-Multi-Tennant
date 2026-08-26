using System.Security.Claims;
using Identity.Api.Common;
using Microsoft.AspNetCore.Http;

namespace Identity.API.UnitTests;

/// <summary>Verifies claim-driven helpers in <see cref="AuthHelpers"/>.</summary>
public class AuthHelpersTests : IDisposable
{
    private readonly TestServices _svc = new();

    private static HttpContext CreateContext(Guid? tenantId = null)
    {
        var http = new DefaultHttpContext();
        if (tenantId is not null)
            http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("tid", tenantId.Value.ToString()) }));
        return http;
    }

    [Fact]
    public void GetTenantId_Returns_Tenant_From_Tid_Claim()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var http = CreateContext(tenantId: tenantId);

        // Act
        var actual = AuthHelpers.GetTenantId(http);

        // Assert
        Assert.Equal(tenantId, actual);
    }

    [Fact]
    public void GetTenantId_Returns_Null_When_Claim_Is_Missing()
    {
        // Arrange
        var http = CreateContext();

        // Act
        var actual = AuthHelpers.GetTenantId(http);

        // Assert
        Assert.Null(actual);
    }

    [Fact]
    public void GetTenantId_Returns_Null_When_Claim_Is_Not_A_Guid()
    {
        // Arrange
        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("tid", "not-a-guid") }));

        // Act
        var actual = AuthHelpers.GetTenantId(http);

        // Assert
        Assert.Null(actual);
    }

    [Fact]
    public async Task FindCaller_Returns_User_For_Valid_Subject()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test");
        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", user.Id.ToString()) }));

        // Act
        var actual = await AuthHelpers.FindCallerAsync(http, _svc.Users);

        // Assert
        Assert.NotNull(actual);
        Assert.Equal(user.Id, actual.Id);
    }

    [Fact]
    public async Task FindCaller_Returns_Null_For_Invalid_Subject()
    {
        // Arrange
        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", "not-a-guid") }));

        // Act
        var actual = await AuthHelpers.FindCallerAsync(http, _svc.Users);

        // Assert
        Assert.Null(actual);
    }

    [Fact]
    public async Task HasPermission_Returns_True_When_Role_Grants_Permission()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test", roles: new[] { "Admin" });
        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", user.Id.ToString()) }));

        // Act
        var allowed = await AuthHelpers.HasPermissionAsync(http, _svc.Users, Permissions.UsersWrite);

        // Assert
        Assert.True(allowed);
    }

    [Fact]
    public async Task HasPermission_Returns_False_When_Role_Lacks_Permission()
    {
        // Arrange
        var tenant = await _svc.CreateTenantAsync("acme");
        var user = await _svc.CreateUserAsync(tenant, "alice@acme.test", roles: new[] { "ReadOnly" });
        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", user.Id.ToString()) }));

        // Act
        var allowed = await AuthHelpers.HasPermissionAsync(http, _svc.Users, Permissions.UsersWrite);

        // Assert
        Assert.False(allowed);
    }

    [Fact]
    public async Task HasPermission_Returns_False_For_Unknown_User()
    {
        // Arrange
        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", Guid.NewGuid().ToString()) }));

        // Act
        var allowed = await AuthHelpers.HasPermissionAsync(http, _svc.Users, Permissions.UsersRead);

        // Assert
        Assert.False(allowed);
    }

    public void Dispose() => _svc.Dispose();
}