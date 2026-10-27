import React, { useState } from 'react';
import { MarketplaceProduct } from '../../types/marketplace';
import { formatTshPrice } from '../../services/marketplaceService';
import { validateProductOwnership } from '../../services/productOwnershipService';
import { resolvePriceStockTrust } from '../../services/productPriceStockService';
import { resolveLocationDeliveryTrust } from '../../services/productLocationDeliveryService';
import { resolveProductTrustSignals } from '../../services/marketplaceTrustService';
import { evaluateProductMarketplaceEligibility } from '../../services/marketplaceGovernanceEnforcement';
import { PublicSellerVerificationBadge } from '../../types/sellerVerification';
import { sellerVerificationService } from '../../services/sellerVerificationService';
import { getSellerTrustStatus } from '../../services/sellerTrustService';
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
  MessageSquare,
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
  publicBadge?: PublicSellerVerificationBadge | null;
  viewMode?: 'grid' | 'compact' | 'list';
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
  publicBadge,
  viewMode = 'grid',
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

  // V1.11C-CORRECTIVE-1: Single authoritative public verification projection
  const effectivePublicBadge = publicBadge || sellerVerificationService.getPublicSellerBadge(product.sellerId);

  const [imgError, setImgError] = useState(false);
  const isSellerVerified = Boolean(effectivePublicBadge.isVerified && effectivePublicBadge.badgeStatus === 'ACTIVE');

  // V1.6G: Authoritative Unified Trust Signals derivation
  const trust = React.useMemo(() => resolveProductTrustSignals(product), [product]);
  const ownership = {
    isSellerVerified,
    state: trust.sellerVerification.status === 'INCONSISTENT' ? 'INCONSISTENT' : isSellerVerified ? 'VERIFIED' : 'UNVERIFIED',
    authoritativeSellerName: product.sellerName || trust.sellerVerification.businessName || 'Muuzaji',
    authoritativeShopName: trust.shop.shopName || product.shopId || 'Duka'
  };
  const priceStock = trust;
  const locDelivery = React.useMemo(() => resolveLocationDeliveryTrust(product), [product]);
  const reputation = trust.reputation;

  // V1.7G: Authoritative Governance Eligibility
  const governance = React.useMemo(() => evaluateProductMarketplaceEligibility(product), [product]);
  const isActivationBlocked = !governance.isEligible && product.status !== 'active';

  const isTrustedSeller =
    product.sellerTrustStatus === 'TRUSTED_SELLER' ||
    (product.sellerId ? getSellerTrustStatus(product.sellerId) === 'TRUSTED_SELLER' : false);

  const isRejected =
    governance.moderationStatus === 'REJECTED' ||
    product.moderationStatus === 'REJECTED' ||
    product.aiScreening?.status === 'BLOCK';
  const isReviewRequired = product.aiScreening?.status === 'REVIEW_REQUIRED';
  const isPendingReview =
    (governance.moderationStatus === 'PENDING_REVIEW' || product.moderationStatus === 'PENDING_REVIEW') && !isRejected;

  const displayUrl = (!imgError && product.imageUrl && !product.imageUrl.startsWith('blob:'))
    ? product.imageUrl
    : (!imgError && product.images && product.images.length > 0 && product.images[0]?.url && !product.images[0]?.url.startsWith('blob:'))
    ? product.images[0]?.url
    : null;

  const handleShopClick = () => {
    if (onOpenShopCatalogue && product.catalogueId) {
      onOpenShopCatalogue(product.sellerId, product.catalogueId, product.productId);
    } else if (onOpenShop) {
      onOpenShop(product.sellerId);
    } else {
      onViewDetails(product);
    }
  };

  const renderOwnerNotice = () => {
    if (!isOwner) return null;

    // 1. REJECTED / BLOCKED
    if (isRejected) {
      return (
        <div className="p-2.5 rounded-xl text-[11px] border bg-rose-50 border-rose-300 text-rose-950 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between font-extrabold text-rose-900">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
              <span>{isTrustedSeller ? '🚫 LIMEZUIWA NA AI (BLOCKED)' : '🚫 LIMEKATALIWA NA MSIMAMIZI'}</span>
            </span>
            <span className="text-[9px] uppercase font-black text-rose-800 bg-rose-200/80 px-1.5 py-0.2 rounded border border-rose-300">
              Halikidhi Vigezo
            </span>
          </div>
          <p className="text-[10px] text-rose-900 leading-tight">
            {product.aiScreening?.explanationSwahili || product.moderationPublicReason || governance.sellerNotice || 'Tangazo limezuiwa kwa sababu halijakidhi vigezo vya usalama na maadili ya soko.'}
          </p>
          <div className="flex items-center justify-between pt-1 border-t border-rose-200 text-[9.5px]">
            <span className="text-rose-700 font-medium">📬 Ujumbe wa kuzuiliwa umetumwa kwenye arifa zako.</span>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(product)}
                className="font-bold underline text-rose-900 hover:text-rose-950 cursor-pointer"
              >
                Rekebisha
              </button>
            )}
          </div>
        </div>
      );
    }

    // 2. TRUSTED SELLER: IN PROGRESS AI SCREENING
    if (isTrustedSeller && (product.screeningJobStatus === 'SCREENING_PENDING' || product.screeningJobStatus === 'SCREENING_PROCESSING' || product.screeningJobStatus === 'PENDING' || product.screeningJobStatus === 'PROCESSING')) {
      return (
        <div className="p-2.5 rounded-xl text-[11px] border bg-blue-50 border-blue-200 text-blue-950 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between font-bold text-blue-900">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping inline-block" />
              <span>🤖 INACHUNGUZWA NA AI... (AI SCREENING)</span>
            </span>
            <span className="text-[9px] uppercase font-bold text-blue-800 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
              Inachakatwa
            </span>
          </div>
          <p className="text-[10px] text-blue-900 leading-tight">
            Tangazo lako la Trusted Seller linakaguliwa na AI. Likifaulu (PASS), litakuwa hewani moja kwa moja bila kusubiri admin review.
          </p>
        </div>
      );
    }

    // 3. TRUSTED SELLER: REVIEW_REQUIRED (Complex / Sensitive Context)
    if (isTrustedSeller && isReviewRequired) {
      return (
        <div className="p-2.5 rounded-xl text-[11px] border bg-purple-50 border-purple-200 text-purple-950 space-y-1">
          <div className="flex items-center justify-between font-bold text-purple-900">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span>🔍 INAHITAJI UHAKIKI (REVIEW REQUIRED)</span>
            </span>
            <span className="text-[9px] uppercase font-bold text-purple-800 bg-purple-100 px-1.5 py-0.2 rounded border border-purple-200">
              Uhakiki
            </span>
          </div>
          <p className="text-[10px] text-purple-900 leading-tight">
            {product.aiScreening?.explanationSwahili || product.moderationPublicReason || 'AI imebaini maudhui yenye muktadha maalum (k.m. matibabu ya mifugo) yanayohitaji uhakiki wa msimamizi.'}
          </p>
        </div>
      );
    }

    // 4. NORMAL SELLER: PENDING ADMIN APPROVAL (Bypasses AI Screening)
    if (!isTrustedSeller && (isPendingReview || governance.moderationStatus === 'PENDING_REVIEW' || product.moderationStatus === 'PENDING_REVIEW')) {
      return (
        <div className="p-2.5 rounded-xl text-[11px] border bg-sky-50 border-sky-200 text-sky-950 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between font-bold text-sky-900">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span>⏳ INASUBIRI IDHINI YA MSIMAMIZI (ADMIN REVIEW)</span>
            </span>
            <span className="text-[9px] uppercase font-bold text-sky-800 bg-sky-100 px-1.5 py-0.2 rounded border border-sky-200">
              Muuzaji wa Kawaida
            </span>
          </div>
          <p className="text-[10px] text-sky-900 leading-tight">
            Tangazo la muuzaji wa kawaida halipitii ukaguzi wa AI. Linasubiri ukaguzi na idhini ya msimamizi wa soko kabla ya kuwa hewani.
          </p>
        </div>
      );
    }

    // 5. TRUSTED SELLER: AUTO-PUBLISHED PASS
    if (isTrustedSeller && governance.isEligible && product.status === 'active') {
      return (
        <div className="px-2.5 py-1.5 bg-gradient-to-r from-emerald-50 to-amber-50 border border-emerald-300 text-emerald-950 font-bold text-[10.5px] rounded-xl flex items-center justify-between shadow-2xs">
          <span className="flex items-center gap-1 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>⭐ Imechapishwa Moja kwa Moja (Trusted Seller - AI Pass)</span>
          </span>
          <span className="text-[9px] uppercase font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">Sokoni</span>
        </div>
      );
    }

    if (!governance.isEligible) {
      return (
        <div className="p-2 rounded-xl space-y-1 text-[11px] border bg-amber-50 border-amber-200 text-amber-950">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>{governance.moderationStatus || 'Haionekani Sokoni'}</span>
            </span>
            <span className="text-[9px] uppercase font-bold text-amber-800">Haionekani</span>
          </div>
          {product.moderationPublicReason && (
            <p className="text-[10px] text-amber-900/90 leading-tight">
              {product.moderationPublicReason}
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`group relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        isHighlighted
          ? 'border-amber-400 ring-2 ring-amber-300/50 shadow-md'
          : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      {renderOwnerNotice()}

      <div className="p-3.5 space-y-2.5">
        {/* Product Image Thumbnail / Placeholder */}
        <div
          onClick={() => onViewDetails(product)}
          className="relative w-full h-36 bg-stone-100 rounded-xl overflow-hidden border border-stone-200 cursor-pointer group/img flex items-center justify-center"
        >
          {(() => {
            const displayUrl = (!imgError && product.imageUrl && !product.imageUrl.startsWith('blob:'))
              ? product.imageUrl
              : (!imgError && product.images && product.images.length > 0 && product.images[0]?.url && !product.images[0]?.url.startsWith('blob:'))
              ? product.images[0]?.url
              : null;

            return displayUrl ? (
              <img
                src={displayUrl}
                alt={product.title}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-stone-600 space-y-1">
                <Package className="w-8 h-8 text-stone-500" />
                <span className="text-[10px] font-medium">Bila Picha</span>
              </div>
            );
          })()}

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

            {isOwner && (
              <span
                className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border inline-flex items-center gap-0.5 ${
                  (governance.moderationStatus === 'REJECTED' || product.moderationStatus === 'REJECTED' || product.aiScreening?.status === 'BLOCK')
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : isTrustedSeller && (product.screeningJobStatus === 'SCREENING_PENDING' || product.screeningJobStatus === 'SCREENING_PROCESSING' || product.screeningJobStatus === 'PENDING' || product.screeningJobStatus === 'PROCESSING')
                    ? 'bg-blue-50 text-blue-800 border-blue-300 animate-pulse'
                    : isTrustedSeller && (product.screeningJobStatus === 'EXHAUSTED' || product.screeningJobStatus === 'EXHAUSTED_DEADLINE' || product.aiScreening?.failureReason === 'EXHAUSTED_DEADLINE')
                    ? 'bg-orange-50 text-orange-800 border-orange-300'
                    : isTrustedSeller && (product.aiScreening?.status === 'SCREENING_ERROR' || product.screeningJobStatus === 'FAILED')
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : isTrustedSeller && (product.aiScreening?.status === 'REVIEW_REQUIRED')
                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                    : isTrustedSeller && (governance.isEligible && product.status === 'active')
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : !isTrustedSeller && (product.moderationStatus === 'PENDING_REVIEW' || governance.moderationStatus === 'PENDING_REVIEW')
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : !isTrustedSeller && (governance.isEligible && product.status === 'active')
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : product.validationStatus === 'INCOMPLETE'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-stone-100 text-stone-700 border-stone-300'
                }`}
                title={product.validationErrors?.map((e) => e.message).join(', ') || `Hali ya kiutawala: ${governance.moderationStatus}`}
              >
                {(governance.moderationStatus === 'REJECTED' || product.moderationStatus === 'REJECTED' || product.aiScreening?.status === 'BLOCK')
                  ? 'Imezuiwa (BLOCK)'
                  : isTrustedSeller && (product.screeningJobStatus === 'SCREENING_PENDING' || product.screeningJobStatus === 'SCREENING_PROCESSING' || product.screeningJobStatus === 'PENDING' || product.screeningJobStatus === 'PROCESSING')
                  ? 'Inachunguzwa na AI...'
                  : isTrustedSeller && (product.screeningJobStatus === 'EXHAUSTED' || product.screeningJobStatus === 'EXHAUSTED_DEADLINE' || product.aiScreening?.failureReason === 'EXHAUSTED_DEADLINE')
                  ? 'Muda wa AI Umekwisha'
                  : isTrustedSeller && (product.aiScreening?.status === 'SCREENING_ERROR' || product.screeningJobStatus === 'FAILED')
                  ? 'Hitilafu ya AI'
                  : isTrustedSeller && (product.aiScreening?.status === 'REVIEW_REQUIRED')
                  ? 'Inahitaji Ukaguzi'
                  : isTrustedSeller && (governance.isEligible && product.status === 'active')
                  ? 'Imeidhinishwa na AI (PASS)'
                  : !isTrustedSeller && (product.moderationStatus === 'PENDING_REVIEW' || governance.moderationStatus === 'PENDING_REVIEW')
                  ? 'Inasubiri Idhini ya Admin'
                  : !isTrustedSeller && (governance.isEligible && product.status === 'active')
                  ? 'Imeidhinishwa na Admin'
                  : product.validationStatus === 'INCOMPLETE'
                  ? 'Haijakamilika'
                  : 'Rasimu / Imezimwa'}
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
              title="Wasiliana na muuzaji kupitia Ujumbe wa Gulio"
              className="py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-200" />
              <span>Wasiliana</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};
