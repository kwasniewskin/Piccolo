using System.Text.Json.Serialization;

namespace Piccolo.Api.Models;

/// <summary>
/// Produkt spożywczy z wartościami odżywczymi na 100g.
/// </summary>
public class Product
{
    public int Id { get; set; }
    
    public required string Name { get; set; }

    /// <summary>
    /// Znormalizowana nazwa do wyszukiwania (lowercase, bez diakrytyków).
    /// </summary>
    public string SearchName { get; set; } = string.Empty;
    
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

    public float? CholesterolMgPer100g { get; set; }

    public float? MonounsaturatedFatPer100g { get; set; }

    public float? PolyunsaturatedFatPer100g { get; set; }
    
    public float? PackageWeightGrams { get; set; }
    
    public float? DefaultServingGrams { get; set; }
    
    public string DataSource { get; set; } = "System";

    /// <summary>
    /// Rodzaj produktu: "generic", "branded", "dish", "user".
    /// </summary>
    public string Kind { get; set; } = "user";

    /// <summary>
    /// Stan obróbki: "raw", "cooked", "processed" lub null.
    /// </summary>
    public string? PreparationState { get; set; }

    public int? CategoryId { get; set; }

    public bool IsVerified { get; set; }

    public bool IsArchived { get; set; }

    public int? ImportBatchId { get; set; }
    
    public string? CreatedByUserId { get; set; }
    
    public string? ImageUrl { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    [JsonIgnore]
    public Category? Category { get; set; }

    [JsonIgnore]
    public ImportBatch? ImportBatch { get; set; }

    public ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
    public ICollection<ProductUnit> Units { get; set; } = new List<ProductUnit>();

    [JsonIgnore]
    public ICollection<ProductSourceRef> SourceRefs { get; set; } = new List<ProductSourceRef>();
}
