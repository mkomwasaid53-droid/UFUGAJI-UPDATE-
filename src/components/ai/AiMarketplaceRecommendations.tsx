import React from 'react';
import {
  AiMarketplaceRecommendationResult,
  ProductRecommendationItem,
  ShopRecommendationItem
} from '../../types/marketplaceRecommendation';
import { StructuredVisualMarketplaceQuery } from '../../types/visualMarketplace';
import { MarketplaceProduct } from '../../types/marketplace';
import { formatTshPrice } from '../../services/marketplaceService';
import { VisualProductRecommendationView } from '../marketplace/VisualProductRecommendationView';
import {
  Store,
  MapPin,
  ShieldCheck,
  Package,
  Video,
  ExternalLink,
  ChevronRight,
  ShoppingBag,
  AlertCircle,
  Sparkles,
  Layers,
  ArrowRight,
  Eye,
  CheckCircle2,
  Info
} from 'lucide-react';

interface AiMarketplaceRecommendationsProps {
  recommendations: AiMarketplaceRecommendationResult;
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
  // Live products pool for real-time revalidation of stock and details
  liveProducts?: MarketplaceProduct[];
  onOpenProduct: (productId: string) => void;
  onOpenShop: (shopId: string, catalogueId?: string | null) => void;
  onNavigateMarketplace: () => void;
  onNavigateDaktari?: () => void;
  onUpdateQuery?: (updatedQuery: StructuredVisualMarketplaceQuery) => void;
}

export const AiMarketplaceRecommendations: React.FC<AiMarketplaceRecommendationsProps> = ({
  recommendations,
  structuredQuery,
  liveProducts = [],
  onOpenProduct,
  onOpenShop,
  onNavigateMarketplace,
  onNavigateDaktari,
  onUpdateQuery
}) => {
  if (!recommendations.detected) {
    return null;
  }

  // Visual Product Search recommendation delegation (V1.3E)
  const isVisualRecommendation =
    recommendations.intentType === 'VISUAL_PRODUCT_SEARCH' ||
    recommendations.intentType === 'VISUAL_PRODUCT_NEED' ||
    Boolean(recommendations.visualMatchResult) ||
    Boolean(recommendations.products?.some((p) => p.visualMatch || p.visualMatchConfidence));

  if (isVisualRecommendation) {
    return (
      <VisualProductRecommendationView
        recommendations={recommendations}
        structuredQuery={structuredQuery || recommendations.visualMatchResult?.structuredQuery}
        liveProducts={liveProducts}
        onOpenProduct={onOpenProduct}
        onOpenShop={onOpenShop}
        onNavigateMarketplace={onNavigateMarketplace}
        onNavigateDaktari={onNavigateDaktari}
        onUpdateQuery={onUpdateQuery}
      />
    );
  }

  // Check if any product is in a medical or pharmaceutical category
  const hasMedicalCategory =
    recommendations.queryCategory === 'Dawa za Mifugo' ||
    recommendations.queryKeywords.some((k) =>
      ['dawa', 'antibiotic', 'sindano', 'chanjo', 'tiba'].includes(k.toLowerCase())
    );

  // Revalidate product data against current live products if available
  const getLiveProductData = (item: ProductRecommendationItem) => {
    const live = liveProducts.find((p) => p.productId === item.productId);
    if (!live) return item;

    return {
      ...item,
      title: live.title || item.title,
      price: live.price ?? item.price,
      inStock: live.status === 'active' && (live.quantityAvailable || 0) > 0,
      quantityAvailable: live.quantityAvailable ?? item.quantityAvailable,
      imageUrl: live.imageUrl || (live.images && live.images[0]?.url) || item.imageUrl,
      hasVideo: Boolean(live.video?.url),
      videoDurationSeconds: live.video?.durationSeconds
    };
  };

  return (
    <div
      id="ai-marketplace-recommendations-container"
      className="mt-4 pt-3.5 border-t border-stone-200/80 space-y-3"
    >
      {/* Section Header: Clearly separated from advisor answer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
            <Store className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-stone-900 tracking-tight">
              {recommendations.targetType === 'shop'
                ? 'Maduka Yanayohusiana kwenye Gulio'
                : 'Bidhaa Zinazohusiana kwenye Gulio'}
            </h4>
            <p className="text-[11px] text-stone-700">
              {recommendations.explanation}
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateMarketplace}
          className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 flex items-center space-x-1 shrink-0 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors"
          title="Fungua ukurasa wa Gulio"
        >
          <span>Gulio Lote</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Medical / Veterinary safety disclaimer notice when applicable */}
      {hasMedicalCategory && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start space-x-2 text-stone-800">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-bold text-amber-900">Ushauri wa Kitaalamu: </span>
            Mapendekezo haya si maagizo rasmi ya daktari. Tafadhali wasiliana na
            Afisa Mifugo aliye karibu nawe kabla ya kumpatia mnyama dawa au matibabu.
          </div>
        </div>
      )}

      {/* NO RESULTS STATE */}
      {recommendations.status === 'no_results' && (
        <div
          id="ai-marketplace-no-results"
          className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-center space-y-2.5"
        >
          <div className="w-8 h-8 rounded-full bg-stone-200/80 text-stone-600 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-stone-800">
              {recommendations.explanation}
            </p>
            <p className="text-[11px] text-stone-700">
              Unaweza kuingia Gulioni kutafuta bidhaa au kuwasiliana na wauzaji wengine.
            </p>
          </div>
          <button
            onClick={onNavigateMarketplace}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold text-stone-800 hover:bg-stone-100 hover:border-stone-400 transition-colors shadow-2xs"
          >
            <span>Fungua Gulio Kuangalia Zaidi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PRODUCT RECOMMENDATIONS CARDS */}
      {recommendations.status === 'has_results' &&
        recommendations.targetType === 'product' &&
        recommendations.products &&
        recommendations.products.length > 0 && (
          <div
            id="ai-marketplace-product-cards-grid"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"
          >
            {recommendations.products.map((rawItem) => {
              const item = getLiveProductData(rawItem);
              const formattedPrice = formatTshPrice(item.price);

              return (
                <div
                  key={item.productId}
                  id={`ai-rec-product-${item.productId}`}
                  className="bg-white rounded-xl border border-stone-200 shadow-2xs hover:shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between overflow-hidden group"
                >
                  {/* Top Image & Media Badge */}
                  <div className="relative w-full h-28 bg-stone-100 border-b border-stone-100 overflow-hidden flex items-center justify-center">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-stone-500 space-y-0.5">
                        <Package className="w-6 h-6 text-stone-400" />
                        <span className="text-[9.5px]">Bila Picha</span>
                      </div>
                    )}

                    {/* Stock indicator badge */}
                    <div className="absolute top-1.5 left-1.5">
                      {item.inStock ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-600 text-white shadow-2xs">
                          Ipo ({item.quantityAvailable})
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-stone-700 text-stone-100 shadow-2xs">
                          Haipo
                        </span>
                      )}
                    </div>

                    {/* Video Indicator Badge */}
                    {item.hasVideo && (
                      <div
                        className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-xs text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 shadow-2xs"
                        title="Ina Video ya Bidhaa"
                      >
                        <Video className="w-2.5 h-2.5 text-amber-400" />
                        <span>Video</span>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      {/* Product Title */}
                      <h5
                        className="text-xs font-bold text-stone-900 line-clamp-2 leading-tight group-hover:text-emerald-800 transition-colors"
                        title={item.title}
                      >
                        {item.title}
                      </h5>

                      {/* Price & Unit */}
                      <div className="flex items-baseline space-x-1">
                        <span className="text-xs font-extrabold text-emerald-800">
                          {formattedPrice}
                        </span>
                        {item.unit && (
                          <span className="text-[10px] text-stone-600">
                            / {item.unit}
                          </span>
                        )}
                      </div>

                      {/* Seller & Verification */}
                      <div className="flex items-center space-x-1 text-[10.5px] text-stone-700 truncate">
                        <span className="truncate font-medium">
                          {item.sellerBusinessName || item.sellerName}
                        </span>
                        {item.sellerVerified && (
                          <span
                            className="inline-flex items-center text-emerald-700 shrink-0"
                            title="Muuzaji Aliyehakikiwa"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 fill-emerald-100 text-emerald-700" />
                          </span>
                        )}
                      </div>

                      {/* Location */}
                      <div className="flex items-center space-x-1 text-[10px] text-stone-600 truncate">
                        <MapPin className="w-3 h-3 text-stone-500 shrink-0" />
                        <span className="truncate">
                          {item.district ? `${item.district}, ` : ''}
                          {item.region || item.location}
                        </span>
                      </div>

                      {/* Visual Match Badge & Explanation (V1.3D) */}
                      {item.visualMatch ? (
                        <div className="pt-1 space-y-1">
                          <div className="flex items-center space-x-1">
                            {item.isSemanticOnly ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                                <Info className="w-2.5 h-2.5 mr-1 text-stone-500 shrink-0" />
                                <span>Bila picha • Ulinganifu wa maelezo</span>
                              </span>
                            ) : item.visualMatch.matchTier === 'EXACT_OR_VERY_STRONG' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-emerald-600 shrink-0" />
                                <span>Inafanana sana</span>
                              </span>
                            ) : item.visualMatch.matchTier === 'STRONGLY_SIMILAR' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                                <Eye className="w-2.5 h-2.5 mr-1 text-teal-600 shrink-0" />
                                <span>Inafanana kwa kiwango kikubwa</span>
                              </span>
                            ) : item.visualMatch.matchTier === 'RELATED_PRODUCT' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                                <Eye className="w-2.5 h-2.5 mr-1 text-sky-600 shrink-0" />
                                <span>Inafanana kwa kiwango cha kati</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-stone-50 text-stone-700 border border-stone-200">
                                <Info className="w-2.5 h-2.5 mr-1 text-stone-400 shrink-0" />
                                <span>Uhusiano wa karibu (Haijathibitishwa)</span>
                              </span>
                            )}
                          </div>
                          {item.visualMatchExplanation && (
                            <p className="text-[10px] text-stone-600 leading-tight">
                              {item.visualMatchExplanation}
                            </p>
                          )}
                        </div>
                      ) : item.relevanceReason ? (
                        <div className="pt-0.5">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9.5px] bg-stone-100 text-stone-800 border border-stone-200">
                            {item.relevanceReason}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* CTA Actions */}
                    <div className="pt-2 border-t border-stone-100 flex items-center space-x-1.5">
                      <button
                        onClick={() => onOpenProduct(item.productId)}
                        className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center space-x-1 shadow-2xs"
                      >
                        <span>Angalia Bidhaa</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>

                      {item.shopId && (
                        <button
                          onClick={() => onOpenShop(item.shopId!, item.catalogueId)}
                          className="p-1.5 border border-stone-200 rounded-lg text-stone-600 hover:text-emerald-800 hover:bg-stone-50 transition-colors"
                          title="Tembelea Duka"
                        >
                          <Store className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* SHOP RECOMMENDATIONS CARDS */}
      {recommendations.status === 'has_results' &&
        recommendations.targetType === 'shop' &&
        recommendations.shops &&
        recommendations.shops.length > 0 && (
          <div
            id="ai-marketplace-shop-cards-grid"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"
          >
            {recommendations.shops.map((shop) => (
              <div
                key={shop.shopId}
                id={`ai-rec-shop-${shop.shopId}`}
                className="bg-white rounded-xl border border-stone-200 p-3 shadow-2xs hover:shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between space-y-2"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-stone-900 line-clamp-1">
                          {shop.shopName}
                        </h5>
                        <div className="flex items-center space-x-1 text-[10px] text-stone-600">
                          <MapPin className="w-2.5 h-2.5 text-stone-500" />
                          <span className="truncate">{shop.region || shop.location}</span>
                        </div>
                      </div>
                    </div>

                    {shop.sellerVerified && (
                      <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] text-stone-700 line-clamp-2 leading-relaxed">
                    {shop.description}
                  </p>

                  {shop.relevanceReason && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9.5px] bg-stone-100 text-stone-800 border border-stone-200">
                      {shop.relevanceReason}
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100">
                  <button
                    onClick={() => onOpenShop(shop.shopId)}
                    className="w-full py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center space-x-1 shadow-2xs"
                  >
                    <span>Tembelea Duka</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};
