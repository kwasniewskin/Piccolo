/**
 * API layer - communication with the ASP.NET Core backend (http://localhost:5022).
 *
 * All functions provide defensive error handling:
 * - Network errors (server unreachable) return empty arrays or null instead of throwing
 * - HTTP errors (4xx, 5xx) are logged and handled gracefully
 * - Empty search results (no matches) are treated as a valid state, not an error
 */

import type { DiaryEntry, MealType, Product, Macros } from './types'
import { auth } from '@clerk/nextjs/server'

// API_BASE uses the current hostname so requests work across localhost and LAN clients.
const API_BASE = typeof window !== 'undefined' ? `http://${window.location.hostname}:5022/api` : 'http://localhost:5022/api'

// Export API_BASE for client components
export { API_BASE }

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

/**
 * Product returned by the backend - core nutrition fields plus Open Food Facts metadata.
 * The frontend attaches `unit`, `defaultServing`, and `ingredients` locally when needed.
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
  manufacturer?: string
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

/** Type guard checking whether a string is a non-empty UnitKey. */
function isUnitKey(key: string): key is import('./types').UnitKey {
  // Any non-empty string is valid
  return typeof key === 'string' && key.trim().length > 0
}


/**
 * DiaryEntry returned by the backend - includes a nested `product` object.
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
 * DTO for creating a new diary entry.
 * Supports both catalog-backed entries (productId) and custom Quick Add entries (custom*).
 */
type CreateDiaryEntryDto = {
  date: string // "2026-10-05"
  mealType: MealType
  productId?: number // Optional - for catalog entries
  amountInGrams: number | null // Optional - null for Quick Add entries
  /** Internal partner ID - the backend expects this in the request body (not query). */
  targetUserId?: number
  unitKey?: string
  unitQuantity?: number
  // Fields for Quick Add entries
  customName?: string
  customCalories?: number
  customProtein?: number
  customFat?: number
  customCarbs?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves the Clerk JWT token for client- or server-side requests.
 */
async function getAuthToken(): Promise<string | null> {
  if (typeof window !== 'undefined') {
    // Client-side: get token from Clerk
    const { getToken } = await import('@clerk/nextjs')
    return await getToken({ template: 'jwp-email-template' })
  } else {
    // Server-side: use auth() from @clerk/nextjs/server
    const { getToken } = await auth()
    return await getToken({ template: 'jwp-email-template' })
  }
}

/**
 * Builds request headers including the authentication token.
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
 * Maps a backend product DTO to the frontend Product format with sensible defaults.
 */
function toFrontendProduct(api: ApiProduct): Product {
  return {
    ...api,
    // Default values for frontend-only fields
    unit: 'g',
    defaultServing: api.defaultServingGrams || api.packageWeightGrams || 100,
    ingredients: api.ingredients, // preserve ingredients list from backend
    units: (api.units || [])
      .filter(u => isUnitKey(u.unitKey))
      .map(u => ({ ...u, unitKey: u.unitKey as import('./types').UnitKey })),
  }
}

/**
 * Maps a backend diary entry DTO to the frontend DiaryEntry format.
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
// API: Products
// ---------------------------------------------------------------------------

/**
 * Searches for products whose name matches the given query.
 * Hybrid search: local database + Open Food Facts.
 *
 * An empty query returns the default list of products from the local database.
 *
 * @param query - search phrase (e.g., "milk", "banana"); empty = local product list
 * @param lang - preferred Open Food Facts language code ('en' or 'pl')
 * @returns matching products array, or empty array on no matches/error
 */
export async function searchProducts(query: string, lang: 'en' | 'pl' = 'pl'): Promise<Product[]> {
  try {
    const trimmed = query.trim()
    const params = new URLSearchParams()
    if (trimmed) {
      params.set('name', trimmed)
    }
    params.set('lang', lang)
    const url = `${API_BASE}/products/search?${params.toString()}`
    
    const headers = await getAuthHeaders()
    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.error(`[API] Product search failed: ${response.status} ${response.statusText}`)
      return []
    }

    const data: ApiProduct[] = await response.json()
    return data.map(toFrontendProduct)
  } catch (error) {
    // Network error (server unreachable) - do not crash the app
    console.error('[API] Network error during product search:', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// API: Diary
// ---------------------------------------------------------------------------

/**
 * Event dispatched when the backend denies access (403) to a partner's diary.
 * PartnerProvider listens for this event and switches back to the user's own diary.
 */
export const PARTNER_ACCESS_LOST_EVENT = 'piccolo:partner-access-lost'

function notifyPartnerAccessLost() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PARTNER_ACCESS_LOST_EVENT))
  }
}

/**
 * Fetches all diary entries for a given date.
 *
 * @param date - date in YYYY-MM-DD format (e.g., "2026-10-05")
 * @param targetUserId - internal partner ID (omit for own diary)
 * @returns diary entries array, or empty array on error
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
 * Creates a new diary entry.
 * Supports both catalog-backed entries and Quick Add entries.
 *
 * @param amountInGrams - amount in grams (optional/null for Quick Add entries)
 * @param options.targetUserId - internal partner ID; backend expects it in the request body
 * @returns created entry, or null on error
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
 * Deletes a diary entry.
 * The backend verifies whether the entry belongs to the user or their partner,
 * so targetUserId does not need to be passed.
 *
 * @returns true if deleted, false on error
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
// API: Calorie and Macro Goals
// ---------------------------------------------------------------------------

/** Response from GET /api/goals */
type ApiGoals = {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/**
 * Fetches calorie and macro goals for a user.
 *
 * @param targetUserId - internal user ID (omit for own goals)
 * @returns goals object, or null on error
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
    
    // Treat all-zero values from the backend as unset goals
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
 * Updates calorie and macro goals for the authenticated user.
 *
 * @param goals - new goal targets
 * @returns true if saved, false on error
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
// Product Cache
// ---------------------------------------------------------------------------

/**
 * Simple in-memory product cache to avoid redundant fetches.
 * Because the backend returns products incrementally, the cache grows as entries load.
 */
const productCache = new Map<number, Product>()

/**
 * Fetches a product by ID from cache or API.
 */
export async function getProductById(id: number): Promise<Product | null> {
  // Check cache
  if (productCache.has(id)) {
    return productCache.get(id)!
  }

  // Fetch from API
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
 * Populates the product cache (used when loading diary entries).
 */
export function cacheProducts(products: Product[]) {
  products.forEach((p) => productCache.set(p.id, p))
}

/**
 * Returns all cached products (for offline fallback).
 */
export function getCachedProducts(): Product[] {
  return Array.from(productCache.values())
}

/**
 * Creates a new product in the database (e.g., for Quick Add or custom items).
 *
 * @param productData - product payload to create
 * @returns created product with assigned ID, or null on error
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
  saturatedFatPer100g?: number | null
  sugarsPer100g?: number | null
  fiberPer100g?: number | null
  saltPer100g?: number | null
  packageWeightGrams?: number | null
  defaultServingGrams?: number | null
  unit?: string
  defaultServing?: number
  dataSource?: string
  imageUrl?: string | null
  units?: Array<{ unitKey: string; gramsPerUnit: number }>
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
    
    // Add to cache
    productCache.set(createdProduct.id, createdProduct)
    
    console.log('[API] Product created successfully with ID:', createdProduct.id)
    return createdProduct
  } catch (error) {
    console.error('[API] Network error during product creation:', error)
    return null
  }
}

/**
 * Updates an existing product in the database.
 */
export async function updateProduct(
  id: number | string,
  productData: {
    name: string
    brand?: string | null
    manufacturer?: string | null
    barcode?: string | null
    ingredients?: string | null
    caloriesPer100g: number
    proteinPer100g: number
    fatPer100g: number
    carbsPer100g: number
    saturatedFatPer100g?: number | null
    sugarsPer100g?: number | null
    fiberPer100g?: number | null
    saltPer100g?: number | null
    packageWeightGrams?: number | null
    defaultServingGrams?: number | null
    dataSource?: string
    imageUrl?: string | null
    units?: Array<{ unitKey: string; gramsPerUnit: number }>
  }
): Promise<Product | null> {
  try {
    const response = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(productData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Product update failed: ${response.status} ${response.statusText}`, errorText)
      return null
    }

    const data: ApiProduct = await response.json()
    const updatedProduct = toFrontendProduct(data)
    productCache.set(updatedProduct.id, updatedProduct)
    return updatedProduct
  } catch (error) {
    console.error('[API] Network error during product update:', error)
    return null
  }
}

/**
 * Imports an Open Food Facts product into the local database.
 *
 * @param product - product from OFF (with dataSource === "OFF")
 * @returns saved product with assigned local ID, or null on error
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
    
    // Add to cache
    productCache.set(importedProduct.id, importedProduct)
    
    console.log('[API] Product imported successfully with ID:', importedProduct.id)
    return importedProduct
  } catch (error) {
    console.error('[API] Network error during product import:', error)
    return null
  }
}

/**
 * Fetches a single product by ID.
 *
 * @param id - product ID
 * @returns product object, or null if not found
 */
export async function getProduct(id: number): Promise<Product | null> {
  try {
    // Check cache
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
    
    // Add to cache
    productCache.set(product.id, product)
    
    console.log('[API] Product fetched:', product.name)
    return product
  } catch (error) {
    console.error('[API] Network error during product fetch:', error)
    return null
  }
}

/**
 * Looks up a product by barcode - checks local DB first, then falls back to Open Food Facts.
 *
 * @param barcode - product barcode (EAN-13, UPC-A, etc.)
 * @param lang - preferred Open Food Facts language code ('en' or 'pl')
 * @returns product object, or null if not found
 */
export async function getProductByBarcode(barcode: string, lang: 'en' | 'pl' = 'pl'): Promise<Product | null> {
  try {
    console.log('[API] Looking up product by barcode:', barcode)
    
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE}/products/barcode/${encodeURIComponent(barcode)}?lang=${encodeURIComponent(lang)}`, { headers })
    
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
    
    // Add to cache if the product has a local ID
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
 * Fetches usage history of a product for the current user (or partner).
 * Returns the 2 most recent distinct (unit, amount) combinations and the most used unit.
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
 * Generates a pairing code for the current user.
 *
 * @returns object with pairing code and expiration timestamp, or null on error
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
 * Accepts a pairing code from a partner.
 *
 * @param code - 6-character pairing code
 * @returns `{ success: true }` or `{ success: false, error }` with backend error message if present
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
        // Response is not JSON - keep the generic message
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
 * Fetches details of the current partner connection.
 *
 * @returns partner info, or null if not connected (404)
 * @throws Error on network/server failure so a transient outage is not mistaken for disconnection
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
 * Disconnects the current partner link.
 *
 * @returns true on success, false on error
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

