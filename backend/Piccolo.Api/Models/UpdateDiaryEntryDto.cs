namespace Piccolo.Api.Models;

/// <summary>
/// DTO for updating an existing diary entry.
/// Supports both product-linked entries (grams/units) and custom entries (macros).
/// </summary>
public class UpdateDiaryEntryDto
{
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    /// <summary>
    /// Updated weight in grams for a product-linked entry, or null to keep unchanged.
    /// </summary>
    public double? AmountInGrams { get; set; }
    
    /// <summary>
    /// Optional serving unit key.
    /// </summary>
    public string? UnitKey { get; set; }
    
    /// <summary>
    /// Optional quantity in the selected unit.
    /// </summary>
    public double? UnitQuantity { get; set; }
    
    // Optional Quick Add fields updated when provided
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }
}
