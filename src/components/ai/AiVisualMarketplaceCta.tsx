import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, ArrowRight, Image as ImageIcon, Film, HelpCircle, MessageCircle, Tag, MapPin, DollarSign, CheckCircle2 } from 'lucide-react';
import { VisualMarketplaceIntentResult, StructuredVisualMarketplaceQuery } from '../../types/visualMarketplace';

interface AiVisualMarketplaceCtaProps {
  visualIntent?: VisualMarketplaceIntentResult;
  structuredQuery?: StructuredVisualMarketplaceQuery;
  onNavigateToMarket?: (concept: string) => void;
  onClarify?: (text: string) => void;
}

export const AiVisualMarketplaceCta: React.FC<AiVisualMarketplaceCtaProps> = ({
  visualIntent,
  structuredQuery: propStructuredQuery,
  onNavigateToMarket,
  onClarify
}) => {
  const navigate = useNavigate();

  if (!visualIntent) {
    return null;
  }

  const structured = propStructuredQuery || visualIntent.structuredQuery || visualIntent.normalizedQuery?.structuredQuery;

  // Case A: Commercial Visual Product Intent Confirmed (V1.3A & V1.3B)
  if (visualIntent.detected && visualIntent.normalizedQuery && !visualIntent.isMedicalRestricted) {
    const { normalizedQuery } = visualIntent;
    const isVideo = normalizedQuery.source === 'video';
    const concept = structured?.productConcept || normalizedQuery.productConcept || 'Bidhaa ya Mifugo';
    const category = structured?.category || normalizedQuery.category;
    const subcategory = structured?.subcategory || normalizedQuery.subcategory;
    const region = structured?.region || normalizedQuery.region;
    const attributes = structured?.attributes || [];
    const pricePref = structured?.pricePreference;
    const stockPref = structured?.stockPreference;

    const handleClick = () => {
      if (onNavigateToMarket) {
        onNavigateToMarket(concept);
        return;
      }
      const params = new URLSearchParams();
      params.set('q', concept);
      if (category) {
        params.set('category', category);
      }
      if (subcategory) {
        params.set('subcategory', subcategory);
      }
      if (region) {
        params.set('region', region);
      }
      if (pricePref?.min !== null && pricePref?.min !== undefined) {
        params.set('minPrice', String(pricePref.min));
      }
      if (pricePref?.max !== null && pricePref?.max !== undefined) {
        params.set('maxPrice', String(pricePref.max));
      }
      if (stockPref === true) {
        params.set('inStock', 'true');
      }
      navigate(`/market?${params.toString()}`);
    };

    return (
      <div className="mt-3 p-3.5 sm:p-4 rounded-2xl border border-amber-200/80 bg-amber-50/50 text-stone-900 shadow-2xs">
        <div className="flex items-start justify-between gap-2 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              {isVideo ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-stone-900 leading-tight flex items-center gap-1.5">
                <span>Nia ya Bidhaa Sokoni</span>
                <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded-md">
                  {isVideo ? 'V1.3C Video' : 'V1.3B Picha'}
                </span>
              </h4>
              <p className="text-[11px] text-stone-600 leading-tight pt-0.5">
                AI imetambua vigezo vya kibiashara vinavyotokana na {isVideo ? 'uchambuzi wa video na operesheni yake' : 'picha na maelezo yako'}.
              </p>
            </div>
          </div>

          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-white border-amber-300 text-amber-800 shrink-0">
            {visualIntent.confidence === 'HIGH' ? 'Uhakika Mkubwa' : 'Uhakika wa Wastani'}
          </span>
        </div>

        {/* Recognized concept & taxonomy info */}
        <div className="py-1.5 text-xs text-stone-700 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-stone-800">Bidhaa:</span>
          <span className="px-2.5 py-0.5 bg-white border border-stone-200 rounded-md font-bold text-emerald-900">
            {concept}
          </span>
          {category && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-800 font-medium">
              <Tag className="w-3 h-3 text-emerald-600" />
              {category}{subcategory ? ` • ${subcategory}` : ''}
            </span>
          )}
          {region && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-stone-200 rounded-md text-[11px] text-stone-600">
              <MapPin className="w-3 h-3 text-stone-400" />
              Mkoa: {region}
            </span>
          )}
          {pricePref?.max !== null && pricePref?.max !== undefined && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-stone-200 rounded-md text-[11px] text-stone-600">
              <DollarSign className="w-3 h-3 text-stone-400" />
              Chini ya Tsh {pricePref.max.toLocaleString()}
            </span>
          )}
          {stockPref === true && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-emerald-200 rounded-md text-[11px] text-emerald-700">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Iliyopo dukani
            </span>
          )}
          {attributes.map((attr, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-md text-[10px] text-stone-700"
            >
              {attr.name}: {attr.value}
            </span>
          ))}
          {isVideo && structured?.videoUnderstanding?.temporalConfidence && (
            <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md text-[10px] text-blue-700 font-medium">
              Operesheni: {structured.videoUnderstanding.temporalConfidence === 'HIGH' ? 'Inaonekana bayana' : 'Wastani'}
            </span>
          )}
        </div>

        {/* Action CTA */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClick}
            className="px-3.5 py-2 rounded-xl font-bold text-xs bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[38px]"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Tafuta &quot;{concept}&quot; Sokoni</span>
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
          </button>

          <p className="text-[10px] text-stone-500 leading-tight text-center sm:text-right max-w-xs">
            Haitabuni bidhaa bali itafungua orodha halisi za Gulio la Ufugaji Update.
          </p>
        </div>
      </div>
    );
  }

  // Case B: Clarification Prompt for Uncertain Intent (V1.3A Section 13 & 20)
  if (visualIntent.clarificationPrompt && !visualIntent.isMedicalRestricted) {
    return (
      <div className="mt-3 p-3 rounded-2xl border border-stone-200 bg-stone-50 text-stone-900 shadow-2xs">
        <div className="flex items-center gap-2 pb-1.5">
          <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="text-xs font-semibold text-stone-800">
            {visualIntent.clarificationPrompt}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onClarify ? onClarify('Nieleze zaidi kuhusu kifaa hiki na namna kinavyofanya kazi.') : undefined}
            className="px-2.5 py-1 text-xs font-medium bg-white hover:bg-stone-100 border border-stone-300 rounded-lg text-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-3 h-3 text-stone-500" />
            <span>💬 Nieleze kuhusu hii</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (onClarify) {
                onClarify('Nataka kununua kifaa kama hiki, nitafutie kwenye Gulio.');
              } else {
                navigate('/market');
              }
            }}
            className="px-2.5 py-1 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-800 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Search className="w-3 h-3 text-emerald-600" />
            <span>🔎 Nitafutie bidhaa hii Gulioni</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};

