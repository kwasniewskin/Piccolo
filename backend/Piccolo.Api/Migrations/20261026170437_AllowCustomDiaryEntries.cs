using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AllowCustomDiaryEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DiaryEntries_Products_ProductId",
                table: "DiaryEntries");

            migrationBuilder.AlterColumn<int>(
                name: "ProductId",
                table: "DiaryEntries",
                type: "INTEGER",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "INTEGER");

            migrationBuilder.AddColumn<float>(
                name: "CustomCalories",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "CustomCarbs",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "CustomFat",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomName",
                table: "DiaryEntries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "CustomProtein",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_DiaryEntries_Products_ProductId",
                table: "DiaryEntries",
                column: "ProductId",
                principalTable: "Products",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DiaryEntries_Products_ProductId",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "CustomCalories",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "CustomCarbs",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "CustomFat",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "CustomName",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "CustomProtein",
                table: "DiaryEntries");

            migrationBuilder.AlterColumn<int>(
                name: "ProductId",
                table: "DiaryEntries",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_DiaryEntries_Products_ProductId",
                table: "DiaryEntries",
                column: "ProductId",
                principalTable: "Products",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
