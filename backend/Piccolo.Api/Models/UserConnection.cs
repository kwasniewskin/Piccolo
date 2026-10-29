namespace Piccolo.Api.Models;

/// <summary>
/// Połączenie między dwoma użytkownikami (relacja partnerska 1:1).
/// Jeden rekord reprezentuje dwukierunkową relację.
/// </summary>
public class UserConnection
{
    public int Id { get; set; }
    
    /// <summary>
    /// ID pierwszego użytkownika w połączeniu.
    /// </summary>
    public int User1Id { get; set; }
    
    /// <summary>
    /// ID drugiego użytkownika w połączeniu.
    /// </summary>
    public int User2Id { get; set; }
    
    /// <summary>
    /// Status połączenia (Pending, Accepted, Disconnected).
    /// </summary>
    public ConnectionStatus Status { get; set; }
    
    /// <summary>
    /// Który użytkownik utworzył zaproszenie (User1Id lub User2Id).
    /// </summary>
    public int CreatedByUserId { get; set; }
    
    /// <summary>
    /// Data utworzenia połączenia/zaproszenia.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Data zaakceptowania połączenia (null jeśli Status != Accepted).
    /// </summary>
    public DateTime? ConnectedAt { get; set; }
    
    /// <summary>
    /// Data rozłączenia (null jeśli Status != Disconnected).
    /// </summary>
    public DateTime? DisconnectedAt { get; set; }
    
    // Navigation properties
    public User User1 { get; set; } = null!;
    public User User2 { get; set; } = null!;
}
