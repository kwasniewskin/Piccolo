using Microsoft.Extensions.Logging;
using Piccolo.Api.Models;
using Piccolo.Api.Services;

namespace Piccolo.Api.Tests.Helpers;

/// <summary>
/// Mock implementation of OpenFoodFactsService for testing.
/// Returns predictable test data instead of making real API calls.
/// </summary>
public class MockOpenFoodFactsService : OpenFoodFactsService
{
    public MockOpenFoodFactsService(HttpClient httpClient, ILogger<OpenFoodFactsService> logger) 
        : base(httpClient, logger)
    {
    }

    /// <summary>
    /// Mock implementation - returns empty list to avoid external API calls.
    /// </summary>
    public override Task<List<Product>> SearchByNameAsync(string name, string lang = "pl")
    {
        return Task.FromResult(new List<Product>());
    }

    /// <summary>
    /// Mock implementation - returns null to avoid external API calls.
    /// </summary>
    public override Task<Product?> GetByBarcodeAsync(string barcode, string lang = "pl")
    {
        return Task.FromResult<Product?>(null);
    }
}
