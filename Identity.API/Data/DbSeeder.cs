using Identity.Api.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Api.Data;

/// <summary>
/// Idempotent bootstrap seed :
/// 1. the reserved <c>platform</c> tenant,
/// 2. the platform admin user (from <c>Seed</c> config) holding the PlatformAdmin role,
/// 3. a demo tenant with its default role catalog and a tenant admin.
/// </summary>
public static class DbSeeder
{
    public const string PlatformTenantSlug = "platform";

    public static async Task SeedAsync(IServiceProvider services, IConfiguration config)
    {
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var db = services.GetRequiredService<AppDbContext>();

        var platform = await EnsureTenantAsync(db, PlatformTenantSlug, "Platform", "Platform (root)");

        // PlatformAdmin is a platform-tenant-only role; create it directly.
        if (await TenantRoles.FindAsync(db, platform.Id, Permissions.PlatformAdminRole) is null)
        {
            db.Roles.Add(new ApplicationRole(Permissions.PlatformAdminRole)
            {
                TenantId = platform.Id,
                NormalizedName = Permissions.PlatformAdminRole.ToUpperInvariant()
            });
            await db.SaveChangesAsync();
        }

        var seed = config.GetSection("Seed");
        var email = seed["BootstrapAdminEmail"] ?? "admin@example.com";
        var password = seed["BootstrapAdminPassword"] ?? "ChangeMe-Admin-1!";

        var admin = await FindUserInTenantAsync(db, platform.Id, email);
        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FirstName = "Bootstrap",
                LastName = "Admin",
                EmailConfirmed = true,
                TenantId = platform.Id
            };
            var result = await userManager.CreateAsync(admin, password);
            if (!result.Succeeded) return;
        }

        if (!await TenantRoles.IsInRoleAsync(db, admin, Permissions.PlatformAdminRole))
        {
            db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = admin.Id, RoleId = (await TenantRoles.FindAsync(db, platform.Id, Permissions.PlatformAdminRole))!.Id });
            await db.SaveChangesAsync();
        }

        // Demo tenant so a fresh clone has a non-platform workspace to log into.
        var demo = await EnsureTenantAsync(db, "acme", "Acme Inc", "Acme Inc");
        await TenantRoles.SeedDefaultRolesAsync(db, demo.Id);

        var demoAdminEmail = seed["BootstrapTenantAdminEmail"] ?? "tenant-admin@acme.test";
        if (await FindUserInTenantAsync(db, demo.Id, demoAdminEmail) is null)
        {
            var demoAdmin = new ApplicationUser
            {
                UserName = demoAdminEmail,
                Email = demoAdminEmail,
                FirstName = "Acme",
                LastName = "Admin",
                EmailConfirmed = true,
                TenantId = demo.Id
            };
            var result = await userManager.CreateAsync(demoAdmin, password);
            if (!result.Succeeded) return;
            await TenantRoles.AssignAsync(db, demoAdmin, new[] { "Admin" });
        }
    }

    private static async Task<Tenant> EnsureTenantAsync(AppDbContext db, string slug, string name, string displayName)
    {
        var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Slug == slug);
        if (tenant is not null) return tenant;

        tenant = new Tenant { Name = name, DisplayName = displayName, Slug = slug };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();
        return tenant;
    }

    /// <summary>Tenant-scoped replacement for UserManager.FindByEmailAsync.</summary>
    public static Task<ApplicationUser?> FindUserInTenantAsync(AppDbContext db, Guid tenantId, string email)
    {
        var normalized = email.ToUpperInvariant();
        return db.Users.SingleOrDefaultAsync(u => u.TenantId == tenantId && u.NormalizedEmail == normalized);
    }
}