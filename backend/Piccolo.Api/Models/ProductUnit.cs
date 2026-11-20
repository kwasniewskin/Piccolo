using System.Text.Json.Serialization;

namespace Piccolo.Api.Models;

/// <summary>
/// Custom serving unit defined per product (e.g. slice, piece, tbsp).
/// Grams are always specified per product because unit weights vary by food.
/// Users may enter any custom unit name.
/// </summary>
public class ProductUnit
{
    public int Id { get; set; }
    
    /// <summary>
    /// Unit key mapped to localized labels by the frontend.
    /// </summary>
    public required string UnitKey { get; set; }
    
    /// <summary>
    /// Weight in grams for one unit of this product (e.g. cheese slice = 16.7g, ham slice = 10g).
    /// </summary>
    public float GramsPerUnit { get; set; }
    
    /// <summary>
    /// Parent product ID.
    /// </summary>
    public int ProductId { get; set; }
    
    // Ignored in JSON so clients do not need to serialize the back-reference on POST/PUT.
    [JsonIgnore]
    public Product? Product { get; set; }
}
