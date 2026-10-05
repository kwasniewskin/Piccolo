'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KCAL_PER_GRAM, kcalFromMacros } from '@/lib/nutrition'
import type { Macros } from '@/lib/types'

type Props = {
  open: boolean
  /** Aktualne cele – wczytywane do formularza przy każdym otwarciu. */
  goals: Macros
  onClose: () => void
  onSave: (goals: Macros) => void
}

type FieldKey = keyof Macros
type FormValues = Record<FieldKey, string>

const FIELDS: { key: FieldKey; label: string; unit: string; max: number; hint?: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', max: 10000 },
  { key: 'protein', label: 'Protein', unit: 'g', max: 1000, hint: `${KCAL_PER_GRAM.protein} kcal/g` },
  { key: 'fat', label: 'Fat', unit: 'g', max: 1000, hint: `${KCAL_PER_GRAM.fat} kcal/g` },
  { key: 'carbs', label: 'Carbs', unit: 'g', max: 1000, hint: `${KCAL_PER_GRAM.carbs} kcal/g` },
]

function toForm(goals: Macros): FormValues {
  return {
    kcal: String(goals.kcal),
    protein: String(goals.protein),
    fat: String(goals.fat),
    carbs: String(goals.carbs),
  }
}

/** Zwraca liczbę albo `null`, gdy pole jest puste / niepoprawne / poza zakresem. */
function parseField(raw: string, max: number): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

export function SettingsSheet({ open, goals, onClose, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<FormValues>(() => toForm(goals))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setValues(toForm(goals)) // świeże wartości przy każdym otwarciu
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
    // `goals` celowo pomijamy – nie nadpisujemy wpisywanych danych w trakcie edycji
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Walidacja -------------------------------------------------------------
  const parsed = Object.fromEntries(
    FIELDS.map((f) => [f.key, parseField(values[f.key], f.max)]),
  ) as Record<FieldKey, number | null>

  const invalidFields = FIELDS.filter((f) => parsed[f.key] === null).map((f) => f.key)
  const macroKcal = Math.round(
    kcalFromMacros({
      protein: parsed.protein ?? 0,
      fat: parsed.fat ?? 0,
      carbs: parsed.carbs ?? 0,
    }),
  )
  const kcalLimit = parsed.kcal ?? 0
  // Reguła: kcal z makro (P×4 + C×4 + F×9) nie może przekroczyć limitu kalorii
  const exceedsLimit = parsed.kcal !== null && macroKcal > kcalLimit
  const canSave = invalidFields.length === 0 && !exceedsLimit && kcalLimit > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    onSave({
      kcal: Math.round(kcalLimit),
      protein: parsed.protein!,
      fat: parsed.fat!,
      carbs: parsed.carbs!,
    })
    // Rodzic ustawia open=false → efekt zamyka dialog
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close()
      }}
      aria-labelledby="settings-title"
      className="m-0 mx-auto mt-auto w-full max-w-md rounded-t-3xl bg-background p-0 text-foreground backdrop:bg-foreground/40"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 pt-3 pb-6" noValidate>
        <div className="flex items-center gap-2">
          <span className="size-9" aria-hidden="true" />
          <div className="flex flex-1 flex-col items-center">
            <span className="mb-1 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <h2 id="settings-title" className="font-heading text-base font-bold">
              Daily goals
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

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => {
            const invalid = invalidFields.includes(f.key) || (f.key === 'kcal' && exceedsLimit)
            return (
              <label
                key={f.key}
                className={cn('flex flex-col gap-1.5', f.key === 'kcal' && 'col-span-2')}
              >
                <span className="flex items-baseline justify-between text-sm font-medium text-muted-foreground">
                  {f.label}
                  {f.hint && <span className="text-xs font-normal">{f.hint}</span>}
                </span>
                <span
                  className={cn(
                    'flex items-center gap-2 rounded-2xl bg-card px-4 py-3 shadow-sm focus-within:outline-2 focus-within:outline-ring',
                    invalid && 'outline-2 outline-destructive',
                  )}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={f.max}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    aria-invalid={invalid}
                    aria-describedby="settings-status"
                    className="w-full bg-transparent font-heading text-xl font-bold tabular-nums outline-none"
                  />
                  <span className="text-sm text-muted-foreground">{f.unit}</span>
                </span>
              </label>
            )
          })}
        </div>

        <div
          id="settings-status"
          role="status"
          aria-live="polite"
          className={cn(
            'rounded-2xl px-4 py-3 text-sm',
            exceedsLimit ? 'bg-destructive/15 text-destructive' : 'bg-card text-muted-foreground',
          )}
        >
          <p className="tabular-nums">
            Macros total: <span className="font-semibold">{macroKcal} kcal</span> of{' '}
            {Math.round(kcalLimit)} kcal
          </p>
          {exceedsLimit && (
            <p className="mt-1 font-medium">
              Macros exceed your calorie limit by {Math.round(macroKcal - kcalLimit)} kcal.
            </p>
          )}
          {invalidFields.length > 0 && (
            <p className="mt-1 font-medium text-destructive">Enter a valid number in every field.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSave}
          className="rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          Save goals
        </button>
      </form>
    </dialog>
  )
}
