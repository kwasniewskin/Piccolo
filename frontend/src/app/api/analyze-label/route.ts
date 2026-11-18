import { NextRequest, NextResponse } from 'next/server';
import { AiProviderError, callVisionJsonModel } from '@/lib/ai-provider';

const LABEL_SYSTEM_PROMPT =
  "Jesteś asystentem dietetycznym. Przeanalizuj przesłane zdjęcia opakowania produktu. Zwróć TYLKO czysty obiekt JSON bez znaczników markdown. Klucze do wypełnienia (jeśli znajdziesz): name (string), manufacturer (string), barcode (string - ciąg cyfr pod kodem kreskowym), weight (number - wyciągnij same gramy/mililitry), ingredients (string - pełny skład), calories (number), protein (number), fat (number), saturatedFat (number), carbs (number), sugars (number), fiber (number), salt (number). Dla makroskładników używaj wartości na 100g. Jeśli jakiejś informacji nie ma na zdjęciach, dla tekstów zwróć pusty string '', a dla liczb 0.";

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'Brak obrazów w żądaniu' },
        { status: 400 }
      );
    }

    const { data: nutritionData } = await callVisionJsonModel<Record<string, unknown>>({
      systemPrompt: LABEL_SYSTEM_PROMPT,
      userText: 'Przeanalizuj zdjęcia opakowania produktu i wyciągnij wszystkie dostępne informacje.',
      images,
      preferredProvider: 'openai',
      preferFlagship: false,
      maxTokens: 1000,
    });

    // Walidacja struktury - sprawdź przynajmniej podstawowe pola
    const numericFields = ['calories', 'protein', 'fat', 'saturatedFat', 'carbs', 'sugars', 'fiber', 'salt'];
    const textFields = ['name', 'manufacturer', 'ingredients'];

    // Upewnij się, że wszystkie pola numeryczne są liczbami
    numericFields.forEach((field) => {
      if (!(field in nutritionData) || nutritionData[field] == null) {
        nutritionData[field] = 0;
      }
    });

    // Upewnij się, że pola tekstowe są stringami
    textFields.forEach((field) => {
      if (!(field in nutritionData) || nutritionData[field] == null) {
        nutritionData[field] = '';
      }
    });

    // Upewnij się, że weight jest liczbą
    if (!('weight' in nutritionData) || nutritionData.weight == null) {
      nutritionData.weight = 0;
    }

    return NextResponse.json(nutritionData);
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('Analyze label error:', error);
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    );
  }
}
