using Identity.Api.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Identity.Api.UnitTests;

/// <summary>Verifies the security response-header hardening middleware writes the expected headers.</summary>
public class SecurityHeadersTests
{
    /// <summary>Builds the middleware pipeline and returns the invoked response context.</summary>
    private static async Task<HttpContext> RunPipelineAsync(string path)
    {
        // Arrange: pipeline = security-headers middleware → terminal handler.
        var builder = new ApplicationBuilder(new ServiceCollection().BuildServiceProvider());
        builder.UseSecurityHeadersMiddleware();
        builder.Run(async context =>
        {
            context.Response.StatusCode = StatusCodes.Status200OK;
            await context.Response.WriteAsync("ok");
        });
        var pipeline = builder.Build();

        var http = new DefaultHttpContext
        {
            Request = { Path = path },
            Response = { Body = new MemoryStream() },
        };

        // Act
        await pipeline(http);
        return http;
    }

    [Theory]
    [InlineData("/api/v1/auth/login")]
    [InlineData("/health")]
    public async Task Applies_All_Security_Headers(string path)
    {
        // Arrange + Act
        var ctx = await RunPipelineAsync(path);

        // Assert
        Assert.Equal("nosniff", ctx.Response.Headers["X-Content-Type-Options"]);
        Assert.Equal("DENY", ctx.Response.Headers["X-Frame-Options"]);
        Assert.Equal("no-referrer", ctx.Response.Headers["Referrer-Policy"]);
        Assert.Contains("camera=()", (string?)ctx.Response.Headers["Permissions-Policy"]);
        Assert.Contains("default-src 'self'", (string?)ctx.Response.Headers["Content-Security-Policy"]);
        Assert.Equal(StatusCodes.Status200OK, ctx.Response.StatusCode);
    }
}