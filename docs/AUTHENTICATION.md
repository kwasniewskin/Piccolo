# Autentykacja w Piccolo

System autentykacji został zaimplementowany przy użyciu **Clerk** - nowoczesnej platformy autentykacyjnej z wbudowanym UI.

## Przegląd architektury

### Frontend (Next.js)
- **ClerkProvider** opakowuje całą aplikację w `layout.tsx`
- **Middleware** (`middleware.ts`) chroni wszystkie trasy poza publicznymi (`/sign-in`, `/sign-up`)
- **Komponenty Clerk** w TopBar pokazują stan logowania:
  - Przyciski Sign In / Sign Up gdy użytkownik niezalogowany
  - UserButton (avatar + menu) gdy użytkownik zalogowany
- **API Layer** (`lib/api.ts`) automatycznie dołącza JWT token do wszystkich requestów

### Backend (ASP.NET Core)
- **JWT Authentication** zintegrowany w `Program.cs`
- Weryfikuje tokeny JWT wydane przez Clerk
- **UserService** (`Services/UserService.cs`) zarządza użytkownikami:
  - Tworzy użytkownika w lokalnej bazie przy pierwszym logowaniu
  - Mapuje Clerk User ID → lokalny User ID
- **Kontrolery** wymagają autoryzacji przez `[Authorize]`
- Dane są filtrowane per użytkownik (każdy widzi tylko swoje wpisy)

## Konfiguracja

### Zmienne środowiskowe (Frontend)
```env
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### Konfiguracja JWT (Backend)
```json
// appsettings.json
{
  "Clerk": {
    "Authority": "https://<your-clerk-domain>.clerk.accounts.dev",
    "Audience": "piccolo-api"
  }
}
```

Upewnij się, że w Clerk Dashboard:
1. JWT Template ma ustawiony `Audience` = `piccolo-api`
2. CORS dla backendu jest włączony

## Przepływ autentykacji

### 1. Użytkownik loguje się
```
User → Clerk UI → Clerk API → JWT Token → Browser (cookie/localStorage)
```

### 2. Request do backendu
```
Frontend (api.ts)
  → getAuthToken() pobiera token z Clerk
  → fetch() z header Authorization: Bearer <token>
  → Backend weryfikuje token JWT
  → UserService.GetOrCreateUserAsync() tworzy/pobiera użytkownika
  → Kontroler zwraca dane dla tego użytkownika
```

### 3. Tworzenie użytkownika w bazie
Przy pierwszym requestie z nowym tokenem:
```
UserService
  → Odczytuje ClerkUserId z JWT claims
  → Sprawdza czy User z tym ClerkUserId istnieje
  → Jeśli nie: tworzy nowy rekord User
  → Zwraca User.Id dla kontrolera
```

## Model danych

### User (baza lokalna)
```csharp
public class User
{
    public int Id { get; set; }              // Lokalny ID
    public string ClerkUserId { get; set; }  // ID z Clerk (np. "user_2...")
    public DateTime CreatedAt { get; set; }
}
```

### DiaryEntry (z relacją do User)
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

## Endpointy API

Wszystkie endpointy wymagają nagłówka:
```
Authorization: Bearer <clerk-jwt-token>
```

### Produkty
- `GET /api/products/search?query=mleko` - wyszukuje produkty
- `GET /api/products/{id}` - pobiera produkt po ID

### Dziennik
- `GET /api/diary?date=2026-10-06` - pobiera wpisy dla danego użytkownika i daty
- `POST /api/diary` - tworzy wpis dla zalogowanego użytkownika
- `DELETE /api/diary/{id}` - usuwa wpis (tylko jeśli należy do użytkownika)

## Bezpieczeństwo

### Frontend
✅ Token JWT przechowywany przez Clerk (bezpieczne cookie)
✅ Automatyczne odświeżanie tokenu
✅ Protected routes przez middleware
✅ Brak ręcznego zarządzania tokenami

### Backend
✅ JWT weryfikowany przez ASP.NET Core Identity
✅ Wymuszony attribute `[Authorize]` na kontrolerach
✅ Filtrowanie danych per użytkownik
✅ Brak dostępu do danych innych użytkowników

### Ważne zasady
❌ **Nigdy** nie commituj `.env.local` z kluczami Clerk
❌ **Nigdy** nie udostępniaj `CLERK_SECRET_KEY`
✅ Użyj różnych kluczy dla dev/production
✅ Rotuj klucze regularnie w Clerk Dashboard

## Testowanie

### Lokalnie
1. Uruchom backend: `cd backend/Piccolo.Api && dotnet run`
2. Uruchom frontend: `cd frontend && npm run dev`
3. Otwórz http://localhost:3000
4. Kliknij "Sign In" i zaloguj się przez Clerk
5. Po zalogowaniu zobaczysz avatar w prawym górnym rogu
6. Dodaj produkt - zostanie zapisany z Twoim UserId

### Weryfikacja w bazie
```sql
SELECT * FROM Users;
SELECT * FROM DiaryEntries WHERE UserId = 1;
```

## Migracja istniejących danych

Jeśli masz starą bazę bez kolumny `UserId`:
```bash
cd backend/Piccolo.Api
dotnet ef migrations add AddUserSupport
dotnet ef database update
```

Uwaga: Stare wpisy zostaną usunięte (nie mają powiązanego użytkownika).

## Rozszerzanie

### Dodawanie nowych pól do User
1. Zaktualizuj `Models/User.cs`
2. Dodaj migrację: `dotnet ef migrations add AddUserFields`
3. Zastosuj: `dotnet ef database update`

### Pobieranie dodatkowych danych z Clerk
UserService może pobierać email, imię itp. z JWT claims:
```csharp
var email = User.FindFirst(ClaimTypes.Email)?.Value;
var name = User.FindFirst(ClaimTypes.Name)?.Value;
```

## Troubleshooting

### "401 Unauthorized" na wszystkich requestach
- Sprawdź czy `CLERK_SECRET_KEY` jest w `.env.local`
- Sprawdź czy middleware Clerk działa (console.log w getAuthHeaders)
- Sprawdź czy backend weryfikuje tokeny (logi w UserService)

### Backend nie akceptuje tokenu
- Upewnij się, że `Clerk:Authority` w `appsettings.json` jest poprawny
- Sprawdź czy JWT Template w Clerk ma ustawiony audience `piccolo-api`

### Użytkownik widzi dane innych użytkowników
- **Krytyczny błąd bezpieczeństwa!**
- Sprawdź czy kontrolery filtrują po `userId` z UserService
- Nigdy nie ufaj `userId` z requestu - zawsze pobieraj z tokenu JWT

## Linki

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk + Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart)
- [ASP.NET Core JWT Auth](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/)
- [Clerk Dashboard](https://dashboard.clerk.com/)

