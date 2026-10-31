export type Language = 'en' | 'pl'

export const TRANSLATIONS = {
  en: {
    // Meals
    breakfast: 'Breakfast',
    'second-breakfast': 'Second breakfast',
    lunch: 'Lunch',
    snack: 'Snack',
    dinner: 'Dinner',
    
    // Common
    kcal: 'kcal',
    protein: 'Protein',
    fat: 'Fat',
    carbs: 'Carbs',
    calories: 'Calories',
    
    // Macro short codes
    'protein-short': 'P',
    'fat-short': 'F',
    'carbs-short': 'C',
    
    // UI
    'no-foods-logged': 'No foods logged yet.',
    'add-food-to': 'Add food to',
    'remove': 'Remove',
    'calories-left': 'Calories left',
    'of': 'of',
    
    // Settings - sections
    'settings': 'Settings',
    'calories-macros': 'Calories & Macros',
    'account': 'Account',
    'progress-stats': 'Progress & Stats',
    'appearance': 'Appearance',
    'notifications': 'Notifications',
    'export-data': 'Export Data',
    'about': 'About',
    
    // Settings - form
    'save-goals': 'Save goals',
    'macros-total': 'Macros total',
    'macros-exceed': 'Macros exceed your calorie limit by',
    'enter-valid-number': 'Enter a valid number in every field.',
    'language': 'Language',
    'select-language': 'Select language',
    
    // Date navigation
    'previous-week': 'Previous week',
    'next-week': 'Next week',
    
    // Partner Sync
    'partner-sync': 'Partner Sync',
    'connect-partner': 'Connect with Partner',
    'pairing-code': 'Pairing Code',
    'enter-code': 'Enter Partner\'s Code',
    'connected-with': 'Connected with',
    'disconnect': 'Disconnect',
    'my-diary': 'My Diary',
    'partner-diary': 'Partner\'s Diary',
    'added-by': 'Added by',
    'partner-intro': 'Connect with your partner to share diaries and help each other track meals.',
    'generate-pairing-code': 'Generate Pairing Code',
    'enter-partner-code': 'Enter Partner Code',
    'partner-share-code': 'Share this code with your partner. They have 15 minutes to enter it.',
    'partner-code-expires': 'Expires in',
    'partner-connected-since': 'Connected since',
    'partner-confirm-disconnect': 'Are you sure you want to disconnect from your partner?',
    'partner-error-generate': 'Failed to generate pairing code. Please try again.',
    'partner-error-accept': 'Failed to connect. The code may be invalid or expired.',
    'partner-error-invalid-code': 'Please enter a valid 6-digit code.',
    'partner-error-disconnect': 'Failed to disconnect. Please try again.',
    'cancel': 'Cancel',
    'or': 'or',
    'partner-connection-lost': 'Connection with your partner was lost. Showing your diary.',
    'partner-connected-toast': 'Connected with',
    'partner-waiting': 'Waiting for your partner to enter the code…',
    'partner-have-code': 'I have my partner\'s code',
    'partner-generate-own': 'Generate my own code instead',
    'partner-code-expired': 'The pairing code has expired. Generate a new one.',
    'viewing-partner-diary': 'You are viewing your partner\'s diary. New entries go to their diary.',
    'you': 'you',
    'partner': 'partner',
  },
  pl: {
    // Meals
    breakfast: 'Śniadanie',
    'second-breakfast': 'Drugie śniadanie',
    lunch: 'Obiad',
    snack: 'Przekąska',
    dinner: 'Kolacja',
    
    // Common
    kcal: 'kcal',
    protein: 'Białko',
    fat: 'Tłuszcze',
    carbs: 'Węglowodany',
    calories: 'Kalorie',
    
    // Macro short codes
    'protein-short': 'B',
    'fat-short': 'T',
    'carbs-short': 'W',
    
    // UI
    'no-foods-logged': 'Brak dodanych produktów.',
    'add-food-to': 'Dodaj do',
    'remove': 'Usuń',
    'calories-left': 'Pozostało kalorii',
    'of': 'z',
    
    // Settings - sections
    'settings': 'Ustawienia',
    'calories-macros': 'Kalorie i Makro',
    'account': 'Konto',
    'progress-stats': 'Postępy i Statystyki',
    'appearance': 'Wygląd',
    'notifications': 'Powiadomienia',
    'export-data': 'Eksport Danych',
    'about': 'O aplikacji',
    
    // Settings - form
    'save-goals': 'Zapisz cele',
    'macros-total': 'Suma makro',
    'macros-exceed': 'Makroskładniki przekraczają limit kalorii o',
    'enter-valid-number': 'Wprowadź prawidłową wartość we wszystkich polach.',
    'language': 'Język',
    'select-language': 'Wybierz język',
    
    // Date navigation
    'previous-week': 'Poprzedni tydzień',
    'next-week': 'Następny tydzień',
    
    // Partner Sync
    'partner-sync': 'Synchronizacja z Partnerem',
    'connect-partner': 'Połącz z Partnerem',
    'pairing-code': 'Kod Parowania',
    'enter-code': 'Wprowadź Kod Partnera',
    'connected-with': 'Połączono z',
    'disconnect': 'Rozłącz',
    'my-diary': 'Mój Dziennik',
    'partner-diary': 'Dziennik Partnera',
    'added-by': 'Dodane przez',
    'partner-intro': 'Połącz się z partnerem aby wspólnie śledzić posiłki i pomagać sobie nawzajem.',
    'generate-pairing-code': 'Wygeneruj Kod Parowania',
    'enter-partner-code': 'Wprowadź Kod Partnera',
    'partner-share-code': 'Przekaż ten kod partnerowi. Kod jest ważny przez 15 minut.',
    'partner-code-expires': 'Wygasa za',
    'partner-connected-since': 'Połączono',
    'partner-confirm-disconnect': 'Czy na pewno chcesz rozłączyć się z partnerem?',
    'partner-error-generate': 'Nie udało się wygenerować kodu. Spróbuj ponownie.',
    'partner-error-accept': 'Nie udało się połączyć. Kod może być nieprawidłowy lub wygasł.',
    'partner-error-invalid-code': 'Wprowadź prawidłowy 6-cyfrowy kod.',
    'partner-error-disconnect': 'Nie udało się rozłączyć. Spróbuj ponownie.',
    'cancel': 'Anuluj',
    'or': 'lub',
    'partner-connection-lost': 'Utracono połączenie z partnerem. Wyświetlam Twój dziennik.',
    'partner-connected-toast': 'Połączono z',
    'partner-waiting': 'Oczekiwanie na połączenie od partnera…',
    'partner-have-code': 'Mam kod od partnera',
    'partner-generate-own': 'Wygeneruj własny kod',
    'partner-code-expired': 'Kod parowania wygasł. Wygeneruj nowy.',
    'viewing-partner-diary': 'Przeglądasz dziennik partnera. Nowe wpisy trafią do jego dziennika.',
    'you': 'Ciebie',
    'partner': 'partnera',
  },
} as const

export function getTranslation(lang: Language, key: keyof typeof TRANSLATIONS.en): string {
  return TRANSLATIONS[lang][key]
}

export function getMealLabel(lang: Language, mealId: string): string {
  const key = mealId as keyof typeof TRANSLATIONS.en
  return TRANSLATIONS[lang][key] || mealId
}

/**
 * Zwraca locale string dla Date API na podstawie wybranego języka
 */
export function getLocale(lang: Language): string {
  return lang === 'pl' ? 'pl-PL' : 'en-GB'
}
