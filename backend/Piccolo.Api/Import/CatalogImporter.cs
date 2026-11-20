using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;
using Piccolo.Api.Services;

namespace Piccolo.Api.Import;

/// <summary>
/// Idempotentny importer katalogu produktow (JSONL) z kopia zapasowa VACUUM INTO, trybem dry-run i rollbackiem.
/// </summary>
public static class CatalogImporter
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static async Task<int> RunAsync(string[] args)
    {
        if (args.Length == 0)
        {
            PrintUsage();
            return 1;
        }

        string dbPath = "piccolo.db";
        string? categoriesPath = null;
        string? jsonlPath = null;
        bool dryRun = false;
        bool skipBackup = false;
        int? rollbackBatchId = null;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--db" when i + 1 < args.Length:
                    dbPath = args[++i];
                    break;
                case "--categories" when i + 1 < args.Length:
                    categoriesPath = args[++i];
                    break;
                case "--dry-run":
                    dryRun = true;
                    break;
                case "--no-backup":
                    skipBackup = true;
                    break;
                case "--rollback" when i + 1 < args.Length:
                    if (!int.TryParse(args[++i], out var bid))
                    {
                        Console.Error.WriteLine("Nieprawidlowy ID batcha dla --rollback.");
                        return 1;
                    }
                    rollbackBatchId = bid;
                    break;
                default:
                    if (!args[i].StartsWith("--") && jsonlPath == null)
                        jsonlPath = args[i];
                    break;
            }
        }

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        optionsBuilder.UseSqlite($"Data Source={dbPath}");

        await using var db = new AppDbContext(optionsBuilder.Options);

        if (rollbackBatchId.HasValue)
        {
            return await RollbackBatchAsync(db, dbPath, rollbackBatchId.Value, dryRun, skipBackup);
        }

        if (string.IsNullOrWhiteSpace(jsonlPath) || !File.Exists(jsonlPath))
        {
            Console.Error.WriteLine($"Brak pliku JSONL: {jsonlPath}");
            PrintUsage();
            return 1;
        }

        // 1. Walidacja wejscia przed jakimkolwiek zapisem do bazy
        var (items, rejectedLines) = await ParseAndValidateJsonlAsync(jsonlPath);
        if (items.Count == 0)
        {
            Console.Error.WriteLine("Plik JSONL nie zawiera poprawnych rekordow.");
            return 1;
        }

        var categoryRows = !string.IsNullOrWhiteSpace(categoriesPath) && File.Exists(categoriesPath)
            ? ParseCategoriesCsv(categoriesPath)
            : new List<CategoryRow>();

        var fileSha = await ComputeSha256Async(jsonlPath);
        Console.WriteLine($"Plik: {jsonlPath} (SHA256: {fileSha[..12]}...), poprawnych: {items.Count}, odrzuconych: {rejectedLines}");

        // 2. Consistent backup before import (unless dry-run or skipped in tests)
        if (!dryRun && !skipBackup && File.Exists(dbPath))
        {
            var backupOk = await CreateAndVerifyBackupAsync(dbPath);
            if (!backupOk)
            {
                Console.Error.WriteLine("PRZERWANO: nie udalo sie utworzyc lub zweryfikowac kopii zapasowej.");
                return 2;
            }
        }

        // 3. Migracja + import w jednej transakcji
        await db.Database.MigrateAsync();
        await using var tx = await db.Database.BeginTransactionAsync();

        try
        {
            var categoryIdBySlug = await UpsertCategoriesAsync(db, categoryRows);

            var batch = new ImportBatch
            {
                Source = "CATALOG_V1",
                FileSha256 = fileSha,
                StartedAt = DateTime.UtcNow,
                Status = dryRun ? "DryRun" : "Running",
                Rejected = rejectedLines,
                Notes = Path.GetFileName(jsonlPath)
            };
            db.ImportBatches.Add(batch);
            await db.SaveChangesAsync();

            var existingRefs = await db.ProductSourceRefs
                .ToDictionaryAsync(r => (r.Source, r.ExternalId), r => r.ProductId);

            var existingBarcodeOwners = await db.Products
                .Where(p => p.Barcode != null && p.Barcode != "")
                .Select(p => new { p.Id, Barcode = p.Barcode! })
                .ToDictionaryAsync(x => x.Barcode, x => x.Id);

            // Deduplikacja w ramach tego samego pliku po (source, externalId)
            int inserted = 0, updated = 0, skipped = 0;
            var newProducts = new List<(Product Product, CanonicalProductDto Dto)>();

            var toUpdateIds = items
                .Where(dto => existingRefs.ContainsKey((dto.Source, dto.ExternalId)))
                .Select(dto => existingRefs[(dto.Source, dto.ExternalId)])
                .Distinct()
                .ToHashSet();

            var existingProductsById = toUpdateIds.Count > 0
                ? await db.Products.Include(p => p.Units)
                    .Where(p => toUpdateIds.Contains(p.Id))
                    .ToDictionaryAsync(p => p.Id)
                : new Dictionary<int, Product>();

            foreach (var dto in items)
            {
                categoryIdBySlug.TryGetValue(dto.Category ?? string.Empty, out var catIdValue);
                int? catId = string.IsNullOrWhiteSpace(dto.Category) || catIdValue == 0 ? null : catIdValue;

                if (existingRefs.TryGetValue((dto.Source, dto.ExternalId), out var existingProdId)
                    && existingProductsById.TryGetValue(existingProdId, out var existing))
                {
                    ApplyDtoToProduct(existing, dto, catId, batch.Id, existingBarcodeOwners);
                    db.ProductUnits.RemoveRange(existing.Units);
                    existing.Units = dto.Units
                        .Select(u => new ProductUnit { UnitKey = u.Key, GramsPerUnit = u.Grams, ProductId = existing.Id })
                        .ToList();
                    updated++;
                }
                else
                {
                    var product = new Product { Name = dto.Name };
                    ApplyDtoToProduct(product, dto, catId, batch.Id, existingBarcodeOwners);
                    product.Units = dto.Units
                        .Select(u => new ProductUnit { UnitKey = u.Key, GramsPerUnit = u.Grams })
                        .ToList();
                    db.Products.Add(product);
                    newProducts.Add((product, dto));
                    inserted++;
                }

                if ((inserted + updated) % 1000 == 0)
                {
                    await db.SaveChangesAsync();
                    FlushSourceRefs(db, newProducts, existingRefs, batch.Id);
                    newProducts.Clear();
                    await db.SaveChangesAsync();
                }
            }

            await db.SaveChangesAsync();
            if (newProducts.Count > 0)
            {
                FlushSourceRefs(db, newProducts, existingRefs, batch.Id);
                await db.SaveChangesAsync();
            }

            batch.Inserted = inserted;
            batch.Updated = updated;
            batch.Skipped = skipped;
            batch.FinishedAt = DateTime.UtcNow;
            batch.Status = dryRun ? "DryRun" : "Completed";
            await db.SaveChangesAsync();

            if (dryRun)
            {
                await tx.RollbackAsync();
                Console.WriteLine($"[DRY-RUN] Symulacja OK (zmiany wycofane): inserted={inserted}, updated={updated}, rejected={rejectedLines}");
                return 0;
            }

            await tx.CommitAsync();
            Console.WriteLine($"[IMPORT OK] batchId={batch.Id}, inserted={inserted}, updated={updated}, rejected={rejectedLines}");
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync();
            Console.Error.WriteLine($"BLAD IMPORTU (transakcja wycofana): {ex.Message}");
            return 3;
        }

        // 4. Post-import database integrity check
        if (!await VerifyDatabaseIntegrityAsync(dbPath))
        {
            Console.Error.WriteLine("OSTRZEZENIE: kontrola spojnosci po imporcie zwrocila bledy!");
            return 4;
        }

        return 0;
    }

    private static void FlushSourceRefs(
        AppDbContext db,
        List<(Product Product, CanonicalProductDto Dto)> newProducts,
        Dictionary<(string, string), int> existingRefs,
        int batchId)
    {
        foreach (var (product, dto) in newProducts)
        {
            if (!existingRefs.ContainsKey((dto.Source, dto.ExternalId)))
            {
                db.ProductSourceRefs.Add(new ProductSourceRef
                {
                    ProductId = product.Id,
                    Source = dto.Source,
                    ExternalId = dto.ExternalId,
                    OriginalName = dto.OriginalName,
                    MatchConfidence = dto.IsVerified ? 1.0f : null,
                    ImportBatchId = batchId
                });
                existingRefs[(dto.Source, dto.ExternalId)] = product.Id;
            }
        }
    }

    private static void ApplyDtoToProduct(
        Product p,
        CanonicalProductDto dto,
        int? categoryId,
        int batchId,
        Dictionary<string, int> existingBarcodeOwners)
    {
        p.Name = dto.Name;
        p.SearchName = SearchTextHelper.BuildProductSearchName(dto.Name, dto.Brand);
        p.Brand = dto.Brand;
        p.Manufacturer = dto.Manufacturer;
        if (!string.IsNullOrWhiteSpace(dto.Barcode))
        {
            var bc = dto.Barcode.Trim();
            if (!existingBarcodeOwners.TryGetValue(bc, out var ownerId) || (p.Id > 0 && ownerId == p.Id))
            {
                p.Barcode = bc;
                if (p.Id > 0) existingBarcodeOwners[bc] = p.Id;
                else existingBarcodeOwners[bc] = -1;
            }
        }
        if (!string.IsNullOrWhiteSpace(dto.Ingredients))
            p.Ingredients = dto.Ingredients;
        if (!string.IsNullOrWhiteSpace(dto.ImageUrl))
            p.ImageUrl = dto.ImageUrl;
        p.CategoryId = categoryId;
        p.Kind = string.IsNullOrWhiteSpace(dto.Kind) ? "generic" : dto.Kind;
        p.PreparationState = dto.State;
        p.DataSource = dto.Source;
        p.IsVerified = dto.IsVerified;
        p.IsArchived = false;
        p.ImportBatchId = batchId;
        p.PackageWeightGrams = dto.PackageWeightGrams;
        p.DefaultServingGrams = dto.DefaultServingGrams;

        p.CaloriesPer100g = dto.Per100g.Kcal;
        p.ProteinPer100g = dto.Per100g.Protein;
        p.FatPer100g = dto.Per100g.Fat;
        p.CarbsPer100g = dto.Per100g.Carbs;
        p.SaturatedFatPer100g = dto.Per100g.SaturatedFat;
        p.SugarsPer100g = dto.Per100g.Sugars;
        p.FiberPer100g = dto.Per100g.Fiber;
        p.SaltPer100g = dto.Per100g.Salt;
        p.CholesterolMgPer100g = dto.Per100g.CholesterolMg;
        p.MonounsaturatedFatPer100g = dto.Per100g.MonounsaturatedFat;
        p.PolyunsaturatedFatPer100g = dto.Per100g.PolyunsaturatedFat;
    }

    private static async Task<Dictionary<string, int>> UpsertCategoriesAsync(AppDbContext db, List<CategoryRow> rows)
    {
        var existing = await db.Categories.ToDictionaryAsync(c => c.Slug);
        foreach (var row in rows)
        {
            if (!existing.TryGetValue(row.Slug, out var cat))
            {
                cat = new Category { Slug = row.Slug, NamePl = row.NamePl };
                db.Categories.Add(cat);
                existing[row.Slug] = cat;
            }
            else
            {
                cat.NamePl = row.NamePl;
            }
        }
        await db.SaveChangesAsync();

        foreach (var row in rows.Where(r => !string.IsNullOrWhiteSpace(r.ParentSlug)))
        {
            if (existing.TryGetValue(row.Slug, out var child) && existing.TryGetValue(row.ParentSlug!, out var parent))
            {
                child.ParentId = parent.Id;
            }
        }
        await db.SaveChangesAsync();

        return existing.ToDictionary(kv => kv.Key, kv => kv.Value.Id);
    }

    private static async Task<int> RollbackBatchAsync(AppDbContext db, string dbPath, int batchId, bool dryRun, bool skipBackup)
    {
        var batch = await db.ImportBatches.FirstOrDefaultAsync(b => b.Id == batchId);
        if (batch == null)
        {
            Console.Error.WriteLine($"Nie znaleziono batcha o ID={batchId}.");
            return 1;
        }

        if (!dryRun && !skipBackup && File.Exists(dbPath))
        {
            if (!await CreateAndVerifyBackupAsync(dbPath))
                return 2;
        }

        await using var tx = await db.Database.BeginTransactionAsync();
        var usedProductIds = await db.DiaryEntries
            .Where(d => d.ProductId != null)
            .Select(d => d.ProductId!.Value)
            .Distinct()
            .ToListAsync();
        var usedSet = usedProductIds.ToHashSet();

        var batchProducts = await db.Products.Where(p => p.ImportBatchId == batchId).ToListAsync();
        int archived = 0, deleted = 0;

        foreach (var p in batchProducts)
        {
            if (usedSet.Contains(p.Id))
            {
                p.IsArchived = true;
                archived++;
            }
            else
            {
                db.Products.Remove(p);
                deleted++;
            }
        }

        batch.Status = dryRun ? batch.Status : "RolledBack";
        await db.SaveChangesAsync();

        if (dryRun)
        {
            await tx.RollbackAsync();
            Console.WriteLine($"[DRY-RUN ROLLBACK] batchId={batchId}: do usuniecia={deleted}, do archiwizacji={archived}");
            return 0;
        }

        await tx.CommitAsync();
        Console.WriteLine($"[ROLLBACK OK] batchId={batchId}: usunieto={deleted}, zarchiwizowano={archived}");
        return 0;
    }

    private static async Task<bool> CreateAndVerifyBackupAsync(string dbPath)
    {
        var fullDb = Path.GetFullPath(dbPath);
        var backupDir = Path.Combine(Path.GetDirectoryName(fullDb)!, "backups");
        Directory.CreateDirectory(backupDir);
        var backupPath = Path.Combine(backupDir, $"piccolo-{DateTime.UtcNow:yyyyMMdd-HHmmss}.db");

        await using (var con = new SqliteConnection($"Data Source={fullDb}"))
        {
            await con.OpenAsync();
            await using var cmd = con.CreateCommand();
            cmd.CommandText = $"VACUUM INTO '{backupPath.Replace("'", "''")}';";
            await cmd.ExecuteNonQueryAsync();
        }

        var info = new FileInfo(backupPath);
        if (!info.Exists || info.Length == 0)
        {
            Console.Error.WriteLine($"Backup ma 0 bajtow: {backupPath}");
            return false;
        }

        await using (var bcon = new SqliteConnection($"Data Source={backupPath}"))
        {
            await bcon.OpenAsync();
            await using var cmd = bcon.CreateCommand();
            cmd.CommandText = "PRAGMA integrity_check;";
            var res = (await cmd.ExecuteScalarAsync())?.ToString();
            if (!string.Equals(res, "ok", StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"Integrity check backupu nie powiodl sie: {res}");
                return false;
            }
        }

        Console.WriteLine($"Kopia zapasowa OK: {backupPath} ({info.Length:N0} B)");
        return true;
    }

    private static async Task<bool> VerifyDatabaseIntegrityAsync(string dbPath)
    {
        await using var con = new SqliteConnection($"Data Source={dbPath}");
        await con.OpenAsync();

        await using (var fk = con.CreateCommand())
        {
            fk.CommandText = "PRAGMA foreign_key_check;";
            await using var r = await fk.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                Console.Error.WriteLine("Wykryto naruszenie klucza obcego (foreign_key_check)!");
                return false;
            }
        }

        await using (var qc = con.CreateCommand())
        {
            qc.CommandText = "PRAGMA quick_check;";
            var res = (await qc.ExecuteScalarAsync())?.ToString();
            if (!string.Equals(res, "ok", StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"quick_check: {res}");
                return false;
            }
        }

        return true;
    }

    private static async Task<(List<CanonicalProductDto> Items, int Rejected)> ParseAndValidateJsonlAsync(string path)
    {
        var items = new List<CanonicalProductDto>();
        var seen = new HashSet<(string, string)>();
        int rejected = 0;

        using var reader = new StreamReader(path);
        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            CanonicalProductDto? dto;
            try
            {
                dto = JsonSerializer.Deserialize<CanonicalProductDto>(line, JsonOpts);
            }
            catch
            {
                rejected++;
                continue;
            }

            if (dto == null
                || string.IsNullOrWhiteSpace(dto.Source)
                || string.IsNullOrWhiteSpace(dto.ExternalId)
                || string.IsNullOrWhiteSpace(dto.Name)
                || dto.Per100g == null
                || dto.Per100g.Kcal < 0 || dto.Per100g.Protein < 0 || dto.Per100g.Fat < 0 || dto.Per100g.Carbs < 0)
            {
                rejected++;
                continue;
            }

            if (!seen.Add((dto.Source, dto.ExternalId)))
            {
                rejected++;
                continue;
            }

            dto.Units = (dto.Units ?? new List<CanonicalUnitDto>())
                .Where(u => !string.IsNullOrWhiteSpace(u.Key) && u.Grams > 0 && u.Grams <= 5000)
                .GroupBy(u => u.Key)
                .Select(g => g.First())
                .ToList();

            items.Add(dto);
        }

        return (items, rejected);
    }

    private static List<CategoryRow> ParseCategoriesCsv(string path)
    {
        var list = new List<CategoryRow>();
        foreach (var line in File.ReadLines(path).Skip(1))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var parts = line.Split(',');
            if (parts.Length < 2) continue;
            list.Add(new CategoryRow(
                parts[0].Trim(),
                parts[1].Trim(),
                parts.Length >= 3 && !string.IsNullOrWhiteSpace(parts[2]) ? parts[2].Trim() : null));
        }
        return list;
    }

    private static async Task<string> ComputeSha256Async(string path)
    {
        await using var stream = File.OpenRead(path);
        var hash = await SHA256.HashDataAsync(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static void PrintUsage()
    {
        Console.WriteLine("Uzycie:");
        Console.WriteLine("  dotnet run -- import-catalog <products.v1.jsonl> [--categories categories.csv] [--db piccolo.db] [--dry-run]");
        Console.WriteLine("  dotnet run -- import-catalog --rollback <batchId> [--db piccolo.db] [--dry-run]");
    }

    private sealed record CategoryRow(string Slug, string NamePl, string? ParentSlug);

    public sealed class CanonicalProductDto
    {
        public string Source { get; set; } = "";
        public string ExternalId { get; set; } = "";
        public string Name { get; set; } = "";
        public string? OriginalName { get; set; }
        public string? Brand { get; set; }
        public string? Manufacturer { get; set; }
        public string? Barcode { get; set; }
        public string? Ingredients { get; set; }
        public string? ImageUrl { get; set; }
        public string? Category { get; set; }
        public string? Kind { get; set; }
        public string? State { get; set; }
        public bool IsVerified { get; set; }
        public float? PackageWeightGrams { get; set; }
        public float? DefaultServingGrams { get; set; }
        public CanonicalNutrientsDto Per100g { get; set; } = new();
        public List<CanonicalUnitDto> Units { get; set; } = new();
    }

    public sealed class CanonicalNutrientsDto
    {
        public double Kcal { get; set; }
        public double Protein { get; set; }
        public double Fat { get; set; }
        public double Carbs { get; set; }
        public float? SaturatedFat { get; set; }
        public float? Sugars { get; set; }
        public float? Fiber { get; set; }
        public float? Salt { get; set; }
        public float? CholesterolMg { get; set; }
        public float? MonounsaturatedFat { get; set; }
        public float? PolyunsaturatedFat { get; set; }
    }

    public sealed class CanonicalUnitDto
    {
        public string Key { get; set; } = "";
        public float Grams { get; set; }
    }
}
