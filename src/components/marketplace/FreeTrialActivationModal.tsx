import React, { useState } from 'react';
import { Sparkles, Check, Loader2, X, ShieldCheck } from 'lucide-react';
import { SellerMonetizationRecord } from '../../types/sellerMonetization';
import { activateSellerFreeTrialAPI } from '../../services/sellerMonetizationService';
import { useAuth } from '../../context/AuthContext';

export interface FreeTrialActivationModalProps {
  isOpen: boolean;
  sellerUserId: string;
  sellerProfileId?: string;
  originAction?: 'CREATE_LISTING' | 'DIRECT_CTA' | 'CATALOGUES' | 'PUBLISH_SHOP' | string;
  entryPoint?: 'SELLER_MAIN_CTA' | 'WEKA_TANGAZO_CTA' | 'CATALOGUE_CTA' | 'SHOP_PUBLISH_CTA' | string;
  onClose: () => void;
  onSuccess: (updatedRecord: SellerMonetizationRecord, originAction?: string) => void;
}

export const FreeTrialActivationModal: React.FC<FreeTrialActivationModalProps> = ({
  isOpen,
  sellerUserId,
  sellerProfileId,
  originAction = 'DIRECT_CTA',
  entryPoint,
  onClose,
  onSuccess
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resolveEntryPoint = (): string => {
    if (entryPoint) return entryPoint;
    switch (originAction) {
      case 'CREATE_LISTING':
        return 'WEKA_TANGAZO_CTA';
      case 'CATALOGUES':
        return 'CATALOGUE_CTA';
      case 'PUBLISH_SHOP':
        return 'SHOP_PUBLISH_CTA';
      case 'DIRECT_CTA':
      default:
        return 'SELLER_MAIN_CTA';
    }
  };

  const handleActivate = async () => {
    if (isSubmitting) return; // Prevent double submission
    setIsSubmitting(true);
    setError(null);

    try {
      const token = user ? await user.getIdToken().catch(() => null) : null;
      const resolvedEntryPoint = resolveEntryPoint();
      const commandId = `cmd_act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Authoritative command execution via unified API helper
      const res = await activateSellerFreeTrialAPI(sellerUserId, sellerProfileId, token, {
        entryPoint: resolvedEntryPoint,
        commandId
      });

      // Crucial requirement: No success UI or notification unless authoritative command confirms success
      if (res.success && res.record && res.record.status === 'TRIAL_ACTIVE') {
        onSuccess(res.record, originAction);
      } else {
        setError(res.error || res.message || 'Imeshindikana kuwasha Free Trial. Tafadhali jaribu tena.');
      }
    } catch (err: any) {
      setError(err?.message || 'Hitilafu ya mtandao wakati wa kuwasha usajili.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-trial-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-150 relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Funga"
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 flex items-center justify-center font-bold text-sm cursor-pointer transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="space-y-2 pr-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/90 text-amber-900 font-extrabold text-[11px] uppercase tracking-wider border border-amber-200/80">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Ofa ya Kipekee</span>
          </div>

          <h2 id="free-trial-modal-title" className="text-xl sm:text-2xl font-black text-stone-900 leading-tight">
            Mwezi wa Kwanza Bure
          </h2>

          <p className="text-xs sm:text-sm text-stone-600 font-medium leading-relaxed">
            Washa Free Trial yako ili uanze kuuza kwenye Gulio.
          </p>
        </div>

        {/* Governed Benefits List */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2.5 text-xs text-stone-800 font-bold">
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>Siku 30 za bure</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-stone-800 font-bold">
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>Weka matangazo ya bidhaa</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-stone-800 font-bold">
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>Tumia Catalogues</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-stone-800 font-bold">
            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>Duka lako linaweza kuonekana Gulioni</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-stone-700 font-semibold pt-2 border-t border-amber-200/60">
            <div className="w-5 h-5 rounded-full bg-amber-200/70 text-amber-900 flex items-center justify-center shrink-0 text-[10px] font-black">
              ✓
            </div>
            <span>Baada ya siku 30: TSh 1,000 / mwezi</span>
          </div>
        </div>

        {/* Pricing Guarantee Callout */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50 border border-stone-200/80 text-xs">
          <span className="text-stone-600 font-medium">Gharama ya Leo:</span>
          <span className="font-black text-emerald-700 text-sm">TSh 0 (Siku 30)</span>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleActivate}
            disabled={isSubmitting}
            className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Inawasha Free Trial...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Washa Free Trial</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto py-3 px-5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm cursor-pointer transition-colors disabled:opacity-50 text-center"
          >
            Si sasa
          </button>
        </div>
      </div>
    </div>
  );
};
