namespace Piccolo.Api.Models;

/// <summary>
/// Pairing code for linking two partner accounts.
/// Single-use, valid for 15 minutes.
/// </summary>
public class PairingCode
{
    public int Id { get; set; }
    
    /// <summary>
    /// 6-digit pairing code (e.g. "123456").
    /// </summary>
    public required string Code { get; set; }
    
    /// <summary>
    /// ID of the user who generated the code.
    /// </summary>
    public int CreatedByUserId { get; set; }
    
    /// <summary>
    /// Code creation timestamp (UTC).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Code expiration timestamp (CreatedAt + 15 minutes).
    /// </summary>
    public DateTime ExpiresAt { get; set; }
    
    /// <summary>
    /// Whether the code has already been consumed.
    /// </summary>
    public bool IsUsed { get; set; }
    
    /// <summary>
    /// ID of the user who redeemed the code.
    /// </summary>
    public int? UsedByUserId { get; set; }
    
    /// <summary>
    /// Redemption timestamp (UTC).
    /// </summary>
    public DateTime? UsedAt { get; set; }
    
    // Navigation property
    public User CreatedByUser { get; set; } = null!;
}
