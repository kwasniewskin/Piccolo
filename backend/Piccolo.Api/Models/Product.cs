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
    
    // Nowe właściwości dla rozszerzonego profilu odżywczego
    public string? Brand { get; set; }
    
    public string? Manufacturer { get; set; }
    
    public string? Ingredients { get; set; }
    
    public float? SaturatedFatPer100g { get; set; }
    
    public float? SugarsPer100g { get; set; }
    
    public float? FiberPer100g { get; set; }
    
    public float? SaltPer100g { get; set; }
    
    public float? PackageWeightGrams { get; set; }
    
    public float? DefaultServingGrams { get; set; }
    
    public string DataSource { get; set; } = "System";
    
    public string? CreatedByUserId { get; set; }
    
    public string? ImageUrl { get; set; }
    
    // Navigation properties
    public ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
    public ICollection<ProductUnit> Units { get; set; } = new List<ProductUnit>();
}
