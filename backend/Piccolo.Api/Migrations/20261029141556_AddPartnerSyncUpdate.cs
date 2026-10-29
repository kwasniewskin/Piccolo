using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPartnerSyncUpdate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PairingCodes_Users_CreatedByUserId1",
                table: "PairingCodes");

            migrationBuilder.DropIndex(
                name: "IX_PairingCodes_CreatedByUserId1",
                table: "PairingCodes");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId1",
                table: "PairingCodes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CreatedByUserId1",
                table: "PairingCodes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_PairingCodes_CreatedByUserId1",
                table: "PairingCodes",
                column: "CreatedByUserId1");

            migrationBuilder.AddForeignKey(
                name: "FK_PairingCodes_Users_CreatedByUserId1",
                table: "PairingCodes",
                column: "CreatedByUserId1",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
