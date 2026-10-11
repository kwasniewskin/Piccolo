'use client'

import { useZxing } from 'react-zxing'
import { X, CameraOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  onScan: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const { ref } = useZxing({
    onDecodeResult(result) {
      // Zapobiegnij wielokrotnemu skanowaniu tego samego kodu
      if (scannedRef.current) return
      scannedRef.current = true

      const barcode = result.rawValue
      console.log('[BarcodeScanner] Code detected:', barcode)

      // Wibracja przy udanym skanowaniu (jak w prawdziwym skanerze)
      if ('vibrate' in navigator) {
        navigator.vibrate(200)
      }

      onScan(barcode)
    },
    onError(err) {
      console.error('[BarcodeScanner] Camera error:', err)
      const message = err instanceof Error ? err.message : 'Nie można uzyskać dostępu do kamery'
      setError(message)
    },
  })

  // Animacja czerwonej linii skanera (tylko gdy nie ma błędu)
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
      {/* Video z kamery */}
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />

      {/* Przycisk zamknięcia */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform active:scale-95"
        aria-label="Zamknij skaner"
      >
        <X size={24} />
      </button>

      {error ? (
        /* Komunikat o błędzie */
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-6">
          <div className="flex max-w-md flex-col items-center text-center">
            {/* Ikona aparatu przekreślonego */}
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
              <CameraOff size={40} className="text-red-500" />
            </div>

            {/* Tytuł błędu */}
            <h2 className="mb-4 text-2xl font-bold text-white">
              Brak dostępu do aparatu
            </h2>

            {/* Opis problemu */}
            <div className="mb-6 space-y-3 text-left text-white/90">
              <p className="text-sm font-medium">Upewnij się, że:</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>Strona ma bezpieczne połączenie (HTTPS)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>Nadałeś uprawnienia do kamery w przeglądarce</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>Kamera nie jest używana przez inną aplikację</span>
                </li>
              </ul>
            </div>

            {/* Szczegóły techniczne */}
            <p className="mb-6 text-xs text-white/60">
              Błąd: {error}
            </p>

            {/* Przycisk zamknięcia */}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-red-500 px-6 py-3 font-semibold text-white transition-transform active:scale-95"
            >
              Zamknij
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Overlay z przyciemnieniem i okienkiem skanera */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Przyciemnione tło wokół */}
            <div className="absolute inset-0 bg-black/60" />

            {/* Okienko skanera */}
            <div className="relative z-10 flex h-64 w-64 items-center justify-center">
              {/* Rogi ramki */}
              <div className="absolute inset-0 rounded-2xl border-2 border-transparent">
                {/* Lewy górny róg */}
                <div className="absolute left-0 top-0 h-12 w-12 border-l-4 border-t-4 border-white rounded-tl-2xl" />
                {/* Prawy górny róg */}
                <div className="absolute right-0 top-0 h-12 w-12 border-r-4 border-t-4 border-white rounded-tr-2xl" />
                {/* Lewy dolny róg */}
                <div className="absolute bottom-0 left-0 h-12 w-12 border-b-4 border-l-4 border-white rounded-bl-2xl" />
                {/* Prawy dolny róg */}
                <div className="absolute bottom-0 right-0 h-12 w-12 border-b-4 border-r-4 border-white rounded-br-2xl" />
              </div>

              {/* Animowana czerwona linia skanera */}
              <div
                id="scanner-line"
                className="absolute h-0.5 w-full bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                style={{ top: '0%' }}
              />
            </div>
          </div>

          {/* Instrukcja */}
          <div className="absolute bottom-8 left-0 right-0 z-20 text-center">
            <p className="text-lg font-medium text-white drop-shadow-lg">
              Zeskanuj kod kreskowy produktu
            </p>
            <p className="mt-1 text-sm text-white/80 drop-shadow-lg">
              Umieść kod w ramce powyżej
            </p>
          </div>
        </>
      )}
    </div>
  )
}
