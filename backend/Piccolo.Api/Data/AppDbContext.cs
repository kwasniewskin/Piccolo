using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Models;
using Piccolo.Api.Services;

namespace Piccolo.Api.Data;

/// <summary>
/// Entity Framework Core database context for Piccolo.
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

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();

    public DbSet<ProductSourceRef> ProductSourceRefs => Set<ProductSourceRef>();

    public override int SaveChanges()
    {
        NormalizeProductSearchFields();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        NormalizeProductSearchFields();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void NormalizeProductSearchFields()
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<Product>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.SearchName = SearchTextHelper.BuildProductSearchName(entry.Entity.Name, entry.Entity.Brand);
                if (entry.Entity.CreatedAt == default)
                    entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.SearchName = SearchTextHelper.BuildProductSearchName(entry.Entity.Name, entry.Entity.Brand);
                entry.Entity.UpdatedAt = now;
            }
        }
    }
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // User configuration
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.ClerkUserId).IsUnique();
            entity.HasIndex(u => u.Email);
        });
        
        // PairingCode configuration
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
        
        // UserConnection configuration
        modelBuilder.Entity<UserConnection>(entity =>
        {
            entity.HasIndex(uc => new { uc.User1Id, uc.User2Id }).IsUnique();
            entity.HasIndex(uc => uc.Status);
            
            // User1 and User2 relationships
            entity.HasOne(uc => uc.User1)
                .WithMany()
                .HasForeignKey(uc => uc.User1Id)
                .OnDelete(DeleteBehavior.Restrict); // Prevent cascading delete cycles
            
            entity.HasOne(uc => uc.User2)
                .WithMany()
                .HasForeignKey(uc => uc.User2Id)
                .OnDelete(DeleteBehavior.Restrict);
        });
        
        // Product -> DiaryEntry relationship (1:N)
        modelBuilder.Entity<DiaryEntry>(entity =>
        {
            entity.HasOne(d => d.Product)
                .WithMany(p => p.DiaryEntries)
                .HasForeignKey(d => d.ProductId)
                .OnDelete(DeleteBehavior.SetNull) // SetNull because ProductId is optional for custom entries
                .IsRequired(false); // ProductId may be null
            
            // User -> DiaryEntry relationship (1:N)
            entity.HasOne(d => d.User)
                .WithMany(u => u.DiaryEntries)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            
            // Query performance indexes
            entity.HasIndex(d => d.Date);
            entity.HasIndex(d => d.ProductId);
            entity.HasIndex(d => d.UserId);
            entity.HasIndex(d => d.CreatedByUserId);
            entity.HasIndex(d => new { d.UserId, d.Date }); // Composite index for the most common diary query
        });
        
        // Product -> ProductUnit relationship (1:N)
        modelBuilder.Entity<ProductUnit>(entity =>
        {
            entity.HasOne(u => u.Product)
                .WithMany(p => p.Units)
                .HasForeignKey(u => u.ProductId)
                .OnDelete(DeleteBehavior.Cascade); // Cascade-delete serving units with parent product
            
            // Indexes
            entity.HasIndex(u => u.ProductId);
            entity.HasIndex(u => new { u.ProductId, u.UnitKey }); // Composite index for unit lookups
        });

        // Category configuration
        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasIndex(c => c.Slug).IsUnique();
            entity.HasOne(c => c.Parent)
                .WithMany(c => c.Children)
                .HasForeignKey(c => c.ParentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Product configuration
        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasIndex(p => p.SearchName);
            entity.HasIndex(p => p.Barcode);
            entity.HasIndex(p => p.CategoryId);
            entity.HasIndex(p => new { p.IsArchived, p.IsVerified });

            entity.HasOne(p => p.Category)
                .WithMany(c => c.Products)
                .HasForeignKey(p => p.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(p => p.ImportBatch)
                .WithMany()
                .HasForeignKey(p => p.ImportBatchId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ProductSourceRef configuration
        modelBuilder.Entity<ProductSourceRef>(entity =>
        {
            entity.HasIndex(r => new { r.Source, r.ExternalId }).IsUnique();
            entity.HasIndex(r => r.ProductId);

            entity.HasOne(r => r.Product)
                .WithMany(p => p.SourceRefs)
                .HasForeignKey(r => r.ProductId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.ImportBatch)
                .WithMany()
                .HasForeignKey(r => r.ImportBatchId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
