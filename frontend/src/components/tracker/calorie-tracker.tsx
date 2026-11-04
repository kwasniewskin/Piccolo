'use client'

import { useEffect, useReducer, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GOALS, getMeals, sumMacros, toDateKey, toEntryView } from '@/lib/nutrition'
import type { DiaryEntry, DiaryEntryView, Macros, MealType, Product } from '@/lib/types'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/i18n'
import { usePartner } from '@/lib/partner-context'
import * as api from '@/lib/api'
import { TopBar } from './top-bar'
import { DateStrip } from './date-strip'
import { DailySummary } from './daily-summary'
import { MealCard } from './meal-card'
import { AddFoodSheet } from './add-food-sheet'
import { SettingsPage } from './settings-page'
// WaterCard (./water-card) jest gotowy, ale celowo jeszcze nie renderowany – przyszła funkcja.

// ---------------------------------------------------------------------------
// Stan aplikacji
// ---------------------------------------------------------------------------

type AppState = {
  /** Dziennik wpisów (DiaryEntry), pogrupowany po dacie `YYYY-MM-DD`. */
  entries: Record<string, DiaryEntry[]>
  /** Produkty załadowane z API lub z cache. */
  products: Product[]
  /** Czy trwa ładowanie danych z API. */
  loading: boolean
  /** Komunikat o błędzie (jeśli serwer nie odpowiada). */
  error: string | null
}

type Action =
  | { type: 'set-entries'; date: string; entries: DiaryEntry[] }
  | { type: 'add'; entry: DiaryEntry }
  | { type: 'remove'; date: string; id: number }
  | { type: 'set-products'; products: Product[] }
  | { type: 'set-loading'; loading: boolean }
  | { type: 'set-error'; error: string | null }
  | { type: 'reset-entries' }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-entries': {
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.date]: action.entries,
        },
      }
    }
    case 'add': {
      const date = action.entry.date
      return {
        ...state,
        entries: {
          ...state.entries,
          [date]: [...(state.entries[date] ?? []), action.entry],
        },
      }
    }
    case 'remove': {
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.date]: (state.entries[action.date] ?? []).filter((e) => e.id !== action.id),
        },
      }
    }
    case 'set-products': {
      return { ...state, products: action.products }
    }
    case 'set-loading': {
      return { ...state, loading: action.loading }
    }
    case 'set-error': {
      return { ...state, error: action.error }
    }
    case 'reset-entries': {
      return { ...state, entries: {} }
    }
  }
}

function buildInitialState(): AppState {
  return {
    entries: {},
    products: [],
    loading: true,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Komponent główny
// ---------------------------------------------------------------------------

export function CalorieTracker() {
  const today = toDateKey(new Date())
  const { language } = useLanguage()
  const { activeUserId, isViewingPartner } = usePartner()
  const searchParams = useSearchParams()
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState)
  const [activeDate, setActiveDate] = useState(today)
  const [openMeal, setOpenMeal] = useState<MealType | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  // Cele przeglądanego użytkownika (wyświetlane w DailySummary)
  const [viewedGoals, setViewedGoals] = useState<Macros>(GOALS)
  // Cele zalogowanego użytkownika (wyświetlane w SettingsPage)
  const [ownGoals, setOwnGoals] = useState<Macros>(GOALS)

  // Obsługa parametrów URL po przekierowaniu z formularza produktu
  useEffect(() => {
    const mealParam = searchParams?.get('meal') as MealType | null
    const dateParam = searchParams?.get('date')
    
    // Jeśli są parametry meal i date, automatycznie otwórz panel dodawania
    if (mealParam && dateParam) {
      // Sprawdź czy meal jest poprawnym MealType
      const validMeals: MealType[] = ['breakfast', 'second-breakfast', 'lunch', 'snack', 'dinner']
      if (validMeals.includes(mealParam)) {
        setOpenMeal(mealParam)
      }
      
      // Ustaw aktywną datę
      setActiveDate(dateParam)
    }
    // Nie czyścimy URL tutaj - zrobi to add-food-sheet po załadowaniu produktu
  }, [searchParams])
  
  const meals = getMeals(language)

  // Produkty z cache (będą się zapełniać w miarę używania)
  const products: Product[] = state.products

  // Wpisy dla aktywnego dnia, wzbogacone o dane produktu i wyliczone makro
  const dayEntries = state.entries[activeDate] ?? []
  const dayViews: DiaryEntryView[] = dayEntries.flatMap((e) => {
    const v = toEntryView(e, products)
    return v ? [v] : []
  })

  // Suma makroskładników dla całego dnia
  const dayTotals = sumMacros(dayViews)

  // Załaduj wpisy dla aktywnego dnia przy zmianie daty
  // Przy przełączeniu dziennika (własny ↔ partnera) wyczyść cache wpisów innej osoby
  useEffect(() => {
    dispatch({ type: 'reset-entries' })
  }, [activeUserId])

  // Załaduj cele przeglądanego użytkownika przy przełączeniu dziennika
  useEffect(() => {
    async function loadGoals() {
      const goals = await api.getGoals(activeUserId)
      if (goals) {
        setViewedGoals(goals)
      } else {
        // Jeśli API nie odpowiada, użyj domyślnych wartości
        setViewedGoals(GOALS)
      }
    }
    loadGoals()
  }, [activeUserId])

  // Załaduj własne cele przy starcie (do użycia w ustawieniach)
  useEffect(() => {
    async function loadOwnGoals() {
      const goals = await api.getGoals(undefined)
      if (goals) {
        setOwnGoals(goals)
      }
    }
    loadOwnGoals()
  }, [])

  useEffect(() => {
    async function loadDayEntries() {
      dispatch({ type: 'set-loading', loading: true })
      dispatch({ type: 'set-error', error: null })

      const entries = await api.getDiaryEntries(activeDate, activeUserId)
      
      if (entries.length === 0 && !navigator.onLine) {
        dispatch({ type: 'set-error', error: 'Brak połączenia z serwerem' })
      }

      dispatch({ type: 'set-entries', date: activeDate, entries })

      // Pobierz produkty dla wpisów i dodaj do cache (pomiń wpisy bez productId)
      const productIds = [...new Set(entries.filter(e => e.productId != null).map((e) => e.productId!))]
      const loadedProducts = await Promise.all(
        productIds.map((id) => api.getProductById(id))
      )
      const validProducts = loadedProducts.filter((p): p is Product => p !== null)
      
      api.cacheProducts(validProducts)
      dispatch({ type: 'set-products', products: api.getCachedProducts() })
      dispatch({ type: 'set-loading', loading: false })
    }

    loadDayEntries()
  }, [activeDate, activeUserId])

  async function handleAdd(
    meal: MealType,
    product: Product,
    amountInGrams: number,
    unitKey?: string,
    quantity?: number
  ) {
    // Dodaj produkt do cache jeśli go tam nie ma
    api.cacheProducts([product])
    
    // Wyślij do API (z targetUserId jeśli oglądamy partnera)
    const entry = await api.createDiaryEntry(activeDate, meal, amountInGrams, { 
      productId: product.id,
      targetUserId: activeUserId,
      unitKey,
      unitQuantity: quantity,
    })
    
    // Zawsze zamknij modal, niezależnie od wyniku
    setOpenMeal(null)
    
    if (entry) {
      // Zsynchronizuj produkty w stanie z cache – bez tego toEntryView nie znajdzie
      // nowego produktu i wpis nie zostałby wyrenderowany.
      dispatch({ type: 'set-products', products: api.getCachedProducts() })

      // Odśwież listę wpisów dla dnia z serwera (źródło prawdy).
      const fresh = await api.getDiaryEntries(activeDate, activeUserId)
      dispatch({ type: 'set-entries', date: activeDate, entries: fresh })
    } else {
      // Błąd zapisu – pokaż użytkownikowi komunikat
      dispatch({ type: 'set-error', error: 'Nie udało się zapisać posiłku' })
      setTimeout(() => dispatch({ type: 'set-error', error: null }), 3000)
    }
  }

  async function handleRemove(id: number) {
    const success = await api.deleteDiaryEntry(id)
    
    if (success) {
      dispatch({ type: 'remove', date: activeDate, id })
    } else {
      dispatch({ type: 'set-error', error: 'Nie udało się usunąć wpisu' })
      setTimeout(() => dispatch({ type: 'set-error', error: null }), 3000)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      {isViewingPartner && (
        <div
          role="status"
          className="mx-4 mt-2 rounded-2xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary"
        >
          {getTranslation(language, 'viewing-partner-diary')}
        </div>
      )}

      {/* Pasek daty */}
      <DateStrip
        selected={activeDate}
        today={today}
        loggedDays={new Set(Object.keys(state.entries).filter((d) => (state.entries[d] ?? []).length > 0))}
        onSelect={setActiveDate}
      />

      {/* Komunikat o błędzie */}
      {state.error && (
        <div className="mx-4 mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {state.error}
        </div>
      )}

      {/* pb-44 zostawia miejsce na sticky DailySummary na dole (~11rem) */}
      <main className="flex flex-1 flex-col gap-3 px-4 pb-44 pt-3">
        {state.loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Ładowanie...
          </div>
        ) : (
          <>
            {/* Karty posiłków */}
            {meals.map((meal) => {
              const entries = dayViews.filter((e) => e.mealType === meal.id)
              return (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  entries={entries}
                  onAdd={() => setOpenMeal(meal.id)}
                  onRemove={handleRemove}
                />
              )
            })}
          </>
        )}
      </main>

      {/* Podsumowanie kalorii – zawsze na dole ekranu */}
      <DailySummary totals={dayTotals} goals={viewedGoals} />

      {/* Sheet do dodawania posiłku */}
      <AddFoodSheet
        meal={openMeal}
        date={activeDate}
        onClose={() => setOpenMeal(null)}
        onAdd={handleAdd}
        targetUserId={activeUserId}
        onQuickAddComplete={async () => {
          // Odśwież dane z serwera po dodaniu szybkiego wpisu
          const fresh = await api.getDiaryEntries(activeDate, activeUserId)
          dispatch({ type: 'set-entries', date: activeDate, entries: fresh })
        }}
      />

      <SettingsPage
        open={settingsOpen}
        goals={ownGoals}
        onClose={() => setSettingsOpen(false)}
        onSave={async (next) => {
          // Zapisz cele w backendzie
          const success = await api.updateGoals(next)
          if (success) {
            setOwnGoals(next)
            // Jeśli przeglądamy własny dziennik, zaktualizuj także viewedGoals
            if (!isViewingPartner) {
              setViewedGoals(next)
            }
          } else {
            // TODO: pokazać błąd użytkownikowi
            dispatch({ type: 'set-error', error: 'Nie udało się zapisać celów' })
            setTimeout(() => dispatch({ type: 'set-error', error: null }), 3000)
          }
          setSettingsOpen(false)
        }}
      />
    </div>
  )
}

