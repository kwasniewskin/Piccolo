'use client'

import { Settings } from 'lucide-react'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs'

/** Dyskretny pasek na górze: nazwa aplikacji + auth + przycisk ustawień. */
export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { isSignedIn, isLoaded } = useUser()

  return (
    <header
      className="flex items-center justify-between px-5 pb-1"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <p className="font-heading text-sm font-bold tracking-wide text-muted-foreground">Piccolo</p>
      
      <div className="flex items-center gap-2">
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
