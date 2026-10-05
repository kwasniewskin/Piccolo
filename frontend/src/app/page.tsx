import { CalorieTracker } from '@/components/tracker/calorie-tracker'
import { LanguageProvider } from '@/lib/language-context'

export default function Page() {
  return (
    <LanguageProvider>
      <CalorieTracker />
    </LanguageProvider>
  )
}
