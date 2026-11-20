namespace Piccolo.Api.Models;

/// <summary>
/// Response DTO returning a generated pairing code.
/// </summary>
public class GeneratePairingCodeResponse
{
    public required string Code { get; set; }
    public DateTime ExpiresAt { get; set; }
}

/// <summary>
/// Request DTO for accepting a pairing code.
/// </summary>
public class AcceptPairingCodeRequest
{
    public required string Code { get; set; }
}

/// <summary>
/// Response DTO describing a partner connection.
/// </summary>
public class ConnectionDto
{
    public int Id { get; set; }
    public int PartnerId { get; set; }
    public string? PartnerName { get; set; }
    public string? PartnerEmail { get; set; }
    public ConnectionStatus Status { get; set; }
    public DateTime ConnectedAt { get; set; }
}

/// <summary>
/// Response DTO returning partner profile summary.
/// </summary>
public class PartnerInfoDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
}
