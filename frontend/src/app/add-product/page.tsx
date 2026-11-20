'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductForm, { ProductFormData } from '@/components/ProductForm';
import { getTranslation } from '@/lib/i18n';
import { useOptionalLanguage } from '@/lib/language-context';

function AddProductPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const mealType = searchParams.get('mealType');
  const date = searchParams.get('date');

  const handleSave = (data: ProductFormData) => {
    console.log('Saved product:', data);
  };

  const handleCancel = () => {
    // If meal context is present, return to main diary and reopen add sheet
    if (mealType && date) {
      router.push(`/?mealType=${mealType}&date=${date}&openAddFood=true`);
    } else {
      router.back();
    }
  };

  return (
    <ProductForm
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}

export default function AddProductPage() {
  const { language } = useOptionalLanguage();
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-background px-4 py-6 flex items-center justify-center">{getTranslation(language, 'loading')}</div>}>
      <AddProductPageContent />
    </Suspense>
  );
}
