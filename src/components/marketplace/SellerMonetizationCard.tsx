import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  Loader2,
  Calendar,
  CreditCard,
  ArrowRight,
  Info,
  Phone,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import {
  SellerMonetizationRecord,
  SellerSellingEligibility,
  SellerPaymentIntent
} from '../../types/sellerMonetization';
import {
  sellerMonetizationService,
  subscribeToSellerMonetization
} from '../../services/sellerMonetizationService';
import { useSellerMonetization } from '../../hooks/useSellerMonetization';
import { normalizeTanzanianPhoneNumber } from '../../services/payment/paymentUtils';
import { useAuth } from '../../context/AuthContext';
import { FreeTrialActivationModal } from './FreeTrialActivationModal';

interface SellerMonetizationCardProps {
  sellerUserId: string;
  sellerProfileId?: string;
  record?: SellerMonetizationRecord | null;
  onStatusChange?: (record: SellerMonetizationRecord) => void;
  onRequestActivateTrial?: () => void;
}

export const SellerMonetizationCard: React.FC<SellerMonetizationCardProps> = ({
  sellerUserId,
  sellerProfileId,
  record: propRecord,
  onStatusChange,
  onRequestActivateTrial
}) => {
  const { user, profile } = useAuth();
  const {
    record: hookRecord,
    status: hookStatus,
    eligibility: hookEligibility,
    loading: hookLoading,
    revalidate,
    setAuthoritativeRecord
  } = useSellerMonetization(sellerUserId, sellerProfileId);

  // Authoritative record priority: propRecord (if provided and populated) or hookRecord
  const record = propRecord || hookRecord;
  const status = record?.status || hookStatus || 'NOT_ACTIVATED';
  const eligibility = record ? sellerMonetizationService.canSellerSellOnMarketplace(sellerUserId) : hookEligibility;
  const loading = hookLoading && !record;
  const [isLocalTrialModalOpen, setIsLocalTrialModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // V1.10B Payment & Renewal States
  const [phoneNumber, setPhoneNumber] = useState<string>(profile?.phone || '');
  const [paying, setPaying] = useState<boolean>(false);
  const [activePaymentIntent, setActivePaymentIntent] = useState<SellerPaymentIntent | null>(null);
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [showRenewForm, setShowRenewForm] = useState<boolean>(false);
  const pollIntervalRef = useRef<any>(null);

  const phoneValidation = normalizeTanzanianPhoneNumber(phoneNumber);

  // Keep onStatusChange callback reference stable and notify parent safely on actual status changes
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (record && record.status !== lastStatusRef.current) {
      lastStatusRef.current = record.status;
      onStatusChangeRef.current?.(record);
    }
  }, [record]);

  // V1.10A-CORRECTIVE-5: Unified Free Trial Modal Opener
  const handleOpenTrialModal = () => {
    if (onRequestActivateTrial) {
      onRequestActivateTrial();
    } else {
      setIsLocalTrialModalOpen(true);
    }
  };

  const handleTrialSuccess = (updatedRecord: SellerMonetizationRecord) => {
    setAuthoritativeRecord(updatedRecord);
    setIsLocalTrialModalOpen(false);
    setSuccessMessage('Hongera! Mwezi wako wa kwanza bure umewashwa kikamilifu.');
    revalidate().catch(() => {});
  };

  // V1.10B Initiate Governed Payment (TSh 1,000)
  const handleInitiatePayment = async () => {
    if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
      setError(phoneValidation.error || 'Tafadhali weka namba sahihi ya simu ya Tanzania (mfano 0754123456).');
      return;
    }

    setPaying(true);
    setError(null);
    setSuccessMessage(null);
    setPollingStatus('Inatuma ombi la malipo kwenye simu yako...');

    try {
      const token = user ? await user.getIdToken() : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (sellerUserId) {
        headers['x-user-id'] = sellerUserId;
      }

      const idempotencyKey = `spay_${sellerUserId}_${Date.now()}`;
      const res = await fetch('/api/seller/monetization/pay', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerUserId,
          sellerProfileId,
          customerPhone: phoneValidation.normalizedPhone,
          providerNetwork: phoneValidation.suggestedProvider,
          idempotencyKey
        })
      });

      const data = await res.json();
      if (!res.ok || !data.paymentIntent) {
        setError(data.error || 'Hitilafu wakati wa kuanzisha ombi la malipo.');
        setPaying(false);
        setPollingStatus(null);
        return;
      }

      const intent: SellerPaymentIntent = data.paymentIntent;
      setActivePaymentIntent(intent);

      if (intent.status === 'SUCCESS') {
        // Immediate sync success
        setSuccessMessage('Malipo yamethibitishwa kikamilifu! Usajili wako sasa ni ACTIVE.');
        setPaying(false);
        setPollingStatus(null);
        setShowRenewForm(false);
        if (data.record) {
          setAuthoritativeRecord(data.record);
        }
        revalidate().catch(() => {});
        return;
      }

      // Start status polling
      startPollingPaymentStatus(intent.paymentIntentId);
    } catch (err: any) {
      setError(err.message || 'Hitilafu ya mtandao wakati wa kuanzisha malipo.');
      setPaying(false);
      setPollingStatus(null);
    }
  };

  // Poll server for payment status
  const startPollingPaymentStatus = (paymentIntentId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    let attempts = 0;
    const maxAttempts = 30; // ~90 seconds

    setPollingStatus('Tafadhali kamilisha malipo kwenye simu yako kwa kuingiza PIN ya mtandao wako...');

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const token = user ? await user.getIdToken() : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        else if (sellerUserId) headers['x-user-id'] = sellerUserId;

        const res = await fetch(`/api/seller/monetization/payment-status/${paymentIntentId}`, { headers });
        const data = await res.json();

        if (res.ok && data.paymentIntent) {
          const status = data.paymentIntent.status;
          if (status === 'SUCCESS') {
            clearInterval(pollIntervalRef.current);
            setPaying(false);
            setPollingStatus(null);
            setShowRenewForm(false);
            setSuccessMessage('Hongera! Malipo ya TSh 1,000 yamekamilika na usajili wako umewashwa kikamilifu!');
            if (data.record) {
              setAuthoritativeRecord(data.record);
            }
            revalidate().catch(() => {});
            return;
          } else if (status === 'FAILED' || status === 'CANCELLED') {
            clearInterval(pollIntervalRef.current);
            setPaying(false);
            setPollingStatus(null);
            setError(`Malipo hayakukamilika: ${data.paymentIntent.failureReason || 'Mtumiaji amekatisha au salio halitoshi'}. Tafadhali jaribu tena.`);
            return;
          }
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollIntervalRef.current);
        setPaying(false);
        setPollingStatus(null);
        setError('Muda wa kusubiri malipo umekwisha. Kama umekamilisha malipo kwenye simu yako, tafadhali bofya "Pakia Upya" ili kusasisha hali.');
      }
    }, 3000);
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Haijawekwa';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs flex items-center justify-center gap-3 text-stone-500 text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
        <span>Inakagua hali ya usajili wa muuzaji...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 shadow-2xs space-y-4">
      {/* Header and status badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-900">
                Usajili wa Muuzaji (Seller Subscription)
              </h3>
              <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
                TSh 1,000 / mwezi
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Ada ya kila mwezi ya kuendesha duka na kuuza bidhaa sokoni
            </p>
          </div>
        </div>

        {/* State Badge */}
        <div>
          {status === 'NOT_ACTIVATED' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-700" />
              Mwezi wa 1: BURE
            </span>
          )}
          {status === 'TRIAL_ACTIVE' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              Trial Active
            </span>
          )}
          {status === 'ACTIVE' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              Seller Subscription: ACTIVE
            </span>
          )}
          {status === 'GRACE_PERIOD' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              Grace Period
            </span>
          )}
          {status === 'EXPIRED' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-700" />
              Subscription Expired
            </span>
          )}
          {status === 'SUSPENDED' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-stone-200 text-stone-800 border border-stone-300 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-stone-700" />
              Usajili Umesimamishwa
            </span>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Body per Status */}

      {/* 1. NOT_ACTIVATED (First-time seller) */}
      {status === 'NOT_ACTIVATED' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border border-amber-300 space-y-3">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-full border border-amber-200">
                Ofa ya Kipekee
              </span>
              <p className="text-base sm:text-lg font-black text-amber-950">
                Mwezi wa Kwanza Bure
              </p>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                Washa Free Trial yako ya kuuza bidhaa na upate siku 30 za kutumia huduma za Gulio bila malipo.
              </p>
              <p className="text-xs font-black text-emerald-800 pt-0.5">
                TSh 0 kwa siku 30.
              </p>
            </div>
            {!record?.hasHadTrial ? (
              <button
                type="button"
                onClick={handleOpenTrialModal}
                className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Washa Free Trial</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('seller-payment-form');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>Lipa TSh 1,000</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. TRIAL_ACTIVE */}
      {status === 'TRIAL_ACTIVE' && (
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Trial Active</span>
              </p>
              <p className="text-xs text-emerald-900 mt-0.5">
                Inaisha: <strong>{formatDate(record?.trialEndAt)}</strong> ({eligibility?.trialDaysRemaining ?? 0} siku zimesalia)
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-xl border border-emerald-200">
              Hakuna Malipo Yanayohitajika Sasa
            </span>
          </div>
          <p className="text-[11px] text-emerald-800/90 leading-relaxed pt-1">
            Uko huru kuchapisha bidhaa na kupokea wateja sokoni. Baada ya kipindi cha bure kuisha, utahitaji kufanya malipo ya <strong>TSh 1,000 / mwezi</strong> ili kuendelea kuuza.
          </p>
        </div>
      )}

      {/* 3. ACTIVE */}
      {status === 'ACTIVE' && (
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Seller Subscription: ACTIVE</span>
              </p>
              <p className="text-xs text-emerald-900 mt-0.5">
                TSh 1,000 / mwezi • Muda unaisha / Renewal: <strong>{formatDate(record?.currentPeriodEndAt || record?.nextRenewalAt)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRenewForm(!showRenewForm)}
              className="text-xs font-bold text-emerald-900 bg-white hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300 transition-all cursor-pointer"
            >
              {showRenewForm ? 'Funga Fomu ya Malipo' : 'Fanya Upya Sasa (Renew)'}
            </button>
          </div>
          <p className="text-[11px] text-emerald-800/90 leading-relaxed">
            Duka lako lipo hai na bidhaa zako zote zinaonekana sokoni kwa wanunuzi. Unaweza kufanya upya usajili wako wakati wowote ili kuongeza siku 30 zaidi.
          </p>
        </div>
      )}

      {/* 4. GRACE_PERIOD */}
      {status === 'GRACE_PERIOD' && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-sm sm:text-base font-black text-amber-950 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-700" />
                <span>Usajili wako wa bure umeisha.</span>
              </p>
              <p className="text-xs text-amber-900 font-bold">
                Lipa TSh 1,000 ili kuendelea kuuza kwenye Gulio.
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed pt-1">
                Kipindi cha bure kimekwisha. Grace period inaisha <strong>{formatDate(record?.graceEndAt)}</strong> ({eligibility?.graceDaysRemaining ?? 0} siku zimesalia). Huduma zote za kibiashara zimefungwa hadi malipo yatakapokamilika. Data ya duka lako imehifadhiwa salama.
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <div className="text-right">
                <span className="text-xs font-black text-amber-900 block">TSh 1,000</span>
                <span className="text-[10px] text-amber-700">kwa mwezi</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('seller-payment-form');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                Lipa TSh 1,000
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. EXPIRED */}
      {status === 'EXPIRED' && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-sm sm:text-base font-black text-rose-950 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-700" />
                <span>Usajili wako umeisha.</span>
              </p>
              <p className="text-xs text-rose-900 font-bold">
                Lipa TSh 1,000 ili kuendelea kuuza na kurudisha duka hewani.
              </p>
              <p className="text-[11px] text-rose-800/90 leading-relaxed pt-1">
                Muda wako wa Grace Period umekwisha. Bidhaa zako hazionekani kwa wanunuzi wapya sokoni. Data ya duka lako na bidhaa zote zimehifadhiwa salama.
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              <div className="text-right">
                <span className="text-xs font-black text-rose-900 block">TSh 1,000</span>
                <span className="text-[10px] text-rose-700">kwa mwezi</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('seller-payment-form');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                Lipa TSh 1,000
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. SUSPENDED */}
      {status === 'SUSPENDED' && (
        <div className="p-4 rounded-2xl bg-stone-100 border border-stone-300 space-y-2">
          <p className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-stone-700" />
            <span>Usajili Umesimamishwa Kiutawala</span>
          </p>
          <p className="text-xs text-stone-600">
            Sababu: {record?.suspendedReason || 'Uamuzi wa kiutawala wa jukwaa'}.
          </p>
          <p className="text-[11px] text-stone-500">
            Akaunti yako haiwezi kufanya malipo ya usajili hadi itatuliwe na msimamizi.
          </p>
        </div>
      )}

      {/* V1.10B Governed Mobile Money Payment Form (Available for GRACE_PERIOD, EXPIRED, ACTIVE Renewal, or NOT_ACTIVATED with hasHadTrial) */}
      {(status === 'GRACE_PERIOD' || status === 'EXPIRED' || (status === 'ACTIVE' && showRenewForm) || (status === 'NOT_ACTIVATED' && record?.hasHadTrial)) && (
        <div id="seller-payment-form" className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-amber-200/90 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200/70 pb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-700" />
              <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                Lipa kwa Simu (Mobile Money - PlusPesa)
              </h4>
            </div>
            <span className="text-xs font-black text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
              TSh 1,000 TZS
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Namba ya Simu (M-Pesa, Tigo Pesa, Airtel Money, Halopesa)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="07XXXXXXXX au 255XXXXXXXXX"
                  disabled={paying}
                  className="w-full pl-9 pr-24 py-2.5 bg-white border border-stone-300 rounded-xl text-xs font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 disabled:bg-stone-100"
                />
                {/* Live operator badge */}
                {phoneValidation.isValid && phoneValidation.operator && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                    {phoneValidation.operator}
                  </span>
                )}
              </div>
              {phoneNumber.length > 3 && !phoneValidation.isValid && (
                <p className="text-[10px] text-rose-600 mt-1">
                  {phoneValidation.error}
                </p>
              )}
            </div>

            {/* Polling / Instructions Box */}
            {pollingStatus && (
              <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-300/80 flex items-start gap-2.5 text-xs text-amber-950">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-700 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">{pollingStatus}</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Ujumbe wa usalama (USSD push) utatokea kwenye skrini ya simu yako kuweka PIN ili kuidhinisha <strong>TSh 1,000</strong>. Ukishakamilisha, ukurasa huu utasasishwa kiotomatiki.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-stone-500">
                Ulinzi na uhakiki wa malipo: <strong>PlusPesa Collections</strong>
              </span>

              <button
                type="button"
                onClick={handleInitiatePayment}
                disabled={paying || !phoneValidation.isValid}
                className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {paying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Inasubiri Malipo...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Lipa TSh 1,000</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Separation of Concerns Notice (Section 10) */}
      <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-stone-50 border border-stone-200/80 text-[11px] text-stone-500">
        <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-stone-700 font-semibold">Taarifa ya Usalama na Uaminifu:</strong> Usajili wa muuzaji (Monetization) ni tofauti kabisa na uthibitisho wa akaunti (Verified Seller Badge) au vifurushi vya AI Premium. Malipo haya hayatoi beji ya Verified wala hayafuti ukaguzi wa ubora wa bidhaa sokoni.
        </p>
      </div>

      {/* V1.10A-CORRECTIVE-5: Shared Free Trial Activation Modal if rendered standalone */}
      <FreeTrialActivationModal
        isOpen={isLocalTrialModalOpen}
        sellerUserId={sellerUserId}
        sellerProfileId={sellerProfileId}
        originAction="DIRECT_CTA"
        onClose={() => setIsLocalTrialModalOpen(false)}
        onSuccess={handleTrialSuccess}
      />
    </div>
  );
};
