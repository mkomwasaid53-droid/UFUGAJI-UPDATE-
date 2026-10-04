import React, { useState, useEffect } from 'react';
import {
  SellerVerification,
  SellerVerificationType,
  SellerVerificationApplicationInput,
  VERIFICATION_TYPES_CONFIG
} from '../../types/sellerVerification';
import { TANZANIA_REGIONS } from '../../data/marketplaceData';
import { sellerVerificationService } from '../../services/sellerVerificationService';
import {
  X,
  ShieldCheck,
  Building2,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  Save,
  CheckCircle2,
  Info,
  Layers,
  Sparkles
} from 'lucide-react';

interface SellerVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerId: string;
  initialData?: Partial<SellerVerification> | null;
  onSuccess: (updated: SellerVerification) => void;
}

export const SellerVerificationModal: React.FC<SellerVerificationModalProps> = ({
  isOpen,
  onClose,
  sellerId,
  initialData,
  onSuccess
}) => {
  const [verificationType, setVerificationType] = useState<SellerVerificationType>(
    initialData?.verificationType || 'INDIVIDUAL'
  );
  const [businessName, setBusinessName] = useState(initialData?.businessName || '');
  const [displayName, setDisplayName] = useState(initialData?.displayName || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [location, setLocation] = useState(initialData?.location || 'Dar es Salaam');
  const [district, setDistrict] = useState(initialData?.district || '');
  const [nationalId, setNationalId] = useState(initialData?.nationalId || '');
  const [tinNumber, setTinNumber] = useState(initialData?.tinNumber || '');
  const [permitReference, setPermitReference] = useState(initialData?.permitReference || '');
  const [documentNotes, setDocumentNotes] = useState(initialData?.documentNotes || '');
  const [notes, setNotes] = useState(initialData?.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      if (initialData.verificationType) setVerificationType(initialData.verificationType);
      if (initialData.businessName) setBusinessName(initialData.businessName);
      if (initialData.displayName) setDisplayName(initialData.displayName);
      if (initialData.phone) setPhone(initialData.phone);
      if (initialData.location) setLocation(initialData.location);
      if (initialData.district) setDistrict(initialData.district);
      if (initialData.nationalId) setNationalId(initialData.nationalId);
      if (initialData.tinNumber) setTinNumber(initialData.tinNumber);
      if (initialData.permitReference) setPermitReference(initialData.permitReference);
      if (initialData.documentNotes) setDocumentNotes(initialData.documentNotes);
      if (initialData.notes) setNotes(initialData.notes);
    }
  }, [initialData]);

  if (!isOpen) return null;

  const currentTypeConfig = VERIFICATION_TYPES_CONFIG.find((t) => t.type === verificationType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!businessName.trim()) {
      setErrorMessage('Tafadhali ingiza jina la biashara au shamba lako.');
      return;
    }
    if (!displayName.trim()) {
      setErrorMessage('Tafadhali ingiza jina la mmiliki au msimamizi.');
      return;
    }
    if (!phone.trim()) {
      setErrorMessage('Tafadhali ingiza namba rasmi ya simu ya biashara.');
      return;
    }

    try {
      setIsSubmitting(true);
      const input: SellerVerificationApplicationInput = {
        verificationType,
        businessName,
        displayName,
        phone,
        location,
        district,
        nationalId,
        tinNumber,
        permitReference,
        documentNotes,
        notes
      };

      const idempotencyKey = `req_sub_${sellerId}_${Date.now()}`;
      const updated = await sellerVerificationService.submitSellerVerificationApplication(sellerId, input, idempotencyKey);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      console.error('Hitilafu ya kuwasilisha ombi la uhakiki:', err);
      setErrorMessage(err.message || 'Hitilafu imetokea wakati wa kutuma ombi. Jaribu tena.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Ombi la Uhakiki wa Muuzaji (V1.6A)
              </h3>
              <p className="text-xs text-amber-300 font-medium">
                Pata beji rasmi ya Muuzaji Aliyethibitishwa
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-stone-400 hover:text-white bg-stone-800/80 hover:bg-stone-700 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {/* Registered ≠ Verified Architecture Warning */}
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-stone-800 space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Kanuni ya Uaminifu: Kusajiliwa ≠ Kuhakikiwa (Registered ≠ Verified)</span>
              </div>
              <p className="text-stone-600 leading-relaxed pl-6 text-[11px]">
                Kutuma fomu hii hakukupi beji ya uhakiki kiotomatiki. Timu yetu ya usimamizi itapitia maelezo yako kabla ya kuidhinisha beji ya <strong>"Muuzaji Aliyethibitishwa"</strong>.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. Verification Type Selection */}
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1.5 uppercase tracking-wider">
                Aina ya Uhakiki wa Muuzaji *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VERIFICATION_TYPES_CONFIG.map((t) => {
                  const isSelected = verificationType === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setVerificationType(t.type)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-amber-700 bg-amber-50/90 ring-1 ring-amber-700'
                          : 'border-stone-200 bg-stone-50 hover:bg-stone-100/80 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-900 block truncate">
                          {t.labelSwahili}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {currentTypeConfig && (
                <div className="mt-2 p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-0.5">
                  <p><strong>Maelezo:</strong> {currentTypeConfig.description}</p>
                  <p><strong>Nyaraka Zinazopendekezwa:</strong> {currentTypeConfig.recommendedDocs}</p>
                </div>
              )}
            </div>

            {/* 2. Business / Farm Identity */}
            <div className="space-y-3 pt-1">
              <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Taarifa za Biashara au Shamba
              </h4>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Jina la Biashara / Duka / Shamba *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Mfano: Mbeya Dairy & Poultry Farm"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Namba ya Simu ya Mawasiliano *
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
                    Wilaya / Eneo
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Mfano: Rungwe, Kibamba"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* 3. Verification Credentials / References */}
            <div className="space-y-3 pt-1">
              <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Viambatanisho na Utambulisho (Hiari lakini Inasaidia)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    NIDA / Kitambulisho cha Taifa
                  </label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="Namba ya NIDA (Mfano: 1990...)"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    TIN / Namba ya Ushuru (Kama ipo)
                  </label>
                  <input
                    type="text"
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value)}
                    placeholder="TIN ya TRA (Mfano: 123-456-789)"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Kumbukumbu ya Barua / Kibali cha Serikali ya Mtaa au Leseni
                </label>
                <input
                  type="text"
                  value={permitReference}
                  onChange={(e) => setPermitReference(e.target.value)}
                  placeholder="Mfano: Barua ya Mtendaji wa Kijiji cha Mbalizi Na: MB/2026/04"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Maelezo ya Uthibitisho au Ushahidi wa Shughuli Zako
                </label>
                <textarea
                  rows={2}
                  value={documentNotes}
                  onChange={(e) => setDocumentNotes(e.target.value)}
                  placeholder="Mfano: Shamba letu lina mifugo 500 ya kuku, linafanya kazi tangu 2021. Mwenyekiti wa mtaa anamfahamu mmiliki..."
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Maelezo Mengine kwa Wasimamizi
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Taarifa zozote za ziada..."
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
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
              <span>{isSubmitting ? 'Inawasilisha Ombi...' : 'Wasilisha Ombi la Uhakiki'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
