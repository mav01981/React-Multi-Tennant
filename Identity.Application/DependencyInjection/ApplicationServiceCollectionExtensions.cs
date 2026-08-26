using Identity.Application.UseCases;
using Microsoft.Extensions.DependencyInjection;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Registers the Application-layer use-case handlers. They depend only on ports
/// (repositories/stores/identity services), which Infrastructure implements — so this
/// layer stays free of EF Core and ASP.NET Identity dependencies.
/// </summary>
public static class ApplicationServiceCollectionExtensions
{
    public static IServiceCollection AddApplicationUseCases(this IServiceCollection services)
    {
        services.AddScoped<AuthUseCases>();
        services.AddScoped<ProfileUseCases>();
        services.AddScoped<UserAdminUseCases>();
        services.AddScoped<TenantAdminUseCases>();
        services.AddScoped<RoleUseCases>();
        return services;
    }
}