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
    /// Fetches all diary entries for a given date.
    /// Defaults to the authenticated user's diary; when targetUserId is provided
    /// and a partner connection exists, fetches the partner's diary instead.
    /// GET /api/diary?date=2026-10-05&amp;targetUserId=2
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DiaryEntry>>> Get([FromQuery] DateOnly date, [FromQuery] int? targetUserId = null)
    {
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        var userId = targetUserId ?? currentUserId;

        // Verify partner access when querying another user's diary
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
    /// Creates a new diary entry.
    /// Defaults to the authenticated user's diary, or the partner's diary when TargetUserId
    /// is provided and access is authorized. Supports both product-linked and custom entries.
    /// POST /api/diary
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<DiaryEntry>> Create([FromBody] CreateDiaryEntryDto dto)
    {
        Console.WriteLine($"[DiaryController] Received POST request");
        Console.WriteLine($"[DiaryController] DTO: Date={dto.Date}, MealType={dto.MealType}, ProductId={dto.ProductId}, Amount={dto.AmountInGrams}, TargetUserId={dto.TargetUserId}");
        
        var currentUserId = await _userService.GetCurrentUserIdAsync();
        var targetUserId = dto.TargetUserId ?? currentUserId;
        
        // Verify partner access when logging to another user's diary
        if (targetUserId != currentUserId)
        {
            var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, targetUserId);
            if (!hasAccess)
            {
                return Forbid();
            }
        }
        
        Console.WriteLine($"[DiaryController] CurrentUserId: {currentUserId}, TargetUserId: {targetUserId}");
        
        // Require either a ProductId or custom entry fields
        if (dto.ProductId == null && string.IsNullOrWhiteSpace(dto.CustomName))
        {
            return BadRequest("Wpis musi zawierać albo ProductId, albo dane produktu (CustomName, CustomCalories, etc.)");
        }
        
        // Serving unit fields must be provided together and quantity must be positive
        if ((dto.UnitKey == null) != (dto.UnitQuantity == null))
        {
            return BadRequest("UnitKey i UnitQuantity muszą być podane razem.");
        }
        if (dto.UnitQuantity is <= 0)
        {
            return BadRequest("UnitQuantity musi być większe od 0.");
        }
        
        // Verify referenced product exists when ProductId is specified
        Product? product = null;
        if (dto.ProductId.HasValue)
        {
            product = await _context.Products.FirstOrDefaultAsync(p => p.Id == dto.ProductId.Value);
            if (product == null)
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
            UnitKey = dto.UnitKey,
            UnitQuantity = dto.UnitQuantity,
            UserId = targetUserId,
            CreatedByUserId = currentUserId,
            // Custom / Quick Add fields
            CustomName = dto.CustomName,
            CustomCalories = dto.CustomCalories,
            CustomProtein = dto.CustomProtein,
            CustomFat = dto.CustomFat,
            CustomCarbs = dto.CustomCarbs,
            // Snapshot product nutrition at entry creation time
            ProductNameSnapshot = product?.Name,
            KcalPer100gSnapshot = product != null ? (float)product.CaloriesPer100g : null,
            ProteinPer100gSnapshot = product != null ? (float)product.ProteinPer100g : null,
            FatPer100gSnapshot = product != null ? (float)product.FatPer100g : null,
            CarbsPer100gSnapshot = product != null ? (float)product.CarbsPer100g : null
        };

        _context.DiaryEntries.Add(entry);
        await _context.SaveChangesAsync();
        
        Console.WriteLine($"[DiaryController] Entry saved with ID: {entry.Id}");

        // Load related Product for the response payload when ProductId is set
        if (entry.ProductId.HasValue)
        {
            await _context.Entry(entry).Reference(e => e.Product).LoadAsync();
        }

        return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
    }

    /// <summary>
    /// Updates an existing diary entry owned by the current user or their connected partner.
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

        // Verify authorization
        var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, entry.UserId);
        if (!hasAccess)
        {
            return Forbid();
        }

        // Update shared metadata fields
        entry.Date = dto.Date;
        entry.MealType = dto.MealType;

        // Update product-linked entry fields
        if (entry.ProductId.HasValue && dto.AmountInGrams.HasValue)
        {
            entry.AmountInGrams = dto.AmountInGrams;
        }
        
        // Update optional serving unit metadata
        if (dto.UnitKey != null)
        {
            entry.UnitKey = dto.UnitKey;
        }
        if (dto.UnitQuantity.HasValue)
        {
            entry.UnitQuantity = dto.UnitQuantity;
        }
        
        // Update custom entry fields
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
    /// Deletes a diary entry owned by the current user or their connected partner.
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

        // Verify authorization
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
    /// Returns serving usage history for a product in the user's (or partner's) diary:
    /// the 2 most recent distinct (unit, quantity) pairs and the most frequently used unit.
    /// GET /api/diary/product-usage/{productId}?targetUserId=2
    /// </summary>
    [HttpGet("product-usage/{productId:int}")]
    public async Task<ActionResult<ProductUsageDto>> GetProductUsage(int productId, [FromQuery] int? targetUserId = null)
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

        // Scanning the latest 200 entries is sufficient for usage stats
        var entries = await _context.DiaryEntries
            .Where(e => e.UserId == userId
                        && e.ProductId == productId
                        && e.UnitKey != null
                        && e.UnitQuantity != null)
            .OrderByDescending(e => e.Date)
            .ThenByDescending(e => e.Id)
            .Select(e => new { e.UnitKey, e.UnitQuantity })
            .Take(200)
            .ToListAsync();

        var result = new ProductUsageDto();

        foreach (var e in entries)
        {
            if (result.Recent.Count >= 2) break;
            var duplicate = result.Recent.Any(r => r.UnitKey == e.UnitKey && r.Quantity == e.UnitQuantity!.Value);
            if (!duplicate)
            {
                result.Recent.Add(new ServingUsageDto { UnitKey = e.UnitKey!, Quantity = e.UnitQuantity!.Value });
            }
        }

        // Most frequently used unit; ties are broken by most recent usage
        var mostUsed = entries
            .Select((e, index) => new { e.UnitKey, e.UnitQuantity, Index = index })
            .GroupBy(e => e.UnitKey!)
            .Select(g => new { UnitKey = g.Key, Count = g.Count(), Latest = g.First() })
            .OrderByDescending(g => g.Count)
            .ThenBy(g => g.Latest.Index)
            .FirstOrDefault();

        if (mostUsed != null)
        {
            result.MostUsed = new ServingUsageDto { UnitKey = mostUsed.UnitKey, Quantity = mostUsed.Latest.UnitQuantity!.Value };
        }

        return Ok(result);
    }

    /// <summary>
    /// Fetches a single diary entry by ID (used by CreatedAtAction).
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

        // Verify authorization
        var hasAccess = await _partnerService.CanAccessDiaryAsync(currentUserId, entry.UserId);
        if (!hasAccess)
        {
            return Forbid();
        }

        return Ok(entry);
    }
}

/// <summary>
/// DTO returning product serving usage history for a user.
/// </summary>
public class ProductUsageDto
{
    public List<ServingUsageDto> Recent { get; set; } = new();
    public ServingUsageDto? MostUsed { get; set; }
}

public class ServingUsageDto
{
    public required string UnitKey { get; set; }
    public required double Quantity { get; set; }
}
