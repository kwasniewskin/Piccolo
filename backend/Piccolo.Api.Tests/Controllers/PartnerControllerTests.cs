using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Piccolo.Api.Models;
using Piccolo.Api.Tests.Helpers;
using Xunit;

namespace Piccolo.Api.Tests.Controllers;

/// <summary>
/// Testy integracyjne Partner Sync – scenariusze wykryte w testach E2E na dwóch przeglądarkach.
/// Testy współdzielą bazę (IClassFixture), więc każdy kończy bez aktywnego połączenia.
/// </summary>
public class PartnerControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;

    public PartnerControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _jsonOptions = JsonHelper.GetApiJsonOptions();
        TestAuthHandler.SwitchToUser1();
    }

    private async Task<string> GenerateCodeAsync()
    {
        var response = await _client.PostAsync("/api/partner/generate-code", null);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<GeneratePairingCodeResponse>(_jsonOptions);
        return body!.Code;
    }

    private Task<HttpResponseMessage> AcceptCodeAsync(string code) =>
        _client.PostAsJsonAsync("/api/partner/accept-code", new AcceptPairingCodeRequest { Code = code }, _jsonOptions);

    private async Task EnsureDisconnectedAsync()
    {
        TestAuthHandler.SwitchToUser1();
        await _client.DeleteAsync("/api/partner/disconnect");
        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public async Task GenerateCode_ReturnsExpiresAtAsUtcWithZSuffix()
    {
        await EnsureDisconnectedAsync();

        var response = await _client.PostAsync("/api/partner/generate-code", null);
        var json = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(json);
        var expiresAt = doc.RootElement.GetProperty("expiresAt").GetString();
        expiresAt.Should().EndWith("Z", "frontend parsuje datę bez strefy jako czas lokalny");
        DateTime.Parse(expiresAt!).ToUniversalTime().Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task GenerateCode_Twice_ReturnsNewCodeAndInvalidatesPrevious()
    {
        await EnsureDisconnectedAsync();

        var first = await GenerateCodeAsync();
        var second = await GenerateCodeAsync();

        second.Should().NotBe(first);

        // Stary kod nie powinien już działać
        TestAuthHandler.SwitchToUser2();
        var response = await AcceptCodeAsync(first);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public async Task PairDisconnectAndPairAgain_SamePair_Succeeds()
    {
        await EnsureDisconnectedAsync();

        // 1. Pierwsze parowanie: User1 generuje, User2 akceptuje
        var code1 = await GenerateCodeAsync();
        TestAuthHandler.SwitchToUser2();
        (await AcceptCodeAsync(code1)).StatusCode.Should().Be(HttpStatusCode.OK);

        // Generujący (User1) widzi połączenie bez akcji z jego strony
        TestAuthHandler.SwitchToUser1();
        (await _client.GetAsync("/api/partner/connection")).StatusCode.Should().Be(HttpStatusCode.OK);

        // 2. Rozłączenie przez akceptującego
        TestAuthHandler.SwitchToUser2();
        (await _client.DeleteAsync("/api/partner/disconnect")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 3. Generowanie kodu po rozłączeniu działa
        var code2 = await GenerateCodeAsync();

        // 4. Ponowne parowanie tej samej pary (wcześniej: naruszenie unikalnego indeksu → 500)
        TestAuthHandler.SwitchToUser1();
        var response = await AcceptCodeAsync(code2);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var connection = await response.Content.ReadFromJsonAsync<ConnectionDto>(_jsonOptions);
        connection!.Status.Should().Be(ConnectionStatus.Accepted);
        connection.PartnerName.Should().Be(TestAuthHandler.TestUser2Name);

        // Obie strony widzą aktywne połączenie
        (await _client.GetAsync("/api/partner/connection")).StatusCode.Should().Be(HttpStatusCode.OK);
        TestAuthHandler.SwitchToUser2();
        (await _client.GetAsync("/api/partner/connection")).StatusCode.Should().Be(HttpStatusCode.OK);

        await EnsureDisconnectedAsync();
    }
}
