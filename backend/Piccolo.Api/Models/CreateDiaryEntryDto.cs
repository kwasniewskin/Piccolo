namespace Piccolo.Api.Models;

/// <summary>
/// DTO do tworzenia nowego wpisu w dzienniku żywieniowym.
/// </summary>
public class CreateDiaryEntryDto
{
    public DateOnly Date { get; set; }
    
    public MealType MealType { get; set; }
    
    public int ProductId { get; set; }
    
    public double AmountInGrams { get; set; }
}
