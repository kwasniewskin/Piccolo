'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronRight, ScanLine, Search, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calcMacroPercentages, getAvailableUnits, gramsFor, MEALS, macrosFor, buildQuickRows } from '@/lib/nutrition'
import type { Macros, MealType, Product } from '@/lib/types'
import * as api from '@/lib/api'
import { MacroCircle } from './macro-circle'
import { BarcodeScanner } from './barcode-scanner'
import { getMealLabel, getTranslation, getUnitLabel, type Language } from '@/lib/i18n'
import { useOptionalLanguage } from '@/lib/language-context'
import { FixedUnitCalculatorRow, QuickServingRow, UnitSelectCalculatorRow } from './serving-rows'
import { AiMealAssistant } from './ai-meal-assistant'

// Polish genitive meal labels for "Dodaj do: <meal>"
const mealGenitivePl: Record<MealType, string> = {
  breakfast: 'Śniadania',
  'second-breakfast': 'Drugiego śniadania',
  lunch: 'Obiadu',
  snack: 'Przekąsek',
  dinner: 'Kolacji',
}

type Props = {
  /** Opens the sheet for the given meal slot; `null` = closed. */
  meal: MealType | null
  /** Entry date in YYYY-MM-DD format. */
  date: string
  onClose: () => void
  /** Called on submit with meal slot, selected product, and gram amount. */
  onAdd: (meal: MealType, product: Product, amountInGrams: number, unitKey?: string, quantity?: number) => void
  /** Called after saving a Quick Add / AI entry to refresh the diary list. */
  onQuickAddComplete?: () => void
  /** Internal partner ID when logging to their diary; undefined = own diary. */
  targetUserId?: number
}

export function AddFoodSheet({ meal, date, onClose, onAdd, onQuickAddComplete, targetUserId }: Props) {
  const { language } = useOptionalLanguage()
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key)
  const router = useRouter()
  const searchParams = useSearchParams()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [sheetRect, setSheetRect] = useState<{ top: number; height: number } | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Product | null>(null)
  const [amount, setAmount] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
  const [isQuickAddMode, setIsQuickAddMode] = useState(false)
  const [isAiMode, setIsAiMode] = useState(false)
  
  // Quick Add Form states
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddCalories, setQuickAddCalories] = useState('')
  const [quickAddProtein, setQuickAddProtein] = useState('')
  const [quickAddFat, setQuickAddFat] = useState('')
  const [quickAddCarbs, setQuickAddCarbs] = useState('')

  // Handle preselectProductId - auto-select newly created product on redirect
  useEffect(() => {
    const preselectProductId = searchParams?.get('preselectProductId')
    if (preselectProductId && meal) {
      // Fetch product from API
      api.getProduct(Number(preselectProductId))
        .then((product) => {
          if (product) {
            setPicked(product)
            // Apply default serving if defined
            if (product.defaultServing) {
              setAmount(String(product.defaultServing))
            }
          }
          // Strip ALL URL query parameters (meal, date, preselectProductId)
          router.replace(window.location.pathname)
        })
        .catch((error) => {
          console.error('Error loading preselected product:', error)
          // Also clear URL parameters on error
          router.replace(window.location.pathname)
        })
    }
  }, [searchParams, meal, router])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (meal && !dialog.open) {
      dialog.showModal()
      // Only auto-focus search on fine-pointer devices; on mobile it opens the soft keyboard over the bottom action bar.
      if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) {
        searchInputRef.current?.focus()
      }
    }
    // Parent sets `meal = null` after logging; close dialog and let `onClose` reset state.
    else if (!meal && dialog.open) dialog.close()
  }, [meal])

  // Position the modal sheet inside the visual viewport so iOS/Android keyboards never cover or push it down.
  useEffect(() => {
    if (!meal || typeof window === 'undefined' || !window.visualViewport) {
      setSheetRect(null)
      return
    }
    const vv = window.visualViewport
    const update = () => {
      const vvHeight = Math.round(vv.height)
      const vvTop = Math.round(vv.offsetTop)
      const layoutHeight = window.innerHeight || vvHeight
      const keyboardOpen = vvHeight < layoutHeight * 0.78
      const targetHeight = keyboardOpen
        ? Math.max(240, vvHeight - 12)
        : Math.round(vvHeight * 0.85)
      const top = vvTop + Math.max(0, vvHeight - targetHeight)
      setSheetRect({ top, height: targetHeight })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [meal])

  // Debounced product search + initial catalog load when sheet opens
  useEffect(() => {
    if (!meal) return // Skip while sheet is closed

    setSearching(true)
    const timeoutId = setTimeout(async () => {
      const results = await api.searchProducts(query, language)
      setSearchResults(results)
      setSearching(false)
    }, query.trim() ? 300 : 0) // No debounce for empty initial load

    return () => clearTimeout(timeoutId)
  }, [query, meal, language])

  function handleClose() {
    setQuery('')
    setPicked(null)
    setAmount('')
    setSearchResults([])
    setShowScanner(false)
    setToast(null)
    setScannedBarcode(null)
    setIsQuickAddMode(false)
    setIsAiMode(false)
    setQuickAddName('')
    setQuickAddCalories('')
    setQuickAddProtein('')
    setQuickAddFat('')
    setQuickAddCarbs('')
    onClose()
  }

  const mealLabel = meal
    ? language === 'pl'
      ? mealGenitivePl[meal]
      : getMealLabel('en', meal)
    : ''

  const amountNum = Number(amount)
  const validAmount = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 5000
  const preview = picked && validAmount ? macrosFor(picked, amountNum) : null

  async function pick(product: Product) {
    // Do not import OFF products on selection; defer import until actually added to diary
    setPicked(product)
    setAmount(String(product.defaultServing))
  }

  async function handleAdd() {
    if (!meal || !picked || !validAmount) return

    let productToAdd = picked

    // Import Open Food Facts product to local DB before creating a diary entry
    if (picked.dataSource === 'OFF' || picked.id === 0) {
      console.log('[AddFoodSheet] Product from OFF detected, importing before adding to diary...')
      const imported = await api.importProduct(picked)
      
      if (!imported) {
        console.error('[AddFoodSheet] Failed to import product from OFF')
        showToast(t('import-product-error'))
        return
      }
      
      productToAdd = imported
    }

    // Add product to diary
    onAdd(meal, productToAdd, amountNum)
  }

  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false)
    setSearching(true)

    const product = await api.getProductByBarcode(barcode, language)
    setSearching(false)

    if (!product) {
      // Save scanned barcode and display the manual-entry prompt
      setScannedBarcode(barcode)
      console.log('[AddFoodSheet] Product not found for barcode:', barcode)
      return
    }

    // Product found - reset barcode state and open portion picker
    setScannedBarcode(null)
    // pick() handles lazy OFF import on confirmation
    await pick(product)
  }

  function handleAddManually() {
    if (scannedBarcode) {
      // Redirect to manual product creation with barcode and return params
      router.push(`/add-product?barcode=${scannedBarcode}&returnUrl=/&meal=${meal}&date=${date}`)
    }
  }

  // Handle Quick Add submission
  async function handleQuickAdd() {
    if (!meal) return
    
    const calories = Number(quickAddCalories)
    const protein = Number(quickAddProtein)
    const fat = Number(quickAddFat)
    const carbs = Number(quickAddCarbs)

    // Validation: all numeric fields must be >= 0 and non-empty
    if (
      !Number.isFinite(calories) || calories < 0 ||
      !Number.isFinite(protein) || protein < 0 ||
      !Number.isFinite(fat) || fat < 0 ||
      !Number.isFinite(carbs) || carbs < 0 ||
      quickAddCalories.trim() === '' ||
      quickAddProtein.trim() === '' ||
      quickAddFat.trim() === '' ||
      quickAddCarbs.trim() === ''
    ) {
      showToast(t('quick-add-validation'))
      return
    }

    try {
      // Post directly to diary endpoint without creating a catalog product.
      // AmountInGrams is null because quick-add macros are total entry values, not per 100g.
      const entry = await api.createDiaryEntry(date, meal, null, {
        customName: quickAddName.trim() || t('quick-entry-default-name'),
        customCalories: calories,
        customProtein: protein,
        customFat: fat,
        customCarbs: carbs,
        targetUserId,
      })

      if (!entry) {
        showToast(t('add-entry-network-error'))
        return
      }

      // Close sheet and refresh diary entries
      handleClose()
      onQuickAddComplete?.()
    } catch (error) {
      console.error('Error creating quick add entry:', error)
      showToast(t('add-entry-network-error'))
    }
  }

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close()
      }}
      aria-labelledby="add-food-title"
      style={
        sheetRect
          ? {
              top: `${sheetRect.top}px`,
              bottom: 'auto',
              height: `${sheetRect.height}px`,
              maxHeight: `${sheetRect.height}px`,
            }
          : undefined
      }
      className={cn(
        'm-0 mx-auto h-[85dvh] max-h-[85dvh] w-full max-w-md rounded-t-3xl bg-background p-0 text-foreground backdrop:bg-foreground/40',
        !sheetRect && 'mt-auto',
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
          {picked ? (
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label={t('back')}
              className="flex size-11 items-center justify-center rounded-full hover:bg-secondary"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : isAiMode || isQuickAddMode ? (
            <button
              type="button"
              onClick={() => {
                setIsAiMode(false)
                setIsQuickAddMode(false)
              }}
              aria-label={t('back')}
              className="flex size-11 items-center justify-center rounded-full hover:bg-secondary"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <span className="size-11" aria-hidden="true" />
          )}
          <div className="flex flex-1 flex-col items-center">
            <span className="mb-1 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <h2 id="add-food-title" className="font-heading text-base font-bold">
              {t('add-to-prefix')} {mealLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t('close')}
            className="flex size-11 items-center justify-center rounded-full hover:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        {!picked ? (
          <>
            {/* Hide search bar and scanner in Quick Add and AI modes */}
            {!isQuickAddMode && !isAiMode && (
              <div className="shrink-0 px-4 pb-3">
                <div className="flex gap-2">
                  <label className="flex flex-1 items-center gap-2 rounded-2xl bg-card px-4 py-3 shadow-sm focus-within:outline-2 focus-within:outline-ring">
                    <Search className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">{t('search-placeholder')}</span>
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('search-placeholder')}
                      className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-secondary px-3 py-3 text-sm font-semibold transition-transform active:scale-95"
                    aria-label={t('scan-barcode-aria')}
                  >
                    <ScanLine className="size-4" /> {t('scan')}
                  </button>
                </div>
              </div>
            )}

            {showScanner ? (
              <BarcodeScanner
                onScan={handleBarcodeScan}
                onClose={() => setShowScanner(false)}
              />
            ) : scannedBarcode ? (
              // Display unknown barcode message with manual add CTA
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6">
                <div className="mb-6 text-center">
                  <div className="mb-2 text-lg font-semibold text-foreground">
                    {t('product-not-found')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('barcode-code')} {scannedBarcode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddManually}
                  className="w-full max-w-md rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
                >
                  {t('add-manually-prompt')}
                </button>
                <button
                  type="button"
                  onClick={() => setScannedBarcode(null)}
                  className="mt-4 text-sm text-muted-foreground underline"
                >
                  {t('back')}
                </button>
              </div>
            ) : isQuickAddMode ? (
              // Quick Add mode
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <div className="flex flex-col gap-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">{t('quick-add-title')}</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="quick-name" className="block text-sm font-medium mb-1">
                        {t('quick-name-label')}
                      </label>
                      <input
                        id="quick-name"
                        type="text"
                        value={quickAddName}
                        onChange={(e) => setQuickAddName(e.target.value)}
                        placeholder={t('quick-name-placeholder')}
                        className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="quick-calories" className="block text-sm font-medium mb-1">
                        {t('quick-calories-label')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="quick-calories"
                        type="number"
                        value={quickAddCalories}
                        onChange={(e) => setQuickAddCalories(e.target.value)}
                        placeholder="e.g. 250"
                        min="0"
                        className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="quick-protein" className="block text-sm font-medium mb-1">
                          {t('quick-protein-label')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="quick-protein"
                          type="number"
                          value={quickAddProtein}
                          onChange={(e) => setQuickAddProtein(e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.1"
                          className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="quick-fat" className="block text-sm font-medium mb-1">
                          {t('quick-fat-label')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="quick-fat"
                          type="number"
                          value={quickAddFat}
                          onChange={(e) => setQuickAddFat(e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.1"
                          className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="quick-carbs" className="block text-sm font-medium mb-1">
                          {t('quick-carbs-label')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="quick-carbs"
                          type="number"
                          value={quickAddCarbs}
                          onChange={(e) => setQuickAddCarbs(e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.1"
                          className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsQuickAddMode(false)}
                      className="flex-1 rounded-full bg-secondary py-3 text-base font-semibold transition-transform active:scale-[0.98]"
                    >
                      {t('back')}
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAdd}
                      className="flex-1 rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                    >
                      {t('quick-add-submit')}
                    </button>
                  </div>
                </div>
                </div>
              </div>
            ) : isAiMode && meal ? (
              <AiMealAssistant
                meal={meal}
                date={date}
                targetUserId={targetUserId}
                onBack={() => setIsAiMode(false)}
                onComplete={() => {
                  handleClose()
                  onQuickAddComplete?.()
                }}
                showToast={showToast}
              />
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {searching && (
                <li className="py-10 text-center text-sm text-muted-foreground">
                  {t('searching')}
                </li>
              )}
              {!searching && query.trim() && searchResults.length === 0 && (
                <li className="flex flex-col items-center gap-4 py-10">
                  <p className="text-center text-sm text-muted-foreground">
                    {t('no-results-for')} &quot;{query}&quot;
                  </p>
                </li>
              )}
              {!searching && searchResults.map((product, index) => (
                <li key={product.barcode || `${product.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => pick(product)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-card"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{product.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {product.brand ? `${product.brand} · ` : ''}
                        {product.caloriesPer100g} kcal / 100 {product.unit}
                      </span>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            )}
            
            {/* Bottom footer - visible only in search mode (hidden in Quick Add, AI, and Scanner) */}
            {!isQuickAddMode && !isAiMode && !showScanner && !scannedBarcode && (
              <div className="shrink-0 bg-background border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-2 z-10">
                <button
                  type="button"
                  onClick={() => router.push(`/add-product?returnUrl=/&meal=${meal}&date=${date}`)}
                  className="flex-1 min-h-11 rounded-full border border-border bg-background py-3 px-2 text-xs sm:text-sm font-semibold transition-transform active:scale-[0.98] hover:bg-secondary"
                >
                  {t('new-product')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiMode(true)}
                  className="flex-1 min-h-11 flex items-center justify-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-3 px-2 text-xs sm:text-sm font-semibold text-primary transition-transform active:scale-[0.98] hover:bg-primary/20"
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>{t('ai-meal')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickAddMode(true)}
                  className="flex-1 min-h-11 rounded-full bg-primary py-3 px-2 text-xs sm:text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  {t('quick-add')}
                </button>
              </div>
            )}
          </>
        ) : (
          <PortionForm
            product={picked}
            mealLabel={mealLabel}
            targetUserId={targetUserId}
            date={date}
            meal={meal!}
            onAdd={onAdd}
            onClose={onClose}
            onQuickAddComplete={onQuickAddComplete}
            setToast={setToast}
          />
        )}

        {/* Toast notification */}
        {toast && (
          <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2">
            <div className="rounded-2xl bg-red-500 px-6 py-3 text-sm font-medium text-white shadow-lg">
              {toast}
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}


type PortionFormProps = {
  product: Product
  mealLabel: string
  targetUserId?: number
  date: string
  meal: MealType
  onAdd: (meal: MealType, product: Product, amountInGrams: number, unitKey?: string, quantity?: number) => void
  onClose: () => void
  onQuickAddComplete?: () => void
  setToast: (msg: string | null) => void
}

/** Portion picker view for a selected product. */
function PortionForm({
  product,
  mealLabel,
  targetUserId,
  date,
  meal,
  onAdd,
  onClose,
  onQuickAddComplete,
  setToast,
}: PortionFormProps) {
  const { language } = useOptionalLanguage()
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key)

  // Build quick-add rows (1-3) via buildQuickRows
  const rawRows = buildQuickRows(product, null) // null = no usage history yet, use defaults

  // Map to rows with localized unit labels and computed kcal
  const quickRows = rawRows.map((row) => {
    const macros = macrosFor(product, row.grams)
    const label = row.unitKey === 'portion'
      ? `${row.quantity} ${t(row.quantity === 1 ? 'portion-singular' : 'portion-plural-few')}`
      : row.unitKey === 'package'
      ? `${row.quantity} ${getUnitLabel(language, 'package')}`
      : `${row.quantity} ${getUnitLabel(language, row.unitKey)}`

    return {
      label,
      unitKey: row.unitKey,
      quantity: row.quantity,
      grams: row.grams,
      kcal: macros.kcal,
    }
  })

  // Macro calorie percentages for circular progress rings
  const percentages = calcMacroPercentages(product)

  // Row 4: most frequently used unit calculator
  // Defaults to 'portion' when a serving weight exists, otherwise 'g'
  const mostUsedUnitKey = product.defaultServingGrams && product.defaultServingGrams > 0 ? 'portion' : 'g'
  const mostUsedUnitLabel = getUnitLabel(language, mostUsedUnitKey)
  const mostUsedDefaultQuantity = 1

  // Helper: import an OFF product first if needed, then execute action
  const ensureImported = async (action: (importedProduct: Product) => Promise<void>) => {
    let productToUse = product

    // Import OFF products on demand before adding to diary
    if (product.dataSource === 'OFF' || product.id === 0) {
      console.log('[PortionForm] Product from OFF detected, importing before adding to diary...')
      const imported = await api.importProduct(product)

      if (!imported) {
        console.error('[PortionForm] Failed to import product from OFF')
        setToast(t('import-product-error'))
        return
      }

      productToUse = imported
    }

    await action(productToUse)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      {/* Compact colored product header */}
      <div className="mx-4 mb-4 rounded-2xl bg-primary px-4 py-2.5">
        <div>
          <h3 className="font-heading text-lg font-bold text-primary-foreground text-balance">
            {product.name}
          </h3>
          {product.brand && (
            <p className="text-sm text-primary-foreground/80">{product.brand}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 px-4">
        {/* Serving rows card */}
        <div className="flex flex-col overflow-hidden rounded-3xl bg-card shadow-sm">
          {/* Rows 1-3: quick-add presets */}
          {quickRows.map((row, idx) => (
            <QuickServingRow
              key={idx}
              label={row.label}
              grams={row.grams}
              kcal={row.kcal}
              onAdd={() => {
                ensureImported(async (importedProduct) => {
                  await onAdd(meal, importedProduct, row.grams, row.unitKey, row.quantity)
                }).catch((err) => {
                  console.error('Failed to add entry:', err)
                  setToast(t('save-error'))
                })
              }}
            />
          ))}

          {/* Row 4: calculator with fixed most-used unit */}
          <FixedUnitCalculatorRow
            product={product}
            unitKey={mostUsedUnitKey}
            unitLabel={mostUsedUnitLabel}
            defaultQuantity={mostUsedDefaultQuantity}
            lang={language}
            onAdd={(quantity, grams) => {
              ensureImported(async (importedProduct) => {
                await onAdd(meal, importedProduct, grams, mostUsedUnitKey, quantity)
              }).catch((err) => {
                console.error('Failed to add entry:', err)
                setToast(t('save-error'))
              })
            }}
          />

          {/* Row 5: calculator with unit selector dropdown */}
          <UnitSelectCalculatorRow
            product={product}
            lang={language}
            onAdd={(unitKey, quantity, grams) => {
              ensureImported(async (importedProduct) => {
                await onAdd(meal, importedProduct, grams, unitKey, quantity)
              }).catch((err) => {
                console.error('Failed to add entry:', err)
                setToast(t('save-error'))
              })
            }}
          />
        </div>

        {/* Per-100g reference nutrition with macro rings */}
        <div className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm">
          <h4 className="text-sm font-medium text-muted-foreground">{t('in-100')}{product.unit}:</h4>

          <div className="flex items-center justify-around gap-3">
            {/* Calories */}
            <div className="flex flex-col items-center gap-1">
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {product.caloriesPer100g}
              </dd>
              <dt className="text-[10px] text-muted-foreground">{t('calories')}</dt>
            </div>

            {/* Macro rings */}
            <div className="flex gap-2.5">
              <MacroCircle
                grams={product.proteinPer100g}
                percentage={percentages.proteinPct}
                label={t('protein')}
                colorClass="text-protein"
              />
              <MacroCircle
                grams={product.fatPer100g}
                percentage={percentages.fatPct}
                label={t('fat')}
                colorClass="text-fat"
              />
              <MacroCircle
                grams={product.carbsPer100g}
                percentage={percentages.carbsPct}
                label={t('carbs')}
                colorClass="text-carbs"
              />
            </div>
          </div>
        </div>

        {/* Ingredients */}
        {product.ingredients && (
          <div className="rounded-3xl bg-card p-5 shadow-sm">
            <h4 className="mb-2 text-sm font-bold">{t('ingredients-heading')}</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.ingredients}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Single macronutrient cell in the preview grid. */
function Nutrient({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dd className="font-heading text-lg font-bold tabular-nums">
        {value ?? '–'}
        {unit && value !== undefined && (
          <span className="text-xs font-medium text-muted-foreground"> {unit}</span>
        )}
      </dd>
      <dt className="order-first text-xs text-muted-foreground">{label}</dt>
    </div>
  )
}

