import React, { useState } from 'react';
import { SellerProfile } from '../../types/marketplace';
import { TANZANIA_REGIONS } from '../../data/marketplaceData';
import { X, Store, Save, ShieldCheck, AlertCircle, Info } from 'lucide-react';

interface SellerProfileModalProps {
  initialProfile?: SellerProfile | null;
  defaultDisplayName?: string;
  defaultPhone?: string;
  defaultLocation?: string;
  onClose: () => void;
  onSave: (profileData: Partial<SellerProfile>) => Promise<void>;
}

export const SellerProfileModal: React.FC<SellerProfileModalProps> = ({
  initialProfile,
  defaultDisplayName = '',
  defaultPhone = '',
  defaultLocation = 'Dar es Salaam',
  onClose,
  onSave,
}) => {
  const [businessName, setBusinessName] = useState(
    initialProfile?.businessName || `${defaultDisplayName || 'Mfugaji'} Farm`
  );
  const [displayName, setDisplayName] = useState(
    initialProfile?.displayName || defaultDisplayName || 'Mfugaji'
  );
  const [phone, setPhone] = useState(initialProfile?.phone || defaultPhone || '');
  const [location, setLocation] = useState(
    initialProfile?.location || defaultLocation || 'Dar es Salaam'
  );
  const [district, setDistrict] = useState(initialProfile?.district || '');
  const [description, setDescription] = useState(initialProfile?.description || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!businessName.trim()) {
      setErrorMsg('Tafadhali weka jina la shamba, duka au biashara yako.');
      return;
    }
    if (!phone.trim()) {
      setErrorMsg('Tafadhali weka namba ya simu ya biashara itakayotumiwa na wateja.');
      return;
    }
    if (!location.trim()) {
      setErrorMsg('Tafadhali chagua mkoa unaopatikana.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        businessName: businessName.trim(),
        displayName: displayName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        district: district.trim(),
        description: description.trim(),
      });
      onClose();
    } catch (err: any) {
      console.error('Hitilafu ya wasifu wa muuzaji:', err);
      setErrorMsg(err?.message || 'Hitilafu imetokea wakati wa kuhifadhi wasifu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-900 via-amber-800 to-amber-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-700/80 border border-amber-500/40 text-amber-200 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-snug">
                Wasifu wa Muuzaji (Seller Profile)
              </h3>
              <p className="text-xs text-amber-200/90">
                Taarifa za duka/shamba lako kwenye Gulio la UFUGAJI UPDATE
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-amber-200 hover:text-white bg-amber-800/80 hover:bg-amber-800 rounded-full transition-colors cursor-pointer shrink-0"
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

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-start space-x-2">
              <Info className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <p>
                Wasifu huu utaonekana kwenye matangazo yako yote ya mifugo na pembejeo ili wanunuzi waweze kukuamini na kuwasiliana nawe moja kwa moja.
              </p>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 text-xs flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <p>
                <strong>Kumbuka:</strong> Kujaza wasifu huu na kusajili duka hakukupi beji ya uthibitisho (<strong>Registered ≠ Verified</strong>). Baada ya kuhifadhi, unaweza kuwasilisha ombi rasmi la uhakiki ili kupata beji ya <strong>"Muuzaji Aliyethibitishwa"</strong>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Jina la Shamba / Duka / Biashara *
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Mfano: Mbeya Dairy & Poultry Hub"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Jina la Mmiliki / Msimamizi *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mfano: Juma Shabani"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Namba ya Simu ya Wateja (WhatsApp & Simu) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Mfano: 0715 123 456"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Mkoa *
                </label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                >
                  {TANZANIA_REGIONS.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Wilaya / Kata
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Mfano: Ilala, Kibamba"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Maelezo Kuhusu Shamba / Huduma Zako
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mfano: Tunazalisha vifaranga bora vya Sasso na Kuroiler, pamoja na chakula cha kuku kilichothibitishwa..."
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
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
              Funga
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2.5 px-6 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Inahifadhi...' : 'Hifadhi Wasifu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
