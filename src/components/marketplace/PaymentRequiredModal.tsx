import React from 'react';
import { Clock, XCircle, CreditCard, X } from 'lucide-react';
import { SellerMonetizationStatus } from '../../types/sellerMonetization';

interface PaymentRequiredModalProps {
  isOpen: boolean;
  status: SellerMonetizationStatus;
  onClose: () => void;
  onProceedToPayment: () => void;
}

export const PaymentRequiredModal: React.FC<PaymentRequiredModalProps> = ({
  isOpen,
  status,
  onClose,
  onProceedToPayment
}) => {
  if (!isOpen) return null;

  const isGrace = status === 'GRACE_PERIOD';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-stone-200 space-y-5 animate-in zoom-in-95 duration-150 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Funga"
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
              isGrace
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300'
            }`}
          >
            {isGrace ? <Clock className="w-6 h-6 text-amber-700" /> : <XCircle className="w-6 h-6 text-rose-700" />}
          </div>
          <div className="space-y-0.5">
            <span
              className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isGrace
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {isGrace ? 'Grace Period' : 'Usajili Umeisha'}
            </span>
            <h3 className="text-base sm:text-lg font-black text-stone-900">
              {isGrace ? 'Usajili wako wa bure umeisha' : 'Usajili wako umeisha'}
            </h3>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-stone-600 font-medium leading-relaxed">
          Lipa TSh 1,000 ili kuendelea kuuza {isGrace ? 'kwenye Gulio na kurudisha duka lako hewani.' : 'na kurudisha duka hewani.'}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onProceedToPayment}
            className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            <span>Lipa TSh 1,000</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3 px-5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer transition-colors text-center"
          >
            Funga
          </button>
        </div>
      </div>
    </div>
  );
};
