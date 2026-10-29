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
    private readonly PartnerService _partnerService;

    public DiaryController(AppDbContext context, UserService userService, PartnerService partnerService)
    {
        _context = context;
        _userService = userService;
        _partnerService = partnerService;
    }

    /// <summary>
    /// Pobiera wszystkie wpisy z dziennika dla danej daty.
    /// Domyślnie pobiera dziennik zalogowanego użytkownika.
    /// Jeśli targetUserId jest podane i użytkownik ma połączenie partnerskie, pobiera dziennik partnera.
    /// GET /api/diary?date=2026-10-05&targetUserId=2
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DiaryEntry>>> Get([FromQuery] DateOnly date, [FromQuery] int? targetUserId = null)
    {
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        var userId = targetUserId ?? currentUserId;

        // Sprawdź uprawnienia (jeśli targetUserId != currentUserId)
        if (userId != currentUserId)
        {
            var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, userId);
            if (!hasAccess)
            {
                return Forbid();
            }
        }

        var entries = await _context.DiaryEntries
            .Include(e => e.Product)
            .Where(e => e.UserId == userId && e.Date == date)
            .ToListAsync();

        return Ok(entries);
    }

    /// <summary>
    /// Dodaje nowy wpis do dziennika żywieniowego.
    /// Domyślnie dodaje wpis dla zalogowanego użytkownika.
    /// Jeśli TargetUserId jest podane i użytkownik ma połączenie partnerskie, dodaje wpis dla partnera.
    /// Wspiera zarówno wpisy z produktem z bazy, jak i szybkie wpisy (Quick Add).
    /// POST /api/diary
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<DiaryEntry>> Create([FromBody] CreateDiaryEntryDto dto)
    {
        Console.WriteLine($"[DiaryController] Received POST request");
        Console.WriteLine($"[DiaryController] DTO: Date={dto.Date}, MealType={dto.MealType}, ProductId={dto.ProductId}, Amount={dto.AmountInGrams}, TargetUserId={dto.TargetUserId}");
        
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        var targetUserId = dto.TargetUserId ?? currentUserId;
        
        // Sprawdź uprawnienia (jeśli targetUserId != currentUserId)
        if (targetUserId != currentUserId)
        {
            var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, targetUserId);
            if (!hasAccess)
            {
                return Forbid();
            }
        }
        
        Console.WriteLine($"[DiaryController] CurrentUserId: {currentUserId}, TargetUserId: {targetUserId}");
        
        // Walidacja: musi być albo ProductId, albo pola Custom*
        if (dto.ProductId == null && string.IsNullOrWhiteSpace(dto.CustomName))
        {
            return BadRequest("Wpis musi zawierać albo ProductId, albo dane produktu (CustomName, CustomCalories, etc.)");
        }
        
        // Walidacja: jeśli ProductId jest podane, produkt musi istnieć
        if (dto.ProductId.HasValue)
        {
            var productExists = await _context.Products.AnyAsync(p => p.Id == dto.ProductId.Value);
            if (!productExists)
            {
                return NotFound($"Produkt o ID {dto.ProductId.Value} nie został znaleziony.");
            }
        }
        
        var entry = new DiaryEntry
        {
            Date = dto.Date,
            MealType = dto.MealType,
            ProductId = dto.ProductId,
            AmountInGrams = dto.AmountInGrams,
            UserId = targetUserId,
            CreatedByUserId = currentUserId,
            // Pola dla szybkich wpisów
            CustomName = dto.CustomName,
            CustomCalories = dto.CustomCalories,
            CustomProtein = dto.CustomProtein,
            CustomFat = dto.CustomFat,
            CustomCarbs = dto.CustomCarbs
        };

        _context.DiaryEntries.Add(entry);
        await _context.SaveChangesAsync();
        
        Console.WriteLine($"[DiaryController] Entry saved with ID: {entry.Id}");

        // Załaduj Product dla zwracanego obiektu (jeśli ProductId != null)
        if (entry.ProductId.HasValue)
        {
            await _context.Entry(entry).Reference(e => e.Product).LoadAsync();
        }

        return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
    }

    /// <summary>
    /// Aktualizuje wpis w dzienniku (tylko jeśli należy do użytkownika lub jego partnera).
    /// Pozwala na zmianę gramatury dla wpisów standardowych lub wartości makro dla wpisów customowych.
    /// PUT /api/diary/{id}
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<DiaryEntry>> Update(int id, [FromBody] UpdateDiaryEntryDto dto)
    {
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        
        var entry = await _context.DiaryEntries
            .Include(e => e.Product)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (entry == null)
        {
            return NotFound();
        }

        // Sprawdź uprawnienia
        var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, entry.UserId);
        if (!hasAccess)
        {
            return Forbid();
        }

        // Aktualizacja wspólnych pól
        entry.Date = dto.Date;
        entry.MealType = dto.MealType;

        // Aktualizacja dla wpisu z produktem
        if (entry.ProductId.HasValue && dto.AmountInGrams.HasValue)
        {
            entry.AmountInGrams = dto.AmountInGrams;
        }
        
        // Aktualizacja dla wpisu customowego
        if (entry.ProductId == null)
        {
            entry.CustomName = dto.CustomName ?? entry.CustomName;
            entry.CustomCalories = dto.CustomCalories ?? entry.CustomCalories;
            entry.CustomProtein = dto.CustomProtein ?? entry.CustomProtein;
            entry.CustomFat = dto.CustomFat ?? entry.CustomFat;
            entry.CustomCarbs = dto.CustomCarbs ?? entry.CustomCarbs;
        }

        await _context.SaveChangesAsync();

        return Ok(entry);
    }

    /// <summary>
    /// Usuwa wpis z dziennika (tylko jeśli należy do użytkownika lub jego partnera).
    /// DELETE /api/diary/{id}
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        
        var entry = await _context.DiaryEntries
            .FirstOrDefaultAsync(e => e.Id == id);

        if (entry == null)
        {
            return NotFound();
        }

        // Sprawdź uprawnienia
        var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, entry.UserId);
        if (!hasAccess)
        {
            return Forbid();
        }

        _context.DiaryEntries.Remove(entry);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Pobiera wpis po ID (potrzebne dla CreatedAtAction, tylko jeśli należy do użytkownika lub jego partnera).
    /// GET /api/diary/{id}
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<DiaryEntry>> GetById(int id)
    {
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        
        var entry = await _context.DiaryEntries
            .Include(e => e.Product)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (entry == null)
        {
            return NotFound();
        }

        // Sprawdź uprawnienia
        var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, entry.UserId);
        if (!hasAccess)
        {
            return Forbid();
        }

        return Ok(entry);
    }
}
