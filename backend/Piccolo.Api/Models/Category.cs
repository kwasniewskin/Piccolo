using System.Text.Json.Serialization;

namespace Piccolo.Api.Models;

/// <summary>
/// Kategoria produktu w taksonomii aplikacji (dwupoziomowe drzewo przez ParentId).
/// </summary>
public class Category
{
    public int Id { get; set; }

    public required string Slug { get; set; }

    public required string NamePl { get; set; }

    public int? ParentId { get; set; }

    [JsonIgnore]
    public Category? Parent { get; set; }

    [JsonIgnore]
    public ICollection<Category> Children { get; set; } = new List<Category>();

    [JsonIgnore]
    public ICollection<Product> Products { get; set; } = new List<Product>();
}
