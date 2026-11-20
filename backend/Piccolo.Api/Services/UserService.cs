using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;

namespace Piccolo.Api.Services;

/// <summary>
/// Service managing users and syncing profiles from Clerk JWT claims.
/// </summary>
public class UserService
{
    private readonly AppDbContext _context;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public UserService(AppDbContext context, IHttpContextAccessor httpContextAccessor)
    {
        _context = context;
        _httpContextAccessor = httpContextAccessor;
    }

    /// <summary>
    /// Fetches or creates a local user based on Clerk JWT claims.
    /// </summary>
    public async Task<User> GetOrCreateCurrentUserAsync()
    {
        var httpContext = _httpContextAccessor.HttpContext 
            ?? throw new InvalidOperationException("HttpContext is not available");

        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException("User ID not found in token");

        var email = httpContext.User.FindFirst(ClaimTypes.Email)?.Value
            ?? httpContext.User.FindFirst("email")?.Value
            ?? throw new UnauthorizedAccessException("Email not found in token");

        var name = httpContext.User.FindFirst(ClaimTypes.Name)?.Value
            ?? httpContext.User.FindFirst("name")?.Value;

        // Check if user already exists
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.ClerkUserId == clerkUserId);

        if (user == null)
        {
            // Create new user record
            user = new User
            {
                ClerkUserId = clerkUserId,
                Email = email,
                Name = name,
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();
        }
        else
        {
            // Update email/name if changed in Clerk
            var updated = false;
            
            if (user.Email != email)
            {
                user.Email = email;
                updated = true;
            }

            if (user.Name != name)
            {
                user.Name = name;
                updated = true;
            }

            if (updated)
            {
                await _context.SaveChangesAsync();
            }
        }

        return user;
    }

    /// <summary>
    /// Returns the internal ID of the currently authenticated user.
    /// </summary>
    public async Task<int> GetCurrentUserIdAsync()
    {
        var user = await GetOrCreateCurrentUserAsync();
        return user.Id;
    }
}
