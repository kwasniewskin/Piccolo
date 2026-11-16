using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductCatalogImport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "Products",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "CholesterolMgPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "ImportBatchId",
                table: "Products",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "Products",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsVerified",
                table: "Products",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<float>(
                name: "MonounsaturatedFatPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "PolyunsaturatedFatPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreparationState",
                table: "Products",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SearchName",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<float>(
                name: "CarbsPer100gSnapshot",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "FatPer100gSnapshot",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "KcalPer100gSnapshot",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProductNameSnapshot",
                table: "DiaryEntries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "ProteinPer100gSnapshot",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Slug = table.Column<string>(type: "TEXT", nullable: false),
                    NamePl = table.Column<string>(type: "TEXT", nullable: false),
                    ParentId = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Categories_Categories_ParentId",
                        column: x => x.ParentId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ImportBatches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Source = table.Column<string>(type: "TEXT", nullable: false),
                    FileSha256 = table.Column<string>(type: "TEXT", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    FinishedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    Inserted = table.Column<int>(type: "INTEGER", nullable: false),
                    Updated = table.Column<int>(type: "INTEGER", nullable: false),
                    Skipped = table.Column<int>(type: "INTEGER", nullable: false),
                    Rejected = table.Column<int>(type: "INTEGER", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportBatches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProductSourceRefs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ProductId = table.Column<int>(type: "INTEGER", nullable: false),
                    Source = table.Column<string>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", nullable: false),
                    OriginalName = table.Column<string>(type: "TEXT", nullable: true),
                    MatchConfidence = table.Column<float>(type: "REAL", nullable: true),
                    ImportBatchId = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductSourceRefs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductSourceRefs_ImportBatches_ImportBatchId",
                        column: x => x.ImportBatchId,
                        principalTable: "ImportBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ProductSourceRefs_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Products_Barcode",
                table: "Products",
                column: "Barcode");

            migrationBuilder.CreateIndex(
                name: "IX_Products_CategoryId",
                table: "Products",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Products_ImportBatchId",
                table: "Products",
                column: "ImportBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_Products_IsArchived_IsVerified",
                table: "Products",
                columns: new[] { "IsArchived", "IsVerified" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_SearchName",
                table: "Products",
                column: "SearchName");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_ParentId",
                table: "Categories",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_Slug",
                table: "Categories",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductSourceRefs_ImportBatchId",
                table: "ProductSourceRefs",
                column: "ImportBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductSourceRefs_ProductId",
                table: "ProductSourceRefs",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductSourceRefs_Source_ExternalId",
                table: "ProductSourceRefs",
                columns: new[] { "Source", "ExternalId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Products_Categories_CategoryId",
                table: "Products",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Products_ImportBatches_ImportBatchId",
                table: "Products",
                column: "ImportBatchId",
                principalTable: "ImportBatches",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Backfill istniejących produktów i wpisów dziennika
            migrationBuilder.Sql(@"
                UPDATE Products
                SET SearchName = lower(
                    replace(replace(replace(replace(replace(replace(replace(replace(replace(
                    replace(replace(replace(replace(replace(replace(replace(replace(replace(
                        trim(Name || CASE WHEN Brand IS NOT NULL AND trim(Brand) <> '' THEN ' ' || Brand ELSE '' END),
                        'ą','a'),'ć','c'),'ę','e'),'ł','l'),'ń','n'),'ó','o'),'ś','s'),'ź','z'),'ż','z'),
                        'Ą','a'),'Ć','c'),'Ę','e'),'Ł','l'),'Ń','n'),'Ó','o'),'Ś','s'),'Ź','z'),'Ż','z')
                ),
                Kind = CASE WHEN Kind = '' THEN 'user' ELSE Kind END;

                UPDATE DiaryEntries
                SET ProductNameSnapshot = (SELECT p.Name FROM Products p WHERE p.Id = DiaryEntries.ProductId),
                    KcalPer100gSnapshot = (SELECT p.CaloriesPer100g FROM Products p WHERE p.Id = DiaryEntries.ProductId),
                    ProteinPer100gSnapshot = (SELECT p.ProteinPer100g FROM Products p WHERE p.Id = DiaryEntries.ProductId),
                    FatPer100gSnapshot = (SELECT p.FatPer100g FROM Products p WHERE p.Id = DiaryEntries.ProductId),
                    CarbsPer100gSnapshot = (SELECT p.CarbsPer100g FROM Products p WHERE p.Id = DiaryEntries.ProductId)
                WHERE ProductId IS NOT NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Products_Categories_CategoryId",
                table: "Products");

            migrationBuilder.DropForeignKey(
                name: "FK_Products_ImportBatches_ImportBatchId",
                table: "Products");

            migrationBuilder.DropTable(
                name: "Categories");

            migrationBuilder.DropTable(
                name: "ProductSourceRefs");

            migrationBuilder.DropTable(
                name: "ImportBatches");

            migrationBuilder.DropIndex(
                name: "IX_Products_Barcode",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Products_CategoryId",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Products_ImportBatchId",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Products_IsArchived_IsVerified",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Products_SearchName",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CholesterolMgPer100g",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "ImportBatchId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "IsVerified",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "MonounsaturatedFatPer100g",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PolyunsaturatedFatPer100g",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PreparationState",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "SearchName",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CarbsPer100gSnapshot",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "FatPer100gSnapshot",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "KcalPer100gSnapshot",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "ProductNameSnapshot",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "ProteinPer100gSnapshot",
                table: "DiaryEntries");
        }
    }
}
