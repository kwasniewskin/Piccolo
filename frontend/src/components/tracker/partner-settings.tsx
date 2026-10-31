'use client'

import { useState, useEffect } from 'react'
import { usePartner } from '@/lib/partner-context'
import { useLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/i18n'
import * as api from '@/lib/api'
import { Loader2 } from 'lucide-react'

type GeneratingState = {
  code: string
  expiresAt: string
}

/** Co ile ms sprawdzamy, czy partner wpisał nasz kod. */
const CONNECTION_POLL_INTERVAL_MS = 3000

export function PartnerSettings() {
  const { partnerInfo, connectionStatus, refreshConnection } = usePartner()
  const { language } = useLanguage()
  const t = (key: keyof typeof import('@/lib/i18n').TRANSLATIONS.en) => getTranslation(language, key)

  const [view, setView] = useState<'main' | 'generating' | 'accepting'>('main')
  const [generatingState, setGeneratingState] = useState<GeneratingState | null>(null)
  const [acceptCode, setAcceptCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  // Wejście w sekcję: odśwież status (partner mógł się połączyć, gdy byliśmy gdzie indziej)
  useEffect(() => {
    refreshConnection({ silent: true })
  }, [refreshConnection])

  // Polling, dopóki pokazujemy kod i czekamy na partnera
  useEffect(() => {
    if (view !== 'generating' || !generatingState) return
    const interval = setInterval(() => {
      refreshConnection({ silent: true })
    }, CONNECTION_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [view, generatingState, refreshConnection])

  // Po połączeniu (np. wykrytym przez polling) wyczyść lokalny stan parowania
  useEffect(() => {
    if (connectionStatus !== 'connected') return
    setView('main')
    setGeneratingState(null)
    setAcceptCode('')
    setError(null)
  }, [connectionStatus])

  // Countdown do wygaśnięcia kodu
  useEffect(() => {
    if (!generatingState) return

    const updateCountdown = () => {
      const now = new Date().getTime()
      const expires = new Date(generatingState.expiresAt).getTime()
      const diff = Math.max(0, Math.floor((expires - now) / 1000))
      
      setTimeLeft(diff)
      
      if (diff === 0) {
        setGeneratingState(null)
        setView('main')
        setError(t('partner-code-expired'))
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
    // `t` celowo pomijamy w zależnościach – zmienia się co render, a liczy się tylko kod
  }, [generatingState])

  const handleGenerateCode = async () => {
    setLoading(true)
    setError(null)
    
    const result = await api.generatePairingCode()
    
    if (result) {
      setGeneratingState(result)
      setView('generating')
    } else {
      setError(t('partner-error-generate'))
    }
    
    setLoading(false)
  }

  const handleAcceptCode = async () => {
    if (acceptCode.trim().length !== 6) {
      setError(t('partner-error-invalid-code'))
      return
    }

    setLoading(true)
    setError(null)
    
    const result = await api.acceptPairingCode(acceptCode.trim())
    
    if (result.success) {
      // Ciche odświeżenie: bez migania spinnera; kontekst pokaże toast „Połączono z …”
      await refreshConnection({ silent: true })
      setView('main')
      setAcceptCode('')
    } else {
      // Komunikaty backendu są po polsku – w innych językach pokazujemy ogólny tekst
      setError(language === 'pl' && result.error ? result.error : t('partner-error-accept'))
    }
    
    setLoading(false)
  }

  const handleDisconnect = async () => {
    if (!confirm(t('partner-confirm-disconnect'))) return

    setLoading(true)
    setError(null)
    
    const success = await api.disconnectPartner()
    
    if (success) {
      await refreshConnection({ silent: true })
    } else {
      setError(t('partner-error-disconnect'))
    }
    
    setLoading(false)
  }

  const cancelGenerating = () => {
    setView('main')
    setGeneratingState(null)
    setError(null)
  }

  const switchToAccepting = () => {
    setView('accepting')
    setGeneratingState(null)
    setError(null)
  }

  const switchToGenerating = async () => {
    setAcceptCode('')
    await handleGenerateCode()
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (connectionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Stan: Connected
  if (connectionStatus === 'connected' && partnerInfo) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-2xl bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('connected-with')}</h3>
          <p className="mt-1 text-lg font-bold">{partnerInfo.name || partnerInfo.email}</p>
          {partnerInfo.name && partnerInfo.email && (
            <p className="text-sm text-muted-foreground">{partnerInfo.email}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('partner-connected-since')}{' '}
            {new Date(partnerInfo.connectedAt).toLocaleDateString(language === 'pl' ? 'pl-PL' : 'en-GB')}
          </p>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleDisconnect}
          disabled={loading}
          className="rounded-2xl bg-destructive/10 py-4 text-base font-bold text-destructive transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 className="mx-auto size-5 animate-spin" /> : t('disconnect')}
        </button>
      </div>
    )
  }

  // Stan: Generating code
  if (view === 'generating' && generatingState) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-2xl bg-card p-6 text-center">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('pairing-code')}</h3>
          <p className="mt-4 font-heading text-5xl font-bold tracking-widest tabular-nums select-all">
            {generatingState.code}
          </p>
          {timeLeft !== null && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t('partner-code-expires')}: <span className="font-semibold tabular-nums">{formatTime(timeLeft)}</span>
            </p>
          )}
        </div>

        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
        >
          <Loader2 className="size-4 animate-spin" />
          <span>{t('partner-waiting')}</span>
        </div>

        <p className="px-2 text-center text-sm text-muted-foreground">
          {t('partner-share-code')}
        </p>

        <button
          type="button"
          onClick={switchToAccepting}
          className="rounded-2xl bg-secondary py-4 text-base font-bold transition-opacity hover:opacity-90"
        >
          {t('partner-have-code')}
        </button>

        <button
          type="button"
          onClick={cancelGenerating}
          className="py-2 text-sm font-semibold text-muted-foreground transition-opacity hover:opacity-80"
        >
          {t('cancel')}
        </button>
      </div>
    )
  }

  // Stan: Accepting code
  if (view === 'accepting') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-2xl bg-card p-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-muted-foreground">{t('enter-code')}</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="rounded-2xl bg-background px-4 py-3 text-center font-heading text-3xl font-bold tracking-widest tabular-nums outline-none focus:outline-2 focus:outline-ring"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleAcceptCode}
          disabled={loading || acceptCode.length !== 6}
          className="rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 className="mx-auto size-5 animate-spin" /> : t('connect-partner')}
        </button>

        <button
          type="button"
          onClick={switchToGenerating}
          disabled={loading}
          className="rounded-2xl bg-secondary py-4 text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t('partner-generate-own')}
        </button>

        <button
          type="button"
          onClick={() => {
            setView('main')
            setAcceptCode('')
            setError(null)
          }}
          className="py-2 text-sm font-semibold text-muted-foreground transition-opacity hover:opacity-80"
        >
          {t('cancel')}
        </button>
      </div>
    )
  }

  // Stan: Main (none)
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="px-2 text-center text-sm text-muted-foreground">
        {t('partner-intro')}
      </p>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerateCode}
        disabled={loading}
        className="rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {loading ? <Loader2 className="mx-auto size-5 animate-spin" /> : t('generate-pairing-code')}
      </button>

      <div className="relative flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground">{t('or')}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => setView('accepting')}
        disabled={loading}
        className="rounded-2xl bg-secondary py-4 text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {t('enter-partner-code')}
      </button>
    </div>
  )
}

