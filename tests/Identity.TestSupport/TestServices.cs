using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Identity.TestSupport;

/// <summary>
/// Shared test fixture: spins up an isolated InMemory EF Core context plus a real
/// Identity <see cref="UserManager{ApplicationUser}"/> wired to its stores, so tests
/// exercise the same navigation/property mappings the API relies on.
/// </summary>
public sealed class TestServices : IDisposable
{
    /// <summary>A unique InMemory store name per instance → fully isolated tests.</summary>
    private readonly string _storeName = Guid.NewGuid().ToString("N");

    public TestServices()
    {
        var services = new ServiceCollection();

        // Lightweight logging so Identity providers can be resolved.
        services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Warning));

        // Relaxed password rules: the tests validate business rules (e.g. tenant
        // uniqueness), not the password policy.
        services
            .AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase(_storeName))
            .AddIdentityCore<ApplicationUser>(o =>
            {
                o.User.RequireUniqueEmail = false;
                o.Password.RequiredLength = 1;
                o.Password.RequireNonAlphanumeric = false;
                o.Password.RequireDigit = false;
                o.Password.RequireUppercase = false;
                o.Password.RequireLowercase = false;
            })
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<AppDbContext>();

        Provider = services.BuildServiceProvider();
        Db = Provider.GetRequiredService<AppDbContext>();
        Users = Provider.GetRequiredService<UserManager<ApplicationUser>>();
    }

    public ServiceProvider Provider { get; }

    public AppDbContext Db { get; }

    public UserManager<ApplicationUser> Users { get; }

    /// <summary>Creates a tenant and persists it.</summary>
    public async Task<Tenant> CreateTenantAsync(string slug, string name = "Test Tenant")
    {
        var tenant = new Tenant { Name = name, DisplayName = name, Slug = slug };
        Db.Tenants.Add(tenant);
        await Db.SaveChangesAsync();
        return tenant;
    }

    /// <summary>Creates a user in the given tenant with the requested password.</summary>
    public async Task<ApplicationUser> CreateUserAsync(
        Tenant tenant,
        string email,
        string password = "Password-1!",
        IEnumerable<string>? roles = null)
    {
        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = "Test",
            LastName = "User",
            TenantId = tenant.Id,
            EmailConfirmed = true,
        };
        var result = await Users.CreateAsync(user, password);
        Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(e => e.Description)));

        if (roles is not null)
        {
            var assign = await TenantRoles.AssignAsync(Db, user, roles);
            Assert.True(assign.Succeeded, string.Join("; ", assign.Errors.Select(e => e.Description)));
        }

        return user;
    }

    public void Dispose() => Provider.Dispose();
}