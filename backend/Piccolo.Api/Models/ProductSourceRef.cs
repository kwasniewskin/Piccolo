using System.Text.Json.Serialization;

namespace Piccolo.Api.Models;

/// <summary>
/// Powiazanie produktu z zewnetrznym zrodlem danych (Fitatu, USDA, CIQUAL, OFF) dla idempotentnego upsertu.
/// </summary>
public class ProductSourceRef
{
    public int Id { get; set; }

    public int ProductId { get; set; }

    public required string Source { get; set; }

    public required string ExternalId { get; set; }

    public string? OriginalName { get; set; }

    public float? MatchConfidence { get; set; }

    public int? ImportBatchId { get; set; }

    [JsonIgnore]
    public Product? Product { get; set; }

    [JsonIgnore]
    public ImportBatch? ImportBatch { get; set; }
}
