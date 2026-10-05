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

/** Produkt z bazy – wartości odżywcze zawsze podane na 100 g (lub 100 ml). */
export type Product = {
  id: number
  name: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  carbsPer100g: number

  // --- Pola tylko frontendowe (na razie nie ma ich w backendzie) ---
  /** Dodatkowy opis/marka wyświetlana pod nazwą. */
  brand?: string
  /** Jednostka wyświetlana w UI. */
  unit: 'g' | 'ml'
  /** Domyślna porcja proponowana przy dodawaniu. */
  defaultServing: number
  /** Lista składników produktu. */
  ingredients?: string
}

/** Pojedynczy wpis w dzienniku: „zjadłem X gramów produktu Y w dniu Z”. */
export type DiaryEntry = {
  id: number
  productId: number
  amountInGrams: number
  /** Data w formacie `YYYY-MM-DD` (bez godziny – liczy się tylko dzień). */
  date: string
  mealType: MealType
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
    unit: Product['unit']
  }
