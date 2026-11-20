/**
 * Warstwa API – komunikacja z backendem (ASP.NET Core na http://localhost:5022).
 * 
 * Wszystkie funkcje zawierają robustną obsługę błędów:
 * - Błędy sieciowe (serwer nie odpowiada) zwracają puste tablice/null zamiast rzucać wyjątki
 * - Błędy HTTP (4xx, 5xx) są logowane i obsługiwane łagodnie
 * - Puste wyniki wyszukiwania (brak dopasowań) to poprawny przypadek, nie błąd
 */

import type { DiaryEntry, MealType, Product, Macros } from './types'
import { auth } from '@clerk/nextjs/server'

// API_BASE używa zmiennej środowiskowej lub domyślnie proxy Next.js.
// To rozwiązuje problem Mixed Content - requesty idą przez Next.js (HTTPS),
// który wewnętrznie przekierowuje je do backendu (HTTP localhost:5022).
const API_BASE = typeof window !== 'undefined' ? `http://${window.location.hostname}:5022/api` : 'http://localhost:5022/api'

// Export API_BASE dla komponentów klienckich
export { API_BASE }

// ---------------------------------------------------------------------------
// Typy odpowiedzi z backendu
// ---------------------------------------------------------------------------

/** 
 * Produkt z backendu – zawiera pola podstawowe + dane z Open Food Facts.
 * Frontend dodaje `unit`, `defaultServing`, `ingredients` lokalnie.
 */
type ApiProduct = {
  id: number
  name: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number
  barcode?: string
  brand?: string
  saturatedFatPer100g?: number
  sugarsPer100g?: number
  fiberPer100g?: number
  saltPer100g?: number
  packageWeightGrams?: number
  defaultServingGrams?: number
  dataSource?: string
  imageUrl?: string
  ingredients?: string
  units?: ApiProductUnit[]
}

type ApiProductUnit = {
  id: number
  unitKey: string
  gramsPerUnit: number
  productId: number
}

/** Type guard sprawdzający, czy string jest prawidłowym UnitKey. */
function isUnitKey(key: string): key is import('./types').UnitKey {
  // Każdy niepusty string jest prawidłowy
  return typeof key === 'string' && key.trim().length > 0
}


/**
 * DiaryEntry z backendu – zawiera zagnieżdżony obiekt `product`.
 */
type ApiDiaryEntry = {
  id: number
  date: string // "2026-10-05"
  mealType: MealType
  productId?: number | null
  amountInGrams: number
  unitKey?: string
  unitQuantity?: number
  product?: ApiProduct | null
  userId?: number
  createdByUserId?: number
  customName?: string
  customCalories?: number
  customProtein?: number
  customFat?: number
  customCarbs?: number
}

/**
 * DTO do tworzenia nowego wpisu w dzienniku.
 * Wspiera zarówno wpisy z produktem z bazy (productId), jak i szybkie wpisy (custom*).
 */
type CreateDiaryEntryDto = {
  date: string // "2026-10-05"
  mealType: MealType
  productId?: number // Opcjonalny - dla wpisów z bazy
  amountInGrams: number | null // Opcjonalny - null dla szybkich wpisów
  /** Wewnętrzne ID partnera – backend przyjmuje je w body (nie w query). */
  targetUserId?: number
  unitKey?: string
  unitQuantity?: number
  // Pola dla szybkich wpisów (Quick Add)
  customName?: string
  customCalories?: number
  customProtein?: number
  customFat?: number
  customCarbs?: number
}

// ---------------------------------------------------------------------------
// Funkcje pomocnicze
// ---------------------------------------------------------------------------

/**
 * Pobiera token JWT z Clerk dla requestów server-side.
 */
async function getAuthToken(): Promise<string | null> {
  if (typeof window !== 'undefined') {
    // Client-side: pobierz token z Clerk
    const { getToken } = await import('@clerk/nextjs')
    return await getToken({ template: 'jwp-email-template' })
  } else {
    // Server-side: użyj auth() z @clerk/nextjs/server
    const { getToken } = await auth()
    return await getToken({ template: 'jwp-email-template' })
  }
}

/**
 * Tworzy headery z tokenem autentykacji.
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  return headers
}

/**
 * Mapuje produkt z API na format frontendowy z domyślnymi wartościami.
 */
function toFrontendProduct(api: ApiProduct): Product {
  return {
    ...api,
    // Domyślne wartości dla pól tylko-frontendowych
    unit: 'g',
    defaultServing: api.defaultServingGrams || api.packageWeightGrams || 100,
    ingredients: api.ingredients, // przekaż składniki z backendu (a nie undefined!)
    units: (api.units || [])
      .filter(u => isUnitKey(u.unitKey))
      .map(u => ({ ...u, unitKey: u.unitKey as import('./types').UnitKey })),
  }
}

/**
 * Mapuje wpis dziennika z API na format frontendowy.
 */
function toFrontendDiaryEntry(api: ApiDiaryEntry): DiaryEntry {
  return {
    id: api.id,
    date: api.date,
    mealType: api.mealType,
    productId: api.productId ?? undefined,
    amountInGrams: api.amountInGrams,
    unitKey: api.unitKey,
    unitQuantity: api.unitQuantity,
    userId: api.userId,
    createdByUserId: api.createdByUserId,
    customName: api.customName,
    customCalories: api.customCalories,
    customProtein: api.customProtein,
    customFat: api.customFat,
    customCarbs: api.customCarbs,
  }
}

// ---------------------------------------------------------------------------
// API: Produkty
// ---------------------------------------------------------------------------

/**
 * Wyszukuje produkty, których nazwa zawiera podaną frazę.
 * Hybrydowe wyszukiwanie: lokalna baza + Open Food Facts.
 * 
 * Pusta fraza zwraca domyślną listę wszystkich produktów z lokalnej bazy.
 *
 * @param query - fraza do wyszukania (np. "mleko", "banana"); pusta = wszystkie produkty
 * @returns tablica produktów lub pusta tablica w przypadku braku wyników lub błędu
 */
export async function searchProducts(query: string): Promise<Product[]> {
  try {
    const trimmed = query.trim()
    const url = trimmed
      ? `${API_BASE}/products/search?name=${encodeURIComponent(trimmed)}`
      : `${API_BASE}/products/search`
    
    const headers = await getAuthHeaders()
    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.error(`[API] Product search failed: ${response.status} ${response.statusText}`)
      return []
    }

    const data: ApiProduct[] = await response.json()
    return data.map(toFrontendProduct)
  } catch (error) {
    // Błąd sieciowy (serwer nie odpowiada) – nie crashuj aplikacji
    console.error('[API] Network error during product search:', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// API: Dziennik
// ---------------------------------------------------------------------------

/**
 * Zdarzenie wysyłane, gdy backend odmówi dostępu (403) do dziennika partnera.
 * PartnerProvider nasłuchuje go i wraca do własnego dziennika.
 */
export const PARTNER_ACCESS_LOST_EVENT = 'piccolo:partner-access-lost'

function notifyPartnerAccessLost() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PARTNER_ACCESS_LOST_EVENT))
  }
}

/**
 * Pobiera wszystkie wpisy z dziennika dla danej daty.
 * 
 * @param date - data w formacie YYYY-MM-DD (np. "2026-10-05")
 * @param targetUserId - wewnętrzne ID partnera (pomiń dla własnego dziennika)
 * @returns tablica wpisów lub pusta tablica w przypadku błędu
 */
export async function getDiaryEntries(date: string, targetUserId?: number): Promise<DiaryEntry[]> {
  try {
    const params = new URLSearchParams({ date })
    if (targetUserId != null) {
      params.set('targetUserId', String(targetUserId))
    }

    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE}/diary?${params}`, { headers })

    if (response.status === 403 && targetUserId != null) {
      console.warn('[API] Access to partner diary denied')
      notifyPartnerAccessLost()
      return []
    }

    if (!response.ok) {
      console.error(`[API] Diary fetch failed: ${response.status} ${response.statusText}`)
      return []
    }

    const data: ApiDiaryEntry[] = await response.json()
    for (const item of data) {
      if (item.product) {
        productCache.set(item.product.id, toFrontendProduct(item.product))
      }
    }
    return data.map(toFrontendDiaryEntry)
  } catch (error) {
    console.error('[API] Network error during diary fetch:', error)
    return []
  }
}

/**
 * Dodaje nowy wpis do dziennika.
 * Wspiera zarówno wpisy z produktem z bazy, jak i szybkie wpisy.
 * 
 * @param amountInGrams - ilość w gramach (opcjonalne dla szybkich wpisów - null)
 * @param options.targetUserId - wewnętrzne ID partnera; backend oczekuje go w body
 * @returns utworzony wpis lub null w przypadku błędu
 */
export async function createDiaryEntry(
  date: string,
  mealType: MealType,
  amountInGrams: number | null,
  options: {
    productId?: number
    unitKey?: string
    customName?: string
    customCalories?: number
    customProtein?: number
    customFat?: number
    customCarbs?: number
    targetUserId?: number
    unitQuantity?: number
  } = {}
): Promise<DiaryEntry | null> {
  try {
    const dto: CreateDiaryEntryDto = {
      date,
      mealType,
      amountInGrams: amountInGrams ?? 0,
      ...options,
    }

    console.log('[API] Creating diary entry:', dto)

    const response = await fetch(`${API_BASE}/diary`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(dto),
    })

    console.log('[API] Response status:', response.status)

    if (response.status === 403 && options.targetUserId != null) {
      notifyPartnerAccessLost()
      return null
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Diary create failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      console.error(`[API] Request body:`, JSON.stringify(dto, null, 2))
      return null
    }

    const data: ApiDiaryEntry = await response.json()
    return toFrontendDiaryEntry(data)
  } catch (error) {
    console.error('[API] Network error during diary create:', error)
    return null
  }
}

/**
 * Usuwa wpis z dziennika.
 * Backend sam sprawdza, czy wpis należy do użytkownika lub jego partnera,
 * więc nie trzeba przekazywać targetUserId.
 * 
 * @returns true jeśli usunięto, false w przypadku błędu
 */
export async function deleteDiaryEntry(id: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/diary/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })

    if (response.status === 403) {
      notifyPartnerAccessLost()
      return false
    }

    if (!response.ok) {
      console.error(`[API] Diary delete failed: ${response.status} ${response.statusText}`)
      return false
    }

    return true
  } catch (error) {
    console.error('[API] Network error during diary delete:', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// API: Cele kaloryczne i makro
// ---------------------------------------------------------------------------

/** Odpowiedź z GET /api/goals */
type ApiGoals = {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/**
 * Pobiera cele kaloryczne i makro dla danego użytkownika.
 * 
 * @param targetUserId - wewnętrzne ID użytkownika (pomiń dla własnych celów)
 * @returns cele lub null w przypadku błędu
 */
export async function getGoals(targetUserId?: number): Promise<Macros | null> {
  try {
    const params = new URLSearchParams()
    if (targetUserId != null) {
      params.set('targetUserId', String(targetUserId))
    }

    const url = params.toString() ? `${API_BASE}/goals?${params}` : `${API_BASE}/goals`
    const headers = await getAuthHeaders()
    const response = await fetch(url, { headers })

    if (response.status === 403 && targetUserId != null) {
      console.warn('[API] Access to partner goals denied')
      notifyPartnerAccessLost()
      return null
    }

    if (!response.ok) {
      console.error(`[API] Goals fetch failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data: ApiGoals = await response.json()
    
    // Jeśli backend zwraca same zera, uznaj że brak ustawionych celów
    if (data.kcal === 0 && data.protein === 0 && data.fat === 0 && data.carbs === 0) {
      console.log('[API] Goals are all zeros, returning null to use fallback')
      return null
    }
    
    return {
      kcal: data.kcal,
      protein: data.protein,
      fat: data.fat,
      carbs: data.carbs,
    }
  } catch (error) {
    console.error('[API] Network error during goals fetch:', error)
    return null
  }
}

/**
 * Aktualizuje cele kaloryczne i makro zalogowanego użytkownika.
 * 
 * @param goals - nowe cele
 * @returns true jeśli zapisano, false w przypadku błędu
 */
export async function updateGoals(goals: Macros): Promise<boolean> {
  try {
    const dto = {
      kcal: goals.kcal,
      protein: goals.protein,
      fat: goals.fat,
      carbs: goals.carbs,
    }

    const response = await fetch(`${API_BASE}/goals`, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(dto),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Goals update failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      return false
    }

    console.log('[API] Goals updated successfully')
    return true
  } catch (error) {
    console.error('[API] Network error during goals update:', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Cache produktów
// ---------------------------------------------------------------------------

/**
 * Prosty cache produktów w pamięci, aby nie pobierać ich wielokrotnie.
 * Backend nie zwraca wszystkich produktów na starcie, więc budujemy cache stopniowo.
 */
const productCache = new Map<number, Product>()

/**
 * Pobiera produkt po ID z cache lub z API.
 */
export async function getProductById(id: number): Promise<Product | null> {
  // Sprawdź cache
  if (productCache.has(id)) {
    return productCache.get(id)!
  }

  // Pobierz z API
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE}/products/${id}`, { headers })
    
    if (!response.ok) {
      console.error(`[API] Product fetch failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data: ApiProduct = await response.json()
    const product = toFrontendProduct(data)
    productCache.set(id, product)
    return product
  } catch (error) {
    console.error('[API] Network error during product fetch:', error)
    return null
  }
}

/**
 * Dodaje produkty do cache (używane przy ładowaniu wpisów z dziennika).
 */
export function cacheProducts(products: Product[]) {
  products.forEach((p) => productCache.set(p.id, p))
}

/**
 * Pobiera wszystkie produkty z cache (do wyświetlenia offline).
 */
export function getCachedProducts(): Product[] {
  return Array.from(productCache.values())
}

/**
 * Tworzy nowy produkt w bazie danych (np. dla Quick Add).
 * 
 * @param productData - dane produktu do utworzenia
 * @returns utworzony produkt z nadanym ID lub null w przypadku błędu
 */
export async function createProduct(productData: {
  name: string
  brand?: string | null
  manufacturer?: string | null
  barcode?: string | null
  ingredients?: string | null
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number
  saturatedFatPer100g?: number
  sugarsPer100g?: number
  fiberPer100g?: number
  saltPer100g?: number
  packageWeightGrams?: number
  defaultServingGrams?: number
  unit?: string
  defaultServing?: number
  dataSource?: string
}): Promise<Product | null> {
  try {
    console.log('[API] Creating new product:', productData.name)
    
    const response = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(productData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Product creation failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      return null
    }

    const data: ApiProduct = await response.json()
    const createdProduct = toFrontendProduct(data)
    
    // Dodaj do cache
    productCache.set(createdProduct.id, createdProduct)
    
    console.log('[API] Product created successfully with ID:', createdProduct.id)
    return createdProduct
  } catch (error) {
    console.error('[API] Network error during product creation:', error)
    return null
  }
}

/**
 * Importuje produkt z Open Food Facts do lokalnej bazy.
 * 
 * @param product - produkt z OFF (z dataSource === "OFF")
 * @returns zapisany produkt z nadanym lokalnym ID lub null w przypadku błędu
 */
export async function importProduct(product: Product): Promise<Product | null> {
  try {
    console.log('[API] Importing product from OFF:', product.name)
    
    const response = await fetch(`${API_BASE}/products/import`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(product),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Product import failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      return null
    }

    const data: ApiProduct = await response.json()
    const importedProduct = toFrontendProduct(data)
    
    // Dodaj do cache
    productCache.set(importedProduct.id, importedProduct)
    
    console.log('[API] Product imported successfully with ID:', importedProduct.id)
    return importedProduct
  } catch (error) {
    console.error('[API] Network error during product import:', error)
    return null
  }
}

/**
 * Pobiera pojedynczy produkt po ID.
 * 
 * @param id - ID produktu
 * @returns produkt lub null jeśli nie znaleziono
 */
export async function getProduct(id: number): Promise<Product | null> {
  try {
    // Sprawdź cache
    if (productCache.has(id)) {
      console.log('[API] Product found in cache:', id)
      return productCache.get(id)!
    }

    console.log('[API] Fetching product by ID:', id)
    
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE}/products/${id}`, { headers })
    
    if (response.status === 404) {
      console.log('[API] Product not found for ID:', id)
      return null
    }
    
    if (!response.ok) {
      console.error(`[API] Product fetch failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data: ApiProduct = await response.json()
    const product = toFrontendProduct(data)
    
    // Dodaj do cache
    productCache.set(product.id, product)
    
    console.log('[API] Product fetched:', product.name)
    return product
  } catch (error) {
    console.error('[API] Network error during product fetch:', error)
    return null
  }
}

/**
 * Wyszukuje produkt po kodzie kreskowym - najpierw lokalnie, potem w Open Food Facts.
 * 
 * @param barcode - kod kreskowy produktu (EAN-13, UPC-A itp.)
 * @returns produkt lub null jeśli nie znaleziono
 */
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  try {
    console.log('[API] Looking up product by barcode:', barcode)
    
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE}/products/barcode/${barcode}`, { headers })
    
    if (response.status === 404) {
      console.log('[API] Product not found for barcode:', barcode)
      return null
    }
    
    if (!response.ok) {
      console.error(`[API] Barcode lookup failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data: ApiProduct = await response.json()
    const product = toFrontendProduct(data)
    
    // Dodaj do cache jeśli ma lokalne ID
    if (product.id > 0) {
      productCache.set(product.id, product)
    }
    
    console.log('[API] Product found by barcode:', product.name)
    return product
  } catch (error) {
    console.error('[API] Network error during barcode lookup:', error)
    return null
  }
}

/**
 * Pobiera historię użycia produktu przez zalogowanego użytkownika (lub partnera).
 * Zwraca 2 ostatnie różne kombinacje (jednostka, ilość) oraz najczęściej używaną jednostkę.
 * GET /api/diary/product-usage/{productId}?targetUserId=...
 */
export async function getProductUsage(
  productId: number,
  targetUserId?: number
): Promise<{ recent: Array<{ unitKey: string; quantity: number }>; mostUsed: { unitKey: string; quantity: number } | null } | null> {
  try {
    const params = new URLSearchParams()
    if (targetUserId != null) {
      params.set('targetUserId', String(targetUserId))
    }

    const url = params.toString()
      ? `${API_BASE}/diary/product-usage/${productId}?${params}`
      : `${API_BASE}/diary/product-usage/${productId}`

    const headers = await getAuthHeaders()
    const response = await fetch(url, { headers })

    if (response.status === 403 && targetUserId != null) {
      notifyPartnerAccessLost()
      return null
    }

    if (!response.ok) {
      console.error(`[API] Product usage fetch failed: ${response.status} ${response.statusText}`)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('[API] Network error during product usage fetch:', error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Partner API
// ---------------------------------------------------------------------------

/**
 * Generuje kod parowania dla bieżącego użytkownika.
 * 
 * @returns obiekt z kodem i datą wygaśnięcia lub null jeśli błąd
 */
export async function generatePairingCode(): Promise<{ code: string; expiresAt: string } | null> {
  try {
    console.log('[API] Generating pairing code')
    
    const response = await fetch(`${API_BASE}/partner/generate-code`, {
      method: 'POST',
      headers: await getAuthHeaders(),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Pairing code generation failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      return null
    }
    
    const data = await response.json()
    return { code: data.code, expiresAt: data.expiresAt }
  } catch (error) {
    console.error('[API] Network error during pairing code generation:', error)
    return null
  }
}

/**
 * Akceptuje kod parowania od partnera.
 * 
 * @param code - 6-cyfrowy kod parowania
 * @returns `{ success: true }` lub `{ success: false, error }` z komunikatem backendu (jeśli jest)
 */
export async function acceptPairingCode(
  code: string,
): Promise<{ success: true } | { success: false; error: string | null }> {
  try {
    console.log('[API] Accepting pairing code')
    
    const response = await fetch(`${API_BASE}/partner/accept-code`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ code }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Pairing code acceptance failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      let message: string | null = null
      try {
        const parsed = JSON.parse(errorText) as { error?: unknown }
        if (typeof parsed.error === 'string') message = parsed.error
      } catch {
        // Odpowiedź nie jest JSON-em – zostaje ogólny komunikat
      }
      return { success: false, error: message }
    }
    
    console.log('[API] Pairing code accepted successfully')
    return { success: true }
  } catch (error) {
    console.error('[API] Network error during pairing code acceptance:', error)
    return { success: false, error: null }
  }
}

/**
 * Pobiera informacje o aktualnym połączeniu z partnerem.
 * 
 * @returns informacje o partnerze lub null jeśli brak połączenia (404)
 * @throws Error przy błędzie sieci/serwera – żeby chwilowa awaria nie wyglądała jak rozłączenie
 */
export async function getPartnerConnection(): Promise<{
  partnerId: number
  partnerName: string | null
  partnerEmail: string | null
  connectedAt: string
} | null> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/partner/connection`, { headers })
  
  if (response.status === 404) {
    return null
  }
  
  if (!response.ok) {
    throw new Error(`Partner connection fetch failed: ${response.status} ${response.statusText}`)
  }
  
  const data = await response.json()
  return {
    partnerId: data.partnerId,
    partnerName: data.partnerName ?? null,
    partnerEmail: data.partnerEmail ?? null,
    connectedAt: data.connectedAt,
  }
}

/**
 * Rozłącza połączenie z partnerem.
 * 
 * @returns true jeśli sukces, false jeśli błąd
 */
export async function disconnectPartner(): Promise<boolean> {
  try {
    console.log('[API] Disconnecting from partner')
    
    const response = await fetch(`${API_BASE}/partner/disconnect`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Partner disconnect failed: ${response.status} ${response.statusText}`)
      console.error(`[API] Error details:`, errorText)
      return false
    }
    
    console.log('[API] Partner disconnected successfully')
    return true
  } catch (error) {
    console.error('[API] Network error during partner disconnect:', error)
    return false
  }
}

