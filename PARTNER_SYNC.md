# Partner Sync - Funkcjonalność Współdzielenia Dziennika

## Przegląd

Partner Sync pozwala dwóm użytkownikom na współdzielenie swoich dzienników żywieniowych. Jest to kluczowa funkcjonalność dla par i współlokatorów, którzy gotują razem i chcą łatwo zarządzać swoimi posiłkami.

## Architektura

### Model Relacji (1:1)
- System obsługuje **ściśle relację 1:1** - jeden użytkownik może być połączony z jednym partnerem na raz
- Rekord w bazie jest **dwukierunkowy** - jeden wpis w `UserConnections` reprezentuje połączenie między dwoma użytkownikami

### Tabele Bazy Danych

#### UserConnections
```csharp
public class UserConnection
{
    public int Id { get; set; }
    public int User1Id { get; set; }          // Pierwszy użytkownik
    public int User2Id { get; set; }          // Drugi użytkownik
    public ConnectionStatus Status { get; set; }  // Pending, Accepted, Disconnected
    public int CreatedByUserId { get; set; }  // Kto zainicjował połączenie
    public DateTime CreatedAt { get; set; }
    public DateTime? ConnectedAt { get; set; }    // Kiedy zaakceptowano
    public DateTime? DisconnectedAt { get; set; } // Kiedy rozłączono
}

public enum ConnectionStatus
{
    Pending = 0,
    Accepted = 1,
    Disconnected = 2
}
```

#### PairingCodes
```csharp
public class PairingCode
{
    public int Id { get; set; }
    public string Code { get; set; }           // 6-cyfrowy kod (np. "ABC123")
    public int CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }    // Ważny 15 minut
    public bool IsUsed { get; set; }           // Jednorazowy
    public int? UsedByUserId { get; set; }
    public DateTime? UsedAt { get; set; }
}
```

#### DiaryEntry - Nowe Pole
```csharp
public class DiaryEntry
{
    // ... istniejące pola
    public int CreatedByUserId { get; set; }   // Kto fizycznie dodał wpis
    
    // Różnica:
    // UserId = dla kogo jest wpis (właściciel dziennika)
    // CreatedByUserId = kto go dodał (może być partner)
}
```

## API Endpoints

Wszystkie endpointy wymagają nagłówka:
```
Authorization: Bearer <clerk-jwt-token>
```

### 1. Generowanie Kodu Parowania
```http
POST /api/partner/generate-code
```

**Odpowiedź:**
```json
{
  "code": "ABC123",
  "expiresAt": "2026-10-29T15:30:00Z"
}
```

### 2. Akceptacja Kodu Parowania
```http
POST /api/partner/accept-code
Content-Type: application/json

{
  "code": "ABC123"
}
```

**Odpowiedź (sukces):**
```json
{
  "connectionId": 1,
  "partnerId": 2,
  "partnerName": "Jan Kowalski",
  "partnerEmail": "jan@example.com",
  "connectedAt": "2026-10-29T15:15:00Z"
}
```

### 3. Pobieranie Aktywnych Połączeń
```http
GET /api/partner/connections
```

**Odpowiedź:**
```json
[
  {
    "connectionId": 1,
    "partnerId": 2,
    "partnerName": "Jan Kowalski",
    "partnerEmail": "jan@example.com",

## Uprawnienia w Dzienniku

### Pełny Dostęp CRUD
Partner z zaakceptowanym połączeniem ma **pełny dostęp** do dziennika drugiej osoby:
- ✅ Odczyt wpisów
- ✅ Dodawanie nowych wpisów
- ✅ Edycja istniejących wpisów
- ✅ Usuwanie wpisów

### Modyfikacje w DiaryController

#### GET - Pobieranie dziennika partnera
```http
GET /api/diary?date=2026-10-29&targetUserId=2
```
- Jeśli `targetUserId` nie jest podane → zwraca dziennik zalogowanego użytkownika
- Jeśli `targetUserId` jest podane → sprawdza uprawnienia i zwraca dziennik partnera

#### POST - Dodawanie wpisu dla partnera
```http
POST /api/diary
Content-Type: application/json

{
  "date": "2026-10-29",
  "mealType": "Śniadanie",
  "productId": 123,
  "amountInGrams": 200,
  "targetUserId": 2
}
```
- Jeśli `targetUserId` nie jest podane → tworzy wpis dla zalogowanego użytkownika
- Jeśli `targetUserId` jest podane → sprawdza uprawnienia i tworzy wpis dla partnera
- Pole `CreatedByUserId` automatycznie ustawiane na ID zalogowanego użytkownika

#### PUT - Edycja wpisu
```http
PUT /api/diary/{id}
```
- Sprawdza, czy wpis należy do zalogowanego użytkownika LUB jego partnera

#### DELETE - Usuwanie wpisu
```http
DELETE /api/diary/{id}
```
- Sprawdza, czy wpis należy do zalogowanego użytkownika LUB jego partnera

## Przepływ Użytkownika

### 1. Parowanie (Backend)
```
Użytkownik A:
  1. POST /api/partner/generate-code
  2. Otrzymuje kod: "ABC123"
  3. Pokazuje kod Użytkownikowi B (QR, SMS, etc.)

Użytkownik B:
  1. POST /api/partner/accept-code z body: {"code": "ABC123"}
  2. System sprawdza kod i tworzy połączenie
  3. Zwraca dane połączenia
```

### 2. Korzystanie z Dziennika Partnera
```
Użytkownik A (zalogowany):
  1. GET /api/partner/connections → otrzymuje partnerId=2
  2. GET /api/diary?date=2026-10-29&targetUserId=2
  3. POST /api/diary z targetUserId=2 → dodaje wpis dla partnera
```

### 3. Rozłączanie
```
Użytkownik A lub B:
  1. DELETE /api/partner/disconnect/1
  2. System usuwa dostęp do dzienników
```

## Bezpieczeństwo

### Autoryzacja
- ✅ Wszystkie endpointy wymagają JWT tokenu
- ✅ `PartnerService.CanAccessDiaryAsync()` weryfikuje uprawnienia
- ✅ Użytkownik może mieć tylko jedno aktywne połączenie (1:1)
- ✅ Kody parowania są jednorazowe i wygasają po 15 minutach

### Walidacja
- ✅ Kod musi być aktywny (`IsUsed=false` i `ExpiresAt > Now`)
- ✅ Użytkownik nie może połączyć się sam ze sobą
- ✅ Użytkownik nie może mieć wielu aktywnych połączeń
- ✅ Sprawdzanie uprawnień przed każdą operacją CRUD

### Audit Trail
- ✅ `CreatedByUserId` w DiaryEntry pokazuje, kto dodał wpis
- ✅ `ConnectedAt` / `DisconnectedAt` w UserConnection
- ✅ `UsedAt` / `UsedByUserId` w PairingCode

## Integracja z Frontend

### Context / Store
Zalecany globalny stan:
```typescript
interface PartnerContext {
  currentUserId: number;
  activeUserId: number;
  partnerId: number | null;
  partnerName: string | null;
  isViewingPartner: boolean;
  switchToPartner: () => void;
  switchToSelf: () => void;
}
```

### Switcher w UI
```typescript
function DiaryHeader() {
  const { isViewingPartner, partnerName } = usePartner();
  
  return (
    <header className={isViewingPartner ? 'partner-theme' : 'self-theme'}>
      <button>Mój Dziennik</button>
      <button>Dziennik: {partnerName}</button>
    </header>
  );
}
```

### Color Shift (CSS)
```css
.self-theme {
  --accent-color: #6EE7B7;  /* Szmaragd */
}

.partner-theme {
  --accent-color: #3B6DFF;  /* Błękit */
}
```

## Testowanie

### Scenariusz: Parowanie
```bash
# Użytkownik A generuje kod
curl -X POST http://localhost:5022/api/partner/generate-code \
  -H "Authorization: Bearer TOKEN_A"

# Użytkownik B akceptuje kod
curl -X POST http://localhost:5022/api/partner/accept-code \
  -H "Authorization: Bearer TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"code": "ABC123"}'
```

## Troubleshooting

### 403 Forbidden przy dostępie do dziennika partnera
- Sprawdź czy połączenie ma status `Accepted`
- Sprawdź logi `PartnerService.CanAccessDiaryAsync()`

### Kod parowania nie działa
- Sprawdź czy kod nie wygasł (15 minut)
- Sprawdź czy kod nie został już użyty

## Przyszłe Rozszerzenia

- **v1.1**: "Dodaj dla obojga" - bulk endpoint
- **v1.2**: Notyfikacje real-time (SignalR)
- **v1.3**: Rozbudowane uprawnienia (enum flags)

    "status": "Accepted",
    "connectedAt": "2026-10-29T15:15:00Z"
  }
]
```

### 4. Rozłączanie z Partnerem
```http
DELETE /api/partner/disconnect/{connectionId}
```

**Odpowiedź:**
```json
{
  "success": true,
  "message": "Połączenie zostało rozłączone"
}
```
