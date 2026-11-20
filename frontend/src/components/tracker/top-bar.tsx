'use client'

import { Settings, ArrowLeftRight } from 'lucide-react'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs'
import { usePartner } from '@/lib/partner-context'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/i18n'

/** Subtle top bar: app name, auth controls, partner switcher, and settings button. */
export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { isSignedIn, isLoaded } = useUser()
  const { isViewingPartner, connectionStatus, switchToPartner, switchToSelf } = usePartner()
  const { language } = useLanguage()
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)

  const showPartnerSwitch = connectionStatus === 'connected'

  return (
    <header
      className="flex items-center justify-between px-5 pb-1"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <p className="font-heading text-sm font-bold tracking-wide text-muted-foreground">Piccolo</p>
      
      <div className="flex items-center gap-2">
        {showPartnerSwitch && (
          <button
            type="button"
            onClick={isViewingPartner ? switchToSelf : switchToPartner}
            aria-pressed={isViewingPartner}
            className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors"
          >
            <ArrowLeftRight className="size-3" />
            <span>{isViewingPartner ? t('partner-diary') : t('my-diary')}</span>
          </button>
        )}

        {isLoaded && (
          <>
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Sign Up
                  </button>
                </SignUpButton>
              </>
            ) : (
              <UserButton 
                appearance={{
                  elements: {
                    avatarBox: "size-8"
                  }
                }}
              />
            )}
          </>
        )}
        
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Settings className="size-4" />
        </button>
      </div>
    </header>
  )
}
