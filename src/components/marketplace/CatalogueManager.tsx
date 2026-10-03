import React, { useState } from 'react';
import { ShopCatalogue, MarketplaceProduct } from '../../types/marketplace';
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  EyeOff,
  Package,
  AlertTriangle
} from 'lucide-react';

interface CatalogueManagerProps {
  catalogues: ShopCatalogue[];
  products: MarketplaceProduct[];
  onCreateCatalogue: () => void;
  onEditCatalogue: (catalogue: ShopCatalogue) => void;
  onDeleteCatalogue: (catalogueId: string) => Promise<void>;
  onReorderCatalogues: (orderedIds: string[]) => Promise<void>;
  onToggleActive: (catalogue: ShopCatalogue) => Promise<void>;
}

export const CatalogueManager: React.FC<CatalogueManagerProps> = ({
  catalogues,
  products,
  onCreateCatalogue,
  onEditCatalogue,
  onDeleteCatalogue,
  onReorderCatalogues,
  onToggleActive
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Count products per catalogue
  const getProductCount = (catalogueId: string) => {
    return products.filter((p) => p.catalogueId === catalogueId).length;
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0 || isProcessing) return;
    const items = [...catalogues];
    const temp = items[index];
    items[index] = items[index - 1];
    items[index - 1] = temp;

    try {
      setIsProcessing(true);
      await onReorderCatalogues(items.map((c) => c.catalogueId));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= catalogues.length - 1 || isProcessing) return;
    const items = [...catalogues];
    const temp = items[index];
    items[index] = items[index + 1];
    items[index + 1] = temp;

    try {
      setIsProcessing(true);
      await onReorderCatalogues(items.map((c) => c.catalogueId));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (catalogueId: string) => {
    try {
      setIsProcessing(true);
      await onDeleteCatalogue(catalogueId);
      setDeleteConfirmId(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-200">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-stone-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-700" />
            <span>Catalogues / Makundi ya Bidhaa Dukan Mwako</span>
          </h3>
          <p className="text-xs text-stone-600 pt-0.5">
            Panga bidhaa zako (Mfano: Vifaranga, Mayai, Chakula, Dawa) ili wateja wapate kwa urahisi.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateCatalogue}
          className="py-2.5 px-4 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[42px] shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tengeneza Catalogue Mpya</span>
        </button>
      </div>

      {/* Catalogue List */}
      {catalogues.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-stone-300 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center mx-auto text-xl">
            🐣
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-stone-900">
              Bado Hujatengeneza Catalogue Yoyote
            </h4>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Tengeneza catalogue za duka lako (mfano: 🐣 Vifaranga, 🥚 Mayai, 🌾 Chakula) ili kupanga bidhaa zako vizuri.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateCatalogue}
            className="py-2 px-4 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tengeneza Catalogue ya Kwanza</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {catalogues.map((cat, index) => {
            const count = getProductCount(cat.catalogueId);
            const isDeleting = deleteConfirmId === cat.catalogueId;

            return (
              <div
                key={cat.catalogueId}
                className={`bg-white rounded-2xl border transition-all p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  cat.isActive ? 'border-stone-200 shadow-2xs' : 'border-stone-200/60 bg-stone-50/60 opacity-75'
                }`}
              >
                {/* Left: Icon, Name, Details */}
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-900 border border-amber-200/80 flex items-center justify-center text-xl shrink-0">
                    {cat.icon || '📦'}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-stone-900">
                        {cat.name}
                      </h4>
                      {cat.isActive ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Inaonekana</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-300 inline-flex items-center gap-1">
                          <EyeOff className="w-2.5 h-2.5" />
                          <span>Imezimwa</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-stone-500 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-medium text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                        <Package className="w-3 h-3 text-stone-500" />
                        <span>Bidhaa {count}</span>
                      </span>
                      {cat.description && (
                        <span className="text-stone-500 text-xs truncate max-w-xs">
                          • {cat.description}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions (Reorder, Active, Edit, Delete) */}
                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {/* Reorder Buttons */}
                  <div className="flex items-center bg-stone-100 rounded-xl p-0.5 border border-stone-200">
                    <button
                      type="button"
                      disabled={index === 0 || isProcessing}
                      onClick={() => handleMoveUp(index)}
                      title="Panga Juu"
                      className="p-1.5 text-stone-600 hover:text-stone-900 disabled:opacity-30 rounded-lg hover:bg-white transition-colors cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === catalogues.length - 1 || isProcessing}
                      onClick={() => handleMoveDown(index)}
                      title="Panga Chini"
                      className="p-1.5 text-stone-600 hover:text-stone-900 disabled:opacity-30 rounded-lg hover:bg-white transition-colors cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Toggle Active Button */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onToggleActive(cat)}
                    title={cat.isActive ? 'Zima Catalogue' : 'Washa Catalogue'}
                    className={`py-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer min-h-[36px] ${
                      cat.isActive
                        ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {cat.isActive ? 'Ficha' : 'Washa'}
                  </button>

                  {/* Edit Button */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onEditCatalogue(cat)}
                    title="Hariri Catalogue"
                    className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete Button */}
                  {isDeleting ? (
                    <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-200">
                      <button
                        type="button"
                        onClick={() => handleDelete(cat.catalogueId)}
                        className="py-1 px-2 bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Ndio, Futa
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="py-1 px-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Ghairi
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setDeleteConfirmId(cat.catalogueId)}
                      title="Futa Catalogue"
                      className="p-2 bg-stone-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-stone-600 border border-stone-200 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reassurance Info Note */}
      <div className="p-3 bg-stone-100/80 rounded-xl border border-stone-200/80 text-xs text-stone-600 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        <span>
          <strong>Kumbuka:</strong> Kufuta au kubadilisha catalogue hakufuti bidhaa zako. Bidhaa zote zitabaki salama kwenye duka na sokoni.
        </span>
      </div>
    </div>
  );
};
