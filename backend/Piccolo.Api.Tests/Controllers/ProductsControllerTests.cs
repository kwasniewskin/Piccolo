using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Piccolo.Api.Models;
using Piccolo.Api.Tests.Helpers;

namespace Piccolo.Api.Tests.Controllers;

/// <summary>
/// Integration tests for ProductsController.
/// Uses in-memory SQLite database and mocked authentication.
/// </summary>
public class ProductsControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public ProductsControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    #region POST /api/products - Create Product Tests

    [Fact]
    public async Task CreateProduct_WithValidData_ReturnsCreatedWithGeneratedId()
    {
        // Arrange
        var newProduct = ProductTestHelper.CreateValidProduct($"New Test Product {Guid.NewGuid()}", "1234567890123");

        // Act
        var response = await _client.PostAsJsonAsync("/api/products", newProduct);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var createdProduct = await response.Content.ReadFromJsonAsync<Product>();
        createdProduct.Should().NotBeNull();
        createdProduct!.Id.Should().BeGreaterThan(0);
        createdProduct.Name.Should().StartWith("New Test Product");
        createdProduct.Barcode.Should().Be("1234567890123");
    }

    [Fact]
    public async Task CreateProduct_WithExtendedAiLabelPayload_PersistsAllFieldsAndIsSearchable()
    {
        // Arrange
        var uniqueSuffix = Guid.NewGuid().ToString("N")[..8];
        var payload = new
        {
            name = $"Serek Proteinowy AI {uniqueSuffix}",
            brand = (string?)null,
            manufacturer = "Piątnica",
            barcode = $"590999{uniqueSuffix[..6]}",
            ingredients = "twaróg odtłuszczony, białka mleka",
            caloriesPer100g = 128.0,
            proteinPer100g = 15.5,
            fatPer100g = 5.5,
            carbsPer100g = 4.2,
            saturatedFatPer100g = 3.4f,
            sugarsPer100g = 3.1f,
            fiberPer100g = 0.0f,
            saltPer100g = 0.8f,
            packageWeightGrams = 135.0f,
            defaultServingGrams = 50.0f,
            dataSource = "User"
        };

        // Act
        var createResponse = await _client.PostAsJsonAsync("/api/products", payload);

        // Assert
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await createResponse.Content.ReadFromJsonAsync<Product>();
        created.Should().NotBeNull();
        created!.Manufacturer.Should().Be("Piątnica");
        created.Ingredients.Should().Be("twaróg odtłuszczony, białka mleka");
        created.SaturatedFatPer100g.Should().Be(3.4f);
        created.SugarsPer100g.Should().Be(3.1f);
        created.SaltPer100g.Should().Be(0.8f);
        created.PackageWeightGrams.Should().Be(135.0f);
        created.DataSource.Should().Be("User");

        var searchResponse = await _client.GetAsync($"/api/products/search?name={Uri.EscapeDataString(uniqueSuffix)}");
        searchResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var searchResults = await searchResponse.Content.ReadFromJsonAsync<List<Product>>();
        searchResults.Should().ContainSingle(p => p.Id == created.Id);
    }

    #endregion

    #region GET /api/products/{id} - Get Product Tests

    [Fact]
    public async Task GetProductById_WhenProductExists_ReturnsOkWithProduct()
    {
        // Arrange - create a product first
        var product = ProductTestHelper.CreateValidProduct($"Test Product for GET {Guid.NewGuid()}");
        var createResponse = await _client.PostAsJsonAsync("/api/products", product);
        var createdProduct = await createResponse.Content.ReadFromJsonAsync<Product>();

        // Act
        var response = await _client.GetAsync($"/api/products/{createdProduct!.Id}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var retrievedProduct = await response.Content.ReadFromJsonAsync<Product>();
        retrievedProduct.Should().NotBeNull();
        retrievedProduct!.Id.Should().Be(createdProduct.Id);
    }

    [Fact]
    public async Task GetProductById_WhenProductDoesNotExist_ReturnsNotFound()
    {
        // Arrange
        var nonExistentId = 999999;

        // Act
        var response = await _client.GetAsync($"/api/products/{nonExistentId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region PUT /api/products/{id} - Update Product Tests

    [Fact]
    public async Task UpdateProduct_WhenProductExists_ReturnsOkWithUpdatedProduct()
    {
        // Arrange - create a product first
        var product = ProductTestHelper.CreateValidProduct($"Original Product {Guid.NewGuid()}");
        var createResponse = await _client.PostAsJsonAsync("/api/products", product);
        var createdProduct = await createResponse.Content.ReadFromJsonAsync<Product>();

        var updatedProduct = ProductTestHelper.CreateValidProduct("Updated Product", "1111111111111");
        updatedProduct.CaloriesPer100g = 999;

        // Act
        var response = await _client.PutAsJsonAsync($"/api/products/{createdProduct!.Id}", updatedProduct);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var result = await response.Content.ReadFromJsonAsync<Product>();
        result.Should().NotBeNull();
        result!.Name.Should().Be("Updated Product");
        result.CaloriesPer100g.Should().Be(999);
    }

    [Fact]
    public async Task UpdateProduct_WhenProductDoesNotExist_ReturnsNotFound()
    {
        // Arrange
        var nonExistentId = 999999;
        var updateData = ProductTestHelper.CreateValidProduct("Non-existent Product");

        // Act
        var response = await _client.PutAsJsonAsync($"/api/products/{nonExistentId}", updateData);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region DELETE /api/products/{id} - Delete Product Tests

    [Fact]
    public async Task DeleteProduct_WhenProductExists_ReturnsNoContent()
    {
        // Arrange - create a product first
        var product = ProductTestHelper.CreateValidProduct($"Product to Delete {Guid.NewGuid()}");
        var createResponse = await _client.PostAsJsonAsync("/api/products", product);
        var createdProduct = await createResponse.Content.ReadFromJsonAsync<Product>();

        // Act
        var response = await _client.DeleteAsync($"/api/products/{createdProduct!.Id}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        
        // Verify product is deleted
        var getResponse = await _client.GetAsync($"/api/products/{createdProduct.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteProduct_WhenProductDoesNotExist_ReturnsNotFound()
    {
        // Arrange
        var nonExistentId = 999999;

        // Act
        var response = await _client.DeleteAsync($"/api/products/{nonExistentId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region GET /api/products/search - Search Products Tests

    [Fact]
    public async Task SearchProducts_WithMatchingName_ReturnsMatchingProducts()
    {
        // Arrange - create test products with unique identifier
        var uniqueId = Guid.NewGuid().ToString().Substring(0, 8);
        var product1 = ProductTestHelper.CreateValidProduct($"UniqueTestMilk_{uniqueId}_Chocolate");
        var product2 = ProductTestHelper.CreateValidProduct($"UniqueTestMilk_{uniqueId}_Vanilla");
        var product3 = ProductTestHelper.CreateValidProduct($"Orange Juice {uniqueId}");
        
        await _client.PostAsJsonAsync("/api/products", product1);
        await _client.PostAsJsonAsync("/api/products", product2);
        await _client.PostAsJsonAsync("/api/products", product3);

        // Act
        var response = await _client.GetAsync($"/api/products/search?name=UniqueTestMilk_{uniqueId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var results = await response.Content.ReadFromJsonAsync<List<Product>>();
        results.Should().NotBeNull();
        results!.Should().HaveCount(2);
        results.Should().Contain(p => p.Name.Contains("Chocolate"));
        results.Should().Contain(p => p.Name.Contains("Vanilla"));
    }

    [Fact]
    public async Task SearchProducts_WithNoMatches_ReturnsEmptyList()
    {
        // Arrange
        var uniqueSearchTerm = Guid.NewGuid().ToString();

        // Act
        var response = await _client.GetAsync($"/api/products/search?name={uniqueSearchTerm}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var results = await response.Content.ReadFromJsonAsync<List<Product>>();
        results.Should().NotBeNull();
        results!.Should().BeEmpty();
    }

    #endregion

    #region POST /api/products/import - Import Product Tests

    [Fact]
    public async Task ImportProduct_WithNewBarcode_ReturnsCreatedWithProduct()
    {
        // Arrange
        var uniqueBarcode = $"5555{DateTime.Now.Ticks % 100000000}";
        var productToImport = ProductTestHelper.CreateValidProduct($"Imported Product {Guid.NewGuid()}", uniqueBarcode);

        // Act
        var response = await _client.PostAsJsonAsync("/api/products/import", productToImport);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var importedProduct = await response.Content.ReadFromJsonAsync<Product>();
        importedProduct.Should().NotBeNull();
        importedProduct!.Id.Should().BeGreaterThan(0);
        importedProduct.Barcode.Should().Be(uniqueBarcode);
    }

    [Fact]
    public async Task ImportProduct_WithExistingBarcode_ReturnsConflict()
    {
        // Arrange
        var uniqueBarcode = $"7777{DateTime.Now.Ticks % 100000000}";
        var existingProduct = ProductTestHelper.CreateValidProduct($"Existing Import {Guid.NewGuid()}", uniqueBarcode);
        await _client.PostAsJsonAsync("/api/products/import", existingProduct);

        var duplicateImport = ProductTestHelper.CreateValidProduct($"Duplicate Import {Guid.NewGuid()}", uniqueBarcode);

        // Act
        var response = await _client.PostAsJsonAsync("/api/products/import", duplicateImport);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    #endregion
}
