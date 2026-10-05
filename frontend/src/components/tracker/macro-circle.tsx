'use client'

import { cn } from '@/lib/utils'

type Props = {
  /** Wartość w gramach */
  grams: number
  /** Procent wypełnienia (0-100) */
  percentage: number
  /** Etykieta makroskładnika */
  label: string
  /** Kolor krzywa (nazwa klasy Tailwind) */
  colorClass: string
}

/**
 * Wykres kołowy pokazujący makroskładnik.
 * Pierścień jest wypełniony proporcjonalnie do procentu kalorii z tego makro.
 */
export function MacroCircle({ grams, percentage, label, colorClass }: Props) {
  // Parametry okręgu SVG
  const size = 72
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  
  // Offset dla efektu wypełnienia (odwrócony, bo SVG rysuje od góry zgodnie z ruchem wskazówek)
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Tło (szary okrąg) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-secondary"
          />
          {/* Wypełnienie (kolorowy łuk) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn('transition-all duration-500', colorClass)}
          />
        </svg>
        {/* Wartość w gramach na środku */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading text-base font-bold tabular-nums">
            {grams.toFixed(1)}
            <span className="text-[10px] font-medium text-muted-foreground">g</span>
          </span>
        </div>
      </div>
      {/* Etykieta i procent */}
      <div className="flex flex-col items-center gap-0.5">
        <dt className="text-[10px] text-muted-foreground">{label}</dt>
        <dd className="text-xs font-medium tabular-nums text-foreground">
          ({percentage}%)
        </dd>
      </div>
    </div>
  )
}
