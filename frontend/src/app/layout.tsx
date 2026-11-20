import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Manrope } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope' })
const bricolage = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], variable: '--font-bricolage' })

export const metadata: Metadata = {
  title: 'Piccolo – Calorie & Macro Diary',
  description: 'A simple, intuitive calorie and macro tracker.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Piccolo',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  // The app uses a dark theme; set it explicitly so browsers adapt system UI (e.g. mobile address bar).
  colorScheme: 'dark',
  themeColor: '#1d2028',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${bricolage.variable} bg-background`}>
      <body className="font-sans antialiased">
          <ClerkProvider>
            {children}
            <Toaster position="top-center" theme="dark" richColors />
          </ClerkProvider>
      </body>
    </html>
  )
}