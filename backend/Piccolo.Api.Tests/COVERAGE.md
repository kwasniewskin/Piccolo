# Test Coverage Summary

## Backend Integration Coverage (`Piccolo.Api`)

### `ProductsController` - Full Endpoint Coverage

| Endpoint | Method | Tested Scenarios | Status |
|----------|--------|------------------|--------|
| `/api/products` | `POST` | Valid creation & serving unit validation | Covered |
| `/api/products/{id}` | `GET` | Existing product retrieval & `404` missing item | Covered |
| `/api/products/{id}` | `PUT` | Existing product update & `404` missing item | Covered |
| `/api/products/{id}` | `DELETE` | Product deletion & `404` missing item | Covered |
| `/api/products/search` | `GET` | Matching queries, diacritic folding & empty results | Covered |
| `/api/products/import` | `POST` | OFF import & `409 Conflict` duplicate guard | Covered |

### Additional Tested Controllers & Features

- **`ServingUnitsTests`** - Product unit definitions, unit conversions, and validation rules
- **`GoalsController`** - Fetching and updating daily calorie/macronutrient targets (self & partner)
- **`PartnerController`** - Pairing code generation, 15-minute expiration, bidirectional diary access, and disconnect revocation

## Test Suite Quality Guarantees

- **Isolation from production DB**: In-memory SQLite (`DataSource=:memory:`)
- **Isolation from external network APIs**: Mocked `OpenFoodFactsService`
- **Multi-user auth simulation**: `TestAuthHandler` supporting dynamic user switching via headers
- **Total integration tests**: 51 passing tests (`dotnet test backend/Piccolo.Api.Tests`)

## Generating Detailed Coverage Reports

```bash
dotnet test backend/Piccolo.Api.Tests --collect:"XPlat Code Coverage"
dotnet tool install -g dotnet-reportgenerator-globaltool
reportgenerator -reports:"**/coverage.cobertura.xml" -targetdir:"coverage-report" -reporttypes:Html
```
