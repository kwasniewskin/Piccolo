# Piccolo - Aplikacja do Śledzenia Kalorii

Aplikacja webowa do śledzenia spożycia kalorii i makroskładników. Frontend w Next.js, backend w ASP.NET Core, baza danych SQLite.

## Funkcje

✅ Wyszukiwanie produktów spożywczych  
✅ Dziennik posiłków z podziałem na śniadanie/obiad/kolację/przekąski  
✅ Automatyczne obliczanie kalorii i makroskładników  
✅ Autentykacja użytkowników (Clerk)  
✅ Każdy użytkownik ma swój prywatny dziennik  
✅ OAuth login (Google, GitHub, etc.)  

## Technologie

**Frontend:**
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Clerk (autentykacja)

**Backend:**
- ASP.NET Core 10.0
- Entity Framework Core
- SQLite
- JWT Authentication

## Szybki start

### Wymagania
- Node.js 18+ i npm
- .NET 10 SDK
- Konto Clerk (darmowe do 10k użytkowników/miesiąc)

### 1. Sklonuj repozytorium
```bash
git clone <repo-url>
cd Piccolo
```

### 2. Konfiguracja Clerk

1. Załóż konto na [Clerk.com](https://clerk.com)
2. Utwórz nową aplikację
3. Skopiuj klucze z Clerk Dashboard

### 3. Konfiguracja Frontend

```bash
cd frontend
npm install
```

Utwórz plik `.env.local`:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### 4. Konfiguracja Backend

```bash
cd ../backend/Piccolo.Api
dotnet restore
```

Zaktualizuj `appsettings.json`:
```json
{
  "Clerk": {
    "Authority": "https://your-app.clerk.accounts.dev",
    "Audience": "piccolo-api"
  }
}
```

### 5. Inicjalizacja bazy danych

```bash
dotnet ef database update
```

### 6. Uruchomienie

**Terminal 1 - Backend:**
```bash
cd backend/Piccolo.Api
dotnet run
```
Backend uruchomi się na http://localhost:5022

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend uruchomi się na http://localhost:3000

### 7. Testowanie

1. Otwórz http://localhost:3000
2. Kliknij "Sign In" lub "Sign Up"
3. Zaloguj się przez Clerk (email + hasło lub OAuth)
4. Po zalogowaniu zobaczysz swój dziennik
5. Wyszukaj produkty i dodaj do dziennika

## Struktura projektu

```
Piccolo/
├── frontend/                  # Next.js frontend
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   ├── components/       # Komponenty React
│   │   └── lib/              # API client, typy
│   └── package.json
├── backend/
│   └── Piccolo.Api/          # ASP.NET Core API
│       ├── Controllers/      # Endpointy REST
│       ├── Models/           # Encje bazy danych
│       ├── Services/         # Logika biznesowa
│       └── Data/             # DbContext, migracje
└── AUTHENTICATION.md         # Szczegółowa dokumentacja auth
```

## Endpointy API

Wszystkie wymagają tokena JWT w nagłówku `Authorization: Bearer <token>`

**Produkty:**
- `GET /api/products/search?query=mleko` - wyszukaj produkty
- `GET /api/products/{id}` - szczegóły produktu

**Dziennik:**
- `GET /api/diary?date=2026-10-06` - wpisy z danego dnia
- `POST /api/diary` - dodaj wpis
- `DELETE /api/diary/{id}` - usuń wpis

## Rozwój

### Dodawanie nowych produktów do bazy

Edytuj `backend/Piccolo.Api/Data/DbInitializer.cs` i dodaj produkty:
```csharp
new Product { Name = "Mleko 2%", CaloriesPer100g = 50, ... }
```

Zresetuj bazę: `dotnet ef database drop && dotnet ef database update`

### Logi i debugowanie

**Frontend:** Console w przeglądarce (F12)  
**Backend:** Logi w terminalu lub `logs/` folder

### Testy

```bash
# Frontend
cd frontend
npm test

# Backend
cd backend/Piccolo.Api
dotnet test
```

## Deployment

### Frontend (Vercel)
1. Push do GitHub
2. Import na Vercel
3. Dodaj zmienne środowiskowe (Clerk keys)
4. Deploy

### Backend (Azure App Service, Railway, etc.)
1. Zmień `appsettings.Production.json` z Clerk production keys
2. Zmień connection string na PostgreSQL/SQL Server
3. Deploy przez CI/CD lub CLI

## Bezpieczeństwo

⚠️ **Nigdy nie commituj `.env.local` ani kluczy API**  
✅ Użyj `.gitignore` dla plików konfiguracyjnych  
✅ Rotuj klucze regularnie  
✅ Używaj różnych kluczy dla dev/prod  

Więcej w [AUTHENTICATION.md](./AUTHENTICATION.md)

## Licencja

MIT

## Kontakt

Masz pytania? Otwórz issue na GitHubie.
```

