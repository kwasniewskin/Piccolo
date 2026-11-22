// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProductForm from './ProductForm'
import * as api from '@/lib/api'
import { toast } from 'sonner'

const mockPush = vi.fn()
const mockSearchParams = new URLSearchParams('returnUrl=/&meal=lunch&date=2026-11-22')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/lib/api', () => ({
  getProductByBarcode: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('ProductForm', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(api.getProductByBarcode).mockResolvedValue(null)
    vi.mocked(api.createProduct).mockResolvedValue({
      id: 42,
      name: 'Skyr waniliowy',
      caloriesPer100g: 68,
      proteinPer100g: 9.5,
      fatPer100g: 0.25,
      carbsPer100g: 7.1,
      unit: 'g',
      defaultServing: 150,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('submits two-decimal nutrition values (e.g. salt 0.15) via api.createProduct and redirects back', async () => {
    render(<ProductForm />)

    fireEvent.change(screen.getByLabelText(/Nazwa produktu/i), {
      target: { value: 'Skyr waniliowy' },
    })
    fireEvent.change(screen.getByLabelText(/Kalorie \(kcal\)/i), {
      target: { value: '68' },
    })
    fireEvent.change(screen.getByLabelText(/Białko \(g\)/i), {
      target: { value: '9.5' },
    })
    fireEvent.change(screen.getByLabelText(/Tłuszcze \(g\)/i), {
      target: { value: '0.25' },
    })
    fireEvent.change(screen.getByLabelText(/Węglowodany \(g\)/i), {
      target: { value: '7.1' },
    })
    fireEvent.change(screen.getByLabelText(/Sól \(g\)/i), {
      target: { value: '0.15' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(api.createProduct).toHaveBeenCalledTimes(1))

    expect(api.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Skyr waniliowy',
        caloriesPer100g: 68,
        proteinPer100g: 9.5,
        fatPer100g: 0.25,
        carbsPer100g: 7.1,
        saltPer100g: 0.15,
        packageWeightGrams: null,
        defaultServingGrams: null,
      })
    )
    expect(mockPush).toHaveBeenCalledWith('/?meal=lunch&date=2026-11-22&preselectProductId=42')
  })

  it('shows validation toast when required macros are missing', async () => {
    render(<ProductForm />)

    fireEvent.change(screen.getByLabelText(/Nazwa produktu/i), {
      target: { value: 'Produkt testowy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(api.createProduct).not.toHaveBeenCalled()
  })
})
