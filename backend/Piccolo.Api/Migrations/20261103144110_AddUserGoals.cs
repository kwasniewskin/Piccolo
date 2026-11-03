using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserGoals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Istniejący użytkownicy dostają domyślne cele (GOALS w nutrition.ts), a nie 0.
            migrationBuilder.AddColumn<double>(
                name: "CalorieGoal",
                table: "Users",
                type: "REAL",
                nullable: false,
                defaultValue: 2100.0);

            migrationBuilder.AddColumn<double>(
                name: "CarbsGoal",
                table: "Users",
                type: "REAL",
                nullable: false,
                defaultValue: 235.0);

            migrationBuilder.AddColumn<double>(
                name: "FatGoal",
                table: "Users",
                type: "REAL",
                nullable: false,
                defaultValue: 70.0);

            migrationBuilder.AddColumn<double>(
                name: "ProteinGoal",
                table: "Users",
                type: "REAL",
                nullable: false,
                defaultValue: 130.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CalorieGoal",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CarbsGoal",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "FatGoal",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ProteinGoal",
                table: "Users");
        }
    }
}
