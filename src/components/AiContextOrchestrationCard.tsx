import React, { useState } from 'react';
import {
  Layers,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  XCircle,
  Database,
  Cpu,
  Eye,
  MessageSquare,
  ShoppingBag,
  AlertTriangle,
  Stethoscope,
  Lock,
  CheckCheck,
  AlertOctagon
} from 'lucide-react';
import {
  AIContextBundle,
  ContextSourceType,
  ContextProvenance
} from '../types/contextOrchestration';

interface AiContextOrchestrationCardProps {
  bundle?: AIContextBundle;
}

const SOURCE_LABELS: Record<ContextSourceType, { name: string; icon: React.ReactNode; color: string }> = {
  FARMER_PROFILE: {
    name: 'Wasifu wa Mkulima',
    icon: <Database className="w-3 h-3" />,
    color: 'text-indigo-700 bg-indigo-50 border-indigo-200'
  },
  FARMER_CONTEXT: {
    name: 'Muhtasari wa Shamba',
    icon: <Database className="w-3 h-3" />,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200'
  },
  LIVESTOCK_RECORDS: {
    name: 'Daftari la Mifugo',
    icon: <Database className="w-3 h-3" />,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200'
  },
  LIVESTOCK_HISTORY: {
    name: 'Matukio ya Kihistoria',
    icon: <Cpu className="w-3 h-3" />,
    color: 'text-teal-700 bg-teal-50 border-teal-200'
  },
  MY_ASSISTANT_INTELLIGENCE: {
    name: 'Uchambuzi wa Msaidizi',
    icon: <Cpu className="w-3 h-3" />,
    color: 'text-blue-700 bg-blue-50 border-blue-200'
  },
  MARKETPLACE: {
    name: 'Muktadha wa Sokoni',
    icon: <ShoppingBag className="w-3 h-3" />,
    color: 'text-amber-700 bg-amber-50 border-amber-200'
  },
  CONVERSATION: {
    name: 'Mazungumzo ya Sasa',
    icon: <MessageSquare className="w-3 h-3" />,
    color: 'text-slate-700 bg-slate-100 border-slate-200'
  },
  IMAGE: {
    name: 'Picha ya Mfugo',
    icon: <Eye className="w-3 h-3" />,
    color: 'text-purple-700 bg-purple-50 border-purple-200'
  },
  VIDEO: {
    name: 'Video ya Mfugo',
    icon: <Eye className="w-3 h-3" />,
    color: 'text-purple-700 bg-purple-50 border-purple-200'
  },
  DAKTARI: {
    name: 'Huduma ya Daktari',
    icon: <Stethoscope className="w-3 h-3" />,
    color: 'text-rose-700 bg-rose-50 border-rose-200'
  }
};

const PROVENANCE_LABELS: Record<ContextProvenance, { name: string; badge: string }> = {
  FACT_SOURCE: { name: 'Ukweli wa Daftari (Authoritative)', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  DERIVED_SOURCE: { name: 'Maarifa Yaliyokokotolewa (Derived)', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  MODULE_SOURCE: { name: 'Data Halisi za Moduli (Module Fact)', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  CONVERSATION_SOURCE: { name: 'Kauli ya Mazungumzo (Chat Context)', badge: 'bg-slate-100 text-slate-800 border-slate-200' },
  VISUAL_SOURCE: { name: 'Ushahidi wa Kuona (Visual Evidence)', badge: 'bg-purple-100 text-purple-800 border-purple-200' }
};

export const AiContextOrchestrationCard: React.FC<AiContextOrchestrationCardProps> = ({ bundle }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!bundle || !bundle.selectedSources || bundle.selectedSources.length === 0) {
    return null;
  }

  const { selectedSources, excludedSources, budget } = bundle;
  const isAuthoritative = selectedSources.includes('LIVESTOCK_RECORDS') || selectedSources.includes('LIVESTOCK_HISTORY');
  const usedTokens = budget?.usedTokens ?? (budget as any)?.totalEstimatedTokens ?? 0;
  const maxTokens = budget?.maxTokenBudget || 10000;
  const tokenPercent = Math.min(100, Math.round((usedTokens / Math.max(1, maxTokens)) * 100));

  // Extract active source metadata items safely
  const activeSourcesMetadata: Array<{
    sourceType: ContextSourceType;
    provenance: ContextProvenance;
    name: string;
    description?: string;
    estimatedTokens: number;
    itemCount?: number;
  }> = [];

  if (bundle.sources) {
    for (const src of selectedSources) {
      const meta = bundle.sources[src];
      if (meta) {
        activeSourcesMetadata.push({
          sourceType: src,
          provenance: meta.provenance,
          name: SOURCE_LABELS[src]?.name || src,
          description: meta.reason || meta.summaryText,
          estimatedTokens: meta.estimatedTokens || 0,
          itemCount: Array.isArray(meta.data) ? meta.data.length : undefined
        });
      }
    }
  } else if (Array.isArray((bundle as any).metadata)) {
    for (const m of (bundle as any).metadata) {
      activeSourcesMetadata.push({
        sourceType: m.sourceType || m.source,
        provenance: m.provenance,
        name: SOURCE_LABELS[m.sourceType as ContextSourceType]?.name || m.sourceType,
        description: m.description || m.reason,
        estimatedTokens: m.estimatedTokens || 0,
        itemCount: m.itemCount
      });
    }
  }

  const excludedItems = (excludedSources || []).map((ex: any) => {
    if (typeof ex === 'string') {
      const reason = bundle.observability?.selectionRationale?.[ex as ContextSourceType] ||
        (bundle.sources?.[ex as ContextSourceType]?.reason) ||
        'Haihitajiki kwa muktadha wa swali hili.';
      return { sourceType: ex as ContextSourceType, reasonSwahili: reason };
    }
    return ex;
  });

  const hasConflict = bundle.observability?.hasConflictWarning || Boolean((bundle as any).conflicts?.length);
  const conflictNotes = bundle.observability?.conflictNotes || ((bundle as any).conflicts ? (bundle as any).conflicts.map((c: any) => c.descriptionSwahili || c.note) : []);
  const daktariNote = bundle.daktariReadiness?.note || (bundle.daktariReadiness as any)?.notesSwahili || 'Hakuna utafutaji wa kiotomatiki wa daktari uliofanywa.';

  return (
    <div className="mt-2.5 pt-2 border-t border-slate-200/80 text-xs">
      {/* Compact Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 py-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Muktadha wa AI:</span>
          </div>

          {/* Active sources pills */}
          {selectedSources.map((source) => {
            const conf = SOURCE_LABELS[source] || { name: source, icon: null, color: 'text-slate-600 bg-slate-100 border-slate-200' };
            return (
              <span
                key={source}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${conf.color}`}
                title={conf.name}
              >
                {conf.icon}
                <span>{conf.name}</span>
              </span>
            );
          })}

          {/* Authority tag */}
          {isAuthoritative ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Daftari Rasmi</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
              <Info className="w-3 h-3 text-slate-400" />
              <span>Muktadha wa Kawaida</span>
            </span>
          )}

          {/* V1.5B Intelligent Loop Tag */}
          {bundle.myAssistantIntelligenceResult?.detected && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200" title="Msaidizi Wangu V1.5B (Ukweli Uliothibitishwa)">
              <Cpu className="w-3 h-3 text-blue-600" />
              <span>Msaidizi V1.5B</span>
            </span>
          )}

          {/* V1.5C Intelligent Loop Tag */}
          {bundle.marketplaceIntelligenceResult?.detected && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200" title="Gulio V1.5C (Ukweli wa Kibiashara Uliothibitishwa)">
              <ShoppingBag className="w-3 h-3 text-amber-600" />
              <span>Gulio V1.5C</span>
            </span>
          )}

          {/* V1.5G Daktari Loop Tag */}
          {bundle.daktariIntelligenceResult?.detected && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200" title="Daktari V1.5G (Ukweli wa Wasifu na Uthibitisho)">
              <Stethoscope className="w-3 h-3 text-rose-600" />
              <span>Daktari V1.5G</span>
            </span>
          )}

          {/* V1.5F Safety & Grounding Tag */}
          {bundle.safetyValidation && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                bundle.safetyValidation.violations.length === 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
              title="V1.5F Safety & Grounding Controls (Zero Hallucination)"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>V1.5F Usalama & Grounding</span>
            </span>
          )}
        </div>

        {/* Expand / Details toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 font-medium transition-colors py-0.5 px-1.5 rounded hover:bg-slate-100"
          aria-expanded={isOpen}
          title="Angalia vyanzo vya data na udhibiti wa muktadha"
        >
          <span>{isOpen ? 'Funga' : 'Vyanzo na Mipaka'}</span>
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expandable Transparency Drawer */}
      {isOpen && (
        <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 animate-in fade-in duration-150">
          {/* Token Budget Gauge */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-medium">Ukubwa wa Muktadha (Token Budget):</span>
              <span className="font-mono text-[10px] text-slate-700">
                ~{usedTokens} / {maxTokens} token ({tokenPercent}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  tokenPercent > 85 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${tokenPercent}%` }}
              />
            </div>
          </div>

          {/* V1.5B Authoritative Intelligence Preview */}
          {bundle.myAssistantIntelligenceResult?.detected && (
            <div className="p-2 bg-blue-50/80 border border-blue-200 rounded-lg text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  <span>Msaidizi Wangu V1.5B — Maarifa Rasmi Yaliyothibitishwa</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-100 text-blue-800 border border-blue-200">
                  {bundle.myAssistantIntelligenceResult.authorityLevel}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] text-slate-600 pt-0.5">
                <div className="bg-white/90 p-1 rounded border border-blue-100">
                  <span className="text-slate-400 block text-[9px]">Nia (Intent):</span>
                  <span className="font-medium text-slate-800">{bundle.myAssistantIntelligenceResult.intent}</span>
                </div>
                <div className="bg-white/90 p-1 rounded border border-blue-100">
                  <span className="text-slate-400 block text-[9px]">Muda:</span>
                  <span className="font-medium text-slate-800">{bundle.myAssistantIntelligenceResult.timePeriod.label}</span>
                </div>
                <div className="bg-white/90 p-1 rounded border border-blue-100">
                  <span className="text-slate-400 block text-[9px]">Spishi:</span>
                  <span className="font-medium text-slate-800">{bundle.myAssistantIntelligenceResult.speciesLabel || 'Mifugo yote'}</span>
                </div>
                <div className="bg-white/90 p-1 rounded border border-blue-100">
                  <span className="text-slate-400 block text-[9px]">Ujazo wa Data:</span>
                  <span className="font-medium text-blue-700">{bundle.myAssistantIntelligenceResult.dataSufficiency}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-700 bg-white/95 p-1.5 rounded border border-blue-100/80">
                <span className="font-semibold text-slate-800">Jibu Rasmi la Daftari: </span>
                <span>{bundle.myAssistantIntelligenceResult.deterministicAnswer}</span>
              </div>

              {bundle.myAssistantIntelligenceResult.safetyNotice && (
                <div className="text-[9px] text-amber-800 bg-amber-50 p-1 rounded border border-amber-200">
                  ⚠️ {bundle.myAssistantIntelligenceResult.safetyNotice}
                </div>
              )}
            </div>
          )}

          {/* V1.5C Authoritative Marketplace Preview */}
          {bundle.marketplaceIntelligenceResult?.detected && (
            <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                  <span>Gulio la Ufugaji Update V1.5C — Ukweli wa Kibiashara Uliothibitishwa</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-100 text-amber-800 border border-amber-200">
                  {bundle.marketplaceIntelligenceResult.authorityLevel}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] text-slate-600 pt-0.5">
                <div className="bg-white/90 p-1 rounded border border-amber-100">
                  <span className="text-slate-400 block text-[9px]">Nia (Intent):</span>
                  <span className="font-medium text-slate-800">{bundle.marketplaceIntelligenceResult.intent}</span>
                </div>
                <div className="bg-white/90 p-1 rounded border border-amber-100">
                  <span className="text-slate-400 block text-[9px]">Aina ya Ombi:</span>
                  <span className="font-medium text-slate-800">{bundle.marketplaceIntelligenceResult.targetType === 'shop' ? 'Duka' : 'Bidhaa'}</span>
                </div>
                <div className="bg-white/90 p-1 rounded border border-amber-100">
                  <span className="text-slate-400 block text-[9px]">Uthibitisho:</span>
                  <span className="font-medium text-slate-800">
                    {bundle.marketplaceIntelligenceResult.totalProductsMatched} bidhaa | {bundle.marketplaceIntelligenceResult.totalShopsMatched} maduka
                  </span>
                </div>
                <div className="bg-white/90 p-1 rounded border border-amber-100">
                  <span className="text-slate-400 block text-[9px]">Upatikanaji:</span>
                  <span className={`font-medium ${bundle.marketplaceIntelligenceResult.status === 'has_results' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {bundle.marketplaceIntelligenceResult.dataSufficiency}
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-700 bg-white/95 p-1.5 rounded border border-amber-100/80">
                <span className="font-semibold text-slate-800">Matokeo ya Gulio: </span>
                <span>{bundle.marketplaceIntelligenceResult.deterministicAnswer}</span>
              </div>

              {bundle.marketplaceIntelligenceResult.safetyNotice && (
                <div className="text-[9px] text-amber-800 bg-amber-50 p-1 rounded border border-amber-200">
                  ⚠️ {bundle.marketplaceIntelligenceResult.safetyNotice}
                </div>
              )}
            </div>
          )}

          {/* V1.5E Combined Context Reasoning Preview */}
          {bundle.combinedReasoning?.detected && (
            <div className="p-2 bg-indigo-50/80 border border-indigo-200 rounded-lg text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>V1.5E — Muungano wa Muktadha (Combined Context Reasoning)</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {bundle.combinedReasoning.authorityLevel}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px] text-slate-600 pt-0.5">
                <div className="bg-white/90 p-1.5 rounded border border-indigo-100">
                  <span className="text-slate-400 block text-[9px]">Aina ya Muungano:</span>
                  <span className="font-semibold text-slate-800">{bundle.combinedReasoning.intentLabelSwahili}</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">{bundle.combinedReasoning.reasoningGoal}</span>
                </div>
                <div className="bg-white/90 p-1.5 rounded border border-indigo-100">
                  <span className="text-slate-400 block text-[9px]">Vyanzo Vikuu Vilivyounganishwa:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {bundle.combinedReasoning.primarySources.map((s) => (
                      <span key={s} className="px-1 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[9px] font-medium border border-indigo-200">
                        {SOURCE_LABELS[s]?.name || s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {bundle.combinedReasoning.authoritativeAnchors && (
                <div className="space-y-1 bg-white/95 p-1.5 rounded border border-indigo-100/80 text-[10px]">
                  <span className="font-semibold text-slate-800 block text-[9px]">Ukweli wa Vyanzo (Authoritative Anchors):</span>
                  {bundle.combinedReasoning.authoritativeAnchors.farmFacts && (
                    <div className="text-slate-700">
                      <span className="text-emerald-700 font-medium">Shamba: </span>
                      {bundle.combinedReasoning.authoritativeAnchors.farmFacts.summary}
                    </div>
                  )}
                  {bundle.combinedReasoning.authoritativeAnchors.intelligenceFacts && (
                    <div className="text-slate-700">
                      <span className="text-blue-700 font-medium">Msaidizi: </span>
                      {bundle.combinedReasoning.authoritativeAnchors.intelligenceFacts.summary}
                    </div>
                  )}
                  {bundle.combinedReasoning.authoritativeAnchors.commercialFacts && (
                    <div className="text-slate-700">
                      <span className="text-amber-700 font-medium">Soko: </span>
                      {bundle.combinedReasoning.authoritativeAnchors.commercialFacts.summary}
                    </div>
                  )}
                  {bundle.combinedReasoning.authoritativeAnchors.visualEvidence && (
                    <div className="text-slate-700">
                      <span className="text-purple-700 font-medium">Mwonekano: </span>
                      {bundle.combinedReasoning.authoritativeAnchors.visualEvidence.summary}
                    </div>
                  )}
                </div>
              )}

              {bundle.combinedReasoning.medicalSafetyNotice && (
                <div className="text-[9px] text-rose-800 bg-rose-50 p-1 rounded border border-rose-200">
                  ⚠️ {bundle.combinedReasoning.medicalSafetyNotice}
                </div>
              )}
            </div>
          )}

          {/* V1.5G Daktari Mtaani Kwako Loop Preview */}
          {bundle.daktariIntelligenceResult?.detected && (
            <div className="p-2 bg-rose-50/70 border border-rose-200 rounded-lg text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-rose-950">
                  <Stethoscope className="w-3.5 h-3.5 text-rose-600" />
                  <span>V1.5G — Daktari Mtaani Kwako Loop Integration</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-rose-100 text-rose-800 border border-rose-200 font-semibold">
                  {bundle.daktariIntelligenceResult.status} ({bundle.daktariIntelligenceResult.totalMatched})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px] text-slate-600 pt-0.5">
                <div className="bg-white/90 p-1.5 rounded border border-rose-100">
                  <span className="text-slate-400 block text-[9px]">Lengo la Utambuzi:</span>
                  <span className="font-semibold text-slate-800">{bundle.daktariIntelligenceResult.intent}</span>
                  {bundle.daktariIntelligenceResult.query.livestockType && (
                    <span className="text-[9px] text-slate-500 block mt-0.5">
                      Mifugo: {bundle.daktariIntelligenceResult.query.livestockType}
                    </span>
                  )}
                </div>

                <div className="bg-white/90 p-1.5 rounded border border-rose-100">
                  <span className="text-slate-400 block text-[9px]">Faragha ya Mashauriano:</span>
                  <span className="font-semibold text-emerald-800 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    Data ya mashauriano hairekodiwi na AI
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">
                    Usajili siyo uthibitisho (Registration ≠ Verification)
                  </span>
                </div>
              </div>

              {bundle.daktariIntelligenceResult.topRecommendation && (
                <div className="bg-white/95 p-1.5 rounded border border-rose-100/80 text-[10px] space-y-0.5">
                  <span className="font-semibold text-slate-800 block text-[9px]">Mtaalamu Aliyependekezwa:</span>
                  <div className="text-slate-700 font-medium">
                    {bundle.daktariIntelligenceResult.topRecommendation.fullName} — {bundle.daktariIntelligenceResult.topRecommendation.professionalTitle} ({bundle.daktariIntelligenceResult.topRecommendation.region})
                  </div>
                </div>
              )}
            </div>
          )}

          {/* V1.5F Safety & Hallucination Controls Panel */}
          {bundle.safetyValidation && (
            <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded-lg text-[11px] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-950">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>V1.5F — Udhibiti wa Usalama na Grounding (Safety & Grounding Gate)</span>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border font-semibold ${
                    bundle.safetyValidation.violations.length === 0
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {bundle.safetyValidation.violations.length === 0 ? 'GROUNDED & SAFE' : 'SAFETY REWRITTEN'}
                </span>
              </div>

              {/* Status Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px]">
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[9px]">Uhalisia wa Data:</span>
                    <span className="font-semibold text-slate-800">
                      {bundle.safetyValidation.grounded ? 'Data Imefungwa (Fact-Locked)' : 'Marekebisho Yamefanyika'}
                    </span>
                  </div>
                </div>
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100 flex items-center gap-1.5">
                  <CheckCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[9px]">Matendo ya Nje:</span>
                    <span className="font-semibold text-slate-800">Hakuna Kujiendesha (Read-Only)</span>
                  </div>
                </div>
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100 flex items-center gap-1.5">
                  <AlertOctagon className="w-3 h-3 text-teal-600 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[9px]">Kiwango cha Hatari:</span>
                    <span className="font-semibold text-slate-800 font-mono">{bundle.safetyValidation.riskLevel}</span>
                  </div>
                </div>
              </div>

              {/* Anchors summary */}
              {bundle.safetyValidation.anchors && bundle.safetyValidation.anchors.length > 0 && (
                <div className="bg-white/95 p-1.5 rounded border border-emerald-100 text-[10px] space-y-1">
                  <span className="font-semibold text-slate-800 block text-[9px]">
                    Misingi ya Ukweli Yenye Mamlaka (Authoritative Grounding Anchors):
                  </span>
                  <div className="space-y-0.5">
                    {bundle.safetyValidation.anchors.map((anchor, idx) => (
                      <div key={idx} className="flex items-start gap-1 text-[9px] text-slate-700">
                        <span className="px-1 py-0.2 rounded bg-emerald-50 text-emerald-800 font-mono text-[8px] border border-emerald-200 shrink-0">
                          {anchor.authorityLevel.replace('LEVEL_', 'L')}
                        </span>
                        <span>
                          <strong className="text-slate-800">{anchor.sourceName}:</strong> {anchor.verifiedFact}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Violations Sanitized (if any) */}
              {bundle.safetyValidation.violations.length > 0 && (
                <div className="p-1.5 bg-amber-50 rounded border border-amber-200 text-[10px] space-y-1">
                  <div className="font-semibold text-amber-900 flex items-center gap-1 text-[9px]">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>Marekebisho ya Kiuhakika Yaliyolindwa (Sanitized for Safety):</span>
                  </div>
                  <div className="space-y-0.5">
                    {bundle.safetyValidation.violations.map((v, i) => (
                      <div key={i} className="text-[9px] text-amber-800 flex items-start gap-1">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>
                          <strong>{v.type}:</strong> {v.claim}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Sources Details */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Vyanzo Vilivyotumika (Active Sources):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {activeSourcesMetadata.map((meta) => {
                const prov = PROVENANCE_LABELS[meta.provenance] || { name: meta.provenance, badge: 'bg-slate-100 text-slate-700' };
                return (
                  <div
                    key={meta.sourceType}
                    className="p-1.5 bg-white border border-slate-200 rounded text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">
                        {meta.name}
                      </span>
                      <span className={`px-1 py-0.2 rounded text-[9px] font-mono border ${prov.badge}`}>
                        {prov.name}
                      </span>
                    </div>
                    {meta.description && (
                      <p className="text-[10px] text-slate-600 line-clamp-2">
                        {meta.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[9px] text-slate-500 pt-0.5">
                      <span>Vipengele: {meta.itemCount ?? 1}</span>
                      <span>~{meta.estimatedTokens} token</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Excluded Sources Details */}
          {excludedItems && excludedItems.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-200/70">
              <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>Vyanzo Vilivyoepukwa kwa Usalama na Ufanisi (Pruned):</span>
              </div>
              <div className="space-y-1">
                {excludedItems.map((ex) => (
                  <div
                    key={ex.sourceType}
                    className="flex items-center justify-between text-[10px] text-slate-600 bg-white/70 px-2 py-1 rounded border border-slate-200/60"
                  >
                    <span className="font-medium text-slate-700">
                      {SOURCE_LABELS[ex.sourceType]?.name || ex.sourceType}
                    </span>
                    <span className="text-[10px] text-slate-500 italic">
                      {ex.reasonSwahili}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflict Warnings if Any */}
          {hasConflict && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1 text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Mgongano wa Taarifa Uligunduliwa (Conflict Resolution):</span>
              </div>
              {conflictNotes.map((note: string, idx: number) => (
                <div key={idx} className="text-[10px] pl-4 border-l-2 border-amber-300">
                  <p>{note}</p>
                </div>
              ))}
            </div>
          )}

          {/* Daktari Readiness / Protection Safeguard */}
          <div className="flex items-center justify-between p-1.5 bg-blue-50/70 border border-blue-100 rounded text-[10px] text-blue-900">
            <div className="flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
              <span>
                <strong>Ulinzi wa Daktari:</strong> {daktariNote}
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-800">
              V1.5 Read-Only
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
