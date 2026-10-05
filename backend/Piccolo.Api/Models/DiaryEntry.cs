namespace Piccolo.Api.Models;

/// <summary>
/// Wpis w dzienniku żywieniowym - konkretna porcja produktu spożyta w danym dniu.
/// </summary>
public class DiaryEntry
{
    public int Id { get; set; }
    
    /// <summary>
    /// Data posiłku (bez godziny). Frontend oczekuje formatu YYYY-MM-DD.
    /// </summary>
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    public int ProductId { get; set; }
    
    public double AmountInGrams { get; set; }
    
    // Navigation property - relacja N:1 do Product
    public Product Product { get; set; } = null!;
}
