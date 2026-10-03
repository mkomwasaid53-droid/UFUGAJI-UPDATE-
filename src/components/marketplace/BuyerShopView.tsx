import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DigitalShop, ShopCatalogue, MarketplaceProduct } from '../../types/marketplace';
import { SellerVerification } from '../../types/sellerVerification';
import { evaluateShopMarketplaceEligibility } from '../../services/marketplaceGovernanceEnforcement';
import { ShopHeader } from './ShopHeader';
import { ProductCard } from './ProductCard';
import { ProductReviewsSection } from './ProductReviewsSection';
import {
  ArrowLeft,
  Search,
  Store,
  Layers,
  Package,
  AlertCircle,
  Sparkles,
  PhoneCall,
  SlidersHorizontal,
  Info,
  Building2,
  ChevronRight
} from 'lucide-react';

interface BuyerShopViewProps {
  shop: DigitalShop;
  catalogues: ShopCatalogue[];
  products: MarketplaceProduct[];
  isOwner?: boolean;
  authoritativeVerification?: SellerVerification | null;
  initialCatalogueId?: string | null;
  highlightProductId?: string | null;
  onBackToMarket: () => void;
  onBackToShops?: () => void;
  onViewProductDetails: (product: MarketplaceProduct) => void;
  onEditProduct?: (product: MarketplaceProduct) => void;
  onDeleteProduct?: (product: MarketplaceProduct) => void;
  onToggleProductStatus?: (product: MarketplaceProduct) => void;
  onContactSeller?: (product: MarketplaceProduct) => void;
  onEditShop?: () => void;
}

export const BuyerShopView: React.FC<BuyerShopViewProps> = ({
  shop,
  catalogues,
  products,
  isOwner = false,
  authoritativeVerification,
  initialCatalogueId,
  highlightProductId,
  onBackToMarket,
  onBackToShops,
  onViewProductDetails,
  onEditProduct,
  onDeleteProduct,
  onToggleProductStatus,
  onContactSeller,
  onEditShop
}) => {
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string>(
    initialCatalogueId || 'all'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    highlightProductId || null
  );

  // Sync initialCatalogueId changes
  useEffect(() => {
    if (initialCatalogueId) {
      setSelectedCatalogueId(initialCatalogueId);
    }
  }, [initialCatalogueId]);

  // Sync highlightProductId & scroll into view
  useEffect(() => {
    if (highlightProductId) {
      setActiveHighlightId(highlightProductId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`product-card-${highlightProductId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [highlightProductId]);

  // Active catalogues (or all if owner)
  const visibleCatalogues = useMemo(() => {
    return isOwner ? catalogues : catalogues.filter((c) => c.isActive);
  }, [catalogues, isOwner]);

  // Filter products by selected catalogue and search term
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // If not owner, only show active or sold out products (hide inactive/draft)
      if (!isOwner && product.status !== 'active' && product.status !== 'sold_out') {
        return false;
      }

      // Catalogue filter
      if (selectedCatalogueId === 'all') {
        // all products
      } else if (selectedCatalogueId === 'uncategorized') {
        if (product.catalogueId) return false;
      } else {
        if (product.catalogueId !== selectedCatalogueId) return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = product.title.toLowerCase().includes(query);
        const matchesCategory = product.category.toLowerCase().includes(query);
        const matchesSubcat = product.subcategory?.toLowerCase().includes(query);
        const matchesDesc = product.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCategory && !matchesSubcat && !matchesDesc) {
          return false;
        }
      }

      return true;
    });
  }, [products, selectedCatalogueId, searchTerm, isOwner]);

  // Count uncategorized products
  const uncategorizedCount = useMemo(() => {
    return products.filter((p) => !p.catalogueId).length;
  }, [products]);

  // V1.10A-CORRECTIVE-4: Public shop eligibility check
  const shopEligibility = evaluateShopMarketplaceEligibility(shop);

  if (!isOwner && !shopEligibility.isEligible) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center gap-2 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
          <button
            type="button"
            onClick={onBackToMarket}
            className="py-1.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-stone-600" />
            <span>Rudi Gulio Kuu</span>
          </button>
        </div>

        <div className="p-8 sm:p-12 text-center bg-white rounded-3xl border border-stone-200 shadow-2xs max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 mx-auto text-2xl font-bold">
            🔒
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-black text-stone-900">
              Duka Halipatikani Hewani (Shop Not Live)
            </h3>
            <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
              {shopEligibility.publicUnavailableReason || 'Duka hili halipatikani hewani kwa wanunuzi kwa sasa.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToMarket}
            className="py-2.5 px-5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Rudi Kwenye Soko la Gulio</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Back Navigation Bar with Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onBackToMarket}
            className="py-1.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-stone-600" />
            <span>Gulio Kuu</span>
          </button>

          {onBackToShops && (
            <>
              <span className="text-stone-300">/</span>
              <button
                type="button"
                onClick={onBackToShops}
                className="py-1.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-700" />
                <span>Maduka ya Mifugo</span>
              </button>
            </>
          )}

          <span className="text-stone-300">/</span>
          <span className="text-xs font-extrabold text-stone-900 truncate max-w-[200px] sm:max-w-xs">
            {shop.shopName}
          </span>
        </div>

        {isOwner ? (
          <span className="text-xs font-semibold px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" />
            <span>Unatazama Duka Lako</span>
          </span>
        ) : (
          <span className="text-xs text-stone-500 font-medium hidden sm:inline-block">
            {products.length} Bidhaa • {visibleCatalogues.length} Sehemu
          </span>
        )}
      </div>

      {/* Unpublished Notice if any */}
      {!shop.isPublished && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs sm:text-sm text-amber-900 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
          <div>
            <strong className="block font-bold">Duka hili halijachapishwa hewani (Draft)</strong>
            <p className="text-xs text-amber-800 pt-0.5">
              {isOwner
                ? 'Duka lako lipo kwenye hali ya rasimu. Wateja wa kawaida hawataweza kuliona hadi utakapoliweka "Published".'
                : 'Muuzaji ameificha duka hili kwa muda kwa ajili ya maboresho.'}
            </p>
          </div>
        </div>
      )}

      {/* Shop Header */}
      <ShopHeader
        shop={shop}
        isOwner={isOwner}
        authoritativeVerification={authoritativeVerification}
        totalProducts={products.length}
        totalCatalogues={visibleCatalogues.length}
        onEditShop={onEditShop}
      />

      {/* Catalogue Selector & Search Bar */}
      <div className="space-y-3 bg-white p-4 rounded-3xl border border-stone-200 shadow-2xs">
        {/* Search within shop */}
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Tafuta ndani ya duka la ${shop.shopName} (mf. jina, aina, mayai, vifaranga)...`}
            className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[42px]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500 hover:text-stone-800 font-bold"
            >
              Futa
            </button>
          )}
        </div>

        {/* Catalogue Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar pt-1">
          {/* All products tab */}
          <button
            type="button"
            onClick={() => setSelectedCatalogueId('all')}
            className={`py-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
              selectedCatalogueId === 'all'
                ? 'bg-amber-900 text-white shadow-xs'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
            }`}
          >
            <span>📦</span>
            <span>Bidhaa Zote</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                selectedCatalogueId === 'all'
                  ? 'bg-amber-800 text-amber-100'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {products.length}
            </span>
          </button>

          {/* Catalogues tabs */}
          {visibleCatalogues.map((cat) => {
            const count = products.filter((p) => p.catalogueId === cat.catalogueId).length;
            const isSelected = selectedCatalogueId === cat.catalogueId;

            return (
              <button
                key={cat.catalogueId}
                type="button"
                onClick={() => setSelectedCatalogueId(cat.catalogueId)}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                  isSelected
                    ? 'bg-amber-900 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
                }`}
              >
                <span>{cat.icon || '📁'}</span>
                <span>{cat.name}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                    isSelected
                      ? 'bg-amber-800 text-amber-100'
                      : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Uncategorized products tab if any exist */}
          {uncategorizedCount > 0 && visibleCatalogues.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedCatalogueId('uncategorized')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                selectedCatalogueId === 'uncategorized'
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
              }`}
            >
              <span>🏷️</span>
              <span>Jumla / Nyingine</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  selectedCatalogueId === 'uncategorized'
                    ? 'bg-amber-800 text-amber-100'
                    : 'bg-stone-200 text-stone-700'
                }`}
              >
                {uncategorizedCount}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Products Grid */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-sm sm:text-base font-bold text-stone-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-800" />
            <span>
              {selectedCatalogueId === 'all'
                ? 'Bidhaa Zote za Duka'
                : selectedCatalogueId === 'uncategorized'
                ? 'Bidhaa za Jumla'
                : visibleCatalogues.find((c) => c.catalogueId === selectedCatalogueId)?.name || 'Bidhaa'}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              {filteredProducts.length}
            </span>
          </h2>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center mx-auto text-xl">
              📦
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-stone-900">
                Hakuna bidhaa zilizopatikana
              </h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                {searchTerm
                  ? `Hakuna bidhaa inayoendana na "${searchTerm}" ndani ya sehemu hii.`
                  : 'Muuzaji bado hajaweka bidhaa ndani ya catalogue hii.'}
              </p>
            </div>
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Ondoa Kichujio cha Kutafuta
              </button>
            ) : selectedCatalogueId !== 'all' ? (
              <button
                type="button"
                onClick={() => setSelectedCatalogueId('all')}
                className="py-2 px-4 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Tazama Sehemu Zote za Duka
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.productId}
                product={product}
                isOwner={isOwner}
                isHighlighted={activeHighlightId === product.productId}
                onViewDetails={onViewProductDetails}
                onEdit={onEditProduct}
                onDelete={onDeleteProduct}
                onToggleStatus={onToggleProductStatus}
                onContact={onContactSeller}
              />
            ))}
          </div>
        )}
      </div>

      {/* V1.6F: Shop Reviews, Reputation & Reporting */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs">
        <ProductReviewsSection
          targetType="SHOP"
          targetId={shop.shopId || shop.sellerId}
          sellerId={shop.sellerId}
          shopId={shop.shopId}
          targetTitle={shop.shopName}
          isOwner={isOwner}
        />
      </div>

      {/* Footer Navigation Buttons */}
      <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBackToMarket}
          className="py-2.5 px-5 bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[42px]"
        >
          <ArrowLeft className="w-4 h-4 text-stone-600" />
          <span>Rudi Kwenye Gulio (Soko Kuu)</span>
        </button>

        {onBackToShops && (
          <button
            type="button"
            onClick={onBackToShops}
            className="py-2.5 px-5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[42px]"
          >
            <Building2 className="w-4 h-4 text-amber-800" />
            <span>Tazama Maduka Mengine ya Mifugo</span>
          </button>
        )}
      </div>
    </div>
  );
};

