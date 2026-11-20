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
import { getUnitLabel, type Language } from '@/lib/i18n'
import { FixedUnitCalculatorRow, QuickServingRow, UnitSelectCalculatorRow } from './serving-rows'
import { AiMealAssistant } from './ai-meal-assistant'

// Słownik tłumaczeń nazw posiłków (dopełniacz)
const mealTranslations: Record<string, string> = {
  'Breakfast': 'Śniadania',
  'Second breakfast': 'Drugiego śniadania',
  'Lunch': 'Obiadu',
  'Snack': 'Przekąsek',
  'Dinner': 'Kolacji'
}

type Props = {
  /** Otwiera sheet dla podanej pory posiłku; `null` = zamknięty. */
  meal: MealType | null
  /** Data wpisu w formacie YYYY-MM-DD */
  date: string
  onClose: () => void
  /** Wywoływane po potwierdzeniu – pora posiłku, wybrany produkt i ilość. */
  onAdd: (meal: MealType, product: Product, amountInGrams: number, unitKey?: string, quantity?: number) => void
  /** Wywoływane po dodaniu szybkiego wpisu – do odświeżenia listy */
  onQuickAddComplete?: () => void
  /** Wewnętrzne ID partnera, gdy dodajemy do jego dziennika; undefined = własny dziennik */
  targetUserId?: number
}

export function AddFoodSheet({ meal, date, onClose, onAdd, onQuickAddComplete, targetUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dialogRef = useRef<HTMLDialogElement>(null)
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

  // Obsługa preselectProductId - automatyczne wybieranie produktu po dodaniu
  useEffect(() => {
    const preselectProductId = searchParams?.get('preselectProductId')
    if (preselectProductId && meal) {
      // Pobierz produkt z API
      api.getProduct(Number(preselectProductId))
        .then((product) => {
          if (product) {
            setPicked(product)
            // Ustaw domyślną porcję jeśli istnieje
            if (product.defaultServing) {
              setAmount(String(product.defaultServing))
            }
          }
          // Wyczyść WSZYSTKIE parametry z URL (meal, date, preselectProductId)
          router.replace(window.location.pathname)
        })
        .catch((error) => {
          console.error('Błąd podczas ładowania preselected produktu:', error)
          // W przypadku błędu również wyczyść URL
          router.replace(window.location.pathname)
        })
    }
  }, [searchParams, meal, router])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (meal && !dialog.open) dialog.showModal()
    // Rodzic ustawia `meal = null` po dodaniu produktu – zamykamy wtedy dialog.
    // `close()` wywoła zdarzenie `close` → handleClose resetuje formularz.
    else if (!meal && dialog.open) dialog.close()
  }, [meal])

  // Wyszukiwanie produktów z debounce + załaduj wszystkie przy otwarciu
  useEffect(() => {
    if (!meal) return // Nie ładuj gdy dialog zamknięty

    setSearching(true)
    const timeoutId = setTimeout(async () => {
      const results = await api.searchProducts(query)
      setSearchResults(results)
      setSearching(false)
    }, query.trim() ? 300 : 0) // Bez debounce dla pustego query (ładowanie początkowe)

    return () => clearTimeout(timeoutId)
  }, [query, meal])

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

  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? ''
  const mealLabelPL = mealTranslations[mealLabel] || mealLabel

  const amountNum = Number(amount)
  const validAmount = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 5000
  const preview = picked && validAmount ? macrosFor(picked, amountNum) : null

  async function pick(product: Product) {
    // Nie importuj jeszcze produktu - po prostu wybierz go do edycji
    // Import nastąpi dopiero gdy użytkownik kliknie "Dodaj do [posiłku]"
    setPicked(product)
    setAmount(String(product.defaultServing))
  }

  async function handleAdd() {
    if (!meal || !picked || !validAmount) return

    let productToAdd = picked

    // Jeśli produkt pochodzi z OFF (nie ma jeszcze lokalnego ID), najpierw go zaimportuj
    if (picked.dataSource === 'OFF' || picked.id === 0) {
      console.log('[AddFoodSheet] Product from OFF detected, importing before adding to diary...')
      const imported = await api.importProduct(picked)
      
      if (!imported) {
        console.error('[AddFoodSheet] Failed to import product from OFF')
        showToast('Nie udało się zaimportować produktu')
        return
      }
      
      productToAdd = imported
    }

    // Dodaj produkt do dziennika
    onAdd(meal, productToAdd, amountNum)
  }

  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false)
    setSearching(true)

    const product = await api.getProductByBarcode(barcode)
    setSearching(false)

    if (!product) {
      // Zapisz kod kreskowy i wyświetl opcję dodania ręcznego
      setScannedBarcode(barcode)
      console.log('[AddFoodSheet] Product not found for barcode:', barcode)
      return
    }

    // Produkt znaleziony - wyczyść stan i użyj normalnego flow
    setScannedBarcode(null)
    // Użyj funkcji pick(), która obsługuje lazy loading OFF
    await pick(product)
  }

  function handleAddManually() {
    if (scannedBarcode) {
      // Przekieruj na formularz z kodem kreskowym i parametrami powrotu
      router.push(`/add-product?barcode=${scannedBarcode}&returnUrl=/&meal=${meal}&date=${date}`)
    }
  }

  // Obsługa szybkiego dodawania
  async function handleQuickAdd() {
    if (!meal) return
    
    const calories = Number(quickAddCalories)
    const protein = Number(quickAddProtein)
    const fat = Number(quickAddFat)
    const carbs = Number(quickAddCarbs)

    // Walidacja: wszystkie pola muszą być liczbami >= 0
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
      showToast('Uzupełnij kalorie oraz wszystkie makroskładniki (Białko, Tłuszcz, Węglowodany)')
      return
    }

    try {
      // Wyślij dane bezpośrednio do endpointu dziennika (bez tworzenia produktu)
      // Dla custom entries nie wysyłamy AmountInGrams (wartości są bezpośrednie, nie per 100g)
      const entry = await api.createDiaryEntry(date, meal, null, {
        customName: quickAddName.trim() || 'Szybki wpis',
        customCalories: calories,
        customProtein: protein,
        customFat: fat,
        customCarbs: carbs,
        targetUserId,
      })

      if (!entry) {
        showToast('Nie udało się dodać wpisu. Sprawdź połączenie z serwerem.')
        return
      }

      // Zamknij modal i odśwież listę
      handleClose()
      onQuickAddComplete?.()
    } catch (error) {
      console.error('Błąd przy dodawaniu szybkiego wpisu:', error)
      showToast('Nie udało się dodać wpisu. Sprawdź połączenie z serwerem.')
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
      className="m-0 mx-auto mt-auto h-[85dvh] max-h-[85dvh] w-full max-w-md rounded-t-3xl bg-background p-0 text-foreground backdrop:bg-foreground/40"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
          {picked ? (
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label="Back to search"
              className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
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
              aria-label="Back to search"
              className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <span className="size-9" aria-hidden="true" />
          )}
          <div className="flex flex-1 flex-col items-center">
            <span className="mb-1 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <h2 id="add-food-title" className="font-heading text-base font-bold">
              Dodaj do: {mealLabelPL}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        {!picked ? (
          <>
            {/* Ukryj pasek wyszukiwania i scanner w trybie Quick Add i AI */}
            {!isQuickAddMode && !isAiMode && (
              <div className="shrink-0 px-4 pb-3">
                <div className="flex gap-2">
                  <label className="flex flex-1 items-center gap-2 rounded-2xl bg-card px-4 py-3 shadow-sm focus-within:outline-2 focus-within:outline-ring">
                    <Search className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">Search foods</span>
                    <input
                      type="search"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search for a product…"
                      className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-secondary px-3 py-3 text-sm font-semibold transition-transform active:scale-95"
                    aria-label="Scan barcode"
                  >
                    <ScanLine className="size-4" /> Scan
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
              // Wyświetl informację o nieznanym produkcie i przycisk do ręcznego dodania
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6">
                <div className="mb-6 text-center">
                  <div className="mb-2 text-lg font-semibold text-foreground">
                    Nie znaleziono produktu
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Kod: {scannedBarcode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddManually}
                  className="w-full max-w-md rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
                >
                  Nie znaleziono produktu. Dodaj go ręcznie
                </button>
                <button
                  type="button"
                  onClick={() => setScannedBarcode(null)}
                  className="mt-4 text-sm text-muted-foreground underline"
                >
                  Wróć
                </button>
              </div>
            ) : isQuickAddMode ? (
              // Tryb szybkiego dodawania
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <div className="flex flex-col gap-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Szybkie dodawanie</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="quick-name" className="block text-sm font-medium mb-1">
                        Nazwa (opcjonalnie)
                      </label>
                      <input
                        id="quick-name"
                        type="text"
                        value={quickAddName}
                        onChange={(e) => setQuickAddName(e.target.value)}
                        placeholder="np. Pizza"
                        className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="quick-calories" className="block text-sm font-medium mb-1">
                        Kalorie (wymagane) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="quick-calories"
                        type="number"
                        value={quickAddCalories}
                        onChange={(e) => setQuickAddCalories(e.target.value)}
                        placeholder="np. 250"
                        min="0"
                        className="w-full rounded-2xl bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="quick-protein" className="block text-sm font-medium mb-1">
                          Białko (g) <span className="text-red-500">*</span>
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
                          Tłuszcz (g) <span className="text-red-500">*</span>
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
                          Węgl. (g) <span className="text-red-500">*</span>
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
                      Wróć
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAdd}
                      className="flex-1 rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                    >
                      Dodaj do jadłospisu
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
              <ul className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">
              {searching && (
                <li className="py-10 text-center text-sm text-muted-foreground">
                  Wyszukiwanie...
                </li>
              )}
              {!searching && query.trim() && searchResults.length === 0 && (
                <li className="flex flex-col items-center gap-4 py-10">
                  <p className="text-center text-sm text-muted-foreground">
                    Brak wyników dla &quot;{query}&quot;
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
            
            {/* Sticky footer - widoczny tylko w trybie wyszukiwania (nie w Quick Add, AI ani Scanner) */}
            {!isQuickAddMode && !isAiMode && !showScanner && !scannedBarcode && (
              <div className="sticky bottom-0 bg-background border-t p-4 flex gap-2 z-10">
                <button
                  type="button"
                  onClick={() => router.push(`/add-product?returnUrl=/&meal=${meal}&date=${date}`)}
                  className="flex-1 rounded-full border border-border bg-background py-3 px-2 text-xs sm:text-sm font-semibold transition-transform active:scale-[0.98] hover:bg-secondary"
                >
                  Nowy produkt
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiMode(true)}
                  className="flex-1 flex items-center justify-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-3 px-2 text-xs sm:text-sm font-semibold text-primary transition-transform active:scale-[0.98] hover:bg-primary/20"
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>Posiłek AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickAddMode(true)}
                  className="flex-1 rounded-full bg-primary py-3 px-2 text-xs sm:text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  Szybkie dodanie
                </button>
              </div>
            )}
          </>
        ) : (
          <PortionForm
            product={picked}
            mealLabel={mealLabelPL}
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

/** Widok wyboru porcji dla wybranego produktu. */
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
  // Budujemy szybkie wiersze (1–3) używając buildQuickRows
  const rawRows = buildQuickRows(product, null) // null = brak historii użycia, używamy fallbacków
  
  // Przekształcamy na format z etykietą i kcal
  const quickRows = rawRows.map((row) => {
    const macros = macrosFor(product, row.grams)
    const label = row.unitKey === 'portion'
      ? `${row.quantity} ${row.quantity === 1 ? 'porcja' : 'porcje'}`
      : row.unitKey === 'package'
      ? `${row.quantity} opakowanie`
      : `${row.quantity} ${getUnitLabel('pl', row.unitKey)}`
    
    return {
      label,
      unitKey: row.unitKey,
      quantity: row.quantity,
      grams: row.grams,
      kcal: macros.kcal,
    }
  })
  
  // Procenty kalorii z makroskładników (dla wykresów kołowych)
  const percentages = calcMacroPercentages(product)

  // Wiersz 4: najczęściej używana jednostka (opcja z kalkulatorem)
  // Na razie używamy domyślnie 'portion' jeśli produkt ma porcję, w przeciwnym razie 'g'
  const mostUsedUnitKey = product.defaultServingGrams && product.defaultServingGrams > 0 ? 'portion' : 'g'
  const mostUsedUnitLabel = getUnitLabel('pl', mostUsedUnitKey)
  const mostUsedDefaultQuantity = 1

  // Helper: importuj produkt z OFF jeśli potrzeba, następnie wykonaj akcję
  const ensureImported = async (action: (importedProduct: Product) => Promise<void>) => {
    let productToUse = product
    
    // Jeśli produkt pochodzi z OFF (nie ma jeszcze lokalnego ID), najpierw go zaimportuj
    if (product.dataSource === 'OFF' || product.id === 0) {
      console.log('[PortionForm] Product from OFF detected, importing before adding to diary...')
      const imported = await api.importProduct(product)
      
      if (!imported) {
        console.error('[PortionForm] Failed to import product from OFF')
        setToast('Nie udało się zaimportować produktu')
        return
      }
      
      productToUse = imported
    }
    
    await action(productToUse)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      {/* Nagłówek produktu z kolorowym tłem – kompaktowy */}
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
        {/* Tabela wierszy dodawania */}
        <div className="flex flex-col overflow-hidden rounded-3xl bg-card shadow-sm">
          {/* Wiersze 1–3: szybkie dodawanie */}
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
                  console.error('Błąd dodawania:', err)
                  setToast('Błąd podczas dodawania')
                })
              }}
            />
          ))}
          
          {/* Wiersz 4: kalkulator z fixed unit (najczęściej używana jednostka) */}
          <FixedUnitCalculatorRow
            product={product}
            unitKey={mostUsedUnitKey}
            unitLabel={mostUsedUnitLabel}
            defaultQuantity={mostUsedDefaultQuantity}
            lang="pl"
            onAdd={(quantity, grams) => {
              ensureImported(async (importedProduct) => {
                await onAdd(meal, importedProduct, grams, mostUsedUnitKey, quantity)
              }).catch((err) => {
                console.error('Błąd dodawania:', err)
                setToast('Błąd podczas dodawania')
              })
            }}
          />
          
          {/* Wiersz 5: kalkulator z dropdown jednostek */}
          <UnitSelectCalculatorRow
            product={product}
            lang="pl"
            onAdd={(unitKey, quantity, grams) => {
              ensureImported(async (importedProduct) => {
                await onAdd(meal, importedProduct, grams, unitKey, quantity)
              }).catch((err) => {
                console.error('Błąd dodawania:', err)
                setToast('Błąd podczas dodawania')
              })
            }}
          />
        </div>

        {/* Wartości referencyjne "W 100g" z wykresami kołowymi */}
        <div className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm">
          <h4 className="text-sm font-medium text-muted-foreground">W 100{product.unit}:</h4>
          
          <div className="flex items-center justify-around gap-3">
            {/* Kalorie */}
            <div className="flex flex-col items-center gap-1">
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {product.caloriesPer100g}
              </dd>
              <dt className="text-[10px] text-muted-foreground">Kalorie</dt>
            </div>

            {/* Wykresy kołowe */}
            <div className="flex gap-2.5">
              <MacroCircle
                grams={product.proteinPer100g}
                percentage={percentages.proteinPct}
                label="Białko"
                colorClass="text-protein"
              />
              <MacroCircle
                grams={product.fatPer100g}
                percentage={percentages.fatPct}
                label="Tłuszcze"
                colorClass="text-fat"
              />
              <MacroCircle
                grams={product.carbsPer100g}
                percentage={percentages.carbsPct}
                label="Węgle"
                colorClass="text-carbs"
              />
            </div>
          </div>
        </div>

        {/* Składniki */}
        {product.ingredients && (
          <div className="rounded-3xl bg-card p-5 shadow-sm">
            <h4 className="mb-2 text-sm font-bold">Składniki:</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.ingredients}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Pojedyncza komórka makroskładnika w siatce podglądu. */
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

