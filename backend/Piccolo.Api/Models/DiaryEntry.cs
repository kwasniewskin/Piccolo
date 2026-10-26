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
    /// ID użytkownika, którego dotyczy wpis.
    /// </summary>
    public int UserId { get; set; }
    
    // Pola dla szybkich wpisów (Quick Add) - wypełnione gdy ProductId == null
    public string? CustomName { get; set; }
    public float? CustomCalories { get; set; }
    public float? CustomProtein { get; set; }
    public float? CustomFat { get; set; }
    public float? CustomCarbs { get; set; }
    
    // Navigation properties
    public Product? Product { get; set; }
    public User User { get; set; } = null!;
}
