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
  // Szybki wpis (Quick Add) – brak produktu, makro podane bezpośrednio
  if (entry.productId == null && entry.customName) {
    const round1 = (n: number) => Math.round(n * 10) / 10
    return {
      ...entry,
      kcal: Math.round(entry.customCalories ?? 0),
      protein: round1(entry.customProtein ?? 0),
      fat: round1(entry.customFat ?? 0),
      carbs: round1(entry.customCarbs ?? 0),
      productName: entry.customName,
      unit: '',  // Brak jednostki dla custom entries (to nie są gramy)
    }
  }
  const product = products.find((p) => p.id === entry.productId)
  if (!product) return null

  // Jeśli wpis ma unitKey i unitQuantity, wygeneruj displayLabel
  let displayLabel: string | undefined
  if (entry.unitKey && entry.unitQuantity != null) {
    // Formatuj ilość (usuwaj zbędne zera po przecinku, np. 1.0 → 1, 0.75 → 0,75)
    const formattedQty = entry.unitQuantity.toLocaleString('pl-PL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
    const grams = formatGrams(entry.amountInGrams)
    
    // Dla gramów: "150 g"
    if (entry.unitKey === 'g' || entry.unitKey === 'ml') {
      displayLabel = grams
    } else {
      // Dla innych jednostek: "3 × porcja (50 g)"
      // getUnitLabel to funkcja z i18n.ts – używamy tu prostej wersji
      const unitName = entry.unitKey === 'portion' ? 'porcja'
        : entry.unitKey === 'package' ? 'opakowanie'
        : entry.unitKey
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

// --- Jednostki (serving units) ------------------------------------------------

export type AvailableUnit = { key: string; gramsPerUnit: number }

/**
 * Zwraca listę jednostek dostępnych dla danego produktu.
 * Zawsze: 'g' (i 'ml' gdy produkt jest w ml).
 * Dodatkowo: 'portion' (gdy defaultServingGrams jest), 'package' (gdy packageWeightGrams jest),
 * oraz wszystkie jednostki z product.units.
 */
export function getAvailableUnits(product: Product): AvailableUnit[] {
  const units: AvailableUnit[] = [{ key: 'g', gramsPerUnit: 1 }]

  // ml traktujemy 1:1 z gramami (uproszczenie)
  if (product.unit === 'ml') {
    units.push({ key: 'ml', gramsPerUnit: 1 })
  }

  if (product.defaultServingGrams && product.defaultServingGrams > 0) {
    units.push({ key: 'portion', gramsPerUnit: product.defaultServingGrams })
  }

  if (product.packageWeightGrams && product.packageWeightGrams > 0) {
    units.push({ key: 'package', gramsPerUnit: product.packageWeightGrams })
  }

  // Jednostki niestandardowe z tabeli ProductUnits
  if (product.units) {
    product.units.forEach((u) => {
      units.push({ key: u.unitKey, gramsPerUnit: u.gramsPerUnit })
    })
  }

  return units
}

/**
 * Przelicza ilość w danej jednostce na gramy.
 * Zwraca 0, gdy jednostka nieznana.
 */
export function gramsFor(product: Product, unitKey: string, quantity: number): number {
  const units = getAvailableUnits(product)
  const unit = units.find((u) => u.key === unitKey)
  return unit ? quantity * unit.gramsPerUnit : 0
}

/**
 * Buduje 3 wiersze „szybkiego dodawania" (quick rows):
 * Wiersze 1–2: ostatnio używane kombinacje (z historii) lub domyślne (1×porcja, 2×porcja, 100g).
 * Wiersz 3: opakowanie lub 100g (jeśli opakowania brak).
 * Duplikaty są pomijane.
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

  // Wiersze 1–2: ostatnio używane (jeśli są)
  if (usage && usage.recent.length > 0) {
    usage.recent.slice(0, 2).forEach((r) => addRow(r.unitKey, r.quantity))
  } else {
    // Fallback: 1 porcja, 2 porcje (jeśli produkt ma porcję), w przeciwnym razie 100g
    if (product.defaultServingGrams && product.defaultServingGrams > 0) {
      addRow('portion', 1)
      addRow('portion', 2)
    } else {
      addRow('g', 100)
    }
  }

  // Wiersz 3: opakowanie lub 100g
  if (product.packageWeightGrams && product.packageWeightGrams > 0) {
    addRow('package', 1)
  } else {
    addRow('g', 100)
  }

  return rows.slice(0, 3) // maksymalnie 3 wiersze
}

/**
 * Formatuje gramy w formacie pl-PL (przecinek zamiast kropki).
 * Przykład: formatGrams(16.7) => "16,7 g"
 */
export function formatGrams(grams: number): string {
  return `${grams.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} g`
}
