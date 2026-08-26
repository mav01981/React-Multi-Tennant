using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using Identity.Domain;

namespace Identity.Application.UseCases;

/// <summary>Read-only role catalog for the caller's tenant (adding/editing roles is out of v1 scope).</summary>
public sealed class RoleUseCases(IRoleCatalog roles)
{
    public async Task<UseCaseResult<IReadOnlyList<RoleDto>>> ListAsync(Guid tenantId)
    {
        var catalog = await roles.ListForTenantAsync(tenantId);
        var dtos = catalog
            .Select(r => new RoleDto(r.Id.ToString(), r.Name, Permissions.For(r.Name).ToArray()))
            .ToArray();
        return UseCaseResult<IReadOnlyList<RoleDto>>.Ok(dtos);
    }
}