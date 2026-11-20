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
    /// Generates a pairing code for connecting with a partner.
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
    /// Accepts a pairing code and links accounts with the partner.
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
    /// Returns the active partner connection, if one exists.
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
    /// Returns profile details of the connected partner.
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
    /// Disconnects the active partner link.
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
    /// SQLite does not persist DateTimeKind, so timestamps read back have Kind=Unspecified
    /// and serialize without a trailing "Z", causing browsers to treat them as local time.
    /// All timestamps are persisted as UTC, so explicitly marking them as UTC is safe.
    /// </summary>
    private static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
}

