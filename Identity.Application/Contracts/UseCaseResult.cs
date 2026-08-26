namespace Identity.Application.Contracts;

/// <summary>
/// Outcome of a use-case handler. Carries either the success value (with its HTTP
/// status code) or a structured failure (status + API error code + message), so the
/// presentation layer only maps the result — never makes domain decisions.
/// </summary>
public sealed class UseCaseResult<T>
{
    private UseCaseResult(T? value, int statusCode, string? errorCode, string? errorMessage)
    {
        Value = value;
        StatusCode = statusCode;
        ErrorCode = errorCode;
        ErrorMessage = errorMessage;
    }

    public T? Value { get; }
    public int StatusCode { get; }
    public string? ErrorCode { get; }
    public string? ErrorMessage { get; }
    public bool IsSuccess => ErrorCode is null;

    public static UseCaseResult<T> Ok(T value, int statusCode = 200) =>
        new(value, statusCode, null, null);

    /// <summary>A 204-style outcome carrying no payload.</summary>
    public static UseCaseResult<T> NoContent() => new(default, 204, null, null);

    public static UseCaseResult<T> Fail(int statusCode, string code, string message) =>
        new(default, statusCode, code, message);
}

/// <summary>Zero-width success marker for handlers that return no body.</summary>
public sealed record Unit
{
    public static readonly Unit Instance = new();
}

/// <summary>Authenticated caller identity resolved from the Bearer token claims.</summary>
public readonly record struct CallerInfo(Guid UserId, Guid TenantId)
{
    /// <summary>Caller from an unauthenticated flow (login/refresh) — no user context.</summary>
    public static readonly CallerInfo Anonymous = default;

    public bool IsEmpty => UserId == Guid.Empty;
}

/// <summary>Paging/filter/sort request for the tenant-scoped user list.</summary>
public record UserListRequest(
    int Page,
    int PageSize,
    string? Search,
    string? Role,
    string? Status,
    string SortBy,
    string SortDir);