namespace Piccolo.Api.Models;

/// <summary>
/// DTO do aktualizacji wpisu w dzienniku żywieniowym.
/// Wspiera zarówno wpisy z produktem (aktualizacja gramatury), jak i szybkie wpisy (aktualizacja wartości).
/// </summary>
public class UpdateDiaryEntryDto
{
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    /// <summary>
    /// Nowa gramatury dla wpisu z produktem. Null jeśli nie zmieniamy.
    /// </summary>
    public double? AmountInGrams { get; set; }
    
    /// <summary>
    /// Klucz jednostki (opcjonalny).
    /// </summary>
    public string? UnitKey { get; set; }
    
    /// <summary>
    /// Ilość w jednostce (opcjonalna).
    /// </summary>
    public double? UnitQuantity { get; set; }
    
    // Pola dla szybkich wpisów (Quick Add) - opcjonalne, aktualizowane tylko gdy podane
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }
}
