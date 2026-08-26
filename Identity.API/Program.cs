using Identity.Api.Common;
using Identity.Api.Data;
using Identity.Api.Endpoints;
using Identity.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── Token service (RS256 signing key, access/refresh TTL) ──────────────
var tokenService = new TokenService(config);
builder.Services.AddSingleton(tokenService);

// ── Persistence (InMemory for the runnable demo; swap for Postgres ──
builder.Services.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase("reactauth"));

// ── ASP.NET Core Identity ───────────────────────────────────────────────
builder.Services
    .AddIdentity<ApplicationUser, ApplicationRole>(options =>
    {
        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);

        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = true;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;

        // Multi-tenancy: email uniqueness is scoped per tenant via a composite
        // (TenantId, NormalizedEmail) unique index in AppDbContext, so Identity's
        // global validator must stay off. Tenant-scoped lookups replace
        // FindByEmailAsync everywhere (see DbSeeder.FindUserInTenantAsync).
        options.User.RequireUniqueEmail = false;
        options.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

// Multi-tenancy: swap Identity's default (globally-unique) user validator for a
// tenant-scoped one — emails/usernames are unique per tenant only.
builder.Services.RemoveAll(typeof(Microsoft.AspNetCore.Identity.IUserValidator<ApplicationUser>));
builder.Services.AddScoped<Microsoft.AspNetCore.Identity.IUserValidator<ApplicationUser>, TenantUserValidator>();

// ── JWT bearer auth ─────────────────────────────────────────────────────
// Note: AddIdentity above wires a cookie scheme as DefaultChallengeScheme.
// We must override all defaults so protected API endpoints return a JSON
// 401 (JWT bearer) instead of a 302 redirect to an Account/Login page.
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultForbidScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = tokenService.Issuer,
            ValidAudience = tokenService.Audience,
            IssuerSigningKey = tokenService.SigningKey,
            ClockSkew = TimeSpan.FromSeconds(config.GetValue("Jwt:ClockSkewSeconds", 30))
        };

        // Surface a JSON error envelope on auth failures.
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
                    new ApiError(ErrorCodes.Unauthenticated, context.ErrorDescription ?? "Authentication required.")));
            },
            OnAuthenticationFailed = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
                    new ApiError(ErrorCodes.Unauthenticated, "Invalid token.")));
            }
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(p => p
        .SetIsOriginAllowed(_ => true) // dev: any origin; restrict in production
        .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
        .WithHeaders("Authorization", "Content-Type", "X-Request-Id"));
});

// ── Rate limiting (auth endpoints → 429 + Retry-After) ─────────────────
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    await DbSeeder.SeedAsync(scope.ServiceProvider, config);
}

app.UseSecurityHeadersMiddleware();

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapUsersEndpoints();
app.MapRolesEndpoints();
app.MapTenantsEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ── Global error envelope for unhandled faults ─────────────────────────
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        var traceId = context.TraceIdentifier;
        logger.LogError(ex, "Unhandled exception for request {Method} {Path} ({TraceId})", context.Request.Method, context.Request.Path, traceId);
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            var requestId = context.Request.Headers.TryGetValue("X-Request-Id", out var rid) ? rid.ToString() : null;
            await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
                new ApiError(ErrorCodes.InternalError, "An unexpected error occurred.", RequestId: requestId)));
        }
        else throw;
    }
});

app.Run();