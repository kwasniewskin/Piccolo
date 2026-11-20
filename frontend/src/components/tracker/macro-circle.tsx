'use client'

import { cn } from '@/lib/utils'

type Props = {
  /** Value in grams */
  grams: number
  /** Fill percentage (0-100) */
  percentage: number
  /** Macro label */
  label: string
  /** Arc stroke color (Tailwind utility class) */
  colorClass: string
}

/**
 * Circular ring chart showing a single macronutrient.
 * Filled proportionally to its percentage of the daily calorie target.
 */
export function MacroCircle({ grams, percentage, label, colorClass }: Props) {
  // SVG circle geometry parameters
  const size = 72
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  
  // Stroke dash offset (inverted because SVG draws clockwise from 12 o'clock)
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
          {/* Track background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-secondary"
          />
          {/* Filled progress arc */}
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
        {/* Centered gram value */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading text-base font-bold tabular-nums">
            {grams.toFixed(1)}
            <span className="text-[10px] font-medium text-muted-foreground">g</span>
          </span>
        </div>
      </div>
      {/* Macro label and percentage */}
      <div className="flex flex-col items-center gap-0.5">
        <dt className="text-[10px] text-muted-foreground">{label}</dt>
        <dd className="text-xs font-medium tabular-nums text-foreground">
          ({percentage}%)
        </dd>
      </div>
    </div>
  )
}
