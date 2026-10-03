import React from 'react';
import { DigitalShop, MarketplaceProduct, ShopCatalogue } from '../../types/marketplace';
import { SellerVerification } from '../../types/sellerVerification';
import {
  calculateReputationSummary,
  getLocalCachedReviews
} from '../../services/marketplaceReviewService';
import {
  Store,
  MapPin,
  ShieldCheck,
  Clock,
  Shield,
  Package,
  Layers,
  ChevronRight,
  UserCheck,
  Star
} from 'lucide-react';

interface ShopCardProps {
  shop: DigitalShop;
  products?: MarketplaceProduct[];
  catalogues?: ShopCatalogue[];
  onOpenShop: (sellerId: string) => void;
  verificationStatus?: 'verified' | 'unverified' | 'pending';
  authoritativeVerification?: SellerVerification | null;
}

export const ShopCard: React.FC<ShopCardProps> = ({
  shop,
  products = [],
  catalogues = [],
  onOpenShop,
  verificationStatus,
  authoritativeVerification
}) => {
  // Count active products
  const activeProducts = products.filter(
    (p) => p.sellerId === shop.sellerId && (p.status === 'active' || p.status === 'sold_out')
  );

  // Count catalogues
  const activeCatalogues = catalogues.filter((c) => c.sellerId === shop.sellerId && c.isActive);

  // Unique categories sold by this shop
  const shopCategories = Array.from(
    new Set(activeProducts.map((p) => p.category))
  ).slice(0, 3);

  // Check authoritative verification - never infer from arbitrary products or unverified text
  const isVerified =
    authoritativeVerification?.status === 'VERIFIED' ||
    (authoritativeVerification === undefined && verificationStatus === 'verified');

  const isPending =
    authoritativeVerification?.status === 'PENDING_VERIFICATION' ||
    authoritativeVerification?.status === 'UNDER_REVIEW' ||
    (authoritativeVerification === undefined && verificationStatus === 'pending');

  const ownerDisplayName =
    authoritativeVerification?.displayName ||
    authoritativeVerification?.businessName ||
    shop.shopName;

  // V1.6F: Shop Reputation & Review derivation
  const reputation = React.useMemo(() => {
    const reviews = getLocalCachedReviews();
    return calculateReputationSummary(reviews, 'SHOP', shop.shopId || shop.sellerId);
  }, [shop.shopId, shop.sellerId]);

  return (
    <div
      id={`shop-card-${shop.shopId || shop.sellerId}`}
      className="bg-white rounded-3xl border border-stone-200 shadow-2xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group hover:border-amber-300"
    >
      {/* Top Banner & Shop Info */}
      <div>
        <div className="h-20 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 relative p-4 flex items-end justify-between">
          <div className="absolute inset-0 bg-black/10"></div>
          {/* Badge: Verification or Status */}
          <div className="relative z-10">
            {isVerified ? (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-950 bg-emerald-300 border border-emerald-400 px-2 py-0.5 rounded-full shadow-2xs">
                <ShieldCheck className="w-3 h-3 text-emerald-900" />
                <span>Imethibitishwa</span>
              </span>
            ) : isPending ? (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-950 bg-amber-300 border border-amber-400 px-2 py-0.5 rounded-full shadow-2xs">
                <Clock className="w-3 h-3 text-amber-900" />
                <span>Uhakiki Unasubiriwa</span>
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-stone-300 bg-stone-800/80 px-2 py-0.5 rounded-full border border-stone-700">
                Duka la Mfugaji
              </span>
            )}
          </div>
        </div>

        {/* Logo Avatar + Title Block */}
        <div className="p-5 pt-0 relative space-y-3">
          <div className="flex items-end justify-between -mt-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-900 border-2 border-white shadow-sm flex items-center justify-center font-bold text-xl overflow-hidden shrink-0">
              {shop.logoImage ? (
                <img
                  src={shop.logoImage}
                  alt={shop.shopName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-8 h-8 text-amber-800" />
              )}
            </div>

            {/* Quick Stats: Products & Catalogues */}
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 inline-flex items-center gap-1"
                title={`${activeProducts.length} Bidhaa Zilizopo`}
              >
                <Package className="w-3 h-3 text-amber-700" />
                <span>{activeProducts.length} Bidhaa</span>
              </span>

              {activeCatalogues.length > 0 && (
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-stone-100 text-stone-700 border border-stone-200 inline-flex items-center gap-1"
                  title={`${activeCatalogues.length} Catalogues`}
                >
                  <Layers className="w-3 h-3 text-stone-600" />
                  <span>{activeCatalogues.length} Sehemu</span>
                </span>
              )}
            </div>
          </div>

          {/* Shop Name & Location */}
          <div className="space-y-1">
            <h3
              onClick={() => onOpenShop(shop.sellerId)}
              className="text-base font-extrabold text-stone-900 line-clamp-1 hover:text-amber-900 transition-colors cursor-pointer"
            >
              {shop.shopName}
            </h3>

            {/* Authoritative Owner */}
            <div className="flex items-center gap-1.5 text-xs text-stone-600">
              <UserCheck className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="truncate">
                Mmiliki: <strong className="text-stone-800">{ownerDisplayName}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
              <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate">
                {shop.district ? `${shop.district}, ` : ''}{shop.location || shop.region || 'Tanzania'}
              </span>
            </div>

            {/* V1.6F: Shop Rating & Reputation Indicator */}
            <div className="flex items-center justify-between gap-1 text-[11px] pt-0.5">
              {reputation.hasReviews && reputation.averageRating !== null ? (
                <div
                  className="flex items-center gap-1 font-bold text-stone-800"
                  title={reputation.isSmallSample ? 'Sampuli ndogo ya tathmini (1-2)' : `Wastani wa nyota ${reputation.averageRating}`}
                >
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                  <span>{reputation.averageRating.toFixed(1)}</span>
                  <span className="text-stone-400 font-normal text-[10px]">
                    ({reputation.totalPublishedReviews} {reputation.totalPublishedReviews === 1 ? 'tathmini' : 'tathmini'})
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
                  <span>Bila tathmini za duka</span>
                </div>
              )}
            </div>
          </div>

          {/* Short Description */}
          <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed min-h-[32px]">
            {shop.description || 'Karibu kwenye duka letu la mifugo na pembejeo bora.'}
          </p>

          {/* Categories Tags Preview */}
          {shopCategories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {shopCategories.map((cat) => (
                <span
                  key={cat}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600 border border-stone-200"
                >
                  {cat}
                </span>
              ))}
              {activeProducts.length > shopCategories.length && (
                <span className="text-[10px] text-stone-600 font-semibold">
                  +{activeProducts.length - shopCategories.length} zaidi
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-4 pt-3 bg-stone-50/80 border-t border-stone-100">
        <button
          type="button"
          onClick={() => onOpenShop(shop.sellerId)}
          className="w-full py-2.5 px-4 bg-white hover:bg-amber-900 hover:text-white border border-stone-200 hover:border-amber-900 text-stone-800 text-xs font-bold rounded-xl flex items-center justify-between shadow-2xs transition-all cursor-pointer min-h-[42px] group/btn"
        >
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-amber-700 group-hover/btn:text-white transition-colors" />
            <span>Tazama Duka & Bidhaa Zote</span>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400 group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-all" />
        </button>
      </div>
    </div>
  );
};
