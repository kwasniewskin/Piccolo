using System.Text.Json;
using System.Text.Json.Serialization;

namespace Piccolo.Api.Tests.Helpers;

/// <summary>
/// Provides consistent JSON serialization options for tests that match the API configuration.
/// </summary>
public static class JsonHelper
{
    /// <summary>
    /// Gets JsonSerializerOptions configured to match the API:
    /// - Enum values are serialized as kebab-case strings
    /// - Property names are camelCase
    /// </summary>
    public static JsonSerializerOptions GetApiJsonOptions()
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters =
            {
                new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower)
            }
        };
    }
}
