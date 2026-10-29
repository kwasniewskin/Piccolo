# Piccolo.Api.Tests - Testy integracyjne

Profesjonalny projekt testów integracyjnych dla backendu Piccolo.Api z pełną izolacją od produkcyjnej bazy danych i zewnętrznych serwisów.

## 🎯 Zakres testów

Projekt zawiera kompleksowy zestaw testów integracyjnych dla kontrolera `ProductsController`:

### ✅ Testy CRUD
- **POST /api/products** - tworzenie nowego produktu
- **GET /api/products/{id}** - pobieranie istniejącego produktu
- **GET /api/products/{id}** - weryfikacja 404 dla nieistniejącego produktu
- **PUT /api/products/{id}** - aktualizacja istniejącego produktu
- **PUT /api/products/{id}** - weryfikacja 404 dla nieistniejącego produktu
- **DELETE /api/products/{id}** - usuwanie istniejącego produktu
- **DELETE /api/products/{id}** - weryfikacja 404 dla nieistniejącego produktu

### 🔍 Testy wyszukiwania
- **GET /api/products/search** - wyszukiwanie produktów po nazwie
- **GET /api/products/search** - pusta lista dla braku wyników

### 📦 Testy importu
- **POST /api/products/import** - import nowego produktu (sukces)
- **POST /api/products/import** - import duplikatu (409 Conflict)

## 🏗️ Architektura testów

### CustomWebApplicationFactory
Główna klasa konfiguracyjna dziedzicząca po `WebApplicationFactory<Program>`:

1. **Baza danych w pamięci** - SQLite z `DataSource=:memory:` zapewnia:
   - Pełną izolację od produkcyjnej bazy `piccolo.db`
   - Szybkie wykonanie testów (wszystko w RAM)
   - Automatyczne czyszczenie po zakończeniu

2. **TestAuthHandler** - Mock autentykacji JWT:
   - Automatycznie dodaje claim `NameIdentifier = "1"` do każdego żądania
   - Eliminuje potrzebę prawdziwych tokenów JWT
   - Zapobiega `NullReferenceException` w kodzie pobierającym `User.Claims`

3. **MockOpenFoodFactsService** - Mock zewnętrznego API:
   - Zwraca puste odpowiedzi zamiast prawdziwych wywołań HTTP
   - Pełna izolacja od sieci i zewnętrznych serwisów
   - Deterministyczne testy bez zależności od API

### Helpers
- **ProductTestHelper** - factory methods do tworzenia testowych produktów z wartościami domyślnymi
- **TestAuthHandler** - handler autentykacji testowej
- **MockOpenFoodFactsService** - mock serwisu Open Food Facts

## 🚀 Uruchamianie testów

### Wszystkie testy
```bash
cd backend/Piccolo.Api.Tests
dotnet test
```

### Z szczegółowymi logami
```bash
dotnet test --logger "console;verbosity=detailed"
```

### Z pomiarem pokrycia kodu
```bash
dotnet test --collect:"XPlat Code Coverage"
```

### Filtrowanie testów
```bash
# Tylko testy dla GET
dotnet test --filter "FullyQualifiedName~Get"

# Tylko testy dla konkretnej metody
dotnet test --filter "FullyQualifiedName~CreateProduct"
```

## 📊 Wyniki

```
Łączna liczba testów: 11
Zakończone pomyślnie: 11
Zakończone niepowodzeniem: 0
Łączny czas: ~2.8s
```

## 📦 Pakiety NuGet

- `xunit` (2.9.2) - framework testowy
- `xunit.runner.visualstudio` (2.8.2) - runner dla Visual Studio
- `Microsoft.AspNetCore.Mvc.Testing` (9.0.0) - WebApplicationFactory
- `FluentAssertions` (7.0.0) - czytelne asercje
- `Microsoft.EntityFrameworkCore.Sqlite` (9.0.0) - baza w pamięci

## 🔒 Bezpieczeństwo

✅ **Gwarancja izolacji:**
- Testy **NIE dotykają** produkcyjnej bazy `piccolo.db`
- Wszystkie operacje wykonywane są w bazie w pamięci RAM
- Baza jest tworzona od zera przy każdym uruchomieniu testów
- Po zakończeniu testów baza jest automatycznie usuwana

✅ **Weryfikacja:**
```bash
# Sprawdź datę modyfikacji produkcyjnej bazy przed i po testach:
(Get-Item 'backend/Piccolo.Api/piccolo.db').LastWriteTime
```

## 🛠️ Debugowanie testów

### Visual Studio
1. Otwórz Test Explorer (Ctrl + E, T)
2. Kliknij prawym na test → Debug

### Visual Studio Code
1. Zainstaluj rozszerzenie ".NET Core Test Explorer"
2. Kliknij ikonę "Debug Test" obok nazwy testu

### Linia komend z punktem przerwania
```bash
# Uruchom z debuggerem
dotnet test --filter "FullyQualifiedName~CreateProduct"
```

## 📝 Dodawanie nowych testów

### 1. Dodaj test do `ProductsControllerTests.cs`
```csharp
[Fact]
public async Task MyNewTest_WhenCondition_ExpectedBehavior()
{
    // Arrange
    var product = ProductTestHelper.CreateValidProduct("Test Product");
    
    // Act
    var response = await _client.PostAsJsonAsync("/api/products", product);
    
    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Created);
}
```

### 2. Uruchom test
```bash
dotnet test --filter "FullyQualifiedName~MyNewTest"
```

## 🎓 Best Practices

1. **Nazewnictwo testów**: `MethodName_WhenCondition_ExpectedBehavior`
2. **Struktura AAA**: Arrange → Act → Assert
3. **Izolacja**: Każdy test jest niezależny i może być uruchomiony osobno
4. **FluentAssertions**: Używaj czytelnych asercji typu `Should().Be()` zamiast `Assert.Equal()`
5. **Unique identifiers**: Użyj `Guid` w nazwach testowych danych dla uniknięcia kolizji

## 🐛 Troubleshooting

### Problem: "Connection closed" podczas testów
**Rozwiązanie**: `CustomWebApplicationFactory` teraz utrzymuje otwarte połączenie przez cały czas życia factory.

### Problem: 401 Unauthorized
**Rozwiązanie**: `TestAuthHandler` jest już skonfigurowany i automatycznie dodaje claims.

### Problem: 500 Internal Server Error
**Rozwiązanie**: Sprawdź logi w konsoli - prawdopodobnie problem z konfiguracją DI lub brakującym serwisem.

### Problem: Testy wpływają na produkcyjną bazę
**Rozwiązanie**: Sprawdź, czy `CustomWebApplicationFactory` używa `DataSource=:memory:` i nie ma hardcoded ścieżki do `piccolo.db`.

## 📚 Dokumentacja

- [xUnit Documentation](https://xunit.net/)
- [FluentAssertions Documentation](https://fluentassertions.com/)
- [Microsoft.AspNetCore.Mvc.Testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)
- [Entity Framework Core In-Memory Database](https://learn.microsoft.com/en-us/ef/core/testing/testing-without-the-database)
