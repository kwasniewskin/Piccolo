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
    
    /// <summary>
    /// ID użytkownika, którego dotyczy wpis.
    /// </summary>
    public int UserId { get; set; }
    
    // Navigation properties
    public Product Product { get; set; } = null!;
    public User User { get; set; } = null!;
}
