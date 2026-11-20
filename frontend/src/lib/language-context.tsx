'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Language } from './i18n'

type LanguageContextType = {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const STORAGE_KEY = 'piccolo-language'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pl')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'pl') {
      setLanguageState(stored)
    }
    setMounted(true)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }

  if (!mounted) {
    return null
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}

const FALLBACK_LANGUAGE_CONTEXT: LanguageContextType = {
  language: 'pl',
  setLanguage: () => {},
}

/**
 * Returns the active language context or falls back to Polish when rendered outside LanguageProvider (e.g. unit tests).
 */
export function useOptionalLanguage() {
  return useContext(LanguageContext) ?? FALLBACK_LANGUAGE_CONTEXT
}
