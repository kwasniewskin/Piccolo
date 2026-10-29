namespace Piccolo.Api.Models;

/// <summary>
/// Kod parowania do łączenia użytkowników. 
/// Ważny przez 15 minut, jednorazowy.
/// </summary>
public class PairingCode
{
    public int Id { get; set; }
    
    /// <summary>
    /// 6-cyfrowy kod parowania (np. "123456").
    /// </summary>
    public required string Code { get; set; }
    
    /// <summary>
    /// ID użytkownika, który wygenerował kod.
    /// </summary>
    public int CreatedByUserId { get; set; }
    
    /// <summary>
    /// Data utworzenia kodu.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Data wygaśnięcia kodu (CreatedAt + 15 minut).
    /// </summary>
    public DateTime ExpiresAt { get; set; }
    
    /// <summary>
    /// Czy kod został już użyty (zaakceptowany lub odrzucony).
    /// </summary>
    public bool IsUsed { get; set; }
    
    /// <summary>
    /// ID użytkownika, który użył kodu (zaakceptował lub odrzucił).
    /// </summary>
    public int? UsedByUserId { get; set; }
    
    /// <summary>
    /// Data użycia kodu.
    /// </summary>
    public DateTime? UsedAt { get; set; }
    
    // Navigation property
    public User CreatedByUser { get; set; } = null!;
}
