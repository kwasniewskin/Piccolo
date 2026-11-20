namespace Piccolo.Api.Models;

/// <summary>
/// Food diary entry representing a logged portion of a product or custom meal on a given date.
/// </summary>
public class DiaryEntry
{
    public int Id { get; set; }
    
    /// <summary>
    /// Meal date (no time component). Frontend expects YYYY-MM-DD.
    /// </summary>
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    /// <summary>
    /// Optional database product ID. Null for custom entries.
    /// </summary>
    public int? ProductId { get; set; }
    
    /// <summary>
    /// Consumed amount in grams. Optional for custom entries.
    /// </summary>
    public double? AmountInGrams { get; set; }
    
    /// <summary>
    /// Unit key used when logging (e.g. "portion", "slice", "g").
    /// Null for legacy or custom entries.
    /// </summary>
    public string? UnitKey { get; set; }
    
    /// <summary>
    /// Quantity in the selected unit (e.g. 3 for "3 × portion").
    /// Null for legacy or custom entries.
    /// </summary>
    public double? UnitQuantity { get; set; }
    
    /// <summary>
    /// Owner user ID for this diary entry.
    /// </summary>
    public int UserId { get; set; }
    
    /// <summary>
    /// ID of the user who created the entry (may differ from UserId when logging for a partner).
    /// </summary>
    public int CreatedByUserId { get; set; }
    
    // Quick Add fields populated when ProductId == null
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }

    // Per-100g nutrition snapshots at creation time (keeps historical entries immutable on catalog edits)
    public string? ProductNameSnapshot { get; set; }
    public float? KcalPer100gSnapshot { get; set; }
    public float? ProteinPer100gSnapshot { get; set; }
    public float? FatPer100gSnapshot { get; set; }
    public float? CarbsPer100gSnapshot { get; set; }
    
    // Navigation properties
    public Product? Product { get; set; }
    public User User { get; set; } = null!;
}
