import type { DiaryEntry, DiaryEntryView, Macros, MealType, Product } from './types'
import { getMealLabel, type Language } from './i18n'

/** Pory posiłków w kolejności wyświetlania (z obsługą i18n). */
export function getMeals(lang: Language): { id: MealType; label: string }[] {
  const mealIds: MealType[] = ['breakfast', 'second-breakfast', 'lunch', 'snack', 'dinner']
  return mealIds.map(id => ({
    id,
    label: getMealLabel(lang, id),
  }))
}

/** Domyślna lista posiłków (dla kompatybilności wstecznej, angielski). */
export const MEALS: { id: MealType; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'second-breakfast', label: 'Second breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snack' },
  { id: 'dinner', label: 'Dinner' },
]

/**
 * Domyślne dzienne cele (użytkownik może je zmienić w ustawieniach).
 * Makro sumuje się do 2090 kcal, czyli mieści się w limicie 2100 kcal.
 * TODO(backend): docelowo ustawienia użytkownika.
 */
export const GOALS: Macros & { water: number } = {
  kcal: 2100,
  protein: 130,
  fat: 70,
  carbs: 235,
  water: 2000,
}

/** Kaloryczność 1 g makroskładnika (współczynniki Atwatera). */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

/** Liczy kalorie wynikające z podanej ilości makroskładników (w gramach). */
export function kcalFromMacros(m: Pick<Macros, 'protein' | 'fat' | 'carbs'>) {
  return (
    m.protein * KCAL_PER_GRAM.protein + m.carbs * KCAL_PER_GRAM.carbs + m.fat * KCAL_PER_GRAM.fat
  )
}

/** Pojemność jednej szklanki wody (ml) – używane przez WaterCard. */
export const GLASS_ML = 250

/** Zaokrąglenie do 1 miejsca po przecinku (dla gramów makro). */
export function round1(n: number) {
  return Math.round(n * 10) / 10
}

/**
 * Przelicza wartości „na 100 g” na konkretną ilość.
 * To ta sama formuła, której użyje backend: wartość * ilość / 100.
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

/** Sumuje makroskładniki z listy (np. wszystkich wpisów danego posiłku). */
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
 * Łączy wpis dziennika z produktem i wylicza makro – odpowiednik JOIN-a w SQL.
 * Zwraca `null`, gdy produkt nie istnieje (np. został usunięty).
 */
export function toEntryView(entry: DiaryEntry, products: Product[]): DiaryEntryView | null {
  const product = products.find((p) => p.id === entry.productId)
  if (!product) return null
  return {
    ...entry,
    ...macrosFor(product, entry.amountInGrams),
    productName: product.name,
    unit: product.unit,
  }
}

// --- Daty -------------------------------------------------------------------
// Używamy kluczy `YYYY-MM-DD` w czasie LOKALNYM. `toISOString()` daje czas UTC,
// co np. o 0:30 w Polsce zwróciłoby jeszcze wczorajszą datę.

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
 * Liczy procent kalorii pochodzących z każdego makroskładnika.
 * Używane w wykresach kołowych (pokazują rozkład źródeł energii, nie wagę).
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
