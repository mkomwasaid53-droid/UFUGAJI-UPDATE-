import React from 'react';
import {
  SellerVerification,
  getSellerVerificationDisplay,
  VERIFICATION_TYPES_CONFIG
} from '../../types/sellerVerification';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Clock,
  AlertTriangle,
  FileCheck2,
  ExternalLink,
  Info,
  CheckCircle2,
  RefreshCw,
  Award
} from 'lucide-react';

interface SellerVerificationStatusCardProps {
  verification: SellerVerification | null;
  onApply: () => void;
  isLoading?: boolean;
}

export const SellerVerificationStatusCard: React.FC<SellerVerificationStatusCardProps> = ({
  verification,
  onApply,
  isLoading
}) => {
  const status = verification?.status || 'NOT_APPLIED';
  const display = getSellerVerificationDisplay(status);

  const typeConfig = VERIFICATION_TYPES_CONFIG.find(
    (t) => t.type === verification?.verificationType
  );

  const formattedDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 flex items-center justify-center gap-2.5 text-stone-500 text-xs animate-pulse min-h-[100px]">
        <RefreshCw className="w-4 h-4 animate-spin text-amber-700" />
        <span>Inakagua hali halisi ya uhakiki...</span>
      </div>
    );
  }

  // 1. NOT APPLIED STATE
  if (status === 'NOT_APPLIED') {
    return (
      <div className="bg-gradient-to-br from-amber-50/90 via-stone-50 to-amber-100/40 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center shrink-0 shadow-xs">
              <Shield className="w-6 h-6 text-amber-800" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-stone-900">
                  Uhakiki wa Duka & Muuzaji
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 border border-stone-300">
                  Haijahakikiwa Bado
                </span>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed max-w-xl">
                Kusajili duka hakukupi beji ya uhakiki kiotomatiki (<strong>Registered ≠ Verified</strong>). Wasilisha utambulisho wako ili kupata beji rasmi ya <strong>"Muuzaji Aliyethibitishwa"</strong> na kujenga uaminifu mkubwa kwa wanunuzi.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onApply}
            className="self-start sm:self-center px-4 py-2.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer shrink-0 min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Omba Uhakiki wa Muuzaji</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. PAYMENT REQUIRED / PAYMENT PENDING STATE
  if (status === 'PAYMENT_REQUIRED' || status === 'PAYMENT_PENDING') {
    return (
      <div className="bg-gradient-to-br from-amber-50/90 via-white to-amber-100/40 border border-amber-300 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-amber-800" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-stone-900">
                  Ada ya Uchakataji Inahitajika (TSh 5,000)
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Ada ya Uchakataji
                </span>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed max-w-xl">
                Maombi yako yamewasilishwa. Ili kuingia kwenye foleni ya ukaguzi wa kiutawala, kamilisha ada ya uchakataji ya <strong>TSh 5,000 (Processing Fee)</strong>.
              </p>
              <div className="text-[11px] text-amber-800 bg-amber-50 rounded-xl px-3 py-1.5 border border-amber-200 inline-flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Ada hii ni ya ukaguzi wa taarifa na nyaraka; haimaanishi utoaji wa beji moja kwa moja.</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onApply}
            className="self-start sm:self-center px-4 py-2.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer shrink-0 min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Kamilisha / Lipia Ada</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. PAYMENT CONFIRMED / SUBMITTED STATE
  if (status === 'PAYMENT_CONFIRMED' || status === 'SUBMITTED' || status === 'PENDING_VERIFICATION') {
    return (
      <div className="bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/40 border border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-800 border border-indigo-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-indigo-700" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-stone-900">
                  Ada Imepokelewa — Foleni ya Ukaguzi
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Inasubiri Ukaguzi
                </span>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed max-w-xl">
                Malipo ya ada ya uchakataji yamekamilika. Maombi yako namba <strong>{verification?.applicationNumber || ''}</strong> yameingia kwenye foleni rasmi ya ukaguzi wa wasimamizi.
              </p>
              <div className="text-[11px] text-stone-500 bg-stone-100/80 rounded-xl px-3 py-1.5 border border-stone-200 inline-flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Bidhaa zako zitaendelea kuonekana sokoni kawaida wakati uhakiki unakamilishwa.</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onApply}
            className="self-start sm:self-center px-3 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0 min-h-[40px]"
          >
            Tazama Taarifa
          </button>
        </div>
      </div>
    );
  }

  // 4. UNDER REVIEW STATE
  if (status === 'UNDER_REVIEW') {
    return (
      <div className="bg-gradient-to-br from-blue-50/80 via-white to-blue-50/40 border border-blue-300/80 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-800 border border-blue-300 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-6 h-6 text-blue-700" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-stone-900">
                Ombi Lako Linakaguliwa Hivi Sasa
              </h4>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                Inakaguliwa (Under Review)
              </span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed max-w-xl">
              Wasimamizi wetu wanakagua taarifa za biashara yako na nyaraka za uthibitisho. Uamuzi rasmi utatolewa punde.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 5. VERIFIED / APPROVED STATE
  if (status === 'VERIFIED' || status === 'APPROVED' || verification?.hasActiveBadge || verification?.badgeStatus === 'ACTIVE') {
    return (
      <div className="bg-gradient-to-br from-emerald-50/90 via-white to-emerald-100/40 border border-emerald-300 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-6 h-6 text-emerald-800" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-emerald-950">
                  Umehakikiwa Rasmi (Verified Seller)
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-400 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" /> Muuzaji Aliyethibitishwa
                </span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed max-w-xl">
                Duka lako na matangazo yako yote yanatambulika na yana beji rasmi ya uaminifu wa jukwaa. 
                {typeConfig ? ` Aina: ${typeConfig.labelSwahili}` : ''}
                {verification?.reviewedAt || verification?.badgeActivatedAt ? ` • Tarehe ya Uhakiki: ${formattedDate(verification.reviewedAt || verification.badgeActivatedAt)}` : ''}
              </p>
            </div>
          </div>

          <div className="self-start sm:self-center flex items-center gap-2 text-emerald-800 bg-emerald-100/70 border border-emerald-300 rounded-xl px-3 py-2 text-xs font-bold shrink-0">
            <Award className="w-4 h-4 text-emerald-700" />
            <span>Beji Inafanya Kazi</span>
          </div>
        </div>
      </div>
    );
  }

  // 6. REJECTED STATE
  if (status === 'REJECTED') {
    return (
      <div className="bg-gradient-to-br from-rose-50/90 via-white to-rose-100/30 border border-rose-300 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-800 border border-rose-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-rose-700" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-stone-900">
                  Ombi la Uhakiki Halikukubaliwa
                </h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                  Haijakubaliwa
                </span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed max-w-xl">
                Sababu kutoka kwa msimamizi: <strong>"{verification?.safeRejectionReason || (verification as any)?.rejectionReason || 'Taarifa za uthibitisho hazikukamilika.'}"</strong>
              </p>
              <p className="text-[11px] text-stone-500">
                Unaweza kurekebisha taarifa zako na kutuma ombi jipya wakati wowote.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onApply}
            className="self-start sm:self-center px-4 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer shrink-0 min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Rekebisha & Omba Tena</span>
          </button>
        </div>
      </div>
    );
  }

  // 6. SUSPENDED STATE
  return (
    <div className="bg-gradient-to-br from-stone-100 via-stone-50 to-stone-200/60 border border-stone-400 rounded-2xl p-4 sm:p-5 shadow-xs">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-stone-200 text-stone-700 border border-stone-300 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-6 h-6 text-stone-800" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-stone-900">
              Uhakiki wa Muuzaji Umesitishwa
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-300 text-stone-800">
              Umesitishwa
            </span>
          </div>
          <p className="text-xs text-stone-700 leading-relaxed max-w-xl">
            Sababu: <strong>"{verification?.suspensionReason || 'Akaunti hii imesitishwa kwa ajili ya ukaguzi wa usalama.'}"</strong>
          </p>
          <p className="text-[11px] text-stone-500">
            Tafadhali wasiliana na usimamizi wa Ufugaji Update kwa ufafanuzi zaidi.
          </p>
        </div>
      </div>
    </div>
  );
};
