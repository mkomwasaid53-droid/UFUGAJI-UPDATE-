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
  Clock,
  RefreshCw,
  Award,
  ChevronRight
} from 'lucide-react';

interface SellerVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerId: string;
  initialData?: Partial<SellerVerification> | null;
  onSuccess: (updated: SellerVerification) => void;
}

type ModalStep = 'FORM' | 'ALREADY_SUBMITTED' | 'VERIFIED_ACTIVE';

export const SellerVerificationModal: React.FC<SellerVerificationModalProps> = ({
  isOpen,
  onClose,
  sellerId,
  initialData,
  onSuccess
}) => {
  // Step State
  const [step, setStep] = useState<ModalStep>('FORM');

  // Form Fields
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

  // Status & Loaders
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentApp, setCurrentApp] = useState<SellerVerification | null>(
    (initialData as SellerVerification) || null
  );

  // Sync initialData & determine initial step
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

      setCurrentApp(initialData as SellerVerification);

      const status = initialData.status;
      const isBadgeActive = initialData.badgeStatus === 'ACTIVE' || initialData.hasActiveBadge;

      if (status === 'APPROVED' || isBadgeActive) {
        setStep('VERIFIED_ACTIVE');
      } else if (status === 'UNDER_REVIEW' || status === 'SUBMITTED' || status === 'PENDING_VERIFICATION') {
        setStep('ALREADY_SUBMITTED');
      } else if (status === 'DRAFT' && initialData.correctionNotes) {
        setStep('FORM');
      } else {
        setStep('FORM');
      }
    } else {
      setStep('FORM');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const currentTypeConfig = VERIFICATION_TYPES_CONFIG.find((t) => t.type === verificationType);

  // Strict Validation: Form must be completely filled
  const isFormComplete = Boolean(
    businessName.trim().length >= 3 &&
    displayName.trim().length >= 3 &&
    phone.trim().length >= 9 &&
    location.trim().length > 0 &&
    district.trim().length >= 2 &&
    (nationalId.trim().length > 0 || tinNumber.trim().length > 0 || permitReference.trim().length > 0 || documentNotes.trim().length > 0)
  );

  // Submit Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!businessName.trim()) {
      setErrorMessage('Tafadhali ingiza jina kamili la biashara au shamba lako (angalau herufi 3).');
      return;
    }
    if (!displayName.trim()) {
      setErrorMessage('Tafadhali ingiza jina la mmiliki au msimamizi.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      setErrorMessage('Tafadhali ingiza namba rasmi sahihi ya simu ya biashara.');
      return;
    }
    if (!district.trim()) {
      setErrorMessage('Tafadhali ingiza wilaya ya shughuli zako za ufugaji.');
      return;
    }
    if (!nationalId.trim() && !tinNumber.trim() && !permitReference.trim() && !documentNotes.trim()) {
      setErrorMessage('Fomu haijakamilika: Tafadhali weka angalau namba ya NIDA, TIN, Kumbukumbu ya Barua/Kibali, au Maelezo ya Uthibitisho wa Shughuli.');
      return;
    }

    try {
      setIsSubmitting(true);
      const input: SellerVerificationApplicationInput = {
        verificationType,
        businessName: businessName.trim(),
        displayName: displayName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        district: district.trim(),
        nationalId: nationalId.trim() || undefined,
        tinNumber: tinNumber.trim() || undefined,
        permitReference: permitReference.trim() || undefined,
        documentNotes: documentNotes.trim() || undefined,
        notes: notes.trim() || undefined
      };

      const idempotencyKey = `req_sub_${sellerId}_${Date.now()}`;
      const app = await sellerVerificationService.submitSellerVerificationApplication(sellerId, input, idempotencyKey);
      setCurrentApp(app);
      onSuccess(app);
      setStep('ALREADY_SUBMITTED');
    } catch (err: any) {
      console.error('Hitilafu ya kuwasilisha fomu ya uhakiki:', err);
      setErrorMessage(err.message || 'Hitilafu imetokea wakati wa kutuma fomu. Hakikisha taarifa zote zimekamilika.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Uhakiki wa Muuzaji (Verified Seller)
              </h3>
              <p className="text-xs text-amber-300 font-medium">
                Utambulisho na Uthibitisho Rasmi wa Muuzaji
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

        {/* STEP 1: FORM FILLING */}
        {step === 'FORM' && (
          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* Notice & Rule */}
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-stone-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Kanuni ya Uhakiki wa Muuzaji</span>
                </div>
                <p className="text-stone-600 leading-relaxed text-[11.5px]">
                  Fomu hii inapaswa kujazwa kwa ukamilifu. Baada ya kuwasilisha, taarifa zako zitaingia kwenye foleni ya ukaguzi wa wasimamizi wa jukwaa ili kupatiwa beji rasmi ya uaminifu.
                </p>
              </div>

              {initialData?.correctionNotes && (
                <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-950 space-y-1">
                  <span className="font-bold block text-rose-900">Marekebisho Yaliyoombwa na Admin:</span>
                  <p className="text-rose-800 italic">"{initialData.correctionNotes}"</p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 1. Verification Type Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1.5 uppercase tracking-wider">
                  Aina ya Uhakiki wa Muuzaji <span className="text-rose-600">*</span>
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
                  Taarifa za Biashara au Shamba (Lazima Zikamilike)
                </h4>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Jina la Biashara / Duka / Shamba <span className="text-rose-600">*</span>
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
                      Jina la Mmiliki / Msimamizi <span className="text-rose-600">*</span>
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
                      Namba ya Simu ya Mawasiliano <span className="text-rose-600">*</span>
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
                      Mkoa <span className="text-rose-600">*</span>
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
                      Wilaya / Eneo <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      placeholder="Mfano: Rungwe, Kibamba"
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Verification Credentials */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Nyaraka na Utambulisho wa Shughuli (Weka angalau moja) <span className="text-rose-600">*</span>
                  </h4>
                </div>

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
                      TIN / Namba ya Ushuru
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
                    Kumbukumbu ya Barua ya Serikali ya Mtaa au Leseni ya Biashara
                  </label>
                  <input
                    type="text"
                    value={permitReference}
                    onChange={(e) => setPermitReference(e.target.value)}
                    placeholder="Mfano: Barua ya Mtendaji wa Kijiji Na: MB/2026/04"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Maelezo ya Uthibitisho wa Shughuli Zako za Ufugaji
                  </label>
                  <textarea
                    rows={2}
                    value={documentNotes}
                    onChange={(e) => setDocumentNotes(e.target.value)}
                    placeholder="Mfano: Shamba letu lina mifugo 500 ya kuku, linafanya kazi tangu 2021..."
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2.5 shrink-0">
              <span className="text-[11px] text-stone-500">
                {isFormComplete ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fomu imekamilika
                  </span>
                ) : (
                  <span className="text-amber-800 font-medium">Jaza sehemu zenye alama ya *</span>
                )}
              </span>

              <div className="flex items-center gap-2">
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
                  disabled={isSubmitting || !isFormComplete}
                  className="py-2.5 px-6 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'Inawasilisha...' : 'Wasilisha Maombi ya Uhakiki'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP: ALREADY SUBMITTED */}
        {step === 'ALREADY_SUBMITTED' && (
          <div className="p-6 sm:p-8 space-y-5 flex flex-col flex-1 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-800 border border-indigo-300 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7 text-indigo-700" />
              </div>
              <h4 className="text-base sm:text-lg font-black text-stone-900">
                Maombi Yako Yameshawasilishwa (Fomu Imejazwa)
              </h4>
              <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                Maombi yako ya uhakiki yamepokelewa kikamilifu na yanasubiri ukaguzi wa wasimamizi wa jukwaa ili kupatiwa beji rasmi ya uaminifu.
              </p>
            </div>

            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl text-xs space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                <span className="text-stone-500 font-medium">Hali ya Sasa:</span>
                <span className="font-bold text-indigo-900 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {currentApp?.status === 'UNDER_REVIEW' ? 'Inakaguliwa na Wasimamizi' : 'Yamewasilishwa — Foleni ya Ukaguzi'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Namba ya Maombi:</span>
                <span className="font-mono font-bold text-stone-800">{currentApp?.applicationNumber || 'VER-2026'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Aina ya Uhakiki:</span>
                <span className="font-semibold text-stone-800">{currentTypeConfig?.labelSwahili || 'Uhakiki'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Biashara:</span>
                <span className="font-semibold text-stone-900">{currentApp?.businessName || businessName}</span>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                Taarifa hizi zimehifadhiwa salama. Wasimamizi watakapokagua maombi yako utapokea taarifa rasmi.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Sawa, Nimeelewa
              </button>
            </div>
          </div>
        )}

        {/* STEP: VERIFIED ACTIVE */}
        {step === 'VERIFIED_ACTIVE' && (
          <div className="p-6 sm:p-8 space-y-5 flex flex-col flex-1 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 border-2 border-emerald-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-9 h-9 text-emerald-700" />
              </div>
              <h4 className="text-lg font-black text-stone-900">
                Umehakikiwa Kikamilifu (Verified Seller)
              </h4>
              <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                Akaunti na duka lako vina beji rasmi ya uaminifu wa jukwaa la Ufugaji Update.
              </p>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-600 font-medium">Hali ya Beji:</span>
                <span className="font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  Beji Ipo Hai (Active)
                </span>
              </div>
              {currentApp?.expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-stone-600 font-medium">Tarehe ya Kumalizika:</span>
                  <span className="font-mono font-bold text-stone-800">
                    {new Date(currentApp.expiresAt).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Funga
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
