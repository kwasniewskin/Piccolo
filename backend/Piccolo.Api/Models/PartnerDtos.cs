namespace Piccolo.Api.Models;

/// <summary>
/// DTO zwracający wygenerowany kod parowania.
/// </summary>
public class GeneratePairingCodeResponse
{
    public required string Code { get; set; }
    public DateTime ExpiresAt { get; set; }
}

/// <summary>
/// DTO przyjmujący kod parowania do akceptacji.
/// </summary>
public class AcceptPairingCodeRequest
{
    public required string Code { get; set; }
}

/// <summary>
/// DTO zwracający informacje o połączeniu.
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
/// DTO zwracający informacje o partnerze.
/// </summary>
public class PartnerInfoDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
}
