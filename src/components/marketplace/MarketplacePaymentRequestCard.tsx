import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  RefreshCw,
  Ban
} from 'lucide-react';
import {
  MarketplacePaymentRequest,
  MarketplacePaymentRequestStatus
} from '../../types/marketplacePaymentRequest';
import { marketplacePaymentRequestService } from '../../services/marketplacePaymentRequestService';

interface MarketplacePaymentRequestCardProps {
  request: MarketplacePaymentRequest;
  currentUserId: string;
  onPayClick: (request: MarketplacePaymentRequest) => void;
  onStatusUpdated?: (updated: MarketplacePaymentRequest) => void;
}

export const MarketplacePaymentRequestCard: React.FC<MarketplacePaymentRequestCardProps> = ({
  request,
  currentUserId,
  onPayClick,
  onStatusUpdated,
}) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isBuyer = currentUserId === request.buyerUserId;
  const isSeller = currentUserId === request.sellerUserId;

  const handleCancel = async () => {
    if (!window.confirm('Je, una uhakika unataka kughairi ombi hili la malipo?')) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const updated = await marketplacePaymentRequestService.cancelPaymentRequest(
        request.paymentRequestId,
        currentUserId
      );
      if (onStatusUpdated) onStatusUpdated(updated);
    } catch (err: any) {
      setCancelError(err.message || 'Hitilafu ya kughairi ombi.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (status: MarketplacePaymentRequestStatus) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Malipo yamekamilika
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            Malipo yanachakatwa
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            Malipo hayakukamilika
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 border border-stone-300">
            <Ban className="w-3.5 h-3.5 text-stone-500" />
            Ombi la malipo limeghairiwa
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <XCircle className="w-3.5 h-3.5 text-amber-600" />
            Ombi la malipo limekwisha muda
          </span>
        );
      case 'PENDING_PAYMENT':
      case 'DRAFT':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Linalosubiri Malipo
          </span>
        );
    }
  };

  return (
    <div className="w-full my-2 bg-white rounded-2xl border border-stone-200/90 shadow-sm overflow-hidden text-stone-900">
      {/* Header bar */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4 text-emerald-300" />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight">
              {isBuyer ? 'Muuzaji amekutumia ombi la malipo' : 'Ombi la Malipo kwa Mnunuzi'}
            </p>
            <p className="text-[10px] text-emerald-200">
              Ufugaji Update Governed Marketplace Payment
            </p>
          </div>
        </div>
        <div className="shrink-0">{getStatusBadge(request.status)}</div>
      </div>

      {/* Card Details */}
      <div className="p-4 space-y-3 text-xs">
        {/* Product & commercial breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-stone-100">
          <div>
            <span className="text-[10px] text-stone-400 font-semibold uppercase">Bidhaa</span>
            <p className="font-bold text-stone-900 text-sm truncate">
              {request.productTitleSnapshot}
            </p>
            <p className="text-[11px] text-stone-500">
              Muuzaji: <span className="font-semibold text-stone-700">{request.sellerNameSnapshot}</span>
            </p>
          </div>

          <div className="sm:text-right">
            <span className="text-[10px] text-stone-400 font-semibold uppercase">Jumla ya Malipo</span>
            <p className="text-lg font-extrabold text-emerald-700 font-mono">
              TSh {request.totalAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-stone-500">
              {request.quantity} × TSh {request.unitPrice.toLocaleString()} ({request.currency})
            </p>
          </div>
        </div>

        {/* Description snapshot */}
        {request.description && (
          <div className="p-2.5 bg-stone-50 rounded-xl text-stone-700 text-xs italic border border-stone-100">
            "{request.description}"
          </div>
        )}

        {/* Error during cancel */}
        {cancelError && (
          <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            {cancelError}
          </div>
        )}

        {/* Action Buttons based on status & role */}
        <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
          {/* BUYER ACTIONS */}
          {isBuyer && (
            <>
              {request.status === 'PENDING_PAYMENT' && (
                <button
                  type="button"
                  onClick={() => onPayClick(request)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Lipa Sasa (TSh {request.totalAmount.toLocaleString()})</span>
                </button>
              )}

              {request.status === 'PROCESSING' && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onPayClick(request)}
                    className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Angalia Hali ya Malipo</span>
                  </button>
                  <span className="text-[11px] text-stone-500">Ingiza PIN kwenye simu yako</span>
                </div>
              )}

              {request.status === 'FAILED' && (
                <button
                  type="button"
                  onClick={() => onPayClick(request)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Jaribu Tena Kulipa</span>
                </button>
              )}

              {request.status === 'SUCCESS' && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Malipo yamekamilika (Yanalindwa kwenye mfumo wa Ufugaji Update)</span>
                </div>
              )}

              {request.status === 'CANCELLED' && (
                <span className="text-xs text-stone-500 font-medium">
                  Ombi la malipo limeghairiwa na muuzaji.
                </span>
              )}

              {request.status === 'EXPIRED' && (
                <span className="text-xs text-stone-500 font-medium">
                  Ombi la malipo limekwisha muda. Wasiliana na muuzaji akutengenezee jipya.
                </span>
              )}
            </>
          )}

          {/* SELLER ACTIONS */}
          {isSeller && (
            <>
              {request.status === 'PENDING_PAYMENT' && (
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-amber-700 font-medium">
                    Linalosubiri malipo ya mnunuzi...
                  </span>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {isCancelling ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Ban className="w-3 h-3" />
                    )}
                    <span>Ghairi Ombi</span>
                  </button>
                </div>
              )}

              {request.status === 'PROCESSING' && (
                <span className="text-xs text-blue-700 font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  Mnunuzi anachakata malipo kwenye simu yake...
                </span>
              )}

              {request.status === 'SUCCESS' && (
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Malipo yamekamilika na yamehifadhiwa salama kwenye mfumo!
                </span>
              )}

              {request.status === 'CANCELLED' && (
                <span className="text-xs text-stone-500">
                  Umeghairi ombi hili la malipo.
                </span>
              )}

              {request.status === 'EXPIRED' && (
                <span className="text-xs text-stone-500">
                  Ombi hili limekwisha muda. Unaweza kutuma ombi jipya.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
