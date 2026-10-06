import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Loader2,
  Package,
  User,
  Info
} from 'lucide-react';
import { MarketplaceConversation } from '../../types/marketplaceInbox';
import {
  MarketplacePaymentRequest,
  MARKETPLACE_PAYMENT_CONFIG
} from '../../types/marketplacePaymentRequest';
import { marketplacePaymentRequestService } from '../../services/marketplacePaymentRequestService';
import { sellerVerificationService } from '../../services/sellerVerificationService';

interface MarketplacePaymentRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: MarketplaceConversation;
  currentUserId: string;
  existingRequests?: MarketplacePaymentRequest[];
  onSuccess: (paymentRequest: MarketplacePaymentRequest) => void;
}

export const MarketplacePaymentRequestModal: React.FC<MarketplacePaymentRequestModalProps> = ({
  isOpen,
  onClose,
  conversation,
  currentUserId,
  existingRequests = [],
  onSuccess,
}) => {
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [unitPriceInput, setUnitPriceInput] = useState<string>(
    conversation.priceSnapshot && conversation.priceSnapshot > 0
      ? String(conversation.priceSnapshot)
      : '1000'
  );
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Authoritative seller verification check (V1.11C-CORRECTIVE-1)
  const sellerBadge = sellerVerificationService.getPublicSellerBadge(currentUserId);
  const isSellerVerified = Boolean(sellerBadge && sellerBadge.isVerified && sellerBadge.badgeStatus === 'ACTIVE');

  // Check for active pending/processing request in this conversation
  const hasActiveRequest = existingRequests.some(
    (r) => r.status === 'PENDING_PAYMENT' || r.status === 'PROCESSING'
  );

  useEffect(() => {
    if (isOpen) {
      setQuantityInput('1');
      setUnitPriceInput(
        conversation.priceSnapshot && conversation.priceSnapshot > 0
          ? String(conversation.priceSnapshot)
          : '1000'
      );
      setDescription('');
      setErrorMsg(null);
    }
  }, [isOpen, conversation]);

  if (!isOpen) return null;

  const parsedQuantity = parseInt(quantityInput, 10) || 0;
  const parsedUnitPrice = parseInt(unitPriceInput, 10) || 0;
  const totalAmount = Math.max(0, Math.floor(parsedQuantity * parsedUnitPrice));

  const isTooLow = totalAmount < MARKETPLACE_PAYMENT_CONFIG.minAmount;
  const isTooHigh = totalAmount > MARKETPLACE_PAYMENT_CONFIG.maxAmount;
  const isInvalid =
    !isSellerVerified ||
    hasActiveRequest ||
    isTooLow ||
    isTooHigh ||
    parsedQuantity <= 0 ||
    parsedUnitPrice <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalid) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const created = await marketplacePaymentRequestService.createPaymentRequest(
        {
          conversationId: conversation.conversationId,
          quantity: parsedQuantity,
          unitPrice: parsedUnitPrice,
          description: description.trim() || undefined,
        },
        currentUserId
      );

      onSuccess(created);
      onClose();
    } catch (err: any) {
      console.error('[MarketplacePaymentRequestModal] Error creating payment request:', err);
      setErrorMsg(
        err.message || 'Hitilafu ya seva wakati wa kutengeneza ombi la malipo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 leading-tight">
                Request Payment
              </h3>
              <p className="text-xs text-stone-500">Tuma ombi la malipo salama kwa mnunuzi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Trust Banner or Unverified Warning */}
          {isSellerVerified ? (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-950">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">Muuzaji Aliyethibitishwa:</span> Malipo
                yatakayofanywa na mnunuzi yatahifadhiwa salama kwenye mfumo wa Ufugaji Update
                mpaka bidhaa itakapofika.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">Uhakiki Unahitajika:</span> Malipo kupitia jukwaa yanapatikana
                kwa muuzaji aliyethibitishwa pekee mwenye beji iliyo ACTIVE. Tafadhali thibitisha akaunti yako
                kwenye sehemu ya Wasifu ili kuwezesha maombi ya malipo.
              </div>
            </div>
          )}

          {/* Active Request Warning if applicable */}
          {hasActiveRequest && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">Ombi Lipo Tayari:</span> Kuna ombi la malipo linalosubiri au
                linalochakatwa tayari katika mazungumzo haya. Huwezi kuunda ombi jipya mpaka la awali likamilike au lighairiwe.
              </div>
            </div>
          )}

          {/* Bound Context Snapshots (Read-Only) */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-stone-600 pb-2 border-b border-stone-200">
              <span className="flex items-center gap-1.5 font-medium text-stone-500">
                <Package className="w-3.5 h-3.5 text-stone-400" />
                Bidhaa & Tangazo:
              </span>
              <span className="font-bold text-stone-900 text-right truncate max-w-[240px]">
                {conversation.productTitleSnapshot}
              </span>
            </div>

            <div className="flex items-center justify-between text-stone-600">
              <span className="flex items-center gap-1.5 font-medium text-stone-500">
                <User className="w-3.5 h-3.5 text-stone-400" />
                Mnunuzi:
              </span>
              <span className="font-semibold text-stone-800">
                {conversation.buyerNameSnapshot || 'Mnunuzi'}
              </span>
            </div>

            {conversation.priceSnapshot && conversation.priceSnapshot > 0 && (
              <div className="flex items-center justify-between text-stone-600 pt-1 border-t border-stone-200/60 text-[11px]">
                <span className="text-stone-500">Bei ya Tangazo kwenye Gulio:</span>
                <span className="font-mono text-stone-700 font-medium">
                  TSh {conversation.priceSnapshot.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Quantity and Unit Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Quantity (Idadi) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  if (!quantityInput || parseInt(quantityInput, 10) < 1) {
                    setQuantityInput('1');
                  }
                }}
                required
                disabled={isSubmitting || !isSellerVerified || hasActiveRequest}
                className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[42px] disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Bei kwa moja (Unit Price - TZS) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={unitPriceInput}
                onChange={(e) => setUnitPriceInput(e.target.value.replace(/\D/g, ''))}
                onBlur={() => {
                  if (!unitPriceInput) {
                    setUnitPriceInput('0');
                  }
                }}
                required
                disabled={isSubmitting || !isSellerVerified || hasActiveRequest}
                className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[42px] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Total Calculation Display */}
          <div className="p-3.5 bg-stone-900 text-white rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] text-stone-400 font-medium">Jumla ya Malipo (Total):</p>
              <p className="text-lg font-extrabold text-emerald-400 font-mono">
                TSh {totalAmount.toLocaleString()}
              </p>
            </div>
            <div className="text-right text-[11px] text-stone-400">
              <span>{parsedQuantity} × TSh {parsedUnitPrice.toLocaleString()}</span>
              <p className="text-stone-300 font-semibold">Sarafu: TZS</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Maelezo (Hiari)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="k.m. Ng'ombe mmoja mwenye afya kama tulivyokubaliana..."
              maxLength={500}
              disabled={isSubmitting || !isSellerVerified || hasActiveRequest}
              className="w-full px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
            />
          </div>

          {/* Validation Warnings */}
          {isTooLow && parsedQuantity > 0 && parsedUnitPrice > 0 && (
            <p className="text-xs text-rose-600 flex items-center gap-1.5 font-medium">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Kiasi cha chini cha malipo ni TSh {MARKETPLACE_PAYMENT_CONFIG.minAmount.toLocaleString()}.
            </p>
          )}

          {isTooHigh && (
            <p className="text-xs text-rose-600 flex items-center gap-1.5 font-medium">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Kiasi cha juu cha malipo ni TSh {MARKETPLACE_PAYMENT_CONFIG.maxAmount.toLocaleString()}.
            </p>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-snug">{errorMsg}</div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer min-h-[42px]"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isInvalid || isSubmitting}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[42px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Inatuma ombi...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Tuma Ombi la Malipo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
