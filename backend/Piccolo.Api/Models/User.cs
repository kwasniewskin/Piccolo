namespace Piccolo.Api.Models;

/// <summary>
/// Application user synced from Clerk.
/// </summary>
public class User
{
    public int Id { get; set; }
    
    /// <summary>
    /// Unique Clerk user identifier (e.g. "user_2abc123xyz").
    /// </summary>
    public required string ClerkUserId { get; set; }
    
    /// <summary>
    /// User email address from Clerk.
    /// </summary>
    public required string Email { get; set; }
    
    /// <summary>
    /// Optional display name.
    /// </summary>
    public string? Name { get; set; }
    
    /// <summary>
    /// Account creation timestamp (UTC).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Daily goals (defaults match GOALS in frontend/src/lib/nutrition.ts)

    /// <summary>
    /// Daily calorie goal (kcal).
    /// </summary>
    public double CalorieGoal { get; set; } = 2100;

    /// <summary>
    /// Daily protein goal (g).
    /// </summary>
    public double ProteinGoal { get; set; } = 130;

    /// <summary>
    /// Daily fat goal (g).
    /// </summary>
    public double FatGoal { get; set; } = 70;

    /// <summary>
    /// Daily carbohydrates goal (g).
    /// </summary>
    public double CarbsGoal { get; set; } = 235;
    
    // Navigation properties
    public ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
}
