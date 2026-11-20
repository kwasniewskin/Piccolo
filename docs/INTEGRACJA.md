# Frontend-Backend Integration Summary

## Completed Work

### 1. API Client Layer (`frontend/src/lib/api.ts`)
- Connects directly to the ASP.NET Core backend (`http://<host>:5022/api`)
- Core client functions:
  - `searchProducts(query, lang)` - searches local catalog and Open Food Facts
  - `getDiaryEntries(date, targetUserId)` - fetches diary entries for a date
  - `createDiaryEntry(...)` - logs product-backed or custom Quick Add entries
  - `deleteDiaryEntry(id)` - removes a diary entry
  - `getProductById(id)` - fetches a single product by ID
  - In-memory product cache to avoid redundant network requests

### 2. Defensive Error Handling
- All API calls wrap network and parsing logic in `try/catch` blocks
- Network failures return safe fallbacks (`[]` or `null`) without crashing the UI
- HTTP errors (`4xx`, `5xx`) are logged clearly and surfaced via non-intrusive toast/banner messages
- Empty search queries return the local product list cleanly; unmatched queries display an explicit empty state

### 3. React UI Components

#### `calorie-tracker.tsx`
- Loads real entries, product metadata, and macro goals from the API
- Manages `loading`, `error`, and cached `products` state
- Supports seamless switching between the user's diary and a linked partner's diary

#### `add-food-sheet.tsx`
- Debounced search (300 ms) querying local database + Open Food Facts in the active UI language (`en` / `pl`)
- Supports barcode scanning, Quick Add, custom product creation, and the AI Meal Assistant

### 4. Local Run & LAN Access

#### Backend
```bash
cd backend/Piccolo.Api
dotnet run --launch-profile http
```

#### Frontend
```bash
cd frontend
npm run dev:lan
```

Access from a mobile device on the same LAN at `http://<your-local-ip>:3000` (API calls dynamically target `http://<hostname>:5022/api`).

## Search Behavior Notes

- Product search uses normalized lowercase diacritic-insensitive matching (`SearchTextHelper` + `SearchName`) across product names, brands, and manufacturers.
- Results prioritize verified local catalog entries before appending Open Food Facts candidates.
- Products already fetched or logged are cached in memory per session for instant navigation.
