namespace Piccolo.Api.Models;

/// <summary>
/// Wpis w dzienniku żywieniowym - konkretna porcja produktu spożyta w danym dniu.
/// Może być powiązany z produktem z bazy (ProductId) lub być szybkim wpisem (Custom*).
/// </summary>
public class DiaryEntry
{
    public int Id { get; set; }
    
    /// <summary>
    /// Data posiłku (bez godziny). Frontend oczekuje formatu YYYY-MM-DD.
    /// </summary>
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    /// <summary>
    /// Opcjonalny ID produktu z bazy. Null dla szybkich wpisów.
    /// </summary>
    public int? ProductId { get; set; }
    
    /// <summary>
    /// Ilość spożyta w gramach. Opcjonalne dla szybkich wpisów (custom entries).
    /// </summary>
    public double? AmountInGrams { get; set; }
    
    /// <summary>
    /// Klucz jednostki użytej przy dodawaniu (np. "portion", "slice", "g").
    /// Null dla starych wpisów i szybkich wpisów.
    /// </summary>
    public string? UnitKey { get; set; }
    
    /// <summary>
    /// Ilość w jednostce (np. 3 dla "3 × porcja").
    /// Null dla starych wpisów i szybkich wpisów.
    /// </summary>
    public double? UnitQuantity { get; set; }
    
    /// <summary>
    /// ID użytkownika, którego dotyczy wpis.
    /// </summary>
    public int UserId { get; set; }
    
    /// <summary>
    /// ID użytkownika, który fizycznie utworzył wpis.
    /// W większości przypadków równy UserId, ale przy dzieleniu dziennika z partnerem może być inny.
    /// </summary>
    public int CreatedByUserId { get; set; }
    
    // Pola dla szybkich wpisów (Quick Add) - wypełnione gdy ProductId == null
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }

    // Snapshot wartości na 100g w momencie dodania wpisu (odporność na zmiany katalogu)
    public string? ProductNameSnapshot { get; set; }
    public float? KcalPer100gSnapshot { get; set; }
    public float? ProteinPer100gSnapshot { get; set; }
    public float? FatPer100gSnapshot { get; set; }
    public float? CarbsPer100gSnapshot { get; set; }
    
    // Navigation properties
    public Product? Product { get; set; }
    public User User { get; set; } = null!;
}
