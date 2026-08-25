using Microsoft.AspNetCore.Identity;
using VueAuth.Api.Common;

namespace VueAuth.Api.Data;

/// <summary>Idempotent bootstrap seed: default roles + initial admin (be-ef-migrations.md §4).</summary>
public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration config)
    {
        var roleManager = services.GetRequiredService<RoleManager<ApplicationRole>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

        foreach (var roleName in new[] { "Admin", "Manager", "User" })
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new ApplicationRole(roleName));
            }
        }

        var seed = config.GetSection("Seed");
        var email = seed["BootstrapAdminEmail"] ?? "admin@example.com";

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return;
        }

        var admin = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FirstName = "Bootstrap",
            LastName = "Admin",
            EmailConfirmed = true
        };
        var password = seed["BootstrapAdminPassword"] ?? "ChangeMe-Admin-1!";
        var result = await userManager.CreateAsync(admin, password);

        if (!result.Succeeded)
        {
            return;
        }

        await userManager.AddToRoleAsync(admin, "Admin");
    }
}