using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class ExpandProductModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Brand",
                table: "Products",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedByUserId",
                table: "Products",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DataSource",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<float>(
                name: "FiberPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "Products",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "PackageWeightGrams",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "SaltPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "SaturatedFatPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "SugarsPer100g",
                table: "Products",
                type: "REAL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Brand",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DataSource",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "FiberPer100g",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "ImageUrl",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PackageWeightGrams",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "SaltPer100g",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "SaturatedFatPer100g",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "SugarsPer100g",
                table: "Products");
        }
    }
}
