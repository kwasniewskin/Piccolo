import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'Brak obrazów w żądaniu' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OPENAI_API_KEY nie jest ustawiony');
      return NextResponse.json(
        { error: 'Błąd konfiguracji serwera' },
        { status: 500 }
      );
    }

    // Wywołanie OpenAI Vision API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Jesteś asystentem dietetycznym. Przeanalizuj przesłane zdjęcia opakowania produktu. Zwróć TYLKO czysty obiekt JSON bez znaczników markdown. Klucze do wypełnienia (jeśli znajdziesz): name (string), manufacturer (string), barcode (string - ciąg cyfr pod kodem kreskowym), weight (number - wyciągnij same gramy/mililitry), ingredients (string - pełny skład), calories (number), protein (number), fat (number), saturatedFat (number), carbs (number), sugars (number), fiber (number), salt (number). Dla makroskładników używaj wartości na 100g. Jeśli jakiejś informacji nie ma na zdjęciach, dla tekstów zwróć pusty string \'\', a dla liczb 0.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Przeanalizuj zdjęcia opakowania produktu i wyciągnij wszystkie dostępne informacje.',
              },
              ...images.map((imageBase64: string) => ({
                type: 'image_url',
                image_url: {
                  url: imageBase64,
                },
              })),
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return NextResponse.json(
        { error: 'Błąd podczas analizy obrazu' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'Brak odpowiedzi z API' },
        { status: 500 }
      );
    }

    // Parsowanie JSON z odpowiedzi
    try {
      // Usuń ewentualne znaczniki markdown
      const cleanedContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const nutritionData = JSON.parse(cleanedContent);

      // Walidacja struktury - sprawdź przynajmniej podstawowe pola
      const numericFields = ['calories', 'protein', 'fat', 'saturatedFat', 'carbs', 'sugars', 'fiber', 'salt'];
      const textFields = ['name', 'manufacturer', 'ingredients'];
      
      // Upewnij się, że wszystkie pola numeryczne są liczbami
      numericFields.forEach(field => {
        if (!(field in nutritionData)) {
          nutritionData[field] = 0;
        }
      });

      // Upewnij się, że pola tekstowe są stringami
      textFields.forEach(field => {
        if (!(field in nutritionData)) {
          nutritionData[field] = '';
        }
      });

      // Upewnij się, że weight jest liczbą
      if (!('weight' in nutritionData)) {
        nutritionData.weight = 0;
      }

      return NextResponse.json(nutritionData);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError, 'Content:', content);
      return NextResponse.json(
        { error: 'Błąd parsowania odpowiedzi z API' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Analyze label error:', error);
    return NextResponse.json(
      { error: 'Wewnętrzny błąd serwera' },
      { status: 500 }
    );
  }
}
