import React, { useState, useMemo } from 'react';
import {
  LivestockRecord,
  LivestockEvent,
  TrendTimeWindow,
  HealthActivityHistorySnapshot,
  DataSufficiencyLevel
} from '../types';
import {
  getHealthActivityHistorySnapshot
} from '../services/livestockIntelligenceEngine';
import {
  ShieldCheck,
  Stethoscope,
  Calendar,
  AlertTriangle,
  Info,
  Clock,
  Plus,
  HelpCircle,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  Filter,
  CheckCircle2
} from 'lucide-react';

interface LivestockHealthHistoryViewProps {
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

export const LivestockHealthHistoryView: React.FC<LivestockHealthHistoryViewProps> = ({
  uid,
  records,
  recordEventsMap,
  onOpenAddRecord,
  onOpenAddEvent
}) => {
  const [timeWindow, setTimeWindow] = useState<TrendTimeWindow>('30d');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [timelineCategoryFilter, setTimelineCategoryFilter] = useState<'ALL' | 'VACCINATION' | 'TREATMENT'>('ALL');
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  // Deterministic Health Intelligence Snapshot from V1.4D Engine
  const snapshot: HealthActivityHistorySnapshot = useMemo(() => {
    return getHealthActivityHistorySnapshot(uid, records, recordEventsMap, {
      timeWindow,
      livestockType: selectedTypeFilter !== 'ALL' ? selectedTypeFilter : undefined
    });
  }, [uid, records, recordEventsMap, timeWindow, selectedTypeFilter]);

  const {
    startDate,
    endDate,
    vaccination,
    treatment,
    byLivestockType,
    timeline,
    dataSufficiency,
    sufficiencyReason,
    summarySwahili,
    observations,
    emptyState
  } = snapshot;

  const toggleEventExpand = (id: string) => {
    setExpandedEventIds((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const filteredTimeline = useMemo(() => {
    if (timelineCategoryFilter === 'ALL') return timeline;
    return timeline.filter((item) => item.type === timelineCategoryFilter);
  }, [timeline, timelineCategoryFilter]);

  // Distinct species present for filter dropdown
  const availableSpecies = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => set.add(r.livestockType));
    return Array.from(set);
  }, [records]);

  // Sufficiency indicator styles
  const sufficiencyStyles: Record<
    DataSufficiencyLevel,
    { badge: string; icon: React.ReactNode; text: string }
  > = {
    SUFFICIENT: {
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />,
      text: 'Data Inatosheleza (Sufficient)'
    },
    LIMITED: {
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
      text: 'Data Chache (Limited)'
    },
    INSUFFICIENT: {
      badge: 'bg-slate-100 text-slate-700 border-slate-300',
      icon: <Info className="w-3.5 h-3.5 text-slate-500" />,
      text: 'Bado Hakuna Data ya Kutosha'
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Window Controls */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                V1.4D Intelligence
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${sufficiencyStyles[dataSufficiency].badge}`}
              >
                {sufficiencyStyles[dataSufficiency].icon}
                {sufficiencyStyles[dataSufficiency].text}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              Historia ya Chanjo na Matibabu
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Uchambuzi wa ukweli kuhusu matukio ya chanjo na matibabu uliyowahi kurekodi kwenye shamba lako.
            </p>
          </div>

          {/* Time Window Switcher */}
          <div className="flex items-center flex-wrap gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
            {TIME_WINDOWS.map((win) => (
              <button
                key={win.key}
                type="button"
                onClick={() => setTimeWindow(win.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeWindow === win.key
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {win.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Scope Sub-bar & Filter */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              Kipindi: <strong className="text-slate-700">{startDate}</strong> hadi{' '}
              <strong className="text-slate-700">{endDate}</strong>
            </span>
          </div>

          {/* Optional Species Filter */}
          {availableSpecies.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="health-species-filter" className="text-slate-600">
                Aina ya Mfugo:
              </label>
              <select
                id="health-species-filter"
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">Mifugo Yote</option>
                {availableSpecies.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Summary Swahili Callout */}
      <div className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 bg-emerald-100/80 rounded-xl text-emerald-800 shrink-0 mt-0.5">
          <Activity className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-emerald-950">Muhtasari wa Kipindi</h4>
          <p className="text-sm text-emerald-900/90 mt-0.5">{summarySwahili}</p>
          <p className="text-xs text-emerald-700/80 mt-1">{sufficiencyReason}</p>
        </div>
      </div>

      {/* Empty State when no health events ever recorded */}
      {emptyState.isEmpty ? (
        <div className="bg-white rounded-2xl p-10 border border-dashed border-slate-300 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <Stethoscope className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900">Bado Hakuna Matukio ya Afya Yaliyorekodiwa</h3>
            <p className="text-sm text-slate-600 mt-1">
              Hujaweka kumbukumbu zozote za chanjo au matibabu kwenye makundi ya mifugo yako. Ukiweka tukio la chanjo au matibabu, historia kamili na takwimu zitahesabiwa kiotomatiki hapa.
            </p>
          </div>
          {onOpenAddRecord && (
            <button
              type="button"
              onClick={onOpenAddRecord}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Sajili au Angalia Rekodi za Mifugo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Main 2-Column Health Summary Cards: Vaccination & Treatment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Vaccination Summary Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Chanjo (Vaccination)</h3>
                      <p className="text-xs text-slate-500">Matukio ya kukinga magonjwa</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs">
                    {timeWindow}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 py-5 border-b border-slate-100">
                  {/* Event count */}
                  <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-100">
                    <div className="text-xs text-slate-500 font-medium">Matukio Yaliyorekodiwa</div>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {vaccination.totalEventsCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">matukio (events)</div>
                  </div>

                  {/* Animals count by species */}
                  <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-100">
                    <div className="text-xs text-slate-500 font-medium">Wanyama Waliochanjwa</div>
                    {vaccination.hasAnyRecordedQuantity ? (
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(vaccination.totalAnimalsVaccinatedByType).map(([sp, cnt]) => (
                          <div key={sp} className="text-xs font-semibold text-slate-800">
                            {sp}: <span className="font-bold text-blue-700">{cnt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic mt-2">
                        Idadi haikutajwa kwenye matukio haya
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Latest Recorded Vaccination */}
              <div className="pt-4 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium mb-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Chanjo ya Mwisho Iliyorekodiwa:
                </div>
                {vaccination.latestEvent ? (
                  <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100/60 text-slate-800">
                    <div className="font-semibold flex items-center justify-between">
                      <span>{vaccination.latestEvent.recordName} ({vaccination.latestEvent.livestockType})</span>
                      <span className="text-blue-700 font-mono text-[11px]">
                        {vaccination.latestEvent.eventDate}
                      </span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      {vaccination.latestEvent.recordedVaccineName ? (
                        <span>Chanjo: <strong>{vaccination.latestEvent.recordedVaccineName}</strong></span>
                      ) : (
                        <span className="text-slate-400 italic">Jina la chanjo halikurekodiwa</span>
                      )}
                      {vaccination.latestEvent.hasRecordedQuantity && (
                        <span className="ml-2 text-slate-700">
                          (Wanyama {vaccination.latestEvent.quantity})
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic bg-slate-50 rounded-xl p-3 border border-slate-100">
                    Hakuna chanjo iliyorekodiwa bado.
                  </div>
                )}
              </div>
            </div>

            {/* 2. Treatment Summary Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                      <Stethoscope className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Matibabu (Treatment)</h3>
                      <p className="text-xs text-slate-500">Matukio ya kutoa dawa kwa wagonjwa</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg text-xs">
                    {timeWindow}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 py-5 border-b border-slate-100">
                  {/* Event count */}
                  <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-100">
                    <div className="text-xs text-slate-500 font-medium">Matukio Yaliyorekodiwa</div>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {treatment.totalEventsCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">matukio (events)</div>
                  </div>

                  {/* Animals count by species */}
                  <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-100">
                    <div className="text-xs text-slate-500 font-medium">Wanyama Waliotibiwa</div>
                    {treatment.hasAnyRecordedQuantity ? (
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(treatment.totalAnimalsTreatedByType).map(([sp, cnt]) => (
                          <div key={sp} className="text-xs font-semibold text-slate-800">
                            {sp}: <span className="font-bold text-purple-700">{cnt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic mt-2">
                        Idadi haikutajwa kwenye matukio haya
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Latest Recorded Treatment */}
              <div className="pt-4 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium mb-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Matibabu ya Mwisho Yaliyorekodiwa:
                </div>
                {treatment.latestEvent ? (
                  <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-100/60 text-slate-800">
                    <div className="font-semibold flex items-center justify-between">
                      <span>{treatment.latestEvent.recordName} ({treatment.latestEvent.livestockType})</span>
                      <span className="text-purple-700 font-mono text-[11px]">
                        {treatment.latestEvent.eventDate}
                      </span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      {treatment.latestEvent.recordedMedicineName ? (
                        <span>Dawa: <strong>{treatment.latestEvent.recordedMedicineName}</strong></span>
                      ) : (
                        <span className="text-slate-400 italic">Jina la dawa halikuhifadhiwa</span>
                      )}
                      {treatment.latestEvent.hasRecordedQuantity && (
                        <span className="ml-2 text-slate-700">
                          (Wanyama {treatment.latestEvent.quantity})
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic bg-slate-50 rounded-xl p-3 border border-slate-100">
                    Hakuna matibabu yaliyorekodiwa bado.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Health Activity Breakdown by Livestock Type */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" />
                  Shughuli za Afya kwa Aina ya Mfugo (By Livestock Type)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Idadi ya matukio na wanyama kwa kila aina ya mfugo bila kuchanganya spishi tofauti.
                </p>
              </div>
            </div>

            {byLivestockType.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 italic">
                Hakuna data ya spishi kwa sasa.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {byLivestockType.map((item) => {
                  const totalEvents = item.vaccinationEventsCount + item.treatmentEventsCount;
                  return (
                    <div
                      key={item.livestockType}
                      className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200/60">
                        <div className="font-bold text-sm text-slate-900">
                          {item.livestockType}
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {totalEvents} matukio
                        </span>
                      </div>

                      {/* Vaccination count */}
                      <div className="flex items-center justify-between text-xs py-1">
                        <span className="text-slate-600 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          Chanjo (Vaccination):
                        </span>
                        <span className="font-bold text-slate-900">
                          {item.vaccinationEventsCount} matukio
                          {item.vaccinationHasQuantityData && (
                            <span className="text-blue-700 font-normal ml-1">
                              ({item.vaccinationAnimalsCount} wanyama)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Treatment count */}
                      <div className="flex items-center justify-between text-xs py-1">
                        <span className="text-slate-600 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                          Matibabu (Treatment):
                        </span>
                        <span className="font-bold text-slate-900">
                          {item.treatmentEventsCount} matukio
                          {item.treatmentHasQuantityData && (
                            <span className="text-purple-700 font-normal ml-1">
                              ({item.treatmentAnimalsCount} wanyama)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Latest Activity Date */}
                      <div className="mt-2 pt-2 border-t border-slate-200/40 text-[11px] text-slate-500 flex justify-between">
                        <span>Tukio la mwisho:</span>
                        <span className="font-mono text-slate-700">
                          {item.latestTreatmentDate || item.latestVaccinationDate || 'Bado'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expandable Supporting Events Timeline */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  Mlolongo wa Matukio Yaliyorekodiwa (Health History Timeline)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tazama maelezo ya kila tukio lililorekodiwa na mfugaji. Bonyeza tukio lolote kufungua taarifa kamili.
                </p>
              </div>

              {/* Timeline Category Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTimelineCategoryFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timelineCategoryFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Yote ({timeline.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineCategoryFilter('VACCINATION')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timelineCategoryFilter === 'VACCINATION'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Chanjo ({vaccination.totalEventsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineCategoryFilter('TREATMENT')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timelineCategoryFilter === 'TREATMENT'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Matibabu ({treatment.totalEventsCount})
                </button>
              </div>
            </div>

            {filteredTimeline.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                Hakuna matukio ya afya katika kipindi hiki cha siku.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredTimeline.map((item) => {
                  const isExpanded = !!expandedEventIds[item.id];
                  const isVaccination = item.type === 'VACCINATION';

                  return (
                    <div
                      key={item.id}
                      className="border border-slate-200/80 rounded-xl overflow-hidden transition-all bg-white hover:border-slate-300"
                    >
                      <button
                        type="button"
                        onClick={() => toggleEventExpand(item.id)}
                        className="w-full text-left p-3.5 flex items-center justify-between gap-3 focus:outline-none"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                              isVaccination
                                ? 'bg-blue-50 text-blue-700 border border-blue-200/50'
                                : 'bg-purple-50 text-purple-700 border border-purple-200/50'
                            }`}
                          >
                            {isVaccination ? 'Chanjo' : 'Matibabu'}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {item.recordName}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                ({item.livestockType})
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-slate-600">{item.eventDate}</span>
                              {item.productName && (
                                <span className="truncate">
                                  • {item.productName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {item.hasRecordedQuantity ? (
                            <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                              Wanyama {item.quantity}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              Idadi haikutajwa
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Expandable Detail Panel */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 bg-slate-50/70 border-t border-slate-100 text-xs space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                              <span className="text-slate-500 font-medium">Tarehe ya Tukio:</span>
                              <div className="font-semibold text-slate-800 font-mono mt-0.5">
                                {item.eventDate}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Aina ya Mfugo / Kundi:</span>
                              <div className="font-semibold text-slate-800 mt-0.5">
                                {item.recordName} ({item.livestockType})
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Idadi Iliyorekodiwa:</span>
                              <div className="font-semibold text-slate-800 mt-0.5">
                                {item.hasRecordedQuantity
                                  ? `${item.quantity} wanyama`
                                  : 'Idadi haikutajwa wakati wa kurekodi'}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">
                                {isVaccination ? 'Jina la Chanjo:' : 'Jina la Dawa:'}
                              </span>
                              <div className="font-semibold text-slate-800 mt-0.5">
                                {item.productName || (
                                  <span className="text-slate-400 italic">
                                    {isVaccination
                                      ? 'Jina la chanjo halikuhifadhiwa'
                                      : 'Jina la dawa halikuhifadhiwa'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Notes field */}
                          {item.notes ? (
                            <div className="pt-2 border-t border-slate-200/50">
                              <span className="text-slate-500 font-medium">Maelezo Yaliyorekodiwa:</span>
                              <p className="mt-1 p-2.5 bg-white rounded-lg border border-slate-200 text-slate-700 leading-relaxed">
                                {item.notes}
                              </p>
                            </div>
                          ) : (
                            <div className="pt-1 text-slate-400 italic">
                              Hakuna maelezo ya ziada yaliyorekodiwa kwenye tukio hili.
                            </div>
                          )}

                          <div className="text-[11px] text-slate-400 italic pt-1">
                            Taarifa hii imetolewa moja kwa moja kutoka kwenye rekodi rasmi uliyohifadhi. Hakuna utabiri wala utambuzi wa ugonjwa ulioongezwa.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Observations / Insights */}
          {observations.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Mazingatio ya Kumbukumbu za Shamba (Observations)
              </h3>
              <div className="space-y-2.5">
                {observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs flex flex-col gap-1"
                  >
                    <div className="font-semibold text-slate-900">{obs.title}</div>
                    <div className="text-slate-600">{obs.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strict Safety Guardrail Notice */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 text-xs text-amber-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              Mpaka wa Kisheria na Usalama wa Afya (V1.4D Health Safety Boundary)
            </div>
            <p className="leading-relaxed text-amber-900/90">
              Sehemu hii inakupa <strong>historia halisi ya matukio uliyowahi kurekodi</strong> pekee. Mfumo huu <strong>HAPASWI na HAUWEZI</strong> kufanya utambuzi wa magonjwa (disease diagnosis), kudai kwamba dawa ilifanikiwa au wanyama walipona, wala kupendekeza dawa, chanjo au vipimo vipya.
            </p>
            <p className="leading-relaxed text-amber-900/90">
              Ikiwa mifugo yako ina dalili za kuugua, au unahitaji dawa na ushauri wa kitaalamu, wasiliana mara moja na <strong>Daktari wa Mifugo aliyesajiliwa</strong> au Afisa Ugani aliye karibu nawe.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
