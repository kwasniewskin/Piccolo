'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { toast as sonnerToast } from 'sonner'
import * as api from '@/lib/api'
import { macrosFor, round1, sumMacros } from '@/lib/nutrition'
import { getMealLabel, getTranslation, type Language } from '@/lib/i18n'
import { useOptionalLanguage } from '@/lib/language-context'
import { usePartner } from '@/lib/partner-context'
import type { Macros, MealType, Product } from '@/lib/types'
import type {
  AiAnalyzedIngredient,
  AiIngredientSourceType,
  AiMealAllocation,
  AiMealDraftItem,
  AiNewProductDetails,
  AiNutritionPer100g,
  AnalyzeMealRequest,
  AnalyzeMealResponse,
  RecalculateIngredientResponse,
} from '@/lib/ai-meal-types'

type Props = {
  meal: MealType
  date: string
  targetUserId?: number
  onBack: () => void
  onComplete: () => void
  showToast: (msg: string) => void
}

type IngredientMode = 'db' | 'new_product' | 'ai'
type SaveMode = 'single_dish' | 'separate_ingredients'

type EditableIngredient = {
  localId: string
  rawName: string
  searchQuery: string
  amountGrams: number
  sourceType: AiIngredientSourceType
  mode: IngredientMode
  saveToDatabase: boolean
  nutritionPer100g: AiNutritionPer100g
  newProductDetails?: AiNewProductDetails
  candidates: Product[]
  selectedProduct: Product | null
}

type EditableAllocation = AiMealAllocation & {
  localId: string
}

type EditableMealItem = {
  localId: string
  dishName: string
  tabLabel: string
  totalPortions: number
  enabled: boolean
  ingredients: EditableIngredient[]
  allocations: EditableAllocation[]
}

type MealDraftState = {
  aiSummary: string
  providerInfo?: string
  meals: EditableMealItem[]
}

const SAVE_MODE_STORAGE_KEY = 'piccolo:ai-save-mode'

const MEAL_TYPE_IDS: MealType[] = [
  'breakfast',
  'second-breakfast',
  'lunch',
  'snack',
  'dinner',
]

function makeLocalId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function shiftIsoDate(isoDate: string, days: number): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return isoDate
  const d = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)
  )
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatPortionLabel(portions: number): string {
  const formatted = portions.toLocaleString('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  if (portions === 1) return `${formatted} porcja`
  if (portions > 1 && portions < 5 && Number.isInteger(portions)) {
    return `${formatted} porcje`
  }
  return `${formatted} porcji`
}

async function compressImageToDataUrl(file: File): Promise<string> {
  const maxDimension = 1600
  const quality = 0.82
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = objectUrl
    })

    let { width, height } = img
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width)
        width = maxDimension
      } else {
        width = Math.round((width * maxDimension) / height)
        height = maxDimension
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, width)
    canvas.height = Math.max(1, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Brak kontekstu Canvas 2D')

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function getIngredientMacros(ing: EditableIngredient): Macros {
  if (ing.mode === 'db' && ing.selectedProduct) {
    return macrosFor(ing.selectedProduct, ing.amountGrams)
  }
  const factor = ing.amountGrams / 100
  return {
    kcal: Math.round(ing.nutritionPer100g.calories * factor),
    protein: round1(ing.nutritionPer100g.protein * factor),
    fat: round1(ing.nutritionPer100g.fat * factor),
    carbs: round1(ing.nutritionPer100g.carbs * factor),
  }
}

function getIngredientDisplayName(ing: EditableIngredient): string {
  if (ing.mode === 'db' && ing.selectedProduct) {
    return ing.selectedProduct.name
  }
  return ing.newProductDetails?.name || ing.rawName
}

function sortCandidatesLocalFirst(products: Product[]): Product[] {
  const local = products.filter((p) => p.id > 0 && p.dataSource !== 'OFF')
  const off = products.filter((p) => p.id === 0 || p.dataSource === 'OFF')
  return [...local, ...off]
}

async function resolveSingleIngredientMatch(
  ing: AiAnalyzedIngredient,
  language: Language,
  previousIngredients?: EditableIngredient[]
): Promise<EditableIngredient> {
  const prevMatch = previousIngredients?.find(
    (p) =>
      p.searchQuery.trim().toLowerCase() ===
        ing.searchQuery.trim().toLowerCase() &&
      p.mode === 'db' &&
      p.selectedProduct !== null
  )

  if (prevMatch && ing.sourceType !== 'from_label_photo') {
    return {
      localId: makeLocalId('ing'),
      rawName: ing.rawName,
      searchQuery: ing.searchQuery,
      amountGrams: ing.amountGrams,
      sourceType: ing.sourceType,
      mode: 'db',
      saveToDatabase: false,
      nutritionPer100g: ing.nutritionPer100g,
      newProductDetails: ing.newProductDetails,
      candidates: prevMatch.candidates,
      selectedProduct: prevMatch.selectedProduct,
    }
  }

  const rawResults = await api.searchProducts(ing.searchQuery, language)
  const candidates = sortCandidatesLocalFirst(rawResults)
  const localCandidates = candidates.filter(
    (p) => p.id > 0 && p.dataSource !== 'OFF'
  )

  if (ing.sourceType === 'from_label_photo') {
    const barcode = ing.newProductDetails?.barcode?.trim()
    let existingByBarcode: Product | null = null
    if (barcode) {
      const found = await api.getProductByBarcode(barcode, language)
      if (found && found.id > 0 && found.dataSource !== 'OFF') {
        existingByBarcode = found
      }
    }

    if (existingByBarcode) {
      return {
        localId: makeLocalId('ing'),
        rawName: ing.rawName,
        searchQuery: ing.searchQuery,
        amountGrams: ing.amountGrams,
        sourceType: ing.sourceType,
        mode: 'db',
        saveToDatabase: false,
        nutritionPer100g: ing.nutritionPer100g,
        newProductDetails: ing.newProductDetails,
        candidates: [
          existingByBarcode,
          ...candidates.filter((c) => c.id !== existingByBarcode!.id),
        ],
        selectedProduct: existingByBarcode,
      }
    }

    return {
      localId: makeLocalId('ing'),
      rawName: ing.rawName,
      searchQuery: ing.searchQuery,
      amountGrams: ing.amountGrams,
      sourceType: ing.sourceType,
      mode: 'new_product',
      saveToDatabase: ing.saveToDatabase ?? true,
      nutritionPer100g: ing.nutritionPer100g,
      newProductDetails: ing.newProductDetails ?? { name: ing.rawName },
      candidates,
      selectedProduct: null,
    }
  }

  if (localCandidates.length > 0) {
    return {
      localId: makeLocalId('ing'),
      rawName: ing.rawName,
      searchQuery: ing.searchQuery,
      amountGrams: ing.amountGrams,
      sourceType: ing.sourceType,
      mode: 'db',
      saveToDatabase: false,
      nutritionPer100g: ing.nutritionPer100g,
      newProductDetails: ing.newProductDetails,
      candidates,
      selectedProduct: localCandidates[0],
    }
  }

  return {
    localId: makeLocalId('ing'),
    rawName: ing.rawName,
    searchQuery: ing.searchQuery,
    amountGrams: ing.amountGrams,
    sourceType: ing.sourceType,
    mode: 'ai',
    saveToDatabase: Boolean(ing.saveToDatabase),
    nutritionPer100g: ing.nutritionPer100g,
    newProductDetails: ing.newProductDetails ?? { name: ing.rawName },
    candidates,
    selectedProduct: null,
  }
}

function toRequestMeals(meals: EditableMealItem[]): AiMealDraftItem[] {
  return meals.map((m) => ({
    dishName: m.dishName,
    tabLabel: m.tabLabel,
    totalPortions: m.totalPortions,
    ingredients: m.ingredients.map((ing) => ({
      rawName: getIngredientDisplayName(ing),
      searchQuery: ing.searchQuery,
      amountGrams: ing.amountGrams,
      sourceType: ing.sourceType,
      saveToDatabase: ing.saveToDatabase,
      nutritionPer100g:
        ing.mode === 'db' && ing.selectedProduct
          ? {
              calories: ing.selectedProduct.caloriesPer100g,
              protein: ing.selectedProduct.proteinPer100g,
              fat: ing.selectedProduct.fatPer100g,
              carbs: ing.selectedProduct.carbsPer100g,
            }
          : ing.nutritionPer100g,
      newProductDetails: ing.newProductDetails,
    })),
    allocations: m.allocations.map((a) => ({
      target: a.target,
      date: a.date,
      mealType: a.mealType,
      portions: a.portions,
    })),
  }))
}

export function AiMealAssistant({
  meal,
  date,
  onBack,
  onComplete,
  showToast,
}: Props) {
  const { language } = useOptionalLanguage()
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key)
  const { partnerInfo, isViewingPartner } = usePartner()
  const hasPartner = partnerInfo !== null
  const partnerName = partnerInfo?.name || partnerInfo?.email || 'Partner'

  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzingLabel, setAnalyzingLabel] = useState(t('ai-analyzing-default'))

  const [draft, setDraft] = useState<MealDraftState | null>(null)
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const [expandedIngId, setExpandedIngId] = useState<string | null>(null)
  const [optionsExpanded, setOptionsExpanded] = useState(false)
  const [showPortionStepper, setShowPortionStepper] = useState(false)

  const [saveMode, setSaveMode] = useState<SaveMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(SAVE_MODE_STORAGE_KEY)
      if (saved === 'single_dish' || saved === 'separate_ingredients') {
        return saved
      }
    }
    return 'single_dish'
  })

  const [refinementText, setRefinementText] = useState('')
  const [refinementImages, setRefinementImages] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const refineImageInputRef = useRef<HTMLInputElement>(null)

  const tomorrowDate = shiftIsoDate(date, 1)

  function handleSaveModeChange(next: SaveMode) {
    setSaveMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SAVE_MODE_STORAGE_KEY, next)
    }
  }

  async function handleFilesSelected(
    e: ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    const files = e.target.files
    if (!files || files.length === 0) return

    try {
      const compressed = await Promise.all(
        Array.from(files).map((f) => compressImageToDataUrl(f))
      )
      setter((prev) => [...prev, ...compressed.filter(Boolean)])
    } catch (err) {
      console.error('Image compression error:', err)
      showToast(t('ai-error-image-compression'))
    } finally {
      e.target.value = ''
    }
  }

  async function runAiAnalysis(options: {
    isRefinement: boolean
    text: string
    attachedImages: string[]
  }) {
    if (!options.text.trim() && options.attachedImages.length === 0) {
      showToast(t('ai-error-empty-input'))
      return
    }

    setAnalyzing(true)
    setAnalyzingLabel(
      options.isRefinement
        ? t('ai-analyzing-refinement')
        : t('ai-analyzing-input')
    )

    try {
      const payload: AnalyzeMealRequest = {
        context: {
          currentDate: date,
          currentMeal: meal,
          isViewingPartner,
          hasPartner,
          partnerName: hasPartner ? partnerName : null,
          language,
        },
        ...(options.isRefinement && draft
          ? {
              previousMeals: toRequestMeals(draft.meals),
              refinementPrompt: options.text.trim(),
              images: options.attachedImages,
            }
          : {
              prompt: options.text.trim(),
              images: options.attachedImages,
            }),
      }

      const response = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        showToast(data?.error || t('ai-error-analyze'))
        return
      }

      const analyzed = data as AnalyzeMealResponse
      setAnalyzingLabel(t('ai-matching-db'))

      const resolvedMeals: EditableMealItem[] = await Promise.all(
        analyzed.meals.map(async (m, idx) => {
          const prevMeal = options.isRefinement ? draft?.meals[idx] : undefined
          const matchedIngredients = await Promise.all(
            m.ingredients.map((ing) =>
              resolveSingleIngredientMatch(ing, language, prevMeal?.ingredients)
            )
          )
          return {
            localId: makeLocalId('meal'),
            dishName: m.dishName,
            tabLabel: m.tabLabel || `${t('ai-tab-fallback')} ${idx + 1}`,
            totalPortions: m.totalPortions,
            enabled: prevMeal ? prevMeal.enabled : true,
            ingredients: matchedIngredients,
            allocations: m.allocations.map((a) => ({
              ...a,
              localId: makeLocalId('alloc'),
            })),
          }
        })
      )

      setDraft({
        aiSummary: analyzed.aiSummary,
        providerInfo: analyzed.model
          ? `${analyzed.provider === 'gemini' ? 'Gemini' : 'OpenAI'} · ${analyzed.model}`
          : undefined,
        meals: resolvedMeals,
      })

      setActiveTabIdx((prev) =>
        prev < resolvedMeals.length ? prev : 0
      )
      setExpandedIngId(null)
      setShowPortionStepper(
        resolvedMeals.some(
          (m) => m.totalPortions !== 1 || m.allocations.length > 1
        )
      )

      if (options.isRefinement) {
        setRefinementText('')
        setRefinementImages([])
      }
    } catch (err) {
      console.error('AI meal analysis error:', err)
      showToast(t('ai-error-connection'))
    } finally {
      setAnalyzing(false)
    }
  }

  function updateActiveMeal(
    updater: (m: EditableMealItem) => EditableMealItem
  ) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        meals: prev.meals.map((m, idx) =>
          idx === activeTabIdx ? updater(m) : m
        ),
      }
    })
  }

  function updateIngredient(
    localId: string,
    updater: (ing: EditableIngredient) => EditableIngredient
  ) {
    updateActiveMeal((m) => ({
      ...m,
      ingredients: m.ingredients.map((ing) =>
        ing.localId === localId ? updater(ing) : ing
      ),
    }))
  }

  function removeIngredient(localId: string) {
    updateActiveMeal((m) => ({
      ...m,
      ingredients: m.ingredients.filter((ing) => ing.localId !== localId),
    }))
    if (expandedIngId === localId) {
      setExpandedIngId(null)
    }
  }

  function addBlankIngredient() {
    const id = makeLocalId('ing')
    updateActiveMeal((m) => ({
      ...m,
      ingredients: [
        ...m.ingredients,
        {
          localId: id,
          rawName: t('ai-new-ingredient'),
          searchQuery: '',
          amountGrams: 100,
          sourceType: 'ai_estimated',
          mode: 'ai',
          saveToDatabase: false,
          nutritionPer100g: { calories: 0, protein: 0, fat: 0, carbs: 0 },
          newProductDetails: { name: t('ai-new-ingredient') },
          candidates: [],
          selectedProduct: null,
        },
      ],
    }))
    setExpandedIngId(id)
  }

  function updateAllocation(
    localId: string,
    updater: (alloc: EditableAllocation) => EditableAllocation
  ) {
    updateActiveMeal((m) => ({
      ...m,
      allocations: m.allocations.map((a) =>
        a.localId === localId ? updater(a) : a
      ),
    }))
  }

  function removeAllocation(localId: string) {
    updateActiveMeal((m) => {
      if (m.allocations.length <= 1) return m
      return {
        ...m,
        allocations: m.allocations.filter((a) => a.localId !== localId),
      }
    })
  }

  function addAllocation() {
    updateActiveMeal((m) => {
      const nextTarget: 'self' | 'partner' =
        hasPartner && m.allocations.every((a) => a.target === 'self')
          ? 'partner'
          : 'self'
      const nextDate =
        m.allocations.length === 1 && nextTarget === 'self'
          ? tomorrowDate
          : date
      return {
        ...m,
        allocations: [
          ...m.allocations,
          {
            localId: makeLocalId('alloc'),
            target: nextTarget,
            date: nextDate,
            mealType: meal,
            portions: 1,
          },
        ],
      }
    })
  }

  async function handleConfirmSave() {
    if (!draft) return
    const enabledMeals = draft.meals.filter((m) => m.enabled)
    if (enabledMeals.length === 0) {
      showToast(t('ai-select-meal-error'))
      return
    }
    for (const m of enabledMeals) {
      if (m.ingredients.length === 0) {
        showToast(`${t('ai-add-ingredients-prefix')} "${m.tabLabel}"`)
        return
      }
      if (m.allocations.length === 0 || !(m.totalPortions > 0)) {
        showToast(`${t('ai-check-allocations-prefix')} "${m.tabLabel}"`)
        return
      }
    }

    setSaving(true)
    try {
      const resolvedProducts = new Map<string, Product | null>()
      const importedOffCache = new Map<string, Product>()
      const createdByNameCache = new Map<string, Product>()

      // 1. Create custom/scanned products and import OFF matches for all enabled meal tabs
      for (const m of enabledMeals) {
        for (const ing of m.ingredients) {
          let product = ing.mode === 'db' ? ing.selectedProduct : null

          if (!product && ing.saveToDatabase) {
            const details = ing.newProductDetails
            const productName = (details?.name || ing.rawName).trim()
            if (!productName) {
              showToast(t('ai-enter-product-name'))
              setSaving(false)
              return
            }

            const cacheKey = `${productName.toLowerCase()}|${details?.barcode || ''}`
            const existingCreated = createdByNameCache.get(cacheKey)
            if (existingCreated) {
              product = existingCreated
            } else {
              const created = await api.createProduct({
                name: productName,
                brand: details?.brand || null,
                manufacturer: details?.manufacturer || null,
                barcode: details?.barcode || null,
                ingredients: details?.ingredients || null,
                caloriesPer100g: ing.nutritionPer100g.calories,
                proteinPer100g: ing.nutritionPer100g.protein,
                fatPer100g: ing.nutritionPer100g.fat,
                carbsPer100g: ing.nutritionPer100g.carbs,
                saturatedFatPer100g: ing.nutritionPer100g.saturatedFat ?? 0,
                sugarsPer100g: ing.nutritionPer100g.sugars ?? 0,
                fiberPer100g: ing.nutritionPer100g.fiber ?? 0,
                saltPer100g: ing.nutritionPer100g.salt ?? 0,
                packageWeightGrams: details?.packageWeightGrams ?? 0,
                defaultServingGrams: details?.defaultServingGrams ?? 0,
                dataSource: 'User',
              })

              if (!created) {
                showToast(
                  `${t('ai-save-product-failed-prefix')} "${productName}" ${t('ai-save-product-failed-suffix')}`
                )
                setSaving(false)
                return
              }
              createdByNameCache.set(cacheKey, created)
              product = created
            }
          }

          if (product && (product.dataSource === 'OFF' || product.id === 0)) {
            const offKey = product.barcode || product.name
            const cached = importedOffCache.get(offKey)
            if (cached) {
              product = cached
            } else {
              const imported = await api.importProduct(product)
              if (!imported) {
                showToast(`${t('ai-import-product-failed-prefix')} "${product.name}"`)
                setSaving(false)
                return
              }
              importedOffCache.set(offKey, imported)
              product = imported
            }
          }

          resolvedProducts.set(ing.localId, product)
        }
      }

      let createdCount = 0
      let failedCount = 0

      // 2. Persist diary entries across enabled tabs and allocations
      for (const m of enabledMeals) {
        const dishMacros = sumMacros(m.ingredients.map(getIngredientMacros))
        const safeDishName = m.dishName.trim() || t('ai-meal-fallback-name')

        for (const alloc of m.allocations) {
          const entryTargetUserId =
            alloc.target === 'partner' && hasPartner
              ? partnerInfo?.userId
              : undefined

          const ratio = alloc.portions / m.totalPortions

          if (saveMode === 'single_dish') {
            const entryName =
              m.totalPortions !== 1 || alloc.portions !== 1
                ? `${safeDishName} (${formatPortionLabel(alloc.portions)})`
                : safeDishName

            const created = await api.createDiaryEntry(
              alloc.date,
              alloc.mealType,
              null,
              {
                customName: entryName,
                customCalories: Math.round(dishMacros.kcal * ratio),
                customProtein: round1(dishMacros.protein * ratio),
                customFat: round1(dishMacros.fat * ratio),
                customCarbs: round1(dishMacros.carbs * ratio),
                targetUserId: entryTargetUserId,
              }
            )
            if (created) createdCount++
            else failedCount++
          } else {
            for (const ing of m.ingredients) {
              const grams = Math.max(1, Math.round(ing.amountGrams * ratio))
              const product = resolvedProducts.get(ing.localId) ?? null

              if (product && product.id > 0) {
                api.cacheProducts([product])
                const created = await api.createDiaryEntry(
                  alloc.date,
                  alloc.mealType,
                  grams,
                  {
                    productId: product.id,
                    unitKey: 'g',
                    unitQuantity: grams,
                    targetUserId: entryTargetUserId,
                  }
                )
                if (created) createdCount++
                else failedCount++
              } else {
                const factor = grams / 100
                const created = await api.createDiaryEntry(
                  alloc.date,
                  alloc.mealType,
                  null,
                  {
                    customName: `${getIngredientDisplayName(ing)} (${grams} g)`,
                    customCalories: Math.round(
                      ing.nutritionPer100g.calories * factor
                    ),
                    customProtein: round1(ing.nutritionPer100g.protein * factor),
                    customFat: round1(ing.nutritionPer100g.fat * factor),
                    customCarbs: round1(ing.nutritionPer100g.carbs * factor),
                    targetUserId: entryTargetUserId,
                  }
                )
                if (created) createdCount++
                else failedCount++
              }
            }
          }
        }
      }

      if (failedCount > 0 && createdCount === 0) {
        showToast(t('ai-save-failed-all'))
        return
      }

      if (failedCount > 0) {
        sonnerToast.warning(
          `${t('ai-saved-many-prefix')} ${createdCount} ${t('ai-saved-partial-middle')} ${failedCount} ${t('ai-saved-partial-suffix')}`
        )
      } else {
        sonnerToast.success(
          createdCount === 1
            ? t('ai-saved-one')
            : `${t('ai-saved-many-prefix')} ${createdCount} ${t('ai-saved-many-suffix')}`
        )
      }

      onComplete()
    } catch (err) {
      console.error('Error saving AI meal:', err)
      showToast(t('ai-save-meal-error'))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // View 1: Meal input (before AI analysis)
  // ---------------------------------------------------------------------------
  if (!draft) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex min-h-full flex-col gap-4">
        <div className="rounded-2xl bg-primary/10 px-4 py-3 text-sm text-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
            <Sparkles className="size-4" />
            {t('ai-assistant-title')}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('ai-assistant-subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="ai-meal-prompt" className="text-sm font-medium">
            {t('ai-prompt-label')}
          </label>
          <textarea
            id="ai-meal-prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={analyzing}
            placeholder={
              hasPartner
                ? t('ai-prompt-placeholder-partner')
                : t('ai-prompt-placeholder-solo')
            }
            className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('ai-photos-label')}
            </span>
            {images.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('ai-photos-added')} {images.length}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={analyzing}
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-xs font-semibold transition-transform active:scale-[0.98] hover:bg-secondary disabled:opacity-50"
            >
              <Camera className="size-4 text-primary" />
              {t('ai-take-photo')}
            </button>
            <button
              type="button"
              disabled={analyzing}
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-xs font-semibold transition-transform active:scale-[0.98] hover:bg-secondary disabled:opacity-50"
            >
              <ImagePlus className="size-4 text-primary" />
              {t('ai-choose-photos')}
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFilesSelected(e, setImages)}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFilesSelected(e, setImages)}
            className="hidden"
          />

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {images.map((src, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={src}
                    alt={`${t('ai-photo-alt')} ${idx + 1}`}
                    className="size-16 rounded-xl border border-border object-cover"
                  />
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() =>
                      setImages((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label={t('ai-remove-photo')}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white shadow"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto flex gap-2 pt-2">
          <button
            type="button"
            disabled={analyzing}
            onClick={onBack}
            className="flex-1 rounded-full bg-secondary py-3 text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {t('back')}
          </button>
          <button
            type="button"
            disabled={analyzing || (!prompt.trim() && images.length === 0)}
            onClick={() =>
              runAiAnalysis({
                isRefinement: false,
                text: prompt,
                attachedImages: images,
              })
            }
            className="flex flex-[1.5] items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>{analyzingLabel}</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                <span>{t('ai-analyze-btn')}</span>
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View 2: Compact 1:1 Piccolo meal review summary
  // ---------------------------------------------------------------------------
  const activeMeal = draft.meals[activeTabIdx] ?? draft.meals[0]
  const dishMacros = sumMacros(activeMeal.ingredients.map(getIngredientMacros))
  const safeTotalPortions =
    activeMeal.totalPortions > 0 ? activeMeal.totalPortions : 1
  const perPortionKcal = Math.round(dishMacros.kcal / safeTotalPortions)
  const hasMultipleTabs = draft.meals.length > 1
  const enabledCount = draft.meals.filter((m) => m.enabled).length

  const saveLabel =
    saveMode === 'single_dish'
      ? t('ai-mode-single-short')
      : t('ai-mode-separate-short')
  const whereLabel = hasMultipleTabs
    ? `${enabledCount} ${t('ai-tabs-selected')} ${draft.meals.length} ${t('ai-tabs-word')}`
    : activeMeal.allocations.length > 1
    ? `${activeMeal.allocations.length} ${t('ai-entries-word')}`
    : `${activeMeal.allocations[0]?.target === 'partner' ? partnerName : t('ai-me')} · ${
        activeMeal.allocations[0]?.date === date
          ? t('ai-today')
          : activeMeal.allocations[0]?.date === tomorrowDate
          ? t('ai-tomorrow')
          : activeMeal.allocations[0]?.date
      }`

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <div className="flex flex-col gap-3">
      {/* Tabs (shown when >1 separate plate/meal detected) */}
      {hasMultipleTabs && (
        <div
          className="grid gap-1.5 rounded-2xl bg-card p-1"
          style={{
            gridTemplateColumns: `repeat(${Math.min(draft.meals.length, 3)}, minmax(0, 1fr))`,
          }}
        >
          {draft.meals.map((m, idx) => {
            const mac = sumMacros(m.ingredients.map(getIngredientMacros))
            const isAct = idx === activeTabIdx
            return (
              <button
                key={m.localId}
                type="button"
                onClick={() => {
                  setActiveTabIdx(idx)
                  setExpandedIngId(null)
                }}
                className={`truncate rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                  isAct
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                } ${!m.enabled ? 'opacity-50 line-through' : ''}`}
              >
                {m.tabLabel} · {mac.kcal} kcal
              </button>
            )
          })}
        </div>
      )}

      {/* Compact AI summary bar + Refine with AI */}
      <div className="flex flex-col gap-2 rounded-2xl bg-primary/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-foreground">
              {draft.aiSummary}
            </p>
          </div>
          {draft.providerInfo && (
            <span className="shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              {draft.providerInfo}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={refinementText}
            onChange={(e) => setRefinementText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !analyzing &&
                (refinementText.trim() || refinementImages.length > 0)
              ) {
                e.preventDefault()
                runAiAnalysis({
                  isRefinement: true,
                  text: refinementText,
                  attachedImages: refinementImages,
                })
              }
            }}
            disabled={analyzing}
            placeholder={t('ai-refine-placeholder')}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="button"
            disabled={analyzing}
            onClick={() => refineImageInputRef.current?.click()}
            title={t('ai-refine-photo-title')}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <ImagePlus className="size-4" />
          </button>
          <button
            type="button"
            disabled={
              analyzing ||
              (!refinementText.trim() && refinementImages.length === 0)
            }
            onClick={() =>
              runAiAnalysis({
                isRefinement: true,
                text: refinementText,
                attachedImages: refinementImages,
              })
            }
            className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>{t('ai-recalculate-btn')}</span>
          </button>
        </div>

        <input
          ref={refineImageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFilesSelected(e, setRefinementImages)}
          className="hidden"
        />

        {refinementImages.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {refinementImages.map((src, idx) => (
              <div key={idx} className="relative">
                <img
                  src={src}
                  alt={`Korekta ${idx + 1}`}
                  className="size-10 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRefinementImages((prev) =>
                      prev.filter((_, i) => i !== idx)
                    )
                  }
                  className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dish summary card */}
      <div className="flex flex-col gap-2 rounded-3xl bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            aria-label={t('ai-dish-name-aria')}
            value={activeMeal.dishName}
            onChange={(e) =>
              updateActiveMeal((m) => ({ ...m, dishName: e.target.value }))
            }
            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none focus:border-b focus:border-primary"
          />
          <span className="shrink-0 text-sm font-bold tabular-nums text-kcal">
            {dishMacros.kcal} kcal
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
          <span>
            <span className="font-semibold text-protein">{t('protein-short')}</span>{' '}
            {dishMacros.protein}g ·{' '}
            <span className="font-semibold text-fat">{t('fat-short')}</span> {dishMacros.fat}g
            · <span className="font-semibold text-carbs">{t('carbs-short')}</span>{' '}
            {dishMacros.carbs}g
          </span>
          {hasMultipleTabs && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium">
              <input
                type="checkbox"
                checked={activeMeal.enabled}
                onChange={(e) =>
                  updateActiveMeal((m) => ({ ...m, enabled: e.target.checked }))
                }
                className="size-3.5 rounded accent-primary"
              />
              <span>{t('ai-include-tab')}</span>
            </label>
          )}
        </div>

        {(showPortionStepper ||
          activeMeal.totalPortions !== 1 ||
          activeMeal.allocations.length > 1) && (
          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
            <div className="text-xs">
              <span className="font-medium">{t('ai-portions-in-dish')}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                ({t('ai-per-portion')} {perPortionKcal} kcal)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  updateActiveMeal((m) => ({
                    ...m,
                    totalPortions: Math.max(
                      0.5,
                      Math.round((m.totalPortions - 0.5) * 10) / 10
                    ),
                  }))
                }
                className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-bold"
              >
                -
              </button>
              <NumericInput
                value={activeMeal.totalPortions}
                min={0.1}
                allowZero={false}
                ariaLabel={t('ai-portions-aria')}
                onChange={(val) =>
                  updateActiveMeal((m) => ({ ...m, totalPortions: val }))
                }
                className="w-12 rounded-lg border border-border bg-background py-1 text-center text-xs font-semibold tabular-nums outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  updateActiveMeal((m) => ({
                    ...m,
                    totalPortions:
                      Math.round((m.totalPortions + 0.5) * 10) / 10,
                  }))
                }
                className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-bold"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compact ingredient list (1 row per ingredient, expands on tap) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-muted-foreground">
            {t('ai-ingredients-heading')} ({activeMeal.ingredients.length}) · {t('ai-tap-to-edit')}
          </span>
          <button
            type="button"
            onClick={addBlankIngredient}
            className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="size-3.5" />
            {t('ai-add-btn')}
          </button>
        </div>

        <div className="divide-y divide-border/50 overflow-hidden rounded-3xl bg-card shadow-sm">
          {activeMeal.ingredients.map((ing) => (
            <CompactIngredientRow
              key={ing.localId}
              ingredient={ing}
              language={language}
              isExpanded={expandedIngId === ing.localId}
              onToggle={() =>
                setExpandedIngId((prev) =>
                  prev === ing.localId ? null : ing.localId
                )
              }
              onUpdate={(updater) => updateIngredient(ing.localId, updater)}
              onRemove={() => removeIngredient(ing.localId)}
              showToast={showToast}
            />
          ))}
        </div>
      </div>

      {/* Collapsible save mode & day/person allocation options */}
      <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setOptionsExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-xs"
        >
          <span className="font-semibold">
            {whereLabel} · <span className="text-primary">{saveLabel}</span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {optionsExpanded ? (
              <>
                {t('ai-collapse')} <ChevronUp className="size-3.5" />
              </>
            ) : (
              <>
                {t('ai-options')} <ChevronDown className="size-3.5" />
              </>
            )}
          </span>
        </button>

        {optionsExpanded && (
          <div className="flex flex-col gap-3 border-t border-border/50 px-4 py-3">
            {/* Save mode toggle */}
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-background p-1">
              <button
                type="button"
                onClick={() => handleSaveModeChange('single_dish')}
                className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
                  saveMode === 'single_dish'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('ai-mode-single-btn')}
              </button>
              <button
                type="button"
                onClick={() => handleSaveModeChange('separate_ingredients')}
                className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
                  saveMode === 'separate_ingredients'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('ai-mode-separate-btn')}
              </button>
            </div>

            {/* Allocations (person / date / meal slot / portions) */}
            <div className="flex flex-col gap-2">
              {activeMeal.allocations.map((alloc) => {
                const allocKcal = Math.round(
                  dishMacros.kcal * (alloc.portions / safeTotalPortions)
                )
                return (
                  <div
                    key={alloc.localId}
                    className="flex flex-col gap-2 rounded-2xl bg-background p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {hasPartner ? (
                        <div className="flex gap-1 rounded-xl bg-card p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateAllocation(alloc.localId, (a) => ({
                                ...a,
                                target: 'self',
                              }))
                            }
                            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                              alloc.target === 'self'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground'
                            }`}
                          >
                            <User className="size-3" />
                            {t('ai-me')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateAllocation(alloc.localId, (a) => ({
                                ...a,
                                target: 'partner',
                              }))
                            }
                            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                              alloc.target === 'partner'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground'
                            }`}
                          >
                            <Users className="size-3" />
                            {partnerName}
                          </button>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <User className="size-3 text-primary" />
                          {t('ai-my-diary')}
                        </span>
                      )}

                      {activeMeal.allocations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAllocation(alloc.localId)}
                          aria-label={t('ai-delete-entry-aria')}
                          className="rounded-lg p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateAllocation(alloc.localId, (a) => ({
                            ...a,
                            date,
                          }))
                        }
                        className={`rounded-lg px-2 py-1 text-xs font-medium ${
                          alloc.date === date
                            ? 'bg-primary/20 text-primary'
                            : 'bg-card text-muted-foreground'
                        }`}
                      >
                        {t('ai-today')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateAllocation(alloc.localId, (a) => ({
                            ...a,
                            date: tomorrowDate,
                          }))
                        }
                        className={`rounded-lg px-2 py-1 text-xs font-medium ${
                          alloc.date === tomorrowDate
                            ? 'bg-primary/20 text-primary'
                            : 'bg-card text-muted-foreground'
                        }`}
                      >
                        {t('ai-tomorrow')}
                      </button>
                      <input
                        type="date"
                        value={alloc.date}
                        onChange={(e) =>
                          updateAllocation(alloc.localId, (a) => ({
                            ...a,
                            date: e.target.value || date,
                          }))
                        }
                        className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1 text-xs outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={alloc.mealType}
                        onChange={(e) =>
                          updateAllocation(alloc.localId, (a) => ({
                            ...a,
                            mealType: e.target.value as MealType,
                          }))
                        }
                        className="min-w-0 flex-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
                      >
                        {MEAL_TYPE_IDS.map((mealId) => (
                          <option key={mealId} value={mealId}>
                            {getMealLabel(language, mealId)}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateAllocation(alloc.localId, (a) => ({
                              ...a,
                              portions: Math.max(
                                0.25,
                                Math.round((a.portions - 0.5) * 100) / 100
                              ),
                            }))
                          }
                          className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-bold"
                        >
                          -
                        </button>
                        <NumericInput
                          value={alloc.portions}
                          min={0.1}
                          allowZero={false}
                          ariaLabel={t('ai-allocation-portions-aria')}
                          onChange={(val) =>
                            updateAllocation(alloc.localId, (a) => ({
                              ...a,
                              portions: val,
                            }))
                          }
                          className="w-11 rounded-lg border border-border bg-card py-1 text-center text-xs font-semibold tabular-nums outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateAllocation(alloc.localId, (a) => ({
                              ...a,
                              portions:
                                Math.round((a.portions + 0.5) * 100) / 100,
                            }))
                          }
                          className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-bold"
                        >
                          +
                        </button>
                        <span className="ml-1 min-w-[48px] text-right text-xs font-semibold tabular-nums text-kcal">
                          {allocKcal} kcal
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPortionStepper(true)
                  addAllocation()
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="size-3.5" />
                {t('ai-add-allocation')}
              </button>
              {!showPortionStepper && activeMeal.totalPortions === 1 && (
                <button
                  type="button"
                  onClick={() => setShowPortionStepper(true)}
                  className="rounded-2xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {t('ai-split-portions')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom save actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={saving || analyzing}
          onClick={() => setDraft(null)}
          className="flex-1 rounded-full bg-secondary py-3 text-xs font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {t('ai-new-analysis')}
        </button>
        <button
          type="button"
          disabled={saving || analyzing}
          onClick={handleConfirmSave}
          className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>{t('ai-saving')}</span>
            </>
          ) : (
            <>
              <Check className="size-4" />
              <span>
                {hasMultipleTabs
                  ? `${t('ai-confirm-n')} (${enabledCount})`
                  : t('ai-confirm-single')}
              </span>
            </>
          )}
        </button>
      </div>
      </div>
    </div>
  )
}

function CompactIngredientRow({
  ingredient,
  language,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  showToast,
}: {
  ingredient: EditableIngredient
  language: Language
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updater: (ing: EditableIngredient) => EditableIngredient) => void
  onRemove: () => void
  showToast: (msg: string) => void
}) {
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key)
  const [searchTerm, setSearchTerm] = useState(ingredient.searchQuery)
  const [searchingDb, setSearchingDb] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [edit100gOpen, setEdit100gOpen] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [scanningLabel, setScanningLabel] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)

  const macros = getIngredientMacros(ingredient)
  const displayName = getIngredientDisplayName(ingredient)

  const dotClass =
    ingredient.mode === 'db'
      ? 'bg-kcal'
      : ingredient.mode === 'new_product'
      ? 'bg-amber-400'
      : 'bg-muted-foreground'

  async function handleManualSearch() {
    setSearchingDb(true)
    const results = sortCandidatesLocalFirst(
      await api.searchProducts(searchTerm.trim(), language)
    )
    setSearchingDb(false)
    onUpdate((ing) => ({ ...ing, candidates: results }))
  }

  async function handleRecalculateVariant() {
    const targetName = (ingredient.newProductDetails?.name || ingredient.rawName).trim()
    if (!targetName) {
      showToast(t('ai-enter-variant-name'))
      return
    }
    setRecalculating(true)
    try {
      const res = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recalculateIngredient: {
            name: targetName,
            amountGrams: ingredient.amountGrams,
            language,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error || t('ai-recalc-failed'))
        return
      }
      const { ingredient: nextIng } = data as RecalculateIngredientResponse
      const dbMatches = sortCandidatesLocalFirst(
        await api.searchProducts(nextIng.searchQuery, language)
      )
      const localMatch = dbMatches.find(
        (p) => p.id > 0 && p.dataSource !== 'OFF'
      )

      setSearchTerm(nextIng.searchQuery)
      onUpdate((ing) => ({
        ...ing,
        rawName: nextIng.rawName,
        searchQuery: nextIng.searchQuery,
        nutritionPer100g: nextIng.nutritionPer100g,
        newProductDetails: {
          ...ing.newProductDetails,
          name: nextIng.rawName,
        },
        candidates: dbMatches,
        mode: localMatch ? 'db' : 'ai',
        selectedProduct: localMatch ?? null,
        saveToDatabase: false,
      }))
    } catch (err) {
      console.error('Recalculate variant error:', err)
      showToast(t('ai-error-connection'))
    } finally {
      setRecalculating(false)
    }
  }

  async function handleScanIngredientLabel(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setScanningLabel(true)
    try {
      const compressed = await Promise.all(
        Array.from(files).map((f) => compressImageToDataUrl(f))
      )
      const res = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: compressed.filter(Boolean) }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error || t('ai-label-read-failed'))
        return
      }

      const barcode = typeof data.barcode === 'string' ? data.barcode.trim() : ''
      if (barcode) {
        const existing = await api.getProductByBarcode(barcode, language)
        if (existing && existing.id > 0 && existing.dataSource !== 'OFF') {
          onUpdate((ing) => ({
            ...ing,
            mode: 'db',
            selectedProduct: existing,
            saveToDatabase: false,
            candidates: [existing, ...ing.candidates.filter((c) => c.id !== existing.id)],
          }))
          sonnerToast.success(`${t('ai-found-in-db')} ${existing.name}`)
          return
        }
      }

      const scannedName =
        (typeof data.name === 'string' && data.name.trim()) || displayName

      onUpdate((ing) => ({
        ...ing,
        rawName: scannedName,
        sourceType: 'from_label_photo',
        mode: 'new_product',
        selectedProduct: null,
        saveToDatabase: true,
        nutritionPer100g: {
          calories: Number(data.calories) || 0,
          protein: Number(data.protein) || 0,
          fat: Number(data.fat) || 0,
          carbs: Number(data.carbs) || 0,
          saturatedFat: Number(data.saturatedFat) || 0,
          sugars: Number(data.sugars) || 0,
          fiber: Number(data.fiber) || 0,
          salt: Number(data.salt) || 0,
        },
        newProductDetails: {
          name: scannedName,
          manufacturer: data.manufacturer || undefined,
          barcode: barcode || undefined,
          packageWeightGrams: Number(data.weight) || undefined,
          ingredients: data.ingredients || undefined,
        },
      }))
      sonnerToast.success(t('ai-label-read-success'))
    } catch (err) {
      console.error('Label scan error:', err)
      showToast(t('ai-label-scan-error'))
    } finally {
      setScanningLabel(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      {/* 1-line compact ingredient row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/30"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`size-2 shrink-0 rounded-full ${dotClass}`} />
          <span className="truncate text-xs font-semibold">{displayName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="text-muted-foreground">{ingredient.amountGrams} g</span>
          <span className="font-bold text-kcal">{macros.kcal} kcal</span>
          {isExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded editor panel (only for the tapped ingredient) */}
      {isExpanded && (
        <div className="flex flex-col gap-2.5 border-t border-border/50 bg-background/50 px-4 py-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">
              {ingredient.mode === 'db' && ingredient.selectedProduct
                ? `${t('ai-source-db')} ${ingredient.selectedProduct.name}`
                : ingredient.mode === 'new_product'
                ? t('ai-source-label')
                : t('ai-source-ai')}
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 font-semibold text-destructive hover:underline"
            >
              {t('ai-delete')}
            </button>
          </div>

          {/* Name and weight inputs */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={
                ingredient.mode === 'db'
                  ? displayName
                  : ingredient.newProductDetails?.name ?? ingredient.rawName
              }
              onChange={(e) => {
                const nextName = e.target.value
                onUpdate((ing) => ({
                  ...ing,
                  mode: ing.mode === 'db' ? 'ai' : ing.mode,
                  selectedProduct: ing.mode === 'db' ? null : ing.selectedProduct,
                  rawName: nextName,
                  newProductDetails: {
                    ...ing.newProductDetails,
                    name: nextName,
                  },
                }))
              }}
              placeholder={t('ai-ingredient-name-placeholder')}
              className="min-w-0 flex-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
            />
            <div className="flex shrink-0 items-center gap-1">
              <NumericInput
                value={ingredient.amountGrams}
                min={0}
                allowZero={true}
                ariaLabel={t('ai-ingredient-grams-aria')}
                onChange={(val) =>
                  onUpdate((ing) => ({ ...ing, amountGrams: val }))
                }
                className="w-16 rounded-xl border border-border bg-card px-2 py-1.5 text-center text-xs font-bold tabular-nums outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">g</span>
            </div>
          </div>

          {/* Contextual actions */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPickerOpen((v) => !v)
                setEdit100gOpen(false)
              }}
              className="flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1.5 text-xs font-semibold"
            >
              <Search className="size-3" />
              <span>
                {ingredient.mode === 'db'
                  ? t('ai-change-from-db')
                  : t('ai-pick-from-db')}
              </span>
            </button>

            <button
              type="button"
              disabled={recalculating}
              onClick={handleRecalculateVariant}
              className="flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
            >
              {recalculating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              <span>{t('ai-recalc-variant')}</span>
            </button>

            <button
              type="button"
              disabled={scanningLabel}
              onClick={() => labelInputRef.current?.click()}
              className="flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1.5 text-xs font-semibold text-amber-400 disabled:opacity-50"
            >
              {scanningLabel ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Camera className="size-3" />
              )}
              <span>{t('ai-scan-label')}</span>
            </button>
          </div>

          <input
            ref={labelInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleScanIngredientLabel}
            className="hidden"
          />

          {/* Save to DB + Edit 100g (when not matched to an existing DB item) */}
          {ingredient.mode !== 'db' && (
            <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={ingredient.saveToDatabase}
                  onChange={(e) =>
                    onUpdate((ing) => ({
                      ...ing,
                      saveToDatabase: e.target.checked,
                    }))
                  }
                  className="size-3.5 rounded accent-primary"
                />
                <span>{t('ai-save-to-db')}</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setEdit100gOpen((v) => !v)
                  setPickerOpen(false)
                }}
                className="font-medium text-muted-foreground underline hover:text-foreground"
              >
                {edit100gOpen ? t('ai-hide-100g') : t('ai-edit-100g')}
              </button>
            </div>
          )}

          {/* Per-100g nutrition editor */}
          {edit100gOpen && ingredient.mode !== 'db' && (
            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-border bg-card p-2">
              {(
                [
                  ['calories', 'kcal'],
                  ['protein', `${t('protein-short')} (g)`],
                  ['fat', `${t('fat-short')} (g)`],
                  ['carbs', `${t('carbs-short')} (g)`],
                ] as const
              ).map(([field, label]) => (
                <label
                  key={field}
                  className="flex flex-col gap-0.5 text-[10px] text-muted-foreground"
                >
                  <span>{label}/100g</span>
                  <NumericInput
                    value={ingredient.nutritionPer100g[field]}
                    min={0}
                    allowZero={true}
                    ariaLabel={`${label}/100g`}
                    onChange={(val) =>
                      onUpdate((ing) => ({
                        ...ing,
                        nutritionPer100g: {
                          ...ing.nutritionPer100g,
                          [field]: val,
                        },
                      }))
                    }
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
              ))}
            </div>
          )}

          {/* Database product picker */}
          {pickerOpen && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleManualSearch()
                    }
                  }}
                  placeholder={t('ai-search-db-placeholder')}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleManualSearch}
                  disabled={searchingDb}
                  className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold"
                >
                  {searchingDb ? '...' : t('ai-search-btn')}
                </button>
              </div>

              <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                {ingredient.candidates.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    {t('ai-no-db-matches')}
                  </p>
                ) : (
                  ingredient.candidates.slice(0, 8).map((prod, idx) => {
                    const isSelected =
                      ingredient.mode === 'db' &&
                      ingredient.selectedProduct?.id === prod.id &&
                      ingredient.selectedProduct?.name === prod.name
                    return (
                      <button
                        key={prod.barcode || `${prod.id}-${idx}`}
                        type="button"
                        onClick={() => {
                          onUpdate((ing) => ({
                            ...ing,
                            mode: 'db',
                            selectedProduct: prod,
                            saveToDatabase: false,
                          }))
                          setPickerOpen(false)
                        }}
                        className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-background ${
                          isSelected ? 'bg-primary/15 text-primary' : ''
                        }`}
                      >
                        <span className="truncate font-medium">
                          {prod.name}
                          {prod.brand ? ` (${prod.brand})` : ''}
                        </span>
                        <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                          {prod.caloriesPer100g} kcal
                        </span>
                      </button>
                    )
                  })
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onUpdate((ing) => ({
                    ...ing,
                    mode:
                      ing.sourceType === 'from_label_photo'
                        ? 'new_product'
                        : 'ai',
                    selectedProduct: null,
                  }))
                  setPickerOpen(false)
                }}
                className="rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t('ai-use-ai-estimate')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NumericInput({
  value,
  onChange,
  min = 0,
  allowZero = true,
  className,
  ariaLabel,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  allowZero?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setText(String(value))
    }
  }, [value, focused])

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw.trim() === '') return
        const parsed = Number(raw.replace(',', '.'))
        if (
          Number.isFinite(parsed) &&
          (allowZero ? parsed >= min : parsed > 0)
        ) {
          onChange(parsed)
        }
      }}
      onBlur={() => {
        setFocused(false)
        const trimmed = text.trim()
        const parsed = Number(trimmed.replace(',', '.'))
        if (
          trimmed === '' ||
          !Number.isFinite(parsed) ||
          (allowZero ? parsed < min : parsed <= 0)
        ) {
          setText(String(value))
          return
        }
        setText(String(parsed))
        onChange(parsed)
      }}
      className={className}
    />
  )
}
