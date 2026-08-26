using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Composition-root helper that wires the Infrastructure layer into DI:
/// EF Core persistence and the tenant-scoped Identity store/validator.
/// The token provider (RS256/refresh) is constructed by the API composition root,
/// which must also be registered against <see cref="ITokenProvider"/>.
/// </summary>
public static class InfrastructureServiceCollectionExtensions
{
    /// <summary>
    /// Registers persistence (EF Core) and the tenant-scoped Identity validator.
    /// Identity + EF Core stores must be registered by the caller
    /// (AddIdentity/AddIdentityCore) so <see cref="UserManager{TUser}"/> and friends
    /// can be resolved; this extension fills in the multi-tenancy-aware parts.
    /// </summary>
    public static IServiceCollection AddIdentityInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        // ── Persistence (InMemory for the runnable demo; swap for Postgres) ──
        services.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase("reactauth"));

        // Multi-tenancy: swap Identity's default (globally-unique) user validator for a
        // tenant-scoped one — emails/usernames are unique per tenant only.
        services.RemoveAll(typeof(IUserValidator<ApplicationUser>));
        services.AddScoped<IUserValidator<ApplicationUser>, TenantUserValidator>();

        // ── Application ports implemented over EF Core / Identity ──
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<ITenantRepository, TenantRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRefreshTokenStore, RefreshTokenStore>();
        services.AddScoped<IUserAccountService, UserAccountService>();
        services.AddScoped<IRoleCatalog, RoleCatalog>();
        services.AddScoped<IPermissionChecker, PermissionChecker>();

        return services;
    }

    /// <summary>
    /// Registers the RS256/refresh <see cref="TokenService"/> as both the concrete
    /// singleton (for auth config that needs the signing key) and the
    /// <see cref="ITokenProvider"/> port consumed by the endpoint layer.
    /// </summary>
    public static IServiceCollection AddTokenProvider(this IServiceCollection services, IConfiguration config)
    {
        var tokens = new TokenService(config);
        services.AddSingleton(tokens);
        services.AddSingleton<ITokenProvider>(tokens);
        return services;
    }
}