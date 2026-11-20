# Future Enhancement: Barcode Collision Resolution & EAN Linking with Open Food Facts

## Goal
When a user scans an EAN barcode that is not yet stored in the local Piccolo database, the app queries Open Food Facts (OFF) and checks whether a matching product already exists locally without an EAN (for instance, from catalog import). Instead of creating a duplicate entry, the user can choose to link the scanned EAN to the existing local product or import the OFF product as a new item.

---

## Proposed Flow (UX + API)

```text
Scan EAN
  │
  ├─► Found in local DB (`Products.Barcode == ean`)
  │      └─► Open portion picker immediately (0 OFF requests)
  │
  └─► Not in local DB
         └─► Query OFF (`GetByBarcodeAsync(ean)`)
               ├─► Not in OFF → open manual product form with prefilled EAN
               └─► Found in OFF
                      └─► Search local DB for 1–3 candidates missing an EAN
                            ├─► No strong match → standard OFF import flow
                            └─► Candidates found → side-by-side comparison sheet
```

---

## Side-by-Side Comparison UX

The user sees **"From Open Food Facts"** beside **"Matching product in local catalog"** (kcal, P/F/C per 100g, package weight, custom serving units such as `slice`, `piece`, `package`, ingredients/image) with **3 clear actions**:

1. **"Link to local product (keep local macros & units)"** *(default when it is the exact same product)*
   - Assigns `Barcode` to the existing row in `Products`.
   - Fills **only missing metadata** from OFF (`SaltPer100g`, `Ingredients`, `ImageUrl`, `PackageWeightGrams` if `null`).
   - Inserts a `ProductSourceRefs` record (`Source = "OFF"`, `ExternalId = ean`).
   - Preserves curated local nutrition values and custom serving units.
2. **"Link to local product & overwrite nutrition from OFF"** *(when packaging/OFF values are newer)*
   - Same as above, plus updates nutrition columns per 100g (`CaloriesPer100g`, `ProteinPer100g`, `FatPer100g`, `CarbsPer100g`, `SaturatedFatPer100g`, `SugarsPer100g`, `FiberPer100g`, `SaltPer100g`).
   - Historical `DiaryEntries` remain unaffected thanks to `*Snapshot` columns.
3. **"Add from OFF as a separate product"** *(when it is a different flavor, variant, or package weight)*
   - Creates a distinct row via `POST /api/products/import`, preserving a unique 1:1 `Barcode` constraint per variant.

---

## Technical Plan

### Backend (`backend/Piccolo.Api/`)
1. **Resolution endpoint:** `GET /api/products/barcode/{barcode}/resolve?lang=en`
   - Response DTO:
     ```json
     {
       "source": "local" | "off" | "not_found",
       "localProduct": { ... },
       "offProduct": { ... },
       "candidates": [ { "product": { ... }, "matchScore": 0.91 } ]
     }
     ```
   - Candidate matching rules (top 3):
     - Filter `!p.IsArchived && (p.Barcode == null || p.Barcode == "")`
     - Tokenize via `SearchTextHelper.TokenizeQuery(offProduct.Name + " " + offProduct.Brand)`
     - Calorie sanity window: `|p.CaloriesPer100g - offProduct.CaloriesPer100g| <= max(25, 0.20 * offProduct.CaloriesPer100g)` (unless OFF kcal is missing)
     - Rank by token overlap + brand match + calorie proximity.
2. **Linking endpoint:** `POST /api/products/{id}/attach-barcode`
   - Body: `{ "barcode": "...", "overwriteNutrition": false, "offData": { ... } }`
   - Validates unique `barcode` across `Products` (`409 Conflict` if another item owns it).
   - Updates product fields and records `ProductSourceRef("OFF", barcode)`.
3. **xUnit Integration Tests:**
   - Returning barcode-less local candidates upon OFF barcode hit
   - `attach-barcode` in both modes (`overwriteNutrition = false` and `true`)
   - Duplicate barcode guard (`409 Conflict`)

### Frontend (`frontend/src/`)
- [api.ts](file:///c:/Users/nikod/Desktop/Piccolo/frontend/src/lib/api.ts): add `resolveProductByBarcode(barcode, lang)` and `attachBarcodeToProduct(productId, payload)`.
- [add-food-sheet.tsx](file:///c:/Users/nikod/Desktop/Piccolo/frontend/src/components/tracker/add-food-sheet.tsx): add side-by-side comparison modal when `source === "off"` and `candidates.length > 0`.
