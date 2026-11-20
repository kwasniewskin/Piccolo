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

function getMealOutputLanguageRules(language: 'en' | 'pl'): {
  tabExamples: string
  searchQueryRule: string
  summaryLang: string
} {
  if (language === 'en') {
    return {
      tabExamples: '"Me", "Partner", or the meal name in English',
      searchQueryRule:
        'Generate searchQuery: a concise, canonical product name in English (singular base form, no weights or filler words, e.g., "chicken breast", "basmati rice", "high-protein cream cheese") optimized for database & Open Food Facts search.',
      summaryLang: 'Write aiSummary, dishName, tabLabel, and rawName in English.',
    }
  }

  return {
    tabExamples: '"Ja", "Partner", or the meal name in Polish',
    searchQueryRule:
      'Generate searchQuery: a concise, canonical product name in Polish (nominative singular, no weights or filler words, e.g., "pierś z kurczaka", "ryż basmati", "serek śmietankowy wysokobiałkowy") optimized for local database & Open Food Facts search.',
    summaryLang: 'Write aiSummary, dishName, tabLabel, and rawName in Polish.',
  }
}

function buildMealAnalyzerSystemPrompt(language: 'en' | 'pl'): string {
  const rules = getMealOutputLanguageRules(language)

  return `You are a nutrition assistant for the Piccolo calorie tracker.
Analyze the user's input (text description, previous meal draft during refinement, and attached photos) and return ONLY a raw JSON object matching the exact schema below.

KEY RULE (1 shared pot vs multiple meals / plates):
- If the description or photo covers ONE meal or ONE shared pot/pan split into portions (e.g., "4 portions of curry for me and my partner for today and tomorrow") -> return "meals" with 1 item and encode the portion split in "allocations".
- If a handwritten sheet or description lists SEPARATE plates with different weights (e.g., two columns "N" and "W" or "Me" and "Partner" with different gram amounts for sandwiches/breakfast) OR clearly distinct meals (e.g., Breakfast and Lunch) -> DO NOT merge them into one pot! Return SEPARATE objects in "meals" for each person/meal, each with its own "ingredients" and "allocations".
- Set a concise "tabLabel" for each item in "meals" (${rules.tabExamples}).

OUTPUT LANGUAGE:
- ${rules.summaryLang}

TASKS:
1. Parse meal descriptions, recipes, and/or photos:
   - If a photo shows handwritten paper notes or a recipe screenshot, extract all ingredients, weights in grams, and person/day splits.
   - If any abbreviations on handwritten notes are ambiguous (e.g., "BAZ", "PH", "T+S", "Tw"), estimate reasonably AND list those uncertain abbreviations in "aiSummary" asking the user to clarify below.
   - If a photo shows product packaging / nutrition table / barcode / ingredients list, extract exact nutrition per 100g, product name, brand/manufacturer, barcode, package weight, and ingredients. Mark it as sourceType: "from_label_photo", saveToDatabase: true, and populate newProductDetails.
2. If the user provides a recipe with modifications (e.g., "used skyr instead of sour cream", "less pasta"), include ONLY the ingredients actually used and adjusted weights.
3. When previousMeals and refinementPrompt are passed, treat refinementPrompt as an edit instruction on previousMeals (e.g., swapping to a high-protein variant, decoding abbreviations across all tabs, adjusting weights or allocations) and return the complete updated "meals" array.
4. For each ingredient:
   - Convert quantities to grams (amountGrams > 0), even when given in pieces, tablespoons, cups, or packages.
   - ${rules.searchQueryRule}
   - Provide accurate nutritionPer100g (calories, protein, fat, carbs, and optionally saturatedFat, sugars, fiber, salt).
   - Unless it comes from a packaging/label photo of a specific product, set sourceType to "database_candidate" (or "ai_estimated").
5. Compute totalPortions (default 1 unless a shared dish yields e.g. 4 portions).
6. Build allocations for every element in "meals":
   - Context provides currentDate (today), tomorrowDate (tomorrow), dayAfterTomorrowDate (day after tomorrow), currentMeal, hasPartner, partnerName, and isViewingPartner.
   - Map "today"/"dziś" -> currentDate, "tomorrow"/"jutro" -> tomorrowDate, "day after tomorrow"/"pojutrze" -> dayAfterTomorrowDate (YYYY-MM-DD).
   - Allowed mealType values: "breakfast", "second-breakfast", "lunch", "snack", "dinner"; default to currentMeal.
   - target: "self" or "partner" (use "partner" ONLY when hasPartner=true; if hasPartner=false always use "self").
   - If no split is specified, create 1 default allocation with portions: 1.
7. Write aiSummary: a brief (1-2 sentence) summary of what was calculated (plus any question about ambiguous handwritten abbreviations).

JSON RESPONSE SCHEMA:
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
}

function buildSingleIngredientSystemPrompt(language: 'en' | 'pl'): string {
  const langLabel = language === 'en' ? 'English' : 'Polish'
  return `You are a nutrition assistant for Piccolo.
Given a food product name (e.g., "high-protein cream cheese", "vanilla skyr", "serek śmietankowy wysokobiałkowy"), estimate accurate nutrition per 100g and return ONLY raw JSON:
{
  "rawName": "string (clean readable product name in ${langLabel})",
  "searchQuery": "string (concise product search phrase in ${langLabel})",
  "nutritionPer100g": {
    "calories": number,
    "protein": number,
    "fat": number,
    "carbs": number
  }
}`
}

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
  fallbackAmount = 100,
  language: 'en' | 'pl' = 'pl'
): AiAnalyzedIngredient {
  const rawName = toOptionalString(item.rawName) || (language === 'en' ? 'Ingredient' : 'Składnik')
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
  const language = context.language === 'en' ? 'en' : 'pl'
  const dishName = toOptionalString(raw.dishName) || (language === 'en' ? 'AI Meal' : 'Posiłek AI')
  const totalPortions = Math.round(toPositiveNumber(raw.totalPortions, 1) * 100) / 100

  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const ingredients: AiAnalyzedIngredient[] = rawIngredients
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => normalizeIngredient(item, 100, language))

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
      ? language === 'en'
        ? 'Me'
        : 'Ja'
      : language === 'en'
      ? `Meal ${index + 1}`
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

  const language = context.language === 'en' ? 'en' : 'pl'
  const aiSummary =
    toOptionalString(raw.aiSummary) ||
    (language === 'en'
      ? meals.length > 1
        ? `Split analysis into ${meals.length} separate meals.`
        : `Analyzed meal "${meals[0].dishName}".`
      : meals.length > 1
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

    // Quick recalculation for a single edited ingredient (e.g., "high-protein cream cheese")
    if (body.recalculateIngredient) {
      const language = body.recalculateIngredient.language === 'en' ? 'en' : 'pl'
      const name = toOptionalString(body.recalculateIngredient.name)
      const amountGrams = toPositiveNumber(body.recalculateIngredient.amountGrams, 100)
      if (!name) {
        return NextResponse.json(
          {
            error:
              language === 'en'
                ? 'Enter an ingredient name to recalculate.'
                : 'Podaj nazwę składnika do przeliczenia.',
          },
          { status: 400 }
        )
      }

      const result = await callVisionJsonModel<Record<string, unknown>>({
        systemPrompt: buildSingleIngredientSystemPrompt(language),
        userText:
          language === 'en'
            ? `Estimate nutrition values per 100g for product: "${name}".`
            : `Przelicz wartości odżywcze na 100g dla produktu: "${name}".`,
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
        amountGrams,
        language
      )

      const payload: RecalculateIngredientResponse = {
        ingredient: normalizedIng,
        provider: result.provider,
        model: result.model,
      }
      return NextResponse.json(payload)
    }

    const language: 'en' | 'pl' = body.context?.language === 'en' ? 'en' : 'pl'
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const refinementPrompt =
      typeof body.refinementPrompt === 'string' ? body.refinementPrompt.trim() : ''
    const images = Array.isArray(body.images)
      ? body.images.filter((img): img is string => typeof img === 'string' && img.length > 0)
      : []

    if (!prompt && !refinementPrompt && images.length === 0) {
      return NextResponse.json(
        {
          error:
            language === 'en'
              ? 'Enter a meal description or attach a photo.'
              : 'Wpisz opis posiłku lub dodaj zdjęcie.',
        },
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
      language,
    }

    const tomorrowDate = addDaysToIsoDate(context.currentDate, 1)
    const dayAfterTomorrowDate = addDaysToIsoDate(context.currentDate, 2)

    const contextBlock = [
      'DIARY CONTEXT:',
      `- language: ${language}`,
      `- currentDate (today): ${context.currentDate}`,
      `- tomorrowDate (tomorrow): ${tomorrowDate}`,
      `- dayAfterTomorrowDate (day after tomorrow): ${dayAfterTomorrowDate}`,
      `- currentMeal (default meal): ${context.currentMeal}`,
      `- isViewingPartner: ${context.isViewingPartner}`,
      `- hasPartner: ${context.hasPartner}${context.partnerName ? ` (${context.partnerName})` : ''}`,
    ].join('\n')

    const userSections: string[] = [contextBlock]

    if (body.previousMeals && Array.isArray(body.previousMeals)) {
      userSections.push(
        `PREVIOUS MEAL DRAFT (previousMeals):\n${JSON.stringify(body.previousMeals, null, 2)}`
      )
    }

    if (prompt) {
      userSections.push(`USER DESCRIPTION / NOTE:\n${prompt}`)
    }

    if (refinementPrompt) {
      userSections.push(`USER REFINEMENT / CLARIFICATION:\n${refinementPrompt}`)
    }

    if (images.length > 0 && !prompt && !refinementPrompt) {
      userSections.push(
        'Analyze the attached photos (handwritten notes, recipes, or product nutrition labels) and calculate the meals.'
      )
    }

    const result = await callVisionJsonModel<Record<string, unknown>>({
      systemPrompt: buildMealAnalyzerSystemPrompt(language),
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
      { error: 'Internal server error while analyzing meal' },
      { status: 500 }
    )
  }
}
