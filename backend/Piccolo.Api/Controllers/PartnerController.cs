using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Piccolo.Api.Models;
using Piccolo.Api.Services;

namespace Piccolo.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PartnerController : ControllerBase
{
    private readonly PartnerService _partnerService;
    private readonly UserService _userService;

    public PartnerController(PartnerService partnerService, UserService userService)
    {
        _partnerService = partnerService;
        _userService = userService;
    }

    /// <summary>
    /// Generuje kod parowania do połączenia z partnerem.
    /// POST /api/partner/generate-code
    /// </summary>
    [HttpPost("generate-code")]
    public async Task<ActionResult<GeneratePairingCodeResponse>> GenerateCode()
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        var pairingCode = await _partnerService.GeneratePairingCodeAsync(userId);

        return Ok(new GeneratePairingCodeResponse
        {
            Code = pairingCode.Code,
            ExpiresAt = AsUtc(pairingCode.ExpiresAt)
        });
    }

    /// <summary>
    /// Akceptuje kod parowania i łączy konto z partnerem.
    /// POST /api/partner/accept-code
    /// </summary>
    [HttpPost("accept-code")]
    public async Task<ActionResult<ConnectionDto>> AcceptCode([FromBody] AcceptPairingCodeRequest request)
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        var (success, errorMessage, connection) = await _partnerService.AcceptPairingCodeAsync(userId, request.Code);

        if (!success || connection == null)
        {
            return BadRequest(new { error = errorMessage });
        }

        var partner = connection.User1Id == userId ? connection.User2 : connection.User1;

        return Ok(ToConnectionDto(connection, partner));
    }

    /// <summary>
    /// Pobiera informacje o aktywnym połączeniu (jeśli istnieje).
    /// GET /api/partner/connection
    /// </summary>
    [HttpGet("connection")]
    public async Task<ActionResult<ConnectionDto>> GetConnection()
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        var connection = await _partnerService.GetActiveConnectionAsync(userId);

        if (connection == null)
        {
            return NotFound(new { message = "Brak aktywnego połączenia z partnerem." });
        }

        var partner = connection.User1Id == userId ? connection.User2 : connection.User1;

        return Ok(ToConnectionDto(connection, partner));
    }

    /// <summary>
    /// Pobiera informacje o partnerze.
    /// GET /api/partner/info
    /// </summary>
    [HttpGet("info")]
    public async Task<ActionResult<PartnerInfoDto>> GetPartnerInfo()
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        var partner = await _partnerService.GetPartnerAsync(userId);

        if (partner == null)
        {
            return NotFound(new { message = "Brak połączenia z partnerem." });
        }

        return Ok(new PartnerInfoDto
        {
            Id = partner.Id,
            Name = partner.Name,
            Email = partner.Email
        });
    }

    /// <summary>
    /// Rozłącza połączenie z partnerem.
    /// DELETE /api/partner/disconnect
    /// </summary>
    [HttpDelete("disconnect")]
    public async Task<IActionResult> Disconnect()
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        var success = await _partnerService.DisconnectAsync(userId);

        if (!success)
        {
            return NotFound(new { message = "Brak aktywnego połączenia do rozłączenia." });
        }

        return NoContent();
    }

    private static ConnectionDto ToConnectionDto(UserConnection connection, User partner) => new()
    {
        Id = connection.Id,
        PartnerId = partner.Id,
        PartnerName = partner.Name,
        PartnerEmail = partner.Email,
        Status = connection.Status,
        ConnectedAt = AsUtc(connection.ConnectedAt ?? connection.CreatedAt)
    };

    /// <summary>
    /// SQLite nie przechowuje DateTimeKind, więc daty odczytane z bazy mają Kind=Unspecified
    /// i serializują się bez "Z". Przeglądarka traktuje je wtedy jako czas lokalny
    /// (np. UTC+1), przez co świeży kod wyglądał na wygasły. Wszystkie daty zapisujemy
    /// jako DateTime.UtcNow, więc oznaczenie ich jako UTC jest bezpieczne.
    /// </summary>
    private static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
}

