using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;
using Piccolo.Api.Services;

namespace Piccolo.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DiaryController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly UserService _userService;

    public DiaryController(AppDbContext context, UserService userService)
    {
        _context = context;
        _userService = userService;
    }

    /// <summary>
    /// Pobiera wszystkie wpisy z dziennika dla danej daty (tylko dla zalogowanego użytkownika).
    /// GET /api/diary?date=2026-10-05
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DiaryEntry>>> Get([FromQuery] DateOnly date)
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        
        var entries = await _context.DiaryEntries
            .Include(e => e.Product)
            .Where(e => e.UserId == userId && e.Date == date)
            .ToListAsync();

        return Ok(entries);
    }

    /// <summary>
    /// Dodaje nowy wpis do dziennika żywieniowego (dla zalogowanego użytkownika).
    /// POST /api/diary
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<DiaryEntry>> Create([FromBody] CreateDiaryEntryDto dto)
    {
        Console.WriteLine($"[DiaryController] Received POST request");
        Console.WriteLine($"[DiaryController] DTO: Date={dto.Date}, MealType={dto.MealType}, ProductId={dto.ProductId}, Amount={dto.AmountInGrams}");
        
        var userId = await _userService.GetCurrentUserIdAsync();
        Console.WriteLine($"[DiaryController] UserId: {userId}");
        
        var entry = new DiaryEntry
        {
            Date = dto.Date,
            MealType = dto.MealType,
            ProductId = dto.ProductId,
            AmountInGrams = dto.AmountInGrams,
            UserId = userId
        };

        _context.DiaryEntries.Add(entry);
        await _context.SaveChangesAsync();
        
        Console.WriteLine($"[DiaryController] Entry saved with ID: {entry.Id}");

        // Załaduj Product dla zwracanego obiektu
        await _context.Entry(entry).Reference(e => e.Product).LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
    }

    /// <summary>
    /// Usuwa wpis z dziennika (tylko jeśli należy do zalogowanego użytkownika).
    /// DELETE /api/diary/{id}
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        
        var entry = await _context.DiaryEntries
            .FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);

        if (entry == null)
        {
            return NotFound();
        }

        _context.DiaryEntries.Remove(entry);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Pobiera wpis po ID (potrzebne dla CreatedAtAction, tylko jeśli należy do użytkownika).
    /// GET /api/diary/{id}
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<DiaryEntry>> GetById(int id)
    {
        var userId = await _userService.GetCurrentUserIdAsync();
        
        var entry = await _context.DiaryEntries
            .Include(e => e.Product)
            .FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);

        if (entry == null)
        {
            return NotFound();
        }

        return Ok(entry);
    }
}
