using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;
using Piccolo.Api.Services;

namespace Piccolo.Api.Controllers;

/// <summary>
/// Dzienne cele kaloryczne i makroskładników.
/// Każdy użytkownik ma własne cele; partner może je odczytać, ale nie zmienić.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GoalsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly UserService _userService;
    private readonly PartnerService _partnerService;

    public GoalsController(AppDbContext context, UserService userService, PartnerService partnerService)
    {
        _context = context;
        _userService = userService;
        _partnerService = partnerService;
    }

    /// <summary>
    /// Pobiera cele właściciela dziennika.
    /// Domyślnie cele zalogowanego użytkownika; z targetUserId – cele partnera (wymaga aktywnego połączenia).
    /// GET /api/goals?targetUserId=2
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<GoalsDto>> Get([FromQuery] int? targetUserId = null)
    {
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        var userId = targetUserId ?? currentUserId;

        if (userId != currentUserId)
        {
            var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, userId);
            if (!hasAccess)
            {
                return Forbid();
            }
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return NotFound();
        }

        return Ok(GoalsDto.FromUser(user));
    }

    /// <summary>
    /// Zapisuje cele zalogowanego użytkownika.
    /// PUT /api/goals
    /// </summary>
    [HttpPut]
    public async Task<ActionResult<GoalsDto>> Update([FromBody] GoalsDto dto)
    {
        var user = await _userService.GetOrCreateCurrentUserAsync();

        user.CalorieGoal = dto.Kcal;
        user.ProteinGoal = dto.Protein;
        user.FatGoal = dto.Fat;
        user.CarbsGoal = dto.Carbs;

        await _context.SaveChangesAsync();

        return Ok(GoalsDto.FromUser(user));
    }
}
