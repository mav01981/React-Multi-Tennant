using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace Identity.Infrastructure.Identity;

/// <summary>
/// Adapter over <see cref="UserManager{ApplicationUser}"/> for the credential and
/// lifecycle operations use cases need. Keeps ASP.NET Core Identity plumbing out of
/// the Application layer.
/// </summary>
public sealed class UserAccountService(UserManager<ApplicationUser> users) : IUserAccountService
{
    public Task<bool> CheckPasswordAsync(ApplicationUser user, string password, CancellationToken ct = default) =>
        users.CheckPasswordAsync(user, password);

    /// <summary>Counts a failed login toward lockout (Identity's access-failure machinery).</summary>
    public async Task RecordFailedLoginAsync(ApplicationUser user, CancellationToken ct = default)
    {
        if (user.LockoutEnabled)
            await users.AccessFailedAsync(user);
    }

    public async Task ResetFailedLoginsAsync(ApplicationUser user, CancellationToken ct = default)
    {
        if (user.AccessFailedCount > 0)
            await users.ResetAccessFailedCountAsync(user);
    }

    public Task<bool> IsLockedOutAsync(ApplicationUser user, CancellationToken ct = default) =>
        users.IsLockedOutAsync(user);

    public Task<IdentityResult> CreateWithPasswordAsync(ApplicationUser user, string password, CancellationToken ct = default) =>
        users.CreateAsync(user, password);

    public async Task<IdentityResult> UpdateAsync(ApplicationUser user, CancellationToken ct = default) =>
        await users.UpdateAsync(user);

    public async Task<IdentityResult> ChangePasswordAsync(ApplicationUser user, string currentPassword, string newPassword, CancellationToken ct = default) =>
        await users.ChangePasswordAsync(user, currentPassword, newPassword);
}