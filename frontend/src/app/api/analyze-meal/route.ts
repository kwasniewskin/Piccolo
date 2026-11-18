import { NextRequest, NextResponse } from 'next/server'
import { AiProviderError, callVisionJsonModel } from '@/lib/ai-provider'
import type {
  AiAnalyzedIngredient,
  AiIngredientSourceType,
  AiMealAllocation,
  AiMealDraftItem,
  AnalyzeMealRequest,
  AnalyzeMealResponse,
  RecalculateIngredientResponse,
} from '@/lib/ai-meal-types'
import type { MealType } from '@/lib/types'

const VALID_MEAL_TYPES: MealType[] = [
  'breakfast',
  'second-breakfast',
  'lunch',
  'snack',
  'dinner',
]

const VALID_SOURCE_TYPES: AiIngredientSourceType[] = [
  'database_candidate',
  'from_label_photo',
  'ai_estimated',
]

const MEAL_ANALYZER_SYSTEM_PROMPT = `Jesteś ekspertem dietetycznym i asystentem dziennika kalorii Piccolo.
Przeanalizuj dane wejściowe użytkownika (tekst, poprzedni szkic przy korekcie oraz załączone zdjęcia) i zwróć TYLKO czysty obiekt JSON w dokładnie określonej strukturze.

KLUCZOWA ZASADA (1 garnek vs wiele posiłków / talerzy):
- Jeśli opis lub zdjęcie dotyczy JEDNEGO posiłku albo JEDNEGO wspólnego garnka/patelni dzielonego porcjami (np. "curry na 4 porcje dla mnie i partnera na dziś i jutro") -> zwróć tablicę "meals" z 1 elementem, a podział porcji zapisz w "allocations".
- Jeśli na kartce lub w opisie są OSOBNE talerze z różnymi gramaturami (np. dwie kolumny "N" i "W" albo "Ja" i "Partner", gdzie każde ma inne ilości tych samych składników, np. kanapki/śniadanie) ALBO wyraźnie dwa osobne posiłki (np. Śniadanie i Obiad) -> NIE sumuj ich w jeden garnek! Zwróć w tablicy "meals" OSOBNE obiekty dla każdej osoby/posiłku, z własną listą "ingredients" oraz własnym "allocations".
- Dla każdego obiektu w "meals" ustaw krótkie "tabLabel" (np. "Ja", "Partner", lub nazwa posiłku gdy wszystko jest dla jednej osoby).

ZADANIA:
1. Odczytaj opis posiłku, przepis i/lub zdjęcia:
   - Jeśli zdjęcie przedstawia kartkę papieru z odręcznymi notatkami lub zrzut ekranu przepisu — odczytaj wszystkie składniki, gramatury oraz podział na osoby/dni.
   - Jeśli niektóre skróty na kartce są niejasne lub niejednoznaczne (np. "BAZ", "PH", "T+S", "Tw"), oszacuj je możliwie rozsądnie, ale KONIECZNIE w polu "aiSummary" wymień te niepewne skróty i poproś użytkownika o doprecyzowanie niżej.
   - Jeśli zdjęcie przedstawia opakowanie produktu / tabelę wartości odżywczych / kod kreskowy / skład — wyciągnij dokładne wartości odżywcze na 100g, nazwę, producenta/markę, kod kreskowy, wagę opakowania i skład. Oznacz taki składnik jako sourceType: "from_label_photo", saveToDatabase: true oraz uzupełnij newProductDetails.
2. Jeśli użytkownik podał przepis z modyfikacjami (np. "zamiast śmietany dałam skyr", "mniej makaronu"), uwzględnij WYŁĄCZNIE faktycznie użyte składniki i zmodyfikowane gramatury.
3. Jeśli przekazano previousMeals i refinementPrompt — potraktuj refinementPrompt jako polecenie modyfikacji previousMeals (np. zmiana wariantu składnika na wysokobiałkowy, rozszyfrowanie skrótów na wszystkich zakładkach, zmiana gramatury lub podziału) i zwróć kompletną, zaktualizowaną tablicę "meals".
4. Dla każdego składnika:
   - Przelicz ilość na gramy (amountGrams > 0), nawet jeśli podano sztuki, łyżki, szklanki, opakowania itp.
   - Wygeneruj searchQuery: krótką, czystą nazwę produktu po polsku w mianowniku liczby pojedynczej, zoptymalizowaną pod wyszukiwarkę lokalnej bazy produktów (bez gramatur i zbędnych słów, np. "pierś z kurczaka", "ryż basmati", "serek śmietankowy wysokobiałkowy").
   - Podaj rzetelne nutritionPer100g (calories, protein, fat, carbs oraz opcjonalnie saturatedFat, sugars, fiber, salt).
   - Jeśli to nie zdjęcie etykiety konkretnego nowego produktu, ustaw sourceType na "database_candidate" (albo "ai_estimated").
5. Wylicz totalPortions (domyślnie 1, chyba że danie z garnka ma np. 4 porcje).
6. Zbuduj tablicę allocations dla każdego elementu w "meals":
   - Masz w kontekście currentDate (dziś), tomorrowDate (jutro), dayAfterTomorrowDate (pojutrze), currentMeal, hasPartner, partnerName oraz isViewingPartner.
   - "dziś" -> currentDate, "jutro" -> tomorrowDate, "pojutrze" -> dayAfterTomorrowDate (YYYY-MM-DD).
   - "breakfast" (śniadanie), "second-breakfast" (drugie śniadanie), "lunch" (obiad), "snack" (przekąska), "dinner" (kolacja); domyślnie currentMeal.
   - "self" (ja / użytkownik) lub "partner" (partner — tylko gdy hasPartner=true; gdy hasPartner=false zawsze użyj "self").
   - Jeśli nie określono podziału, utwórz domyślnie 1 wpis z portions: 1.
7. Napisz aiSummary: krótkie (1-2 zdania po polsku) podsumowanie co policzono (oraz ewentualne pytanie o niejasne skróty z kartki).

FORMAT JSON ODPOWIEDZI:
{
  "aiSummary": "string",
  "meals": [
    {
      "dishName": "string",
      "tabLabel": "string",
      "totalPortions": number,
      "ingredients": [
        {
          "rawName": "string",
          "searchQuery": "string",
          "amountGrams": number,
          "sourceType": "database_candidate" | "from_label_photo" | "ai_estimated",
          "saveToDatabase": boolean,
          "nutritionPer100g": {
            "calories": number,
            "protein": number,
            "fat": number,
            "carbs": number,
            "saturatedFat": number,
            "sugars": number,
            "fiber": number,
            "salt": number
          },
          "newProductDetails": {
            "name": "string",
            "brand": "string",
            "manufacturer": "string",
            "barcode": "string",
            "packageWeightGrams": number,
            "defaultServingGrams": number,
            "ingredients": "string"
          }
        }
      ],
      "allocations": [
        {
          "target": "self" | "partner",
          "date": "YYYY-MM-DD",
          "mealType": "breakfast" | "second-breakfast" | "lunch" | "snack" | "dinner",
          "portions": number
        }
      ]
    }
  ]
}`

const SINGLE_INGREDIENT_SYSTEM_PROMPT = `Jesteś asystentem dietetycznym Piccolo.
Na podstawie podanej nazwy produktu spożywczego (np. "serek śmietankowy wysokobiałkowy", "skyr waniliowy", "bułka grahamka") oszacuj rzetelne wartości odżywcze na 100g i zwróć TYLKO czysty JSON:
{
  "rawName": "string (czytelna nazwa produktu po polsku)",
  "searchQuery": "string (krótka fraza do wyszukania w bazie produktów po polsku)",
  "nutritionPer100g": {
    "calories": number,
    "protein": number,
    "fat": number,
    "carbs": number
  }
}`

function addDaysToIsoDate(isoDate: string, days: number): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return isoDate
  const d = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)
  )
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function toNonNegativeNumber(val: unknown, fallback = 0): number {
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num) || num < 0) return fallback
  return num
}

function toPositiveNumber(val: unknown, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return num
}

function toOptionalString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined
  const trimmed = val.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isValidIsoDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())
}

function normalizeMealType(val: unknown, fallback: MealType): MealType {
  if (typeof val === 'string' && VALID_MEAL_TYPES.includes(val as MealType)) {
    return val as MealType
  }
  return fallback
}

function normalizeIngredient(
  item: Record<string, unknown>,
  fallbackAmount = 100
): AiAnalyzedIngredient {
  const rawName = toOptionalString(item.rawName) || 'Składnik'
  const searchQuery = toOptionalString(item.searchQuery) || rawName
  const amountGrams = Math.round(toPositiveNumber(item.amountGrams, fallbackAmount) * 10) / 10
  const sourceType: AiIngredientSourceType = VALID_SOURCE_TYPES.includes(
    item.sourceType as AiIngredientSourceType
  )
    ? (item.sourceType as AiIngredientSourceType)
    : 'database_candidate'

  const rawNutrition =
    item.nutritionPer100g && typeof item.nutritionPer100g === 'object'
      ? (item.nutritionPer100g as Record<string, unknown>)
      : {}

  const nutritionPer100g = {
    calories: Math.round(toNonNegativeNumber(rawNutrition.calories, 0)),
    protein: Math.round(toNonNegativeNumber(rawNutrition.protein, 0) * 10) / 10,
    fat: Math.round(toNonNegativeNumber(rawNutrition.fat, 0) * 10) / 10,
    carbs: Math.round(toNonNegativeNumber(rawNutrition.carbs, 0) * 10) / 10,
    ...(rawNutrition.saturatedFat != null
      ? { saturatedFat: Math.round(toNonNegativeNumber(rawNutrition.saturatedFat, 0) * 10) / 10 }
      : {}),
    ...(rawNutrition.sugars != null
      ? { sugars: Math.round(toNonNegativeNumber(rawNutrition.sugars, 0) * 10) / 10 }
      : {}),
    ...(rawNutrition.fiber != null
      ? { fiber: Math.round(toNonNegativeNumber(rawNutrition.fiber, 0) * 10) / 10 }
      : {}),
    ...(rawNutrition.salt != null
      ? { salt: Math.round(toNonNegativeNumber(rawNutrition.salt, 0) * 100) / 100 }
      : {}),
  }

  const rawDetails =
    item.newProductDetails && typeof item.newProductDetails === 'object'
      ? (item.newProductDetails as Record<string, unknown>)
      : undefined

  const newProductDetails = rawDetails
    ? {
        name: toOptionalString(rawDetails.name) || rawName,
        brand: toOptionalString(rawDetails.brand),
        manufacturer: toOptionalString(rawDetails.manufacturer),
        barcode: toOptionalString(rawDetails.barcode),
        packageWeightGrams:
          rawDetails.packageWeightGrams != null
            ? toNonNegativeNumber(rawDetails.packageWeightGrams, 0) || undefined
            : undefined,
        defaultServingGrams:
          rawDetails.defaultServingGrams != null
            ? toNonNegativeNumber(rawDetails.defaultServingGrams, 0) || undefined
            : undefined,
        ingredients: toOptionalString(rawDetails.ingredients),
      }
    : undefined

  const saveToDatabase =
    typeof item.saveToDatabase === 'boolean'
      ? item.saveToDatabase
      : sourceType === 'from_label_photo'

  return {
    rawName,
    searchQuery,
    amountGrams,
    sourceType,
    saveToDatabase,
    nutritionPer100g,
    ...(newProductDetails ? { newProductDetails } : {}),
  }
}

function normalizeMealItem(
  raw: Record<string, unknown>,
  context: AnalyzeMealRequest['context'],
  index: number
): AiMealDraftItem {
  const dishName = toOptionalString(raw.dishName) || 'Posiłek AI'
  const totalPortions = Math.round(toPositiveNumber(raw.totalPortions, 1) * 100) / 100

  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const ingredients: AiAnalyzedIngredient[] = rawIngredients
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => normalizeIngredient(item))

  const rawAllocations = Array.isArray(raw.allocations) ? raw.allocations : []
  let allocations: AiMealAllocation[] = rawAllocations
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const target: 'self' | 'partner' =
        item.target === 'partner' && context.hasPartner ? 'partner' : 'self'
      const date = isValidIsoDate(item.date)
        ? item.date.trim()
        : context.currentDate
      const mealType = normalizeMealType(item.mealType, context.currentMeal)
      const portions = Math.round(toPositiveNumber(item.portions, 1) * 100) / 100

      return { target, date, mealType, portions }
    })

  if (allocations.length === 0) {
    allocations = [
      {
        target: context.isViewingPartner && context.hasPartner ? 'partner' : 'self',
        date: context.currentDate,
        mealType: context.currentMeal,
        portions: 1,
      },
    ]
  }

  const defaultTabLabel =
    allocations.every((a) => a.target === 'partner')
      ? context.partnerName || 'Partner'
      : allocations.every((a) => a.target === 'self')
      ? 'Ja'
      : `Posiłek ${index + 1}`

  const tabLabel = toOptionalString(raw.tabLabel) || defaultTabLabel

  return {
    dishName,
    tabLabel,
    totalPortions,
    ingredients,
    allocations,
  }
}

function normalizeAnalyzeMealResponse(
  raw: Record<string, unknown>,
  context: AnalyzeMealRequest['context']
): Omit<AnalyzeMealResponse, 'provider' | 'model'> {
  const rawMeals = Array.isArray(raw.meals)
    ? raw.meals.filter(
        (m): m is Record<string, unknown> => !!m && typeof m === 'object'
      )
    : [raw]

  const meals = rawMeals.map((m, idx) => normalizeMealItem(m, context, idx))
  if (meals.length === 0) {
    meals.push(normalizeMealItem({}, context, 0))
  }

  const aiSummary =
    toOptionalString(raw.aiSummary) ||
    (meals.length > 1
      ? `Rozdzielono analizę na ${meals.length} osobne posiłki.`
      : `Przeanalizowano posiłek „${meals[0].dishName}”.`)

  return {
    meals,
    aiSummary,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AnalyzeMealRequest>

    // Szybkie przeliczenie jednego zmienionego składnika (np. "serek wysokobiałkowy")
    if (body.recalculateIngredient) {
      const name = toOptionalString(body.recalculateIngredient.name)
      const amountGrams = toPositiveNumber(body.recalculateIngredient.amountGrams, 100)
      if (!name) {
        return NextResponse.json(
          { error: 'Podaj nazwę składnika do przeliczenia.' },
          { status: 400 }
        )
      }

      const result = await callVisionJsonModel<Record<string, unknown>>({
        systemPrompt: SINGLE_INGREDIENT_SYSTEM_PROMPT,
        userText: `Przelicz wartości odżywcze na 100g dla produktu: "${name}".`,
        preferredProvider: 'gemini',
        preferFlagship: false,
        maxTokens: 800,
      })

      const normalizedIng = normalizeIngredient(
        {
          ...result.data,
          rawName: toOptionalString(result.data.rawName) || name,
          amountGrams,
          sourceType: 'ai_estimated',
        },
        amountGrams
      )

      const payload: RecalculateIngredientResponse = {
        ingredient: normalizedIng,
        provider: result.provider,
        model: result.model,
      }
      return NextResponse.json(payload)
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const refinementPrompt =
      typeof body.refinementPrompt === 'string' ? body.refinementPrompt.trim() : ''
    const images = Array.isArray(body.images)
      ? body.images.filter((img): img is string => typeof img === 'string' && img.length > 0)
      : []

    if (!prompt && !refinementPrompt && images.length === 0) {
      return NextResponse.json(
        { error: 'Wpisz opis posiłku lub dodaj zdjęcie.' },
        { status: 400 }
      )
    }

    const fallbackDate = new Date().toISOString().slice(0, 10)
    const context: AnalyzeMealRequest['context'] = {
      currentDate: isValidIsoDate(body.context?.currentDate)
        ? body.context!.currentDate
        : fallbackDate,
      currentMeal: normalizeMealType(body.context?.currentMeal, 'lunch'),
      isViewingPartner: Boolean(body.context?.isViewingPartner),
      hasPartner: Boolean(body.context?.hasPartner),
      partnerName: body.context?.partnerName ?? null,
    }

    const tomorrowDate = addDaysToIsoDate(context.currentDate, 1)
    const dayAfterTomorrowDate = addDaysToIsoDate(context.currentDate, 2)

    const contextBlock = [
      'KONTEKST DZIENNIKA:',
      `- currentDate (dziś): ${context.currentDate}`,
      `- tomorrowDate (jutro): ${tomorrowDate}`,
      `- dayAfterTomorrowDate (pojutrze): ${dayAfterTomorrowDate}`,
      `- currentMeal (domyślny posiłek): ${context.currentMeal}`,
      `- isViewingPartner: ${context.isViewingPartner}`,
      `- hasPartner: ${context.hasPartner}${context.partnerName ? ` (${context.partnerName})` : ''}`,
    ].join('\n')

    const userSections: string[] = [contextBlock]

    if (body.previousMeals && Array.isArray(body.previousMeals)) {
      userSections.push(
        `POPRZEDNI SZKIC POSIŁKÓW (previousMeals):\n${JSON.stringify(body.previousMeals, null, 2)}`
      )
    }

    if (prompt) {
      userSections.push(`OPIS / NOTATKA UŻYTKOWNIKA:\n${prompt}`)
    }

    if (refinementPrompt) {
      userSections.push(`KOREKTA / DOPRECYZOWANIE OD UŻYTKOWNIKA:\n${refinementPrompt}`)
    }

    if (images.length > 0 && !prompt && !refinementPrompt) {
      userSections.push(
        'Przeanalizuj załączone zdjęcia (notatki z kartki, przepisy lub etykiety produktów) i wylicz posiłki.'
      )
    }

    const result = await callVisionJsonModel<Record<string, unknown>>({
      systemPrompt: MEAL_ANALYZER_SYSTEM_PROMPT,
      userText: userSections.join('\n\n'),
      images,
      preferredProvider: 'gemini',
      preferFlagship: true,
      maxTokens: 4000,
    })

    const normalized = normalizeAnalyzeMealResponse(result.data, context)

    const responsePayload: AnalyzeMealResponse = {
      ...normalized,
      provider: result.provider,
      model: result.model,
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Analyze meal error:', error)
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera podczas analizy posiłku' },
      { status: 500 }
    )
  }
}
