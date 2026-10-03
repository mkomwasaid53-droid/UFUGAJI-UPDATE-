import React, { useState } from 'react';
import { HistoryQuestionResult, HistorySupportingEvent } from '../types/historyQuestionTypes';
import { ShieldCheck, Calendar, Hash, ChevronDown, ChevronUp, AlertCircle, FileText, Activity } from 'lucide-react';

interface AiHistoryQuestionProofCardProps {
  result: HistoryQuestionResult;
  onFollowUp?: (text: string) => void;
}

export const AiHistoryQuestionProofCard: React.FC<AiHistoryQuestionProofCardProps> = ({
  result,
  onFollowUp
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!result || !result.detected) {
    return null;
  }

  const {
    intent,
    authoritativeSource,
    eventCount,
    animalQuantity,
    hasRecordedAnimalQuantity,
    quantityDisclaimerSwahili,
    latestEvent,
    supportingEvents,
    supportingEventsCount,
    byLivestockType,
    safetyNoticeSwahili
  } = result;

  // Format date helper
  const formatDate = (ymd: string) => {
    if (!ymd) return '';
    const parts = ymd.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return ymd;
  };

  // Generate intelligent follow-up suggestions (V1.4G Section 31 & 32)
  const followUpChips: string[] = [];
  if (intent !== 'HISTORY_LATEST' && eventCount > 0) {
    followUpChips.push('Ya mwisho ilikuwa lini?');
  }
  if (!hasRecordedAnimalQuantity && eventCount > 0) {
    followUpChips.push('Hizo zilihusisha wanyama wangapi?');
  }
  if (authoritativeSource.queriedPeriod.window === 'all-time') {
    followUpChips.push('Vipi kuhusu miezi 3 iliyopita?');
  } else {
    followUpChips.push('Katika historia yote je?');
  }
  if (!result.parsedQuestion.livestockType && byLivestockType && byLivestockType.length > 1) {
    const firstType = byLivestockType[0].livestockType;
    followUpChips.push(`Na ${firstType} pekee?`);
  }

  return (
    <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-500/30 overflow-hidden text-xs transition-all">
      {/* Header Badge */}
      <div className="flex items-center justify-between px-3 py-2 bg-emerald-100/60 dark:bg-emerald-900/40 border-b border-emerald-500/20">
        <div className="flex items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Uthibitisho wa Kumbukumbu (V1.4G)</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
          <span>Daftari la Msaidizi Wangu</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {/* Metric 1: Matukio (Event Count) */}
          <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-emerald-200/50 dark:border-emerald-800/40">
            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[10px]">
              <Hash className="w-3 h-3 text-emerald-600" />
              <span>Matukio Yaliyorekodiwa</span>
            </div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {eventCount} {eventCount === 1 ? 'tukio' : 'matukio'}
            </div>
          </div>

          {/* Metric 2: Wanyama (Animal Quantity) */}
          <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-emerald-200/50 dark:border-emerald-800/40">
            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[10px]">
              <Activity className="w-3 h-3 text-emerald-600" />
              <span>Wanyama Waliohusika</span>
            </div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {hasRecordedAnimalQuantity && animalQuantity !== null
                ? `${animalQuantity} wanyama`
                : 'Haijatajwa'}
            </div>
          </div>

          {/* Metric 3: Kipindi (Period) */}
          <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-emerald-200/50 dark:border-emerald-800/40 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[10px]">
              <Calendar className="w-3 h-3 text-emerald-600" />
              <span>Kipindi</span>
            </div>
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
              {authoritativeSource.queriedPeriod.labelSwahili}
            </div>
          </div>
        </div>

        {/* Latest Event Teaser */}
        {latestEvent && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-emerald-950 dark:text-emerald-200">Tukio la Mwisho: </span>
              <span className="text-zinc-800 dark:text-zinc-200">
                Tarehe {formatDate(latestEvent.eventDate)} ({latestEvent.eventType}) kwa{' '}
                {latestEvent.recordName}
                {latestEvent.medicineName ? ` • Dawa: ${latestEvent.medicineName}` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Quantity Disclaimer if partial quantity recorded */}
        {quantityDisclaimerSwahili && (
          <div className="flex items-start gap-1.5 text-[10.5px] text-amber-800 dark:text-amber-300/90 leading-tight">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>{quantityDisclaimerSwahili}</span>
          </div>
        )}

        {/* Expandable Supporting Events Details Drawer */}
        {supportingEvents && supportingEvents.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center justify-between w-full py-1.5 px-2 rounded-md hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-medium text-[11px] transition-colors"
            >
              <div className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                <span>
                  {isExpanded
                    ? 'Ficha orodha ya matukio yaliyotumika'
                    : `Tazama orodha ya matukio yaliyothibitishwa (${supportingEventsCount})`}
                </span>
              </div>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {isExpanded && (
              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {supportingEvents.map((evt: HistorySupportingEvent) => (
                  <div
                    key={evt.eventId}
                    className="p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10.5px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {evt.title || evt.eventType}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                        {formatDate(evt.eventDate)}
                      </span>
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
                      <span>{evt.recordName} ({evt.livestockType})</span>
                      {evt.quantity !== null && evt.quantity > 0 && (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                          {evt.quantity} wanyama
                        </span>
                      )}
                    </div>
                    {evt.medicineName && (
                      <div className="text-zinc-500 dark:text-zinc-400">
                        Dawa/Chanjo: <span className="font-medium text-zinc-700 dark:text-zinc-200">{evt.medicineName}</span>
                      </div>
                    )}
                    {evt.notes && (
                      <div className="text-zinc-500 dark:text-zinc-400 italic">
                        "{evt.notes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Professional Clinical Notice */}
        {safetyNoticeSwahili && (
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-emerald-500/15 italic">
            * {safetyNoticeSwahili}
          </div>
        )}

        {/* Follow-Up Action Chips (V1.4G Section 31 & 32) */}
        {onFollowUp && followUpChips.length > 0 && (
          <div className="pt-2 border-t border-emerald-500/20">
            <div className="text-[10px] text-emerald-900/80 dark:text-emerald-300/80 font-medium mb-1.5">
              Maswali ya Haraka ya Mwendelezo:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {followUpChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onFollowUp(chip)}
                  className="px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-emerald-300/70 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-200 text-[10.5px] hover:bg-emerald-50 dark:hover:bg-emerald-900/40 transition-colors shadow-xs"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
