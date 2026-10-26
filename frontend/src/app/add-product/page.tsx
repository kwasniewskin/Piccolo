'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import ProductForm, { ProductFormData } from '@/components/ProductForm';

export default function AddProductPage() {
  const router = useRouter();

  const handleSave = (data: ProductFormData) => {
    console.log('Zapisano produkt:', data);
    // TODO: Wysłać dane do API
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ProductForm
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
