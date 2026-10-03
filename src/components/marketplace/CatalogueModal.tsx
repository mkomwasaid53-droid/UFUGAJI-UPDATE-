import React, { useState } from 'react';
import { ShopCatalogue } from '../../types/marketplace';
import { X, Save, AlertCircle, Layers, Check } from 'lucide-react';

interface CatalogueModalProps {
  initialCatalogue?: ShopCatalogue | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => Promise<void>;
  suggestedOrder?: number;
}

const CATALOGUE_ICONS = [
  '🐣', '🥚', '🌾', '💊', '🐔', '🥩', '🥛', '🚜',
  '🐐', '🐄', '🐟', '🐝', '🐇', '📦', '🧴', '🩺', '🌿', '🏷️'
];

export const CatalogueModal: React.FC<CatalogueModalProps> = ({
  initialCatalogue,
  onClose,
  onSave,
  suggestedOrder = 1
}) => {
  const isEditing = Boolean(initialCatalogue);

  const [name, setName] = useState(initialCatalogue?.name || '');
  const [icon, setIcon] = useState(initialCatalogue?.icon || '🐣');
  const [description, setDescription] = useState(initialCatalogue?.description || '');
  const [displayOrder, setDisplayOrder] = useState<string>(
    initialCatalogue?.displayOrder !== undefined ? String(initialCatalogue.displayOrder) : String(suggestedOrder)
  );
  const [isActive, setIsActive] = useState<boolean>(initialCatalogue?.isActive ?? true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMsg('Tafadhali weka jina la Catalogue (angalau herufi 2).');
      return;
    }

    const orderNum = parseInt(displayOrder, 10);

    try {
      setIsSubmitting(true);
      await onSave({
        name: name.trim(),
        icon: icon || '🐣',
        description: description.trim(),
        displayOrder: isNaN(orderNum) ? 1 : orderNum,
        isActive,
      });
      onClose();
    } catch (err: any) {
      console.error('Hitilafu ya kuhifadhi catalogue:', err);
      setErrorMsg(err?.message || 'Hitilafu imetokea wakati wa kuhifadhi catalogue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 to-amber-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-800 text-white flex items-center justify-center text-lg">
              {icon}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                {isEditing ? 'Hariri Catalogue / Sehemu' : 'Tengeneza Catalogue Mpya'}
              </h3>
              <p className="text-xs text-amber-200/90 pt-0.5">
                Panga bidhaa zako kwa makundi maalum ndani ya duka
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Icon Picker */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Chagua Alama / Icon ya Catalogue
              </label>
              <div className="flex flex-wrap gap-2 p-3 bg-stone-50 rounded-2xl border border-stone-200">
                {CATALOGUE_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`w-9 h-9 text-lg rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                      icon === ic
                        ? 'bg-amber-800 text-white ring-2 ring-amber-600 scale-110 shadow-xs'
                        : 'bg-white hover:bg-stone-100 border border-stone-200 text-stone-800'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Jina la Catalogue *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mfano: Vifaranga vya Siku 1, Mayai ya Mbegu, au Chakula"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Maelezo Mafupi (Hiari)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mfano: Vifaranga bora wa Sasso na Kuroiler wenye chanjo kamili"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>

            {/* Display Order & Active Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Namba ya Mpangilio (Order)
                </label>
                <input
                  type="number"
                  min="1"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Hali ya Catalogue
                </label>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 min-h-[44px] transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-stone-100 text-stone-600 border-stone-300'
                  }`}
                >
                  {isActive ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Inaonekana (Active)</span>
                    </>
                  ) : (
                    <span>Imezimwa (Inactive)</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2.5 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Ghairi
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2.5 px-6 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Inahifadhi...' : isEditing ? 'Sasisha Catalogue' : 'Tengeneza'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
