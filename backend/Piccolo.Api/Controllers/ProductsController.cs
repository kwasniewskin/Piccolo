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
        IQueryable<Product> localQuery = _context.Products;
        
        if (!string.IsNullOrWhiteSpace(name))
        {
            localQuery = localQuery.Where(p => p.Name.Contains(name));
        }

        var localProducts = await localQuery.Take(100).ToListAsync();
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
            .FirstOrDefaultAsync(p => p.Barcode == barcode);

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
        // Sprawdź czy produkt z tym kodem kreskowym już istnieje
        if (!string.IsNullOrWhiteSpace(product.Barcode))
        {
            var existing = await _context.Products
                .FirstOrDefaultAsync(p => p.Barcode == product.Barcode);

            if (existing != null)
            {
                return Conflict(new { message = "Product with this barcode already exists", existingProduct = existing });
            }
        }

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
        var product = await _context.Products.FindAsync(id);

        if (product == null)
        {
            return NotFound();
        }

        return Ok(product);
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
            .Where(p => p.Barcode == null || p.Barcode == "")
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
}
