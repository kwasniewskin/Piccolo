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
    
    public DbSet<PairingCode> PairingCodes => Set<PairingCode>();
    
    public DbSet<UserConnection> UserConnections => Set<UserConnection>();
    
    public DbSet<ProductUnit> ProductUnits => Set<ProductUnit>();
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Konfiguracja User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.ClerkUserId).IsUnique();
            entity.HasIndex(u => u.Email);
        });
        
        // Konfiguracja PairingCode
        modelBuilder.Entity<PairingCode>(entity =>
        {
            entity.HasIndex(p => p.Code).IsUnique();
            entity.HasIndex(p => p.CreatedByUserId);
            entity.HasIndex(p => new { p.Code, p.IsUsed, p.ExpiresAt });
            
            entity.HasOne(p => p.CreatedByUser)
                .WithMany()
                .HasForeignKey(p => p.CreatedByUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        
        // Konfiguracja UserConnection
        modelBuilder.Entity<UserConnection>(entity =>
        {
            entity.HasIndex(uc => new { uc.User1Id, uc.User2Id }).IsUnique();
            entity.HasIndex(uc => uc.Status);
            
            // Relacje User1 i User2
            entity.HasOne(uc => uc.User1)
                .WithMany()
                .HasForeignKey(uc => uc.User1Id)
                .OnDelete(DeleteBehavior.Restrict); // Zapobiegamy kaskadowemu usunięciu
            
            entity.HasOne(uc => uc.User2)
                .WithMany()
                .HasForeignKey(uc => uc.User2Id)
                .OnDelete(DeleteBehavior.Restrict);
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
            entity.HasIndex(d => d.CreatedByUserId);
            entity.HasIndex(d => new { d.UserId, d.Date }); // Composite index dla najczęstszego query
        });
        
        // Konfiguracja relacji Product -> ProductUnit (1:N)
        modelBuilder.Entity<ProductUnit>(entity =>
        {
            entity.HasOne(u => u.Product)
                .WithMany(p => p.Units)
                .HasForeignKey(u => u.ProductId)
                .OnDelete(DeleteBehavior.Cascade); // Kaskadowe usuwanie jednostek przy usunięciu produktu
            
            // Indeksy
            entity.HasIndex(u => u.ProductId);
            entity.HasIndex(u => new { u.ProductId, u.UnitKey }); // Composite index dla wyszukiwania jednostek produktu
        });
    }
}
