using System.Text.Json;
using System.Text.Json.Serialization;
using Piccolo.Api.Models;

namespace Piccolo.Api.Services;

/// <summary>
/// Client service for the Open Food Facts REST API.
/// </summary>
public class OpenFoodFactsService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<OpenFoodFactsService> _logger;

    public OpenFoodFactsService(HttpClient httpClient, ILogger<OpenFoodFactsService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    private static string NormalizeLanguage(string? lang) =>
        string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "pl";

    /// <summary>
    /// Searches for products by name in the Open Food Facts catalog.
    /// Queries the fast Search-a-licious API first and falls back to legacy cgi/search.pl if needed.
    /// </summary>
    public virtual async Task<List<Product>> SearchByNameAsync(string name, string lang = "pl")
    {
        try
        {
            var lc = NormalizeLanguage(lang);
            var urls = new[]
            {
                $"https://search.openfoodfacts.org/search?q={Uri.EscapeDataString(name)}&page_size=15&langs={lc}",
                $"https://world.openfoodfacts.org/cgi/search.pl?search_terms={Uri.EscapeDataString(name)}&search_simple=1&action=process&json=1&page_size=15&lc={lc}",
            };

            foreach (var url in urls)
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.UserAgent.ParseAdd("PiccoloNutritionTracker/1.0");
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("OFF API search ({Url}) returned status {StatusCode}", url, response.StatusCode);
                    continue;
                }

                var json = await response.Content.ReadAsStringAsync();
                var searchResult = JsonSerializer.Deserialize<OffSearchResponse>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                var items = searchResult?.Hits ?? searchResult?.Products;
                if (items == null || items.Count == 0)
                {
                    continue;
                }

                // Smart sorting: prioritize products containing an exact substring match
                return items
                    .Where(p => !string.IsNullOrWhiteSpace(p.ProductName))
                    .Select(MapToProduct)
                    .OrderByDescending(p => p.Name.Contains(name, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            return new List<Product>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching Open Food Facts for '{Name}'", name);
            return new List<Product>();
        }
    }

    /// <summary>
    /// Fetches a product by barcode from Open Food Facts.
    /// </summary>
    public virtual async Task<Product?> GetByBarcodeAsync(string barcode, string lang = "pl")
    {
        try
        {
            var lc = NormalizeLanguage(lang);
            var url = $"https://world.openfoodfacts.org/api/v2/product/{barcode}?lc={lc}";
            var response = await _httpClient.GetAsync(url);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OFF API barcode lookup returned status {StatusCode}", response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            var barcodeResult = JsonSerializer.Deserialize<OffBarcodeResponse>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (barcodeResult?.Product == null || string.IsNullOrWhiteSpace(barcodeResult.Product.ProductName))
            {
                return null;
            }

            return MapToProduct(barcodeResult.Product);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching barcode '{Barcode}' from Open Food Facts", barcode);
            return null;
        }
    }

    private Product MapToProduct(OffProduct offProduct)
    {
        return new Product
        {
            Name = offProduct.ProductName ?? "Unknown Product",
            Barcode = offProduct.Code,
            Brand = offProduct.Brands,
            ImageUrl = offProduct.ImageUrl,
            CaloriesPer100g = offProduct.Nutriments?.EnergyKcal100g ?? 0,
            ProteinPer100g = offProduct.Nutriments?.Proteins100g ?? 0,
            FatPer100g = offProduct.Nutriments?.Fat100g ?? 0,
            CarbsPer100g = offProduct.Nutriments?.Carbohydrates100g ?? 0,
            SaturatedFatPer100g = offProduct.Nutriments?.SaturatedFat100g,
            SugarsPer100g = offProduct.Nutriments?.Sugars100g,
            FiberPer100g = offProduct.Nutriments?.Fiber100g,
            SaltPer100g = offProduct.Nutriments?.Salt100g,
            PackageWeightGrams = offProduct.ProductQuantity is > 0 ? offProduct.ProductQuantity : null,
            DefaultServingGrams = offProduct.ServingQuantity is > 0 ? offProduct.ServingQuantity : null,
            DataSource = "OpenFoodFacts"
        };
    }

    /// <summary>
    /// OFF returns quantity fields either as numbers (250) or strings ("250" or "16,7").
    /// Accepts both formats and yields null for unparseable values.
    /// </summary>
    private class FlexibleFloatConverter : JsonConverter<float?>
    {
        public override float? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Number:
                    return reader.TryGetSingle(out var number) ? number : null;
                case JsonTokenType.String:
                    var text = reader.GetString()?.Trim().Replace(',', '.');
                    return float.TryParse(text, System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
                default:
                    reader.Skip();
                    return null;
            }
        }

        public override void Write(Utf8JsonWriter writer, float? value, JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteNumberValue(value.Value);
            else writer.WriteNullValue();
        }
    }

    /// <summary>
    /// OFF returns brands either as a comma-separated string or a string array depending on the API version.
    /// Normalizes both shapes into a nullable string.
    /// </summary>
    private class FlexibleBrandsConverter : JsonConverter<string?>
    {
        public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.String:
                    return reader.GetString();
                case JsonTokenType.StartArray:
                    var list = new List<string>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
                    {
                        if (reader.TokenType == JsonTokenType.String)
                        {
                            var val = reader.GetString()?.Trim();
                            if (!string.IsNullOrEmpty(val)) list.Add(val);
                        }
                    }
                    return list.Count > 0 ? string.Join(", ", list) : null;
                default:
                    reader.Skip();
                    return null;
            }
        }

        public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options)
        {
            if (value != null) writer.WriteStringValue(value);
            else writer.WriteNullValue();
        }
    }

    #region DTO Classes for Open Food Facts API

    private class OffSearchResponse
    {
        [JsonPropertyName("hits")]
        public List<OffProduct>? Hits { get; set; }

        [JsonPropertyName("products")]
        public List<OffProduct>? Products { get; set; }
    }

    private class OffBarcodeResponse
    {
        [JsonPropertyName("product")]
        public OffProduct? Product { get; set; }
    }

    private class OffProduct
    {
        [JsonPropertyName("product_name")]
        public string? ProductName { get; set; }

        [JsonPropertyName("code")]
        public string? Code { get; set; }

        [JsonPropertyName("brands")]
        [JsonConverter(typeof(FlexibleBrandsConverter))]
        public string? Brands { get; set; }

        [JsonPropertyName("image_url")]
        public string? ImageUrl { get; set; }

        [JsonPropertyName("product_quantity")]
        [JsonConverter(typeof(FlexibleFloatConverter))]
        public float? ProductQuantity { get; set; }

        [JsonPropertyName("serving_quantity")]
        [JsonConverter(typeof(FlexibleFloatConverter))]
        public float? ServingQuantity { get; set; }

        [JsonPropertyName("nutriments")]
        public OffNutriments? Nutriments { get; set; }
    }

    private class OffNutriments
    {
        [JsonPropertyName("energy-kcal_100g")]
        public double? EnergyKcal100g { get; set; }

        [JsonPropertyName("proteins_100g")]
        public double? Proteins100g { get; set; }

        [JsonPropertyName("fat_100g")]
        public double? Fat100g { get; set; }

        [JsonPropertyName("carbohydrates_100g")]
        public double? Carbohydrates100g { get; set; }

        [JsonPropertyName("saturated-fat_100g")]
        public float? SaturatedFat100g { get; set; }

        [JsonPropertyName("sugars_100g")]
        public float? Sugars100g { get; set; }

        [JsonPropertyName("fiber_100g")]
        public float? Fiber100g { get; set; }

        [JsonPropertyName("salt_100g")]
        public float? Salt100g { get; set; }
    }

    #endregion
}
