'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import * as api from './api'
import { useLanguage } from './language-context'
import { getTranslation } from './i18n'

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export type PartnerInfo = {
  /** Wewnętrzne ID partnera w backendzie (int). */
  userId: number
  name: string | null
  email: string | null
  connectedAt: string
}

export type ConnectionStatus = 'none' | 'connected' | 'loading'

export type RefreshOptions = {
  /**
   * Ciche odświeżanie (polling, powrót do karty): nie ustawia statusu 'loading',
   * więc UI nie miga spinnerem, a błąd sieci nie zmienia aktualnego stanu.
   */
  silent?: boolean
}

type PartnerContextValue = {
  /**
   * ID dziennika, który oglądamy, do przekazania jako `targetUserId`.
   * `undefined` = własny dziennik (backend sam ustala zalogowanego użytkownika).
   */
  activeUserId: number | undefined
  isViewingPartner: boolean
  partnerInfo: PartnerInfo | null
  connectionStatus: ConnectionStatus
  switchToPartner: () => void
  switchToSelf: () => void
  refreshConnection: (options?: RefreshOptions) => Promise<void>
}

const PartnerContext = createContext<PartnerContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PartnerProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { language } = useLanguage()
  const [partnerInfo, setPartnerInfo] = useState<PartnerInfo | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading')
  // Stan tylko w pamięci: po F5 zawsze wracamy do własnego dziennika.
  const [viewingPartner, setViewingPartner] = useState(false)

  const isViewingPartner = viewingPartner && partnerInfo !== null
  const activeUserId = isViewingPartner ? partnerInfo!.userId : undefined

  // Ostatni znany status (bez 'loading') – do wykrycia przejścia none → connected.
  // null = jeszcze nie znamy statusu (pierwsze pobranie po zalogowaniu nie pokazuje toasta).
  const lastKnownStatusRef = useRef<'none' | 'connected' | null>(null)
  const inFlightRef = useRef(false)
  const languageRef = useRef(language)
  languageRef.current = language

  const refreshConnection = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent ?? false
    // Polling i focus mogą się nałożyć – nie wysyłamy równoległych zapytań w tle
    if (silent && inFlightRef.current) return
    inFlightRef.current = true
    if (!silent) setConnectionStatus('loading')

    try {
      const connection = await api.getPartnerConnection()

      if (connection) {
        const wasNone = lastKnownStatusRef.current === 'none'
        lastKnownStatusRef.current = 'connected'
        setPartnerInfo({
          userId: connection.partnerId,
          name: connection.partnerName,
          email: connection.partnerEmail,
          connectedAt: connection.connectedAt,
        })
        setConnectionStatus('connected')

        if (wasNone) {
          const who = connection.partnerName || connection.partnerEmail || ''
          toast.success(`${getTranslation(languageRef.current, 'partner-connected-toast')} ${who}`.trim())
        }
      } else {
        lastKnownStatusRef.current = 'none'
        setPartnerInfo(null)
        setViewingPartner(false)
        setConnectionStatus('none')
      }
    } catch (error) {
      console.error('[Partner] Failed to refresh connection:', error)
      // Ciche odświeżanie: zostawiamy poprzedni stan (chwilowy błąd sieci ≠ rozłączenie).
      // Pełne odświeżanie: nie zostawiamy spinnera w nieskończoność.
      if (!silent) {
        setConnectionStatus(lastKnownStatusRef.current ?? 'none')
      }
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // Pobierz status połączenia po zalogowaniu
  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      lastKnownStatusRef.current = null
      setPartnerInfo(null)
      setViewingPartner(false)
      setConnectionStatus('none')
      return
    }
    refreshConnection()
  }, [isLoaded, isSignedIn, refreshConnection])

  // Po powrocie do karty/okna sprawdź status – partner mógł się w międzyczasie
  // połączyć lub rozłączyć (bez tego druga osoba widziała zmianę dopiero po F5).
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshConnection({ silent: true })
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('focus', handleVisible)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('focus', handleVisible)
    }
  }, [isLoaded, isSignedIn, refreshConnection])

  // 403 z API dziennika → wróć do własnego dziennika i pokaż komunikat
  const viewingRef = useRef(false)
  viewingRef.current = viewingPartner

  useEffect(() => {
    const handleAccessLost = () => {
      if (viewingRef.current) {
        toast.error(getTranslation(language, 'partner-connection-lost'))
      }
      setViewingPartner(false)
      refreshConnection()
    }
    window.addEventListener(api.PARTNER_ACCESS_LOST_EVENT, handleAccessLost)
    return () => window.removeEventListener(api.PARTNER_ACCESS_LOST_EVENT, handleAccessLost)
  }, [language, refreshConnection])

  // Color shift: atrybut na <html>, żeby objął też portale (dialogi, toasty)
  useEffect(() => {
    const root = document.documentElement
    if (isViewingPartner) {
      root.dataset.viewingPartner = 'true'
    } else {
      delete root.dataset.viewingPartner
    }
    return () => {
      delete root.dataset.viewingPartner
    }
  }, [isViewingPartner])

  const switchToPartner = useCallback(() => {
    if (partnerInfo) setViewingPartner(true)
  }, [partnerInfo])

  const switchToSelf = useCallback(() => setViewingPartner(false), [])

  const value: PartnerContextValue = {
    activeUserId,
    isViewingPartner,
    partnerInfo,
    connectionStatus,
    switchToPartner,
    switchToSelf,
    refreshConnection,
  }

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext)
  if (!ctx) {
    throw new Error('usePartner must be used within PartnerProvider')
  }
  return ctx
}
