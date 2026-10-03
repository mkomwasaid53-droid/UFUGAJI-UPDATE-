import React, { useState, useMemo } from 'react';
import {
  LivestockRecord,
  LivestockEvent,
  TrendTimeWindow,
  ActivitySummarySnapshot,
  ActivityCanonicalCategory,
  DataSufficiencyLevel
} from '../types';
import {
  getActivitySummarySnapshot
} from '../services/livestockIntelligenceEngine';
import {
  Calendar,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Stethoscope,
  Clock,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  TrendingUp,
  BarChart3,
  ListFilter,
  HelpCircle,
  Plus
} from 'lucide-react';

interface LivestockActivitySummaryViewProps {
  uid: string;
  records: LivestockRecord[];
  recordEventsMap: Record<string, LivestockEvent[]>;
  onOpenAddRecord?: () => void;
  onOpenAddEvent?: (recordId: string) => void;
}

const TIME_WINDOWS: Array<{ key: TrendTimeWindow; label: string }> = [
  { key: '7d', label: 'Siku 7' },
  { key: '30d', label: 'Siku 30' },
  { key: '90d', label: 'Siku 90' },
  { key: '6m', label: 'Miezi 6' },
  { key: '12m', label: 'Mwaka 1' }
];

const CATEGORY_CHIPS: Array<{ key: ActivityCanonicalCategory | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Shughuli Zote' },
  { key: 'ADDITION', label: 'Ongezeko' },
  { key: 'PURCHASE', label: 'Manunuzi' },
  { key: 'BIRTH', label: 'Vizazi' },
  { key: 'REDUCTION', label: 'Punguzo' },
  { key: 'SALE', label: 'Mauzo' },
  { key: 'MORTALITY', label: 'Vifo' },
  { key: 'VACCINATION', label: 'Chanjo' },
  { key: 'TREATMENT', label: 'Matibabu' },
  { key: 'FEED', label: 'Chakula' },
  { key: 'OBSERVATION', label: 'Uchunguzi' }
];

export const LivestockActivitySummaryView: React.FC<LivestockActivitySummaryViewProps> = ({
  uid,
  records,
  recordEventsMap,
  onOpenAddRecord,
  onOpenAddEvent
}) => {
  const [timeWindow, setTimeWindow] = useState<TrendTimeWindow>('30d');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<ActivityCanonicalCategory | 'ALL'>('ALL');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Derive unique species from farm records
  const uniqueLivestockTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.livestockType) set.add(r.livestockType.trim());
      else if (r.livestockCategory) set.add(r.livestockCategory.trim());
    }
    return Array.from(set).sort();
  }, [records]);

  // Calculate deterministic V1.4E snapshot
  const snapshot: ActivitySummarySnapshot = useMemo(() => {
    return getActivitySummarySnapshot(uid, records, recordEventsMap, {
      timeWindow,
      livestockType: selectedTypeFilter !== 'ALL' ? selectedTypeFilter : undefined,
      categoryFilter: selectedCategoryFilter
    });
  }, [uid, records, recordEventsMap, timeWindow, selectedTypeFilter, selectedCategoryFilter]);

  // Helper for category badge styling
  const getCategoryBadge = (cat: ActivityCanonicalCategory) => {
    switch (cat) {
      case 'PURCHASE':
      case 'BIRTH':
      case 'ADDITION':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 inline mr-1" />
        };
      case 'SALE':
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: <ArrowDownRight className="w-3.5 h-3.5 text-blue-600 inline mr-1" />
        };
      case 'MORTALITY':
      case 'REDUCTION':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: <ArrowDownRight className="w-3.5 h-3.5 text-rose-600 inline mr-1" />
        };
      case 'VACCINATION':
        return {
          bg: 'bg-teal-50 text-teal-800 border-teal-200',
          icon: <ShieldCheck className="w-3.5 h-3.5 text-teal-600 inline mr-1" />
        };
      case 'TREATMENT':
        return {
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: <Stethoscope className="w-3.5 h-3.5 text-purple-600 inline mr-1" />
        };
      case 'FEED':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: <Activity className="w-3.5 h-3.5 text-amber-600 inline mr-1" />
        };
      case 'OBSERVATION':
      case 'OTHER':
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          icon: <Clock className="w-3.5 h-3.5 text-slate-500 inline mr-1" />
        };
    }
  };

  // Helper for Data Sufficiency Badge
  const getSufficiencyBadge = (level: DataSufficiencyLevel) => {
    switch (level) {
      case 'SUFFICIENT':
        return {
          text: 'Data Inatosheleza (Sufficient)',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        };
      case 'LIMITED':
        return {
          text: 'Data ya Wastani (Limited)',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: <AlertTriangle className="w-4 h-4 text-amber-600" />
        };
      case 'INSUFFICIENT':
      default:
        return {
          text: 'Data Haijatosheleza (Insufficient)',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
          icon: <Info className="w-4 h-4 text-slate-500" />
        };
    }
  };

  const sufficiency = getSufficiencyBadge(snapshot.dataSufficiency);

  // Maximum event count in any sub-period for bar chart scaling
  const maxPeriodEvents = useMemo(() => {
    let max = 0;
    for (const p of snapshot.timeGroupedBreakdown.periods) {
      if (p.totalEvents > max) max = p.totalEvents;
    }
    return Math.max(max, 1);
  }, [snapshot.timeGroupedBreakdown.periods]);

  return (
    <div id="livestock-activity-summary-container" className="space-y-6">
      {/* Header & Description */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                V1.4E Activity Engine
              </span>
              <span className="text-xs text-slate-500 font-medium">Ushahidi Halisi wa Shughuli</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">
              Muhtasari wa Shughuli & Matukio
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Fuatilia kwa urahisi kile kilichotokea shambani kwako: matukio ya ongezeko, punguzo, vifo, chanjo, na matibabu ndani ya kipindi ulichochagua.
            </p>
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-auto">
            <span className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${sufficiency.badgeClass}`}>
              {sufficiency.icon}
              <span>{sufficiency.text}</span>
            </span>
          </div>
        </div>

        {/* Time Window Selector */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto max-w-full pb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
              Kipindi:
            </span>
            {TIME_WINDOWS.map((win) => {
              const active = timeWindow === win.key;
              return (
                <button
                  key={win.key}
                  id={`btn-time-window-${win.key}`}
                  onClick={() => setTimeWindow(win.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {win.label}
                </button>
              );
            })}
          </div>

          {/* Livestock Type Filter */}
          <div className="flex items-center space-x-2 text-xs w-full md:w-auto">
            <span className="text-slate-500 font-medium whitespace-nowrap">Aina ya Mfugo:</span>
            <select
              id="select-livestock-type-filter"
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-auto"
            >
              <option value="ALL">Aina Zote ({records.length} makundi)</option>
              {uniqueLivestockTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium flex items-center pr-1">
            <Filter className="w-3 h-3 mr-1" /> Aina:
          </span>
          {CATEGORY_CHIPS.map((chip) => {
            const active = selectedCategoryFilter === chip.key;
            return (
              <button
                key={chip.key}
                id={`btn-category-chip-${chip.key}`}
                onClick={() => setSelectedCategoryFilter(chip.key)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 text-white font-medium shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Date Range info */}
        <div className="mt-3 flex items-center text-xs text-slate-500 space-x-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Kuanzia <span className="font-semibold text-slate-700">{snapshot.startDate}</span> hadi{' '}
            <span className="font-semibold text-slate-700">{snapshot.endDate}</span>
          </span>
          <span>•</span>
          <span>{snapshot.sufficiencyReason}</span>
        </div>
      </div>

      {/* Primary KPI Rollup Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Activities */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Jumla ya Matukio
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-slate-900">
              {snapshot.totalActivitiesCount}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {snapshot.totalActivitiesCount === 1
                ? 'Tukio 1 lililorekodiwa'
                : `Matukio ${snapshot.totalActivitiesCount} yaliyorekodiwa`}
            </p>
          </div>
        </div>

        {/* Additions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ongezeko la Mifugo
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-emerald-600">
                +{snapshot.rollup.additions.totalAnimals}
              </span>
              <span className="text-xs text-slate-500 font-medium">wanyama</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Matukio {snapshot.rollup.additions.totalEvents} (Manunuzi: {snapshot.rollup.additions.purchasesCount}, Vizazi: {snapshot.rollup.additions.birthsCount})
            </p>
          </div>
        </div>

        {/* Reductions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Punguzo la Mifugo
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-rose-600">
                -{snapshot.rollup.reductions.totalAnimals}
              </span>
              <span className="text-xs text-slate-500 font-medium">wanyama</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Matukio {snapshot.rollup.reductions.totalEvents} (Mauzo: {snapshot.rollup.reductions.salesCount}, Vifo: {snapshot.rollup.reductions.mortalityCount})
            </p>
          </div>
        </div>

        {/* Health & Care */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Huduma za Afya
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Stethoscope className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-indigo-600">
              {snapshot.rollup.health.totalEvents}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Chanjo: {snapshot.rollup.health.vaccinationEvents} | Matibabu: {snapshot.rollup.health.treatmentEvents}
            </p>
          </div>
        </div>
      </div>

      {/* Busiest Period & Latest Activity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Busiest Period */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Kipindi Chenye Shughuli Nyingi</span>
          </div>
          {snapshot.busiestPeriod ? (
            <div className="mt-3">
              <div className="text-base font-bold text-slate-900">
                {snapshot.busiestPeriod.label}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Kiliandikisha jumla ya{' '}
                <span className="font-bold text-emerald-700">
                  matukio {snapshot.busiestPeriod.eventCount}
                </span>
                .
              </p>
              {snapshot.busiestPeriod.dominantType && (
                <div className="mt-2 text-xs text-slate-500">
                  Aina kuu iliyoathirika: <span className="font-semibold text-slate-700">{snapshot.busiestPeriod.dominantType}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-3">
              Hakuna shughuli zilizorekodiwa katika kipindi hiki.
            </p>
          )}
        </div>

        {/* Quiet Period */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>Kipindi Chenye Shughuli Chache</span>
          </div>
          {snapshot.quietPeriod ? (
            <div className="mt-3">
              <div className="text-base font-bold text-slate-900">
                {snapshot.quietPeriod.label}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Kiliandikisha{' '}
                <span className="font-bold text-slate-700">
                  matukio {snapshot.quietPeriod.eventCount} tu
                </span>
                .
              </p>
              <p className="text-2xs text-slate-400 mt-1 italic">
                Kumbuka: Hii inamaanisha matukio machache yalirekodiwa kwenye mfumo, si kwamba shughuli hazikufanyika.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-3">
              Vipindi vyote vina kiwango kinachofanana cha matukio.
            </p>
          )}
        </div>

        {/* Latest Activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            <span>Shughuli ya Mwisho</span>
          </div>
          {snapshot.latestActivity ? (
            <div className="mt-3">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-2xs font-semibold border ${getCategoryBadge(snapshot.latestActivity.canonicalCategory).bg}`}>
                  {snapshot.latestActivity.categoryLabelSwahili}
                </span>
                <span className="text-xs text-slate-500">{snapshot.latestActivity.eventDate}</span>
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1.5">
                {snapshot.latestActivity.recordName}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {snapshot.latestActivity.livestockType}
                {snapshot.latestActivity.hasRecordedQuantity
                  ? ` • Wanyama: ${snapshot.latestActivity.quantity}`
                  : ''}
              </p>
              {snapshot.latestActivity.notes && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic">
                  "{snapshot.latestActivity.notes}"
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-3">
              Bado hakuna tukio lolote lililorekodiwa kwenye shamba hili.
            </p>
          )}
        </div>
      </div>

      {/* Activity Over Time (Historical Breakdown Chart) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Mchanganuo wa Matukio kwa Kipindi ({snapshot.timeGroupedBreakdown.groupingType === 'day' ? 'Kila Siku' : snapshot.timeGroupedBreakdown.groupingType === 'week' ? 'Kila Wiki' : 'Kila Mwezi'})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Idadi ya matukio yaliyorekodiwa kihistoria (Hakuna utabiri wa mbeleni)
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Vipindi {snapshot.timeGroupedBreakdown.periods.length}
          </span>
        </div>

        {snapshot.timeGroupedBreakdown.periods.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Hakuna data ya vipindi inayopatikana.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {snapshot.timeGroupedBreakdown.periods.map((period) => {
              const pct = (period.totalEvents / maxPeriodEvents) * 100;
              return (
                <div key={period.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{period.label}</span>
                    <span className="font-bold text-slate-900">
                      {period.totalEvents} {period.totalEvents === 1 ? 'tukio' : 'matukio'}
                    </span>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                    {period.totalEvents === 0 ? (
                      <div className="w-full bg-slate-100" />
                    ) : (
                      <div
                        className="bg-emerald-500 hover:bg-emerald-600 transition-all rounded-full"
                        style={{ width: `${Math.max(pct, 6)}%` }}
                        title={`${period.label}: matukio ${period.totalEvents}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Breakdown by Livestock Type */}
      {snapshot.byLivestockType.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Shughuli kwa Kila Aina ya Mfugo
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Idadi ya matukio yaliyorekodiwa kwa kila spishi ndani ya kipindi hiki
              </p>
            </div>
            <span className="text-xs text-slate-500">
              Spishi {snapshot.byLivestockType.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {snapshot.byLivestockType.map((item) => (
              <div
                key={item.livestockType}
                className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">
                      {item.livestockType}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-slate-700 border border-slate-200">
                      {item.totalEvents} {item.totalEvents === 1 ? 'tukio' : 'matukio'}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
                    <div>Ongezeko: <span className="font-semibold text-emerald-700">+{item.additionsCount}</span></div>
                    <div>Punguzo: <span className="font-semibold text-rose-700">-{item.reductionsCount}</span></div>
                    <div>Vifo: <span className="font-semibold text-rose-700">{item.mortalityCount}</span></div>
                    <div>Chanjo: <span className="font-semibold text-teal-700">{item.vaccinationCount}</span></div>
                    <div>Matibabu: <span className="font-semibold text-purple-700">{item.treatmentCount}</span></div>
                    <div>Nyingine: <span className="font-semibold text-slate-700">{item.otherCount}</span></div>
                  </div>
                </div>

                {item.latestEventDate && (
                  <div className="mt-3 pt-2 border-t border-slate-200/60 text-2xs text-slate-400">
                    Tukio la mwisho: {item.latestEventDate}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chronological Timeline (Newest First) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Orodha ya Shughuli Zilizorekodiwa (Timeline)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Matukio yote kuanzia ya hivi karibuni kabisa ({snapshot.timeline.length} yamekidhi vigezo)
            </p>
          </div>
        </div>

        {snapshot.timeline.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-700">
              Hakuna matukio yaliyorekodiwa katika kipindi hiki.
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Ukirekodi matukio kama ongezeko, chanjo, matibabu, au mauzo kwenye daftari lako, yataonekana hapa moja kwa moja.
            </p>
            {onOpenAddRecord && (
              <div className="pt-2">
                <button
                  id="btn-add-livestock-record-from-empty-activity"
                  onClick={onOpenAddRecord}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Sajili Kundi la Mifugo</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {snapshot.timeline.map((item) => {
              const badge = getCategoryBadge(item.canonicalCategory);
              const isExpanded = expandedItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="py-3.5 first:pt-0 last:pb-0 hover:bg-slate-50/50 rounded-lg px-2 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className="mt-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${badge.bg}`}>
                          {badge.icon}
                          {item.categoryLabelSwahili}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {item.title || item.categoryLabelSwahili}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Kundi: <span className="font-semibold text-slate-800">{item.recordName}</span>{' '}
                          ({item.livestockType})
                        </div>
                        {item.hasRecordedQuantity && (
                          <div className="text-xs font-medium text-slate-700 mt-0.5">
                            Idadi: {item.quantity} wanyama
                          </div>
                        )}
                        {item.notes && (
                          <p className="text-xs text-slate-500 mt-1 italic">
                            "{item.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right whitespace-nowrap">
                      <div className="text-xs font-semibold text-slate-700">
                        {item.eventDate}
                      </div>
                      {onOpenAddEvent && (
                        <button
                          onClick={() => onOpenAddEvent(item.recordId)}
                          className="mt-1 text-2xs text-emerald-600 hover:text-emerald-700 font-medium underline"
                        >
                          Fungua Kundi
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Safety and Integrity Notice Banner */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-600 flex items-start space-x-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">
            Kanuni ya Ukweli na Usalama wa Intelligence (V1.4E)
          </p>
          <p className="leading-relaxed">
            Muhtasari huu unatokana na matukio uliyoyarekodi kwenye daftari lako la mifugo. Mfumo hautoi utambuzi wa ugonjwa wala hautoi utabiri wa fedha au makadirio ya mwenendo wa mbeleni.
          </p>
        </div>
      </div>
    </div>
  );
};
