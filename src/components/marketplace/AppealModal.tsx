import React, { useState } from 'react';
import {
  X,
  Scale,
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AppealTargetType,
  AppealReasonCode,
  APPEAL_REASON_METADATA,
  MarketplaceAppealRecord
} from '../../types/marketplaceReportAndAppeal';
import { submitSellerAppeal } from '../../services/marketplaceReportAndAppealService';

interface AppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: AppealTargetType;
  targetId: string;
  targetTitle?: string;
  originalReasonText?: string;
  sellerId: string;
  shopId?: string | null;
  productId?: string | null;
  listingId?: string | null;
  onAppealSubmitted?: (appeal: MarketplaceAppealRecord) => void;
}

export const AppealModal: React.FC<AppealModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetTitle,
  originalReasonText,
  sellerId,
  shopId,
  productId,
  listingId,
  onAppealSubmitted
}) => {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<AppealReasonCode>('DECISION_INCORRECT');
  const [explanation, setExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const getTargetTypeBadge = () => {
    switch (targetType) {
      case 'SELLER_WARNING':
        return { label: 'Onyo la Muuzaji (Warning)', color: 'bg-amber-100 text-amber-900 border-amber-300' };
      case 'SELLER_RESTRICTION':
        return { label: 'Kizuizi cha Muuzaji (Restriction)', color: 'bg-rose-100 text-rose-900 border-rose-300' };
      case 'MODERATION_DECISION':
        return { label: 'Uamuzi wa Tangazo (Listing Moderation)', color: 'bg-blue-100 text-blue-900 border-blue-300' };
      default:
        return { label: 'Uamuzi wa Kiutawala', color: 'bg-stone-100 text-stone-800 border-stone-300' };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!user?.uid) {
      setErrorMsg('Tafadhali ingia kwenye akaunti yako ili kuwasilisha rufaa hii.');
      return;
    }

    if (user.uid !== sellerId) {
      setErrorMsg('Huna mamlaka ya kuwasilisha rufaa kwa niaba ya muuzaji mwingine.');
      return;
    }

    const trimmed = explanation.trim();
    if (trimmed.length < 10) {
      setErrorMsg('Tafadhali toa maelezo ya kina ya rufaa yako (angalau herufi 10).');
      return;
    }

    setIsSubmitting(true);
    try {
      const { appeal } = await submitSellerAppeal(user.uid, user.displayName || 'Muuzaji', {
        targetType,
        targetId,
        sellerId,
        shopId: shopId || null,
        productId: productId || null,
        listingId: listingId || null,
        reasonCode: selectedReason,
        reasonText: trimmed
      });

      setSuccessMsg('Rufaa yako imewasilishwa salama. Wasimamizi wataitathmini kwa umakini na haki.');
      if (onAppealSubmitted) {
        onAppealSubmitted(appeal);
      }
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
        setExplanation('');
      }, 1600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu wakati wa kuwasilisha rufaa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const badge = getTargetTypeBadge();

  return (
    <div
      className="fixed inset-0 z-70 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">
                Wasilisha Rufaa ya Kiutawala
              </h3>
              <p className="text-xs text-stone-500">
                Tathmini ya haki ya hatua au maamuzi ya usimamizi wa soko
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Context Summary */}
        <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] border ${badge.color}`}>
              {badge.label}
            </span>
            <span className="text-[11px] text-stone-500 font-mono">ID: {targetId.substring(0, 16)}...</span>
          </div>
          {targetTitle && (
            <p className="font-semibold text-stone-800">
              Lengo: <span className="text-stone-950">{targetTitle}</span>
            </p>
          )}
          {originalReasonText && (
            <p className="text-stone-600 bg-white p-2 rounded-lg border border-stone-200/70 italic">
              Sababu ya uamuzi uliopo: "{originalReasonText}"
            </p>
          )}
        </div>

        {/* Governance Notice */}
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Kanuni ya Rufaa:</strong> Rufaa ni ombi rasmi la kutathmini upya uamuzi kwa kuwasilisha maelezo au marekebisho mapya. Rufaa haibadilishi uamuzi kiotomatiki.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reason Code Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              Sababu ya Rufaa:
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value as AppealReasonCode)}
              className="w-full text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              {(Object.keys(APPEAL_REASON_METADATA) as AppealReasonCode[]).map((code) => (
                <option key={code} value={code}>
                  {APPEAL_REASON_METADATA[code].sw}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 italic">
              {APPEAL_REASON_METADATA[selectedReason].description}
            </p>
          </div>

          {/* Detailed Explanation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-800">
                Ufafanuzi na Sababu za Kutathmini Upya:
              </label>
              <span className="text-[10px] text-stone-400">
                {explanation.trim().length} / 2000 (angalau 10)
              </span>
            </div>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Eleza kwanini unaona uamuzi huu unapaswa kubadilishwa au kutathminiwa upya, au taja marekebisho uliyofanya..."
              rows={4}
              maxLength={2000}
              className="w-full text-xs text-stone-800 bg-white border border-stone-300 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isSubmitting || explanation.trim().length < 10}
              className="px-4 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Inawasilisha...' : 'Wasilisha Rufaa Hii'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
