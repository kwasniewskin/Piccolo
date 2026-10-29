using Piccolo.Api.Models;

namespace Piccolo.Api.Tests.Helpers;

/// <summary>
/// Helper class for creating test product objects.
/// </summary>
public static class ProductTestHelper
{
    /// <summary>
    /// Creates a valid test product with all required fields.
    /// </summary>
    public static Product CreateValidProduct(string name = "Test Product", string? barcode = null)
    {
        return new Product
        {
            Name = name,
            Barcode = barcode,
            CaloriesPer100g = 250,
            ProteinPer100g = 10.5,
            FatPer100g = 15.2,
            CarbsPer100g = 20.8,
            SaturatedFatPer100g = 5.5f,
            SugarsPer100g = 8.2f,
            FiberPer100g = 3.1f,
            SaltPer100g = 1.2f,
            Brand = "Test Brand",
            Manufacturer = "Test Manufacturer",
            PackageWeightGrams = 500f,
            DefaultServingGrams = 100f,
            Ingredients = "Test ingredients",
            DataSource = "Test"
        };
    }

    /// <summary>
    /// Creates a minimal product with only required fields.
    /// </summary>
    public static Product CreateMinimalProduct(string name = "Minimal Product")
    {
        return new Product
        {
            Name = name,
            CaloriesPer100g = 0,
            ProteinPer100g = 0,
            FatPer100g = 0,
            CarbsPer100g = 0
        };
    }
}
