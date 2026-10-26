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
    
    public DbSet<User> Users => Set<User>();
    
    public DbSet<Product> Products => Set<Product>();
    
    public DbSet<DiaryEntry> DiaryEntries => Set<DiaryEntry>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Konfiguracja User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.ClerkUserId).IsUnique();
            entity.HasIndex(u => u.Email);
        });
        
        // Konfiguracja relacji Product -> DiaryEntry (1:N)
        modelBuilder.Entity<DiaryEntry>(entity =>
        {
            entity.HasOne(d => d.Product)
                .WithMany(p => p.DiaryEntries)
                .HasForeignKey(d => d.ProductId)
                .OnDelete(DeleteBehavior.SetNull) // Zmieniono z Cascade na SetNull bo ProductId jest teraz opcjonalny
                .IsRequired(false); // ProductId może być null
            
            // Konfiguracja relacji User -> DiaryEntry (1:N)
            entity.HasOne(d => d.User)
                .WithMany(u => u.DiaryEntries)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            
            // Indeksy dla wydajności
            entity.HasIndex(d => d.Date);
            entity.HasIndex(d => d.ProductId);
            entity.HasIndex(d => d.UserId);
            entity.HasIndex(d => new { d.UserId, d.Date }); // Composite index dla najczęstszego query
        });
    }
}
