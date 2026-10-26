'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sumMacros } from '@/lib/nutrition'
import type { DiaryEntryView, Macros, MealType } from '@/lib/types'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/i18n'

type Meal = { id: MealType; label: string }

type Props = {
  meal: Meal
  entries: DiaryEntryView[]
  onAdd: () => void
  onRemove: (id: number) => void
}

export function MealCard({ meal, entries, onAdd, onRemove }: Props) {
  const { language } = useLanguage()
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)
  
  const totals = sumMacros(entries)
  const [expanded, setExpanded] = useState(entries.length > 0)
  const headingId = `meal-${meal.id}`
  const panelId = `meal-panel-${meal.id}`

  return (
    <section aria-labelledby={headingId} className="rounded-3xl bg-card text-card-foreground shadow-sm">
      <div className="p-4">
        {/* Linia 1: Chevron + Nazwa + Przycisk + */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? `Collapse ${meal.label}` : `Expand ${meal.label}`}
            className="flex size-6 shrink-0 items-center justify-center"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                !expanded && '-rotate-90',
              )}
            />
          </button>
          <h2 id={headingId} className="min-w-0 flex-1 font-heading text-base font-bold leading-none">
            {meal.label}
          </h2>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`${t('add-food-to')} ${meal.label}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Linia 2: Kalorie + Makra (zawsze widoczne) */}
        <div className="ml-8 -mt-2 flex items-center gap-3">
          <span className="text-sm font-semibold tabular-nums text-kcal">
            {totals.kcal}
            <span className="ml-0.5 text-xs font-medium text-muted-foreground">{t('kcal')}</span>
          </span>
          <MacroLine macros={totals} language={language} />
        </div>
      </div>

      <div
        id={panelId}
        inert={!expanded}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {entries.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('no-foods-logged')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border px-4 pb-4">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{entry.productName}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-kcal">
                        {entry.kcal} <span className="text-xs font-medium text-muted-foreground">{t('kcal')}</span>
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {entry.unit ? `${entry.amountInGrams} ${entry.unit}` : ''}
                      </p>
                      <MacroLine macros={entry} language={language} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    aria-label={`${t('remove')} ${entry.productName}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function MacroLine({ macros, language, className }: { macros: Macros; language: 'en' | 'pl'; className?: string }) {
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)
  
  return (
    <span className={cn('flex gap-1.5 text-xs tabular-nums text-muted-foreground', className)}>
      <span className="sr-only">
        {t('protein')} {macros.protein} g, {t('fat')} {macros.fat} g, {t('carbs')} {macros.carbs} g
      </span>
      <span aria-hidden="true">
        <span className="font-semibold text-protein">{t('protein-short')}</span> {macros.protein}g
      </span>
      <span aria-hidden="true">
        <span className="font-semibold text-fat">{t('fat-short')}</span> {macros.fat}g
      </span>
      <span aria-hidden="true">
        <span className="font-semibold text-carbs">{t('carbs-short')}</span> {macros.carbs}g
      </span>
    </span>
  )
}
