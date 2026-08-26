using Identity.Application.Contracts;

namespace Identity.Api.Common;

/// <summary>
/// Centralized mapping of <see cref="UseCaseResult{T}"/> outcomes to HTTP responses,
/// including the standard error envelope with the X-Request-Id echo. Replaces the
/// per-endpoint Error(...) helpers previously duplicated in every endpoint file.
/// </summary>
public static class UseCaseMapping
{
    public static IResult ToHttp<T>(this UseCaseResult<T> result, HttpContext http) =>
        result.IsSuccess ? Success(result, http) : Failure(result.StatusCode, result.ErrorCode!, result.ErrorMessage!, http);

    private static IResult Success<T>(UseCaseResult<T> result, HttpContext http)
    {
        if (result.StatusCode == StatusCodes.Status204NoContent)
            return Results.NoContent();
        return Results.Json(result.Value, statusCode: result.StatusCode);
    }

    public static IResult Failure(int status, string code, string message, HttpContext http)
    {
        var requestId = http.Request.Headers.TryGetValue("X-Request-Id", out var rid) ? rid.ToString() : null;
        return Results.Json(new ApiErrorResponse(new ApiError(code, message, RequestId: requestId)), statusCode: status);
    }
}