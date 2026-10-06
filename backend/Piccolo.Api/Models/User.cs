namespace Piccolo.Api.Models;

/// <summary>
/// Użytkownik aplikacji - synchronizowany z Clerk.
/// </summary>
public class User
{
    public int Id { get; set; }
    
    /// <summary>
    /// Clerk User ID (np. "user_2abc123xyz"). Unikalny identyfikator z Clerk.
    /// </summary>
    public required string ClerkUserId { get; set; }
    
    /// <summary>
    /// Email użytkownika (z Clerk).
    /// </summary>
    public required string Email { get; set; }
    
    /// <summary>
    /// Imię użytkownika (opcjonalne).
    /// </summary>
    public string? Name { get; set; }
    
    /// <summary>
    /// Data utworzenia konta.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
}
