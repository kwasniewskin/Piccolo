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
