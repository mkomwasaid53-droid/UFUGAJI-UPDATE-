import React, { useState, useMemo } from 'react';
import {
  AiMarketplaceRecommendationResult,
  ProductRecommendationItem
} from '../../types/marketplaceRecommendation';
import {
  StructuredVisualMarketplaceQuery,
  VisualProductMatchResult,
  MatchedMarketplaceProductItem,
  VisualSourceType
} from '../../types/visualMarketplace';
import { MarketplaceProduct } from '../../types/marketplace';
import { VisualRecommendationCard } from './VisualRecommendationCard';
import { matchVisualProductToMarketplace } from '../../services/visualProductMatcher';
import { formatTshPrice } from '../../services/marketplaceService';
import { TANZANIA_REGIONS } from '../../data/marketplaceData';
import {
  Sparkles,
  Camera,
  Film,
  Filter,
  MapPin,
  DollarSign,
  Package,
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Stethoscope,
  ChevronRight,
  ExternalLink,
  Tag,
  Eye,
  SlidersHorizontal,
  X,
  Send,
  HelpCircle,
  Loader2,
  Check
} from 'lucide-react';

export interface VisualProductRecommendationViewProps {
  recommendations: AiMarketplaceRecommendationResult;
  structuredQuery?: StructuredVisualMarketplaceQuery | null;
  liveProducts?: MarketplaceProduct[];
  isLoading?: boolean;
  loadingStage?: 1 | 2 | 3 | 4 | 5;
  errorMessage?: string | null;
  onRetry?: () => void;
  onOpenProduct: (productId: string) => void;
  onOpenShop?: (shopId: string, catalogueId?: string | null) => void;
  onNavigateMarketplace?: () => void;
  onNavigateDaktari?: () => void;
  onUpdateQuery?: (updatedQuery: StructuredVisualMarketplaceQuery) => void;
}

export const VisualProductRecommendationView: React.FC<VisualProductRecommendationViewProps> = ({
  recommendations,
  structuredQuery: propStructuredQuery,
  liveProducts = [],
  isLoading = false,
  loadingStage = 5,
  errorMessage = null,
  onRetry,
  onOpenProduct,
  onOpenShop,
  onNavigateMarketplace,
  onNavigateDaktari,
  onUpdateQuery
}) => {
  // Base initial query from props or recommendation result
  const initialQuery = useMemo(() => {
    return (
      propStructuredQuery ||
      recommendations.visualMatchResult?.structuredQuery || {
        source: 'image' as VisualSourceType,
        intentType: 'VISUAL_PRODUCT_SEARCH' as const,
        productConcept: recommendations.queryKeywords.join(' ') || 'Vifaa vya Mifugo',
        category: recommendations.queryCategory || null,
        subcategory: null,
        attributes: [],
        livestockUse: null,
        region: recommendations.queryLocation || null,
        district: null,
        pricePreference: { min: null, max: null },
        stockPreference: null,
        visualConfidence: 'HIGH' as const
      }
    );
  }, [propStructuredQuery, recommendations]);

  // Local active refinement query (permits instant non-destructive multi-turn refinement without media reprocessing)
  const [activeQuery, setActiveQuery] = useState<StructuredVisualMarketplaceQuery>(initialQuery);
  const [naturalTextInput, setNaturalTextInput] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);

  // Local refined results (populated if user tweaks filters, otherwise uses recommendations)
  const [localMatchResult, setLocalMatchResult] = useState<VisualProductMatchResult | null>(
    recommendations.visualMatchResult || null
  );

  // Helper to re-run candidate retrieval and scoring through V1.3D without re-analyzing media (Section 9 & 10 & 31)
  const applyQueryRefinement = (updater: (prev: StructuredVisualMarketplaceQuery) => StructuredVisualMarketplaceQuery) => {
    setIsRecomputing(true);
    const updated = updater(activeQuery);
    setActiveQuery(updated);

    if (onUpdateQuery) {
      onUpdateQuery(updated);
    }

    // Run V1.3D deterministic matching against current live products
    matchVisualProductToMarketplace({
      source: updated.source,
      structuredQuery: updated,
      allProducts: liveProducts.length > 0 ? liveProducts : undefined,
      userText: updated.productConcept || undefined,
      farmerLocation: updated.region || undefined
    })
      .then((res) => {
        setLocalMatchResult(res);
      })
      .catch((err) => {
        console.error('Failed to recompute visual match:', err);
      })
      .finally(() => {
        setIsRecomputing(false);
      });
  };

  // Natural language follow-up handler (Section 10)
  const handleNaturalTextSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const txt = naturalTextInput.trim();
    if (!txt) return;

    applyQueryRefinement((prev) => {
      const lower = txt.toLowerCase();
      let newMaxPrice = prev.pricePreference.max;
      let newRegion = prev.region;
      let newStock = prev.stockPreference;
      let newLivestock = prev.livestockUse;
      let newConcept = prev.productConcept;

      // Price extraction
      const priceMatch = lower.match(/(?:chini\s+ya|hadi|pungufu\s+ya|isizidi|budget|bajeti)\s+(?:tsh\s*)?(\d+[\d,]*)/i);
      if (priceMatch) {
        newMaxPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
      }

      // Location extraction
      for (const reg of TANZANIA_REGIONS) {
        if (lower.includes(reg.toLowerCase())) {
          newRegion = reg;
          break;
        }
      }

      // Stock extraction
      if (lower.includes('stock') || lower.includes('iliyopo') || lower.includes('inayopatikana')) {
        newStock = true;
      }

      // Livestock extraction
      if (lower.includes('kuku')) newLivestock = 'poultry';
      else if (lower.includes("ng'ombe")) newLivestock = 'cattle';
      else if (lower.includes('mbuzi')) newLivestock = 'goats';
      else if (lower.includes('nguruwe')) newLivestock = 'pigs';
      else if (lower.includes('samaki')) newLivestock = 'fish';

      // Concept refinement if targeted item mentioned
      if (lower.includes('feeder') || lower.includes('kulishia')) {
        newConcept = 'Feeder ya Kuku';
      } else if (lower.includes('drinker') || lower.includes('kunyweshea')) {
        newConcept = 'Drinker ya Kuku';
      } else if (lower.includes('incubator') || lower.includes('kutotolea')) {
        newConcept = 'Incubator ya Mayai';
      }

      return {
        ...prev,
        productConcept: newConcept,
        region: newRegion,
        livestockUse: newLivestock,
        stockPreference: newStock,
        pricePreference: {
          ...prev.pricePreference,
          max: newMaxPrice
        }
      };
    });

    setNaturalTextInput('');
  };

  // Quick refinement preset triggers
  const handleQuickPreset = (preset: string) => {
    setNaturalTextInput(preset);
    setTimeout(() => {
      const lower = preset.toLowerCase();
      applyQueryRefinement((prev) => {
        if (lower.includes('200,000') || lower.includes('200000')) {
          return { ...prev, pricePreference: { ...prev.pricePreference, max: 200000 } };
        }
        if (lower.includes('kuku')) {
          return { ...prev, livestockUse: 'poultry' };
        }
        if (lower.includes('morogoro')) {
          return { ...prev, region: 'Morogoro' };
        }
        if (lower.includes('stock')) {
          return { ...prev, stockPreference: true };
        }
        return prev;
      });
    }, 50);
  };

  // Multiple-products ambiguity selection handler (Section 23)
  const handleSelectClarificationTarget = (selectedProductName: string) => {
    applyQueryRefinement((prev) => ({
      ...prev,
      productConcept: selectedProductName
    }));
  };

  // Current candidates to display
  const effectiveResult = localMatchResult || recommendations.visualMatchResult;
  const rawProducts: (ProductRecommendationItem | MatchedMarketplaceProductItem)[] =
    effectiveResult?.results && effectiveResult.results.length > 0
      ? effectiveResult.results
      : recommendations.products || [];

  // Filter out any strictly inactive or zero relevance products
  const candidates = rawProducts.slice(0, 5);
  const topCandidate = candidates[0] || null;
  const alternativeCandidates = candidates.slice(1);

  // Status computation
  const isVeterinaryRestricted =
    effectiveResult?.status === 'veterinary_restricted' ||
    recommendations.queryCategory === 'Dawa za Mifugo' ||
    recommendations.queryKeywords.some((k) => ['dawa', 'ugonjwa', 'kuharisha', 'homa'].includes(k.toLowerCase()));

  const isClarificationNeeded =
    effectiveResult?.status === 'clarification_needed' &&
    Boolean(effectiveResult.clarificationOptions && effectiveResult.clarificationOptions.length > 0);

  const isPoorQuality = effectiveResult?.status === 'poor_visual_evidence';
  const isSemanticOnly =
    effectiveResult?.status === 'semantic_only' ||
    (candidates.length > 0 && candidates.every((c) => c.isSemanticOnly));

  const isMarketplaceError = effectiveResult?.status === 'marketplace_error';

  const isNoMatch =
    !isVeterinaryRestricted &&
    !isClarificationNeeded &&
    !isMarketplaceError &&
    (effectiveResult?.status === 'no_match' || candidates.length === 0);

  // 1. RECOMMENDATION HEADER (Section 7)
  const source = activeQuery.source || 'image';
  const hasUserText = Boolean(activeQuery.productConcept && activeQuery.productConcept.length > 0);
  let headerTitle = 'Bidhaa zinazofanana na picha yako';
  if (source === 'video') {
    headerTitle = hasUserText
      ? 'Bidhaa zinazolingana na kifaa kwenye video na maelezo yako'
      : 'Bidhaa zinazofanana na kifaa kwenye video yako';
  } else {
    headerTitle = hasUserText
      ? 'Bidhaa zinazolingana na picha na maelezo yako'
      : 'Bidhaa zinazofanana na picha yako';
  }

  // 2. USER QUERY SUMMARY (Section 8 - Compact summary, only supplied facts)
  const summaryConcept = activeQuery.productConcept;
  const summaryLivestock = activeQuery.livestockUse;
  const summaryRegion = activeQuery.region;
  const summaryMaxPrice = activeQuery.pricePreference.max;
  const summaryStock = activeQuery.stockPreference;

  return (
    <div
      id="visual-product-recommendation-view"
      className="mt-3.5 space-y-3.5 bg-white/95 rounded-2xl border border-stone-200/90 p-3 sm:p-4 shadow-sm text-stone-900"
    >
      {/* SECTION 7 & 26: RECOMMENDATION HEADER & SOURCE INDICATOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-stone-100">
        <div className="flex items-start space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
            {source === 'video' ? <Film className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900 leading-snug">
              {headerTitle}
            </h3>
            {/* Source indicator (Section 26) */}
            <p className="text-xs text-stone-600 leading-tight pt-0.5">
              Utafutaji huu umetengenezwa kutoka kwenye{' '}
              <span className="font-semibold text-stone-800">
                {source === 'video' ? 'video yako' : 'picha yako'}
              </span>{' '}
              kwenye Gulio la Ufugaji.
            </p>
          </div>
        </div>

        {onNavigateMarketplace && (
          <button
            onClick={onNavigateMarketplace}
            className="self-start sm:self-center text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100/80 px-2.5 py-1.5 rounded-lg transition-colors flex items-center space-x-1 shrink-0"
            title="Tazama bidhaa zote kwenye Gulio Kuu"
          >
            <span>Gulio Lote</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* SECTION 27: STAGED LOADING STATE */}
      {isLoading && (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-900">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Inachakata Ulinganifu wa Kuona na Gulio...</span>
          </div>

          <div className="space-y-1.5">
            {[
              { step: 1, label: 'Kusoma picha/video' },
              { step: 2, label: 'Kutambua bidhaa na sifa zake' },
              { step: 3, label: 'Kutafuta bidhaa Gulioni' },
              { step: 4, label: 'Kulinganisha vifaa kwa vigezo vya kuona' },
              { step: 5, label: 'Kuandaa mapendekezo' }
            ].map((stageItem) => {
              const isPassed = loadingStage > stageItem.step;
              const isCurrent = loadingStage === stageItem.step;
              return (
                <div
                  key={stageItem.step}
                  className={`flex items-center space-x-2 text-xs px-2.5 py-1 rounded-md ${
                    isPassed
                      ? 'text-emerald-800 bg-emerald-50/80 font-medium'
                      : isCurrent
                      ? 'text-stone-900 bg-stone-200/70 font-bold'
                      : 'text-stone-400'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                      isPassed
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-stone-800 text-white animate-pulse'
                        : 'bg-stone-200 text-stone-500'
                    }`}
                  >
                    {isPassed ? <Check className="w-2.5 h-2.5" /> : stageItem.step}
                  </div>
                  <span>{stageItem.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 28: ERROR STATE & RETRY */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2 text-rose-950">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-bold">Hatukuweza kupata taarifa kutoka Gulio kwa sasa.</span>
              <p className="text-rose-900/90">{errorMessage}</p>
            </div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Jaribu Tena</span>
            </button>
          )}
        </div>
      )}

      {/* SECTION 8: USER QUERY SUMMARY (Only safely extracted facts) */}
      <div className="bg-stone-50/80 border border-stone-200/70 rounded-xl p-2.5 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center space-x-1 text-stone-600 font-semibold shrink-0">
          <Search className="w-3.5 h-3.5 text-stone-500" />
          <span>Vigezo vya Utafutaji:</span>
        </div>

        {summaryConcept && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-900 font-bold">
            Unatafuta: {summaryConcept}
          </span>
        )}

        {summaryLivestock && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-800 font-medium">
            Matumizi: {summaryLivestock}
          </span>
        )}

        {summaryRegion && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-800 font-medium">
            <MapPin className="w-3 h-3 mr-1 text-stone-500" />
            Eneo: {summaryRegion}
          </span>
        )}

        {summaryMaxPrice && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-800 font-medium">
            Bajeti: Hadi {formatTshPrice(summaryMaxPrice)}
          </span>
        )}

        {summaryStock && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
            Iliyopo Stock Tu
          </span>
        )}

        {/* Toggle Filter Panel */}
        <button
          onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
          className="ml-auto inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 transition-colors shadow-2xs"
          title="Fungua vichujio vya eneo, bajeti, na hali ya stock"
        >
          <SlidersHorizontal className="w-3 h-3 text-stone-500" />
          <span>{isFilterPanelOpen ? 'Funga Vichujio' : 'Chuja Matokeo'}</span>
        </button>
      </div>

      {/* SECTION 9 & 10: REFINEMENT & NATURAL LANGUAGE FOLLOW-UP */}
      {isFilterPanelOpen && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-3 transition-all">
          <div className="flex items-center justify-between text-xs font-bold text-stone-800 border-b border-stone-200/80 pb-1.5">
            <span className="flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-700" />
              <span>Chuja Mapendekezo Bila Kupakia Picha Tena (V1.3E)</span>
            </span>
            {isRecomputing && (
              <span className="text-[11px] text-emerald-700 flex items-center space-x-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Inasasisha...</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {/* Location Selector */}
            <div className="space-y-1">
              <label className="font-semibold text-stone-700 block text-[11px]">
                Eneo / Mkoa:
              </label>
              <select
                value={activeQuery.region || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  applyQueryRefinement((prev) => ({ ...prev, region: val }));
                }}
                className="w-full p-1.5 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-800 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Tanzania Nzima</option>
                {TANZANIA_REGIONS.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            {/* Budget Filter */}
            <div className="space-y-1">
              <label className="font-semibold text-stone-700 block text-[11px]">
                Kikomo cha Bajeti:
              </label>
              <select
                value={activeQuery.pricePreference.max || ''}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                  applyQueryRefinement((prev) => ({
                    ...prev,
                    pricePreference: { ...prev.pricePreference, max: val }
                  }));
                }}
                className="w-full p-1.5 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-800 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Bila Kikomo cha Bei</option>
                <option value="20000">Hadi Tsh 20,000</option>
                <option value="50000">Hadi Tsh 50,000</option>
                <option value="100000">Hadi Tsh 100,000</option>
                <option value="200000">Hadi Tsh 200,000</option>
                <option value="500000">Hadi Tsh 500,000</option>
                <option value="1000000">Hadi Tsh 1,000,000</option>
              </select>
            </div>

            {/* Stock Toggle */}
            <div className="space-y-1">
              <label className="font-semibold text-stone-700 block text-[11px]">
                Hali ya Stock:
              </label>
              <button
                type="button"
                onClick={() => {
                  applyQueryRefinement((prev) => ({
                    ...prev,
                    stockPreference: prev.stockPreference === true ? null : true
                  }));
                }}
                className={`w-full p-1.5 rounded-lg border text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 ${
                  activeQuery.stockPreference === true
                    ? 'bg-emerald-700 border-emerald-800 text-white'
                    : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>{activeQuery.stockPreference === true ? 'Iliyopo Stock Tu (Inatumika)' : 'Bidhaa Zote (Pia Zilizokwisha)'}</span>
              </button>
            </div>
          </div>

          {/* Quick Clear Filter Option */}
          {(activeQuery.region || activeQuery.pricePreference.max || activeQuery.stockPreference) && (
            <div className="pt-1 flex justify-end">
              <button
                onClick={() => {
                  applyQueryRefinement((prev) => ({
                    ...prev,
                    region: null,
                    pricePreference: { min: null, max: null },
                    stockPreference: null
                  }));
                }}
                className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 flex items-center space-x-1"
              >
                <X className="w-3 h-3" />
                <span>Ondoa vichujio vyote</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION 10: NATURAL LANGUAGE FOLLOW-UP REFINEMENT INPUT */}
      <div className="bg-stone-50/60 rounded-xl p-2.5 border border-stone-200/70 space-y-2">
        <form onSubmit={handleNaturalTextSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={naturalTextInput}
            onChange={(e) => setNaturalTextInput(e.target.value)}
            placeholder="Rekebisha kwa maneno... (mf. 'Chini ya Tsh 200,000', 'Iwe ya kuku', 'Nataka Morogoro')"
            className="flex-1 bg-white border border-stone-300 rounded-xl px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center space-x-1 shadow-2xs shrink-0"
          >
            <span>Rekebisha</span>
            <Send className="w-3 h-3" />
          </button>
        </form>

        {/* Quick prompt chips (Section 10) */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-stone-500 font-medium">Mapendekezo ya haraka:</span>
          {[
            'Chini ya Tsh 200,000',
            'Iwe ya kuku',
            'Nataka Morogoro',
            'Nataka iliyopo stock'
          ].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleQuickPreset(chip)}
              className="px-2 py-0.5 bg-white hover:bg-emerald-50 hover:border-emerald-300 border border-stone-200 rounded-md text-stone-700 font-medium transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 24 & 25: VETERINARY & DAKTARI SEPARATION BANNER */}
      {isVeterinaryRestricted && (
        <div
          id="visual-veterinary-safety-quarantine"
          className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2.5 text-stone-900 shadow-2xs"
        >
          <div className="flex items-start space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-950">
                Ulinzi wa Afya ya Mifugo: Hakuna Mauzo ya Dawa Moja kwa Moja
              </h4>
              <p className="text-xs text-amber-900 leading-relaxed">
                Picha au ombi hili linahusiana na dalili za kiafya, ugonjwa au mtaalamu wa mifugo (Daktari).
                Gulio haliuze dawa za mifugo kiholela kupitia utafutaji wa picha bila ushauri wa kitaalamu.
              </p>
            </div>
          </div>

          {onNavigateDaktari && (
            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">
                Wasiliana na mtaalamu wa mifugo aliyepo karibu nawe:
              </span>
              <button
                onClick={onNavigateDaktari}
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-2xs"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>Nenda kwa Daktari</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION 23: MULTIPLE PRODUCTS IN SOURCE CLARIFICATION */}
      {isClarificationNeeded && (
        <div
          id="visual-clarification-needed-box"
          className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 space-y-2.5 text-sky-950 shadow-2xs"
        >
          <div className="flex items-start space-x-2.5">
            <HelpCircle className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-bold text-sky-900">
                Picha inaonyesha vifaa zaidi ya kimoja
              </h4>
              <p className="text-xs text-sky-800 leading-relaxed">
                Tafadhali chagua kifaa kimoja unachotaka kukitafuta sokoni ili kupata ulinganifu sahihi:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {effectiveResult?.clarificationOptions?.map((opt) => (
              <button
                key={opt}
                onClick={() => handleSelectClarificationTarget(opt)}
                className="px-3 py-1.5 bg-white border border-sky-300 hover:bg-sky-100 hover:border-sky-400 rounded-xl text-xs font-bold text-sky-900 transition-colors shadow-2xs flex items-center space-x-1.5"
              >
                <span>Natafuta: {opt}</span>
                <ChevronRight className="w-3.5 h-3.5 text-sky-600" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 22: LOW QUALITY MEDIA NOTICE */}
      {isPoorQuality && !isVeterinaryRestricted && (
        <div
          id="visual-low-quality-notice"
          className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 flex items-start space-x-2.5 text-stone-800"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs leading-relaxed">
            <span className="font-bold text-amber-950">
              Picha/video haitoshi kufanya visual matching ya kuaminika.
            </span>
            <p className="text-stone-700">
              Mwangaza ni mdogo au picha ina ukungu. Hapa chini kuna bidhaa zinazohusiana kulingana na maelezo uliyotuma.
              Unaweza kutuma picha iliyo wazi zaidi au kueleza sifa zake kwa maneno.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 30: MARKETPLACE SYSTEM ERROR (V1.3F Section 27 & 30) */}
      {isMarketplaceError && (
        <div
          id="visual-marketplace-error-state"
          className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-bold text-stone-900">
              Hatukuweza kupata taarifa za Gulio kwa sasa.
            </h4>
            <p className="text-xs text-stone-600 leading-relaxed">
              Hitilafu ya kiufundi au mawasiliano ya Gulio. Tafadhali jaribu tena baada ya muda mfupi.
            </p>
          </div>

          <div className="flex justify-center gap-2 pt-1 text-xs">
            <button
              onClick={() => {
                if (onRetry) {
                  onRetry();
                } else {
                  applyQueryRefinement((prev) => ({ ...prev }));
                }
              }}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold transition-colors inline-flex items-center space-x-1.5 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Jaribu Tena</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 31: SEMANTIC ONLY NOTICE (V1.3F Section 16 & 31) */}
      {isSemanticOnly && !isVeterinaryRestricted && !isNoMatch && !isMarketplaceError && (
        <div
          id="visual-semantic-only-notice"
          className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-start space-x-2.5 text-stone-800"
        >
          <Tag className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs leading-relaxed">
            <span className="font-bold text-stone-900">
              Hakuna visual match ya kuaminika (bidhaa zote zilizopo hazina picha za kulinganisha).
            </span>
            <p className="text-stone-600">
              Bidhaa hizi zimeorodheshwa kulingana na maelezo ya tangazo pekee (semantic match), bila uthibitisho wa picha.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 21: TRUTHFUL NO-MATCH EXPERIENCE */}
      {isNoMatch && (
        <div
          id="visual-no-match-experience"
          className="bg-stone-50 border border-stone-200 rounded-2xl p-4 sm:p-5 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-stone-200/90 text-stone-600 flex items-center justify-center mx-auto">
            <Package className="w-5 h-5" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-bold text-stone-900">
              Hatukupata bidhaa inayofanana vya kutosha na picha/video yako.
            </h4>
            <p className="text-xs text-stone-600 leading-relaxed">
              Hakuna tangazo la sasa kwenye Gulio lenye ufanano wa kuaminika na kitu kinachoonekana.
              Unaweza kuboresha utafutaji kwa hatua zifuatazo salama:
            </p>
          </div>

          {/* Action alternatives (Section 21) */}
          <div className="flex flex-wrap justify-center gap-2 pt-1 text-xs">
            {activeQuery.pricePreference.max && (
              <button
                onClick={() => {
                  applyQueryRefinement((prev) => ({
                    ...prev,
                    pricePreference: { min: null, max: null }
                  }));
                }}
                className="px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-semibold text-stone-800 hover:bg-stone-100 shadow-2xs"
              >
                Ondoa kikomo cha bajeti
              </button>
            )}

            {activeQuery.region && (
              <button
                onClick={() => {
                  applyQueryRefinement((prev) => ({
                    ...prev,
                    region: null
                  }));
                }}
                className="px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-semibold text-stone-800 hover:bg-stone-100 shadow-2xs"
              >
                Tafuta nchi nzima (Ondoa mkoa)
              </button>
            )}

            <button
              onClick={() => {
                setIsFilterPanelOpen(true);
              }}
              className="px-3 py-1.5 bg-white border border-stone-300 rounded-xl font-semibold text-stone-800 hover:bg-stone-100 shadow-2xs"
            >
              Badilisha vigezo vya utafutaji
            </button>

            {onNavigateMarketplace && (
              <button
                onClick={onNavigateMarketplace}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-2xs"
              >
                Tazama bidhaa zote Gulioni
              </button>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4 & 13: PRIMARY RECOMMENDATION (Strongest candidate highlighted) */}
      {!isVeterinaryRestricted && !isClarificationNeeded && topCandidate && (
        <div id="visual-primary-recommendation-block" className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-bold text-stone-800">
            <span className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pendekezo la Kwanza Linalokaribiana Zaidi:</span>
            </span>
            <span className="text-[11px] font-semibold text-stone-500">
              Kiwango cha juu cha ufanano
            </span>
          </div>

          <VisualRecommendationCard
            item={topCandidate}
            isPrimary={true}
            userBudget={activeQuery.pricePreference.max}
            onOpenProduct={onOpenProduct}
            onOpenShop={onOpenShop}
          />
        </div>
      )}

      {/* SECTION 14: ADDITIONAL RECOMMENDATIONS */}
      {!isVeterinaryRestricted && !isClarificationNeeded && alternativeCandidates.length > 0 && (
        <div id="visual-additional-recommendations-block" className="space-y-2.5 pt-3 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-stone-800">
              Bidhaa nyingine zinazofanana kwenye Gulio ({alternativeCandidates.length}):
            </h4>
            <span className="text-[10.5px] text-stone-500">Mbadala wa karibu</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alternativeCandidates.map((item) => (
              <VisualRecommendationCard
                key={item.productId}
                item={item}
                isPrimary={false}
                userBudget={activeQuery.pricePreference.max}
                onOpenProduct={onOpenProduct}
                onOpenShop={onOpenShop}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
