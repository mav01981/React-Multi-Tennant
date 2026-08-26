using Microsoft.AspNetCore.Identity;

namespace Identity.Domain.Entities;

public class ApplicationRole : IdentityRole<Guid>
{
    public ApplicationRole() { }
    public ApplicationRole(string name) : base(name) { }

    /// <summary>The tenant that owns this role. Role names are unique within a tenant.</summary>
    public Guid TenantId { get; set; }
}