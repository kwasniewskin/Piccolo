using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Piccolo.Api.Models;
using Piccolo.Api.Tests.Helpers;
using Xunit;

namespace Piccolo.Api.Tests.Controllers;

public class DiaryControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;

    public DiaryControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _jsonOptions = JsonHelper.GetApiJsonOptions();
        TestAuthHandler.SwitchToUser1(); // Default to User 1
    }

    #region POST /api/diary - Create Diary Entry Tests

    [Fact]
    public async Task CreateDiaryEntry_WithValidProductId_ReturnsCreatedEntry()
    {
        // Arrange
        var product = ProductTestHelper.CreateValidProduct($"Integration Test Product {Guid.NewGuid()}");
        var createProductResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await createProductResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        var diaryEntryDto = DiaryEntryTestHelper.CreateValidEntryDto(
            createdProduct!.Id, 
            150, 
            "2026-10-29", 
            MealType.Lunch);

        // Act
        var response = await _client.PostAsJsonAsync("/api/diary", diaryEntryDto, _jsonOptions);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var createdEntry = await response.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);
        createdEntry.Should().NotBeNull();
        createdEntry!.ProductId.Should().Be(createdProduct.Id);
        createdEntry.AmountInGrams.Should().Be(150);
        createdEntry.MealType.Should().Be(MealType.Lunch);
        createdEntry.Product.Should().NotBeNull();
        createdEntry.Product!.Name.Should().Be(product.Name);
    }

    [Fact]
    public async Task CreateDiaryEntry_WithCustomEntry_ReturnsCreatedCustomEntry()
    {
        // Arrange
        var customEntryDto = DiaryEntryTestHelper.CreateCustomEntryDto(
            "Homemade Smoothie",
            250,
            12.3f,
            8.9f,
            45.5f,
            "2026-10-29",
            MealType.Breakfast);

        // Act
        var response = await _client.PostAsJsonAsync("/api/diary", customEntryDto, _jsonOptions);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var createdEntry = await response.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);
        createdEntry.Should().NotBeNull();
        createdEntry!.ProductId.Should().BeNull();
        createdEntry.CustomName.Should().Be("Homemade Smoothie");
        createdEntry.CustomCalories.Should().Be(250);
        createdEntry.CustomProtein.Should().Be(12.3f);
        createdEntry.CustomCarbs.Should().Be(45.5f);
        createdEntry.CustomFat.Should().Be(8.9f);
    }

    [Fact]
    public async Task CreateDiaryEntry_WithNonExistentProductId_ReturnsNotFound()
    {
        // Arrange
        var diaryEntryDto = DiaryEntryTestHelper.CreateValidEntryDto(
            99999, // Non-existent product ID
            100, 
            "2026-10-29", 
            MealType.Dinner);

        // Act
        var response = await _client.PostAsJsonAsync("/api/diary", diaryEntryDto, _jsonOptions);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region GET /api/diary?date={date} - Get Entries for Date

    [Fact]
    public async Task GetDiaryEntries_ForSpecificDate_ReturnsEntriesForThatDate()
    {
        // Arrange
        var testDate = "2026-10-29";
        
        // Create a product first
        var product = ProductTestHelper.CreateValidProduct($"Test Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        // Create diary entries for the test date
        var entry1 = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 100, testDate, MealType.Breakfast);
        var entry2 = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct.Id, 150, testDate, MealType.Lunch);
        
        await _client.PostAsJsonAsync("/api/diary", entry1, _jsonOptions);
        await _client.PostAsJsonAsync("/api/diary", entry2, _jsonOptions);

        // Act
        var response = await _client.GetAsync($"/api/diary?date={testDate}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var entries = await response.Content.ReadFromJsonAsync<List<DiaryEntry>>(_jsonOptions);
        entries.Should().NotBeNull();
        entries!.Should().HaveCountGreaterThanOrEqualTo(2);
        entries.Should().OnlyContain(e => e.Date == DateOnly.Parse(testDate));
        entries.Should().Contain(e => e.MealType == MealType.Breakfast);
        entries.Should().Contain(e => e.MealType == MealType.Lunch);
    }

    [Fact]
    public async Task GetDiaryEntries_ForDateWithNoEntries_ReturnsEmptyList()
    {
        // Arrange
        var testDate = "2099-12-31"; // Future date with no entries

        // Act
        var response = await _client.GetAsync($"/api/diary?date={testDate}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var entries = await response.Content.ReadFromJsonAsync<List<DiaryEntry>>(_jsonOptions);
        entries.Should().NotBeNull();
        entries!.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDiaryEntries_IncludesProductInformation()
    {
        // Arrange
        var testDate = "2026-10-29";
        var product = ProductTestHelper.CreateValidProduct($"Test Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        var diaryEntry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 200, testDate, MealType.Snack);
        await _client.PostAsJsonAsync("/api/diary", diaryEntry, _jsonOptions);

        // Act
        var response = await _client.GetAsync($"/api/diary?date={testDate}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var entries = await response.Content.ReadFromJsonAsync<List<DiaryEntry>>(_jsonOptions);
        var entry = entries!.FirstOrDefault(e => e.ProductId == createdProduct.Id);
        
        entry.Should().NotBeNull();
        entry!.Product.Should().NotBeNull();
        entry.Product!.Name.Should().Be(product.Name);
    }

    #endregion

    #region PUT /api/diary/{id} - Update Diary Entry

    [Fact]
    public async Task UpdateDiaryEntry_WithValidData_ReturnsUpdatedEntry()
    {
        // Arrange
        var product = ProductTestHelper.CreateValidProduct($"Test Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        var diaryEntry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 100, "2026-10-29", MealType.Lunch);
        var createResponse = await _client.PostAsJsonAsync("/api/diary", diaryEntry, _jsonOptions);
        var createdEntry = await createResponse.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);

        var updateDto = DiaryEntryTestHelper.CreateUpdateDto(200, "2026-10-29", MealType.Dinner);

        // Act
        var response = await _client.PutAsJsonAsync($"/api/diary/{createdEntry!.Id}", updateDto, _jsonOptions);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var updatedEntry = await response.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);
        updatedEntry.Should().NotBeNull();
        updatedEntry!.AmountInGrams.Should().Be(200);
        updatedEntry.MealType.Should().Be(MealType.Dinner);
    }

    [Fact]
    public async Task UpdateDiaryEntry_WithNonExistentId_ReturnsNotFound()
    {
        // Arrange
        var updateDto = DiaryEntryTestHelper.CreateUpdateDto(150, "2026-10-29", MealType.Lunch);

        // Act
        var response = await _client.PutAsJsonAsync("/api/diary/99999", updateDto, _jsonOptions);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region DELETE /api/diary/{id} - Delete Diary Entry

    [Fact]
    public async Task DeleteDiaryEntry_WithValidId_ReturnsNoContent()
    {
        // Arrange
        var product = ProductTestHelper.CreateValidProduct($"Test Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        var diaryEntry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 100, "2026-10-29", MealType.Snack);
        var createResponse = await _client.PostAsJsonAsync("/api/diary", diaryEntry, _jsonOptions);
        var createdEntry = await createResponse.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);

        // Act
        var response = await _client.DeleteAsync($"/api/diary/{createdEntry!.Id}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Verify the entry is actually deleted
        var getResponse = await _client.GetAsync($"/api/diary/{createdEntry.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteDiaryEntry_WithNonExistentId_ReturnsNotFound()
    {
        // Act
        var response = await _client.DeleteAsync("/api/diary/99999");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region User Isolation Tests - CRITICAL for Security

    [Fact]
    public async Task GetDiaryEntry_ByAnotherUser_ReturnsForbidden()
    {
        // Arrange - User 1 creates an entry
        TestAuthHandler.SwitchToUser1();
        
        var product = ProductTestHelper.CreateValidProduct($"User 1 Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        var diaryEntry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 100, "2026-10-29", MealType.Breakfast);
        var createResponse = await _client.PostAsJsonAsync("/api/diary", diaryEntry, _jsonOptions);
        var createdEntry = await createResponse.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);

        // Act - User 2 tries to access User 1's entry
        TestAuthHandler.SwitchToUser2();
        var response = await _client.GetAsync($"/api/diary/{createdEntry!.Id}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        
        // Cleanup - switch back to User 1
        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public async Task DeleteDiaryEntry_ByAnotherUser_ReturnsForbidden()
    {
        // Arrange - User 1 creates an entry
        TestAuthHandler.SwitchToUser1();
        
        var product = ProductTestHelper.CreateValidProduct($"User 1 Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        var diaryEntry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 100, "2026-10-29", MealType.Lunch);
        var createResponse = await _client.PostAsJsonAsync("/api/diary", diaryEntry, _jsonOptions);
        var createdEntry = await createResponse.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);

        // Act - User 2 tries to delete User 1's entry
        TestAuthHandler.SwitchToUser2();
        var response = await _client.DeleteAsync($"/api/diary/{createdEntry!.Id}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        
        // Cleanup - switch back to User 1
        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public async Task GetDiaryEntriesForDate_OnlyReturnsCurrentUserEntries()
    {
        // Arrange
        var testDate = "2026-10-29";
        var product = ProductTestHelper.CreateValidProduct($"Shared Product {Guid.NewGuid()}");
        var productResponse = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        var createdProduct = await productResponse.Content.ReadFromJsonAsync<Product>(_jsonOptions);

        // User 1 creates an entry
        TestAuthHandler.SwitchToUser1();
        var user1Entry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct!.Id, 100, testDate, MealType.Breakfast);
        await _client.PostAsJsonAsync("/api/diary", user1Entry, _jsonOptions);

        // User 2 creates an entry
        TestAuthHandler.SwitchToUser2();
        var user2Entry = DiaryEntryTestHelper.CreateValidEntryDto(createdProduct.Id, 150, testDate, MealType.Lunch);
        await _client.PostAsJsonAsync("/api/diary", user2Entry, _jsonOptions);

        // Act - User 2 gets entries for the date
        var response = await _client.GetAsync($"/api/diary?date={testDate}");

        // Assert - User 2 should only see their own entry
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var entries = await response.Content.ReadFromJsonAsync<List<DiaryEntry>>(_jsonOptions);
        
        entries.Should().NotBeNull();
        entries.Should().OnlyContain(e => e.UserId == 2);
        entries.Should().NotContain(e => e.UserId == 1);
        
        // Cleanup - switch back to User 1
        TestAuthHandler.SwitchToUser1();
    }

    #endregion
}
