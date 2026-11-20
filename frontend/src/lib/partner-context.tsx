'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import * as api from './api'
import { useLanguage } from './language-context'
import { getTranslation } from './i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PartnerInfo = {
  /** Internal partner user ID in the backend (int). */
  userId: number
  name: string | null
  email: string | null
  connectedAt: string
}

export type ConnectionStatus = 'none' | 'connected' | 'loading'

export type RefreshOptions = {
  /**
   * Silent refresh (polling, tab focus): skips 'loading' status
   * so the UI does not flash a spinner and transient network errors do not clear state.
   */
  silent?: boolean
}

type PartnerContextValue = {
  /**
   * ID of the currently viewed diary passed as `targetUserId`.
   * `undefined` = own diary (the backend resolves the authenticated user).
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
  // In-memory only: refreshing the page always returns to the user's own diary.
  const [viewingPartner, setViewingPartner] = useState(false)

  const isViewingPartner = viewingPartner && partnerInfo !== null
  const activeUserId = isViewingPartner ? partnerInfo!.userId : undefined

  // Last known connection status (excluding 'loading') to detect none -> connected transitions.
  // null = unknown on initial mount (suppresses toast on initial login fetch).
  const lastKnownStatusRef = useRef<'none' | 'connected' | null>(null)
  const inFlightRef = useRef(false)
  const languageRef = useRef(language)
  languageRef.current = language

  const refreshConnection = useCallback(async (options?: RefreshOptions) => {
    const silent = options?.silent ?? false
    // Polling and window focus can overlap - prevent concurrent background requests
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
      // Silent refresh: preserve previous state (transient network error != disconnect).
      // Full refresh: avoid leaving the spinner stuck indefinitely.
      if (!silent) {
        setConnectionStatus(lastKnownStatusRef.current ?? 'none')
      }
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // Fetch partner connection status after sign-in
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

  // Re-check status on tab/window focus in case the partner paired or disconnected
  // elsewhere (otherwise the other person wouldn't see changes until a full reload).
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

  // 403 from diary API -> switch back to own diary and show toast
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

  // Color shift: set data attribute on <html> so React portals (dialogs, toasts) inherit it too
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
