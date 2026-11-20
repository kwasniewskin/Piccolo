'use client';

import React, { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { getTranslation } from '@/lib/i18n';
import { useOptionalLanguage } from '@/lib/language-context';

interface ProductFormProps {
  barcode?: string;
  initialData?: {
    name?: string;
    calories?: number;
    protein?: number;
    fat?: number;
    saturatedFat?: number;
    carbs?: number;
    sugars?: number;
    fiber?: number;
    salt?: number;
    packageWeight?: number;
    defaultServing?: number;
  };
  onSave?: (data: ProductFormData) => void;
  onCancel?: () => void;
}

export interface ProductFormData {
  barcode?: string;
  name: string;
  manufacturer?: string;
  calories: string | number;
  protein: string | number;
  fat: string | number;
  saturatedFat: string | number;
  carbs: string | number;
  sugars: string | number;
  fiber: string | number;
  salt: string | number;
  packageWeight: string | number;
  defaultServing: string | number;
  ingredients?: string;
  units?: Array<{ unitKey: string; gramsPerUnit: number }>;
}

function ProductFormContent({
  barcode: propsBarcode,
  initialData,
  onSave,
  onCancel,
}: ProductFormProps) {
  const { language } = useOptionalLanguage();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const router = useRouter();
  const searchParams = useSearchParams();
  const barcodeFromUrl = searchParams?.get('barcode') || '';
  const finalBarcode = propsBarcode || barcodeFromUrl;

  const [formData, setFormData] = useState<ProductFormData>({
    barcode: finalBarcode || '',
    name: initialData?.name || '',
    manufacturer: '',
    calories: initialData?.calories || '',
    protein: initialData?.protein || '',
    fat: initialData?.fat || '',
    saturatedFat: initialData?.saturatedFat || '',
    carbs: initialData?.carbs || '',
    sugars: initialData?.sugars || '',
    fiber: initialData?.fiber || '',
    salt: initialData?.salt || '',
    packageWeight: initialData?.packageWeight || '',
    defaultServing: initialData?.defaultServing || '',
    ingredients: '',
    units: [],
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingProductId, setExistingProductId] = useState<number | string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for existing barcode when opened with barcode URL parameter
  React.useEffect(() => {
    if (finalBarcode) {
      checkBarcodeDuplicate(finalBarcode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Store text fields directly
    if (name === 'name' || name === 'barcode' || name === 'manufacturer' || name === 'ingredients') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    } else {
      // Keep empty string for cleared numeric fields instead of coercing to 0
      setFormData(prev => ({
        ...prev,
        [name]: value === '' ? '' : value,
      }));
    }

    // Check for duplicates whenever the barcode field changes
    if (name === 'barcode' && value.trim()) {
      checkBarcodeDuplicate(value.trim());
    }
  };

  const checkBarcodeDuplicate = async (barcode: string) => {
    if (!barcode) return;

    try {
      const response = await fetch(`${API_BASE}/products/barcode/${encodeURIComponent(barcode)}?lang=${encodeURIComponent(language)}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const product = await response.json();
        
        // Product already exists in DB - prefill the form from backend fields
        setExistingProductId(product.id);
        setFormData({
          barcode: product.barcode || '',
          name: product.name || '',
          manufacturer: product.manufacturer || '',
          calories: product.caloriesPer100g || '',
          protein: product.proteinPer100g || '',
          fat: product.fatPer100g || '',
          saturatedFat: product.saturatedFatPer100g || '',
          carbs: product.carbsPer100g || '',
          sugars: product.sugarsPer100g || '',
          fiber: product.fiberPer100g || '',
          salt: product.saltPer100g || '',
          packageWeight: product.packageWeightGrams || '',
          defaultServing: product.defaultServingGrams || '',
          ingredients: product.ingredients || '',
        });
      } else if (response.status === 404) {
        // Product does not exist yet - create new entry
        setExistingProductId(null);
      }
    } catch (error) {
      console.error('Error checking barcode duplicate:', error);
      // Ignore duplicate check failures so manual entry remains unblocked
    }
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsAnalyzing(true);

      // Convert all selected images to base64 data URLs
      const fileReadPromises = Array.from(files).map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const base64Images = await Promise.all(fileReadPromises);
      
      // Use the first image for preview thumbnail
      if (base64Images.length > 0) {
        setImagePreview(base64Images[0]);
      }

      try {
        // Send all images to label analysis API
        const response = await fetch('/api/analyze-label', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ images: base64Images }),
        });

        if (!response.ok) {
          throw new Error('Image analysis failed');
        }

        const productData = await response.json();

        // Update form fields - only fill name, manufacturer, and weight when currently empty
        setFormData(prev => ({
          ...prev,
          name: prev.name || productData.name || '',
          manufacturer: prev.manufacturer || productData.manufacturer || '',
          barcode: !prev.barcode || prev.barcode.trim() === '' ? (productData.barcode || '') : prev.barcode,
          packageWeight: prev.packageWeight || productData.weight || '',
          // Always populate macronutrients and ingredients from label OCR;
          // use ?? so valid zero values are preserved
          calories: productData.calories ?? '',
          protein: productData.protein ?? '',
          fat: productData.fat ?? '',
          saturatedFat: productData.saturatedFat ?? '',
          carbs: productData.carbs ?? '',
          sugars: productData.sugars ?? '',
          fiber: productData.fiber ?? '',
          salt: productData.salt ?? '',
          ingredients: productData.ingredients || '',
        }));

        // Check if detected barcode already exists in database
        if (productData.barcode) {
          checkBarcodeDuplicate(productData.barcode);
        }

        console.log('Label analysis succeeded:', productData);
      } catch (error) {
        console.error('Image analysis error:', error);
        toast.error(t('pf-analyze-error'));
      } finally {
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('File processing error:', error);
      toast.error(t('pf-file-error'));
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || formData.name.trim() === '') {
      toast.error(t('pf-name-required'));
      return;
    }

    setIsSaving(true);

    try {
      // Map form values to backend Product payload
      const productPayload = {
        name: formData.name,
        barcode: formData.barcode || null,
        brand: null, // Brand field is optional and omitted from this form
        manufacturer: formData.manufacturer || null,
        ingredients: formData.ingredients || null,
        caloriesPer100g: Number(formData.calories),
        proteinPer100g: Number(formData.protein),
        fatPer100g: Number(formData.fat),
        saturatedFatPer100g: Number(formData.saturatedFat),
        carbsPer100g: Number(formData.carbs),
        sugarsPer100g: Number(formData.sugars),
        fiberPer100g: Number(formData.fiber),
        saltPer100g: Number(formData.salt),
        packageWeightGrams: Number(formData.packageWeight),
        defaultServingGrams: Number(formData.defaultServing),
        dataSource: 'User',
        imageUrl: null,
        units: formData.units?.filter(u => u.unitKey.trim() && u.gramsPerUnit > 0) || [],
      };

      let response;
      
      if (existingProductId) {
        // Update existing product (PUT)
        response = await fetch(`${API_BASE}/products/${existingProductId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(productPayload),
        });
      } else {
        // Create new product (POST)
        response = await fetch(`${API_BASE}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(productPayload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error saving product:', errorText);
        throw new Error('Failed to save product');
      }

      const savedProduct = await response.json();
      console.log('Product saved successfully:', savedProduct);

      // Invoke onSave callback if provided
      onSave?.(formData);

      // Display success toast
      toast.success(existingProductId ? t('pf-updated-toast') : t('pf-created-toast'));

      // Reset form to initial state
      setFormData({
        barcode: '',
        name: '',
        manufacturer: '',
        calories: '',
        protein: '',
        fat: '',
        saturatedFat: '',
        carbs: '',
        sugars: '',
        fiber: '',
        salt: '',
        packageWeight: '',
        defaultServing: '',
        ingredients: '',
        units: [],
      });

      // Clear image preview and duplicate reference
      setImagePreview(null);
      setExistingProductId(null);

      // Read redirect query parameters from URL
      const returnUrl = searchParams?.get('returnUrl');
      const meal = searchParams?.get('meal');
      const date = searchParams?.get('date');

      // Redirect back to home page with the newly created product preselected
      if (meal && date) {
        // Use returnUrl when pointing to root; otherwise fall back to '/'
        const targetUrl = returnUrl === '/' ? returnUrl : '/';
        router.push(`${targetUrl}?meal=${meal}&date=${date}&preselectProductId=${savedProduct.id}`);
      } else if (onCancel) {
        // If meal/date context is absent, invoke onCancel callback
        onCancel();
      }
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error(t('pf-save-error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <div className="min-h-screen w-full bg-background px-4 py-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        {/* Existing product notice banner */}
        {existingProductId && (
          <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
            <span className="mr-2">ℹ️</span>
            {t('pf-existing-banner')}
          </div>
        )}

        <h2 className="text-3xl font-bold text-foreground">
          {finalBarcode ? t('pf-edit-title') : t('pf-add-title')}
        </h2>

        {/* AI label scan CTA with camera icon */}
        <div>
          <button
            type="button"
            onClick={handleCameraClick}
            disabled={isAnalyzing}
            className="w-full flex items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <svg 
                  className="animate-spin h-6 w-6" 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-base">{t('pf-analyzing')}</span>
              </>
            ) : (
              <span className="text-base flex items-center"><Camera className="w-5 h-5 mr-2 inline" /> {t('pf-fill-from-photo')}</span>
            )}
          </button>
          
          {/* Photo capture helper text */}
          <p className="text-left text-sm mt-2 text-muted-foreground px-1 block">
            {t('pf-photo-help')}
          </p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleImageCapture}
            className="hidden"
          />

          {/* Photo preview */}
          {imagePreview && (
            <div className="mt-4 flex justify-center">
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Label preview" 
                  className="h-32 w-32 rounded-2xl border-2 border-primary object-cover shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-white shadow-md transition-colors hover:bg-destructive/80"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Barcode field */}
        <div>
          <label htmlFor="barcode" className="mb-2 block text-sm font-medium text-muted-foreground">
            {t('pf-barcode')}
          </label>
          <input
            type="text"
            id="barcode"
            name="barcode"
            value={formData.barcode}
            onChange={handleInputChange}
            disabled={!!finalBarcode}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="e.g. 5900512123456"
          />
        </div>

        {/* Product name */}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-muted-foreground">
            {t('pf-name')} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            placeholder="e.g. Milk UHT 2%"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Manufacturer */}
        <div>
          <label htmlFor="manufacturer" className="mb-2 block text-sm font-medium text-muted-foreground">
            {t('pf-manufacturer')}
          </label>
          <input
            type="text"
            id="manufacturer"
            name="manufacturer"
            value={formData.manufacturer || ''}
            onChange={handleInputChange}
            placeholder="e.g. Danone"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Nutrition facts heading */}
        <div className="pt-4">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            {t('pf-nutrition-heading')}
          </h3>
          
          <div className="space-y-4">
            {/* Calories */}
            <div>
              <label htmlFor="calories" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-calories')} <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                id="calories"
                name="calories"
                value={formData.calories}
                onChange={handleInputChange}
                required
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Protein */}
            <div>
              <label htmlFor="protein" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-protein')} <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                id="protein"
                name="protein"
                value={formData.protein}
                onChange={handleInputChange}
                required
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Fat */}
            <div>
              <label htmlFor="fat" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-fat')} <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                id="fat"
                name="fat"
                value={formData.fat}
                onChange={handleInputChange}
                required
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Saturated fat */}
            <div>
              <label htmlFor="saturatedFat" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-saturated-fat')}
              </label>
              <input
                type="number"
                id="saturatedFat"
                name="saturatedFat"
                value={formData.saturatedFat}
                onChange={handleInputChange}
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Carbohydrates */}
            <div>
              <label htmlFor="carbs" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-carbs')} <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                id="carbs"
                name="carbs"
                value={formData.carbs}
                onChange={handleInputChange}
                required
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Sugars */}
            <div>
              <label htmlFor="sugars" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-sugars')}
              </label>
              <input
                type="number"
                id="sugars"
                name="sugars"
                value={formData.sugars}
                onChange={handleInputChange}
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Fiber */}
            <div>
              <label htmlFor="fiber" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-fiber')}
              </label>
              <input
                type="number"
                id="fiber"
                name="fiber"
                value={formData.fiber}
                onChange={handleInputChange}
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Salt */}
            <div>
              <label htmlFor="salt" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-salt')}
              </label>
              <input
                type="number"
                id="salt"
                name="salt"
                value={formData.salt}
                onChange={handleInputChange}
                min="0"
                step="0.1"
                placeholder="0"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Ingredients */}
            <div className="col-span-2">
              <label htmlFor="ingredients" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-ingredients')}
              </label>
              <textarea
                id="ingredients"
                name="ingredients"
                value={formData.ingredients || ''}
                onChange={handleInputChange}
                rows={4}
                placeholder={t('pf-ingredients-placeholder')}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Package details */}
        <div className="pt-4">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            {t('pf-packaging-heading')}
          </h3>
          
          <div className="space-y-4">
            {/* Package weight */}
            <div>
              <label htmlFor="packageWeight" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-package-weight')}
              </label>
              <input
                type="number"
                id="packageWeight"
                name="packageWeight"
                value={formData.packageWeight}
                onChange={handleInputChange}
                min="0"
                step="1"
                placeholder="e.g. 500"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Default serving */}
            <div>
              <label htmlFor="defaultServing" className="mb-2 block text-sm font-medium text-muted-foreground">
                {t('pf-default-serving')}
              </label>
              <input
                type="number"
                id="defaultServing"
                name="defaultServing"
                value={formData.defaultServing}
                onChange={handleInputChange}
                min="0"
                step="1"
                placeholder="e.g. 100"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        {/* Serving units */}
        <div className="pt-4">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            {t('pf-units-heading')}
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('pf-units-help')}
          </p>
          
          <div className="space-y-3">
            {formData.units?.map((unit, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={unit.unitKey}
                  onChange={(e) => {
                    const newUnits = [...(formData.units || [])]
                    newUnits[index].unitKey = e.target.value
                    setFormData({ ...formData, units: newUnits })
                  }}
                  placeholder={t('pf-unit-placeholder')}
                  className="flex-1 rounded-2xl border border-border bg-card px-4 py-2 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-muted-foreground">=</span>
                <input
                  type="number"
                  value={unit.gramsPerUnit}
                  onChange={(e) => {
                    const newUnits = [...(formData.units || [])]
                    newUnits[index].gramsPerUnit = parseFloat(e.target.value) || 0
                    setFormData({ ...formData, units: newUnits })
                  }}
                  min="0"
                  step="0.1"
                  placeholder="0"
                  className="w-24 rounded-2xl border border-border bg-card px-4 py-2 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-muted-foreground">g</span>
                <button
                  type="button"
                  onClick={() => {
                    const newUnits = formData.units?.filter((_, i) => i !== index) || []
                    setFormData({ ...formData, units: newUnits })
                  }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={t('remove')}
                >
                  ×
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={() => {
                const newUnits = [...(formData.units || []), { unitKey: '', gramsPerUnit: 0 }]
                setFormData({ ...formData, units: newUnits })
              }}
              className="w-full rounded-2xl border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {t('pf-add-unit')}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-6 pb-8">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-2xl bg-secondary px-6 py-3 font-semibold text-secondary-foreground transition-transform active:scale-95"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? t('pf-saving') : t('pf-save')}
          </button>
        </div>
      </form>
    </div>
  );
}

const ProductForm: React.FC<ProductFormProps> = (props) => {
  const { language } = useOptionalLanguage();
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-background px-4 py-6 flex items-center justify-center">
        <div className="text-muted-foreground">{getTranslation(language, 'loading')}</div>
      </div>
    }>
      <ProductFormContent {...props} />
    </Suspense>
  );
};

export default ProductForm;
