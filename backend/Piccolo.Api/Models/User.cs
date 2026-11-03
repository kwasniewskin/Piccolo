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

    // Dzienne cele (domyślne wartości zgodne z GOALS w frontend/src/lib/nutrition.ts)

    /// <summary>
    /// Dzienny cel kaloryczny (kcal).
    /// </summary>
    public double CalorieGoal { get; set; } = 2100;

    /// <summary>
    /// Dzienny cel białka (g).
    /// </summary>
    public double ProteinGoal { get; set; } = 130;

    /// <summary>
    /// Dzienny cel tłuszczu (g).
    /// </summary>
    public double FatGoal { get; set; } = 70;

    /// <summary>
    /// Dzienny cel węglowodanów (g).
    /// </summary>
    public double CarbsGoal { get; set; } = 235;
    
    // Navigation properties
    public ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
}
