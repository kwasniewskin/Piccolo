using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;

namespace Piccolo.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ProductsController(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Wyszukuje produkty, których nazwa zawiera podaną frazę.
    /// Jeśli query jest puste, zwraca wszystkie produkty (z limitem 100).
    /// GET /api/products/search?query=mleko
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<Product>>> Search([FromQuery] string? query)
    {
        IQueryable<Product> productsQuery = _context.Products;

        if (!string.IsNullOrWhiteSpace(query))
        {
            productsQuery = productsQuery.Where(p => p.Name.Contains(query));
        }

        var products = await productsQuery
            .Take(100)
            .ToListAsync();

        return Ok(products);
    }

    /// <summary>
    /// Dodaje nowy produkt do bazy danych.
    /// POST /api/products
    /// </summary>
    [HttpPost]
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
}
