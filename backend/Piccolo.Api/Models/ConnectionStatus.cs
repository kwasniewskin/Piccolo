namespace Piccolo.Api.Models;

/// <summary>
/// Status połączenia między użytkownikami (parowanie partnerów).
/// </summary>
public enum ConnectionStatus
{
    /// <summary>
    /// Oczekuje na zaakceptowanie przez drugą stronę.
    /// </summary>
    Pending = 0,
    
    /// <summary>
    /// Zaakceptowane - aktywne połączenie.
    /// </summary>
    Accepted = 1,
    
    /// <summary>
    /// Rozłączone przez jedną ze stron.
    /// </summary>
    Disconnected = 2
}
