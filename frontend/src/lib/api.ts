/**
 * Warstwa API – komunikacja z backendem (ASP.NET Core na http://localhost:5022).
 * 
 * Wszystkie funkcje zawierają robustną obsługę błędów:
 * - Błędy sieciowe (serwer nie odpowiada) zwracają puste tablice/null zamiast rzucać wyjątki
 * - Błędy HTTP (4xx, 5xx) są logowane i obsługiwane łagodnie
 * - Puste wyniki wyszukiwania (brak dopasowań) to poprawny przypadek, nie błąd
 */

import type { DiaryEntry, MealType, Product } from './types'
import { auth } from '@clerk/nextjs/server'

const API_BASE = typeof window !== 'undefined' ? `http://${window.location.hostname}:5022/api` : 'http://localhost:5022/api'

// ---------------------------------------------------------------------------
// Typy odpowiedzi z backendu
// ---------------------------------------------------------------------------

/** 
 * Produkt z backendu – zawiera tylko pola podstawowe.
 * Frontend dodaje `unit`, `defaultServing`, `brand`, `ingredients` lokalnie.
 */
type ApiProduct = {
  id: number
  name: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number
  barcode?: string
}

/**
 * DiaryEntry z backendu – zawiera zagnieżdżony obiekt `product`.
 */
type ApiDiaryEntry = {
  id: number
  date: string // "2026-10-05"
  mealType: MealType
  productId: number
  amountInGrams: number
  product: ApiProduct
}

/**
 * DTO do tworzenia nowego wpisu w dzienniku.
 */
type CreateDiaryEntryDto = {
  date: string // "2026-10-05"
  mealType: MealType
  productId: number
  amountInGrams: number
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
    id: api.id,
    name: api.name,
    caloriesPer100g: api.caloriesPer100g,
    proteinPer100g: api.proteinPer100g,
    fatPer100g: api.fatPer100g,
    carbsPer100g: api.carbsPer100g,
    // Domyślne wartości dla pól, których backend jeszcze nie zwraca
    unit: 'g',
    defaultServing: 100,
    brand: undefined,
    ingredients: undefined,
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
    productId: api.productId,
    amountInGrams: api.amountInGrams,
  }
}

// ---------------------------------------------------------------------------
// API: Produkty
// ---------------------------------------------------------------------------

/**
 * Wyszukuje produkty, których nazwa zawiera podaną frazę.
 * 
 * Pusta fraza zwraca domyślną listę wszystkich produktów z bazy.
 *
 * @param query - fraza do wyszukania (np. "mleko", "banana"); pusta = wszystkie produkty
 * @returns tablica produktów lub pusta tablica w przypadku braku wyników lub błędu
 */
export async function searchProducts(query: string): Promise<Product[]> {
  try {
    const trimmed = query.trim()
    const url = trimmed
      ? `${API_BASE}/products/search?query=${encodeURIComponent(trimmed)}`
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
 * Pobiera wszystkie wpisy z dziennika dla danej daty.
 * 
 * @param date - data w formacie YYYY-MM-DD (np. "2026-10-05")
 * @returns tablica wpisów lub pusta tablica w przypadku błędu
 */
export async function getDiaryEntries(date: string): Promise<DiaryEntry[]> {
  try {
    const url = `${API_BASE}/diary?date=${encodeURIComponent(date)}`
    const headers = await getAuthHeaders()
    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.error(`[API] Diary fetch failed: ${response.status} ${response.statusText}`)
      return []
    }

    const data: ApiDiaryEntry[] = await response.json()
    return data.map(toFrontendDiaryEntry)
  } catch (error) {
    console.error('[API] Network error during diary fetch:', error)
    return []
  }
}

/**
 * Dodaje nowy wpis do dziennika.
 * 
 * @returns utworzony wpis lub null w przypadku błędu
 */
export async function createDiaryEntry(
  date: string,
  mealType: MealType,
  productId: number,
  amountInGrams: number,
): Promise<DiaryEntry | null> {
  try {
    const dto: CreateDiaryEntryDto = {
      date,
      mealType,
      productId,
      amountInGrams,
    }

    console.log('[API] Creating diary entry:', dto)

    const response = await fetch(`${API_BASE}/diary`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(dto),
    })

    console.log('[API] Response status:', response.status)

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
 * 
 * @returns true jeśli usunięto, false w przypadku błędu
 */
export async function deleteDiaryEntry(id: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/diary/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })

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

