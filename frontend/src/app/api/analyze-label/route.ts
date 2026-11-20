import { NextRequest, NextResponse } from 'next/server';
import { AiProviderError, callVisionJsonModel } from '@/lib/ai-provider';

const LABEL_SYSTEM_PROMPT =
  "You are a nutrition assistant. Analyze the provided product packaging images and return ONLY a raw JSON object with no markdown fences. Fill these keys when visible: name (string), manufacturer (string), barcode (string - digit sequence beneath the barcode), weight (number - numeric grams or milliliters only), ingredients (string - full ingredient list), calories (number), protein (number), fat (number), saturatedFat (number), carbs (number), sugars (number), fiber (number), salt (number). Use nutrition values per 100g. If a field is missing from the images, return '' for text fields and 0 for numbers.";

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided in request' },
        { status: 400 }
      );
    }

    const { data: nutritionData } = await callVisionJsonModel<Record<string, unknown>>({
      systemPrompt: LABEL_SYSTEM_PROMPT,
      userText: 'Analyze the product packaging photos and extract all available nutrition and label details.',
      images,
      preferredProvider: 'openai',
      preferFlagship: false,
      maxTokens: 1000,
    });

    // Validate structure - ensure baseline nutrition and metadata fields exist
    const numericFields = ['calories', 'protein', 'fat', 'saturatedFat', 'carbs', 'sugars', 'fiber', 'salt'];
    const textFields = ['name', 'manufacturer', 'ingredients'];

    // Ensure all numeric fields default to 0 when missing
    numericFields.forEach((field) => {
      if (!(field in nutritionData) || nutritionData[field] == null) {
        nutritionData[field] = 0;
      }
    });

    // Ensure all text fields default to an empty string when missing
    textFields.forEach((field) => {
      if (!(field in nutritionData) || nutritionData[field] == null) {
        nutritionData[field] = '';
      }
    });

    // Ensure weight is numeric
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
