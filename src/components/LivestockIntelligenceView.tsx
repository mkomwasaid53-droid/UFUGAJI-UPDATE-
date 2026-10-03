import React, { useState } from 'react';
import {
  LivestockIntelligenceSnapshot,
  LivestockRecord,
  LivestockEvent,
  IntelligenceObservation,
  LivestockTypeIntelligence
} from '../types';
import { LivestockTrendsView } from './LivestockTrendsView';
import { LivestockMovementView } from './LivestockMovementView';
import { LivestockHealthHistoryView } from './LivestockHealthHistoryView';
import { LivestockActivitySummaryView } from './LivestockActivitySummaryView';
import { LivestockObservationsView } from './LivestockObservationsView';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Activity,
  Syringe,
  Stethoscope,
  Plus,
  ArrowRight,
  Clock,
  Sparkles,
  BarChart3,
  ArrowUpDown,
  Store
} from 'lucide-react';
import { MyAssistantMarketplaceContext } from '../types/myAssistantMarketplace';

interface LivestockIntelligenceViewProps {
  snapshot: LivestockIntelligenceSnapshot;
  records: LivestockRecord[];
  recordEventsMap?: Record<string, LivestockEvent[]>;
  uid?: string;
  onOpenAddRecord?: () => void;
  onSwitchTab?: (tab: 'records' | 'history' | 'intelligence') => void;
  onOpenMarketplaceDiscovery?: (context: MyAssistantMarketplaceContext) => void;
}

export const LivestockIntelligenceView: React.FC<LivestockIntelligenceViewProps> = ({
  snapshot,
  records,
  recordEventsMap = {},
  uid = '',
  onOpenAddRecord,
  onSwitchTab,
  onOpenMarketplaceDiscovery
}) => {
  const [activeSection, setActiveSection] = useState<'observations' | 'summary' | 'health' | 'movement' | 'trends' | 'foundation'>('observations');
  const { dataCoverage, recentActivity, livestockByType, observations, emptyState } = snapshot;

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Bado';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Sufficiency styling & badge
  const renderSufficiencyBadge = () => {
    switch (dataCoverage.sufficiency) {
      case 'SUFFICIENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Data Inatosha (Sufficient)
          </span>
        );
      case 'LIMITED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Data Bado Ni Chache (Limited)
          </span>
        );
      case 'INSUFFICIENT':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-300">
            <Info className="w-3.5 h-3.5 text-stone-500" />
            Data Haikidhi (Insufficient)
          </span>
        );
    }
  };

  // Empty state handling
  if (emptyState.isEmpty || records.length === 0) {
    return (
      <div className="bg-white border border-stone-200/90 rounded-3xl p-8 text-center space-y-4 shadow-xs">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl border border-emerald-200/60 shadow-2xs">
          📊
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-base font-bold text-stone-900">
            Bado hakuna taarifa za kutosha kutengeneza insights za mifugo.
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            Takwimu na uchambuzi wa My Assistant unategemea kumbukumbu halisi za mifugo yako. Anza kwa kuongeza kundi la mifugo na kurekodi matukio ya shamba.
          </p>
        </div>
        {onOpenAddRecord && (
          <div className="pt-2">
            <button
              id="intelligence-empty-add-btn"
              type="button"
              onClick={onOpenAddRecord}
              className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Ongeza Mifugo Kwanza</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Sub-navigation between Observations (V1.4F), Summary (V1.4E), Health (V1.4D), Movement (V1.4C), Trends (V1.4B), and Foundation (V1.4A) */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl border border-stone-200/80 overflow-x-auto">
        <button
          type="button"
          id="intelligence-tab-observations"
          onClick={() => setActiveSection('observations')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[36px] ${
            activeSection === 'observations'
              ? 'bg-white text-emerald-950 shadow-2xs border border-stone-200/60'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Mambo Muhimu (V1.4F)</span>
        </button>
        <button
          type="button"
          id="intelligence-tab-summary"
          onClick={() => setActiveSection('summary')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[36px] ${
            activeSection === 'summary'
              ? 'bg-white text-emerald-950 shadow-2xs border border-stone-200/60'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-700" />
          <span>Muhtasari (V1.4E)</span>
        </button>
        <button
          type="button"
          id="intelligence-tab-health"
          onClick={() => setActiveSection('health')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[36px] ${
            activeSection === 'health'
              ? 'bg-white text-emerald-950 shadow-2xs border border-stone-200/60'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-700" />
          <span>Chanjo & Tiba (V1.4D)</span>
        </button>
        <button
          type="button"
          id="intelligence-tab-movement"
          onClick={() => setActiveSection('movement')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[36px] ${
            activeSection === 'movement'
              ? 'bg-white text-emerald-950 shadow-2xs border border-stone-200/60'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-emerald-700" />
          <span>Mabadiliko & Vifo (V1.4C)</span>
        </button>
        <button
          type="button"
          id="intelligence-tab-trends"
          onClick={() => setActiveSection('trends')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[36px] ${
            activeSection === 'trends'
              ? 'bg-white text-emerald-950 shadow-2xs border border-stone-200/60'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
          <span>Mwenendo (Trends V1.4B)</span>
        </button>
        <button
          type="button"
          id="intelligence-tab-foundation"
          onClick={() => setActiveSection('foundation')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[36px] ${
            activeSection === 'foundation'
              ? 'bg-white text-emerald-950 shadow-2xs border border-stone-200/60'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-emerald-700" />
          <span>Msingi (V1.4A)</span>
        </button>
      </div>

      {activeSection === 'observations' ? (
        <LivestockObservationsView
          uid={uid}
          records={records}
          recordEventsMap={recordEventsMap}
          onOpenAddRecord={onOpenAddRecord}
          onOpenMarketplaceDiscovery={onOpenMarketplaceDiscovery}
        />
      ) : activeSection === 'summary' ? (
        <LivestockActivitySummaryView
          uid={uid}
          records={records}
          recordEventsMap={recordEventsMap}
          onOpenAddRecord={onOpenAddRecord}
        />
      ) : activeSection === 'health' ? (
        <LivestockHealthHistoryView
          uid={uid}
          records={records}
          recordEventsMap={recordEventsMap}
          onOpenAddRecord={onOpenAddRecord}
        />
      ) : activeSection === 'movement' ? (
        <LivestockMovementView
          uid={uid}
          records={records}
          recordEventsMap={recordEventsMap}
          onOpenAddRecord={onOpenAddRecord}
        />
      ) : activeSection === 'trends' ? (
        <LivestockTrendsView
          uid={uid}
          records={records}
          recordEventsMap={recordEventsMap}
          onOpenAddRecord={onOpenAddRecord}
        />
      ) : (
        <div className="space-y-4">
          {/* 1. Header & Data Sufficiency Banner */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                    Msingi wa Intelligence ya Mifugo
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      V1.4A Foundation
                    </span>
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    Takwimu na mahesabu halisi ya shamba kulingana na rekodi zilizopo.
                  </p>
                </div>
              </div>
              {renderSufficiencyBadge()}
            </div>

            {/* Data Coverage Metrics Bar */}
            <div className="bg-stone-50/80 border border-stone-200/80 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <span className="text-[11px] text-stone-500 block">Kipindi cha Kumbukumbu</span>
                <strong className="text-stone-900 font-semibold block truncate">
                  {dataCoverage.firstEventDate ? `${formatDate(dataCoverage.firstEventDate)} – ${formatDate(dataCoverage.lastEventDate)}` : 'Hakuna matukio bado'}
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-stone-500 block">Siku za Shughuli</span>
                <strong className="text-stone-900 font-semibold block">
                  {dataCoverage.daysSpan} {dataCoverage.daysSpan === 1 ? 'siku' : 'siku'}
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-stone-500 block">Matukio Yote</span>
                <strong className="text-stone-900 font-semibold block">
                  {dataCoverage.eventCount} matukio
                </strong>
              </div>
              <div>
                <span className="text-[11px] text-stone-500 block">Makundi ya Mifugo</span>
                <strong className="text-stone-900 font-semibold block">
                  {dataCoverage.recordCount} makundi
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-stone-600 bg-emerald-50/50 border border-emerald-100 rounded-lg p-2 leading-relaxed">
              ℹ️ <strong>Mwongozo wa Uhakika:</strong> {dataCoverage.sufficiencyReason}
            </p>

            {onOpenMarketplaceDiscovery && snapshot.totalLivestock > 0 && (
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap text-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-emerald-700" />
                    Ugunduzi wa Gulio (V1.5D)
                  </span>
                  <p className="text-[11px] text-emerald-800">
                    Tazama bidhaa zilizopo sokoni kulingana na rekodi za mifugo yako.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const primary = livestockByType[0]?.livestockType || records[0]?.livestockType || 'Mifugo';
                    const primaryCat = livestockByType[0]?.livestockCategory || records[0]?.livestockCategory;
                    onOpenMarketplaceDiscovery({
                      livestockType: primary,
                      livestockCategory: primaryCat,
                      currentQuantity: snapshot.totalLivestock,
                      relevantIntelligenceType: 'FARM_OVERVIEW'
                    });
                  }}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                >
                  <span>Angalia Bidhaa za Gulio</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

      {/* 2. Ongezeko na Upungufu (Additions & Reductions) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-emerald-700" />
          Ongezeko na Upungufu (Additions & Reductions)
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Jumla ya Sasa */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
            <span className="text-[11px] text-emerald-800 font-medium block">Mifugo kwa Sasa</span>
            <p className="text-xl font-black text-emerald-950 pt-0.5">
              {(snapshot.totalLivestock ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-emerald-700">Kuanzia: {snapshot.totalStartingLivestock ?? 0}</span>
          </div>

          {/* Ongezeko */}
          <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-3">
            <span className="text-[11px] text-emerald-700 font-medium block flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Ongezeko
            </span>
            <p className="text-xl font-extrabold text-emerald-800 pt-0.5">
              +{Number(recentActivity.additions ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-stone-500">Vizazi na ununuzi</span>
          </div>

          {/* Upungufu */}
          <div className="bg-red-50/30 border border-red-100 rounded-xl p-3">
            <span className="text-[11px] text-red-700 font-medium block flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Upungufu
            </span>
            <p className="text-xl font-extrabold text-red-800 pt-0.5">
              -{Number(recentActivity.reductions ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-stone-500">Mauzo na vifo</span>
          </div>

          {/* Mabadiliko Halisi */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
            <span className="text-[11px] text-stone-600 font-medium block">Mabadiliko Halisi</span>
            <p className={`text-xl font-black pt-0.5 ${
              snapshot.totalNetChange > 0
                ? 'text-emerald-700'
                : snapshot.totalNetChange < 0
                ? 'text-red-700'
                : 'text-stone-700'
            }`}>
              {snapshot.totalNetChange > 0 ? `+${snapshot.totalNetChange}` : snapshot.totalNetChange}
            </p>
            <span className="text-[10px] text-stone-500">Net change</span>
          </div>
        </div>
      </div>

      {/* 3. Vifo na Upotevu (Mortality) — Non-medical factual intelligence */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-stone-700" />
            Vifo na Upotevu (Mortality Intelligence)
          </h3>
          <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
            Facts Only
          </span>
        </div>

        <div className="flex items-center gap-4 bg-stone-50 border border-stone-200/80 rounded-xl p-3.5">
          <div className="text-2xl font-black text-stone-900 min-w-[50px] text-center border-r border-stone-200 pr-3">
            {recentActivity.mortality}
          </div>
          <div className="space-y-0.5 text-xs text-stone-600 flex-1">
            <p className="font-semibold text-stone-800">
              {recentActivity.mortality === 0
                ? 'Hakuna vifo au upotevu uliorekodiwa katika historia ya mifugo yako.'
                : `Jumla ya vifo au upotevu ${recentActivity.mortality} vimeripotiwa kwenye matukio.`}
            </p>
            <p className="text-[11px] text-stone-500">
              Uchambuzi unahusu namba zilizorekodiwa pekee. Mfumo hautoi wala kubashiri utambuzi wa ugonjwa wowote.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Chanjo na Matibabu (Vaccination & Treatment) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <Stethoscope className="w-4 h-4 text-emerald-700" />
            Chanjo na Matibabu (Health Events)
          </h3>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            Recorded Activity
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Syringe className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-emerald-800 font-medium block">Chanjo Zilizorekodiwa</span>
              <strong className="text-base font-extrabold text-stone-900">
                {recentActivity.vaccinations} {recentActivity.vaccinations === 1 ? 'tukio' : 'matukio'}
              </strong>
              <p className="text-[10px] text-stone-500">Hakuna ratiba ya kiotomatiki inayotungwa hapa.</p>
            </div>
          </div>

          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-blue-800 font-medium block">Matibabu Yaliyorekodiwa</span>
              <strong className="text-base font-extrabold text-stone-900">
                {recentActivity.treatments} {recentActivity.treatments === 1 ? 'tukio' : 'matukio'}
              </strong>
              <p className="text-[10px] text-stone-500">Hakuna makisio ya ufanisi au maelekezo ya dawa.</p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Uchambuzi kwa Kila Aina ya Mfugo (Separated by Livestock Type) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-emerald-700" />
          Uchambuzi kwa Kila Aina ya Mfugo (Livestock-by-Type)
        </h3>

        <div className="divide-y divide-stone-100">
          {livestockByType.map((t, idx) => (
            <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-stone-900 block">{t.livestockType}</span>
                <span className="text-[11px] text-stone-500 block">
                  {t.livestockCategory} • {t.groupCount} {t.groupCount === 1 ? 'kundi' : 'makundi'} • {t.eventCount} matukio
                </span>
                <div className="flex items-center gap-2 text-[10px] text-stone-500 pt-0.5">
                  <span className="text-emerald-700">+{t.additions} ongezeko</span>
                  <span>•</span>
                  <span className="text-red-700">-{t.reductions} upungufu</span>
                  {t.mortality > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-800">{t.mortality} vifo</span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0 space-y-1">
                <span className="text-base font-black text-stone-900 block">
                  {Number(t.currentQuantity ?? 0).toLocaleString()}
                </span>
                <span className={`text-[10px] font-bold block ${
                  t.netChange > 0 ? 'text-emerald-700' : t.netChange < 0 ? 'text-red-700' : 'text-stone-500'
                }`}>
                  {t.netChange > 0 ? `+${t.netChange}` : t.netChange}
                </span>
                {onOpenMarketplaceDiscovery && (
                  <button
                    type="button"
                    onClick={() => onOpenMarketplaceDiscovery({
                      livestockType: t.livestockType,
                      livestockCategory: t.livestockCategory,
                      currentQuantity: t.currentQuantity,
                      relevantIntelligenceType: 'LIVESTOCK_COUNT'
                    })}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Store className="w-3 h-3 text-emerald-600" />
                    <span>Bidhaa za Gulio</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Mazingatio ya Kihesabu (Important Observations) */}
      {observations.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <Info className="w-4 h-4 text-emerald-700" />
            Mazingatio Muhimu (Deterministic Observations)
          </h3>

          <div className="space-y-2">
            {observations.map((obs) => {
              const borderClass =
                obs.severity === 'IMPORTANT'
                  ? 'border-red-200 bg-red-50/40 text-red-900'
                  : obs.severity === 'NOTICE'
                  ? 'border-amber-200 bg-amber-50/40 text-amber-900'
                  : 'border-stone-200 bg-stone-50/60 text-stone-800';

              const badgeClass =
                obs.severity === 'IMPORTANT'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : obs.severity === 'NOTICE'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-stone-200 text-stone-700 border-stone-300';

              return (
                <div key={obs.id} className={`p-3 rounded-xl border ${borderClass} space-y-1 text-xs`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{obs.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${badgeClass}`}>
                      {obs.severity}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{obs.message}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. Future V1.4 Modules Preview / Foundation Placeholders */}
      <div className="bg-stone-50/80 border border-stone-200/90 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Moduli Zinazokuja za V1.4 (Future Intelligence Modules)
          </h4>
          <span className="text-[10px] text-stone-500 font-medium">Foundation Ready</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-white border border-stone-200/80 rounded-xl p-3 space-y-1 opacity-80">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-800">Mwenendo wa Mifugo (Trends)</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                V1.4B
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Mchanganuo wa mwenendo wa idadi na misimu kulingana na historia ya kutosha.
            </p>
          </div>

          <div className="bg-white border border-stone-200/80 rounded-xl p-3 space-y-1 opacity-80">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-800">Uchambuzi wa Shamba (Insights)</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                V1.4C
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Uchambuzi wa kina wa ufanisi wa mifugo bila kubahatisha au kubuni taarifa.
            </p>
          </div>
        </div>
      </div>
    </div>
  )}
</div>
  );
};
