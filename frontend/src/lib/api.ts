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
  dataSource?: string
  imageUrl?: string
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
    ...api,
    // Domyślne wartości dla pól frontendowych
    unit: 'g',
    defaultServing: api.packageWeightGrams || 100,
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

/**
 * Tworzy nowy produkt w bazie danych (np. dla Quick Add).
 * 
 * @param productData - dane produktu do utworzenia
 * @returns utworzony produkt z nadanym ID lub null w przypadku błędu
 */
export async function createProduct(productData: {
  name: string
  brand?: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number
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

