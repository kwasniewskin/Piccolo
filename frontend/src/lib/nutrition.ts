import type { DiaryEntry, DiaryEntryView, Macros, MealType, Product } from './types'
import { getLocale, getMealLabel, getUnitLabel, type Language } from './i18n'

/** Meal slots in display order (localized). */
export function getMeals(lang: Language): { id: MealType; label: string }[] {
  const mealIds: MealType[] = ['breakfast', 'second-breakfast', 'lunch', 'snack', 'dinner']
  return mealIds.map(id => ({
    id,
    label: getMealLabel(lang, id),
  }))
}

/** Default meal list (kept for backwards compatibility, English). */
export const MEALS: { id: MealType; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'second-breakfast', label: 'Second breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snack' },
  { id: 'dinner', label: 'Dinner' },
]

/**
 * Default daily targets (customizable in user settings).
 * Macros sum to 2090 kcal, staying within the 2100 kcal limit.
 */
export const GOALS: Macros & { water: number } = {
  kcal: 2100,
  protein: 130,
  fat: 70,
  carbs: 235,
  water: 2000,
}

/** Caloric energy per gram of each macronutrient (Atwater factors). */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

/** Computes calories derived from the given macronutrient gram amounts. */
export function kcalFromMacros(m: Pick<Macros, 'protein' | 'fat' | 'carbs'>) {
  return (
    m.protein * KCAL_PER_GRAM.protein + m.carbs * KCAL_PER_GRAM.carbs + m.fat * KCAL_PER_GRAM.fat
  )
}

/** Single glass volume (ml) used by WaterCard. */
export const GLASS_ML = 250

/** Rounds to 1 decimal place (used for macro grams). */
export function round1(n: number) {
  return Math.round(n * 10) / 10
}

/**
 * Scales per-100g values to a specific gram amount.
 * Matches the backend calculation formula: value * amount / 100.
 */
export function macrosFor(product: Product, amountInGrams: number): Macros {
  const factor = amountInGrams / 100
  return {
    kcal: Math.round(product.caloriesPer100g * factor),
    protein: round1(product.proteinPer100g * factor),
    fat: round1(product.fatPer100g * factor),
    carbs: round1(product.carbsPer100g * factor),
  }
}

/** Sums macronutrients across a list of entries (e.g. a meal or full day). */
export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: round1(acc.protein + m.protein),
      fat: round1(acc.fat + m.fat),
      carbs: round1(acc.carbs + m.carbs),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  )
}

/**
 * Joins a diary entry with its product and computes macros (client-side equivalent of SQL JOIN).
 * Returns `null` if the referenced product is missing.
 */
export function toEntryView(
  entry: DiaryEntry,
  products: Product[],
  lang: Language = 'pl'
): DiaryEntryView | null {
  // Quick Add / custom entry: macros are provided directly without a product reference
  if (entry.productId == null && entry.customName) {
    const r1 = (n: number) => Math.round(n * 10) / 10
    return {
      ...entry,
      kcal: Math.round(entry.customCalories ?? 0),
      protein: r1(entry.customProtein ?? 0),
      fat: r1(entry.customFat ?? 0),
      carbs: r1(entry.customCarbs ?? 0),
      productName: entry.customName,
      unit: '', // No unit for custom entries (not weight-based)
    }
  }
  const product = products.find((p) => p.id === entry.productId)
  if (!product) return null

  // Format localized display label when unitKey and unitQuantity are present
  let displayLabel: string | undefined
  if (entry.unitKey && entry.unitQuantity != null) {
    const formattedQty = entry.unitQuantity.toLocaleString(getLocale(lang), {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
    const grams = formatGrams(entry.amountInGrams, lang)
    
    // For weight/volume base units: e.g. "150 g"
    if (entry.unitKey === 'g' || entry.unitKey === 'ml') {
      displayLabel = grams
    } else {
      // For custom units: e.g. "3 × portion (50 g)"
      const unitName = getUnitLabel(lang, entry.unitKey)
      displayLabel = `${formattedQty} × ${unitName} (${grams})`
    }
  }

  return {
    ...entry,
    ...macrosFor(product, entry.amountInGrams),
    productName: product.name,
    unit: product.unit,
    displayLabel,
  }
}

// --- Dates ------------------------------------------------------------------
// Uses `YYYY-MM-DD` keys in LOCAL time (`toISOString()` uses UTC and shifts dates near midnight).

export function toDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Computes the percentage of total calories contributed by each macronutrient.
 * Used for macro breakdown rings (shows energy share rather than gram share).
 */
export function calcMacroPercentages(product: Product) {
  const totalKcal = product.caloriesPer100g
  if (totalKcal === 0) return { proteinPct: 0, fatPct: 0, carbsPct: 0 }
  
  return {
    proteinPct: Math.round((product.proteinPer100g * KCAL_PER_GRAM.protein / totalKcal) * 100),
    fatPct: Math.round((product.fatPer100g * KCAL_PER_GRAM.fat / totalKcal) * 100),
    carbsPct: Math.round((product.carbsPer100g * KCAL_PER_GRAM.carbs / totalKcal) * 100),
  }
}

// --- Serving units ----------------------------------------------------------

export type AvailableUnit = { key: string; gramsPerUnit: number }

/**
 * Returns all serving units available for a product:
 * always 'g' (and 'ml' for liquids), plus 'portion', 'package', and custom ProductUnits.
 */
export function getAvailableUnits(product: Product): AvailableUnit[] {
  const units: AvailableUnit[] = [{ key: 'g', gramsPerUnit: 1 }]

  // Treat ml as 1:1 with grams
  if (product.unit === 'ml') {
    units.push({ key: 'ml', gramsPerUnit: 1 })
  }

  if (product.defaultServingGrams && product.defaultServingGrams > 0) {
    units.push({ key: 'portion', gramsPerUnit: product.defaultServingGrams })
  }

  if (product.packageWeightGrams && product.packageWeightGrams > 0) {
    units.push({ key: 'package', gramsPerUnit: product.packageWeightGrams })
  }

  // Custom units from ProductUnits table
  if (product.units) {
    product.units.forEach((u) => {
      units.push({ key: u.unitKey, gramsPerUnit: u.gramsPerUnit })
    })
  }

  return units
}

/**
 * Converts a quantity in the given unit to grams. Returns 0 for unknown units.
 */
export function gramsFor(product: Product, unitKey: string, quantity: number): number {
  const units = getAvailableUnits(product)
  const unit = units.find((u) => u.key === unitKey)
  return unit ? quantity * unit.gramsPerUnit : 0
}

/**
 * Builds up to 3 quick-add serving rows:
 * Rows 1-2: recently used combinations (or default 1x/2x portion, or 100g fallback).
 * Row 3: 1x package or 100g fallback, deduplicated.
 */
export function buildQuickRows(
  product: Product,
  usage: { recent: Array<{ unitKey: string; quantity: number }> } | null
): Array<{ unitKey: string; quantity: number; grams: number }> {
  const rows: Array<{ unitKey: string; quantity: number; grams: number }> = []
  const seen = new Set<string>()

  function addRow(unitKey: string, quantity: number) {
    const grams = gramsFor(product, unitKey, quantity)
    if (grams <= 0) return
    const key = `${unitKey}:${quantity}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ unitKey, quantity, grams })
  }

  // Rows 1-2: recently used servings if available
  if (usage && usage.recent.length > 0) {
    usage.recent.slice(0, 2).forEach((r) => addRow(r.unitKey, r.quantity))
  } else {
    // Fallback: 1 portion, 2 portions (when defined), otherwise 100g
    if (product.defaultServingGrams && product.defaultServingGrams > 0) {
      addRow('portion', 1)
      addRow('portion', 2)
    } else {
      addRow('g', 100)
    }
  }

  // Row 3: package or 100g
  if (product.packageWeightGrams && product.packageWeightGrams > 0) {
    addRow('package', 1)
  } else {
    addRow('g', 100)
  }

  return rows.slice(0, 3) // maximum 3 rows
}

/**
 * Formats gram amounts using the active locale (e.g. "16,7 g" in PL or "16.7 g" in EN).
 */
export function formatGrams(grams: number, lang: Language = 'pl'): string {
  return `${grams.toLocaleString(getLocale(lang), { minimumFractionDigits: 0, maximumFractionDigits: 1 })} g`
}
