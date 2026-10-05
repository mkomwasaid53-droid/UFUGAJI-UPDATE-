import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Smartphone,
  RefreshCw,
  Clock,
  ArrowRight
} from 'lucide-react';
import { MarketplacePaymentRequest } from '../../types/marketplacePaymentRequest';
import { marketplacePaymentRequestService } from '../../services/marketplacePaymentRequestService';

interface MarketplaceBuyerPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: MarketplacePaymentRequest;
  currentUserId: string;
  onPaymentSuccess?: (updated: MarketplacePaymentRequest) => void;
}

export const MarketplaceBuyerPayModal: React.FC<MarketplaceBuyerPayModalProps> = ({
  isOpen,
  onClose,
  paymentRequest,
  currentUserId,
  onPaymentSuccess,
}) => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [providerNetwork, setProviderNetwork] = useState<string>('Mpesa');
  const [currentRequest, setCurrentRequest] = useState<MarketplacePaymentRequest>(paymentRequest);
  const [isInitiating, setIsInitiating] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentRequest(paymentRequest);
      setErrorMsg(null);
      setInstructions(null);
      setIsInitiating(false);
      setIsPolling(false);
    }
  }, [isOpen, paymentRequest]);

  // Automatic polling when status is PROCESSING
  useEffect(() => {
    if (!isOpen || currentRequest.status !== 'PROCESSING') return;

    const interval = setInterval(async () => {
      try {
        const latest = await marketplacePaymentRequestService.getPaymentStatus(
          currentRequest.paymentRequestId,
          currentUserId
        );
        if (latest) {
          setCurrentRequest(latest);
          if (latest.status === 'SUCCESS') {
            if (onPaymentSuccess) onPaymentSuccess(latest);
            clearInterval(interval);
          } else if (latest.status === 'FAILED') {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn('[MarketplaceBuyerPayModal] Poll interval error:', err);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isOpen, currentRequest.status, currentRequest.paymentRequestId, currentUserId, onPaymentSuccess]);

  if (!isOpen) return null;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setErrorMsg('Tafadhali weka namba sahihi ya simu ya Tanzania.');
      return;
    }

    setIsInitiating(true);
    setErrorMsg(null);

    try {
      const result = await marketplacePaymentRequestService.initiatePayment(
        {
          paymentRequestId: currentRequest.paymentRequestId,
          buyerPhone: phoneNumber.trim(),
          providerNetwork,
        },
        currentUserId
      );

      if (result.success) {
        setInstructions(result.instructions);
        const latest = await marketplacePaymentRequestService.getPaymentRequest(
          currentRequest.paymentRequestId,
          currentUserId
        );
        if (latest) {
          setCurrentRequest(latest);
          if (latest.status === 'SUCCESS' && onPaymentSuccess) {
            onPaymentSuccess(latest);
          }
        }
      } else {
        setErrorMsg(result.errorMessage || 'Mtoa huduma alikataa kuanzisha malipo.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu ya kuanzisha malipo.');
    } finally {
      setIsInitiating(false);
    }
  };

  const handleManualCheckStatus = async () => {
    setIsPolling(true);
    setErrorMsg(null);
    try {
      const latest = await marketplacePaymentRequestService.getPaymentStatus(
        currentRequest.paymentRequestId,
        currentUserId
      );
      if (latest) {
        setCurrentRequest(latest);
        if (latest.status === 'SUCCESS' && onPaymentSuccess) {
          onPaymentSuccess(latest);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Imeshindwa kuangalia hali ya malipo.');
    } finally {
      setIsPolling(false);
    }
  };

  const handleRetry = async () => {
    setIsInitiating(true);
    setErrorMsg(null);
    try {
      const result = await marketplacePaymentRequestService.retryPayment(
        currentRequest.paymentRequestId,
        currentUserId,
        {
          buyerPhone: phoneNumber.trim(),
          providerNetwork,
        }
      );
      if (result.success) {
        setInstructions(result.instructions);
        const latest = await marketplacePaymentRequestService.getPaymentRequest(
          currentRequest.paymentRequestId,
          currentUserId
        );
        if (latest) setCurrentRequest(latest);
      } else {
        setErrorMsg(result.errorMessage || 'Imeshindwa kuanzisha tena malipo.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu wakati wa kurudia malipo.');
    } finally {
      setIsInitiating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 leading-tight">
                Lipa kwa Simu (PlusPesa)
              </h3>
              <p className="text-xs text-stone-500">Ombi la Malipo ya Gulio</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* Summary Card */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-stone-500">Bidhaa / Tangazo:</p>
                <p className="text-sm font-bold text-stone-900 leading-tight">
                  {currentRequest.productTitleSnapshot}
                </p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Muuzaji: <span className="font-semibold text-stone-800">{currentRequest.sellerNameSnapshot}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-stone-400">Kiasi</span>
                <p className="text-base font-extrabold text-emerald-700 font-mono">
                  TSh {currentRequest.totalAmount.toLocaleString()}
                </p>
                <p className="text-[11px] text-stone-500">
                  {currentRequest.quantity} × TSh {currentRequest.unitPrice.toLocaleString()}
                </p>
              </div>
            </div>

            {currentRequest.description && (
              <div className="pt-2 border-t border-stone-200/70 text-xs text-stone-600 italic">
                "{currentRequest.description}"
              </div>
            )}
          </div>

          {/* STATUS: SUCCESS */}
          {currentRequest.status === 'SUCCESS' && (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-stone-900">Malipo Yamekamilika!</h4>
                <p className="text-xs text-stone-600 max-w-xs mx-auto leading-relaxed">
                  Malipo ya TSh {currentRequest.totalAmount.toLocaleString()} yamepokelewa na
                  kuhifadhiwa salama kwenye jukwaa. Muuzaji amearifiwa kuanza maandalizi ya bidhaa.
                </p>
              </div>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Funga
                </button>
              </div>
            </div>
          )}

          {/* STATUS: PROCESSING */}
          {currentRequest.status === 'PROCESSING' && (
            <div className="py-5 text-center space-y-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-amber-900">
                  Malipo Yanachakatwa kwenye Simu Yako
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed px-2">
                  {instructions ||
                    'Tafadhali ingiza namba yako ya siri (PIN) ya mtandao wako wa simu kukamilisha muamala.'}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isPolling}
                  className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin' : ''}`} />
                  <span>{isPolling ? 'Inakagua hali...' : 'Kagua Hali ya Malipo'}</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 text-stone-500 hover:text-stone-700 text-xs font-semibold"
                >
                  Endelea kwenye Mazungumzo
                </button>
              </div>
            </div>
          )}

          {/* STATUS: FAILED */}
          {currentRequest.status === 'FAILED' && (
            <div className="py-4 space-y-3">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Malipo Hayakukamilika:</span>{' '}
                  {currentRequest.failureReason || 'Muamala ulikataliwa au muda uliisha.'}
                </div>
              </div>

              <p className="text-xs text-stone-500 text-center">
                Unaweza kujaribu tena kwa kuweka namba sahihi au kuchagua mtandao mwingine.
              </p>

              <button
                type="button"
                onClick={handleRetry}
                disabled={isInitiating}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isInitiating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Inajaribu tena...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Jaribu Tena Kulipa</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STATUS: PENDING_PAYMENT (Standard Form) */}
          {currentRequest.status === 'PENDING_PAYMENT' && (
            <form onSubmit={handlePay} className="space-y-4">
              {/* Trust Badge */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold">Ulinzi wa Mnunuzi:</span> Pesa zako hazitatumwa
                  kwa muuzaji mara moja; zitalindwa kwenye mfumo hadi utakapoliridhia tangazo.
                </div>
              </div>

              {/* Network Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Chagua Mtandao wa Malipo:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'Mpesa', label: 'Vodacom M-Pesa' },
                    { id: 'Tigo', label: 'Tigo Pesa' },
                    { id: 'Airtel', label: 'Airtel Money' },
                    { id: 'Halopesa', label: 'Halopesa' },
                    { id: 'Azampesa', label: 'AzamPesa' },
                  ].map((net) => (
                    <button
                      key={net.id}
                      type="button"
                      onClick={() => setProviderNetwork(net.id)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        providerNetwork === net.id
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 font-medium'
                      } text-xs`}
                    >
                      {net.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone Input */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Namba ya Simu ya Kufanyia Malipo <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="07XXXXXXXX au 2557XXXXXXXX"
                  required
                  disabled={isInitiating}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[44px]"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  Weka namba utakayopokea ujumbe wa kuweka PIN ya uthibitisho.
                </p>
              </div>

              {/* Error Notice */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="leading-snug">{errorMsg}</div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isInitiating || !phoneNumber.trim()}
                  className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[46px]"
                >
                  {isInitiating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Inaanzisha muamala wa PlusPesa...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>
                        Lipa TSh {currentRequest.totalAmount.toLocaleString()} Sasa
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STATUS: CANCELLED OR EXPIRED */}
          {(currentRequest.status === 'CANCELLED' || currentRequest.status === 'EXPIRED') && (
            <div className="py-4 text-center space-y-2">
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-600 font-medium">
                {currentRequest.status === 'CANCELLED'
                  ? 'Ombi hili la malipo limeghairiwa na muuzaji.'
                  : 'Ombi hili la malipo limekwisha muda (Expired).'}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-xs"
              >
                Funga
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
