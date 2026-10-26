'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductForm, { ProductFormData } from '@/components/ProductForm';

function AddProductPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const mealType = searchParams.get('mealType');
  const date = searchParams.get('date');

  const handleSave = (data: ProductFormData) => {
    console.log('Zapisano produkt:', data);
    // TODO: Wysłać dane do API
  };

  const handleCancel = () => {
    // Jeśli mamy kontekst posiłku, wróć do głównej z otwartym modalem
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
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-background px-4 py-6 flex items-center justify-center">Ładowanie...</div>}>
      <AddProductPageContent />
    </Suspense>
  );
}
