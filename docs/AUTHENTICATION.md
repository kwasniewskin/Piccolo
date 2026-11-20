# Authentication in Piccolo

Authentication is powered by **Clerk** with pre-built UI components and JWT session verification.

## Architecture Overview

### Frontend (Next.js)
- **ClerkProvider** wraps the application in `app/layout.tsx`
- **Middleware** (`middleware.ts`) protects all routes outside public auth routes (`/sign-in`, `/sign-up`)
- **Clerk components** in `TopBar` reflect sign-in state:
  - Sign In / Sign Up buttons when signed out
  - `UserButton` (avatar + account menu) when signed in
- **API layer** (`lib/api.ts`) automatically attaches the Clerk JWT token to backend requests

### Backend (ASP.NET Core)
- **JWT Bearer authentication** configured in `Program.cs`
- Validates JWT tokens issued by Clerk
- **UserService** (`Services/UserService.cs`) manages local users:
  - Provisions a local user record on first authenticated request
  - Maps the Clerk User ID to the internal integer `User.Id`
- **Controllers** enforce authorization via `[Authorize]`
- All diary queries and mutations are scoped strictly to the authenticated user (or an explicitly paired partner)

## Configuration

### Environment Variables (Frontend)
```env
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### JWT Configuration (Backend)
```json
// appsettings.json
{
  "Clerk": {
    "Authority": "https://<your-clerk-domain>.clerk.accounts.dev",
    "Audience": "piccolo-api"
  }
}
```

Ensure in the Clerk Dashboard:
1. Your JWT template includes `Audience` = `piccolo-api`
2. CORS allows requests from the frontend origin

## Authentication Flow

### 1. User Sign-In
```
User → Clerk UI → Clerk API → JWT Token → Browser (cookie/localStorage)
```

### 2. Backend Request
```
Frontend (api.ts)
  → getAuthToken() fetches JWT from Clerk
  → fetch() sends Authorization: Bearer <token>
  → Backend validates JWT signature and claims
  → UserService.GetOrCreateUserAsync() resolves or creates the local user
  → Controller returns data scoped to that user
```

### 3. Local User Provisioning
On the first authenticated request with a new Clerk token:
```
UserService
  → Reads ClerkUserId from JWT claims
  → Looks up existing User by ClerkUserId
  → If absent: inserts a new User record
  → Returns User.Id to the controller
```

## Data Model

### User (Local Database)
```csharp
public class User
{
    public int Id { get; set; }              // Internal primary key
    public string ClerkUserId { get; set; }  // Clerk user ID (e.g. "user_2...")
    public DateTime CreatedAt { get; set; }
}
```

### DiaryEntry (Linked to User)
```csharp
public class DiaryEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }          // FK → User
    public string Date { get; set; }
    public string MealType { get; set; }
    public int ProductId { get; set; }
    public double AmountInGrams { get; set; }

    public User User { get; set; }           // Navigation property
    public Product Product { get; set; }
}
```

## API Endpoints

All endpoints require:
```
Authorization: Bearer <clerk-jwt-token>
```

### Products
- `GET /api/products/search?name=milk` - searches local database and Open Food Facts
- `GET /api/products/{id}` - fetches a single product by ID

### Diary
- `GET /api/diary?date=2026-10-06` - fetches entries for the authenticated user (or paired partner) and date
- `POST /api/diary` - creates a diary entry
- `DELETE /api/diary/{id}` - deletes an entry belonging to the user or their partner

## Security Highlights

### Frontend
- JWT stored and rotated automatically by Clerk
- Protected routes enforced by Next.js middleware
- No manual token persistence in custom storage

### Backend
- Cryptographic JWT verification handled by ASP.NET Core JwtBearer
- `[Authorize]` required across API controllers
- Strict per-user / paired-partner authorization checks

### Operational Rules
- **Never** commit `.env.local` or `appsettings.Local.json` containing real credentials
- **Never** expose `CLERK_SECRET_KEY` on the client
- Use separate keys for development and production environments
- Rotate keys regularly in the Clerk Dashboard

## Local Verification

1. Start backend: `cd backend/Piccolo.Api && dotnet run`
2. Start frontend: `cd frontend && npm run dev`
3. Open `http://localhost:3000`
4. Sign in via Clerk
5. Once authenticated, the user avatar appears in the top bar
6. Log a food item — it is saved with your internal `UserId`

### Database Inspection
```sql
SELECT * FROM Users;
SELECT * FROM DiaryEntries WHERE UserId = 1;
```

## Troubleshooting

### `401 Unauthorized` on every request
- Verify `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set in `.env.local`
- Check Clerk middleware execution and `getAuthHeaders()`
- Inspect backend authentication logs

### Backend rejects valid tokens
- Confirm `Clerk:Authority` matches your Clerk instance URL
- Confirm the Clerk JWT template sets the expected audience / issuer

## References

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk + Next.js Quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [ASP.NET Core JWT Bearer Authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/)
- [Clerk Dashboard](https://dashboard.clerk.com/)
