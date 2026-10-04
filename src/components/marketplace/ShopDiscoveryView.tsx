import React, { useState, useMemo } from 'react';
import { DigitalShop, MarketplaceProduct, ShopCatalogue } from '../../types/marketplace';
import { SellerVerification } from '../../types/sellerVerification';
import { ShopCard } from './ShopCard';
import { scoreShopRelevance } from '../../services/marketplaceService';
import {
  Store,
  Search,
  MapPin,
  ShieldCheck,
  X,
  Filter,
  Package,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ShopDiscoveryViewProps {
  shops: DigitalShop[];
  products: MarketplaceProduct[];
  catalogues?: Record<string, ShopCatalogue[]>;
  cataloguesMap?: Record<string, ShopCatalogue[]>;
  authoritativeVerificationsMap?: Record<string, SellerVerification>;
  onOpenShop: (sellerId: string, catalogueId?: string | null, productId?: string | null) => void;
  onGoToProducts?: () => void;
}

export const ShopDiscoveryView: React.FC<ShopDiscoveryViewProps> = ({
  shops,
  products,
  catalogues,
  cataloguesMap,
  authoritativeVerificationsMap = {},
  onOpenShop,
  onGoToProducts
}) => {
  const resolvedCatalogues = catalogues || cataloguesMap || {};
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // Flatten all catalogues for scoring
  const allCataloguesList = useMemo(() => {
    return Object.values(resolvedCatalogues).flat();
  }, [resolvedCatalogues]);

  // Extract unique regions from available published shops
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    shops.forEach((s) => {
      if (s.region) set.add(s.region);
      else if (s.location) set.add(s.location.split('-')[0].trim());
    });
    return Array.from(set).sort();
  }, [shops]);

  // Filter & Sort shops
  const filteredShops = useMemo(() => {
    let result = [...shops];

    // Filter by Region
    if (selectedRegion !== 'All') {
      result = result.filter(
        (s) =>
          (s.region && s.region.toLowerCase() === selectedRegion.toLowerCase()) ||
          (s.location && s.location.toLowerCase().includes(selectedRegion.toLowerCase()))
      );
    }

    // Filter by Verified Only (Authoritative Seller Verification Check)
    if (verifiedOnly) {
      result = result.filter((s) => {
        const verif = authoritativeVerificationsMap[s.sellerId];
        return verif?.status === 'VERIFIED';
      });
    }

    // Filter and score by search term
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const scored = result
        .map((shop) => {
          const shopProds = products.filter((p) => p.sellerId === shop.sellerId);
          const shopCats = resolvedCatalogues[shop.sellerId] || [];
          const score = scoreShopRelevance(shop, q, shopProds, shopCats);
          return { shop, score };
        })
        .filter((item) => item.score > 0);

      scored.sort((a, b) => b.score - a.score);
      result = scored.map((item) => item.shop);
    }

    return result;
  }, [shops, products, resolvedCatalogues, authoritativeVerificationsMap, selectedRegion, verifiedOnly, searchTerm]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedRegion('All');
    setVerifiedOnly(false);
  };

  const hasActiveFilters = searchTerm.trim() !== '' || selectedRegion !== 'All' || verifiedOnly;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-900/20 to-transparent pointer-events-none hidden sm:block"></div>
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <Store className="w-3.5 h-3.5" />
            <span>Maduka ya Kidijitali ya Wafugaji</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Gundua Maduka ya Mifugo & Pembejeo
          </h2>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
            Tazama maduka ya wafugaji, wazalishaji wa vifaranga, maduka ya vyakula vya mifugo na wataalamu wa tiba kote nchini Tanzania. Kila duka limepangwa na catalogues zake.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tafuta duka kwa jina, mkoa, au aina ya bidhaa (mf. Juma, Morogoro, Vifaranga)..."
              className="w-full pl-9 pr-8 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Region Dropdown */}
          <div className="w-full md:w-56 shrink-0">
            <div className="relative">
              <MapPin className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:border-amber-600 font-medium"
              >
                <option value="All">Mikoa Yote ya Tanzania</option>
                {availableRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Verified Toggle */}
          <button
            type="button"
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            className={`w-full md:w-auto px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              verifiedOnly
                ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 ${verifiedOnly ? 'text-emerald-700' : 'text-stone-400'}`} />
            <span>Yaliyothibitishwa Pekee</span>
          </button>
        </div>

        {/* Active Filters Row & Results Count */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 flex-wrap text-xs">
          <div className="text-stone-600 font-medium">
            Maduka yaliyopatikana:{' '}
            <strong className="text-stone-900 font-extrabold">{filteredShops.length}</strong>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-bold text-rose-700 hover:text-rose-800 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Ondoa Vichujio Vyote</span>
            </button>
          )}
        </div>
      </div>

      {/* Shops Grid or Empty State */}
      {filteredShops.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center space-y-4 max-w-lg mx-auto my-8">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
            <Store className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-stone-900">
              {shops.length === 0 ? 'Bado Hakuna Maduka Yaliyosajiliwa' : 'Hakuna Duka Lililopatikana'}
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
              {shops.length === 0
                ? 'Soko hili linatumia wauzaji halisi pekee. Maduka mapya ya wauzaji waliosajiliwa yataonekana hapa.'
                : 'Hakuna duka la kidijitali linaloendana na vigezo ulivyoweka. Jaribu kutafuta kwa jina lingine au ondoa vichujio.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="py-2.5 px-4 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Ondoa Vichujio
              </button>
            )}
            <button
              type="button"
              onClick={onGoToProducts}
              className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Tazama Bidhaa Zote
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredShops.map((shop) => (
            <ShopCard
              key={shop.shopId || shop.sellerId}
              shop={shop}
              products={products}
              catalogues={resolvedCatalogues[shop.sellerId] || []}
              onOpenShop={onOpenShop}
              authoritativeVerification={authoritativeVerificationsMap[shop.sellerId]}
            />
          ))}
        </div>
      )}
    </div>
  );
};
