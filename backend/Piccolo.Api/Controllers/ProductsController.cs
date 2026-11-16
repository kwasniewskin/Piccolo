using System.Security.Claims;
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
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly OpenFoodFactsService _offService;

    public ProductsController(AppDbContext context, OpenFoodFactsService offService)
    {
        _context = context;
        _offService = offService;
    }

    /// <summary>
    /// Wyszukuje produkty hybrydowo: najpierw lokalna baza, potem Open Food Facts.
    /// Lokalne wyniki są zawsze na górze, duplikaty (po kodzie kreskowym) są usuwane.
    /// GET /api/products/search?name=mleko
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<Product>>> Search([FromQuery] string? name)
    {
        var results = new List<Product>();

        // 1. Pobierz wyniki z lokalnej bazy (mają Id)
        IQueryable<Product> localQuery = _context.Products
            .AsNoTracking()
            .Include(p => p.Units)
            .Where(p => !p.IsArchived);

        var normQuery = SearchTextHelper.NormalizeForSearch(name);
        var tokens = SearchTextHelper.TokenizeQuery(name);
        var personalUsage = await GetPersonalUsageCountsAsync();

        foreach (var token in tokens)
        {
            var tok = token;
            localQuery = localQuery.Where(p => p.SearchName.Contains(tok));
        }

        List<Product> localProducts;
        if (tokens.Length > 0)
        {
            var candidates = await localQuery
                .OrderByDescending(p => p.IsVerified)
                .ThenBy(p => p.Name.Length)
                .Take(250)
                .ToListAsync();

            if (personalUsage.Count > 0)
            {
                var candidateIds = candidates.Select(c => c.Id).ToHashSet();
                var missingPersonalIds = personalUsage.Keys.Where(id => !candidateIds.Contains(id)).ToList();
                if (missingPersonalIds.Count > 0)
                {
                    var extraPersonal = await localQuery
                        .Where(p => missingPersonalIds.Contains(p.Id))
                        .ToListAsync();
                    candidates.AddRange(extraPersonal);
                }
            }

            localProducts = candidates
                .OrderByDescending(p => ScoreSearchMatch(p, normQuery, tokens, personalUsage.GetValueOrDefault(p.Id)))
                .ThenBy(p => p.Name.Length)
                .Take(50)
                .ToList();
        }
        else
        {
            var defaultCandidates = await localQuery
                .OrderByDescending(p => p.IsVerified)
                .ThenByDescending(p => p.Id)
                .Take(100)
                .ToListAsync();

            if (personalUsage.Count > 0)
            {
                var existingIds = defaultCandidates.Select(c => c.Id).ToHashSet();
                var missingPersonalIds = personalUsage.Keys.Where(id => !existingIds.Contains(id)).ToList();
                if (missingPersonalIds.Count > 0)
                {
                    var extraPersonal = await _context.Products
                        .AsNoTracking()
                        .Include(p => p.Units)
                        .Where(p => !p.IsArchived && missingPersonalIds.Contains(p.Id))
                        .ToListAsync();
                    defaultCandidates.AddRange(extraPersonal);
                }
            }

            localProducts = defaultCandidates
                .OrderByDescending(p => personalUsage.GetValueOrDefault(p.Id))
                .ThenByDescending(p => p.IsVerified)
                .ThenByDescending(p => p.Id)
                .Take(50)
                .ToList();
        }
        results.AddRange(localProducts);

        // 2. Pobierz wyniki z Open Food Facts (jeśli podano nazwę)
        if (!string.IsNullOrWhiteSpace(name))
        {
            var offProducts = await _offService.SearchByNameAsync(name);
            
            // 3. Usuń duplikaty - produkty OFF, które mają kod kreskowy już obecny w bazie lokalnej
            var localBarcodes = localProducts
                .Where(p => !string.IsNullOrWhiteSpace(p.Barcode))
                .Select(p => p.Barcode)
                .ToHashSet();

            var uniqueOffProducts = offProducts
                .Where(p => string.IsNullOrWhiteSpace(p.Barcode) || !localBarcodes.Contains(p.Barcode))
                .ToList();

            // 4. Dodaj unikalne produkty OFF na końcu listy
            results.AddRange(uniqueOffProducts);
        }

        return Ok(results);
    }

    /// <summary>
    /// Wyszukuje produkt po kodzie kreskowym - najpierw lokalnie, potem w Open Food Facts.
    /// Nie zapisuje produktu do bazy - to robi endpoint /import.
    /// GET /api/products/barcode/5900049011034
    /// </summary>
    [HttpGet("barcode/{barcode}")]
    public async Task<ActionResult<Product>> GetByBarcode(string barcode)
    {
        // 1. Sprawdź lokalną bazę
        var localProduct = await _context.Products
            .Include(p => p.Units)
            .FirstOrDefaultAsync(p => !p.IsArchived && p.Barcode == barcode);

        if (localProduct != null)
        {
            return Ok(localProduct);
        }

        // 2. Sprawdź Open Food Facts
        var offProduct = await _offService.GetByBarcodeAsync(barcode);

        if (offProduct == null)
        {
            return NotFound(new { message = "Product not found in local database or Open Food Facts" });
        }

        return Ok(offProduct);
    }

    /// <summary>
    /// Importuje produkt (zazwyczaj z Open Food Facts) do lokalnej bazy danych.
    /// POST /api/products/import
    /// </summary>
    [HttpPost("import")]
    public async Task<ActionResult<Product>> Import([FromBody] Product product)
    {
        var unitError = ValidateUnits(product.Units);
        if (unitError != null)
        {
            return BadRequest(new { message = unitError });
        }

        // Sprawdź czy produkt z tym kodem kreskowym już istnieje
        if (!string.IsNullOrWhiteSpace(product.Barcode))
        {
            var existing = await _context.Products
                .Include(p => p.Units)
                .FirstOrDefaultAsync(p => p.Barcode == product.Barcode);

            if (existing != null)
            {
                return Conflict(new { message = "Product with this barcode already exists", existingProduct = existing });
            }
        }

        NormalizeUnitsForInsert(product);

        // Zapisz produkt
        _context.Products.Add(product);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    /// <summary>
    /// Dodaje nowy produkt do bazy danych.
    /// POST /api/products
    /// </summary>
    [HttpPost]
    [AllowAnonymous] // Produkty są globalne - seedowanie musi działać bez autoryzacji
    public async Task<ActionResult<Product>> Create([FromBody] Product product)
    {
        var unitError = ValidateUnits(product.Units);
        if (unitError != null)
        {
            return BadRequest(new { message = unitError });
        }

        NormalizeUnitsForInsert(product);

        _context.Products.Add(product);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    /// <summary>
    /// Pobiera produkt po ID (potrzebne dla CreatedAtAction).
    /// GET /api/products/{id}
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetById(int id)
    {
        var product = await _context.Products
            .Include(p => p.Units)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null)
        {
            return NotFound();
        }

        return Ok(product);
    }

    /// <summary>
    /// Aktualizuje istniejący produkt w bazie danych.
    /// Lista jednostek (Units) jest zastępowana w całości tym, co przyszło w żądaniu.
    /// PUT /api/products/{id}
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Product>> Update(int id, [FromBody] Product product)
    {
        var unitError = ValidateUnits(product.Units);
        if (unitError != null)
        {
            return BadRequest(new { message = unitError });
        }

        var existingProduct = await _context.Products
            .Include(p => p.Units)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (existingProduct == null)
        {
            return NotFound(new { message = "Product not found" });
        }

        // Aktualizuj pola
        existingProduct.Barcode = product.Barcode;
        existingProduct.Name = product.Name;
        existingProduct.Brand = product.Brand;
        existingProduct.Manufacturer = product.Manufacturer;
        existingProduct.CaloriesPer100g = product.CaloriesPer100g;
        existingProduct.ProteinPer100g = product.ProteinPer100g;
        existingProduct.FatPer100g = product.FatPer100g;
        existingProduct.SaturatedFatPer100g = product.SaturatedFatPer100g;
        existingProduct.CarbsPer100g = product.CarbsPer100g;
        existingProduct.SugarsPer100g = product.SugarsPer100g;
        existingProduct.FiberPer100g = product.FiberPer100g;
        existingProduct.SaltPer100g = product.SaltPer100g;
        existingProduct.PackageWeightGrams = product.PackageWeightGrams;
        existingProduct.DefaultServingGrams = product.DefaultServingGrams;
        existingProduct.Ingredients = product.Ingredients;

        // Zastąp listę jednostek: usuń stare, dodaj nowe
        _context.ProductUnits.RemoveRange(existingProduct.Units);
        existingProduct.Units = (product.Units ?? new List<ProductUnit>())
            .Select(u => new ProductUnit { UnitKey = u.UnitKey, GramsPerUnit = u.GramsPerUnit, ProductId = existingProduct.Id })
            .ToList();

        await _context.SaveChangesAsync();

        return Ok(existingProduct);
    }

    /// <summary>
    /// Waliduje jednostki produktu: niepusta nazwa, waga > 0, brak duplikatów.
    /// Zwraca komunikat błędu albo null, gdy wszystko jest poprawne.
    /// </summary>
    private static string? ValidateUnits(ICollection<ProductUnit>? units)
    {
        if (units == null || units.Count == 0) return null;

        foreach (var unit in units)
        {
            if (string.IsNullOrWhiteSpace(unit.UnitKey))
            {
                return "Nazwa jednostki nie może być pusta.";
            }
            if (!(unit.GramsPerUnit > 0) || unit.GramsPerUnit > 5000)
            {
                return $"Waga jednostki '{unit.UnitKey}' musi być większa od 0 i nie większa niż 5000 g.";
            }
        }

        var duplicate = units.GroupBy(u => u.UnitKey).FirstOrDefault(g => g.Count() > 1);
        if (duplicate != null)
        {
            return $"Jednostka '{duplicate.Key}' została podana więcej niż raz.";
        }

        return null;
    }

    /// <summary>
    /// Czyści Id/ProductId przysłane przez klienta, żeby EF utworzył nowe rekordy jednostek.
    /// </summary>
    private static void NormalizeUnitsForInsert(Product product)
    {
        product.Units = (product.Units ?? new List<ProductUnit>())
            .Select(u => new ProductUnit { UnitKey = u.UnitKey, GramsPerUnit = u.GramsPerUnit })
            .ToList();
    }

    /// <summary>
    /// Usuwa wszystkie przykładowe produkty (bez kodu kreskowego).
    /// DELETE /api/products/sample-products
    /// WAŻNE: Musi być PRZED endpointem DELETE {id}, aby routing działał poprawnie
    /// </summary>
    [HttpDelete("sample-products")]
    [AllowAnonymous] // Pozwól na czyszczenie bez autoryzacji dla wygody
    public async Task<ActionResult<object>> DeleteSampleProducts()
    {
        var sampleProducts = await _context.Products
            .Where(p => p.ImportBatchId == null && !p.IsVerified && (p.Barcode == null || p.Barcode == ""))
            .ToListAsync();

        if (sampleProducts.Count == 0)
        {
            return Ok(new { message = "No sample products to delete", deleted = 0 });
        }

        _context.Products.RemoveRange(sampleProducts);
        await _context.SaveChangesAsync();

        return Ok(new { message = $"Deleted {sampleProducts.Count} sample products", deleted = sampleProducts.Count });
    }

    /// <summary>
    /// Usuwa produkt po ID.
    /// DELETE /api/products/{id}
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        var product = await _context.Products.FindAsync(id);

        if (product == null)
        {
            return NotFound();
        }

        _context.Products.Remove(product);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<Dictionary<int, int>> GetPersonalUsageCountsAsync()
    {
        var clerkId = User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(clerkId))
            return new Dictionary<int, int>();

        var cutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-90));
        return await _context.DiaryEntries
            .AsNoTracking()
            .Where(d => d.ProductId != null && d.Date >= cutoff && d.User.ClerkUserId == clerkId)
            .GroupBy(d => d.ProductId!.Value)
            .Select(g => new { ProductId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ProductId, x => x.Count);
    }

    private static double ScoreSearchMatch(Product p, string normQuery, string[] tokens, int personalUsageCount)
    {
        var normName = SearchTextHelper.NormalizeForSearch(p.Name);
        var normBrand = SearchTextHelper.NormalizeForSearch(p.Brand);

        double score = 0;
        if (p.IsVerified)
            score += 1200;

        if (personalUsageCount > 0)
            score += 800 + Math.Min(personalUsageCount, 10) * 70;

        if (normName == normQuery)
            score += 600;
        else if (normName.StartsWith(normQuery, StringComparison.Ordinal))
            score += 300;
        else if (normName.Contains(" " + normQuery, StringComparison.Ordinal))
            score += 80;

        if (!string.IsNullOrEmpty(normBrand))
        {
            if (normBrand == normQuery)
                score += 250;
            else
            {
                foreach (var tok in tokens)
                {
                    if (normBrand.Contains(tok, StringComparison.Ordinal))
                        score += 120;
                }
            }
        }

        score += p.Kind switch
        {
            "generic" => 80,
            "user" => 50,
            "branded" => 10,
            _ => 0
        };

        score -= p.Name.Length * 0.5;
        return score;
    }
}
