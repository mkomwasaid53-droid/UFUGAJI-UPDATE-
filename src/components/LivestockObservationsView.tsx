import React, { useState, useMemo } from 'react';
import {
  LivestockRecord,
  LivestockEvent,
  TrendTimeWindow,
  ImportantObservationsSnapshot,
  ObservationSeverity,
  ImportantObservation,
  FarmInsight,
  DataSufficiencyLevel
} from '../types';
import {
  getImportantObservationsSnapshot,
  getObservationSeverityWeight
} from '../services/livestockIntelligenceEngine';
import {
  Sparkles,
  AlertTriangle,
  Info,
  ShieldCheck,
  Calendar,
  Layers,
  TrendingUp,
  TrendingDown,
  Activity,
  Syringe,
  Filter,
  CheckCircle2,
  HelpCircle,
  Plus,
  ArrowRight,
  Clock,
  BarChart3,
  Lightbulb,
  Store
} from 'lucide-react';
import { MyAssistantMarketplaceContext } from '../types/myAssistantMarketplace';
import { isMedicalOrHealthIntelligence } from '../services/myAssistantMarketplaceAdapter';

interface LivestockObservationsViewProps {
  uid: string;
  records: LivestockRecord[];
  recordEventsMap: Record<string, LivestockEvent[]>;
  onOpenAddRecord?: () => void;
  onOpenAddEvent?: (recordId: string) => void;
  onOpenMarketplaceDiscovery?: (context: MyAssistantMarketplaceContext) => void;
}

const TIME_WINDOWS: Array<{ key: TrendTimeWindow; label: string }> = [
  { key: '7d', label: 'Siku 7' },
  { key: '30d', label: 'Siku 30' },
  { key: '90d', label: 'Siku 90' },
  { key: '6m', label: 'Miezi 6' },
  { key: '12m', label: 'Mwaka 1' }
];

export const LivestockObservationsView: React.FC<LivestockObservationsViewProps> = ({
  uid,
  records,
  recordEventsMap,
  onOpenAddRecord,
  onOpenAddEvent,
  onOpenMarketplaceDiscovery
}) => {
  const [timeWindow, setTimeWindow] = useState<TrendTimeWindow>('30d');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<ObservationSeverity | 'ALL'>('ALL');

  // Derive unique species from farm records
  const uniqueLivestockTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.livestockType) set.add(r.livestockType.trim());
      else if (r.livestockCategory) set.add(r.livestockCategory.trim());
    }
    return Array.from(set).sort();
  }, [records]);

  // Calculate deterministic V1.4F snapshot
  const snapshot: ImportantObservationsSnapshot = useMemo(() => {
    return getImportantObservationsSnapshot(uid, records, recordEventsMap, {
      timeWindow,
      livestockType: selectedTypeFilter !== 'ALL' ? selectedTypeFilter : undefined,
      minSeverity: severityFilter !== 'ALL' ? severityFilter : undefined,
      maxObservations: 10
    });
  }, [uid, records, recordEventsMap, timeWindow, selectedTypeFilter, severityFilter]);

  // Helper for severity styling & badge
  const getSeverityStyle = (severity: ObservationSeverity) => {
    switch (severity) {
      case 'IMPORTANT':
        return {
          badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
          border: 'border-rose-300 bg-rose-50/40',
          iconBg: 'bg-rose-100 text-rose-700',
          label: 'Muhimu (Important)',
          icon: AlertTriangle
        };
      case 'NOTICE':
        return {
          badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
          border: 'border-amber-300 bg-amber-50/40',
          iconBg: 'bg-amber-100 text-amber-700',
          label: 'Zingatia (Notice)',
          icon: Info
        };
      case 'INFO':
      default:
        return {
          badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
          border: 'border-stone-200 bg-white',
          iconBg: 'bg-sky-50 text-sky-700',
          label: 'Taarifa (Info)',
          icon: Lightbulb
        };
    }
  };

  const renderSufficiencyBadge = (sufficiency: DataSufficiencyLevel) => {
    switch (sufficiency) {
      case 'SUFFICIENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Data Inatosha
          </span>
        );
      case 'LIMITED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Data ya Wastani
          </span>
        );
      case 'INSUFFICIENT':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-300">
            <Info className="w-3.5 h-3.5 text-stone-500" />
            Data Haikutosha
          </span>
        );
    }
  };

  // If empty state
  if (snapshot.emptyState?.isEmpty && records.length === 0) {
    return (
      <div id="v14f-empty-state" className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-4 shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 mx-auto flex items-center justify-center">
          <Lightbulb className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-stone-900">Bado Hakuna Taarifa za Mifugo</h3>
          <p className="text-xs text-stone-600 leading-relaxed">
            {snapshot.emptyState.userGuidance}
          </p>
        </div>
        {onOpenAddRecord && (
          <button
            type="button"
            id="v14f-btn-add-record-empty"
            onClick={onOpenAddRecord}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Sajili Kundi la Mifugo</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div id="v14f-observations-root" className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Header & Filters Card */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                Mambo Muhimu & Maarifa ya Shamba
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  V1.4F Insights
                </span>
              </h2>
              <p className="text-xs text-stone-500">
                Uchambuzi wa mambo na mabadiliko yaliyobainika kihistoria kutokana na data yako
              </p>
            </div>
          </div>
          {renderSufficiencyBadge(snapshot.dataSufficiency)}
        </div>

        {/* Time Window Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {TIME_WINDOWS.map((tw) => (
            <button
              key={tw.key}
              type="button"
              id={`v14f-time-${tw.key}`}
              onClick={() => setTimeWindow(tw.key)}
              className={`py-1.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                timeWindow === tw.key
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80 hover:text-stone-900'
              }`}
            >
              {tw.label}
            </button>
          ))}
        </div>

        {/* Secondary Filter: Species & Severity Filter */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-stone-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-stone-500 font-medium">Aina ya Mifugo:</span>
            <select
              id="v14f-select-species"
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs text-stone-800 font-medium cursor-pointer"
            >
              <option value="ALL">Mifugo Yote</option>
              {uniqueLivestockTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-stone-500 font-medium">Kiwango cha Umuhimu:</span>
            <select
              id="v14f-select-severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs text-stone-800 font-medium cursor-pointer"
            >
              <option value="ALL">Zote (Info, Notice, Important)</option>
              <option value="NOTICE">Notice & Important Pekee</option>
              <option value="IMPORTANT">Important Pekee</option>
            </select>
          </div>
        </div>

        {/* Period summary banner */}
        <div className="flex items-center gap-2 text-xs text-stone-600 bg-stone-50 rounded-xl px-3 py-2 border border-stone-200/60">
          <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span>
            Kipindi: <strong>{snapshot.startDate}</strong> hadi <strong>{snapshot.endDate}</strong>
          </span>
          <span className="text-stone-300">|</span>
          <span>{snapshot.summarySwahili}</span>
        </div>
      </div>

      {/* 2. Synthesized Farm Insights Section (if available) */}
      {snapshot.insights.length > 0 && (
        <div id="v14f-farm-insights-section" className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Maarifa ya Shamba (Synthesized Farm Insights)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {snapshot.insights.map((insight) => (
              <div
                key={insight.id}
                id={`v14f-insight-${insight.id}`}
                className="bg-amber-50/50 border border-amber-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <h4 className="text-xs font-bold text-amber-950">{insight.title}</h4>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">{insight.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Prioritized Observations Section */}
      <div id="v14f-observations-section" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Mambo Muhimu Yaliyobainika ({snapshot.observations.length})
            </h3>
          </div>
          <span className="text-[11px] text-stone-500 font-medium">
            Jumla yaliyopo: {snapshot.allObservations.length}
          </span>
        </div>

        {snapshot.observations.length === 0 ? (
          <div
            id="v14f-no-observations"
            className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-2 shadow-2xs"
          >
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h4 className="text-xs font-bold text-stone-800">
              Hakuna Jambo Lisilo la Kawaida Lililojitokeza
            </h4>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Katika kipindi hiki ({snapshot.timeWindow}), hakuna mwenendo mkubwa wa ongezeko, upungufu,
              au vifo vilivyorekodiwa unaohitaji tahadhari maalum.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {snapshot.observations.map((obs) => {
              const style = getSeverityStyle(obs.severity);
              const IconComp = style.icon;
              const isMedical = obs.type === 'MORTALITY_PATTERN' || obs.type === 'VACCINATION_ACTIVITY' || obs.type === 'TREATMENT_ACTIVITY' || isMedicalOrHealthIntelligence('OBSERVATION_INSIGHT', obs.type, obs.title);

              return (
                <div
                  key={obs.id}
                  id={`v14f-card-${obs.id}`}
                  className={`border rounded-2xl p-4 shadow-2xs space-y-2.5 transition-all ${style.border}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-stone-900">{obs.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.badgeBg}`}>
                            {style.label}
                          </span>
                          {obs.targetType && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                              {obs.targetType}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">{obs.summary}</p>
                      </div>
                    </div>

                    {!isMedical && obs.targetType && onOpenMarketplaceDiscovery && (
                      <button
                        type="button"
                        onClick={() => onOpenMarketplaceDiscovery({
                          livestockType: obs.targetType,
                          relevantIntelligenceType: 'OBSERVATION_INSIGHT'
                        })}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        <Store className="w-3 h-3 text-emerald-600" />
                        <span className="hidden sm:inline">Bidhaa za</span> {obs.targetType}
                      </button>
                    )}
                  </div>

                  {/* Traceable Evidence Row */}
                  <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between flex-wrap gap-2 text-[11px] text-stone-500">
                    <div className="flex items-center gap-3 flex-wrap">
                      {obs.evidence.currentValue !== undefined && obs.evidence.previousValue !== undefined && (
                        <span>
                          Kiwango: <strong>{obs.evidence.previousValue}</strong> → <strong>{obs.evidence.currentValue}</strong>
                        </span>
                      )}
                      {obs.evidence.difference !== undefined && obs.evidence.difference !== null && (
                        <span>
                          Tofauti: <strong>{Number(obs.evidence.difference) > 0 ? `+${obs.evidence.difference}` : obs.evidence.difference}</strong>
                        </span>
                      )}
                      {obs.evidence.eventCount !== undefined && (
                        <span>
                          Matukio: <strong>{obs.evidence.eventCount}</strong>
                        </span>
                      )}
                      {obs.evidence.quantity !== undefined && (
                        <span>
                          Wanyama: <strong>{obs.evidence.quantity}</strong>
                        </span>
                      )}
                    </div>
                    {obs.period.comparisonStartDate && (
                      <span className="text-[10px] text-stone-400">
                        Ukilinganisha na: {obs.period.comparisonStartDate} - {obs.period.comparisonEndDate}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Safety & Transparency Guardrail Card */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 text-xs text-stone-600 space-y-1.5 shadow-2xs">
        <div className="flex items-center gap-1.5 font-bold text-stone-800">
          <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
          <span>Uwazi & Usalama wa Mambo Muhimu (Data Transparency)</span>
        </div>
        <p className="leading-relaxed text-stone-500 text-[11px]">
          Mambo haya yanatokana moja kwa moja na matukio na taarifa ulizowahi kurekodi shambani mwako.
          Hayaonyeshi utambuzi wa ugonjwa wa mifugo, hayatoi utabiri wa faida au hasara ya baadaye,
          na hayabuni matukio yasiyorekodiwa.
        </p>
      </div>
    </div>
  );
};
