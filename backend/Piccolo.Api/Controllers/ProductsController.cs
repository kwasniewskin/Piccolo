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
    /// Hybrid product search: local database first, then Open Food Facts.
    /// Local results are always ranked first and barcode duplicates are deduplicated.
    /// GET /api/products/search?name=milk&amp;lang=en
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<Product>>> Search([FromQuery] string? name, [FromQuery] string? lang = "pl")
    {
        var results = new List<Product>();

        // 1. Fetch matches from the local database (records with Id > 0)
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

        // 2. Query Open Food Facts when a search term is provided
        if (!string.IsNullOrWhiteSpace(name))
        {
            var offProducts = await _offService.SearchByNameAsync(name, lang ?? "pl");
            
            // 3. Deduplicate OFF results whose barcode already exists locally
            var localBarcodes = localProducts
                .Where(p => !string.IsNullOrWhiteSpace(p.Barcode))
                .Select(p => p.Barcode)
                .ToHashSet();

            var uniqueOffProducts = offProducts
                .Where(p => string.IsNullOrWhiteSpace(p.Barcode) || !localBarcodes.Contains(p.Barcode))
                .ToList();

            // 4. Append unique OFF products after local results
            results.AddRange(uniqueOffProducts);
        }

        return Ok(results);
    }

    /// <summary>
    /// Looks up a product by barcode: local database first, then Open Food Facts.
    /// Does not persist OFF products automatically (see POST /import).
    /// GET /api/products/barcode/5900049011034?lang=en
    /// </summary>
    [HttpGet("barcode/{barcode}")]
    public async Task<ActionResult<Product>> GetByBarcode(string barcode, [FromQuery] string? lang = "pl")
    {
        // 1. Check local database
        var localProduct = await _context.Products
            .Include(p => p.Units)
            .FirstOrDefaultAsync(p => !p.IsArchived && p.Barcode == barcode);

        if (localProduct != null)
        {
            return Ok(localProduct);
        }

        // 2. Fallback to Open Food Facts
        var offProduct = await _offService.GetByBarcodeAsync(barcode, lang ?? "pl");

        if (offProduct == null)
        {
            return NotFound(new { message = "Product not found in local database or Open Food Facts" });
        }

        return Ok(offProduct);
    }

    /// <summary>
    /// Imports a product (typically from Open Food Facts) into the local database.
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

        // Check if a product with this barcode already exists
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

        // Persist product
        _context.Products.Add(product);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    /// <summary>
    /// Creates a new product in the database.
    /// POST /api/products
    /// </summary>
    [HttpPost]
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
    /// Fetches a product by ID (used by CreatedAtAction).
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
    /// Updates an existing product in the database.
    /// The Units collection is replaced in full with the units provided in the request.
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

        // Update product fields
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

        // Replace serving units: remove previous entries and insert new ones
        _context.ProductUnits.RemoveRange(existingProduct.Units);
        existingProduct.Units = (product.Units ?? new List<ProductUnit>())
            .Select(u => new ProductUnit { UnitKey = u.UnitKey, GramsPerUnit = u.GramsPerUnit, ProductId = existingProduct.Id })
            .ToList();

        await _context.SaveChangesAsync();

        return Ok(existingProduct);
    }

    /// <summary>
    /// Validates product serving units: non-empty key, grams > 0, no duplicates.
    /// Returns an error message or null when valid.
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
    /// Strips client-supplied Id/ProductId so EF creates fresh ProductUnit records.
    /// </summary>
    private static void NormalizeUnitsForInsert(Product product)
    {
        product.Units = (product.Units ?? new List<ProductUnit>())
            .Select(u => new ProductUnit { UnitKey = u.UnitKey, GramsPerUnit = u.GramsPerUnit })
            .ToList();
    }

    /// <summary>
    /// Deletes all sample/unverified user products without a barcode or import batch.
    /// DELETE /api/products/sample-products
    /// NOTE: Must be declared BEFORE DELETE {id} for route matching.
    /// </summary>
    [HttpDelete("sample-products")]
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
    /// Deletes a product by ID.
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
