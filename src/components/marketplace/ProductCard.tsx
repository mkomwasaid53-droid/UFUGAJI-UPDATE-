import React from 'react';
import { MarketplaceProduct } from '../../types/marketplace';
import { formatTshPrice } from '../../services/marketplaceService';
import { validateProductOwnership } from '../../services/productOwnershipService';
import { resolvePriceStockTrust } from '../../services/productPriceStockService';
import { resolveLocationDeliveryTrust } from '../../services/productLocationDeliveryService';
import { resolveProductTrustSignals } from '../../services/marketplaceTrustService';
import { evaluateProductMarketplaceEligibility } from '../../services/marketplaceGovernanceEnforcement';
import {
  MapPin,
  Tag,
  Package,
  Store,
  ShieldCheck,
  AlertCircle,
  Eye,
  Edit3,
  Trash2,
  PhoneCall,
  CheckCircle2,
  Power,
  Layers,
  Video,
  AlertTriangle,
  Clock,
  Truck,
  Star
} from 'lucide-react';

interface ProductCardProps {
  product: MarketplaceProduct;
  isOwner?: boolean;
  isHighlighted?: boolean;
  onViewDetails: (product: MarketplaceProduct) => void;
  onOpenShop?: (sellerId: string) => void;
  onOpenShopCatalogue?: (sellerId: string, catalogueId?: string | null, productId?: string) => void;
  onEdit?: (product: MarketplaceProduct) => void;
  onDelete?: (product: MarketplaceProduct) => void;
  onToggleStatus?: (product: MarketplaceProduct) => void;
  onContact?: (product: MarketplaceProduct) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isOwner,
  isHighlighted,
  onViewDetails,
  onOpenShop,
  onOpenShopCatalogue,
  onEdit,
  onDelete,
  onToggleStatus,
  onContact
}) => {
  const isAvailable = product.status === 'active' && product.quantityAvailable > 0;
  const isSoldOut = product.status === 'sold_out' || product.quantityAvailable === 0;
  const isInactive = product.status === 'inactive' || product.status === 'draft';

  // V1.6G: Authoritative Unified Trust Signals derivation
  const trust = React.useMemo(() => resolveProductTrustSignals(product), [product]);
  const ownership = {
    isSellerVerified: trust.sellerVerification.isVerified,
    state: trust.sellerVerification.status === 'INCONSISTENT' ? 'INCONSISTENT' : trust.sellerVerification.isVerified ? 'VERIFIED' : 'UNVERIFIED',
    authoritativeSellerName: product.sellerName || trust.sellerVerification.businessName || 'Muuzaji',
    authoritativeShopName: trust.shop.shopName || product.shopId || 'Duka'
  };
  const priceStock = trust;
  const locDelivery = React.useMemo(() => resolveLocationDeliveryTrust(product), [product]);
  const reputation = trust.reputation;

  // V1.7G: Authoritative Governance Eligibility
  const governance = React.useMemo(() => evaluateProductMarketplaceEligibility(product), [product]);
  const isActivationBlocked = !governance.isEligible && product.status !== 'active';

  const handleShopClick = () => {
    if (onOpenShopCatalogue && product.catalogueId) {
      onOpenShopCatalogue(product.sellerId, product.catalogueId, product.productId);
    } else if (onOpenShop) {
      onOpenShop(product.sellerId);
    } else {
      onViewDetails(product);
    }
  };

  return (
    <div
      id={`product-card-${product.productId}`}
      className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col justify-between group ${
        isHighlighted
          ? 'ring-2 ring-amber-500 border-amber-400 shadow-md bg-amber-50/10'
          : isInactive
          ? 'border-stone-300 opacity-80 bg-stone-50/50'
          : 'border-stone-200/90 shadow-2xs hover:shadow-sm'
      }`}
    >
      <div className="p-4 space-y-3">
        {/* Highlight Banner if targeted */}
        {isHighlighted && (
          <div className="px-2.5 py-1 bg-amber-500 text-stone-950 font-extrabold text-[10.5px] rounded-lg flex items-center justify-between">
            <span>🎯 Bidhaa Uliyofungua</span>
            <span className="text-[9.5px] uppercase font-bold tracking-wider">Imechaguliwa</span>
          </div>
        )}

        {/* Owner Governance Notice if not eligible */}
        {isOwner && !governance.isEligible && (
          <div className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-950 font-bold text-[10.5px] rounded-lg flex items-center justify-between">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>{governance.moderationStatus || 'IMEZUIWA'}</span>
            </span>
            <span className="text-[9.5px] uppercase font-bold tracking-wider text-amber-800">Haionekani Sokoni</span>
          </div>
        )}

        {/* Product Image Thumbnail / Placeholder */}
        <div
          onClick={() => onViewDetails(product)}
          className="relative w-full h-36 bg-stone-100 rounded-xl overflow-hidden border border-stone-200 cursor-pointer group/img flex items-center justify-center"
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-stone-600 space-y-1">
              <Package className="w-8 h-8 text-stone-500" />
              <span className="text-[10px] font-medium">Bila Picha</span>
            </div>
          )}

          {/* Image count pill if multiple */}
          {product.images && product.images.length > 1 && (
            <span className="absolute bottom-2 right-2 bg-stone-900/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              📷 {product.images.length}
            </span>
          )}

          {/* Video indicator */}
          {product.video && (
            <span className="absolute bottom-2 left-2 bg-stone-900/80 backdrop-blur-xs text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-500/30">
              <Video className="w-2.5 h-2.5 text-amber-400" />
              <span>Ina Video</span>
            </span>
          )}

          {/* Category overlay */}
          <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/90 text-stone-900 shadow-xs backdrop-blur-xs border border-stone-200/60 inline-flex items-center gap-1">
            <Tag className="w-2.5 h-2.5 text-amber-700" />
            <span>{product.category}</span>
          </span>
        </div>

        {/* Category, Catalogue & Status Bar */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {product.catalogueName ? (
              <button
                type="button"
                onClick={handleShopClick}
                className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 inline-flex items-center gap-1 hover:bg-amber-100 hover:text-amber-950 hover:border-amber-300 transition-colors cursor-pointer"
                title={`Fungua Sehemu ya ${product.catalogueName}`}
              >
                <Layers className="w-2.5 h-2.5 text-stone-500" />
                <span className="truncate max-w-[110px]">{product.catalogueName}</span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            {product.isTestDemo && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-300">
                Jaribio / Demo
              </span>
            )}

            {/* V1.6D: Authoritative Stock Status Badge */}
            {priceStock.stock.status === 'IN_STOCK' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                Inapatikana
              </span>
            )}
            {priceStock.stock.status === 'OUT_OF_STOCK' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                Imeisha
              </span>
            )}
            {priceStock.stock.status === 'NOT_PROVIDED' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
                Idadi haijawekwa
              </span>
            )}

            {isInactive && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 border border-stone-300">
                {product.status === 'draft' ? 'Rasimu' : 'Imezimwa'}
              </span>
            )}

            {isOwner && product.validationStatus && (
              <span
                className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border inline-flex items-center gap-0.5 ${
                  product.validationStatus === 'VALID'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : product.validationStatus === 'INCOMPLETE'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : product.validationStatus === 'BLOCKED'
                    ? 'bg-red-50 text-red-800 border-red-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
                title={product.validationErrors?.map((e) => e.message).join(', ') || `Hali ya ukaguzi: ${product.validationStatus}`}
              >
                {product.validationStatus === 'VALID'
                  ? 'Imeidhinishwa'
                  : product.validationStatus === 'INCOMPLETE'
                  ? 'Haijakamilika'
                  : product.validationStatus === 'BLOCKED'
                  ? 'Imezuiliwa'
                  : 'Si Sahihi'}
              </span>
            )}

            {trust.hasConflict && (
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-0.5" title="Kuna utofauti wa taarifa">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                Ukinzani
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <h4
            onClick={() => onViewDetails(product)}
            className="text-sm font-bold text-stone-900 line-clamp-2 hover:text-emerald-800 transition-colors cursor-pointer"
          >
            {product.title}
          </h4>
          {product.subcategory && (
            <p className="text-[11px] text-stone-500 line-clamp-1 pt-0.5">
              {product.subcategory}
            </p>
          )}

          {/* V1.6F: Review & Rating Trust Indicator */}
          <div className="pt-1 flex items-center justify-between gap-1 text-[11px]">
            {reputation.hasReviews && reputation.averageRating !== null ? (
              <div
                className="flex items-center gap-1 font-bold text-stone-800"
                title={reputation.isSmallSample ? 'Sampuli ndogo ya tathmini (1-2)' : `Wastani wa nyota ${reputation.averageRating}`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                <span>{reputation.averageRating.toFixed(1)}</span>
                <span className="text-stone-400 font-normal text-[10px]">
                  ({reputation.totalPublishedReviews})
                </span>
                {reputation.isSmallSample && (
                  <span className="text-[9px] text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded font-medium">
                    Sampuli
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[10.5px] text-stone-400 font-medium">
                <Star className="w-3 h-3 text-stone-300 shrink-0" />
                <span>Bila tathmini</span>
              </div>
            )}
          </div>
        </div>

        {/* V1.6D: Authoritative Price, Unit, Stock & Freshness */}
        <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-100 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              {priceStock.price.status === 'PROVIDED' ? (
                <div>
                  <span className="text-base font-extrabold text-emerald-800 tracking-tight">
                    {priceStock.price.displayPrice}
                  </span>
                  <span className="text-xs text-stone-500 font-medium ml-1">
                    / {product.unit}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-bold text-stone-600 bg-stone-200/70 px-2 py-0.5 rounded-md">
                  {priceStock.price.displayPrice}
                </span>
              )}
            </div>

            <div className="text-right">
              <span className="text-[11px] text-stone-600 block">
                {priceStock.stock.status === 'IN_STOCK' ? (
                  <>Zilizopo: <strong className="text-stone-900 font-bold">{priceStock.stock.quantity}</strong></>
                ) : (
                  <span className="font-semibold text-stone-500">{priceStock.stock.displayStock}</span>
                )}
              </span>
            </div>
          </div>

          {/* Freshness & Conflict Indicators */}
          <div className="flex items-center justify-between gap-1 text-[9.5px] text-stone-600 pt-1 border-t border-stone-200/60">
            <span className="inline-flex items-center gap-1 font-medium truncate" title={`Sasisho la bei: ${priceStock.price.lastUpdatedText || 'Haijasasishwa'}`}>
              <Clock className="w-2.5 h-2.5 text-stone-500 shrink-0" />
              <span className="truncate">{priceStock.price.lastUpdatedText ? `Sasisho: ${priceStock.price.lastUpdatedText}` : 'Muda haujulikani'}</span>
            </span>

            {priceStock.price.isStale && (
              <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold text-[9px] shrink-0" title="Bei haijasasishwa zaidi ya siku 90">
                Bei ya Zamani
              </span>
            )}

            {(priceStock.hasDescriptionPriceConflict || priceStock.hasDescriptionStockConflict) && (
              <span className="bg-rose-100 text-rose-900 px-1.5 py-0.2 rounded font-bold text-[9px] inline-flex items-center gap-0.5 shrink-0" title={priceStock.structuredWinsNotice || 'Ukinzani wa maelezo na mfumo'}>
                <AlertTriangle className="w-2.5 h-2.5 text-rose-700" />
                Ukinzani
              </span>
            )}
          </div>
        </div>

        {/* Seller & Location Information */}
        <div className="space-y-1 text-xs text-stone-600 pt-1 border-t border-stone-100">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handleShopClick}
              className="flex items-center gap-1.5 text-stone-800 hover:text-amber-900 font-bold hover:underline cursor-pointer truncate text-left"
              title="Fungua Duka la Muuzaji Huyu"
            >
              <Store className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate">{ownership.authoritativeShopName}</span>
            </button>

            {ownership.state === 'INCONSISTENT' ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded shrink-0" title="Uhusiano wa duka na muuzaji haujalingana">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                Mwenendo Usioendana
              </span>
            ) : ownership.state === 'UNAVAILABLE' ? (
              <span className="text-[9px] text-stone-600 bg-stone-100 px-1.5 py-0.2 rounded border border-stone-200 shrink-0">
                Mmiliki Hayupo
              </span>
            ) : ownership.isSellerVerified ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-1.5 py-0.2 rounded shrink-0" title="Muuzaji Aliyethibitishwa (Uthibitisho unahusu utambulisho wa muuzaji, si bidhaa yenyewe)">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Muuzaji Aliyethibitishwa
              </span>
            ) : (
              <span className="text-[9px] text-stone-600 bg-stone-100 px-1.5 py-0.2 rounded border border-stone-200 shrink-0">
                Haijahakikiwa
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1.5 text-stone-600">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 text-stone-500" title={locDelivery.location.trustDisclaimer}>
              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="truncate">
                {locDelivery.location.displayLocation}
              </span>
            </div>

            {locDelivery.location.locationType === 'SHOP_LOCATION' && (
              <span className="text-[8.5px] font-medium text-stone-500 bg-stone-100 px-1 py-0.2 rounded shrink-0 border border-stone-200" title="Eneo la Duka">
                Dukani
              </span>
            )}
          </div>

          {/* Delivery & Pickup Trust Row */}
          <div className="flex items-center justify-between gap-1 pt-1 text-[10px]">
            {locDelivery.delivery.deliveryAvailable ? (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80 truncate" title={locDelivery.delivery.trustDisclaimer}>
                <Truck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                <span className="truncate">
                  {locDelivery.delivery.feeType === 'FREE' ? 'Delivery Bure' : 'Delivery Ipo'}
                </span>
              </span>
            ) : locDelivery.delivery.pickupAvailable ? (
              <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/80 truncate" title="Kuchukua dukani au eneo la muuzaji">
                <Store className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                <span className="truncate">Kuchukua Pekee</span>
              </span>
            ) : locDelivery.delivery.status === 'DELIVERY_NOT_AVAILABLE' ? (
              <span className="text-[9.5px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200/70 truncate">
                Hakuna Delivery
              </span>
            ) : (
              <span className="text-[9.5px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200/50 truncate">
                Delivery: Haijawekwa
              </span>
            )}

            {/* Location or Delivery Free-text Conflict Warning */}
            {(locDelivery.hasDescriptionLocationConflict || locDelivery.hasDescriptionDeliveryConflict) && (
              <span
                className="bg-rose-100 text-rose-900 px-1.5 py-0.5 rounded font-bold text-[9px] inline-flex items-center gap-0.5 shrink-0"
                title={locDelivery.structuredWinsNotice || 'Maelezo yanapingana na data rasmi za usafirishaji/eneo'}
              >
                <AlertTriangle className="w-2.5 h-2.5 text-rose-700" />
                Ukinzani
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-3 bg-stone-50/70 border-t border-stone-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onViewDetails(product)}
          className="flex-1 py-2 px-3 bg-white hover:bg-stone-100 border border-stone-200 text-stone-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer min-h-[38px]"
        >
          <Eye className="w-3.5 h-3.5 text-stone-600" />
          <span>Maelezo</span>
        </button>

        {isOwner ? (
          <div className="flex items-center gap-1">
            {onToggleStatus && (
              <button
                type="button"
                disabled={isActivationBlocked}
                onClick={() => {
                  if (isActivationBlocked) return;
                  onToggleStatus(product);
                }}
                title={
                  isActivationBlocked
                    ? `Tangazo hili limefungwa na msimamizi (${governance.moderationStatus}). Haliwezi kuwashwa hadi liidhinishwe.`
                    : product.status === 'active'
                    ? 'Zima Tangazo (Weka Inactive)'
                    : 'Washa Tangazo (Weka Active)'
                }
                className={`p-2 rounded-xl border transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center ${
                  isActivationBlocked
                    ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed opacity-60'
                    : product.status === 'active'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 cursor-pointer'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-600 border-stone-300 cursor-pointer'
                }`}
              >
                <Power className="w-4 h-4" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(product)}
                title="Hariri Tangazo"
                className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(product)}
                title="Futa Tangazo"
                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-colors cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          onContact && (
            <button
              type="button"
              onClick={() => onContact(product)}
              className="py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer min-h-[38px]"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Wasiliana</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};
