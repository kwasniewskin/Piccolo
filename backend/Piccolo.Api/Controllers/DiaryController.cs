using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;

namespace Piccolo.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DiaryController : ControllerBase
{
    private readonly AppDbContext _context;

    public DiaryController(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Pobiera wszystkie wpisy z dziennika dla danej daty.
    /// GET /api/diary?date=2026-10-05
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DiaryEntry>>> Get([FromQuery] DateOnly date)
    {
        var entries = await _context.DiaryEntries
            .Include(e => e.Product)
            .Where(e => e.Date == date)
            .ToListAsync();

        return Ok(entries);
    }

    /// <summary>
    /// Dodaje nowy wpis do dziennika żywieniowego.
    /// POST /api/diary
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<DiaryEntry>> Create([FromBody] CreateDiaryEntryDto dto)
    {
        var entry = new DiaryEntry
        {
            Date = dto.Date,
            MealType = dto.MealType,
            ProductId = dto.ProductId,
            AmountInGrams = dto.AmountInGrams
        };

        _context.DiaryEntries.Add(entry);
        await _context.SaveChangesAsync();

        // Załaduj Product dla zwracanego obiektu
        await _context.Entry(entry).Reference(e => e.Product).LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
    }

    /// <summary>
    /// Usuwa wpis z dziennika.
    /// DELETE /api/diary/{id}
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entry = await _context.DiaryEntries.FindAsync(id);

        if (entry == null)
        {
            return NotFound();
        }

        _context.DiaryEntries.Remove(entry);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Pobiera wpis po ID (potrzebne dla CreatedAtAction).
    /// GET /api/diary/{id}
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<DiaryEntry>> GetById(int id)
    {
        var entry = await _context.DiaryEntries
            .Include(e => e.Product)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (entry == null)
        {
            return NotFound();
        }

        return Ok(entry);
    }
}
