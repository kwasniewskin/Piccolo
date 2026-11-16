using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Piccolo.Api.Services;

/// <summary>
/// Normalizacja nazw produktow i zapytan wyszukiwania (lowercase, bez polskich znakow i diakrytykow).
/// </summary>
public static partial class SearchTextHelper
{
    [GeneratedRegex(@"\s+")]
    private static partial Regex MultiSpaceRegex();

    public static string NormalizeForSearch(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return string.Empty;

        var trimmed = MultiSpaceRegex().Replace(input.Trim(), " ");
        var sb = new StringBuilder(trimmed.Length);

        foreach (var ch in trimmed)
        {
            var mapped = ch switch
            {
                'ł' or 'Ł' => 'l',
                _ => ch
            };
            sb.Append(mapped);
        }

        var normalized = sb.ToString().Normalize(NormalizationForm.FormD);
        var clean = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
            {
                clean.Append(char.ToLowerInvariant(ch));
            }
        }

        return clean.ToString().Normalize(NormalizationForm.FormC);
    }

    /// <summary>
    /// Buduje wartosc SearchName z nazwy produktu oraz opcjonalnie marki (bez powielania marki, jesli juz jest w nazwie).
    /// </summary>
    public static string BuildProductSearchName(string? name, string? brand)
    {
        var normName = NormalizeForSearch(name);
        var normBrand = NormalizeForSearch(brand);
        if (string.IsNullOrEmpty(normBrand))
            return normName;
        if (normName.Contains(normBrand, StringComparison.Ordinal))
            return normName;
        return string.IsNullOrEmpty(normName) ? normBrand : $"{normName} {normBrand}";
    }

    public static string[] TokenizeQuery(string? query)
    {
        var norm = NormalizeForSearch(query);
        if (string.IsNullOrEmpty(norm))
            return Array.Empty<string>();
        return norm.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }
}
