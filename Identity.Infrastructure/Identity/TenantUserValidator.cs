using Identity.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Identity;

/// <summary>
/// Tenant-scoped replacement for Identity's default <c>UserValidator</c>.
/// The stock validator enforces *globally* unique UserName/NormalizedEmail, which
/// contradicts per-tenant email uniqueness. This validator checks
/// that neither the normalized username nor the normalized email collides with
/// another account **within the same tenant only**.
/// </summary>
public class TenantUserValidator : IUserValidator<ApplicationUser>
{
    public Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user)
        => ValidateAsync(manager, user, default);

    public async Task<IdentityResult> ValidateAsync(
        UserManager<ApplicationUser> manager, ApplicationUser user, CancellationToken ct)
    {
        var errors = new List<IdentityError>();

        if (string.IsNullOrWhiteSpace(user.UserName))
        {
            errors.Add(new IdentityError { Code = "InvalidUserName", Description = "Username is required." });
        }
        else
        {
            var normalizedUserName = manager.NormalizeName(user.UserName);
            var taken = await manager.Users.AnyAsync(u =>
                u.TenantId == user.TenantId && u.Id != user.Id && u.NormalizedUserName == normalizedUserName, ct);
            if (taken)
                errors.Add(new IdentityError { Code = "DuplicateUserName", Description = $"Username '{user.UserName}' is already taken in this workspace." });
        }

        if (!string.IsNullOrWhiteSpace(user.Email))
        {
            var normalizedEmail = manager.NormalizeEmail(user.Email);
            var taken = await manager.Users.AnyAsync(u =>
                u.TenantId == user.TenantId && u.Id != user.Id && u.NormalizedEmail == normalizedEmail, ct);
            if (taken)
                errors.Add(new IdentityError { Code = "DuplicateEmail", Description = $"Email '{user.Email}' is already taken in this workspace." });
        }

        return errors.Count > 0 ? IdentityResult.Failed(errors.ToArray()) : IdentityResult.Success;
    }
}