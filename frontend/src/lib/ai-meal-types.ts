import type { MealType } from './types'

export type AiNutritionPer100g = {
  calories: number
  protein: number
  fat: number
  carbs: number
  saturatedFat?: number
  sugars?: number
  fiber?: number
  salt?: number
}

export type AiNewProductDetails = {
  name?: string
  brand?: string
  manufacturer?: string
  barcode?: string
  packageWeightGrams?: number
  defaultServingGrams?: number
  ingredients?: string
}

export type AiIngredientSourceType =
  | 'database_candidate'
  | 'from_label_photo'
  | 'ai_estimated'

export type AiAnalyzedIngredient = {
  rawName: string
  searchQuery: string
  amountGrams: number
  sourceType: AiIngredientSourceType
  saveToDatabase?: boolean
  nutritionPer100g: AiNutritionPer100g
  newProductDetails?: AiNewProductDetails
}

export type AiMealAllocation = {
  target: 'self' | 'partner'
  date: string
  mealType: MealType
  portions: number
}

export type AiMealDraftItem = {
  dishName: string
  tabLabel?: string
  totalPortions: number
  ingredients: AiAnalyzedIngredient[]
  allocations: AiMealAllocation[]
}

export type AnalyzeMealRequest = {
  prompt?: string
  images?: string[]
  context: {
    currentDate: string
    currentMeal: MealType
    isViewingPartner: boolean
    hasPartner: boolean
    partnerName?: string | null
  }
  previousMeals?: AiMealDraftItem[]
  refinementPrompt?: string
  recalculateIngredient?: {
    name: string
    amountGrams: number
  }
}

export type AnalyzeMealResponse = {
  meals: AiMealDraftItem[]
  aiSummary: string
  provider?: 'openai' | 'gemini'
  model?: string
}

export type RecalculateIngredientResponse = {
  ingredient: AiAnalyzedIngredient
  provider?: 'openai' | 'gemini'
  model?: string
}
