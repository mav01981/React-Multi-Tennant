namespace Identity.Api.Common;

/// <summary>Response-header hardening applied to every response.</summary>
public static class SecurityHeadersExtensions
{
    public static IApplicationBuilder UseSecurityHeadersMiddleware(this IApplicationBuilder app)
    {
        app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            // Scalar's documentation UI (/scalar) needs an inline configuration script,
            // which the hardened production CSP below forbids. Serve a permissive policy
            // only for the documentation routes; everything else stays locked down.
            headers["Content-Security-Policy"] =
                context.Request.Path.StartsWithSegments("/scalar") || context.Request.Path.StartsWithSegments("/openapi")
                    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
                      "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
                    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                      "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
            await next();
        });
        return app;
    }
}