import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Flag,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock
} from 'lucide-react';
import {
  ReportTargetType,
  ReportReasonCode,
  REPORT_REASON_METADATA,
  MarketplaceReportRecord
} from '../../types/marketplaceReportAndAppeal';
import { submitMarketplaceReport } from '../../services/marketplaceReportAndAppealService';
import { useAuth } from '../../context/AuthContext';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetTitle?: string;
  productId?: string | null;
  listingId?: string | null;
  sellerId?: string | null;
  shopId?: string | null;
  reviewId?: string | null;
  onReportSubmitted?: (report: MarketplaceReportRecord) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetTitle,
  productId,
  listingId,
  sellerId,
  shopId,
  reviewId,
  onReportSubmitted
}) => {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<ReportReasonCode>('MISLEADING_INFORMATION');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUserId = user?.uid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentUserId) {
      setErrorMsg('Tafadhali ingia kwenye akaunti yako ili kuwasilisha ripoti hii.');
      return;
    }

    const trimmed = description.trim();
    if (trimmed.length < 5) {
      setErrorMsg('Tafadhali toa maelezo ya kina (angalau herufi 5) ili kusaidia ukaguzi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { report } = await submitMarketplaceReport(currentUserId, user.displayName || 'Mfugaji', {
        targetType,
        targetId,
        productId: productId || (targetType === 'PRODUCT' || targetType === 'LISTING' ? targetId : null),
        listingId: listingId || (targetType === 'LISTING' ? targetId : null),
        sellerId: sellerId || (targetType === 'SELLER' ? targetId : null),
        shopId: shopId || (targetType === 'SHOP' ? targetId : null),
        reviewId: reviewId || (targetType === 'REVIEW' ? targetId : null),
        reasonCode: selectedReason,
        reasonText: trimmed
      });

      setSuccessMsg('Ripoti yako imepokelewa salama. Timu ya usimamizi itaipitia kwa umakini na haki.');
      if (onReportSubmitted) {
        onReportSubmitted(report);
      }
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
        setDescription('');
      }, 1600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Haikuweza kuwasilisha ripoti.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTargetTypeLabel = () => {
    switch (targetType) {
      case 'REVIEW':
        return 'Tathmini ya Mnunuzi (Review)';
      case 'PRODUCT':
        return 'Bidhaa ya Soko (Product)';
      case 'LISTING':
        return 'Tangazo la Bidhaa (Listing)';
      case 'SHOP':
        return 'Duka la Kidijitali (Shop)';
      case 'SELLER':
        return 'Muuzaji (Seller)';
      default:
        return 'Maudhui ya Sokoni';
    }
  };

  const reasonKeys = Object.keys(REPORT_REASON_METADATA) as ReportReasonCode[];

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
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">
                Wasilisha Ripoti ya Ukiukwaji
              </h3>
              <p className="text-xs text-stone-500">
                Inalenga: <strong className="text-stone-700">{getTargetTypeLabel()}</strong>
                {targetTitle ? ` • ${targetTitle}` : ''}
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

        {/* Governance Disclaimer (Report != Proof) */}
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs flex items-start gap-2 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <p>
            <strong>Kanuni ya Utawala:</strong> Ripoti ni taarifa ya ukiukwaji kwa ajili ya ukaguzi wa wasimamizi, si uthibitisho wa kosa wala haisababishi adhabu au kufungia kwa ghafla. Hatua za kiutawala huchukuliwa baada ya ukaguzi huru.
          </p>
        </div>

        {/* Privacy Note */}
        <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-stone-600 text-[11px] flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span>Utambulisho wako na mawasiliano binafsi yanalindwa na hayataonekana kwa umma wala kwa muuzaji.</span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">
              Chagua Sababu Kuu ya Ripoti:
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {reasonKeys.map((code) => {
                const meta = REPORT_REASON_METADATA[code];
                return (
                  <label
                    key={code}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors text-xs ${
                      selectedReason === code
                        ? 'bg-amber-50/80 border-amber-400 text-stone-900'
                        : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={code}
                      checked={selectedReason === code}
                      onChange={() => setSelectedReason(code)}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold">{meta.sw}</div>
                      <div className="text-[11px] text-stone-500 leading-snug">{meta.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700 block">
                Maelezo ya Ziada (Ufafanuzi):
              </label>
              <span className="text-[10px] text-stone-400">
                {description.trim().length}/1500 (angalau 5)
              </span>
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Taja maelezo maalum yatakayosaidia ukaguzi (mfano: mawasiliano, tofauti za picha au bei, n.k.)..."
              maxLength={1500}
              className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-900 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-stone-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !currentUserId || description.trim().length < 5}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Inawasilisha...' : 'Wasilisha Ripoti'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
