using System.Text.Json.Serialization;

namespace Piccolo.Api.Models;

/// <summary>
/// Jednostka miary zdefiniowana dla konkretnego produktu (np. plaster, sztuka, łyżka).
/// Waga jest zawsze podawana per produkt – nie ma globalnych "domyślnych" wag,
/// bo łyżka miodu waży inaczej niż łyżka mąki.
/// Użytkownik może podać DOWOLNĄ nazwę jednostki.
/// </summary>
public class ProductUnit
{
    public int Id { get; set; }
    
    /// <summary>
    /// Klucz jednostki (jeden z <see cref="AllowedKeys"/>).
    /// Frontend mapuje klucze na etykiety po polsku.
    /// </summary>
    public required string UnitKey { get; set; }
    
    /// <summary>
    /// Ile gramów waży jedna jednostka dla tego produktu.
    /// Np. dla sera topionego: plaster = 16.7g, dla szynki: plaster = 10g.
    /// </summary>
    public float GramsPerUnit { get; set; }
    
    /// <summary>
    /// ID produktu, do którego należy ta jednostka.
    /// </summary>
    public int ProductId { get; set; }
    
    // Navigation property – ignorowana w JSON, żeby klient nie musiał jej wysyłać
    // (inaczej walidacja modelu wymagałaby pola "product" w każdej jednostce).
    [JsonIgnore]
    public Product? Product { get; set; }
}
