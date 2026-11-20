# Piccolo.Api.Tests - Integration Test Suite

xUnit integration test suite for the `Piccolo.Api` backend with full isolation from the local development database and external HTTP services.

## Test Scope

The suite covers core controllers, authorization, serving unit rules, and partner synchronization:

### Products & Catalog (`ProductsController`)
- **POST /api/products** - create product & serving unit validation
- **GET /api/products/{id}** - fetch existing product & `404 Not Found`
- **PUT /api/products/{id}** - update existing product & `404 Not Found`
- **DELETE /api/products/{id}** - delete existing product & `404 Not Found`
- **GET /api/products/search** - local search, token matching, and empty queries
- **POST /api/products/import** - Open Food Facts import & duplicate conflict (`409 Conflict`)

### Diary, Goals & Partner Sync
- **DiaryController** - per-user entries, quick-add custom macros, and unit usage history
- **GoalsController** - reading and updating daily calorie/macro targets
- **PartnerController** - 6-digit pairing codes, bidirectional partner linking, authorization boundaries (`403` when unlinked), and unlinking

## Test Architecture

### `CustomWebApplicationFactory`
Extends `WebApplicationFactory<Program>` with isolated test dependencies:

1. **In-Memory SQLite Database** (`DataSource=:memory:`):
   - Zero side effects on `piccolo.db`
   - Fast execution inside RAM with clean schema per run
2. **TestAuthHandler** - mock JWT authentication scheme:
   - Injects test `NameIdentifier` claims automatically
   - Supports dynamic user-switching headers (`X-Test-User-Id`) for multi-user / partner tests
3. **MockOpenFoodFactsService** - deterministic mock overriding `OpenFoodFactsService`:
   - Returns clean mock responses without external HTTP calls

### Helpers
- **ProductTestHelper** - factory helpers for valid test products and DTOs
- **TestAuthHandler** - fake authentication handler
- **MockOpenFoodFactsService** - isolated external API stub

## Running Tests

### Run full suite
```bash
dotnet test backend/Piccolo.Api.Tests
```

### Detailed console logs
```bash
dotnet test backend/Piccolo.Api.Tests --logger "console;verbosity=detailed"
```

### Collect coverage
```bash
dotnet test backend/Piccolo.Api.Tests --collect:"XPlat Code Coverage"
```

### Filter specific tests
```bash
# Only GET product tests
dotnet test backend/Piccolo.Api.Tests --filter "FullyQualifiedName~Get"

# Specific controller suite
dotnet test backend/Piccolo.Api.Tests --filter "FullyQualifiedName~PartnerControllerTests"
```

## Main Dependencies

- `xunit` (2.9.2) - test runner framework
- `xunit.runner.visualstudio` - IDE test explorer adapter
- `Microsoft.AspNetCore.Mvc.Testing` - `WebApplicationFactory` host
- `FluentAssertions` (7.0.0) - expressive test assertions
- `Microsoft.EntityFrameworkCore.Sqlite` - in-memory SQLite provider

## Database Isolation Guarantee

- Tests **never modify** `piccolo.db`.
- Every run creates a fresh in-memory schema initialized exclusively by test fixtures and torn down on disposal.

## Best Practices Used

1. **Naming convention**: `MethodName_WhenCondition_ExpectedBehavior`
2. **AAA structure**: Arrange → Act → Assert
3. **Full test independence**: No shared mutable state across test classes
4. **FluentAssertions**: Clear diagnostic diffs on assertion failures

## References

- [xUnit Documentation](https://xunit.net/)
- [FluentAssertions Documentation](https://fluentassertions.com/)
- [Integration Tests in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)
- [Testing Without Your Production Database (EF Core)](https://learn.microsoft.com/en-us/ef/core/testing/testing-without-the-database)
