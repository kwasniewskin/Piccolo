'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Target, User, TrendingUp, Palette, Bell, Download, Info, Users2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KCAL_PER_GRAM, kcalFromMacros } from '@/lib/nutrition'
import type { Macros } from '@/lib/types'
import { useLanguage } from '@/lib/language-context'
import { getTranslation, type Language } from '@/lib/i18n'
import { PartnerSettings } from './partner-settings'

type Props = {
  open: boolean
  goals: Macros
  onClose: () => void
  onSave: (goals: Macros) => void | Promise<void>
}

type View = 'list' | 'calories-form' | 'appearance-form' | 'partner-form'

type FieldKey = keyof Macros
type FormValues = Record<FieldKey, string>

function toForm(goals: Macros): FormValues {
  return {
    kcal: String(goals.kcal),
    protein: String(goals.protein),
    fat: String(goals.fat),
    carbs: String(goals.carbs),
  }
}

function parseField(raw: string, max: number): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

export function SettingsPage({ open, goals, onClose, onSave }: Props) {
  const [view, setView] = useState<View>('list')
  const [values, setValues] = useState<FormValues>(() => toForm(goals))
  const [isAnimatingIn, setIsAnimatingIn] = useState(false)
  const { language, setLanguage } = useLanguage()
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)

  const FIELDS: { key: FieldKey; label: string; unit: string; max: number; hint?: string }[] = [
    { key: 'kcal', label: t('calories'), unit: t('kcal'), max: 10000 },
    { key: 'protein', label: t('protein'), unit: 'g', max: 1000, hint: `${KCAL_PER_GRAM.protein} kcal/g` },
    { key: 'fat', label: t('fat'), unit: 'g', max: 1000, hint: `${KCAL_PER_GRAM.fat} kcal/g` },
    { key: 'carbs', label: t('carbs'), unit: 'g', max: 1000, hint: `${KCAL_PER_GRAM.carbs} kcal/g` },
  ]

  const SETTINGS_ITEMS = [
    { id: 'calories', label: t('calories-macros'), icon: Target, view: 'calories-form' as const },
    { id: 'partner', label: t('partner-sync'), icon: Users2, view: 'partner-form' as const },
    { id: 'account', label: t('account'), icon: User, view: null },
    { id: 'progress', label: t('progress-stats'), icon: TrendingUp, view: null },
    { id: 'appearance', label: t('appearance'), icon: Palette, view: 'appearance-form' as const },
    { id: 'notifications', label: t('notifications'), icon: Bell, view: null },
    { id: 'export', label: t('export-data'), icon: Download, view: null },
    { id: 'about', label: t('about'), icon: Info, view: null },
  ]

  useEffect(() => {
    if (open) {
      setView('list')
      setValues(toForm(goals))
      setIsAnimatingIn(true)
    } else {
      setIsAnimatingIn(false)
    }
  }, [open, goals])

  // ESC closes the panel
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'calories-form' || view === 'appearance-form' || view === 'partner-form') {
          setView('list')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, view, onClose])

  // --- Calorie goals form validation -----------------------------------------
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
  }

  function handleBack() {
    if (view === 'calories-form' || view === 'appearance-form' || view === 'partner-form') {
      setView('list')
    } else {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          'fixed inset-0 bg-background transition-transform duration-300 ease-out',
          isAnimatingIn ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            aria-label={view === 'list' ? 'Close settings' : 'Back to settings'}
            className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-heading text-lg font-bold">
            {view === 'list' ? t('settings') : view === 'calories-form' ? t('calories-macros') : view === 'appearance-form' ? t('appearance') : t('partner-sync')}
          </h1>
        </header>

        {/* Content */}
        <div className="h-full overflow-y-auto pb-20">
          {view === 'list' && (
            <div className="flex flex-col gap-1 p-4">
              {SETTINGS_ITEMS.map((item) => {
                const Icon = item.icon
                const isComingSoon = item.view === null
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.view) setView(item.view)
                    }}
                    disabled={isComingSoon}
                    className={cn(
                      'flex items-center gap-4 rounded-2xl bg-card px-4 py-4 text-left transition-colors',
                      isComingSoon
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-secondary active:scale-[0.98]',
                    )}
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {isComingSoon ? (
                      <span className="text-sm text-muted-foreground">{t('coming-soon')}</span>
                    ) : (
                      <ChevronRight className="size-5 text-muted-foreground" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'appearance-form' && (
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {getTranslation(language, 'language')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLanguage('pl')}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-base font-semibold transition-all',
                      language === 'pl'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-card text-muted-foreground hover:text-foreground'
                    )}
                  >
                    🇵🇱 Polski
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-base font-semibold transition-all',
                      language === 'en'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-card text-muted-foreground hover:text-foreground'
                    )}
                  >
                    🇬🇧 English
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === 'partner-form' && <PartnerSettings />}

          {view === 'calories-form' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
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

              <div className="rounded-2xl bg-card px-4 py-3 text-sm">
                <p className="tabular-nums">
                  {t('macros-total')}: <span className="font-semibold">{macroKcal} {t('kcal')}</span> {t('of')}{' '}
                  {Math.round(kcalLimit)} {t('kcal')}
                </p>
                {exceedsLimit && (
                  <p className="mt-1 font-medium text-destructive">
                    {t('macros-exceed')} {Math.round(macroKcal - kcalLimit)} {t('kcal')}.
                  </p>
                )}
                {invalidFields.length > 0 && (
                  <p className="mt-1 font-medium text-destructive">{t('enter-valid-number')}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSave}
                className="rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                {t('save-goals')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
