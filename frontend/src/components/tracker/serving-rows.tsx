import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Product } from '@/lib/types'
import { formatGrams, getAvailableUnits, gramsFor, macrosFor } from '@/lib/nutrition'
import { getUnitLabel, type Language } from '@/lib/i18n'

type QuickServingRowProps = {
  label: string
  grams: number
  kcal: number
  onAdd: () => void
}

/**
 * Single "quick add" row (rows 1-3).
 * Label | weight | kcal | ">" action.
 */
export function QuickServingRow({ label, grams, kcal, onAdd }: QuickServingRowProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex items-center justify-between border-b border-border/40 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
    >
      <span className="text-base">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm tabular-nums text-muted-foreground">{formatGrams(grams)}</span>
        <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums">
          {kcal} kcal
        </span>
        <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <ChevronRight className="h-5 w-5" />
        </div>
      </div>
    </button>
  )
}

type FixedUnitCalculatorRowProps = {
  product: Product
  unitKey: string
  unitLabel: string
  defaultQuantity: number
  lang: Language
  onAdd: (quantity: number, grams: number) => void
}

/**
 * Row 4: calculator with numeric input and FIXED most-used unit.
 * Highlighted input styling emphasizes the active quick-entry field.
 */
export function FixedUnitCalculatorRow({
  product,
  unitKey,
  unitLabel,
  defaultQuantity,
  lang,
  onAdd,
}: FixedUnitCalculatorRowProps) {
  const [quantity, setQuantity] = useState(String(defaultQuantity))

  const parsed = parseFloat(quantity.replace(',', '.'))
  const grams = !isNaN(parsed) && parsed > 0 ? gramsFor(product, unitKey, parsed) : 0
  const macros = grams > 0 ? macrosFor(product, grams) : null

  const handleAdd = () => {
    if (grams > 0 && grams <= 5000) {
      onAdd(parsed, grams)
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-border/40 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-11 w-16 rounded-2xl bg-[#4A5B3E] px-3 text-center text-base font-medium tabular-nums text-white placeholder:text-white/60"
          placeholder="1"
        />
        <span className="text-base">× {unitLabel}</span>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {macros && (
          <>
            <span className="text-sm tabular-nums text-muted-foreground">{formatGrams(grams)}</span>
            <span className="min-w-[4.25rem] text-right text-sm font-semibold tabular-nums">
              {macros.kcal} kcal
            </span>
          </>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!macros || grams > 5000}
          aria-label={`Add ${quantity} ${unitLabel}`}
          className="ml-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

type UnitSelectCalculatorRowProps = {
  product: Product
  lang: Language
  onAdd: (unitKey: string, quantity: number, grams: number) => void
}

/**
 * Row 5: calculator with numeric input and unit DROPDOWN (defaults to g).
 * Allows choosing any serving unit supported by the product.
 */
export function UnitSelectCalculatorRow({ product, lang, onAdd }: UnitSelectCalculatorRowProps) {
  const units = getAvailableUnits(product)
  const [quantity, setQuantity] = useState('1')
  const [unitKey, setUnitKey] = useState('g')

  const parsed = parseFloat(quantity.replace(',', '.'))
  const grams = !isNaN(parsed) && parsed > 0 ? gramsFor(product, unitKey, parsed) : 0
  const macros = grams > 0 ? macrosFor(product, grams) : null

  const handleAdd = () => {
    if (grams > 0 && grams <= 5000) {
      onAdd(unitKey, parsed, grams)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-11 w-16 shrink-0 rounded-2xl bg-[#4A5B3E] px-3 text-center text-base font-medium tabular-nums text-white placeholder:text-white/60"
          placeholder="1"
        />
        <select
          value={unitKey}
          onChange={(e) => setUnitKey(e.target.value)}
          className="h-11 min-w-0 max-w-[8.5rem] rounded-2xl border-none bg-[#4A5B3E] px-3 pr-7 text-base font-medium text-white"
        >
          {units.map((u) => (
            <option key={u.key} value={u.key}>
              {getUnitLabel(lang, u.key)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {macros && (
          <span className="min-w-[4.25rem] text-right text-sm font-semibold tabular-nums">
            {macros.kcal} kcal
          </span>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!macros || grams > 5000}
          aria-label={`Add ${quantity} ${getUnitLabel(lang, unitKey)}`}
          className="ml-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
