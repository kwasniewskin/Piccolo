namespace Piccolo.Api.Models;

/// <summary>
/// DTO do tworzenia nowego wpisu w dzienniku żywieniowym.
/// Wspiera zarówno wpisy z produktem z bazy (ProductId), jak i szybkie wpisy (Custom*).
/// </summary>
public class CreateDiaryEntryDto
{
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    /// <summary>
    /// Opcjonalny ID produktu z bazy. Null dla szybkich wpisów.
    /// </summary>
    public int? ProductId { get; set; }
    
    public double? AmountInGrams { get; set; }
    
    // Pola dla szybkich wpisów (Quick Add) - wypełnione gdy ProductId == null
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }
}
