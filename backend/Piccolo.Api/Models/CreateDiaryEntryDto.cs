namespace Piccolo.Api.Models;

/// <summary>
/// DTO for creating a new diary entry.
/// Supports both product-linked entries (ProductId) and custom entries (Custom*).
/// </summary>
public class CreateDiaryEntryDto
{
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    /// <summary>
    /// Target user ID for the entry.
    /// Defaults to the authenticated user when null; partner access is checked otherwise.
    /// </summary>
    public int? TargetUserId { get; set; }
    
    /// <summary>
    /// Optional product ID. Null for custom Quick Add entries.
    /// </summary>
    public int? ProductId { get; set; }
    
    public double? AmountInGrams { get; set; }
    
    /// <summary>
    /// Unit key used when logging (e.g. "portion", "slice", "g").
    /// </summary>
    public string? UnitKey { get; set; }
    
    /// <summary>
    /// Quantity in the selected unit (e.g. 3 for "3 × portion").
    /// </summary>
    public double? UnitQuantity { get; set; }
    
    // Quick Add fields populated when ProductId == null
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }
}
