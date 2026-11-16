namespace Piccolo.Api.Models;

/// <summary>
/// Rejestr pojedynczego uruchomienia importu katalogu produktow (audyt i rollback).
/// </summary>
public class ImportBatch
{
    public int Id { get; set; }

    public required string Source { get; set; }

    public required string FileSha256 { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    public DateTime? FinishedAt { get; set; }

    public required string Status { get; set; }

    public int Inserted { get; set; }

    public int Updated { get; set; }

    public int Skipped { get; set; }

    public int Rejected { get; set; }

    public string? Notes { get; set; }
}
