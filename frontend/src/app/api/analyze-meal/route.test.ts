import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

const ORIGINAL_ENV = { ...process.env }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/analyze-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockGeminiJson(jsonData: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(jsonData) }],
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

describe('POST /api/analyze-meal', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, GEMINI_API_KEY: 'test-gemini-key' }
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('zwraca 400 gdy brak opisu, korekty i zdjęć', async () => {
    const res = await POST(
      makeRequest({
        prompt: '   ',
        images: [],
        context: {
          currentDate: '2026-11-18',
          currentMeal: 'lunch',
          isViewingPartner: false,
          hasPartner: false,
        },
      })
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('zwraca oddzielne zakładki meals[] dla dwóch talerzy i normalizuje nieprawidłowe wartości', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        mockGeminiJson({
          aiSummary: 'Rozdzielono kartkę na 2 talerze.',
          meals: [
            {
              dishName: 'Kanapki N',
              tabLabel: 'Ja',
              totalPortions: -2,
              ingredients: [
                {
                  rawName: 'Twaróg',
                  searchQuery: 'twaróg',
                  amountGrams: 0,
                  sourceType: 'database_candidate',
                  nutritionPer100g: { calories: -10, protein: 18.25, fat: 4, carbs: 3.5 },
                },
              ],
              allocations: [
                { target: 'self', date: 'bad-date', mealType: 'invalid', portions: 0 },
              ],
            },
            {
              dishName: 'Kanapki W',
              tabLabel: 'Wiktoria',
              totalPortions: 1,
              ingredients: [
                {
                  rawName: 'Serek Protein+',
                  searchQuery: 'serek protein',
                  amountGrams: 14.44,
                  sourceType: 'from_label_photo',
                  nutritionPer100g: { calories: 135, protein: 14, fat: 7, carbs: 4 },
                  newProductDetails: { name: 'Serek Protein+', barcode: '590123' },
                },
              ],
              allocations: [
                { target: 'partner', date: '2026-11-19', mealType: 'breakfast', portions: 1 },
              ],
            },
          ],
        })
      )
    )

    const res = await POST(
      makeRequest({
        prompt: 'Rozlicz kartkę dla N i W',
        context: {
          currentDate: '2026-11-18',
          currentMeal: 'second-breakfast',
          isViewingPartner: false,
          hasPartner: true,
          partnerName: 'Wiktoria',
        },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.meals).toHaveLength(2)

    // Pierwszy talerz: zabezpieczone totalPortions, amountGrams, data i mealType
    expect(data.meals[0].totalPortions).toBe(1)
    expect(data.meals[0].ingredients[0].amountGrams).toBe(100)
    expect(data.meals[0].ingredients[0].nutritionPer100g.calories).toBe(0)
    expect(data.meals[0].ingredients[0].nutritionPer100g.protein).toBe(18.3)
    expect(data.meals[0].allocations[0]).toEqual({
      target: 'self',
      date: '2026-11-18',
      mealType: 'second-breakfast',
      portions: 1,
    })

    // Drugi talerz: zachowany partner, jutro i auto saveToDatabase=true dla zdjęcia etykiety
    expect(data.meals[1].ingredients[0].amountGrams).toBe(14.4)
    expect(data.meals[1].ingredients[0].saveToDatabase).toBe(true)
    expect(data.meals[1].ingredients[0].newProductDetails?.barcode).toBe('590123')
    expect(data.meals[1].allocations[0]).toEqual({
      target: 'partner',
      date: '2026-11-19',
      mealType: 'breakfast',
      portions: 1,
    })
  })

  it('wymusza target=self gdy użytkownik nie ma sparowanego partnera', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        mockGeminiJson({
          dishName: 'Curry',
          totalPortions: 2,
          ingredients: [
            {
              rawName: 'Kurczak',
              searchQuery: 'pierś z kurczaka',
              amountGrams: 300,
              nutritionPer100g: { calories: 110, protein: 23, fat: 1.3, carbs: 0 },
            },
          ],
          allocations: [
            { target: 'partner', date: '2026-11-18', mealType: 'lunch', portions: 1 },
          ],
        })
      )
    )

    const res = await POST(
      makeRequest({
        prompt: 'Curry',
        context: {
          currentDate: '2026-11-18',
          currentMeal: 'lunch',
          isViewingPartner: false,
          hasPartner: false,
        },
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.meals).toHaveLength(1)
    expect(data.meals[0].allocations[0].target).toBe('self')
  })

  it('obsługuje szybkie przeliczenie pojedynczego składnika (recalculateIngredient)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        mockGeminiJson({
          rawName: 'Serek śmietankowy wysokobiałkowy',
          searchQuery: 'serek wysokobiałkowy',
          nutritionPer100g: { calories: 135, protein: 14, fat: 7, carbs: 4 },
        })
      )
    )

    const badRes = await POST(
      makeRequest({ recalculateIngredient: { name: '  ', amountGrams: 50 } })
    )
    expect(badRes.status).toBe(400)

    const okRes = await POST(
      makeRequest({
        recalculateIngredient: { name: 'serek wysokobiałkowy', amountGrams: 45 },
      })
    )
    expect(okRes.status).toBe(200)
    const data = await okRes.json()
    expect(data.ingredient.rawName).toBe('Serek śmietankowy wysokobiałkowy')
    expect(data.ingredient.amountGrams).toBe(45)
    expect(data.ingredient.nutritionPer100g.protein).toBe(14)
  })
})
