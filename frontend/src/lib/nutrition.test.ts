import { describe, expect, it } from 'vitest'
import { macrosFor, round1, sumMacros, toEntryView } from './nutrition'
import type { DiaryEntry, Product } from './types'

const sampleProduct: Product = {
  id: 42,
  name: 'Pierś z kurczaka',
  caloriesPer100g: 110,
  proteinPer100g: 23,
  fatPer100g: 1.3,
  carbsPer100g: 0,
  unit: 'g',
  defaultServing: 150,
}

describe('nutrition helpers', () => {
  it('przelicza makroskładniki dla podanej gramatury i sumuje listę', () => {
    const chicken = macrosFor(sampleProduct, 150)
    expect(chicken).toEqual({
      kcal: 165,
      protein: 34.5,
      fat: 2,
      carbs: 0,
    })

    const total = sumMacros([
      chicken,
      { kcal: 210, protein: 4.8, fat: 0.5, carbs: 46.8 },
    ])
    expect(total).toEqual({
      kcal: 375,
      protein: round1(34.5 + 4.8),
      fat: 2.5,
      carbs: 46.8,
    })
  })

  it('buduje DiaryEntryView zarówno dla produktu z bazy, jak i łącznego wpisu AI', () => {
    const dbEntry: DiaryEntry = {
      id: 1,
      productId: 42,
      amountInGrams: 150,
      unitKey: 'g',
      unitQuantity: 150,
      date: '2026-11-18',
      mealType: 'lunch',
    }
    const dbView = toEntryView(dbEntry, [sampleProduct])
    expect(dbView).toMatchObject({
      productName: 'Pierś z kurczaka',
      kcal: 165,
      protein: 34.5,
      displayLabel: '150 g',
    })

    const aiCustomEntry: DiaryEntry = {
      id: 2,
      amountInGrams: 0,
      date: '2026-11-18',
      mealType: 'lunch',
      customName: 'Kurczak curry (1 porcja)',
      customCalories: 485,
      customProtein: 38.4,
      customFat: 14.2,
      customCarbs: 51.1,
    }
    const aiView = toEntryView(aiCustomEntry, [])
    expect(aiView).toMatchObject({
      productName: 'Kurczak curry (1 porcja)',
      kcal: 485,
      protein: 38.4,
      fat: 14.2,
      carbs: 51.1,
      unit: '',
    })
  })
})
