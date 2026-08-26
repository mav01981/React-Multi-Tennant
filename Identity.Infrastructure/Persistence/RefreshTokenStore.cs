using Identity.Application.Abstractions;
using Identity.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure.Persistence;

/// <summary>
/// EF Core persistence for refresh-token families. Only SHA-256 hashes are stored;
/// lookups eagerly load the family and its sibling tokens so rotation/reuse-detection
/// decisions can be made without extra round-trips.
/// </summary>
public sealed class RefreshTokenStore(AppDbContext db) : IRefreshTokenStore
{
    public async Task<RefreshToken?> FindByTokenHashAsync(string tokenHash, CancellationToken ct = default) =>
        await db.RefreshTokens
            .Include(t => t.Family)
            .ThenInclude(f => f!.Tokens)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

    public async Task AddFamilyAsync(RefreshFamily family, CancellationToken ct = default) =>
        await db.RefreshFamilies.AddAsync(family, ct);

    /// <inheritdoc/>
    public Task AddTokenAsync(RefreshToken token, CancellationToken ct = default)
    {
        db.RefreshTokens.Add(token);
        return Task.CompletedTask;
    }

    /// <summary>Revokes every family/token ever issued to the user (logout / lockout paths).</summary>
    public async Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;

        var families = await db.RefreshFamilies
            .Include(f => f.Tokens)
            .Where(f => f.UserId == userId)
            .ToListAsync(ct);

        foreach (var family in families)
            family.RevokeAll(now);
    }
}