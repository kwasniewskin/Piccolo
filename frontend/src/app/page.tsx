import { CalorieTracker } from '@/components/tracker/calorie-tracker'
import { LanguageProvider } from '@/lib/language-context'
import { PartnerProvider } from '@/lib/partner-context'

export default function Page() {
  return (
    <LanguageProvider>
      <PartnerProvider>
        <CalorieTracker />
      </PartnerProvider>
    </LanguageProvider>
  )
}
