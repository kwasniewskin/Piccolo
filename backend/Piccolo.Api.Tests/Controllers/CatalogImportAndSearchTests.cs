using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Piccolo.Api.Data;
using Piccolo.Api.Import;
using Piccolo.Api.Models;
using Piccolo.Api.Services;
using Piccolo.Api.Tests.Helpers;
using Xunit;

namespace Piccolo.Api.Tests.Controllers;

public class CatalogImportAndSearchTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _jsonOptions;

    public CatalogImportAndSearchTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _jsonOptions = JsonHelper.GetApiJsonOptions();
        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public void SearchTextHelper_NormalizesPolishDiacriticsAndSpaces()
    {
        SearchTextHelper.NormalizeForSearch("  Żółty  Ser   Gouda 26% ")
            .Should().Be("zolty ser gouda 26%");
        SearchTextHelper.NormalizeForSearch("Pierś z Kurczaka Świeża")
            .Should().Be("piers z kurczaka swieza");
        SearchTextHelper.BuildProductSearchName("Ketchup łagodny", "Kotlin")
            .Should().Be("ketchup lagodny kotlin");
        SearchTextHelper.BuildProductSearchName("Kotlin Ketchup Kebab", "Kotlin")
            .Should().Be("kotlin ketchup kebab");
    }

    [Fact]
    public async Task Search_MatchesByBrand_EvenWhenBrandIsNotInName()
    {
        var uid = Guid.NewGuid().ToString("N")[..6];
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Products.AddRange(
                new Product
                {
                    Name = $"Ketchup łagodny {uid}",
                    Brand = "Kotlin",
                    CaloriesPer100g = 98, ProteinPer100g = 1.5, FatPer100g = 0.2, CarbsPer100g = 22,
                    Kind = "branded", IsVerified = false
                },
                new Product
                {
                    Name = $"Ketchup pikantny {uid}",
                    Brand = "Pudliszki",
                    CaloriesPer100g = 105, ProteinPer100g = 1.6, FatPer100g = 0.2, CarbsPer100g = 24,
                    Kind = "branded", IsVerified = false
                }
            );
            await db.SaveChangesAsync();
        }

        var response = await _client.GetAsync($"/api/products/search?name=ketchup kotlin {uid}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var results = await response.Content.ReadFromJsonAsync<List<Product>>(_jsonOptions);
        results.Should().NotBeNull();
        results!.Should().ContainSingle(p => p.Brand == "Kotlin");
    }

    [Fact]
    public async Task Search_BoostsFrequentlyUsedProductsForCurrentUser()
    {
        var uid = Guid.NewGuid().ToString("N")[..6];
        var generic = ProductTestHelper.CreateValidProduct($"Ketchup bazowy {uid}");
        generic.IsVerified = true;
        generic.Kind = "generic";
        var branded = ProductTestHelper.CreateValidProduct($"Ketchup ulubiony {uid}");
        branded.Brand = "MojaMarka";
        branded.Kind = "branded";
        branded.IsVerified = false;

        var gRes = await _client.PostAsJsonAsync("/api/products", generic, _jsonOptions);
        var bRes = await _client.PostAsJsonAsync("/api/products", branded, _jsonOptions);
        var gProd = (await gRes.Content.ReadFromJsonAsync<Product>(_jsonOptions))!;
        var bProd = (await bRes.Content.ReadFromJsonAsync<Product>(_jsonOptions))!;

        // User 1 loguje markowy produkt 7 razy w dzienniku -> powinien wyprzedzic nawet bazowy IsVerified
        TestAuthHandler.SwitchToUser1();
        for (int i = 0; i < 7; i++)
        {
            var dto = DiaryEntryTestHelper.CreateValidEntryDto(bProd.Id, 20, "2026-11-16", MealType.Lunch);
            var dResp = await _client.PostAsJsonAsync("/api/diary", dto, _jsonOptions);
            dResp.StatusCode.Should().Be(HttpStatusCode.Created);
        }

        var user1Resp = await _client.GetAsync($"/api/products/search?name=ketchup {uid}");
        var user1Results = (await user1Resp.Content.ReadFromJsonAsync<List<Product>>(_jsonOptions))!;
        user1Results.First().Id.Should().Be(bProd.Id);

        // User 2 nie ma historii -> na 1. miejscu nadal bazowy IsVerified
        TestAuthHandler.SwitchToUser2();
        var user2Resp = await _client.GetAsync($"/api/products/search?name=ketchup {uid}");
        var user2Results = (await user2Resp.Content.ReadFromJsonAsync<List<Product>>(_jsonOptions))!;
        user2Results.First().Id.Should().Be(gProd.Id);

        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public async Task Search_IgnoresCaseAndDiacritics_AndPrioritizesVerifiedGeneric()
    {
        var uid = Guid.NewGuid().ToString("N")[..6];
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Products.AddRange(
                new Product
                {
                    Name = $"Sok jabłkowo-bananowy {uid}",
                    CaloriesPer100g = 45, ProteinPer100g = 0.2, FatPer100g = 0.1, CarbsPer100g = 11,
                    Kind = "branded", IsVerified = false
                },
                new Product
                {
                    Name = $"Żółty banan {uid}",
                    CaloriesPer100g = 89, ProteinPer100g = 1.1, FatPer100g = 0.3, CarbsPer100g = 22.8,
                    Kind = "generic", IsVerified = true
                },
                new Product
                {
                    Name = $"Archiwalny banan {uid}",
                    CaloriesPer100g = 89, ProteinPer100g = 1.1, FatPer100g = 0.3, CarbsPer100g = 22.8,
                    IsArchived = true
                }
            );
            await db.SaveChangesAsync();
        }

        var response = await _client.GetAsync($"/api/products/search?name=zolty banan {uid}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var results = await response.Content.ReadFromJsonAsync<List<Product>>(_jsonOptions);
        results.Should().NotBeNull();
        results!.Should().ContainSingle(p => p.Name == $"Żółty banan {uid}");

        // Archiwalny produkt nie powinien pojawiac sie w wynikach
        var allBananaResp = await _client.GetAsync($"/api/products/search?name=banan {uid}");
        var allBananas = await allBananaResp.Content.ReadFromJsonAsync<List<Product>>(_jsonOptions);
        allBananas!.Should().NotContain(p => p.Name.StartsWith("Archiwalny"));
        allBananas.First().IsVerified.Should().BeTrue();
    }

    [Fact]
    public async Task CreateDiaryEntry_PopulatesProductSnapshot()
    {
        var product = ProductTestHelper.CreateValidProduct($"Snapshot Pierś {Guid.NewGuid():N}");
        product.CaloriesPer100g = 112;
        product.ProteinPer100g = 22.5;
        product.FatPer100g = 1.9;
        product.CarbsPer100g = 0;

        var createProdResp = await _client.PostAsJsonAsync("/api/products", product, _jsonOptions);
        createProdResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = (await createProdResp.Content.ReadFromJsonAsync<Product>(_jsonOptions))!;

        var dto = DiaryEntryTestHelper.CreateValidEntryDto(created.Id, 150, "2026-11-16", MealType.Lunch);
        var diaryResp = await _client.PostAsJsonAsync("/api/diary", dto, _jsonOptions);
        diaryResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var entry = (await diaryResp.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions))!;

        entry.ProductNameSnapshot.Should().Be(created.Name);
        entry.KcalPer100gSnapshot.Should().Be(112f);
        entry.ProteinPer100gSnapshot.Should().Be(22.5f);
    }

    [Fact]
    public async Task CatalogImporter_DryRun_Import_IdempotentUpsert_AndRollback_WorkEndToEnd()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), $"piccolo_imp_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmpDir);
        try
        {
            var dbPath = Path.Combine(tmpDir, "test.db");
            var catCsv = Path.Combine(tmpDir, "categories.csv");
            var jsonl = Path.Combine(tmpDir, "products.v1.jsonl");

            await File.WriteAllTextAsync(catCsv, "slug,name_pl,parent_slug\nowoce,Owoce,\nowoce-swieze,Owoce świeże,owoce\n");
            await File.WriteAllLinesAsync(jsonl, new[]
            {
                "{\"source\":\"USDA_FND\",\"externalId\":\"9991\",\"name\":\"Banan\",\"originalName\":\"Bananas\",\"category\":\"owoce-swieze\",\"kind\":\"generic\",\"state\":\"raw\",\"isVerified\":true,\"defaultServingGrams\":118,\"per100g\":{\"kcal\":89,\"protein\":1.1,\"fat\":0.3,\"carbs\":22.8,\"salt\":0.0},\"units\":[{\"key\":\"piece\",\"grams\":118}]}",
                "{\"source\":\"FITATU\",\"externalId\":\"abcd\",\"name\":\"Jogurt Test\",\"category\":\"owoce-swieze\",\"kind\":\"branded\",\"isVerified\":false,\"per100g\":{\"kcal\":60,\"protein\":4,\"fat\":2,\"carbs\":6},\"units\":[{\"key\":\"handful\",\"grams\":30}]}"
            });

            // 1. Dry-run: migruje, symuluje i cofa transakcje -> 0 produktow w bazie
            var dryCode = await CatalogImporter.RunAsync(new[] { jsonl, "--categories", catCsv, "--db", dbPath, "--dry-run", "--no-backup" });
            dryCode.Should().Be(0);

            var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={dbPath}").Options;
            await using (var db = new AppDbContext(opts))
            {
                (await db.Products.CountAsync()).Should().Be(0);
            }

            // 2. Wlasciwy import (z backupem VACUUM INTO)
            var impCode = await CatalogImporter.RunAsync(new[] { jsonl, "--categories", catCsv, "--db", dbPath });
            impCode.Should().Be(0);

            int batchId;
            int usedProdId;
            await using (var db = new AppDbContext(opts))
            {
                (await db.Products.CountAsync()).Should().Be(2);
                (await db.Categories.CountAsync()).Should().Be(2);
                (await db.ProductSourceRefs.CountAsync()).Should().Be(2);
                var batch = await db.ImportBatches.OrderByDescending(b => b.Id).FirstAsync();
                batch.Inserted.Should().Be(2);
                batchId = batch.Id;

                var banana = await db.Products.Include(p => p.Units).FirstAsync(p => p.Name == "Banan");
                banana.IsVerified.Should().BeTrue();
                banana.SearchName.Should().Be("banan");
                banana.Units.Should().ContainSingle(u => u.UnitKey == "piece" && u.GramsPerUnit == 118f);
                usedProdId = banana.Id;

                // Dodaj uzytkownika i wpis dziennika na Bananie, zeby przetestowac soft-delete przy rollbacku
                var u = new User { ClerkUserId = "c1", Email = "t@t.pl" };
                db.Users.Add(u);
                await db.SaveChangesAsync();
                db.DiaryEntries.Add(new DiaryEntry
                {
                    Date = new DateOnly(2026, 11, 16),
                    MealType = MealType.Breakfast,
                    ProductId = usedProdId,
                    AmountInGrams = 100,
                    UserId = u.Id,
                    CreatedByUserId = u.Id
                });
                await db.SaveChangesAsync();
            }

            // Backup powinien istniec i miec > 0 B
            Directory.GetFiles(Path.Combine(tmpDir, "backups"), "*.db")
                .Should().ContainSingle(f => new FileInfo(f).Length > 0);

            // 3. Ponowny import (idempotentny upsert -> 0 insert, 2 update)
            var reCode = await CatalogImporter.RunAsync(new[] { jsonl, "--categories", catCsv, "--db", dbPath, "--no-backup" });
            reCode.Should().Be(0);
            await using (var db = new AppDbContext(opts))
            {
                (await db.Products.CountAsync()).Should().Be(2);
                var batch2 = await db.ImportBatches.OrderByDescending(b => b.Id).FirstAsync();
                batch2.Inserted.Should().Be(0);
                batch2.Updated.Should().Be(2);
                batchId = batch2.Id;
            }

            // 4. Rollback: uzyty w dzienniku Banan archiwizowany, nieuzyty Jogurt usuwany
            var rbCode = await CatalogImporter.RunAsync(new[] { "--rollback", batchId.ToString(), "--db", dbPath, "--no-backup" });
            rbCode.Should().Be(0);
            await using (var db = new AppDbContext(opts))
            {
                var remaining = await db.Products.ToListAsync();
                remaining.Should().ContainSingle(p => p.Id == usedProdId && p.IsArchived);
            }
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            if (Directory.Exists(tmpDir))
                Directory.Delete(tmpDir, recursive: true);
        }
    }
}
