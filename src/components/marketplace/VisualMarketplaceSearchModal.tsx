import React, { useState, useRef } from 'react';
import { MarketplaceProduct } from '../../types/marketplace';
import {
  StructuredVisualMarketplaceQuery,
  VisualProductMatchResult
} from '../../types/visualMarketplace';
import { AiMarketplaceRecommendationResult } from '../../types/marketplaceRecommendation';
import { matchVisualProductToMarketplace } from '../../services/visualProductMatcher';
import { VisualProductRecommendationView } from './VisualProductRecommendationView';
import {
  Camera,
  Film,
  X,
  Sparkles,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Stethoscope
} from 'lucide-react';

interface VisualMarketplaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  allProducts: MarketplaceProduct[];
  onOpenProduct: (productId: string) => void;
  onOpenShop?: (shopId: string, catalogueId?: string | null) => void;
  onNavigateDaktari?: () => void;
}

export const VisualMarketplaceSearchModal: React.FC<VisualMarketplaceSearchModalProps> = ({
  isOpen,
  onClose,
  allProducts,
  onOpenProduct,
  onOpenShop,
  onNavigateDaktari
}) => {
  const [sourceType, setSourceType] = useState<'image' | 'video'>('image');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [userNote, setUserNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [matchResult, setMatchResult] = useState<VisualProductMatchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFileName(file.name);
    const isVid = file.type.startsWith('video/');
    setSourceType(isVid ? 'video' : 'image');

    const reader = new FileReader();
    reader.onload = () => {
      setMediaPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Reset previous search results
    setMatchResult(null);
    setSearchError(null);
  };

  const handleSelectSample = (sample: { name: string; concept: string; type: 'image' | 'video'; url: string }) => {
    setSourceType(sample.type);
    setMediaPreviewUrl(sample.url);
    setMediaFileName(sample.name);
    setUserNote(sample.concept);
    setMatchResult(null);
    setSearchError(null);
  };

  const handleStartSearch = async () => {
    if (!mediaPreviewUrl && !userNote.trim()) {
      setSearchError('Tafadhali chagua picha/video au andika maelezo ya kifaa unachotafuta.');
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    setLoadingStage(1);

    try {
      // 1. Send image to server-side visual analysis endpoint
      let serverAnalysis: any = null;
      try {
        const res = await fetch('/api/marketplace/visual-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaPreviewUrl,
            mediaFileName,
            userNote: userNote.trim(),
            userText: userNote.trim()
          })
        });
        if (res.ok) {
          serverAnalysis = await res.json();
        }
      } catch (networkErr) {
        console.warn('Network error calling /api/marketplace/visual-search, proceeding with fallback:', networkErr);
      }

      setLoadingStage(2);
      await new Promise((r) => setTimeout(r, 200));
      setLoadingStage(3);

      // 2. Build safe structured query from AI detection or user input
      const detectedConcept = serverAnalysis?.detectedConcept || userNote.trim() || (sourceType === 'video' ? 'Vifaa vya Ufugaji' : 'Kifaa cha Mifugo');
      const detectedCategory = serverAnalysis?.category || null;
      const detectedSubcategory = serverAnalysis?.subcategory || null;
      const detectedLivestock = serverAnalysis?.livestockUse || (detectedConcept.toLowerCase().includes('kuku') ? 'poultry' : null);

      const attributes: StructuredVisualMarketplaceQuery['attributes'] = [];
      if (Array.isArray(serverAnalysis?.attributes)) {
        for (const attr of serverAnalysis.attributes) {
          if (attr && typeof attr.name === 'string' && typeof attr.value === 'string') {
            attributes.push({
              name: attr.name,
              value: attr.value,
              confidence: (attr.confidence === 'HIGH' || attr.confidence === 'MEDIUM' || attr.confidence === 'LOW') ? attr.confidence : 'MEDIUM'
            });
          }
        }
      }

      if (Array.isArray(serverAnalysis?.keywords)) {
        for (const kw of serverAnalysis.keywords) {
          if (typeof kw === 'string' && kw.length >= 3) {
            attributes.push({
              name: 'keyword',
              value: kw,
              confidence: 'MEDIUM'
            });
          }
        }
      }

      const structuredQuery: StructuredVisualMarketplaceQuery = {
        source: sourceType,
        intentType: 'VISUAL_PRODUCT_SEARCH',
        productConcept: detectedConcept,
        category: detectedCategory,
        subcategory: detectedSubcategory,
        attributes,
        livestockUse: detectedLivestock,
        region: null,
        district: null,
        pricePreference: { min: null, max: null },
        stockPreference: null,
        visualConfidence: serverAnalysis?.confidence || 'HIGH'
      };

      setLoadingStage(4);

      // 3. Match against real Marketplace catalog
      const result = await matchVisualProductToMarketplace({
        source: sourceType,
        structuredQuery,
        allProducts,
        userText: userNote.trim() || detectedConcept,
        rawVisualDescription: serverAnalysis?.visualExplanation || undefined
      });

      setLoadingStage(5);
      await new Promise((r) => setTimeout(r, 150));
      setMatchResult(result);
    } catch (err: any) {
      console.error('Visual search failed:', err);
      const fallbackError = await matchVisualProductToMarketplace({
        source: sourceType,
        isMarketplaceFailure: true,
        userText: userNote
      });
      setMatchResult(fallbackError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSearch = () => {
    setMediaPreviewUrl(null);
    setMediaFileName(null);
    setUserNote('');
    setMatchResult(null);
    setSearchError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Build recommendation adapter for VisualProductRecommendationView
  const recommendationAdapter: AiMarketplaceRecommendationResult | null = matchResult
    ? {
        detected: true,
        intentType: 'VISUAL_PRODUCT_SEARCH',
        confidence: matchResult.confidence,
        targetType: 'product',
        queryKeywords: matchResult.structuredQuery.productConcept ? [matchResult.structuredQuery.productConcept] : [],
        queryCategory: matchResult.structuredQuery.category || undefined,
        queryLocation: matchResult.structuredQuery.region || undefined,
        status: matchResult.status === 'no_match' || matchResult.status === 'marketplace_error' ? 'no_results' : 'has_results',
        explanation: matchResult.headlineExplanation,
        products: matchResult.results,
        shops: [],
        visualMatchResult: matchResult
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div
        id="visual-marketplace-search-modal"
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-stone-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center space-x-1.5">
                <span>Tafuta Bidhaa kwa Picha au Video</span>
                <span className="text-[10.5px] bg-emerald-700/80 text-emerald-100 px-2 py-0.5 rounded-full font-semibold">
                  V1.3
                </span>
              </h3>
              <p className="text-xs text-stone-300">
                Linganisha picha/video yako na bidhaa halisi zilizopo Gulioni
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
            title="Funga"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* If results already exist, show VisualProductRecommendationView */}
          {recommendationAdapter && matchResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <span className="text-xs font-bold text-emerald-900">
                  Matokeo ya Ulinganifu wa Kuona (Gulio)
                </span>
                <button
                  onClick={handleResetSearch}
                  className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center space-x-1 bg-stone-100 px-2.5 py-1 rounded-lg hover:bg-stone-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Anza Upya / Weka Picha Nyingine</span>
                </button>
              </div>

              <VisualProductRecommendationView
                recommendations={recommendationAdapter}
                structuredQuery={matchResult.structuredQuery}
                liveProducts={allProducts}
                isLoading={isLoading}
                loadingStage={loadingStage}
                errorMessage={searchError}
                onOpenProduct={(prodId) => {
                  onOpenProduct(prodId);
                }}
                onOpenShop={onOpenShop}
                onNavigateDaktari={onNavigateDaktari}
              />
            </div>
          ) : (
            /* Upload / Input Section */
            <div className="space-y-4">
              {/* Media Upload Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                  mediaPreviewUrl
                    ? 'border-emerald-500 bg-emerald-50/20'
                    : 'border-stone-300 hover:border-emerald-500 bg-stone-50 hover:bg-emerald-50/10'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {mediaPreviewUrl ? (
                  <div className="space-y-2.5">
                    {sourceType === 'video' ? (
                      <video
                        src={mediaPreviewUrl}
                        controls
                        className="max-h-48 mx-auto rounded-xl shadow-xs border border-stone-200"
                      />
                    ) : (
                      <img
                        src={mediaPreviewUrl}
                        alt="Preview"
                        className="max-h-48 mx-auto rounded-xl object-contain shadow-xs border border-stone-200"
                      />
                    )}
                    <div className="flex items-center justify-center space-x-2 text-xs text-stone-700 font-medium">
                      <span>{mediaFileName || 'Faili imepakiwa'}</span>
                      <span className="text-emerald-700 font-bold">• Bonyeza kubadilisha</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-bold text-stone-900">
                        Pakia Picha au Video ya Kifaa
                      </h4>
                      <p className="text-xs text-stone-500">
                        PNG, JPG, MP4, au chukua picha kwa kamera ya simu
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Text Guidance */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-800">
                  Maelezo ya ziada (Hiari):
                </label>
                <input
                  type="text"
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  placeholder="Mf. 'Feeder ya kuku ya chuma', 'Drinker lita 5', 'Incubator mayai 120'..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              {/* Sample Visual Prompts for Quick Testing */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-bold text-stone-700 block">
                  Au jaribu sampuli hizi za haraka:
                </span>
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    {
                      name: 'Feeder ya Kuku',
                      concept: 'Feeder ya chuma ya kuku',
                      type: 'image' as const,
                      url: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=500'
                    },
                    {
                      name: 'Drinker ya Kuku',
                      concept: 'Chombo cha kunyweshea kuku maji',
                      type: 'image' as const,
                      url: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=500'
                    },
                    {
                      name: 'Incubator ya Mayai',
                      concept: 'Incubator ya kutotolesha mayai 120',
                      type: 'image' as const,
                      url: 'https://images.unsplash.com/photo-1598155523122-3842334d2c17?w=500'
                    }
                  ].map((sample) => (
                    <button
                      key={sample.name}
                      type="button"
                      onClick={() => handleSelectSample(sample)}
                      className="px-2.5 py-1.5 bg-stone-100 hover:bg-emerald-50 hover:border-emerald-300 border border-stone-200 rounded-xl font-medium text-stone-800 transition-colors"
                    >
                      {sample.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {searchError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{searchError}</span>
                </div>
              )}

              {/* Staged Loading State while searching (Section 27) */}
              {isLoading && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-900">
                    <Sparkles className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span>Inatafuta na kulinganisha bidhaa kwenye Gulio...</span>
                  </div>

                  <div className="space-y-1">
                    {[
                      { step: 1, label: 'Kusoma picha/video' },
                      { step: 2, label: 'Kutambua bidhaa na umbo' },
                      { step: 3, label: 'Kutafuta bidhaa Gulioni' },
                      { step: 4, label: 'Kulinganisha vifaa kwa vigezo vya kuona' },
                      { step: 5, label: 'Kuandaa mapendekezo' }
                    ].map((st) => (
                      <div
                        key={st.step}
                        className={`text-xs flex items-center space-x-2 ${
                          loadingStage >= st.step ? 'text-emerald-800 font-semibold' : 'text-stone-400'
                        }`}
                      >
                        <span className="w-4 text-center">{loadingStage >= st.step ? '✓' : '•'}</span>
                        <span>{st.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-stone-300 text-xs font-bold text-stone-700 hover:bg-stone-100 transition-colors"
                >
                  Ghairi
                </button>
                <button
                  type="button"
                  onClick={handleStartSearch}
                  disabled={isLoading || (!mediaPreviewUrl && !userNote.trim())}
                  className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isLoading ? 'Inatafuta...' : 'Linganisha na Gulio'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
