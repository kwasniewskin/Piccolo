using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Piccolo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPartnerSync : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<double>(
                name: "AmountInGrams",
                table: "DiaryEntries",
                type: "REAL",
                nullable: true,
                oldClrType: typeof(double),
                oldType: "REAL");

            migrationBuilder.AddColumn<int>(
                name: "CreatedByUserId",
                table: "DiaryEntries",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Backfill CreatedByUserId = UserId for existing diary entries
            migrationBuilder.Sql(
                "UPDATE DiaryEntries SET CreatedByUserId = UserId WHERE CreatedByUserId = 0");

            migrationBuilder.CreateTable(
                name: "PairingCodes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Code = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsUsed = table.Column<bool>(type: "INTEGER", nullable: false),
                    UsedByUserId = table.Column<int>(type: "INTEGER", nullable: true),
                    UsedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedByUserId1 = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PairingCodes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PairingCodes_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PairingCodes_Users_CreatedByUserId1",
                        column: x => x.CreatedByUserId1,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserConnections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    User1Id = table.Column<int>(type: "INTEGER", nullable: false),
                    User2Id = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ConnectedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DisconnectedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserConnections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserConnections_Users_User1Id",
                        column: x => x.User1Id,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserConnections_Users_User2Id",
                        column: x => x.User2Id,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiaryEntries_CreatedByUserId",
                table: "DiaryEntries",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PairingCodes_Code",
                table: "PairingCodes",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PairingCodes_Code_IsUsed_ExpiresAt",
                table: "PairingCodes",
                columns: new[] { "Code", "IsUsed", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PairingCodes_CreatedByUserId",
                table: "PairingCodes",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PairingCodes_CreatedByUserId1",
                table: "PairingCodes",
                column: "CreatedByUserId1");

            migrationBuilder.CreateIndex(
                name: "IX_UserConnections_Status",
                table: "UserConnections",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_UserConnections_User1Id_User2Id",
                table: "UserConnections",
                columns: new[] { "User1Id", "User2Id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserConnections_User2Id",
                table: "UserConnections",
                column: "User2Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PairingCodes");

            migrationBuilder.DropTable(
                name: "UserConnections");

            migrationBuilder.DropIndex(
                name: "IX_DiaryEntries_CreatedByUserId",
                table: "DiaryEntries");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "DiaryEntries");

            migrationBuilder.AlterColumn<double>(
                name: "AmountInGrams",
                table: "DiaryEntries",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0,
                oldClrType: typeof(double),
                oldType: "REAL",
                oldNullable: true);
        }
    }
}
