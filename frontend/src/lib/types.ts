/**
 * Domain types for the application.
 *
 * `Product` and `DiaryEntry` mirror the backend entities (ASP.NET Core + EF Core)
 * with matching camelCase property names (default System.Text.Json serialization).
 */

/** Meal slot. Backend equivalent: `MealType` property on `DiaryEntry`. */
export type MealType = 'breakfast' | 'second-breakfast' | 'lunch' | 'snack' | 'dinner'

/** Serving unit keys supported by the backend (any non-empty string). */
export type UnitKey = 'g' | 'ml' | 'portion' | 'package' | string

/** Product-specific serving unit definition (e.g., cheese slice = 16.7 g). */
export type ProductUnit = {
  id: number
  unitKey: UnitKey
  gramsPerUnit: number
  productId: number
}

/** Product entity - nutrition values are always per 100 g (or 100 ml). */
export type Product = {
  id: number
  name: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number

  // --- Backend fields (hybrid local search + Open Food Facts) ---
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
  units?: ProductUnit[]

  // --- Frontend-only fields ---
  /** Unit displayed in UI. */
  unit: 'g' | 'ml'
  /** Default serving size suggested when adding to diary. */
  defaultServing: number
}

/** Single diary entry: "ate X grams of product Y on date Z". */
export type DiaryEntry = {
  id: number
  productId?: number // Optional - null for Quick Add entries
  amountInGrams: number
  unitKey?: string // Unit chosen by the user (e.g., "portion")
  unitQuantity?: number // Quantity in that unit (e.g., 3)
  /** Date in `YYYY-MM-DD` format (date-only). */
  date: string
  mealType: MealType
  /** Diary owner (internal backend user ID). */
  userId?: number
  /** Who physically logged the entry - differs from `userId` when logged by partner. */
  createdByUserId?: number
  // Fields for Quick Add entries (not linked to a catalog product)
  customName?: string
  customCalories?: number
  customProtein?: number
  customFat?: number
  customCarbs?: number
}

/** Calculated macronutrients for a specific product quantity. */
export type Macros = {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/**
 * Diary entry joined with its product metadata, ready for UI display.
 */
export type DiaryEntryView = DiaryEntry &
  Macros & {
    productName: string
    unit: Product['unit'] | ''  // Empty string for custom entries (Quick Add)
    displayLabel?: string  // Formatted label with serving unit, e.g., "3 × portion (50 g)"
  }

/** Quick-add serving row (e.g., "1 × portion" -> 16.7 g -> 45 kcal). */
export type ServingOption = {
  unitKey: UnitKey
  quantity: number
  grams: number
}

/** Per-product serving unit usage history for the current user. */
export type ProductUsage = {
  recent: ServingUsageDto[]
  mostUsed?: ServingUsageDto
}

export type ServingUsageDto = {
  unitKey: string
  quantity: number
}

