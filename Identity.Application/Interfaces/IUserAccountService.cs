using Identity.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace Identity.Application.Abstractions;

/// <summary>
/// Credential &amp; lifecycle operations that require ASP.NET Core Identity's
/// password hashing/lockout machinery. Implemented in Infrastructure on top of
/// <c>UserManager&lt;ApplicationUser&gt;</c>; use-cases consume this port so they
/// never touch Identity plumbing directly.
/// </summary>
public interface IUserAccountService
{
    Task<bool> CheckPasswordAsync(ApplicationUser user, string password, CancellationToken ct = default);
    Task RecordFailedLoginAsync(ApplicationUser user, CancellationToken ct = default);
    Task ResetFailedLoginsAsync(ApplicationUser user, CancellationToken ct = default);
    Task<bool> IsLockedOutAsync(ApplicationUser user, CancellationToken ct = default);
    Task<IdentityResult> CreateWithPasswordAsync(ApplicationUser user, string password, CancellationToken ct = default);
    Task<IdentityResult> UpdateAsync(ApplicationUser user, CancellationToken ct = default);
    Task<IdentityResult> ChangePasswordAsync(ApplicationUser user, string currentPassword, string newPassword, CancellationToken ct = default);
}