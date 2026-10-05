'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fromDateKey, toDateKey } from '@/lib/nutrition'
import { useLanguage } from '@/lib/language-context'
import { getLocale, getTranslation } from '@/lib/i18n'

type Props = {
  selected: string
  today: string
  loggedDays: Set<string>
  onSelect: (key: string) => void
}

function weekOf(key: string) {
  const date = fromDateKey(key)
  const mondayOffset = (date.getDay() + 6) % 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - mondayOffset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function shift(key: string, days: number) {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function DateStrip({ selected, today, loggedDays, onSelect }: Props) {
  const { language } = useLanguage()
  const locale = getLocale(language)
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)
  
  const days = weekOf(selected)
  const month = fromDateKey(selected).toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <nav aria-label="Choose day" className="flex flex-col gap-2 px-4 pb-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-muted-foreground">{month}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelect(shift(selected, -7))}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('previous-week')}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onSelect(shift(selected, 7))}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('next-week')}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const key = toDateKey(d)
          const isSelected = key === selected
          const isToday = key === today
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={isSelected ? 'date' : undefined}
                aria-label={d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-2xl py-2 transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-card-foreground hover:bg-secondary',
                )}
              >
                <span className={cn('text-xs font-medium', isSelected ? 'opacity-80' : 'text-muted-foreground')}>
                  {d.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2)}
                </span>
                <span className={cn('font-heading text-base font-bold', isToday && !isSelected && 'text-primary')}>
                  {d.getDate()}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1 rounded-full',
                    loggedDays.has(key) ? (isSelected ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent',
                  )}
                />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
