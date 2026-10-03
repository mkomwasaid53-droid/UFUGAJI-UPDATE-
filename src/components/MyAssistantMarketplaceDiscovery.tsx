import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MyAssistantMarketplaceContext,
  MyAssistantMarketplaceQueryResult
} from '../types/myAssistantMarketplace';
import { MarketplaceProduct } from '../types/marketplace';
import {
  executeMyAssistantMarketplaceDiscovery,
  isMedicalOrHealthIntelligence
} from '../services/myAssistantMarketplaceAdapter';
import {
  Store,
  Search,
  SlidersHorizontal,
  X,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Package,
  AlertCircle,
  Sparkles,
  Info,
  CheckCircle2,
  Filter,
  ArrowRight,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface MyAssistantMarketplaceDiscoveryProps {
  context: MyAssistantMarketplaceContext;
  allProducts: MarketplaceProduct[];
  onClose: () => void;
  onSelectProduct?: (productId: string) => void;
}

export const MyAssistantMarketplaceDiscovery: React.FC<MyAssistantMarketplaceDiscoveryProps> = ({
  context,
  allProducts = [],
  onClose,
  onSelectProduct
}) => {
  const navigate = useNavigate();

  // Explicit user refinement state (Section 15: Explicit criteria override context)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedBudget, setSelectedBudget] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showTraceability, setShowTraceability] = useState(false);

  // Derive active context merged with explicit farmer criteria
  const activeContext: MyAssistantMarketplaceContext = useMemo(() => {
    const maxBudgetNum = selectedBudget ? Number(selectedBudget) : undefined;
    const hasExplicit = Boolean(
      searchQuery.trim() || selectedLocation.trim() || (maxBudgetNum && !isNaN(maxBudgetNum))
    );

    if (!hasExplicit) {
      return context;
    }

    return {
      ...context,
      explicitUserCriteria: {
        searchQuery: searchQuery.trim() || undefined,
        location: selectedLocation.trim() || undefined,
        maxPrice: maxBudgetNum && !isNaN(maxBudgetNum) ? maxBudgetNum : undefined
      }
    };
  }, [context, searchQuery, selectedLocation, selectedBudget]);

  // Execute deterministic discovery query (reuses V1.5C ranking)
  const discoveryResult: MyAssistantMarketplaceQueryResult = useMemo(() => {
    return executeMyAssistantMarketplaceDiscovery(activeContext, allProducts);
  }, [activeContext, allProducts]);

  // Check if user search contains medical keywords to provide medical safety reminder
  const hasMedicalQuery = useMemo(() => {
    return isMedicalOrHealthIntelligence(undefined, undefined, searchQuery);
  }, [searchQuery]);

  const handleClearRefinements = () => {
    setSearchQuery('');
    setSelectedLocation('');
    setSelectedBudget('');
  };

  const handleOpenMarketplaceWithQuery = () => {
    const q = searchQuery.trim() || discoveryResult.structuredQuery.keywords.join(' ') || context.livestockType || '';
    onClose();
    navigate(`/marketplace?search=${encodeURIComponent(q)}`);
  };

  return (
    <div
      id="myassistant-marketplace-discovery-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* 1. Header with Provenance & Close */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-start justify-between gap-3 bg-stone-50/70">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                <Store className="w-3 h-3 text-emerald-700" />
                Gulio Discovery (V1.5D)
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-200/80 text-stone-700">
                Muktadha: {context.livestockType || 'Mifugo'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-1.5">
              <span>Bidhaa Zinazolingana na Ufugaji Wako</span>
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed">
              Ugunduzi wa bidhaa halisi za Gulio kulingana na kumbukumbu zako za Msaidizi Wangu.
            </p>
          </div>

          <button
            id="marketplace-discovery-close-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-stone-200 text-stone-500 hover:text-stone-900 flex items-center justify-center hover:bg-stone-100 transition-colors cursor-pointer shrink-0"
            aria-label="Funga"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Contextual Provenance & Safety Banner */}
        <div className="px-4 sm:px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100/70 flex items-start gap-2.5 text-xs text-emerald-950">
          <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-[11px] leading-snug">
              {discoveryResult.contextualLabel}
            </p>
            <div className="flex items-center gap-3 text-[10px] text-emerald-800 flex-wrap">
              <span>
                <strong>Chanzo:</strong> Msaidizi Wangu ({discoveryResult.traceableReason.livestockType})
              </span>
              <span>•</span>
              <span>
                <strong>Uthibitisho:</strong> Gulio la Ufugaji Update (Data Halisi)
              </span>
              <button
                type="button"
                id="btn-toggle-traceability"
                onClick={() => setShowTraceability(!showTraceability)}
                className="underline font-semibold hover:text-emerald-950 cursor-pointer ml-auto"
              >
                {showTraceability ? 'Ficha Maelezo' : 'Kwanini Hizi?'}
              </button>
            </div>

            {showTraceability && (
              <div className="p-2.5 bg-white rounded-xl border border-emerald-200 text-[11px] text-stone-700 space-y-1 mt-1.5 animate-in fade-in">
                <p className="font-bold text-emerald-900 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-emerald-700" />
                  Sababu Rasmi ya Pendekezo (Traceable Reason):
                </p>
                <p>{discoveryResult.traceableReason.reason}</p>
                <p className="text-[10px] text-stone-500 italic">
                  * Gulio ndilo chanzo pekee cha ukweli wa kibiashara (bei, stoo, wauzaji). Msaidizi Wangu habuni nia ya manunuzi.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Medical safety notice if medical term typed */}
        {hasMedicalQuery && (
          <div className="px-4 sm:px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-[11px]">
              <strong>Angalizo la Kiafya:</strong> Matumizi ya dawa au chanjo yanahitaji ushauri wa kitaalamu wa mifugo kabla ya ununuzi.
            </span>
          </div>
        )}

        {/* 3. Explicit Refinement Bar (Section 15: Explicit criteria override context) */}
        <div className="p-3 sm:p-4 border-b border-stone-200/80 bg-white space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="discovery-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Tafuta bidhaa za ${context.livestockType || 'mifugo'} (mf. chakula, vyombo)...`}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              id="discovery-filter-toggle-btn"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px] ${
                showFilters || selectedLocation || selectedBudget
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chuja</span>
            </button>
          </div>

          {/* Collapsible Refinement Filters */}
          {showFilters && (
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs animate-in fade-in">
              <div>
                <label className="text-[10px] font-bold text-stone-600 block mb-1">
                  Eneo (Mkoa / Wilaya)
                </label>
                <input
                  id="discovery-filter-location"
                  type="text"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  placeholder="Mf. Morogoro, Dar es Salaam..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-600 block mb-1">
                  Bajeti ya Juu (TSh)
                </label>
                <input
                  id="discovery-filter-budget"
                  type="number"
                  value={selectedBudget}
                  onChange={(e) => setSelectedBudget(e.target.value)}
                  placeholder="Mf. 50000"
                  className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              {(searchQuery || selectedLocation || selectedBudget) && (
                <div className="sm:col-span-2 pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleClearRefinements}
                    className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Futa Vichujio vyote
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Products Result List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {discoveryResult.status === 'error' ? (
            <div className="p-6 text-center space-y-3 bg-red-50/50 rounded-2xl border border-red-200">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-xs font-bold text-red-900">
                  Hitilafu ya Kupata Data za Gulio
                </h3>
                <p className="text-xs text-red-700 leading-relaxed">
                  {discoveryResult.explanationSwahili}
                </p>
              </div>
            </div>
          ) : discoveryResult.status === 'no_results' ? (
            <div className="p-8 text-center space-y-3 bg-stone-50 rounded-2xl border border-stone-200">
              <Package className="w-8 h-8 text-stone-400 mx-auto" />
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-xs font-bold text-stone-800">
                  Hakuna Bidhaa Zilizopatikana
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  {discoveryResult.explanationSwahili}
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearRefinements}
                  className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl text-xs font-semibold text-stone-700 transition-colors cursor-pointer"
                >
                  Onyesha Bidhaa za Msingi za {context.livestockType || 'Mifugo'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-stone-500 px-1">
                <span className="font-semibold text-stone-700">
                  {discoveryResult.products.length} bidhaa zilizopatikana
                </span>
                <span className="text-[11px]">Bei na upatikanaji vinathibitishwa dukani</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {discoveryResult.products.map((item) => (
                  <div
                    key={item.productId}
                    className="p-3.5 bg-white rounded-2xl border border-stone-200/90 hover:border-emerald-300 transition-all space-y-2.5 shadow-2xs flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      {/* Image & Title Header */}
                      <div className="flex items-start gap-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 rounded-xl object-cover border border-stone-100 bg-stone-50 shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
                            📦
                          </div>
                        )}

                        <div className="space-y-1 flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-stone-900 leading-snug line-clamp-2">
                            {item.title}
                          </h4>

                          {/* Price */}
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-extrabold text-emerald-700">
                              TSh {Number(item.price ?? 0).toLocaleString()}
                            </span>
                            {item.unit && (
                              <span className="text-[10px] text-stone-500">/ {item.unit}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stock & Verified Seller Badge */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                        {item.inStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Ipo Dukani ({item.quantityAvailable})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200 font-medium">
                            Imeisha kwa sasa
                          </span>
                        )}

                        {item.sellerVerified && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            Muuzaji Aliyehakikiwa
                          </span>
                        )}
                      </div>

                      {/* Seller & Location metadata */}
                      <div className="space-y-0.5 text-[11px] text-stone-600 pt-1 border-t border-stone-100">
                        <div className="flex items-center gap-1 truncate">
                          <Store className="w-3 h-3 text-stone-400 shrink-0" />
                          <span className="font-medium text-stone-800 truncate">
                            {item.sellerBusinessName || item.sellerName}
                          </span>
                        </div>
                        {(item.location || item.region) && (
                          <div className="flex items-center gap-1 text-stone-500 truncate">
                            <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                            <span className="truncate">
                              {item.region ? `${item.region}${item.district ? `, ${item.district}` : ''}` : item.location}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section 22: Safe discovery action (no auto-purchase / contact) */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectProduct) {
                            onSelectProduct(item.productId);
                          } else {
                            onClose();
                            navigate(`/marketplace?search=${encodeURIComponent(item.title)}`);
                          }
                        }}
                        className="w-full py-2 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
                      >
                        <span>Fungua Kwenye Gulio</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. Footer with Full Marketplace Navigation */}
        <div className="p-3.5 sm:p-4 border-t border-stone-100 bg-stone-50 flex items-center justify-between gap-3 text-xs flex-wrap">
          <span className="text-[11px] text-stone-500">
            Je, unahitaji kuangalia sokoni kote?
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-stone-600 hover:text-stone-900 font-semibold cursor-pointer"
            >
              Funga
            </button>

            <button
              id="marketplace-discovery-view-all-btn"
              type="button"
              onClick={handleOpenMarketplaceWithQuery}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs min-h-[38px]"
            >
              <span>Fungua Gulio Lote</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
