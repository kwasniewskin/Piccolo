using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Piccolo.Api.Models;
using Piccolo.Api.Tests.Helpers;
using Xunit;

namespace Piccolo.Api.Tests.Controllers;

/// <summary>
/// Testy jednostek produktu (ProductUnits), zapisu jednostki we wpisie dziennika
/// i endpointu historii użycia (GET /api/diary/product-usage/{productId}).
/// </summary>
public class ServingUnitsTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;

    public ServingUnitsTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _jsonOptions = JsonHelper.GetApiJsonOptions();
        TestAuthHandler.SwitchToUser1();
    }

    private async Task<Product> CreateProductAsync(params (string key, float grams)[] units)
    {
        var product = ProductTestHelper.CreateValidProduct($"Units Product {Guid.NewGuid()}");
        foreach (var (key, grams) in units)
        {
            product.Units.Add(new ProductUnit { UnitKey = key, GramsPerUnit = grams });
        }
        var response = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<Product>(_jsonOptions))!;
    }

    private Task<HttpResponseMessage> AddEntryAsync(int productId, string unitKey, double quantity, double grams, string date)
    {
        var dto = DiaryEntryTestHelper.CreateValidEntryDto(productId, grams, date, MealType.Lunch);
        dto.UnitKey = unitKey;
        dto.UnitQuantity = quantity;
        return _client.PostAsJsonAsync("/api/diary", dto, _jsonOptions);
    }

    #region ProductUnits

    [Fact]
    public async Task CreateProduct_WithUnits_ReturnsUnitsOnGet()
    {
        var created = await CreateProductAsync(("slice", 16.7f), ("tbsp", 25f));

        var response = await _client.GetAsync($"/api/products/{created.Id}");
        var product = await response.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        product!.Units.Should().HaveCount(2);
        product.Units.Should().Contain(u => u.UnitKey == "slice" && Math.Abs(u.GramsPerUnit - 16.7f) < 0.001);
        product.Units.Should().Contain(u => u.UnitKey == "tbsp" && u.GramsPerUnit == 25f);
    }

    [Theory]
    [InlineData("slice", 0f)]    // waga musi być > 0
    [InlineData("slice", -5f)]
    [InlineData("", 100f)]       // nazwa jednostki nie może być pusta
    public async Task CreateProduct_WithInvalidUnit_ReturnsBadRequest(string unitKey, float grams)
    {
        var product = ProductTestHelper.CreateValidProduct($"Invalid Unit {Guid.NewGuid()}");
        product.Units.Add(new ProductUnit { UnitKey = unitKey, GramsPerUnit = grams });

        var response = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreateProduct_WithDuplicateUnit_ReturnsBadRequest()
    {
        var product = ProductTestHelper.CreateValidProduct($"Duplicate Unit {Guid.NewGuid()}");
        product.Units.Add(new ProductUnit { UnitKey = "slice", GramsPerUnit = 10f });
        product.Units.Add(new ProductUnit { UnitKey = "slice", GramsPerUnit = 12f });

        var response = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task UpdateProduct_ReplacesUnits()
    {
        var created = await CreateProductAsync(("slice", 16.7f), ("tbsp", 25f));

        var update = ProductTestHelper.CreateValidProduct(created.Name);
        update.Units.Add(new ProductUnit { UnitKey = "piece", GramsPerUnit = 60f });

        var response = await _client.PutAsJsonAsync($"/api/products/{created.Id}", update, _jsonOptions);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var fetched = await (await _client.GetAsync($"/api/products/{created.Id}"))
            .Content.ReadFromJsonAsync<Product>(_jsonOptions);
        fetched!.Units.Should().ContainSingle(u => u.UnitKey == "piece" && u.GramsPerUnit == 60f);
    }

    #endregion

    #region DiaryEntry UnitKey / UnitQuantity

    [Fact]
    public async Task CreateDiaryEntry_WithUnit_PersistsUnitKeyAndQuantity()
    {
        var product = await CreateProductAsync();

        var response = await AddEntryAsync(product.Id, "portion", 3, 300, "2026-11-01");

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var entry = await response.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);
        entry!.UnitKey.Should().Be("portion");
        entry.UnitQuantity.Should().Be(3);
        entry.AmountInGrams.Should().Be(300);
    }

    [Fact]
    public async Task CreateDiaryEntry_WithUnitKeyButNoQuantity_ReturnsBadRequest()
    {
        var product = await CreateProductAsync();
        var dto = DiaryEntryTestHelper.CreateValidEntryDto(product.Id, 100, "2026-11-01");
        dto.UnitKey = "portion";

        var response = await _client.PostAsJsonAsync("/api/diary", dto, _jsonOptions);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    #endregion

    #region GET /api/diary/product-usage/{productId}

    [Fact]
    public async Task GetProductUsage_WithoutHistory_ReturnsEmpty()
    {
        var product = await CreateProductAsync();

        var response = await _client.GetAsync($"/api/diary/product-usage/{product.Id}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var usage = await response.Content.ReadFromJsonAsync<ProductUsageDto>(_jsonOptions);
        usage!.Recent.Should().BeEmpty();
        usage.MostUsed.Should().BeNull();
    }

    [Fact]
    public async Task GetProductUsage_ReturnsTwoRecentDistinctAndMostUsedUnit()
    {
        var product = await CreateProductAsync(("slice", 16.7f));

        // Od najstarszego do najnowszego. "portion" 4 razy, "g" 1 raz, "slice" 1 raz.
        await AddEntryAsync(product.Id, "portion", 1, 100, "2026-11-01");
        await AddEntryAsync(product.Id, "portion", 3, 300, "2026-11-02");
        await AddEntryAsync(product.Id, "g", 50, 50, "2026-11-03");
        await AddEntryAsync(product.Id, "portion", 2, 200, "2026-11-04");
        await AddEntryAsync(product.Id, "portion", 2, 200, "2026-11-05"); // ta sama kombinacja co wyżej
        await AddEntryAsync(product.Id, "slice", 2, 33.4, "2026-11-06");

        var usage = await (await _client.GetAsync($"/api/diary/product-usage/{product.Id}"))
            .Content.ReadFromJsonAsync<ProductUsageDto>(_jsonOptions);

        usage!.Recent.Should().HaveCount(2);
        usage.Recent[0].UnitKey.Should().Be("slice");
        usage.Recent[0].Quantity.Should().Be(2);
        usage.Recent[1].UnitKey.Should().Be("portion");
        usage.Recent[1].Quantity.Should().Be(2);

        usage.MostUsed.Should().NotBeNull();
        usage.MostUsed!.UnitKey.Should().Be("portion");
        usage.MostUsed.Quantity.Should().Be(2); // ostatnio wpisana ilość w tej jednostce
    }

    [Fact]
    public async Task GetProductUsage_ForUnconnectedUser_ReturnsForbidden()
    {
        var product = await CreateProductAsync();

        var response = await _client.GetAsync($"/api/diary/product-usage/{product.Id}?targetUserId=999999");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    #endregion
}
