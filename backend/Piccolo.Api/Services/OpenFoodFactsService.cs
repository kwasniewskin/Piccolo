using System.Text.Json;
using System.Text.Json.Serialization;
using Piccolo.Api.Models;

namespace Piccolo.Api.Services;

/// <summary>
/// Serwis do komunikacji z API Open Food Facts.
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

    /// <summary>
    /// Wyszukuje produkty po nazwie w bazie Open Food Facts.
    /// </summary>
    public async Task<List<Product>> SearchByNameAsync(string name)
    {
        try
        {
            var url = $"https://world.openfoodfacts.org/cgi/search.pl?search_terms={Uri.EscapeDataString(name)}&search_simple=1&action=process&json=1&page_size=15&lc=pl";
            var response = await _httpClient.GetAsync(url);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OFF API search returned status {StatusCode}", response.StatusCode);
                return new List<Product>();
            }

            var json = await response.Content.ReadAsStringAsync();
            var searchResult = JsonSerializer.Deserialize<OffSearchResponse>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (searchResult?.Products == null)
            {
                return new List<Product>();
            }

            // Smart Sorting: produkty z dokładnym dopasowaniem nazwy na górze
            var searchTermLower = name.ToLower();
            return searchResult.Products
                .Where(p => !string.IsNullOrWhiteSpace(p.ProductName))
                .Select(MapToProduct)
                .OrderByDescending(p => p.Name.Contains(name, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching Open Food Facts for '{Name}'", name);
            return new List<Product>();
        }
    }

    /// <summary>
    /// Pobiera produkt po kodzie kreskowym z Open Food Facts.
    /// </summary>
    public async Task<Product?> GetByBarcodeAsync(string barcode)
    {
        try
        {
            var url = $"https://world.openfoodfacts.org/api/v2/product/{barcode}?lc=pl";
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
            PackageWeightGrams = offProduct.ProductQuantity,
            DataSource = "OpenFoodFacts"
        };
    }

    #region DTO Classes for Open Food Facts API

    private class OffSearchResponse
    {
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
        public string? Brands { get; set; }

        [JsonPropertyName("image_url")]
        public string? ImageUrl { get; set; }

        [JsonPropertyName("product_quantity")]
        public float? ProductQuantity { get; set; }

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
