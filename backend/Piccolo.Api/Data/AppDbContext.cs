using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Models;

namespace Piccolo.Api.Data;

/// <summary>
/// Kontekst bazy danych aplikacji Piccolo.
/// </summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }
    
    public DbSet<Product> Products => Set<Product>();
    
    public DbSet<DiaryEntry> DiaryEntries => Set<DiaryEntry>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Konfiguracja relacji Product -> DiaryEntry (1:N)
        modelBuilder.Entity<DiaryEntry>()
            .HasOne(d => d.Product)
            .WithMany(p => p.DiaryEntries)
            .HasForeignKey(d => d.ProductId)
            .OnDelete(DeleteBehavior.Cascade);
        
        // Indeksy dla wydajności
        modelBuilder.Entity<DiaryEntry>()
            .HasIndex(d => d.Date);
        
        modelBuilder.Entity<DiaryEntry>()
            .HasIndex(d => d.ProductId);
    }
}
