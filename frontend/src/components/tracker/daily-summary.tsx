import type { Macros } from '@/lib/types'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/i18n'

type Props = {
  totals: Macros
  goals: Macros
}

export function DailySummary({ totals, goals }: Props) {
  const { language } = useLanguage()
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)
  
  // Defensive checks: upewnij się że goals zawiera sensowne wartości
  const safeGoals = {
    kcal: goals.kcal || 2100,
    protein: goals.protein || 130,
    fat: goals.fat || 70,
    carbs: goals.carbs || 235,
  }
  
  const remaining = Math.max(0, safeGoals.kcal - totals.kcal)
  const kcalPct = safeGoals.kcal > 0 ? Math.min(100, (totals.kcal / safeGoals.kcal) * 100) : 0

  return (
    // Przypięty na stałe do dołu ekranu (fixed) – nie scrolluje się z listą posiłków.
    // `max-w-md mx-auto` trzyma go w tej samej kolumnie co reszta aplikacji.
    <section
      aria-labelledby="summary-heading"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md rounded-t-3xl border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-card-foreground shadow-[0_-8px_24px_rgb(0_0_0/0.35)]"
    >
      <h2 id="summary-heading" className="sr-only">
        Daily calorie and macro summary
      </h2>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-xs font-medium text-muted-foreground">{t('calories-left')}</p>
          <p className="font-heading text-3xl font-bold leading-tight tabular-nums text-kcal">
            {remaining}
            <span className="ml-1 text-sm font-medium text-muted-foreground">{t('kcal')}</span>
          </p>
        </div>
        <p className="pb-1 text-sm tabular-nums text-muted-foreground">
          {totals.kcal} / {safeGoals.kcal}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={totals.kcal}
        aria-valuemin={0}
        aria-valuemax={safeGoals.kcal}
        aria-label="Calories consumed"
        className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-kcal transition-[width]"
          style={{ width: `${kcalPct}%` }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3">
        <MacroStat label={t('protein')} value={totals.protein} goal={safeGoals.protein} color="protein" />
        <MacroStat label={t('fat')} value={totals.fat} goal={safeGoals.fat} color="fat" />
        <MacroStat label={t('carbs')} value={totals.carbs} goal={safeGoals.carbs} color="carbs" />
      </dl>
    </section>
  )
}

function MacroStat({
  label,
  value,
  goal,
  color,
}: {
  label: string
  value: number
  goal: number
  color: 'protein' | 'fat' | 'carbs'
}) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0
  const barClass =
    color === 'protein' ? 'bg-protein' : color === 'fat' ? 'bg-fat' : 'bg-carbs'
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-1">
        <dt className="truncate text-xs text-muted-foreground">{label}</dt>
        <dd className="shrink-0 text-xs font-semibold tabular-nums">
          {value}
          <span className="font-medium text-muted-foreground">/{goal}g</span>
        </dd>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
