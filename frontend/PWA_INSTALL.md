# PWA Installation Guide / Instrukcja instalacji PWA

## Jak zainstalować Piccolo jako aplikację mobilną

### iOS (Safari)
1. Otwórz stronę w przeglądarce Safari
2. Kliknij przycisk **Udostępnij** (kwadrat ze strzałką w dół) na dolnym pasku
3. Przewiń w dół i wybierz **"Dodaj do ekranu głównego"**
4. Możesz zmienić nazwę aplikacji (domyślnie "Piccolo")
5. Kliknij **"Dodaj"**

Aplikacja pojawi się na ekranie głównym jako ikona i uruchomi się **bez paska przeglądarki** w trybie pełnoekranowym.

### Android (Chrome)
1. Otwórz stronę w przeglądarce Chrome
2. Chrome automatycznie wyświetli banner **"Dodaj do ekranu głównego"** - kliknij go
   
   *Alternatywnie:*
   - Kliknij menu (trzy kropki ⋮) w prawym górnym rogu
   - Wybierz **"Dodaj do ekranu głównego"** lub **"Zainstaluj aplikację"**
3. Potwierdź instalację

Aplikacja uruchomi się w trybie standalone **bez paska adresu i przycisków przeglądarki**.

## Co zostało zaimplementowane

✅ **PWA Manifest** (`public/manifest.json`)
- Tryb `standalone` - aplikacja działa bez paska przeglądarki
- Ikony i kolory dopasowane do aplikacji
- Orientacja pionowa zablokowana dla lepszego UX

✅ **Ukryty overlay z błędami Next.js**
- Dodano CSS w `globals.css` ukrywający kafelek z błędami
- Wyłączono `reactStrictMode` w konfiguracji Next.js
- Wyłączono wskaźniki deweloperskie

✅ **Meta tagi dla PWA**
- `apple-web-app-capable` - iOS rozpoznaje jako aplikację
- `viewport` z właściwymi ustawieniami dla mobile
- `theme-color` dopasowany do ciemnego motywu
- `viewportFit: cover` - obsługa iPhone'ów z notchem

✅ **Optymalizacje mobile**
- Zablokowany zoom (`maximumScale: 1, userScalable: false`)
- Pełny ekran bez białych pasków
- Dopasowany kolor paska statusu

## Testowanie

Po uruchomieniu dev servera (`npm run dev:lan`):
1. Otwórz aplikację na telefonie pod adresem z konsoli (np. `http://192.168.100.5:3000`)
2. Kafelek z błędami **nie powinien się już wyświetlać**
3. Dodaj stronę do ekranu głównego (instrukcje powyżej)
4. Uruchom z ikony - aplikacja otworzy się **bez paska przeglądarki**

## Uwagi
- W trybie development nadal mogą pojawić się błędy w konsoli przeglądarki (F12), ale overlay jest ukryty
- Po produkcyjnym buildzie (`npm run build && npm start`) wszystkie błędy deweloperskie znikną całkowicie
