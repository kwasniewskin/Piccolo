namespace Piccolo.Api.Models;

/// <summary>
/// Pair of (unitKey, quantity) previously used by the user.
/// </summary>
public class ServingUsageDto
{
    public required string UnitKey { get; set; }
    public double Quantity { get; set; }
}

/// <summary>
/// Product serving usage history driving quick-serving rows.
/// GET /api/diary/product-usage/{productId}
/// </summary>
public class ProductUsageDto
{
    /// <summary>
    /// Up to 2 most recently used distinct (unit, quantity) pairs.
    /// </summary>
    public List<ServingUsageDto> Recent { get; set; } = new();

    /// <summary>
    /// Most frequently used unit paired with its most recent quantity, or null if no history exists.
    /// </summary>
    public ServingUsageDto? MostUsed { get; set; }
}
