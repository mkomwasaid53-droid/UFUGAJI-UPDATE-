import React, { useState, useMemo } from 'react';
import {
  LivestockRecord,
  LivestockEvent,
  TrendTimeWindow,
  LivestockMovementSnapshot,
  DataSufficiencyLevel
} from '../types';
import {
  getLivestockMovementSnapshot
} from '../services/livestockIntelligenceEngine';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Skull,
  ShoppingCart,
  Baby,
  Activity,
  Calendar,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock,
  Plus,
  HelpCircle,
  Stethoscope
} from 'lucide-react';

interface LivestockMovementViewProps {
  uid: string;
  records: LivestockRecord[];
  recordEventsMap: Record<string, LivestockEvent[]>;
  onOpenAddRecord?: () => void;
}

const TIME_WINDOWS: Array<{ key: TrendTimeWindow; label: string }> = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: '6m', label: '6 Months' },
  { key: '12m', label: '12 Months' }
];

export const LivestockMovementView: React.FC<LivestockMovementViewProps> = ({
  uid,
  records,
  recordEventsMap,
  onOpenAddRecord
}) => {
  const [timeWindow, setTimeWindow] = useState<TrendTimeWindow>('30d');

  // Deterministic Movement & Mortality Snapshot from V1.4C Engine
  const snapshot: LivestockMovementSnapshot = useMemo(() => {
    return getLivestockMovementSnapshot(uid, records, recordEventsMap, { timeWindow });
  }, [uid, records, recordEventsMap, timeWindow]);

  const {
    startDate,
    endDate,
    previousPeriodStartDate,
    previousPeriodEndDate,
    additions,
    reductions,
    netMovement,
    typeMovements,
    mortality,
    observations,
    dataSufficiency,
    sufficiencyReason,
    emptyState
  } = snapshot;

  // Format date helper
  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
        return d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Sufficiency styling badge
  const renderSufficiencyBadge = (suff: DataSufficiencyLevel) => {
    switch (suff) {
      case 'SUFFICIENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Data Inatosha (Sufficient)
          </span>
        );
      case 'LIMITED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Data Bado Ni Chache (Limited)
          </span>
        );
      case 'INSUFFICIENT':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-300">
            <Info className="w-3 h-3 text-stone-500" />
            Data Haikidhi (Insufficient)
          </span>
        );
    }
  };

  // Mortality pattern badge
  const renderPatternBadge = () => {
    const pType = mortality.pattern.patternType;
    switch (pType) {
      case 'NO_MORTALITY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Hakuna Vifo (No Mortality)
          </span>
        );
      case 'INCREASED_MORTALITY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
            Vifo Vimeongezeka (Increased)
          </span>
        );
      case 'DECREASED_MORTALITY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300">
            <TrendingDown className="w-3.5 h-3.5 text-blue-600" />
            Vifo Vimepungua (Decreased)
          </span>
        );
      case 'REPEATED_MORTALITY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Matukio Yaliyojirudia (Repeated)
          </span>
        );
      case 'STABLE_MORTALITY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-800 border border-stone-300">
            <Minus className="w-3.5 h-3.5 text-stone-600" />
            Vifo Viko Sawa (Stable)
          </span>
        );
      case 'NO_DATA':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-700 border border-stone-300">
            <Info className="w-3.5 h-3.5 text-stone-500" />
            Bado Hakuna Data
          </span>
        );
    }
  };

  // Empty state handling
  if (emptyState.isEmpty || records.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-8 text-center space-y-4 shadow-xs">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl border border-emerald-200/60 shadow-2xs">
          📋
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-base font-bold text-stone-900">
            Bado hujaweka taarifa za mifugo
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            {emptyState.userGuidance || 'Anza kwa kusajili kundi la mifugo ili My Assistant ianze kufuatilia mabadiliko ya idadi, vizazi, mauzo, na vifo kwa uhakika.'}
          </p>
        </div>
        {onOpenAddRecord && (
          <div className="pt-2">
            <button
              id="movement-empty-add-btn"
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
      {/* 1. Header & Controls: Time Window Selector */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                Mabadiliko ya Mifugo & Mwenendo wa Vifo
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  V1.4C Movement
                </span>
              </h2>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Uchambuzi halisi wa walioongezeka, waliopungua, mauzo, na vifo vilivyorekodiwa.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {renderSufficiencyBadge(dataSufficiency)}
          </div>
        </div>

        {/* Time Window Buttons */}
        <div className="pt-1 border-t border-stone-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            <span className="text-xs text-stone-500 font-medium mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              Kipindi:
            </span>
            {TIME_WINDOWS.map((win) => (
              <button
                key={win.key}
                type="button"
                id={`movement-window-btn-${win.key}`}
                onClick={() => setTimeWindow(win.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[32px] ${
                  timeWindow === win.key
                    ? 'bg-emerald-700 text-white shadow-xs font-bold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80 hover:text-stone-900'
                }`}
              >
                {win.label}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-stone-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span>{formatDateLabel(startDate)} – {formatDateLabel(endDate)}</span>
          </div>
        </div>
      </div>

      {/* 2. Gross Additions, Gross Reductions & Net Movement Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Gross Additions */}
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Ongezeko la Jumla
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Gross Additions
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-950">+{additions.total}</span>
            <span className="text-xs text-stone-500">mifugo</span>
          </div>
          <div className="mt-2 pt-2 border-t border-stone-100 text-[11px] text-stone-600 space-y-0.5">
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3 text-stone-400" /> Manunuzi:</span>
              <span className="font-semibold text-stone-800">+{additions.purchases}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><Baby className="w-3 h-3 text-stone-400" /> Vizazi:</span>
              <span className="font-semibold text-stone-800">+{additions.births}</span>
            </div>
            {additions.otherAdditions > 0 && (
              <div className="flex justify-between">
                <span>Ongezeko Nyingine:</span>
                <span className="font-semibold text-stone-800">+{additions.otherAdditions}</span>
              </div>
            )}
            <div className="text-[10px] text-stone-400 pt-0.5">
              Matukio: {additions.eventCount}
            </div>
          </div>
        </div>

        {/* Gross Reductions */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
              Upungufu wa Jumla
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              Gross Reductions
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-950">-{reductions.total}</span>
            <span className="text-xs text-stone-500">mifugo</span>
          </div>
          <div className="mt-2 pt-2 border-t border-stone-100 text-[11px] text-stone-600 space-y-0.5">
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3 text-stone-400" /> Mauzo:</span>
              <span className="font-semibold text-stone-800">-{reductions.sales}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1"><Skull className="w-3 h-3 text-rose-500" /> Vifo Vilivyorekodiwa:</span>
              <span className="font-semibold text-rose-700">-{reductions.mortality}</span>
            </div>
            {reductions.otherReductions > 0 && (
              <div className="flex justify-between">
                <span>Upungufu Mwingine:</span>
                <span className="font-semibold text-stone-800">-{reductions.otherReductions}</span>
              </div>
            )}
            <div className="text-[10px] text-stone-400 pt-0.5">
              Matukio: {reductions.eventCount}
            </div>
          </div>
        </div>

        {/* Net Movement */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-stone-600" />
                Mabadiliko Halisi
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-stone-700 border border-stone-200">
                Net Movement
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-black ${
                  netMovement > 0
                    ? 'text-emerald-700'
                    : netMovement < 0
                    ? 'text-rose-700'
                    : 'text-stone-700'
                }`}
              >
                {netMovement >= 0 ? `+${netMovement}` : netMovement}
              </span>
              <span className="text-xs text-stone-500">mifugo</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-stone-200 text-[11px] text-stone-600">
            <span className="font-semibold">Mlinganyo:</span> Ongezeko ({additions.total}) − Upungufu ({reductions.total})
            <p className="text-[10px] text-stone-400 mt-1 italic">
              Vifo na mauzo ni sehemu ya upungufu wa jumla; havijapunguzwa mara mbili.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Mortality Intelligence Section */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Skull className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                Uchambuzi wa Vifo na Mienendo
              </h3>
              <p className="text-[11px] text-stone-500">
                Takwimu na ulinganisho wa vifo vilivyorekodiwa na mfugaji.
              </p>
            </div>
          </div>

          <div>{renderPatternBadge()}</div>
        </div>

        {/* Mortality Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Mortality Count & Rate */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-xl p-3.5 space-y-2">
            <div className="text-xs font-bold text-stone-800 flex items-center justify-between">
              <span>Jumla ya Vifo Katika Kipindi</span>
              <span className="text-sm font-black text-rose-700">{mortality.totalMortalityCount} vifo</span>
            </div>
            <p className="text-xs text-stone-600">
              Vilirekodiwa katika matukio <strong>{mortality.mortalityEventCount}</strong> ndani ya kipindi cha siku hiki.
            </p>

            <div className="pt-2 border-t border-stone-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-700">Kiwango cha Vifo (Rate):</span>
                {mortality.mortalityRate.hasValidDenominator && mortality.mortalityRate.ratePercent !== null ? (
                  <span className="font-bold text-stone-900 bg-white px-2 py-0.5 rounded border border-stone-200">
                    {mortality.mortalityRate.ratePercent}%
                  </span>
                ) : (
                  <span className="text-[11px] text-stone-500 italic">Hakina denominator</span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                {mortality.mortalityRate.explanationSwahili}
              </p>
            </div>
          </div>

          {/* Mortality Pattern & Comparative History */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-xl p-3.5 space-y-2">
            <div className="text-xs font-bold text-stone-800 flex items-center justify-between">
              <span>Ulinganisho na Kipindi cha Nyuma</span>
              <span className="text-[10px] text-stone-500">
                {formatDateLabel(previousPeriodStartDate)} - {formatDateLabel(previousPeriodEndDate)}
              </span>
            </div>
            <p className="text-xs text-stone-700 leading-relaxed">
              {mortality.pattern.summarySwahili}
            </p>
            {mortality.pattern.comparisonWithPreviousPeriod && (
              <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-200/70">
                Kipindi cha nyuma: <strong>{mortality.pattern.comparisonWithPreviousPeriod.previousPeriodMortality}</strong> vifo → Kipindi hiki: <strong>{mortality.pattern.comparisonWithPreviousPeriod.currentPeriodMortality}</strong> vifo
              </div>
            )}
            {mortality.pattern.clusterDescriptionSwahili && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                ⚠️ {mortality.pattern.clusterDescriptionSwahili}
              </div>
            )}
          </div>
        </div>

        {/* Sub-period Mortality Distribution */}
        {mortality.mortalityByPeriod.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-bold text-stone-800">
              <span>Mgawanyo wa Vifo kwa Muda (Time Intervals)</span>
              <span className="text-[10px] text-stone-400 font-normal">Vipindi vya {timeWindow}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {mortality.mortalityByPeriod.map((p, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    p.mortalityCount > 0
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                      : 'bg-stone-50 border-stone-200 text-stone-600'
                  }`}
                >
                  <div className="text-[11px] font-semibold truncate" title={p.periodLabel}>
                    {p.periodLabel}
                  </div>
                  <div className="text-base font-black mt-1">
                    {p.mortalityCount > 0 ? `${p.mortalityCount} vifo` : '0 vifo'}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    {p.eventCount} {p.eventCount === 1 ? 'tukio' : 'matukio'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mortality by Livestock Type */}
        {mortality.mortalityByType.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <div className="text-xs font-bold text-stone-800">
              Vifo Vilivyorekodiwa kwa Kila Aina ya Mfugo
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {mortality.mortalityByType.map((t, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-stone-900">{t.livestockType}</div>
                    <div className="text-[10px] text-stone-500">
                      {t.mortalityEventCount} {t.mortalityEventCount === 1 ? 'tukio' : 'matukio'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-black ${
                        t.mortalityCount > 0 ? 'text-rose-700' : 'text-stone-500'
                      }`}
                    >
                      {t.mortalityCount}
                    </span>
                    <div className="text-[10px] text-stone-400">vifo</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Type-Specific Livestock Movement Table */}
      {typeMovements.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-2.5">
            <Layers className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-stone-900">
              Mabadiliko kwa Kila Aina ya Mfugo
            </h3>
          </div>

          <div className="space-y-2">
            {typeMovements.map((tm) => {
              const tmNet = tm.netMovement >= 0 ? `+${tm.netMovement}` : `${tm.netMovement}`;
              return (
                <div
                  key={tm.livestockType}
                  className="bg-stone-50/60 border border-stone-200/80 rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-stone-900">{tm.livestockType}</span>
                      {tm.livestockCategory && (
                        <span className="text-[10px] text-stone-500 px-1.5 py-0.5 bg-white border border-stone-200 rounded">
                          {tm.livestockCategory}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-500">
                        {tm.startingKnownCount} → {tm.endingKnownCount}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          tm.netMovement > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : tm.netMovement < 0
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        Net: {tmNet}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="bg-white border border-stone-200/70 p-2 rounded-lg">
                      <div className="text-[10px] text-stone-400">Ongezeko (Gross)</div>
                      <div className="font-bold text-emerald-700">+{tm.additions.total}</div>
                      <div className="text-[9px] text-stone-400">
                        Manunuzi: {tm.purchasesCount}, Vizazi: {tm.birthsCount}
                      </div>
                    </div>

                    <div className="bg-white border border-stone-200/70 p-2 rounded-lg">
                      <div className="text-[10px] text-stone-400">Upungufu (Gross)</div>
                      <div className="font-bold text-rose-700">-{tm.reductions.total}</div>
                      <div className="text-[9px] text-stone-400">
                        Mauzo: {tm.salesCount}, Vifo: {tm.mortalityCount}
                      </div>
                    </div>

                    <div className="bg-white border border-stone-200/70 p-2 rounded-lg">
                      <div className="text-[10px] text-stone-400">Mauzo Pekee</div>
                      <div className="font-bold text-stone-800">{tm.salesCount}</div>
                      <div className="text-[9px] text-stone-400">waliouzwa</div>
                    </div>

                    <div className="bg-white border border-stone-200/70 p-2 rounded-lg">
                      <div className="text-[10px] text-stone-400">Vifo Pekee</div>
                      <div className="font-bold text-rose-800">{tm.mortalityCount}</div>
                      <div className="text-[9px] text-stone-400">vilivyorekodiwa</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Traceable Observations */}
      {observations.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
            <Info className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold text-stone-900">
              Taarifa Muhimu Zilizobainika (Observations)
            </h3>
          </div>

          <div className="space-y-2">
            {observations.map((obs) => (
              <div
                key={obs.id}
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  obs.severity === 'IMPORTANT'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                    : obs.severity === 'NOTICE'
                    ? 'bg-blue-50/70 border-blue-200 text-blue-950'
                    : 'bg-stone-50 border-stone-200 text-stone-800'
                }`}
              >
                <div className="mt-0.5">
                  {obs.severity === 'IMPORTANT' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-stone-500 shrink-0" />
                  )}
                </div>
                <div className="space-y-0.5 flex-1">
                  <div className="font-bold">{obs.title}</div>
                  <div className="text-[11px] leading-relaxed opacity-90">{obs.message}</div>
                  {obs.dataTrace && (
                    <div className="text-[10px] opacity-75 font-mono pt-0.5">
                      Chanzo cha data: {obs.dataTrace}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Strict Non-Diagnostic / AI Medical Guardrail Card */}
      <div className="bg-emerald-900/5 border border-emerald-900/10 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-stone-600">
        <Stethoscope className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-emerald-950">
            Mpaka wa Kitaalamu wa My Assistant:
          </span>
          <p className="text-[11px] text-stone-600 leading-relaxed">
            Takwimu na mienendo hii inatokana tu na kumbukumbu halisi za matukio unazorekodi. Mfumo huu <strong>haufanyi utambuzi wa magonjwa</strong> wala kubahatisha sababu za vifo. Kwa ushauri wa afya ya mifugo, tafadhali wasiliana na daktari wa mifugo au afisa ugani aliyesajiliwa.
          </p>
        </div>
      </div>
    </div>
  );
};
