import React from 'react';
import {
  ProductRecommendationItem
} from '../../types/marketplaceRecommendation';
import { MatchedMarketplaceProductItem } from '../../types/visualMarketplace';
import { formatTshPrice } from '../../services/marketplaceService';
import {
  ShieldCheck,
  MapPin,
  Package,
  Video,
  ExternalLink,
  Store,
  Sparkles,
  Eye,
  Info,
  CheckCircle2,
  Tag,
  AlertTriangle,
  BadgeAlert,
  Star,
  Truck
} from 'lucide-react';
import { resolveProductTrustSignals } from '../../services/marketplaceTrustService';

export interface VisualRecommendationCardProps {
  item: ProductRecommendationItem | MatchedMarketplaceProductItem;
  isPrimary?: boolean;
  userBudget?: number | null;
  onOpenProduct: (productId: string) => void;
  onOpenShop?: (shopId: string, catalogueId?: string | null) => void;
}

export const VisualRecommendationCard: React.FC<VisualRecommendationCardProps> = ({
  item,
  isPrimary = false,
  userBudget,
  onOpenProduct,
  onOpenShop
}) => {
  const formattedPrice = formatTshPrice(item.price);

  // Derive visual match data
  const visualMatch = 'visualMatchScore' in item ? item.visualMatchScore : item.visualMatch;
  const matchTier = item.matchTier || visualMatch?.matchTier;
  const isSemanticOnly = Boolean(
    item.isSemanticOnly ||
    (visualMatch && visualMatch.visualSimilarityScore === undefined)
  );

  // 1. RECOMMENDATION RESULT TYPES (Section 2)
  let tierBadgeText = 'Bidhaa inayohusiana na utafutaji wako';
  let tierBadgeStyle = 'bg-stone-100 text-stone-800 border-stone-300';
  let TierIcon = Tag;

  if (isSemanticOnly) {
    tierBadgeText = 'Bidhaa inayohusiana na utafutaji wako';
    tierBadgeStyle = 'bg-stone-100 text-stone-700 border-stone-300';
    TierIcon = Tag;
  } else if (matchTier === 'EXACT_OR_VERY_STRONG' || matchTier === 'STRONGLY_SIMILAR') {
    tierBadgeText = 'Inafanana sana na unachotafuta';
    tierBadgeStyle = 'bg-emerald-50 text-emerald-900 border-emerald-300';
    TierIcon = CheckCircle2;
  } else if (matchTier === 'RELATED_PRODUCT') {
    tierBadgeText = 'Inaonekana inafanana kwa kiwango cha kati';
    tierBadgeStyle = 'bg-teal-50 text-teal-900 border-teal-300';
    TierIcon = Eye;
  } else if (matchTier === 'WEAK_CANDIDATE') {
    tierBadgeText = 'Ina uhusiano na unachotafuta, lakini ufanano wa picha haujathibitishwa vizuri';
    tierBadgeStyle = 'bg-amber-50 text-amber-900 border-amber-300';
    TierIcon = Info;
  }

  // 2. CONFIDENCE BADGE (Section 12 - accessible, not color alone)
  const confidence = item.visualMatchConfidence || visualMatch?.confidence || 'MEDIUM';
  const confidenceLabel = isSemanticOnly
    ? 'Kielelezo tu (Semantic)'
    : confidence === 'HIGH'
    ? 'Uhakika Mkubwa'
    : confidence === 'MEDIUM'
    ? 'Uhakika wa Kati'
    : 'Uhakika Mdogo';

  // 3. EXPLANATION REASONS (Section 5 & 13)
  const reasons: string[] = visualMatch?.reasons && visualMatch.reasons.length > 0
    ? visualMatch.reasons
    : item.relevanceReason
    ? [item.relevanceReason]
    : ['Aina ya bidhaa inafanana na mahitaji yako'];

  const limitations: string[] = visualMatch?.limitations || [];

  // Budget fit assessment (Section 19: Price truth)
  const isWithinBudget = userBudget !== null && userBudget !== undefined
    ? item.price <= userBudget
    : null;

  return (
    <div
      id={`visual-rec-card-${item.productId}`}
      className={`rounded-2xl transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        isPrimary
          ? 'bg-gradient-to-b from-emerald-50/40 via-white to-white border-2 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/20'
          : 'bg-white border border-stone-200 shadow-2xs hover:shadow-sm hover:border-stone-300'
      }`}
    >
      {/* Top Banner for Primary Candidate (Section 4 & 13) */}
      {isPrimary && (
        <div className="bg-emerald-700 text-white px-3.5 py-1.5 flex items-center justify-between text-xs font-bold tracking-wide uppercase">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
            <span>Chaguo Linalofanana Zaidi</span>
          </div>
          <span className="text-[10.5px] font-medium lowercase tracking-normal text-emerald-100 bg-emerald-800/80 px-2 py-0.5 rounded">
            Nambari 1 kwenye Gulio
          </span>
        </div>
      )}

      {/* Media & Key Visual Badges */}
      <div className="relative w-full h-44 sm:h-48 bg-stone-100 border-b border-stone-100 overflow-hidden flex items-center justify-center group">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-stone-400 space-y-1 p-4 text-center">
            <Package className="w-9 h-9 text-stone-300 stroke-[1.5]" />
            <span className="text-xs font-medium text-stone-500">Bila Picha ya Tangazo</span>
            <span className="text-[10px] text-stone-400">Muuzaji hajaweka picha kwenye Gulio</span>
          </div>
        )}

        {/* Stock Status Badge (Section 18 - Real Marketplace stock only) */}
        <div className="absolute top-2.5 left-2.5">
          {item.inStock ? (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-[10.5px] font-bold bg-emerald-600/95 text-white backdrop-blur-xs shadow-2xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Ipo Dukani ({item.quantityAvailable})
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-[10.5px] font-bold bg-stone-800/90 text-stone-200 backdrop-blur-xs shadow-2xs">
              <Package className="w-3 h-3 mr-1 text-stone-400" />
              Haipo kwa Sasa
            </span>
          )}
        </div>

        {/* Video Badge if available */}
        {item.hasVideo && (
          <div className="absolute top-2.5 right-2.5 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center space-x-1 shadow-2xs backdrop-blur-xs">
            <Video className="w-3 h-3 text-amber-400" />
            <span>Ina Video</span>
          </div>
        )}

        {/* Source distinction tag */}
        <div className="absolute bottom-2 left-2.5 bg-stone-900/80 text-white text-[9.5px] font-medium px-2 py-0.5 rounded backdrop-blur-xs flex items-center space-x-1">
          <span>Gulio Marketplace</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-3.5 sm:p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-2.5">
          {/* Visual Match Result Tier (Section 2) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border shadow-2xs ${tierBadgeStyle}`}
              title="Kiwango cha ufanano wa kuona au kulingana na maelezo"
            >
              <TierIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span>{tierBadgeText}</span>
            </span>

            {/* Visual Confidence Badge (Section 12) */}
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200"
              title="Uhakika wa tathmini ya ufanano"
            >
              <Sparkles className="w-2.5 h-2.5 mr-1 text-stone-500 shrink-0" />
              <span>{confidenceLabel}</span>
            </span>
          </div>

          {/* Product Title */}
          <h4
            className={`font-bold text-stone-900 line-clamp-2 leading-snug ${
              isPrimary ? 'text-base' : 'text-sm'
            }`}
            title={item.title}
          >
            {item.title}
          </h4>

          {/* SECTION A: AI VISUAL ASSESSMENT (Section 6 & 13) */}
          <div className="bg-stone-50/90 rounded-xl p-2.5 border border-stone-200/80 space-y-1.5 text-stone-800">
            <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 uppercase tracking-wider">
              <span className="flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Tathmini ya AI ya Ufanano:</span>
              </span>
              <span className="text-[9.5px] font-normal lowercase text-stone-500">
                (bila dhamana ya kufanana 100%)
              </span>
            </div>

            {/* Evidence-based reasons */}
            <ul className="space-y-1 text-xs text-stone-700">
              {reasons.slice(0, 3).map((reason, rIdx) => (
                <li key={rIdx} className="flex items-start space-x-1.5 leading-tight">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>

            {/* Observational Limitations if any */}
            {limitations.length > 0 && (
              <div className="pt-1 text-[10.5px] text-amber-800 flex items-start space-x-1 border-t border-stone-200/60 mt-1">
                <Info className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                <span>{limitations[0]}</span>
              </div>
            )}
          </div>

          {/* SECTION B: MARKETPLACE FACTS (Section 6 - Strictly separated) */}
          <div className="space-y-1.5 pt-0.5">
            <div className="text-[10px] font-bold text-emerald-900/80 uppercase tracking-wider flex items-center space-x-1">
              <Package className="w-3 h-3 text-emerald-700" />
              <span>Taarifa Rasmi za Gulio:</span>
            </div>

            {/* Price & Budget Comparison (Section 19) */}
            <div className="flex items-baseline justify-between flex-wrap gap-1">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-base sm:text-lg font-black text-emerald-800">
                  {formattedPrice}
                </span>
                {item.unit && (
                  <span className="text-xs text-stone-500">/ {item.unit}</span>
                )}
              </div>

              {/* Explicit budget comparison if user provided budget */}
              {userBudget !== null && userBudget !== undefined && (
                <span
                  className={`text-[10.5px] font-bold px-2 py-0.5 rounded ${
                    isWithinBudget
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  {isWithinBudget
                    ? `Ndani ya bajeti (Hadi ${formatTshPrice(userBudget)})`
                    : `Inazidi bajeti yako (${formatTshPrice(userBudget)})`}
                </span>
              )}
            </div>

            {/* Seller & Verification Status (Section 17 - Seller truth only) */}
            <div className="flex items-center justify-between text-xs text-stone-700 pt-0.5">
              <div className="flex items-center space-x-1.5 truncate">
                <span className="font-semibold text-stone-900 truncate">
                  {item.sellerBusinessName || item.sellerName}
                </span>
                {item.sellerVerified ? (
                  <span
                    className="inline-flex items-center px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold shrink-0"
                    title="Muuzaji huyu amehakikiwa kwenye Gulio"
                  >
                    <ShieldCheck className="w-3 h-3 mr-0.5 text-emerald-600" />
                    Aliyehakikiwa
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-500 font-normal">
                    (Gulio Muuzaji)
                  </span>
                )}
              </div>
            </div>

            {/* Location (Section 20 - Marketplace truth only) */}
            <div className="flex items-center space-x-1.5 text-xs text-stone-600">
              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="truncate">
                {item.district ? `${item.district}, ` : ''}
                <strong className="text-stone-800">{item.region || item.location}</strong>
              </span>
            </div>

            {/* V1.6G: Trust Signals: Reputation Rating & Delivery Status */}
            {(() => {
              const signals = 'trustSignals' in item && item.trustSignals
                ? item.trustSignals
                : resolveProductTrustSignals(item as any);
              return (
                <div className="pt-1 border-t border-stone-100 flex items-center justify-between text-[10.5px] text-stone-600">
                  {signals.reputation.hasReviews && signals.reputation.averageRating !== null ? (
                    <div className="flex items-center gap-1 font-bold text-stone-800">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      <span>{signals.reputation.averageRating.toFixed(1)}</span>
                      <span className="text-stone-400 font-normal text-[9.5px]">({signals.reputation.totalPublishedReviews})</span>
                    </div>
                  ) : (
                    <span className="text-stone-400 text-[10px]">Bila tathmini</span>
                  )}

                  {signals.delivery.deliveryAvailable ? (
                    <span className="flex items-center gap-1 text-emerald-700 font-medium text-[10px]">
                      <Truck className="w-3 h-3" />
                      <span>{signals.delivery.displayFee}</span>
                    </span>
                  ) : (
                    <span className="text-stone-400 text-[10px]">Kuchukua pekee</span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* SECTION C: MARKETPLACE ACTIONS (Section 15 & 16 - No automatic contact) */}
        <div className="pt-3 border-t border-stone-100 flex items-center space-x-2">
          <button
            onClick={() => onOpenProduct(item.productId)}
            className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 shadow-2xs"
            title="Angalia picha zote, maelezo, na mawasiliano ya muuzaji"
          >
            <span>Angalia Bidhaa</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {item.shopId && onOpenShop && (
            <button
              onClick={() => onOpenShop(item.shopId!, item.catalogueId)}
              className="p-2 border border-stone-200 hover:border-emerald-300 rounded-xl text-stone-700 hover:text-emerald-800 hover:bg-emerald-50/50 transition-colors"
              title="Tembelea Duka la Muuzaji"
            >
              <Store className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
