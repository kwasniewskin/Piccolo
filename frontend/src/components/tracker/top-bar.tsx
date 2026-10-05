'use client'

import { Settings } from 'lucide-react'

/** Dyskretny pasek na górze: nazwa aplikacji + przycisk ustawień. */
export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header
      className="flex items-center justify-between px-5 pb-1"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <p className="font-heading text-sm font-bold tracking-wide text-muted-foreground">Piccolo</p>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Settings className="size-4" />
      </button>
    </header>
  )
}
