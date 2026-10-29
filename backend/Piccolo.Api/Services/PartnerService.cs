using Microsoft.EntityFrameworkCore;
using Piccolo.Api.Data;
using Piccolo.Api.Models;

namespace Piccolo.Api.Services;

/// <summary>
/// Serwis do zarządzania połączeniami partnerskimi (Partner Sync).
/// </summary>
public class PartnerService
{
    private readonly AppDbContext _context;
    private static readonly Random _random = new Random();

    public PartnerService(AppDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Generuje unikalny 6-cyfrowy kod parowania.
    /// </summary>
    public async Task<PairingCode> GeneratePairingCodeAsync(int userId)
    {
        // Sprawdź, czy użytkownik nie ma już aktywnego kodu
        var existingCode = await _context.PairingCodes
            .Where(pc => pc.CreatedByUserId == userId && !pc.IsUsed && pc.ExpiresAt > DateTime.UtcNow)
            .FirstOrDefaultAsync();

        if (existingCode != null)
        {
            return existingCode;
        }

        // Generuj kod dopóki nie będzie unikalny
        string code;
        bool isUnique;
        do
        {
            code = _random.Next(100000, 999999).ToString();
            isUnique = !await _context.PairingCodes.AnyAsync(pc => pc.Code == code && !pc.IsUsed);
        } while (!isUnique);

        var pairingCode = new PairingCode
        {
            Code = code,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddMinutes(15),
            IsUsed = false
        };

        _context.PairingCodes.Add(pairingCode);
        await _context.SaveChangesAsync();

        return pairingCode;
    }

    public async Task<(bool Success, string? ErrorMessage, UserConnection? Connection)> AcceptPairingCodeAsync(int acceptingUserId, string code)
    {
        var pairingCode = await _context.PairingCodes
            .Include(pc => pc.CreatedByUser)
            .FirstOrDefaultAsync(pc => pc.Code == code);

        if (pairingCode == null)
            return (false, "Kod parowania nie istnieje.", null);
        if (pairingCode.IsUsed)
            return (false, "Kod parowania został już użyty.", null);
        if (pairingCode.ExpiresAt < DateTime.UtcNow)
            return (false, "Kod parowania wygasł.", null);
        if (pairingCode.CreatedByUserId == acceptingUserId)
            return (false, "Nie możesz zaakceptować własnego kodu.", null);

        var existingConnection = await GetActiveConnectionAsync(acceptingUserId);
        if (existingConnection != null)
            return (false, "Masz już aktywne połączenie z partnerem.", null);

        var creatorConnection = await GetActiveConnectionAsync(pairingCode.CreatedByUserId);
        if (creatorConnection != null)
            return (false, "Użytkownik, który stworzył kod, ma już aktywne połączenie.", null);

        pairingCode.IsUsed = true;
        pairingCode.UsedByUserId = acceptingUserId;
        pairingCode.UsedAt = DateTime.UtcNow;

        var user1Id = Math.Min(pairingCode.CreatedByUserId, acceptingUserId);
        var user2Id = Math.Max(pairingCode.CreatedByUserId, acceptingUserId);

        var connection = new UserConnection
        {
            User1Id = user1Id,
            User2Id = user2Id,
            Status = ConnectionStatus.Accepted,
            CreatedByUserId = pairingCode.CreatedByUserId,
            CreatedAt = DateTime.UtcNow,
            ConnectedAt = DateTime.UtcNow
        };

        _context.UserConnections.Add(connection);
        await _context.SaveChangesAsync();

        return (true, null, connection);
    }

    public async Task<UserConnection?> GetActiveConnectionAsync(int userId)
    {
        return await _context.UserConnections
            .Include(uc => uc.User1)
            .Include(uc => uc.User2)
            .FirstOrDefaultAsync(uc =>
                (uc.User1Id == userId || uc.User2Id == userId) &&
                uc.Status == ConnectionStatus.Accepted);
    }

    public async Task<User?> GetPartnerAsync(int userId)
    {
        var connection = await GetActiveConnectionAsync(userId);
        if (connection == null) return null;
        return connection.User1Id == userId ? connection.User2 : connection.User1;
    }

    public async Task<bool> DisconnectAsync(int userId)
    {
        var connection = await GetActiveConnectionAsync(userId);
        if (connection == null) return false;

        connection.Status = ConnectionStatus.Disconnected;
        connection.DisconnectedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> CanAccessDiaryAsync(int requestingUserId, int targetUserId)
    {
        if (requestingUserId == targetUserId) return true;

        var connection = await _context.UserConnections
            .FirstOrDefaultAsync(uc =>
                ((uc.User1Id == requestingUserId && uc.User2Id == targetUserId) ||
                 (uc.User2Id == requestingUserId && uc.User1Id == targetUserId)) &&
                uc.Status == ConnectionStatus.Accepted);

        return connection != null;
    }
}
