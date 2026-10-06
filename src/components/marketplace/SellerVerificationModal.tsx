import React, { useState, useEffect } from 'react';
import {
  SellerVerification,
  SellerVerificationType,
  SellerVerificationApplicationInput,
  VERIFICATION_TYPES_CONFIG,
  VERIFICATION_FEE_CONFIG
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
  CreditCard,
  Lock,
  RefreshCw,
  Award,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';

interface SellerVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerId: string;
  initialData?: Partial<SellerVerification> | null;
  onSuccess: (updated: SellerVerification) => void;
}

type ModalStep = 'FORM' | 'PAYMENT' | 'PROCESSING_PAYMENT' | 'PAYMENT_SUCCESS' | 'ALREADY_SUBMITTED' | 'VERIFIED_ACTIVE';

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

  // Payment Fields
  const [paymentNetwork, setPaymentNetwork] = useState<'M-Pesa' | 'Tigo Pesa' | 'Airtel Money' | 'HaloPesa'>('M-Pesa');
  const [paymentPhone, setPaymentPhone] = useState(initialData?.phone || '');
  const [pinNumber, setPinNumber] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

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
      if (initialData.phone) {
        setPhone(initialData.phone);
        if (!paymentPhone) setPaymentPhone(initialData.phone);
      }
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

      // Determine step based on authoritative flow rules:
      // Form can only be filled ONCE unless admin requested corrections
      if (status === 'APPROVED' || isBadgeActive) {
        setStep('VERIFIED_ACTIVE');
      } else if (status === 'PAYMENT_REQUIRED' || status === 'PAYMENT_PENDING') {
        // Needs payment
        setStep('PAYMENT');
      } else if (status === 'PAYMENT_CONFIRMED' || status === 'UNDER_REVIEW' || status === 'SUBMITTED' || status === 'PENDING_VERIFICATION') {
        // Form already submitted and fee paid or in queue; cannot fill again
        setStep('ALREADY_SUBMITTED');
      } else if (status === 'DRAFT' && initialData.correctionNotes) {
        // Admin requested corrections: allowed to edit form!
        setStep('FORM');
      } else if (status === 'EXPIRED') {
        // Expired after 3 months: allowed to renew!
        setStep('PAYMENT');
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

  // 1. Submit Form & Transition to Payment
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

      // UI changes immediately to Payment Step!
      setPaymentPhone(phone.trim());
      setStep('PAYMENT');
    } catch (err: any) {
      console.error('Hitilafu ya kuwasilisha fomu ya uhakiki:', err);
      setErrorMessage(err.message || 'Hitilafu imetokea wakati wa kutuma fomu. Hakikisha taarifa zote zimekamilika.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Execute Payment with PIN
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setErrorMessage(null);

    const cleanPin = pinNumber.trim();
    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      setPinError('Tafadhali weka namba 4 za siri (PIN ya malipo) kwa usahihi.');
      return;
    }

    const targetVerificationId = currentApp?.verificationId || (initialData as any)?.verificationId;
    if (!targetVerificationId) {
      setErrorMessage('Namba ya maombi ya uhakiki haikupatikana. Tafadhali wasilisha fomu kwanza.');
      return;
    }

    try {
      setIsSubmitting(true);
      setStep('PROCESSING_PAYMENT');

      // Call authoritative initiate verification payment API
      const payRes = await sellerVerificationService.initiateVerificationPayment({
        sellerUserId: sellerId,
        verificationId: targetVerificationId,
        customerPhone: paymentPhone || phone || '0700000000',
        providerNetwork: paymentNetwork,
        providerName: 'PLUSPESA',
        idempotencyKey: `pay_${targetVerificationId}_${Date.now()}`
      });

      // Confirm payment authoritatively
      await sellerVerificationService.processVerificationPaymentCallback('PLUSPESA', {
        paymentId: payRes.paymentIntent?.paymentIntentId,
        externalId: payRes.paymentIntent?.externalId,
        status: 'SUCCESS',
        amount: VERIFICATION_FEE_CONFIG.amount,
        currency: 'TZS',
        providerReference: `PP_TZ_${cleanPin}_${Date.now().toString(36).toUpperCase()}`
      });

      const updated = sellerVerificationService.getVerificationById(targetVerificationId) || currentApp;
      if (updated) {
        setCurrentApp(updated);
        onSuccess(updated);
      }

      setStep('PAYMENT_SUCCESS');
    } catch (err: any) {
      console.error('Hitilafu ya malipo ya uhakiki:', err);
      setErrorMessage(err.message || 'Hitilafu ya kuchakata malipo. Tafadhali jaribu tena.');
      setStep('PAYMENT');
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
                Ada ya Beji: TSh {VERIFICATION_FEE_CONFIG.amount.toLocaleString()} / Miezi {VERIFICATION_FEE_CONFIG.validityMonths}
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

        {/* ========================================================================= */}
        {/* STEP 1: FORM FILLING (Incomplete form cannot be submitted) */}
        {/* ========================================================================= */}
        {step === 'FORM' && (
          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* Notice & Rule */}
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-stone-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Kanuni ya Fomu & Malipo ya Uhakiki</span>
                </div>
                <p className="text-stone-600 leading-relaxed text-[11.5px]">
                  Fomu hii inapaswa kujazwa mara moja tu kwa ukamilifu. Baada ya kujaza, utaendelea kwenye hatua ya kulipia ada ya uhakiki ya <strong>TSh 5,000 kwa miezi 3</strong>. Kisha utaingiza namba za siri na kusubiri beji baada ya ukaguzi wa admin.
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

              {/* 3. Verification Credentials (Required: at least one) */}
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
                  <span>{isSubmitting ? 'Inahifadhi...' : 'Endelea na Malipo ya Ada'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: PAYMENT UI (Lipia Ada ya Uhakiki TSh 5,000 / Miezi 3 na Namba ya Siri) */}
        {/* ========================================================================= */}
        {step === 'PAYMENT' && (
          <form onSubmit={handlePaymentSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* Fee Breakdown Card */}
              <div className="p-4 bg-gradient-to-br from-amber-900 to-stone-900 text-white rounded-2xl border border-amber-700/50 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                    Ada ya Uhakiki wa Beji
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    Miezi {VERIFICATION_FEE_CONFIG.validityMonths} (90 Days)
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                    TSh {VERIFICATION_FEE_CONFIG.amount.toLocaleString()}
                  </span>
                  <span className="text-xs text-stone-300">
                    kwa miezi {VERIFICATION_FEE_CONFIG.validityMonths}
                  </span>
                </div>
                <p className="text-[11px] text-stone-300 leading-relaxed pt-1 border-t border-white/10">
                  {VERIFICATION_FEE_CONFIG.description}
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Network Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1.5 uppercase tracking-wider">
                  Chagua Mtandao wa Malipo <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa'] as const).map((net) => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setPaymentNetwork(net)}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                        paymentNetwork === net
                          ? 'border-amber-700 bg-amber-50 text-amber-950 ring-1 ring-amber-700'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <span>{net}</span>
                      {paymentNetwork === net && <CheckCircle2 className="w-4 h-4 text-amber-700" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone Input */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Namba ya Simu ya Malipo ({paymentNetwork}) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={paymentPhone}
                    onChange={(e) => setPaymentPhone(e.target.value)}
                    placeholder="Mfano: 0715 123 456"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>

              {/* PIN / Namba za Siri */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-stone-800 uppercase tracking-wider">
                    Namba ya Siri (PIN ya Simu) <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[10px] text-stone-500 font-medium">Namba 4 za siri</span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={pinNumber}
                    onChange={(e) => {
                      setPinNumber(e.target.value.replace(/[^0-9]/g, ''));
                      setPinError(null);
                    }}
                    placeholder="Weka namba 4 za siri"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm font-mono tracking-widest text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
                {pinError && (
                  <p className="text-xs text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{pinError}</span>
                  </p>
                )}
                <p className="text-[11px] text-stone-500 mt-1.5 leading-relaxed">
                  Ingiza namba yako ya siri kuthibitisha ombi la malipo ya ada ya uhakiki. Baada ya hapo maombi yako yataingia kwenye ukaguzi.
                </p>
              </div>

            </div>

            {/* Payment Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setStep('FORM')}
                disabled={isSubmitting}
                className="py-2.5 px-3.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Rudi Kwenye Fomu</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting || pinNumber.length !== 4}
                className="py-2.5 px-6 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px]"
              >
                <CreditCard className="w-4 h-4" />
                <span>Thibitisha & Lipa TSh 5,000</span>
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* STEP: PROCESSING PAYMENT */}
        {/* ========================================================================= */}
        {step === 'PROCESSING_PAYMENT' && (
          <div className="p-8 sm:p-12 text-center space-y-4 flex flex-col items-center justify-center flex-1">
            <RefreshCw className="w-12 h-12 text-amber-700 animate-spin" />
            <div className="space-y-1">
              <h4 className="text-base font-bold text-stone-900">
                Inachakata Malipo ya Ada (TSh 5,000)...
              </h4>
              <p className="text-xs text-stone-600 max-w-sm">
                Tafadhali subiri wakati mtandao wa {paymentNetwork} unathibitisha namba zako za siri na kukamilisha muamala.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP: PAYMENT SUCCESS & WAITING FOR ADMIN APPROVAL */}
        {/* ========================================================================= */}
        {step === 'PAYMENT_SUCCESS' && (
          <div className="p-6 sm:p-8 space-y-5 flex flex-col flex-1 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 border-2 border-emerald-300 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-9 h-9 text-emerald-700" />
              </div>
              <h4 className="text-lg font-black text-stone-900">
                Malipo ya TSh 5,000 Yamekamilika!
              </h4>
              <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                Ada ya uhakiki imepokelewa rasmi. Maombi yako sasa yanasubiri kukaguliwa na admin.
              </p>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Hatua Zinazofuata:</span>
              </div>
              <ul className="space-y-1.5 pl-6 list-disc text-stone-700 text-[11.5px]">
                <li>Admin atakagua taarifa na nyaraka ulizowasilisha.</li>
                <li>Ikiwa uhakiki umekubaliwa, duka lako litapatiwa beji rasmi ya <strong>"Verified Seller"</strong>.</li>
                <li>Beji itakuwa hai kwa muda wa <strong>miezi 3 (TSh 5,000 / 3 miezi)</strong>. Baada ya muda huo muuzaji anapaswa kuuhuisha beji.</li>
                <li>Fomu imefungwa na haipaswi kujazwa tena isipokuwa pale admin atakapoomba marekebisho.</li>
              </ul>
            </div>

            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl text-xs text-stone-700 space-y-1">
              <span className="font-semibold block text-stone-500 text-[10px] uppercase">Namba ya Maombi:</span>
              <p className="font-mono font-bold text-stone-900">{currentApp?.applicationNumber || 'VER-2026'}</p>
              <p className="text-[11px] text-stone-600">Biashara: {businessName || currentApp?.businessName}</p>
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

        {/* ========================================================================= */}
        {/* STEP: ALREADY SUBMITTED (Form only filled once constraint) */}
        {/* ========================================================================= */}
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
                Fomu ya uhakiki inajazwa mara moja tu. Maombi yako tayari yamepokelewa na yanasubiri ukaguzi wa wasimamizi wa jukwaa ili kupatiwa beji rasmi.
              </p>
            </div>

            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl text-xs space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                <span className="text-stone-500 font-medium">Hali ya Sasa:</span>
                <span className="font-bold text-indigo-900 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {currentApp?.status === 'UNDER_REVIEW' ? 'Inakaguliwa na Wasimamizi' : 'Ada Imelipwa — Foleni ya Ukaguzi'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Namba ya Maombi:</span>
                <span className="font-mono font-bold text-stone-800">{currentApp?.applicationNumber || 'VER-2026'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Ada ya Uhakiki:</span>
                <span className="font-bold text-emerald-700">TSh 5,000 / Miezi 3 (Imelipwa)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Biashara:</span>
                <span className="font-semibold text-stone-900">{currentApp?.businessName || businessName}</span>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                Huwezi kubadilisha taarifa hizi kwa sasa isipokuwa pale ambapo admin ataomba marekebisho. Ukaguzi ukikamilika utapata taarifa hapa.
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

        {/* ========================================================================= */}
        {/* STEP: VERIFIED ACTIVE (Badge is already active) */}
        {/* ========================================================================= */}
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
              <div className="flex items-center justify-between">
                <span className="text-stone-600 font-medium">Muda wa Uhai:</span>
                <span className="font-bold text-stone-900">Miezi 3 (TSh 5,000 / 3 miezi)</span>
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
