# PWA Installation Guide

## How to Install Piccolo on Mobile

### iOS (Safari)
1. Open the app in Safari
2. Tap the **Share** button in the bottom toolbar
3. Scroll down and tap **"Add to Home Screen"**
4. Optionally customize the app name (default: `"Piccolo"`)
5. Tap **"Add"**

Piccolo will appear on your Home Screen and launch in standalone mode without browser chrome.

### Android (Chrome)
1. Open the app in Chrome
2. Tap the **"Add to Home Screen"** / **"Install app"** prompt when displayed

   *Or manually:*
   - Open the browser menu (`⋮`) in the top-right corner
   - Tap **"Add to Home Screen"** or **"Install app"**
3. Confirm installation

The app opens in standalone mode without an address bar or browser navigation controls.

## Implemented PWA Configuration

- **Web App Manifest** (`public/manifest.json`):
  - `display: "standalone"`
  - App icons and dark-theme surface colors
  - Portrait orientation lock for mobile ergonomics
- **Next.js Viewport & Meta Tags** (`app/layout.tsx`):
  - Apple web-app capable configuration
  - `viewportFit: cover` support for notched displays
  - Dark `themeColor` matching the application palette
- **Mobile Polish**:
  - Disabled accidental pinch-zoom (`maximumScale: 1, userScalable: false`)
  - Full-bleed edge-to-edge layout without white flashbars

## Verification

1. Run the LAN dev server (`npm run dev:lan`) or production build (`npm run build && npm start`)
2. Open the app on your phone
3. Install to the Home Screen using the steps above and verify standalone launch
