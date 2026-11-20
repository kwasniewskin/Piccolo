namespace Piccolo.Api.Models;

/// <summary>
/// Connection status between two users (partner sync).
/// </summary>
public enum ConnectionStatus
{
    /// <summary>
    /// Waiting for acceptance by the other user.
    /// </summary>
    Pending = 0,
    
    /// <summary>
    /// Accepted active connection.
    /// </summary>
    Accepted = 1,
    
    /// <summary>
    /// Disconnected by either user.
    /// </summary>
    Disconnected = 2
}
