namespace Piccolo.Api.Models;

/// <summary>
/// 1:1 partner connection between two users.
/// A single record represents a bidirectional link.
/// </summary>
public class UserConnection
{
    public int Id { get; set; }
    
    /// <summary>
    /// ID of the first user in the connection.
    /// </summary>
    public int User1Id { get; set; }
    
    /// <summary>
    /// ID of the second user in the connection.
    /// </summary>
    public int User2Id { get; set; }
    
    /// <summary>
    /// Current connection status (Pending, Accepted, Disconnected).
    /// </summary>
    public ConnectionStatus Status { get; set; }
    
    /// <summary>
    /// User who initiated the pairing invite (User1Id or User2Id).
    /// </summary>
    public int CreatedByUserId { get; set; }
    
    /// <summary>
    /// Connection creation timestamp (UTC).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Acceptance timestamp (null unless Status == Accepted).
    /// </summary>
    public DateTime? ConnectedAt { get; set; }
    
    /// <summary>
    /// Disconnection timestamp (null unless Status == Disconnected).
    /// </summary>
    public DateTime? DisconnectedAt { get; set; }
    
    // Navigation properties
    public User User1 { get; set; } = null!;
    public User User2 { get; set; } = null!;
}
