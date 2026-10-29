using Piccolo.Api.Models;

namespace Piccolo.Api.Tests.Helpers;

/// <summary>
/// Helper class for creating test diary entry objects.
/// </summary>
public static class DiaryEntryTestHelper
{
    /// <summary>
    /// Creates a valid CreateDiaryEntryDto for a standard entry (with ProductId).
    /// </summary>
    public static CreateDiaryEntryDto CreateValidEntryDto(
        int productId,
        double amountInGrams = 100,
        string? date = null,
        MealType mealType = MealType.Lunch)
    {
        return new CreateDiaryEntryDto
        {
            Date = string.IsNullOrEmpty(date) ? DateOnly.FromDateTime(DateTime.Today) : DateOnly.Parse(date),
            MealType = mealType,
            ProductId = productId,
            AmountInGrams = amountInGrams
        };
    }

    /// <summary>
    /// Creates a valid CreateDiaryEntryDto for a custom entry (Quick Add).
    /// </summary>
    public static CreateDiaryEntryDto CreateCustomEntryDto(
        string customName = "Quick Add",
        float calories = 300,
        float protein = 10,
        float fat = 15,
        float carbs = 20,
        string? date = null,
        MealType mealType = MealType.Snack)
    {
        return new CreateDiaryEntryDto
        {
            Date = string.IsNullOrEmpty(date) ? DateOnly.FromDateTime(DateTime.Today) : DateOnly.Parse(date),
            MealType = mealType,
            ProductId = null,
            AmountInGrams = null,
            CustomName = customName,
            CustomCalories = calories,
            CustomProtein = protein,
            CustomFat = fat,
            CustomCarbs = carbs
        };
    }

    /// <summary>
    /// Creates a valid UpdateDiaryEntryDto for updating amount in grams.
    /// </summary>
    public static UpdateDiaryEntryDto CreateUpdateDto(
        double amountInGrams,
        string? date = null,
        MealType mealType = MealType.Lunch)
    {
        return new UpdateDiaryEntryDto
        {
            Date = string.IsNullOrEmpty(date) ? DateOnly.FromDateTime(DateTime.Today) : DateOnly.Parse(date),
            MealType = mealType,
            AmountInGrams = amountInGrams
        };
    }

    /// <summary>
    /// Creates a valid UpdateDiaryEntryDto for updating custom entry values.
    /// </summary>
    public static UpdateDiaryEntryDto CreateUpdateCustomDto(
        string? customName = null,
        float? calories = null,
        float? protein = null,
        float? fat = null,
        float? carbs = null,
        string? date = null,
        MealType mealType = MealType.Snack)
    {
        return new UpdateDiaryEntryDto
        {
            Date = string.IsNullOrEmpty(date) ? DateOnly.FromDateTime(DateTime.Today) : DateOnly.Parse(date),
            MealType = mealType,
            CustomName = customName,
            CustomCalories = calories,
            CustomProtein = protein,
            CustomFat = fat,
            CustomCarbs = carbs
        };
    }
}
