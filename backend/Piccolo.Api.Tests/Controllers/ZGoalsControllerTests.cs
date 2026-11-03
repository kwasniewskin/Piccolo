using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Piccolo.Api.Models;
using Piccolo.Api.Tests.Helpers;
using Xunit;

namespace Piccolo.Api.Tests.Controllers;

/// <summary>
/// Testy celów kalorycznych – każdy użytkownik ma własne cele,
/// a partner widzi cele właściciela oglądanego dziennika.
/// Każdy test kończy bez aktywnego połączenia (baza współdzielona przez IClassFixture).
/// </summary>
[Collection("Sequential")]
public class ZGoalsControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;

    public ZGoalsControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _jsonOptions = JsonHelper.GetApiJsonOptions();
        TestAuthHandler.SwitchToUser1();
    }

    private async Task<int> GetCurrentUserIdAsync()
    {
        // Najprostszy sposób: utworzyć wpis, odczytać UserId, usunąć wpis i ponownie sprawdzić, czy nie ma wycieków.
        var entry = DiaryEntryTestHelper.CreateCustomEntryDto("Temp probe", 1, 0, 0, 0, "2099-12-31", MealType.Snack);
        var response = await _client.PostAsJsonAsync("/api/diary", entry, _jsonOptions);
        var created = await response.Content.ReadFromJsonAsync<DiaryEntry>(_jsonOptions);
        var userId = created!.UserId;
        await _client.DeleteAsync($"/api/diary/{created.Id}");
        return userId;
    }

    private async Task ConnectUsersAsync()
    {
        TestAuthHandler.SwitchToUser1();
        await _client.DeleteAsync("/api/partner/disconnect");

        var codeResponse = await _client.PostAsync("/api/partner/generate-code", null);
        var code = (await codeResponse.Content.ReadFromJsonAsync<GeneratePairingCodeResponse>(_jsonOptions))!.Code;

        TestAuthHandler.SwitchToUser2();
        var accept = await _client.PostAsJsonAsync("/api/partner/accept-code", new AcceptPairingCodeRequest { Code = code }, _jsonOptions);
        accept.StatusCode.Should().Be(HttpStatusCode.OK);
        TestAuthHandler.SwitchToUser1();
    }

    private async Task DisconnectAsync()
    {
        TestAuthHandler.SwitchToUser1();
        await _client.DeleteAsync("/api/partner/disconnect");
    }

    private Task<HttpResponseMessage> PutGoalsAsync(double kcal, double protein, double fat, double carbs) =>
        _client.PutAsJsonAsync("/api/goals", new GoalsDto { Kcal = kcal, Protein = protein, Fat = fat, Carbs = carbs }, _jsonOptions);

    [Fact]
    public async Task UpdateGoals_ThenGet_ReturnsSavedGoals()
    {
        await DisconnectAsync();
        TestAuthHandler.SwitchToUser1();

        (await PutGoalsAsync(1800, 120, 60, 200)).StatusCode.Should().Be(HttpStatusCode.OK);

        var goals = await _client.GetFromJsonAsync<GoalsDto>("/api/goals", _jsonOptions);
        goals!.Kcal.Should().Be(1800);
        goals.Protein.Should().Be(120);
        goals.Fat.Should().Be(60);
        goals.Carbs.Should().Be(200);
    }

    [Fact]
    public async Task UpdateGoals_WithOutOfRangeValues_ReturnsBadRequest()
    {
        await DisconnectAsync();
        TestAuthHandler.SwitchToUser1();

        (await PutGoalsAsync(20000, 100, 50, 200)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await PutGoalsAsync(2000, -1, 50, 200)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetGoals_ForConnectedPartner_ReturnsPartnersGoalsNotOwn()
    {
        await DisconnectAsync();

        // Resetuj cele obu użytkowników do domyślnych przed testem
        TestAuthHandler.SwitchToUser1();
        await PutGoalsAsync(2100, 150, 70, 250);
        var user1Id = await GetCurrentUserIdAsync();

        TestAuthHandler.SwitchToUser2();
        await PutGoalsAsync(2100, 150, 70, 250);
        var user2Id = await GetCurrentUserIdAsync();

        // Teraz każdy ustawia różne cele
        TestAuthHandler.SwitchToUser1();
        await PutGoalsAsync(2100, 130, 70, 235);

        TestAuthHandler.SwitchToUser2();
        await PutGoalsAsync(900, 60, 30, 100);

        await ConnectUsersAsync();
        try
        {
            // User1 ogląda dziennik User2 → widzi 900
            TestAuthHandler.SwitchToUser1();
            var partnerGoals = await _client.GetFromJsonAsync<GoalsDto>($"/api/goals?targetUserId={user2Id}", _jsonOptions);
            partnerGoals!.Kcal.Should().Be(900);

            // Własne cele User1 bez zmian
            var ownGoals = await _client.GetFromJsonAsync<GoalsDto>("/api/goals", _jsonOptions);
            ownGoals!.Kcal.Should().Be(2100);

            // User2 ogląda dziennik User1 → widzi 2100
            TestAuthHandler.SwitchToUser2();
            var user1Goals = await _client.GetFromJsonAsync<GoalsDto>($"/api/goals?targetUserId={user1Id}", _jsonOptions);
            user1Goals!.Kcal.Should().Be(2100);
        }
        finally
        {
            await DisconnectAsync();
        }
    }

    [Fact]
    public async Task GetGoals_ForNotConnectedUser_ReturnsForbidden()
    {
        await DisconnectAsync();

        TestAuthHandler.SwitchToUser2();
        var user2Id = await GetCurrentUserIdAsync();

        TestAuthHandler.SwitchToUser1();

        var response = await _client.GetAsync($"/api/goals?targetUserId={user2Id}");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
