// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiMealAssistant } from './ai-meal-assistant'
import * as api from '@/lib/api'
import { LanguageProvider } from '@/lib/language-context'
import { usePartner } from '@/lib/partner-context'
import type { Product } from '@/lib/types'

vi.mock('@/lib/api', () => ({
  searchProducts: vi.fn(),
  getProductByBarcode: vi.fn(),
  createProduct: vi.fn(),
  importProduct: vi.fn(),
  createDiaryEntry: vi.fn(),
  cacheProducts: vi.fn(),
}))

vi.mock('@/lib/partner-context', () => ({
  usePartner: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

const dbCheese: Product = {
  id: 10,
  name: 'Twaróg chudy',
  caloriesPer100g: 98,
  proteinPer100g: 19.5,
  fatPer100g: 0.5,
  carbsPer100g: 3.5,
  unit: 'g',
  defaultServing: 100,
  dataSource: 'System',
}

describe('AiMealAssistant', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(usePartner).mockReturnValue({
      activeUserId: undefined,
      isViewingPartner: false,
      partnerInfo: {
        userId: 99,
        name: 'Wiktoria',
        email: 'wiktoria@example.com',
        connectedAt: '2026-11-01T10:00:00Z',
      },
      connectionStatus: 'connected',
      switchToPartner: vi.fn(),
      switchToSelf: vi.fn(),
      refreshConnection: vi.fn(),
    })

    vi.mocked(api.searchProducts).mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('twar')) return [dbCheese]
      return []
    })
    vi.mocked(api.getProductByBarcode).mockResolvedValue(null)
    vi.mocked(api.createDiaryEntry).mockResolvedValue({
      id: 500,
      date: '2026-11-18',
      mealType: 'lunch',
      amountInGrams: 100,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('wyświetla zakładki dla dwóch talerzy, rozwija składnik po kliknięciu i pozwala wyczyścić gramaturę bez wskakującego zera', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            aiSummary: 'Rozdzielono na 2 talerze.',
            provider: 'gemini',
            model: 'gemini-3-flash-preview',
            meals: [
              {
                dishName: 'Śniadanie N',
                tabLabel: 'Ja',
                totalPortions: 1,
                ingredients: [
                  {
                    rawName: 'Twaróg',
                    searchQuery: 'twaróg',
                    amountGrams: 100,
                    sourceType: 'database_candidate',
                    nutritionPer100g: { calories: 98, protein: 19.5, fat: 0.5, carbs: 3.5 },
                  },
                  {
                    rawName: 'Serek śmietankowy',
                    searchQuery: 'serek',
                    amountGrams: 120,
                    sourceType: 'ai_estimated',
                    nutritionPer100g: { calories: 250, protein: 6, fat: 23, carbs: 3.5 },
                  },
                ],
                allocations: [
                  { target: 'self', date: '2026-11-18', mealType: 'second-breakfast', portions: 1 },
                ],
              },
              {
                dishName: 'Śniadanie W',
                tabLabel: 'Wiktoria',
                totalPortions: 1,
                ingredients: [
                  {
                    rawName: 'Twaróg',
                    searchQuery: 'twaróg',
                    amountGrams: 60,
                    sourceType: 'database_candidate',
                    nutritionPer100g: { calories: 98, protein: 19.5, fat: 0.5, carbs: 3.5 },
                  },
                ],
                allocations: [
                  { target: 'partner', date: '2026-11-18', mealType: 'second-breakfast', portions: 1 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )

    render(
      <AiMealAssistant
        meal="second-breakfast"
        date="2026-11-18"
        onBack={vi.fn()}
        onComplete={vi.fn()}
        showToast={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Co przygotowaliście?'), {
      target: { value: 'Kartka N i W' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Analizuj z AI/i }))

    // Wait for tabs and compact ingredient list (collapsed by default)
    await screen.findByRole('button', { name: /Ja · 398 kcal/i })
    expect(screen.getByRole('button', { name: /Wiktoria · 59 kcal/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Gramatura składnika')).not.toBeInTheDocument()

    // Clicking a row expands only that ingredient
    fireEvent.click(screen.getByRole('button', { name: /Serek śmietankowy/i }))
    const gramsInput = screen.getByLabelText('Gramatura składnika') as HTMLInputElement
    expect(gramsInput.value).toBe('120')

    // Clearing to empty string must not snap back to "0"
    fireEvent.change(gramsInput, { target: { value: '' } })
    expect(gramsInput.value).toBe('')

    // Entering 30 updates dish macros to 98 + 75 = 173 kcal
    fireEvent.change(gramsInput, { target: { value: '30' } })
    expect(gramsInput.value).toBe('30')
    expect(screen.getByText('173 kcal')).toBeInTheDocument()
  })

  it('przelicza pojedynczy składnik z AI po zmianie nazwy i zapisuje nowy produkt oraz wpisy do obu dzienników', async () => {
    const createdLabelProduct: Product = {
      id: 777,
      name: 'Serek Protein+',
      caloriesPer100g: 135,
      proteinPer100g: 14,
      fatPer100g: 7,
      carbsPer100g: 4,
      unit: 'g',
      defaultServing: 50,
      dataSource: 'User',
    }
    vi.mocked(api.createProduct).mockResolvedValueOnce(createdLabelProduct)

    const fetchMock = vi
      .fn()
      // 1. Primary meal analysis
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            aiSummary: 'Policzono 2 zakładki.',
            meals: [
              {
                dishName: 'Kanapki N',
                tabLabel: 'Ja',
                totalPortions: 1,
                ingredients: [
                  {
                    rawName: 'Serek zwykły',
                    searchQuery: 'serek',
                    amountGrams: 50,
                    sourceType: 'from_label_photo',
                    saveToDatabase: true,
                    nutritionPer100g: { calories: 135, protein: 14, fat: 7, carbs: 4 },
                    newProductDetails: {
                      name: 'Serek Protein+',
                      manufacturer: 'Piątnica',
                      barcode: '59000111',
                    },
                  },
                ],
                allocations: [
                  { target: 'self', date: '2026-11-18', mealType: 'lunch', portions: 1 },
                ],
              },
              {
                dishName: 'Kanapki W',
                tabLabel: 'Wiktoria',
                totalPortions: 1,
                ingredients: [
                  {
                    rawName: 'Twaróg',
                    searchQuery: 'twaróg',
                    amountGrams: 100,
                    sourceType: 'database_candidate',
                    nutritionPer100g: { calories: 98, protein: 19.5, fat: 0.5, carbs: 3.5 },
                  },
                ],
                allocations: [
                  { target: 'partner', date: '2026-11-19', mealType: 'dinner', portions: 1 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      // 2. Single-ingredient variant recalculation
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ingredient: {
              rawName: 'Serek Protein+ Light',
              searchQuery: 'serek protein light',
              amountGrams: 50,
              sourceType: 'ai_estimated',
              nutritionPer100g: { calories: 110, protein: 16, fat: 3, carbs: 4 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

    vi.stubGlobal('fetch', fetchMock)
    const onComplete = vi.fn()

    render(
      <AiMealAssistant
        meal="lunch"
        date="2026-11-18"
        onBack={vi.fn()}
        onComplete={onComplete}
        showToast={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Co przygotowaliście?'), {
      target: { value: 'Dwa talerze' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Analizuj z AI/i }))

    await screen.findByRole('button', { name: /Serek Protein\+/i })

    // Expand ingredient and recalculate variant after editing its name
    fireEvent.click(screen.getByRole('button', { name: /Serek Protein\+/i }))
    fireEvent.click(screen.getByRole('button', { name: /Przelicz nazwę z AI/i }))

    await screen.findByRole('button', { name: /Serek Protein\+ Light/i })

    // Enable DB save and switch to "Separate DB ingredients" in Options
    fireEvent.click(screen.getByLabelText(/Zapisz w bazie Piccolo/i))
    fireEvent.click(screen.getByRole('button', { name: /Opcje/i }))
    fireEvent.click(screen.getByRole('button', { name: /Osobne składniki z bazy/i }))

    expect(window.localStorage.getItem('piccolo:ai-save-mode')).toBe(
      'separate_ingredients'
    )

    // Confirm saving both tabs
    fireEvent.click(screen.getByRole('button', { name: /Zatwierdź i dodaj \(2\)/i }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))

    // Label-scanned product created in DB
    expect(api.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Serek Protein+ Light',
        manufacturer: 'Piątnica',
        barcode: '59000111',
        caloriesPer100g: 110,
      })
    )

    // Entry for self with newly saved product (777) and entry for partner (targetUserId: 99) tomorrow
    expect(api.createDiaryEntry).toHaveBeenNthCalledWith(
      1,
      '2026-11-18',
      'lunch',
      50,
      expect.objectContaining({
        productId: 777,
        targetUserId: undefined,
      })
    )
    expect(api.createDiaryEntry).toHaveBeenNthCalledWith(
      2,
      '2026-11-19',
      'dinner',
      100,
      expect.objectContaining({
        productId: 10,
        targetUserId: 99,
      })
    )
  })

  it('renders English UI and forwards language=en to AI and OFF search inside LanguageProvider', async () => {
    window.localStorage.setItem('piccolo-language', 'en')

    vi.mocked(api.searchProducts).mockResolvedValue([])
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aiSummary: 'Analyzed oatmeal.',
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        meals: [
          {
            dishName: 'Oatmeal',
            tabLabel: 'Me',
            totalPortions: 1,
            ingredients: [
              {
                rawName: 'Rolled oats',
                searchQuery: 'rolled oats',
                amountGrams: 60,
                sourceType: 'database_candidate',
                saveToDatabase: false,
                nutritionPer100g: { calories: 380, protein: 13, fat: 7, carbs: 66 },
              },
            ],
            allocations: [
              { target: 'self', date: '2026-11-18', mealType: 'breakfast', portions: 1 },
            ],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <LanguageProvider>
        <AiMealAssistant
          meal="breakfast"
          date="2026-11-18"
          onBack={vi.fn()}
          onComplete={vi.fn()}
          showToast={vi.fn()}
        />
      </LanguageProvider>
    )

    fireEvent.change(screen.getByLabelText('What did you prepare?'), {
      target: { value: '60g rolled oats' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))

    await screen.findByRole('button', { name: /Rolled oats/i })

    const sentPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(sentPayload.context.language).toBe('en')
    expect(api.searchProducts).toHaveBeenCalledWith('rolled oats', 'en')
    window.localStorage.removeItem('piccolo-language')
  })

  it('rejects calorie-mismatched local DB hits (e.g. vegetable chips for steamed broccoli) and saves English meal/ingredient names', async () => {
    window.localStorage.setItem('piccolo-language', 'en')

    const bogusBroccoliChips: Product = {
      id: 999,
      name: 'Chipsy vegee carrot beetroot broccoli',
      caloriesPer100g: 418,
      proteinPer100g: 6,
      fatPer100g: 16,
      carbsPer100g: 60,
      unit: 'g',
      defaultServing: 100,
      dataSource: 'System',
    }

    vi.mocked(api.searchProducts).mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('broccoli')) return [bogusBroccoliChips]
      return []
    })

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aiSummary: 'Analyzed grilled chicken with steamed broccoli.',
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        meals: [
          {
            dishName: 'Grilled Chicken & Broccoli',
            tabLabel: 'Me',
            totalPortions: 1,
            ingredients: [
              {
                rawName: 'steamed broccoli',
                searchQuery: 'broccoli',
                amountGrams: 150,
                sourceType: 'database_candidate',
                saveToDatabase: false,
                nutritionPer100g: { calories: 34, protein: 2.8, fat: 0.4, carbs: 6.6 },
              },
            ],
            allocations: [
              { target: 'self', date: '2026-11-20', mealType: 'lunch', portions: 1 },
            ],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const onComplete = vi.fn()
    render(
      <LanguageProvider>
        <AiMealAssistant
          meal="lunch"
          date="2026-11-20"
          onBack={vi.fn()}
          onComplete={onComplete}
          showToast={vi.fn()}
        />
      </LanguageProvider>
    )

    fireEvent.change(screen.getByLabelText('What did you prepare?'), {
      target: { value: '150g steamed broccoli' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Analyze with AI/i }))

    // Keeps clean English ingredient & realistic 51 kcal instead of 627 kcal vegetable chips
    await screen.findByRole('button', { name: /steamed broccoli/i })
    expect(screen.queryByRole('button', { name: /Chipsy vegee/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('51 kcal').length).toBeGreaterThanOrEqual(2)

    // Confirm and save in single_dish mode -> persists English dishName
    fireEvent.click(screen.getByRole('button', { name: /Confirm & add to diary/i }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))

    expect(api.createDiaryEntry).toHaveBeenCalledWith(
      '2026-11-20',
      'lunch',
      null,
      expect.objectContaining({
        customName: 'Grilled Chicken & Broccoli',
        customCalories: 51,
      })
    )
    window.localStorage.removeItem('piccolo-language')
  })
})
