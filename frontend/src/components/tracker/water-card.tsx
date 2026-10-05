'use client'

import { GlassWater, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GLASS_ML, GOALS } from '@/lib/nutrition'

export function WaterCard({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const glasses = GOALS.water / GLASS_ML
  const filled = Math.floor(value / GLASS_ML)

  return (
    <section aria-labelledby="water-heading" className="rounded-3xl bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="water-heading" className="font-heading text-base font-bold">
            Water
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{(value / 1000).toFixed(2)} l</span> of{' '}
            {(GOALS.water / 1000).toFixed(1)} l
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(value - GLASS_ML)}
            disabled={value === 0}
            aria-label="Remove a glass of water"
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-border disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onChange(value + GLASS_ML)}
            aria-label="Add a glass of water"
            className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {Array.from({ length: glasses }, (_, i) => {
          const isFilled = i < filled
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(isFilled && i === filled - 1 ? i * GLASS_ML : (i + 1) * GLASS_ML)}
              aria-label={`Set water to ${((i + 1) * GLASS_ML) / 1000} litres`}
              aria-pressed={isFilled}
              className={cn(
                'flex aspect-square items-center justify-center rounded-xl transition-colors',
                isFilled ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground/50 hover:text-muted-foreground',
              )}
            >
              <GlassWater className="size-5" />
            </button>
          )
        })}
      </div>
    </section>
  )
}
