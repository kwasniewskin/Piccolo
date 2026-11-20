'use client'

import { useZxing } from 'react-zxing'
import { X, CameraOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useOptionalLanguage } from '@/lib/language-context'
import { getTranslation } from '@/lib/i18n'

type Props = {
  onScan: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const { language } = useOptionalLanguage()
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key)
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const { ref } = useZxing({
    onDecodeResult(result) {
      // Prevent duplicate triggers for the same scanned barcode
      if (scannedRef.current) return
      scannedRef.current = true

      const barcode = result.rawValue
      console.log('[BarcodeScanner] Code detected:', barcode)

      // Tactile vibration on successful scan when supported
      if ('vibrate' in navigator) {
        navigator.vibrate(200)
      }

      onScan(barcode)
    },
    onError(err) {
      console.error('[BarcodeScanner] Camera error:', err)
      const message = err instanceof Error ? err.message : t('camera-permission-error')
      setError(message)
    },
  })

  // Animate red scanner guide line while camera is active
  useEffect(() => {
    if (error) return

    const line = document.getElementById('scanner-line')
    if (!line) return

    let position = 0
    let direction = 1

    const animate = () => {
      position += direction * 2
      if (position >= 100 || position <= 0) {
        direction *= -1
      }
      line.style.top = `${position}%`
    }

    const interval = setInterval(animate, 20)
    return () => clearInterval(interval)
  }, [error])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Camera video stream */}
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform active:scale-95"
        aria-label={t('close-scanner')}
      >
        <X size={24} />
      </button>

      {error ? (
        /* Camera permission / error state */
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-6">
          <div className="flex max-w-md flex-col items-center text-center">
            {/* Crossed-out camera icon */}
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
              <CameraOff size={40} className="text-red-500" />
            </div>

            {/* Error heading */}
            <h2 className="mb-4 text-2xl font-bold text-white">
              {t('camera-access-denied')}
            </h2>

            {/* Troubleshooting checklist */}
            <div className="mb-6 space-y-3 text-left text-white/90">
              <p className="text-sm font-medium">{t('make-sure-that')}</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>{t('camera-check-https')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>{t('camera-check-permission')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>{t('camera-check-in-use')}</span>
                </li>
              </ul>
            </div>

            {/* Technical error detail */}
            <p className="mb-6 text-xs text-white/60">
              {t('error-prefix')} {error}
            </p>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-red-500 px-6 py-3 font-semibold text-white transition-transform active:scale-95"
            >
              {t('close')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Dimmed overlay with centered scanner cutout */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Dimmed backdrop */}
            <div className="absolute inset-0 bg-black/60" />

            {/* Scanner reticle box */}
            <div className="relative z-10 flex h-64 w-64 items-center justify-center">
              {/* Frame corner brackets */}
              <div className="absolute inset-0 rounded-2xl border-2 border-transparent">
                {/* Top-left corner */}
                <div className="absolute left-0 top-0 h-12 w-12 border-l-4 border-t-4 border-white rounded-tl-2xl" />
                {/* Top-right corner */}
                <div className="absolute right-0 top-0 h-12 w-12 border-r-4 border-t-4 border-white rounded-tr-2xl" />
                {/* Bottom-left corner */}
                <div className="absolute bottom-0 left-0 h-12 w-12 border-b-4 border-l-4 border-white rounded-bl-2xl" />
                {/* Bottom-right corner */}
                <div className="absolute bottom-0 right-0 h-12 w-12 border-b-4 border-r-4 border-white rounded-br-2xl" />
              </div>

              {/* Animated red scan line */}
              <div
                id="scanner-line"
                className="absolute h-0.5 w-full bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                style={{ top: '0%' }}
              />
            </div>
          </div>

          {/* Scan instructions */}
          <div className="absolute bottom-8 left-0 right-0 z-20 text-center">
            <p className="text-lg font-medium text-white drop-shadow-lg">
              {t('scan-barcode-title')}
            </p>
            <p className="mt-1 text-sm text-white/80 drop-shadow-lg">
              {t('scan-barcode-subtitle')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
