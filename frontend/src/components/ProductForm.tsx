'use client';

import React, { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';

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

  // Sprawdź duplikat po załadowaniu komponentu, jeśli jest kod kreskowy z URL
  React.useEffect(() => {
    if (finalBarcode) {
      checkBarcodeDuplicate(finalBarcode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Dla pól tekstowych zapisz wartość bezpośrednio
    if (name === 'name' || name === 'barcode' || name === 'manufacturer' || name === 'ingredients') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    } else {
      // Dla pól numerycznych zachowaj pusty string, w przeciwnym razie zapisz wartość
      setFormData(prev => ({
        ...prev,
        [name]: value === '' ? '' : value,
      }));
    }

    // Sprawdź duplikat gdy pole barcode zostanie zmienione
    if (name === 'barcode' && value.trim()) {
      checkBarcodeDuplicate(value.trim());
    }
  };

  const checkBarcodeDuplicate = async (barcode: string) => {
    if (!barcode) return;

    try {
      const response = await fetch(`${API_BASE}/products/barcode/${barcode}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const product = await response.json();
        
        // Produkt istnieje w bazie - wypełnij formularz (mapuj z backendu do frontu)
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
        // Produkt nie istnieje - to jest nowy produkt
        setExistingProductId(null);
      }
    } catch (error) {
      console.error('Error checking barcode duplicate:', error);
      // Ignoruj błędy sprawdzania - pozwól użytkownikowi kontynuować
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

      // Konwersja wszystkich plików do base64
      const fileReadPromises = Array.from(files).map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const base64Images = await Promise.all(fileReadPromises);
      
      // Ustaw pierwszy obrazek jako podgląd
      if (base64Images.length > 0) {
        setImagePreview(base64Images[0]);
      }

      try {
        // Wysłanie wszystkich obrazów do API
        const response = await fetch('/api/analyze-label', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ images: base64Images }),
        });

        if (!response.ok) {
          throw new Error('Błąd podczas analizy obrazu');
        }

        const productData = await response.json();

        // Aktualizacja formularza - nadpisz name, manufacturer i weight tylko jeśli są puste
        setFormData(prev => ({
          ...prev,
          name: prev.name || productData.name || '',
          manufacturer: prev.manufacturer || productData.manufacturer || '',
          barcode: !prev.barcode || prev.barcode.trim() === '' ? (productData.barcode || '') : prev.barcode,
          packageWeight: prev.packageWeight || productData.weight || '',
          // Makroskładniki i składniki zawsze nadpisz
          // Używamy ?? zamiast || aby 0 było akceptowane jako prawidłowa wartość
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

        // Sprawdź czy kod kreskowy istnieje w bazie
        if (productData.barcode) {
          checkBarcodeDuplicate(productData.barcode);
        }

        console.log('Analiza zakończona pomyślnie:', productData);
      } catch (error) {
        console.error('Błąd analizy obrazu:', error);
        toast.error('Nie udało się przeanalizować zdjęć. Spróbuj ponownie.');
      } finally {
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('Błąd przetwarzania pliku:', error);
      toast.error('Wystąpił błąd podczas przetwarzania pliku.');
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Walidacja podstawowa
    if (!formData.name || formData.name.trim() === '') {
      toast.error('Proszę podać nazwę produktu');
      return;
    }

    setIsSaving(true);

    try {
      // Mapowanie danych formularza do formatu API backendu
      const productPayload = {
        name: formData.name,
        barcode: formData.barcode || null,
        brand: null, // Brand może być null, nie jest w formularzu
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
        // Aktualizacja istniejącego produktu (PUT)
        response = await fetch(`${API_BASE}/products/${existingProductId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(productPayload),
        });
      } else {
        // Dodawanie nowego produktu (POST)
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
        console.error('Błąd podczas zapisywania produktu:', errorText);
        throw new Error('Nie udało się zapisać produktu');
      }

      const savedProduct = await response.json();
      console.log('Produkt zapisany pomyślnie:', savedProduct);

      // Wywołaj callback onSave jeśli istnieje
      onSave?.(formData);

      // Wyświetl komunikat sukcesu
      toast.success(existingProductId ? 'Zaktualizowano produkt!' : 'Dodano produkt!');

      // Zresetuj formularz do stanu początkowego
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

      // Wyczyść podgląd obrazu i istniejący produkt
      setImagePreview(null);
      setExistingProductId(null);

      // Pobierz parametry przekierowania z URL
      const returnUrl = searchParams?.get('returnUrl');
      const meal = searchParams?.get('meal');
      const date = searchParams?.get('date');

      // Przekieruj z powrotem do strony głównej z ID nowo dodanego produktu
      if (meal && date) {
        // Użyj returnUrl jeśli jest podany i jest to root, w przeciwnym razie użyj '/'
        const targetUrl = returnUrl === '/' ? returnUrl : '/';
        router.push(`${targetUrl}?meal=${meal}&date=${date}&preselectProductId=${savedProduct.id}`);
      } else if (onCancel) {
        // Jeśli nie ma meal/date, użyj callbacka onCancel
        onCancel();
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania:', error);
      toast.error('Wystąpił błąd podczas zapisywania produktu. Spróbuj ponownie.');
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
        {/* Baner informacyjny o istniejącym produkcie */}
        {existingProductId && (
          <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
            <span className="mr-2">ℹ️</span>
            Ten produkt znajduje się już w bazie danych! Wczytaliśmy jego dane. Możesz je przejrzeć, poprawić i zapisać zmiany.
          </div>
        )}

        <h2 className="text-3xl font-bold text-foreground">
          {finalBarcode ? 'Edytuj produkt' : 'Dodaj nowy produkt'}
        </h2>

        {/* Przycisk AI z ikoną aparatu */}
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
                <span className="text-base">Analizowanie tabeli...</span>
              </>
            ) : (
              <span className="text-base flex items-center"><Camera className="w-5 h-5 mr-2 inline" /> Uzupełnij ze zdjęcia</span>
            )}
          </button>
          
          {/* Tekst pomocniczy */}
          <p className="text-left text-sm mt-2 text-muted-foreground px-1 block">
            Zrób zdjęcie etykiety z nazwą, tabelą wartości odżywczych i składem. Im więcej informacji na zdjęciach, tym mniej wpisujesz ręcznie.
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

          {/* Podgląd zdjęcia */}
          {imagePreview && (
            <div className="mt-4 flex justify-center">
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Podgląd zdjęcia" 
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

        {/* Pole Barcode */}
        <div>
          <label htmlFor="barcode" className="mb-2 block text-sm font-medium text-muted-foreground">
            Kod kreskowy
          </label>
          <input
            type="text"
            id="barcode"
            name="barcode"
            value={formData.barcode}
            onChange={handleInputChange}
            disabled={!!finalBarcode}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="np. 5900512123456"
          />
        </div>

        {/* Nazwa produktu */}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-muted-foreground">
            Nazwa produktu <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            placeholder="np. Mleko UHT 2%"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Producent */}
        <div>
          <label htmlFor="manufacturer" className="mb-2 block text-sm font-medium text-muted-foreground">
            Producent
          </label>
          <input
            type="text"
            id="manufacturer"
            name="manufacturer"
            value={formData.manufacturer || ''}
            onChange={handleInputChange}
            placeholder="np. Danone"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Wartości odżywcze - nagłówek */}
        <div className="pt-4">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            Wartości odżywcze (na 100g)
          </h3>
          
          <div className="space-y-4">
            {/* Kalorie */}
            <div>
              <label htmlFor="calories" className="mb-2 block text-sm font-medium text-muted-foreground">
                Kalorie (kcal) <span className="text-destructive">*</span>
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

            {/* Białko */}
            <div>
              <label htmlFor="protein" className="mb-2 block text-sm font-medium text-muted-foreground">
                Białko (g) <span className="text-destructive">*</span>
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

            {/* Tłuszcze */}
            <div>
              <label htmlFor="fat" className="mb-2 block text-sm font-medium text-muted-foreground">
                Tłuszcze (g) <span className="text-destructive">*</span>
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

            {/* Tłuszcze nasycone */}
            <div>
              <label htmlFor="saturatedFat" className="mb-2 block text-sm font-medium text-muted-foreground">
                Tłuszcze nasycone (g)
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

            {/* Węglowodany */}
            <div>
              <label htmlFor="carbs" className="mb-2 block text-sm font-medium text-muted-foreground">
                Węglowodany (g) <span className="text-destructive">*</span>
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

            {/* Cukry */}
            <div>
              <label htmlFor="sugars" className="mb-2 block text-sm font-medium text-muted-foreground">
                Węglowodany w tym cukry (g)
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

            {/* Błonnik */}
            <div>
              <label htmlFor="fiber" className="mb-2 block text-sm font-medium text-muted-foreground">
                Błonnik (g)
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

            {/* Sól */}
            <div>
              <label htmlFor="salt" className="mb-2 block text-sm font-medium text-muted-foreground">
                Sól (g)
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

            {/* Składniki */}
            <div className="col-span-2">
              <label htmlFor="ingredients" className="mb-2 block text-sm font-medium text-muted-foreground">
                Składniki
              </label>
              <textarea
                id="ingredients"
                name="ingredients"
                value={formData.ingredients || ''}
                onChange={handleInputChange}
                rows={4}
                placeholder="Składniki produktu..."
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Informacje o opakowaniu */}
        <div className="pt-4">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            Informacje o opakowaniu
          </h3>
          
          <div className="space-y-4">
            {/* Waga opakowania */}
            <div>
              <label htmlFor="packageWeight" className="mb-2 block text-sm font-medium text-muted-foreground">
                Waga opakowania (g)
              </label>
              <input
                type="number"
                id="packageWeight"
                name="packageWeight"
                value={formData.packageWeight}
                onChange={handleInputChange}
                min="0"
                step="1"
                placeholder="np. 500"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Domyślna porcja */}
            <div>
              <label htmlFor="defaultServing" className="mb-2 block text-sm font-medium text-muted-foreground">
                Domyślna porcja (g)
              </label>
              <input
                type="number"
                id="defaultServing"
                name="defaultServing"
                value={formData.defaultServing}
                onChange={handleInputChange}
                min="0"
                step="1"
                placeholder="np. 100"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        {/* Jednostki miary */}
        <div className="pt-4">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            Jednostki miary
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Określ dodatkowe jednostki dla tego produktu (np. plaster, sztuka, łyżka).
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
                  placeholder="Nazwa jednostki (np. plaster)"
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
                  aria-label="Usuń jednostkę"
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
              + Dodaj jednostkę
            </button>
          </div>
        </div>

        {/* Przyciski akcji */}
        <div className="flex gap-3 pt-6 pb-8">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-2xl bg-secondary px-6 py-3 font-semibold text-secondary-foreground transition-transform active:scale-95"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Zapisywanie...' : 'Zapisz'}
          </button>
        </div>
      </form>
    </div>
  );
}

const ProductForm: React.FC<ProductFormProps> = (props) => {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-background px-4 py-6 flex items-center justify-center">
        <div className="text-muted-foreground">Ładowanie...</div>
      </div>
    }>
      <ProductFormContent {...props} />
    </Suspense>
  );
};

export default ProductForm;
