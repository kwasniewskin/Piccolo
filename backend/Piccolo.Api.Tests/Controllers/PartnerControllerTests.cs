using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Piccolo.Api.Models;
using Piccolo.Api.Tests.Helpers;
using Xunit;

namespace Piccolo.Api.Tests.Controllers;

/// <summary>
/// Partner Sync integration tests covering E2E multi-browser scenarios.
/// Tests share an in-memory database via IClassFixture, so each test disconnects at the end.
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
        expiresAt.Should().EndWith("Z", "frontend parses timestamps without a timezone as local time");
        DateTime.Parse(expiresAt!).ToUniversalTime().Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task GenerateCode_Twice_ReturnsNewCodeAndInvalidatesPrevious()
    {
        await EnsureDisconnectedAsync();

        var first = await GenerateCodeAsync();
        var second = await GenerateCodeAsync();

        second.Should().NotBe(first);

        // Old code must no longer work
        TestAuthHandler.SwitchToUser2();
        var response = await AcceptCodeAsync(first);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        TestAuthHandler.SwitchToUser1();
    }

    [Fact]
    public async Task PairDisconnectAndPairAgain_SamePair_Succeeds()
    {
        await EnsureDisconnectedAsync();

        // 1. Initial pairing: User1 generates code, User2 accepts
        var code1 = await GenerateCodeAsync();
        TestAuthHandler.SwitchToUser2();
        (await AcceptCodeAsync(code1)).StatusCode.Should().Be(HttpStatusCode.OK);

        // Code creator (User1) sees the connection without further action
        TestAuthHandler.SwitchToUser1();
        (await _client.GetAsync("/api/partner/connection")).StatusCode.Should().Be(HttpStatusCode.OK);

        // 2. Disconnection triggered by accepting user
        TestAuthHandler.SwitchToUser2();
        (await _client.DeleteAsync("/api/partner/disconnect")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 3. Generating a new code after disconnecting works
        var code2 = await GenerateCodeAsync();

        // 4. Re-pairing the same pair (previously threw 500 on unique index conflict)
        TestAuthHandler.SwitchToUser1();
        var response = await AcceptCodeAsync(code2);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var connection = await response.Content.ReadFromJsonAsync<ConnectionDto>(_jsonOptions);
        connection!.Status.Should().Be(ConnectionStatus.Accepted);
        connection.PartnerName.Should().Be(TestAuthHandler.TestUser2Name);

        // Both users observe the active connection
        (await _client.GetAsync("/api/partner/connection")).StatusCode.Should().Be(HttpStatusCode.OK);
        TestAuthHandler.SwitchToUser2();
        (await _client.GetAsync("/api/partner/connection")).StatusCode.Should().Be(HttpStatusCode.OK);

        await EnsureDisconnectedAsync();
    }
}
