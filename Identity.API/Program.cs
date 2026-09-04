using Identity.Api.Common;
using static Identity.Api.Common.StringHelper;
using Identity.Api.Endpoints;
using Identity.Application.Abstractions;
using Identity.Application.Contracts;
using Identity.Domain.Entities;
using Identity.Infrastructure.Identity;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── Token service (RS256 signing key, access/refresh TTL) ──────────────
// Constructed here (composition root) so the JWT bearer config below can use its
// concrete signing key before the DI container is built. It is registered both as
// the concrete singleton and as the ITokenProvider port consumed by endpoints.
var tokenService = new TokenService(config);
builder.Services.AddSingleton(tokenService);
builder.Services.AddSingleton<ITokenProvider>(tokenService);

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

// Multi-tenancy persistence (EF Core) + tenant-scoped identity validator.
builder.Services.AddIdentityInfrastructure(config);

// Application-layer use-case handlers (business rules live here, not in endpoints).
builder.Services.AddApplicationUseCases();

// ── JWT bearer auth ─────────────────────────────────────────────────────
// Note: AddIdentity above wires a cookie scheme as DefaultChallengeScheme.
// We must override all defaults so protected endpoints return a JSON
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

        // Surface a JSON error envelope on auth failures. All 401s flow through
        // OnChallenge: the JWT bearer handler triggers it both when no credentials are
        // present AND when a presented token fails validation (the failed-token path
        // surfaces via AuthenticateFailure). We must NOT also write a response in
        // OnAuthenticationFailed — doing so double-writes to the response (a 401 + body
        // already on the wire), which resets the connection / yields a 500 instead of a
        // clean JSON 401.
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
                    new ApiError(ErrorCodes.Unauthenticated,
                        context.AuthenticateFailure is not null ? "Invalid token." : "Authentication required.")));
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
// Dev gets a higher permit limit: E2E suites perform many logins plus a silent
// /auth/refresh on every boot, which would exhaust a production-sized budget
// within the fixed window and fail tests with 429.
var authPermitLimit = builder.Environment.IsDevelopment() ? 100 : 20;
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = authPermitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst
            }));
});
// ── OpenAPI document generation (consumed by the Scalar reference UI) ──
builder.Services.AddOpenApi();

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

// ── API documentation (non-production only) ────────────────────────────
// GET /openapi/v1.json  → machine-readable OpenAPI document
// GET /scalar           → interactive Scalar API reference UI
if (!app.Environment.IsProduction())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.Title = "Identity.API";
    });
}

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
        logger.LogError(ex, "Unhandled exception for request {Method} {Path} ({TraceId})",
            SanitizeLog(context.Request.Method),
            SanitizeLog(context.Request.Path.Value),
            traceId);
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