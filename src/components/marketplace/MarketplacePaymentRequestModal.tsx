import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
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

interface MarketplacePaymentRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: MarketplaceConversation;
  currentUserId: string;
  onSuccess: (paymentRequest: MarketplacePaymentRequest) => void;
}

export const MarketplacePaymentRequestModal: React.FC<MarketplacePaymentRequestModalProps> = ({
  isOpen,
  onClose,
  conversation,
  currentUserId,
  onSuccess,
}) => {
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [unitPriceInput, setUnitPriceInput] = useState<string>(
    conversation.priceSnapshot ? String(conversation.priceSnapshot) : ''
  );
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuantityInput('1');
      setUnitPriceInput(conversation.priceSnapshot ? String(conversation.priceSnapshot) : '');
      setDescription('');
      setErrorMsg(null);
    }
  }, [isOpen, conversation]);

  if (!isOpen) return null;

  // Accurately parse and calculate numbers while allowing free typing without sticky locks
  const cleanQty = quantityInput.replace(/,/g, '').trim();
  const cleanPrice = unitPriceInput.replace(/,/g, '').trim();
  const parsedQuantity = Math.max(0, parseFloat(cleanQty) || 0);
  const parsedUnitPrice = Math.max(0, parseFloat(cleanPrice) || 0);
  const totalAmount = Math.round(parsedQuantity * parsedUnitPrice);

  const isTooLow = totalAmount < MARKETPLACE_PAYMENT_CONFIG.minAmount;
  const isTooHigh = totalAmount > MARKETPLACE_PAYMENT_CONFIG.maxAmount;
  const isInvalid = parsedQuantity <= 0 || parsedUnitPrice <= 0 || isTooLow || isTooHigh;

  const handleQuantityIncrement = () => {
    const next = Math.floor(parsedQuantity) + 1;
    setQuantityInput(String(next));
  };

  const handleQuantityDecrement = () => {
    const next = Math.max(1, Math.ceil(parsedQuantity) - 1);
    setQuantityInput(String(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedQuantity <= 0) {
      setErrorMsg('Tafadhali weka idadi (quantity) sahihi zaidi ya 0.');
      return;
    }
    if (parsedUnitPrice <= 0) {
      setErrorMsg('Tafadhali weka bei sahihi kwa moja (unit price).');
      return;
    }
    if (isTooLow) {
      setErrorMsg(`Jumla ya malipo lazima iwe angalau TSh ${MARKETPLACE_PAYMENT_CONFIG.minAmount.toLocaleString()}.`);
      return;
    }
    if (isTooHigh) {
      setErrorMsg(`Jumla ya malipo haitakiwi kuzidi TSh ${MARKETPLACE_PAYMENT_CONFIG.maxAmount.toLocaleString()}.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const created = await marketplacePaymentRequestService.createPaymentRequest(
        {
          conversationId: conversation.conversationId,
          quantity: parsedQuantity,
          unitPrice: Math.round(parsedUnitPrice),
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
          {/* Trust Banner */}
          <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-950">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Muuzaji Aliyethibitishwa:</span> Malipo
              yatakayofanywa na mnunuzi yatahifadhiwa salama kwenye mfumo wa Ufugaji Update
              mpaka bidhaa itakapofika.
            </div>
          </div>

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
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handleQuantityDecrement}
                  disabled={isSubmitting || parsedQuantity <= 1}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold border border-r-0 border-stone-300 rounded-l-xl transition-colors cursor-pointer disabled:opacity-40 min-h-[42px]"
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantityInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    const parts = val.split('.');
                    if (parts.length > 2) return;
                    setQuantityInput(val);
                  }}
                  placeholder="1"
                  required
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 text-center bg-white border border-stone-300 text-xs sm:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[42px]"
                />
                <button
                  type="button"
                  onClick={handleQuantityIncrement}
                  disabled={isSubmitting}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold border border-l-0 border-stone-300 rounded-r-xl transition-colors cursor-pointer min-h-[42px]"
                >
                  +
                </button>
              </div>
              <p className="text-[10.5px] text-stone-500 mt-1">
                Kipimo: {parsedQuantity > 0 ? `${parsedQuantity} idadi` : 'Ingiza idadi'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Bei kwa moja (Unit Price - TZS) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={unitPriceInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = val.split('.');
                  if (parts.length > 2) return;
                  setUnitPriceInput(val);
                }}
                placeholder="Mfano: 25000"
                required
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[42px]"
              />
              <div className="flex items-center justify-between text-[10.5px] text-stone-500 mt-1">
                <span>Bei kwa kipimo:</span>
                <span className="font-bold text-stone-800 font-mono">
                  {parsedUnitPrice > 0 ? `TSh ${Math.round(parsedUnitPrice).toLocaleString()}` : '0 TZS'}
                </span>
              </div>
            </div>
          </div>

          {/* Total Calculation Display */}
          <div className="p-4 bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-stone-700 shadow-sm">
            <div>
              <p className="text-[11px] text-stone-300 font-medium">Jumla ya Malipo (Total = Idadi × Bei):</p>
              <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                TSh {totalAmount.toLocaleString()}
              </p>
            </div>
            <div className="sm:text-right text-xs text-stone-300 bg-white/5 sm:bg-transparent p-2.5 sm:p-0 rounded-xl">
              <span className="font-semibold text-stone-200">
                {parsedQuantity} × TSh {Math.round(parsedUnitPrice).toLocaleString()}
              </span>
              <p className="text-[11px] text-emerald-400 font-bold mt-0.5">Sarafu: TZS</p>
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
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Validation Warnings */}
          {isTooLow && (
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
