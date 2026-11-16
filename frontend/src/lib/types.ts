/**
 * Typy domenowe aplikacji.
 *
 * `Product` i `DiaryEntry` odwzorowują encje z backendu (ASP.NET Core + EF Core),
 * z tymi samymi nazwami pól (camelCase – tak domyślnie serializuje System.Text.Json).
 * Dzięki temu podpięcie API sprowadzi się do podmiany źródła danych,
 * bez zmian w komponentach.
 */

/** Pora posiłku. W backendzie: pole `MealType` w encji `DiaryEntry`. */
export type MealType = 'breakfast' | 'second-breakfast' | 'lunch' | 'snack' | 'dinner'

/** Klucze jednostek wspieranych przez backend. Może być dowolny string. */
export type UnitKey = 'g' | 'ml' | 'portion' | 'package' | string

/** Jednostka zdefiniowana dla konkretnego produktu (np. plaster sera = 16,7 g). */
export type ProductUnit = {
  id: number
  unitKey: UnitKey
  gramsPerUnit: number
  productId: number
}

/** Produkt z bazy – wartości odżywcze zawsze podane na 100 g (lub 100 ml). */
export type Product = {
  id: number
  name: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number

  // --- Pola z backendu (hybrydowe wyszukiwanie + Open Food Facts) ---
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

  // --- Pola tylko frontendowe ---
  /** Jednostka wyświetlana w UI. */
  unit: 'g' | 'ml'
  /** Domyślna porcja proponowana przy dodawaniu. */
  defaultServing: number
}

/** Pojedynczy wpis w dzienniku: „zjadłem X gramów produktu Y w dniu Z”. */
export type DiaryEntry = {
  id: number
  productId?: number // Opcjonalny - może być null dla szybkich wpisów
  amountInGrams: number
  unitKey?: string // Jednostka, w której użytkownik wprowadził wpis (np. "portion")
  unitQuantity?: number // Ilość w tej jednostce (np. 3)
  /** Data w formacie `YYYY-MM-DD` (bez godziny – liczy się tylko dzień). */
  date: string
  mealType: MealType
  /** Właściciel dziennika (wewnętrzne ID z backendu). */
  userId?: number
  /** Kto fizycznie dodał wpis – różny od `userId`, gdy dodał go partner. */
  createdByUserId?: number
  // Pola dla szybkich wpisów (bez produktu w bazie)
  customName?: string
  customCalories?: number
  customProtein?: number
  customFat?: number
  customCarbs?: number
}

/** Wyliczone makroskładniki dla konkretnej ilości produktu. */
export type Macros = {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/**
 * Wpis dziennika „połączony” z produktem – gotowy do wyświetlenia.
 * Backend w przyszłości może zwracać to od razu (np. z endpointu /api/diary/today).
 */
export type DiaryEntryView = DiaryEntry &
  Macros & {
    productName: string
    unit: Product['unit'] | ''  // Pusty string dla custom entries (szybkie dodanie)
    displayLabel?: string  // Etykieta z jednostką użytą przez użytkownika, np. "3 × porcja (50 g)"
  }

/** Wiersz szybkiego dodawania produktu (np. "1 × porcja" → 16,7 g → 45 kcal). */
export type ServingOption = {
  unitKey: UnitKey
  quantity: number
  grams: number
}

/** Historia użycia jednostek dla danego produktu przez użytkownika. */
export type ProductUsage = {
  recent: ServingUsageDto[]
  mostUsed?: ServingUsageDto
}

export type ServingUsageDto = {
  unitKey: string
  quantity: number
}

