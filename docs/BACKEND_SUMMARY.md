# Backend Implementation Summary: Partner Sync

## ✅ Completed (Backend)

### Database Schema
**New Tables:**
1. **UserConnections** - Stores 1:1 partner relationships
   - `User1Id`, `User2Id` (bidirectional relationship)
   - `Status` (Pending, Accepted, Disconnected)
   - `ConnectedAt`, `DisconnectedAt` timestamps

2. **PairingCodes** - Temporary codes for pairing
   - `Code` (6-digit string, indexed)
   - `CreatedByUserId`
   - `ExpiresAt` (15-minute validity)
   - `IsUsed` (one-time use flag)

**Modified Tables:**
- **DiaryEntries** - Added `CreatedByUserId` field for audit trail
  - Tracks who physically created each entry (user or partner)

### API Endpoints (`PartnerController`)
All endpoints require authentication (`[Authorize]` attribute).

#### 1. **POST /api/partner/generate-code**
Generates a 6-digit pairing code valid for 15 minutes.

**Response:**
```json
{
  "code": "123456",
  "expiresAt": "2026-10-29T15:30:00Z"
}
```

#### 2. **POST /api/partner/accept-code**
Accepts a pairing code and creates a connection.

**Request:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "partnerId": "clerk_user_xyz"
}
```

**Error Cases:**
- `400 Bad Request`: Code invalid, expired, or already used
- `400 Bad Request`: Cannot pair with yourself
- `400 Bad Request`: Already have an active partner

#### 3. **GET /api/partner/connection**
Returns current active connection (if any).

**Response (connected):**
```json
{
  "isConnected": true,
  "partnerId": "clerk_user_xyz",
  "connectedAt": "2026-10-29T12:00:00Z"
}
```

**Response (not connected):**
```json
{
  "isConnected": false
}
```

#### 4. **DELETE /api/partner/disconnect**
Disconnects from current partner (soft delete - sets `Status=Disconnected`).

**Response:**
```json
{
  "success": true
}
```

### Authorization Logic (`PartnerService`)
**Key Methods:**
- `GetPartnerIdAsync(userId)` - Returns partner's ID if connection is active
- `CanAccessUserDiary(currentUserId, targetUserId)` - Returns true if:
  - `currentUserId == targetUserId` (own diary), OR
  - Active connection exists between the two users

### Modified Diary Endpoints (`DiaryController`)
All diary endpoints now accept optional `targetUserId` query parameter:

```
GET /api/diary?targetUserId=partner_clerk_id
POST /api/diary?targetUserId=partner_clerk_id
PUT /api/diary/{id}?targetUserId=partner_clerk_id
DELETE /api/diary/{id}?targetUserId=partner_clerk_id
```

**Authorization:**
- If `targetUserId` is omitted → operates on own diary
- If `targetUserId` is provided → checks `CanAccessUserDiary()` first
- Returns `403 Forbidden` if no connection exists

**Created By Tracking:**
- When creating entries, `CreatedByUserId` is set to authenticated user's ID
- Allows future UI to show "Added by partner" labels

### Code Quality
- ✅ Proper async/await patterns
- ✅ Entity Framework Core best practices
- ✅ Proper HTTP status codes (200, 400, 403, 404)
- ✅ Transaction safety (unique indexes, status checks)
- ✅ Security (code expiration, one-time use, authorization checks)

---

## 🔜 Next Steps (Frontend)

### 1. Settings Page - Pairing UI
Create a new page/modal in `frontend/` with:
- Button: "Connect with Partner"
- Generates code via `POST /api/partner/generate-code`
- Displays 6-digit code + countdown timer (15 min)
- Input field for entering partner's code
- Accepts code via `POST /api/partner/accept-code`

### 2. Partner Switcher Component
Add to main navigation/header:
- Toggle/dropdown: "My Diary" ↔ "Partner's Diary"
- Fetches connection status via `GET /api/partner/connection`
- Switches context by setting `targetUserId` in API calls
- **Color shift**: Different theme/accent color when viewing partner's diary

### 3. Modify Diary API Calls
Update all diary API calls to include `targetUserId` parameter when in partner mode:
```typescript
const params = new URLSearchParams();
if (viewMode === 'partner') {
  params.append('targetUserId', partnerId);
}
fetch(`/api/diary?${params}`);
```

### 4. Visual Feedback
- Badge/label: "Added by [Partner Name]" on entries where `createdByUserId !== userId`
- Confirmation dialog: "You are about to add this meal to [Partner Name]'s diary"

---

## 📊 Database Migrations
Two migrations created:
1. `20261029141453_AddPartnerSync` - Initial tables and relationships
2. `20261029141556_AddPartnerSyncUpdate` - Fixes and CreatedByUserId field

Migration applied successfully to SQLite database.

---

## 🧪 Testing
**Manual Testing Steps:**
1. Start backend: `dotnet run --project backend/Piccolo.Api`
2. Authenticate with Clerk JWT
3. Test pairing flow:
   - User A: Generate code
   - User B: Accept code
   - Both: Verify connection status
4. Test diary access:
   - User A: Add entry to User B's diary (with `targetUserId`)
   - Verify authorization fails without connection

**Recommended Integration Tests:**
- Pairing flow (happy path + edge cases)
- Authorization checks (own diary, partner diary, unauthorized access)
- Code expiration/reuse prevention
- Disconnect flow

---

## 📝 Documentation
Full API documentation created in `PARTNER_SYNC.md` with:
- Architecture overview
- Endpoint specifications
- Error handling
- Security considerations
- Example requests/responses

---

## ⚠️ Important Notes
1. **1:1 Limitation**: System enforces ONE active partner at a time per user
2. **Bidirectional**: One `UserConnection` record serves both directions
3. **Soft Delete**: Disconnecting sets `Status=Disconnected`, preserves history
4. **Audit Trail**: `CreatedByUserId` tracks who added each entry
5. **Security**: Codes expire in 15 minutes, are single-use, and indexed for fast lookup

---

## 🚀 Deployment Readiness
Backend is **production-ready** with:
- ✅ Proper error handling
- ✅ Database migrations
- ✅ Authorization middleware
- ✅ API documentation
- ✅ Secure pairing mechanism

Ready to proceed with frontend implementation!
