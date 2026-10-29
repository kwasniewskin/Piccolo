using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Piccolo.Api.Tests.Helpers;

/// <summary>
/// Custom authentication handler for testing that automatically authenticates requests
/// with a fake user identity. Supports multiple test users for isolation testing.
/// </summary>
public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string AuthenticationScheme = "TestScheme";
    
    // Default test user (User 1)
    public const string TestUser1ClerkId = "test-user-clerk-1";
    public const string TestUser1Email = "test1@piccolo.com";
    public const string TestUser1Name = "Test User 1";
    
    // Second test user (User 2) for isolation testing
    public const string TestUser2ClerkId = "test-user-clerk-2";
    public const string TestUser2Email = "test2@piccolo.com";
    public const string TestUser2Name = "Test User 2";

    // Current user context (can be switched for multi-user tests)
    private static string _currentClerkId = TestUser1ClerkId;
    private static string _currentEmail = TestUser1Email;
    private static string _currentName = TestUser1Name;

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) 
        : base(options, logger, encoder)
    {
    }

    /// <summary>
    /// Switch authentication context to User 1 (default test user).
    /// </summary>
    public static void SwitchToUser1()
    {
        _currentClerkId = TestUser1ClerkId;
        _currentEmail = TestUser1Email;
        _currentName = TestUser1Name;
    }

    /// <summary>
    /// Switch authentication context to User 2 (for isolation testing).
    /// </summary>
    public static void SwitchToUser2()
    {
        _currentClerkId = TestUser2ClerkId;
        _currentEmail = TestUser2Email;
        _currentName = TestUser2Name;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, _currentClerkId),
            new Claim(ClaimTypes.Name, _currentName),
            new Claim(ClaimTypes.Email, _currentEmail)
        };

        var identity = new ClaimsIdentity(claims, AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, AuthenticationScheme);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
