# Partner Sync Feature - Specification & Implementation

1:1 partner synchronization enabling couples or trusted companions to share and collaborate on daily calorie diaries.

## Architecture Overview

### Data Model

#### 1. `UserConnection`
Stores bilateral 1:1 relationships between two users.
```csharp
public class UserConnection
{
    public int Id { get; set; }
    public int User1Id { get; set; }           // Pairing initiator
    public int User2Id { get; set; }           // Pairing recipient
    public ConnectionStatus Status { get; set; } // Pending, Accepted, Disconnected
    public DateTime ConnectedAt { get; set; }
    public DateTime? DisconnectedAt { get; set; }
}
```

#### 2. `PairingCode`
Short-lived, single-use 6-character pairing codes (15-minute expiration).
```csharp
public class PairingCode
{
    public int Id { get; set; }
    public string Code { get; set; }         // e.g. "A3B9X2"
    public int CreatedByUserId { get; set; }
    public DateTime ExpiresAt { get; set; }  // CreatedAt + 15 min
    public bool IsUsed { get; set; }
    public DateTime? UsedAt { get; set; }
    public int? UsedByUserId { get; set; }
}
```

#### 3. `DiaryEntry.CreatedByUserId`
Audit field tracking who physically logged each entry.
- If user `A` adds an entry to partner `B`'s diary: `UserId = B`, `CreatedByUserId = A`.
- In UI, when `createdByUserId !== userId`, an `"Added by ..."` attribution label is shown.

---

## API Endpoints

### Partner Endpoints (`/api/partner`)

#### 1. Generate Pairing Code
```http
POST /api/partner/generate-code
Authorization: Bearer <token>
```
Creates a single-use 6-character code valid for 15 minutes (rejects if user already has an active partner).

#### 2. Accept Pairing Code
```http
POST /api/partner/accept-code
Authorization: Bearer <token>
Content-Type: application/json

{ "code": "A3B9X2" }
```
Validates expiration, single-use status, prevents self-pairing, enforces 1:1 pairing constraint, and creates an `Accepted` `UserConnection`.

#### 3. Get Current Connection
```http
GET /api/partner/connection
Authorization: Bearer <token>
```
Returns active partner metadata or `404 Not Found` if not paired.

#### 4. Disconnect
```http
DELETE /api/partner/disconnect
Authorization: Bearer <token>
```
Marks the active connection as `Disconnected` and revokes cross-diary access immediately.

---

### Full CRUD Access Across Shared Diaries

Once linked (`ConnectionStatus.Accepted`), both partners share access to:
- **GET `/api/diary?date=YYYY-MM-DD&targetUserId={partnerId}`** — view partner diary
- **POST `/api/diary`** with optional `targetUserId` — log entries to partner's diary (`CreatedByUserId` set automatically from JWT)
- **PUT `/api/diary/{id}`** — edit entries owned by self or active partner
- **DELETE `/api/diary/{id}`** — delete entries owned by self or active partner

If access is revoked or unpaired, requests with `targetUserId` return `403 Forbidden`, and `PartnerProvider` automatically returns the UI to the user's own diary.

---

## Frontend Integration (`PartnerContext`)

- `activeUserId`: `partnerInfo.userId` when `isViewingPartner` is active, otherwise `undefined` (own diary).
- Background polling + tab-focus refresh (`silent: true`) keeps pairing status up to date without spinner flicker.
- **UI Color Shift**: toggles `data-viewing-partner="true"` on `<html>`, switching the theme accent palette from emerald green (own diary) to sky blue (partner's diary) across all views and portals.

## Security Guarantees

- All partner endpoints require `[Authorize]` JWT authentication.
- `PartnerService.CanAccessDiaryAsync()` checks bidirectional active `Accepted` connection before every read or write.
- 6-character alphanumeric pairing codes omit visually ambiguous characters, expire in 15 minutes, and cannot be reused.
- `CreatedByUserId` always comes from the authenticated user's JWT claim, never from client input.
