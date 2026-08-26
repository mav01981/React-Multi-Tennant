using System.Text.RegularExpressions;

namespace Identity.Api.Common;

public static class StringHelper
{
    // Log-injection guard (OWASP): caller-supplied Method/Path can carry control
    // characters (raw, or percent-encoded "%0A"/"%0D" that decode before logging)
    // that a log viewer would render as new log entries. Strip the entire C0/C1
    // control range before interpolation into the message, not just CR/LF.
    private static readonly Regex ControlCharRegex = new(
        @"[\u0000-\u001F\u007F\u0080-\u009F]",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static string SanitizeLog(string? value) =>
        value is null ? string.Empty : ControlCharRegex.Replace(value, " ");
}
