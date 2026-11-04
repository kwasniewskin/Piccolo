using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddServingUnits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UnitKey",
                table: "DiaryEntries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "UnitQuantity",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProductUnits",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UnitKey = table.Column<string>(type: "TEXT", nullable: false),
                    GramsPerUnit = table.Column<float>(type: "REAL", nullable: false),
                    ProductId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductUnits_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductUnits_ProductId",
                table: "ProductUnits",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductUnits_ProductId_UnitKey",
                table: "ProductUnits",
                columns: new[] { "ProductId", "UnitKey" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductUnits");

            migrationBuilder.DropColumn(
                name: "UnitKey",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "UnitQuantity",
                table: "DiaryEntries");
        }
    }
}
