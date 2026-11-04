namespace Piccolo.Api.Models;

/// <summary>
/// Kombinacja (jednostka, ilość) użyta wcześniej przez użytkownika.
/// </summary>
public class ServingUsageDto
{
    public required string UnitKey { get; set; }
    public double Quantity { get; set; }
}

/// <summary>
/// Historia użycia produktu przez użytkownika – podstawa wierszy "szybkiego dodawania".
/// GET /api/diary/product-usage/{productId}
/// </summary>
public class ProductUsageDto
{
    /// <summary>
    /// Do 2 ostatnio użytych, różnych kombinacji (od najnowszej).
    /// </summary>
    public List<ServingUsageDto> Recent { get; set; } = new();

    /// <summary>
    /// Najczęściej używana jednostka wraz z ostatnio wpisaną w niej ilością.
    /// Null, gdy brak historii.
    /// </summary>
    public ServingUsageDto? MostUsed { get; set; }
}
