using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace Piccolo.Api.TempModels;

public partial class TempContext : DbContext
{
    public TempContext(DbContextOptions<TempContext> options)
        : base(options)
    {
    }

    public virtual DbSet<DiaryEntry> DiaryEntries { get; set; }

    public virtual DbSet<EfmigrationsLock> EfmigrationsLocks { get; set; }

    public virtual DbSet<Product> Products { get; set; }

    public virtual DbSet<User> Users { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DiaryEntry>(entity =>
        {
            entity.HasIndex(e => e.Date, "IX_DiaryEntries_Date");

            entity.HasIndex(e => e.ProductId, "IX_DiaryEntries_ProductId");

            entity.HasIndex(e => e.UserId, "IX_DiaryEntries_UserId");

            entity.HasIndex(e => new { e.UserId, e.Date }, "IX_DiaryEntries_UserId_Date");

            entity.HasOne(d => d.Product).WithMany(p => p.DiaryEntries).HasForeignKey(d => d.ProductId);

            entity.HasOne(d => d.User).WithMany(p => p.DiaryEntries).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<EfmigrationsLock>(entity =>
        {
            entity.ToTable("__EFMigrationsLock");

            entity.Property(e => e.Id).ValueGeneratedNever();
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.ClerkUserId, "IX_Users_ClerkUserId").IsUnique();

            entity.HasIndex(e => e.Email, "IX_Users_Email");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
