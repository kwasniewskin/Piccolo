# TODO: Rozwiązywanie kolizji i przypisywanie kodów EAN z Open Food Facts (OFF) przy skanowaniu

## Cel
Gdy użytkownik skanuje kod kreskowy (EAN), którego jeszcze nie ma w lokalnej bazie Piccolo, aplikacja pobiera produkt z Open Food Facts i sprawdza, czy taki produkt istnieje już u nas bez kodu EAN (np. z importu katalogowego). Zamiast tworzyć duplikat w bazie, użytkownik dostaje możliwość połączenia kodu EAN z istniejącym produktem albo świadomego dodania produktu z OFF jako nowego wpisu.

---

## Przepływ docelowy (UX + API)

```text
Skan EAN
  │
  ├─► Jest w lokalnej bazie (`Products.Barcode == ean`)
  │      └─► Otwórz od razu arkusz dodawania posiłku (zero zapytań do OFF)
  │
  └─► Brak lokalnie
         └─► Zapytaj OFF (`GetByBarcodeAsync(ean)`)
               ├─► Brak w OFF → otwórz formularz ręcznego dodania produktu z wpisanym EAN
               └─► Znaleziono w OFF
                      └─► Szukaj w lokalnej bazie 1–3 kandydatów bez EAN
                            ├─► Brak sensownego kandydata → standardowy zapis z OFF
                            └─► Są kandydaci → ekran porównania (2 karty obok siebie)
```

---

## Jak wygląda ekran porównania dla użytkownika

Użytkownik widzi obok siebie kartę **„Z Open Food Facts”** oraz kartę **„Pasujący produkt w naszej bazie”** (kcal, B/T/W na 100 g, waga opakowania, zdefiniowane jednostki np. `łyżka`, `plaster`, `opakowanie`, skład/zdjęcie) i ma **3 przyciski decyzji**:

1. **„Połącz z produktem z bazy (zachowaj nasze makro i jednostki)”** *(domyślna, zalecana gdy to ten sam produkt)*
   - Dopisuje `Barcode` do istniejącego rekordu w `Products`.
   - Uzupełnia **tylko puste pola** z OFF (`SaltPer100g`, `Ingredients`, `ImageUrl`, `PackageWeightGrams`, jeśli u nas są `null`).
   - Tworzy wpis w `ProductSourceRefs` (`Source = "OFF"`, `ExternalId = ean`).
   - Zachowuje nasze sprawdzone makroskładniki i domowe jednostki z lokalnego katalogu.
2. **„Połącz z produktem z bazy i nadpisz wartości z OFF”** *(gdy receptura/tabela na etykiecie w OFF jest nowsza lub dokładniejsza)*
   - Robi to samo co wyżej, ale dodatkowo aktualizuje `CaloriesPer100g`, `ProteinPer100g`, `FatPer100g`, `CarbsPer100g`, `SaturatedFatPer100g`, `SugarsPer100g`, `FiberPer100g`, `SaltPer100g` wartościami z OFF.
   - Zapisane wcześniej wpisy w `DiaryEntries` pozostają bezpieczne dzięki kolumnom `*Snapshot`.
3. **„Dodaj z OFF jako osobny produkt”** *(gdy to inny wariant, inny smak albo inna gramatura opakowania)*
   - Zapisuje nowy wiersz przez `POST /api/products/import` (dzięki czemu `Products.Barcode` pozostaje jednoznacznie 1:1 i opcja „1 × opakowanie” zawsze ma jednoznaczną wagę).

---

## Zmiany techniczne do wdrożenia później

### Backend (`backend/Piccolo.Api/`)
1. **Nowy endpoint dopasowania:** `GET /api/products/barcode/{barcode}/resolve`
   - Zwraca DTO:
     ```json
     {
       "source": "local" | "off" | "not_found",
       "localProduct": { ... },
       "offProduct": { ... },
       "candidates": [ { "product": { ... }, "matchScore": 0.91 } ]
     }
     ```
   - Logika szukania kandydatów (max 3):
     - filtr `!p.IsArchived && (p.Barcode == null || p.Barcode == "")`
     - tokeny z `SearchTextHelper.TokenizeQuery(offProduct.Name + " " + offProduct.Brand)`
     - filtr bezpieczeństwa kalorii: `|p.CaloriesPer100g - offProduct.CaloriesPer100g| <= max(25, 0.20 * offProduct.CaloriesPer100g)` (chyba że OFF nie podał kcal)
     - ranking po liczbie wspólnych tokenów nazwy + dopasowaniu marki + bliskości kalorii.
2. **Nowy endpoint łączenia:** `POST /api/products/{id}/attach-barcode`
   - Body: `{ "barcode": "...", "overwriteNutrition": false, "offData": { ... } }`
   - Waliduje unikalność `barcode` w `Products` (409 Conflict, jeśli inny produkt już ma ten kod).
   - Aktualizuje produkt i dodaje `ProductSourceRef("OFF", barcode)`.
3. **Testy xUnit:**
   - scenariusz zwracania kandydatów bez EAN przy trafieniu z OFF,
   - `attach-barcode` w obu trybach (`overwriteNutrition = false` i `true`),
   - ochrona przed kolizją tego samego EAN na dwóch produktach (`409 Conflict`).

### Frontend (`frontend/src/`)
- W [api.ts](file:///c:/Users/nikod/Desktop/Piccolo/frontend/src/lib/api.ts): funkcja `resolveProductByBarcode(barcode)` i `attachBarcodeToProduct(productId, payload)`.
- W komponencie skanera / [add-food-sheet.tsx](file:///c:/Users/nikod/Desktop/Piccolo/frontend/src/components/tracker/add-food-sheet.tsx): prosty dialog porównania dwóch kart z 3 przyciskami powyżej, gdy `source === "off"` i `candidates.length > 0`.
