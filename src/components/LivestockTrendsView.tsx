import React, { useState, useMemo } from 'react';
import {
  LivestockRecord,
  LivestockEvent,
  TrendTimeWindow,
  LivestockTrend,
  LivestockTrendPoint,
  DataSufficiencyLevel
} from '../types';
import {
  getLivestockTrendsSnapshot
} from '../services/livestockIntelligenceEngine';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Calendar,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Info,
  Activity,
  Plus,
  ArrowRight
} from 'lucide-react';

interface LivestockTrendsViewProps {
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

export const LivestockTrendsView: React.FC<LivestockTrendsViewProps> = ({
  uid,
  records,
  recordEventsMap,
  onOpenAddRecord
}) => {
  const [timeWindow, setTimeWindow] = useState<TrendTimeWindow>('30d');
  const [selectedScope, setSelectedScope] = useState<string>('overall');
  const [activeTooltipPoint, setActiveTooltipPoint] = useState<LivestockTrendPoint | null>(null);

  // Deterministic Trends Snapshot from V1.4B Engine
  const trendsSnapshot = useMemo(() => {
    return getLivestockTrendsSnapshot(uid, records, recordEventsMap, { timeWindow });
  }, [uid, records, recordEventsMap, timeWindow]);

  const { overallFarmTrend, typeTrends, emptyState } = trendsSnapshot;

  // Find active trend to plot in visualization
  const activeTrend: LivestockTrend | null = useMemo(() => {
    if (selectedScope === 'overall') {
      return overallFarmTrend;
    }
    return typeTrends.find((t) => t.livestockType === selectedScope) || overallFarmTrend;
  }, [selectedScope, overallFarmTrend, typeTrends]);

  // Format date helper
  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
        return d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Direction badge renderer
  const renderDirectionBadge = (direction: string, isLarge = false) => {
    switch (direction) {
      case 'INCREASING':
        return (
          <span
            className={`inline-flex items-center gap-1 font-bold rounded-lg border ${
              isLarge
                ? 'px-3 py-1 text-sm bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <TrendingUp className={isLarge ? 'w-4 h-4 text-emerald-600' : 'w-3 h-3 text-emerald-600'} />
            <span>↑ Increasing (Ongezeko)</span>
          </span>
        );
      case 'DECREASING':
        return (
          <span
            className={`inline-flex items-center gap-1 font-bold rounded-lg border ${
              isLarge
                ? 'px-3 py-1 text-sm bg-red-50 text-red-800 border-red-300'
                : 'px-2 py-0.5 text-[11px] bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <TrendingDown className={isLarge ? 'w-4 h-4 text-red-600' : 'w-3 h-3 text-red-600'} />
            <span>↓ Decreasing (Upungufu)</span>
          </span>
        );
      case 'STABLE':
        return (
          <span
            className={`inline-flex items-center gap-1 font-bold rounded-lg border ${
              isLarge
                ? 'px-3 py-1 text-sm bg-stone-100 text-stone-800 border-stone-300'
                : 'px-2 py-0.5 text-[11px] bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <Minus className={isLarge ? 'w-4 h-4 text-stone-600' : 'w-3 h-3 text-stone-600'} />
            <span>→ Stable (Thabiti)</span>
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span
            className={`inline-flex items-center gap-1 font-bold rounded-lg border ${
              isLarge
                ? 'px-3 py-1 text-sm bg-stone-100 text-stone-600 border-stone-300'
                : 'px-2 py-0.5 text-[11px] bg-stone-50 text-stone-600 border-stone-200'
            }`}
          >
            <HelpCircle className={isLarge ? 'w-4 h-4 text-stone-500' : 'w-3 h-3 text-stone-500'} />
            <span>? Unknown</span>
          </span>
        );
    }
  };

  // Sufficiency indicator badge
  const renderSufficiencyBadge = (sufficiency: DataSufficiencyLevel) => {
    switch (sufficiency) {
      case 'SUFFICIENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Data Inatosha
          </span>
        );
      case 'LIMITED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Historia Bado Ni Ndogo
          </span>
        );
      case 'INSUFFICIENT':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
            <Info className="w-3 h-3 text-stone-500" />
            Data Haikidhi
          </span>
        );
    }
  };

  // 1. Empty State Handling (Section 12)
  if (emptyState.isEmpty || records.length === 0 || !overallFarmTrend) {
    return (
      <div className="bg-white border border-stone-200 rounded-3xl p-8 text-center space-y-4 shadow-xs">
        <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl border border-emerald-200">
          📈
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="text-base font-bold text-stone-900">
            Mwenendo wa Mifugo (Livestock Trends)
          </h3>
          <p className="text-xs text-stone-600 leading-relaxed">
            Bado hujaweka taarifa za mifugo. Ukianza kurekodi mifugo yako, My Assistant itaweza kukuonyesha mwenendo wa mifugo yako.
          </p>
        </div>
        {onOpenAddRecord && (
          <div className="pt-2">
            <button
              id="trends-empty-add-btn"
              type="button"
              onClick={onOpenAddRecord}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Weka Rekodi ya Mifugo</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 2. Trend Points SVG Plot Calculation (Section 10 - purely real trend points, no forecast)
  const points = activeTrend?.trendPoints || [];
  const minCount = points.length > 0 ? Math.min(...points.map((p) => p.count)) : 0;
  const maxCount = points.length > 0 ? Math.max(...points.map((p) => p.count)) : 10;
  // Pad y-range slightly for aesthetic breathing room
  const yPadding = Math.max(1, Math.ceil((maxCount - minCount) * 0.15));
  const yMin = Math.max(0, minCount - yPadding);
  const yMax = maxCount + yPadding;
  const yRange = yMax - yMin || 1;

  const svgWidth = 560;
  const svgHeight = 160;
  const padLeft = 40;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 30;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const getPointCoords = (index: number, count: number) => {
    const x = points.length <= 1
      ? padLeft + plotWidth / 2
      : padLeft + (index / (points.length - 1)) * plotWidth;
    const yRatio = (count - yMin) / yRange;
    const y = padTop + plotHeight - yRatio * plotHeight;
    return { x, y };
  };

  // Build SVG path
  const pathD = points.length > 1
    ? points.map((p, i) => {
        const { x, y } = getPointCoords(i, p.count);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')
    : '';

  return (
    <div className="space-y-4">
      {/* SECTION HEADER & TIME WINDOW SELECTOR */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              Mwenendo wa Mifugo
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                V1.4B Trends
              </span>
            </h2>
            <p className="text-[11px] text-stone-500">
              Mabadiliko ya idadi ya mifugo kwa wakati kulingana na rekodi halisi zilizothibitishwa.
            </p>
          </div>

          <span className="text-xs text-stone-400 font-medium">
            {trendsSnapshot.startDate} – {trendsSnapshot.endDate}
          </span>
        </div>

        {/* TIME WINDOW BUTTONS */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {TIME_WINDOWS.map((win) => {
            const isActive = timeWindow === win.key;
            return (
              <button
                key={win.key}
                id={`btn-timewindow-${win.key}`}
                type="button"
                onClick={() => setTimeWindow(win.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[36px] ${
                  isActive
                    ? 'bg-emerald-900 text-white shadow-2xs border border-emerald-950 font-bold'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
                }`}
              >
                {win.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OVERALL FARM TREND CARD (Section 8) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4.5 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              🌾
            </div>
            <div>
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Overall Farm Trend (Mwenendo wa Shamba Zima)
              </h3>
              <p className="text-[11px] text-stone-500">
                Jumla ya mifugo yote iliyosajiliwa shambani
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {renderSufficiencyBadge(overallFarmTrend.dataSufficiency)}
            {renderDirectionBadge(overallFarmTrend.direction, true)}
          </div>
        </div>

        {/* Primary Trend Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Known Livestock Transition */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 font-medium block">
              Known Livestock (Idadi ya Mifugo)
            </span>
            <div className="flex items-center gap-2 text-stone-900 font-extrabold text-base">
              <span>{overallFarmTrend.startingKnownCount}</span>
              <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="text-emerald-900 text-lg font-black">{overallFarmTrend.endingKnownCount}</span>
            </div>
            <span className="text-[10px] text-stone-400 block">
              {formatDateLabel(overallFarmTrend.startDate)} → {formatDateLabel(overallFarmTrend.endDate)}
            </span>
          </div>

          {/* Net Change */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
            <span className="text-[11px] text-stone-500 font-medium block">
              Net Change (Mabadiliko Halisi)
            </span>
            <div className={`text-lg font-black ${
              overallFarmTrend.netChange > 0
                ? 'text-emerald-700'
                : overallFarmTrend.netChange < 0
                ? 'text-red-700'
                : 'text-stone-700'
            }`}>
              {overallFarmTrend.netChange > 0 ? `+${overallFarmTrend.netChange}` : overallFarmTrend.netChange}
            </div>
            <span className="text-[10px] text-stone-400 block">
              ndani ya {timeWindow}
            </span>
          </div>

          {/* Supporting Events Breakdown */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-stone-500 font-medium block">
              Supporting Events (Matukio)
            </span>
            <div className="text-xs text-stone-800 font-medium space-y-0.5">
              <div className="flex justify-between">
                <span className="text-emerald-800">+ Ongezeko:</span>
                <span className="font-bold">+{overallFarmTrend.supportingEvents.additions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-800">- Upungufu:</span>
                <span className="font-bold">-{overallFarmTrend.supportingEvents.reductions}</span>
              </div>
              {overallFarmTrend.supportingEvents.mortality > 0 && (
                <div className="flex justify-between text-[11px] text-stone-500">
                  <span>Vifo:</span>
                  <span>{overallFarmTrend.supportingEvents.mortality}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sufficiency Guidance Note */}
        {overallFarmTrend.dataSufficiency !== 'SUFFICIENT' && (
          <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block">Angalizo la Kipindi:</span>
              <p className="text-[11px] leading-relaxed text-amber-800">
                {overallFarmTrend.sufficiencyReason}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* TREND VISUALIZATION (Section 10 - SVG chart grounded only in real points) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Uchambuzi wa Mstari wa Mwenendo (Trend Line)
            </h3>
          </div>

          {/* Scope Selector: Farm Zima or Specific Type */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-stone-400 text-[11px] font-medium mr-1">Onyesha:</span>
            <button
              type="button"
              onClick={() => setSelectedScope('overall')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedScope === 'overall'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              Shamba Zima
            </button>
            {typeTrends.map((t) => (
              <button
                key={t.livestockType}
                type="button"
                onClick={() => setSelectedScope(t.livestockType)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedScope === t.livestockType
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                {t.livestockType}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Scope Label & Description */}
        <div className="flex items-center justify-between text-xs text-stone-500 px-1">
          <span>
            Kundi: <strong className="text-stone-900">{activeTrend?.livestockType}</strong> ({activeTrend?.direction})
          </span>
          <span className="text-[11px] text-stone-400">
            Pointi zote {points.length} zinatokana na matukio halisi pekee (Hakuna utabiri wa baadaye).
          </span>
        </div>

        {/* SVG Visualization Canvas */}
        <div className="relative w-full overflow-hidden bg-stone-50/60 rounded-xl border border-stone-200/80 p-2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-44 select-none"
          >
            {/* Grid lines */}
            <line
              x1={padLeft}
              y1={padTop}
              x2={padLeft + plotWidth}
              y2={padTop}
              stroke="#e7e5e4"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <line
              x1={padLeft}
              y1={padTop + plotHeight / 2}
              x2={padLeft + plotWidth}
              y2={padTop + plotHeight / 2}
              stroke="#e7e5e4"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <line
              x1={padLeft}
              y1={padTop + plotHeight}
              x2={padLeft + plotWidth}
              y2={padTop + plotHeight}
              stroke="#d6d3d1"
              strokeWidth="1.5"
            />

            {/* Y-axis Labels */}
            <text
              x={padLeft - 6}
              y={padTop + 4}
              fontSize="10"
              fill="#78716c"
              textAnchor="end"
              fontFamily="monospace"
            >
              {Math.round(yMax)}
            </text>
            <text
              x={padLeft - 6}
              y={padTop + plotHeight / 2 + 3}
              fontSize="10"
              fill="#78716c"
              textAnchor="end"
              fontFamily="monospace"
            >
              {Math.round((yMax + yMin) / 2)}
            </text>
            <text
              x={padLeft - 6}
              y={padTop + plotHeight + 3}
              fontSize="10"
              fill="#78716c"
              textAnchor="end"
              fontFamily="monospace"
            >
              {Math.round(yMin)}
            </text>

            {/* Trend Connecting Line */}
            {points.length > 1 && (
              <path
                d={pathD}
                fill="none"
                stroke="#047857"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Interactive Data Dots */}
            {points.map((pt, idx) => {
              const { x, y } = getPointCoords(idx, pt.count);
              const isHovered = activeTooltipPoint?.date === pt.date;
              return (
                <g
                  key={`${pt.date}-${idx}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveTooltipPoint(pt)}
                  onMouseLeave={() => setActiveTooltipPoint(null)}
                  onClick={() => setActiveTooltipPoint(pt)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 7 : 4.5}
                    fill={isHovered ? '#065f46' : '#10b981'}
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    className="transition-all duration-150"
                  />
                  {/* Point count label */}
                  <text
                    x={x}
                    y={y - 9}
                    fontSize="10"
                    fontWeight="bold"
                    fill="#1c1917"
                    textAnchor="middle"
                  >
                    {pt.count}
                  </text>

                  {/* X-axis date labels for key endpoints */}
                  {(idx === 0 || idx === points.length - 1 || points.length <= 5) && (
                    <text
                      x={x}
                      y={padTop + plotHeight + 16}
                      fontSize="9"
                      fill="#78716c"
                      textAnchor="middle"
                    >
                      {formatDateLabel(pt.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Tooltip Overlay */}
          {activeTooltipPoint && (
            <div className="absolute top-2 right-2 bg-stone-900/90 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg border border-stone-700 pointer-events-none space-y-0.5 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-2">
                <span className="text-stone-300 font-mono text-[10px]">
                  {activeTooltipPoint.date}
                </span>
                <span className="font-bold text-emerald-300">
                  {activeTooltipPoint.count} mifugo
                </span>
              </div>
              {activeTooltipPoint.summaryNotes && (
                <p className="text-[10px] text-stone-300">
                  {activeTooltipPoint.summaryNotes}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TRENDS BY LIVESTOCK TYPE (Section 7) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              By Livestock Type (Mwenendo Kwa Kila Aina)
            </h3>
          </div>
          <span className="text-xs text-stone-500 font-medium">
            {typeTrends.length} {typeTrends.length === 1 ? 'aina' : 'aina za mifugo'}
          </span>
        </div>

        {typeTrends.length === 0 ? (
          <p className="text-xs text-stone-500 py-2">
            Hakuna aina ya mifugo inayoweza kuonyeshwa mwenendo kwa sasa.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {typeTrends.map((t) => {
              const netStr = t.netChange > 0 ? `+${t.netChange}` : `${t.netChange}`;
              return (
                <div
                  key={t.livestockType}
                  className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-xs flex-wrap"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 text-sm">
                        {t.livestockType}
                      </span>
                      {t.livestockCategory && (
                        <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md font-medium">
                          {t.livestockCategory}
                        </span>
                      )}
                      {renderDirectionBadge(t.direction)}
                    </div>

                    <div className="text-[11px] text-stone-500 flex items-center gap-2">
                      <span>
                        Kuanzia: <strong>{t.startingKnownCount}</strong>
                      </span>
                      <span>→</span>
                      <span>
                        Sasa: <strong>{t.endingKnownCount}</strong>
                      </span>
                      <span>•</span>
                      <span className="text-stone-400">
                        {t.supportingEvents.totalEventsInWindow} matukio
                      </span>
                    </div>
                  </div>

                  {/* Net Change Pill */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-black text-sm px-2.5 py-1 rounded-xl border ${
                        t.netChange > 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : t.netChange < 0
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : 'bg-stone-50 text-stone-700 border-stone-200'
                      }`}
                    >
                      {netStr}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
