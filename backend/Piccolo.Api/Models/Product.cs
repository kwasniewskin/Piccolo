namespace Piccolo.Api.Models;

/// <summary>
/// Produkt spożywczy z wartościami odżywczymi na 100g.
/// </summary>
public class Product
{
    public int Id { get; set; }
    
    public required string Name { get; set; }
    
    public double CaloriesPer100g { get; set; }
    
    public double ProteinPer100g { get; set; }
    
    public double FatPer100g { get; set; }
    
    public double CarbsPer100g { get; set; }
    
    public string? Barcode { get; set; }
    
    // Navigation property - relacja 1:N do DiaryEntry
    public ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
}
