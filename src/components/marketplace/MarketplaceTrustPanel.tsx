import React from 'react';
import { ProductTrustSignals, ShopTrustSignals } from '../../types/marketplaceTrust';
import {
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Tag,
  Package,
  Truck,
  Store,
  Star,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';

interface MarketplaceTrustPanelProps {
  signals: ProductTrustSignals | ShopTrustSignals;
  compact?: boolean;
  showTitle?: boolean;
  className?: string;
}

export const MarketplaceTrustPanel: React.FC<MarketplaceTrustPanelProps> = ({
  signals,
  compact = false,
  showTitle = true,
  className = ''
}) => {
  const isProduct = 'productId' in signals;
  const productSignals = isProduct ? (signals as ProductTrustSignals) : null;

  return (
    <div
      id={`trust-panel-${isProduct ? productSignals?.productId : signals.shopId}`}
      className={`bg-stone-50/80 rounded-2xl border border-stone-200/90 overflow-hidden ${className}`}
    >
      {/* Panel Header */}
      {showTitle && (
        <div className="px-4 py-3 bg-stone-100/90 border-b border-stone-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-amber-600/10 rounded-lg text-amber-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-900 tracking-wide uppercase">
                Ukaguzi wa Taarifa za Uaminifu (Trust Panel)
              </h4>
              <p className="text-[10px] text-stone-500">
                Ushahidi wa taarifa mahususi zilizorekodiwa kwenye mfumo
              </p>
            </div>
          </div>

          <span
            className="text-[9.5px] font-semibold text-stone-600 bg-stone-200/70 px-2 py-0.5 rounded border border-stone-300"
            title="Hakuna alama ya '100% Guaranteed'. Kila kipengele kinathibitishwa kivyake."
          >
            Bila Dhamana Feki
          </span>
        </div>
      )}

      {/* Discrepancy / Conflict Alert if description contradicts structured data */}
      {isProduct && productSignals && (productSignals.price.hasDescriptionConflict || productSignals.stock.hasDescriptionConflict || productSignals.location.hasDescriptionConflict || productSignals.delivery.hasDescriptionConflict) && (
        <div className="m-3 p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Tahadhari ya Ukinzani wa Maelezo (Listing Discrepancy):</span>
          </div>
          <p className="text-[11px] text-amber-900/90">
            {productSignals.price.conflictNotice ||
              productSignals.stock.conflictNotice ||
              productSignals.location.conflictNotice ||
              productSignals.delivery.conflictNotice ||
              'Maelezo ya maandishi yanapingana na data rasmi za mfumo. Data rasmi za mfumo ndizo zinazotambulika.'}
          </p>
        </div>
      )}

      {/* Signals Grid */}
      <div className={`p-3 sm:p-4 grid gap-2.5 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {/* 1. Seller Verification */}
        <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-stone-600 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
              <span>Utambulisho wa Muuzaji:</span>
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${
                signals.sellerVerification.isVerified
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-stone-100 text-stone-600 border-stone-200'
              }`}
            >
              {signals.sellerVerification.isVerified ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Aliyethibitishwa</span>
                </>
              ) : (
                <>
                  <HelpCircle className="w-3 h-3 text-stone-400" />
                  <span>Haijahakikiwa</span>
                </>
              )}
            </span>
          </div>
          <p className="text-[10px] text-stone-500 leading-relaxed">
            {signals.sellerVerification.disclaimer}
          </p>
        </div>

        {/* 2. Shop Status */}
        <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-stone-600 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-stone-500" />
              <span>Duka / Mmliki:</span>
            </span>
            <span className="text-[10.5px] font-bold text-stone-800 truncate max-w-[140px]">
              {isProduct ? productSignals?.shop.shopName || 'Bila Duka Rasmi' : signals.shopName}
            </span>
          </div>
          <p className="text-[10px] text-stone-500 leading-relaxed">
            {isProduct && productSignals?.shop.ownershipNotice
              ? productSignals.shop.ownershipNotice
              : 'Duka lililosajiliwa kwenye kituo cha biashara cha Gulio.'}
          </p>
        </div>

        {/* 3. Price Status (Product only) */}
        {isProduct && productSignals && (
          <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-stone-600 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-stone-500" />
                <span>Hali ya Bei:</span>
              </span>
              <span className="text-[10.5px] font-extrabold text-emerald-800">
                {productSignals.price.displayPrice}
                {productSignals.price.unit && (
                  <span className="text-[9.5px] font-normal text-stone-500"> / {productSignals.price.unit}</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-stone-500">
              <span>Muda: {productSignals.price.lastUpdatedText || 'Haijasasishwa'}</span>
              {productSignals.price.isStale && (
                <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                  Bei ya Zamani (&gt;90d)
                </span>
              )}
            </div>
          </div>
        )}

        {/* 4. Stock Status (Product only) */}
        {isProduct && productSignals && (
          <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-stone-600 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-stone-500" />
                <span>Hali ya Mzigo (Stock):</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  productSignals.stock.status === 'IN_STOCK'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : productSignals.stock.status === 'OUT_OF_STOCK'
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {productSignals.stock.status === 'IN_STOCK'
                  ? `${productSignals.stock.quantity} Inapatikana`
                  : productSignals.stock.displayStock}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-stone-500">
              <span>Ilisasishwa: {productSignals.stock.lastUpdatedText || 'Haijasasishwa'}</span>
              {productSignals.stock.isStale && (
                <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                  Mzigo wa Zamani (&gt;90d)
                </span>
              )}
            </div>
          </div>
        )}

        {/* 5. Location Status */}
        <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-stone-600 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-stone-500" />
              <span>Eneo Lililorekodiwa:</span>
            </span>
            <span className="text-[10.5px] font-bold text-stone-800 truncate max-w-[140px]">
              {signals.location.displayLocation}
            </span>
          </div>
          <p className="text-[10px] text-stone-500 leading-relaxed">
            {signals.location.disclaimer}
          </p>
        </div>

        {/* 6. Delivery & Pickup Status (Product only) */}
        {isProduct && productSignals && (
          <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-stone-600 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-stone-500" />
                <span>Usafirishaji (Delivery):</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  productSignals.delivery.deliveryAvailable
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : productSignals.pickup.pickupAvailable
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {productSignals.delivery.deliveryAvailable
                  ? productSignals.delivery.feeType === 'FREE'
                    ? 'Delivery Bure'
                    : 'Delivery Ipo'
                  : productSignals.pickup.pickupAvailable
                  ? 'Kuchukua Pekee'
                  : 'Haijawekwa'}
              </span>
            </div>
            <p className="text-[10px] text-stone-500 leading-relaxed">
              {productSignals.delivery.disclaimer}
            </p>
          </div>
        )}

        {/* 7. Reviews & Reputation */}
        <div className="bg-white rounded-xl p-2.5 border border-stone-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-stone-600 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span>Tathmini (Reviews):</span>
            </span>
            {signals.reputation.hasReviews && signals.reputation.averageRating !== null ? (
              <span className="text-[10.5px] font-bold text-stone-900 inline-flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span>{signals.reputation.averageRating.toFixed(1)}</span>
                <span className="text-stone-400 font-normal">
                  ({signals.reputation.totalPublishedReviews})
                </span>
                {signals.reputation.isSmallSample && (
                  <span className="text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
                    Sampuli
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[10px] font-medium text-stone-500">
                Bila reviews
              </span>
            )}
          </div>
          <p className="text-[10px] text-stone-500 leading-relaxed">
            {signals.reputation.hasReviews
              ? signals.reputation.disclaimer
              : 'Hakuna tathmini zilizochapishwa bado kutoka kwa wanunuzi.'}
          </p>
        </div>
      </div>

      {/* Footer / Trust Principle Boundary Notice */}
      <div className="px-4 py-2.5 bg-stone-100/70 border-t border-stone-200/70 flex items-start gap-2 text-[10px] text-stone-600">
        <Info className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
        <p className="leading-normal">
          {signals.boundaryNotice}
        </p>
      </div>
    </div>
  );
};
