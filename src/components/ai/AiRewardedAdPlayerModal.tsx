import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Volume2, 
  VolumeX, 
  Loader2, 
  ShieldCheck, 
  Sparkles,
  Play,
  RotateCcw,
  Check
} from 'lucide-react';
import { 
  AdPresentationLifecycleState, 
  AdProviderMode, 
  AdPlatform 
} from '../../types/aiUsageAndCache';

export interface AiRewardedAdPlayerModalProps {
  isOpen: boolean;
  lifecycleState: AdPresentationLifecycleState;
  providerName: string;
  mode: AdProviderMode;
  platform: AdPlatform;
  adUnitId?: string;
  rewardUnits?: number;
  errorMessage?: string | null;
  diagnostic?: {
    provider: 'GAM_WEB' | 'MOCK' | string;
    environment: 'TEST' | 'PRODUCTION' | string;
    mode: 'REAL_PROVIDER' | 'SIMULATION' | string;
    adUnitPath: string;
    mock: boolean;
    status?: string;
  };
  onAdCompleted: () => void;
  onAdDismissed: () => void;
  onClose: () => void;
}

export const AiRewardedAdPlayerModal: React.FC<AiRewardedAdPlayerModalProps> = ({
  isOpen,
  lifecycleState,
  providerName,
  mode,
  platform,
  adUnitId = '',
  rewardUnits = 5,
  errorMessage,
  diagnostic,
  onAdCompleted,
  onAdDismissed,
  onClose
}) => {
  const [countdown, setCountdown] = useState<number>(5);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showDismissConfirm, setShowDismissConfirm] = useState<boolean>(false);
  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const completionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredCompletionRef = useRef<boolean>(false);
  const onAdCompletedRef = useRef(onAdCompleted);
  onAdCompletedRef.current = onAdCompleted;

  const adTips = [
    'Boresha lishe ya mifugo yako kwa mchanganyiko sahihi wa nafaka na madini.',
    'Panga ratiba thabiti ya chanjo kuzuia magonjwa ya mlipuko kama Mdondo.',
    'Zingatia usafi wa mabanda na hewa safi ili kuzuia matatizo ya upumuaji.',
    'Weka kumbukumbu sahihi za uzalishaji wa maziwa na mayai kila siku.'
  ];

  // Reset timer when presented
  useEffect(() => {
    if (!isOpen) {
      setCountdown(5);
      setIsPlaying(true);
      setShowDismissConfirm(false);
      setActiveFrameIndex(0);
      hasTriggeredCompletionRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      return;
    }

    if (lifecycleState === 'AD_PRESENTED' && !showDismissConfirm) {
      setCountdown(5);
      setIsPlaying(true);
      hasTriggeredCompletionRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          setActiveFrameIndex((f) => (f + 1) % adTips.length);
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (completionTimerRef.current) {
          clearTimeout(completionTimerRef.current);
          completionTimerRef.current = null;
        }
      };
    }
  }, [isOpen, lifecycleState, showDismissConfirm]);

  // Strictly trigger completion once when countdown reaches 0
  useEffect(() => {
    if (isOpen && lifecycleState === 'AD_PRESENTED' && countdown === 0 && !hasTriggeredCompletionRef.current) {
      hasTriggeredCompletionRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      completionTimerRef.current = setTimeout(() => {
        onAdCompletedRef.current();
      }, 400);
    }
  }, [isOpen, lifecycleState, countdown]);

  // Google Publisher Tag (GPT) Web Rewarded slot lifecycle (Requirement 7)
  const gptSlotRef = useRef<any>(null);

  const isGamWeb =
    diagnostic?.provider === 'GAM_WEB' ||
    providerName === 'GOOGLE_AD_MANAGER_WEB' ||
    providerName === 'GAM_WEB' ||
    (!diagnostic?.mock && providerName !== 'MOCK_REWARDED_AD' && providerName !== 'MOCK');

  const badgeText =
    mode === 'PRODUCTION'
      ? 'GAM PRODUCTION'
      : isGamWeb
      ? 'GAM TEST'
      : 'MOCK SIMULATION';

  const badgeColor =
    mode === 'PRODUCTION'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      : isGamWeb
      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
      : 'bg-stone-500/20 text-stone-300 border-stone-500/40';

  useEffect(() => {
    if (!isOpen || !isGamWeb || typeof window === 'undefined') return;

    // Load official GPT script if not present
    if (!document.getElementById('gpt-script')) {
      const script = document.createElement('script');
      script.id = 'gpt-script';
      script.async = true;
      script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
      document.head.appendChild(script);
    }

    try {
      const win = window as any;
      win.googletag = win.googletag || { cmd: [] };
      win.googletag.cmd.push(() => {
        try {
          const googletag = win.googletag;
          if (typeof googletag.defineOutOfPageSlot !== 'function') return;

          const activePath = adUnitId || diagnostic?.adUnitPath;
          if (!activePath) return;

          const slot = googletag.defineOutOfPageSlot(activePath, googletag.enums.OutOfPageFormat.REWARDED);
          if (slot) {
            gptSlotRef.current = slot;
            slot.addService(googletag.pubads());

            // 1. rewardedSlotReady
            googletag.pubads().addEventListener('rewardedSlotReady', (evt: any) => {
              if (typeof evt.makeRewardedVisible === 'function') {
                evt.makeRewardedVisible();
              }
            });

            // 2. rewardedSlotGranted
            googletag.pubads().addEventListener('rewardedSlotGranted', () => {
              if (!hasTriggeredCompletionRef.current) {
                hasTriggeredCompletionRef.current = true;
                onAdCompletedRef.current();
              }
            });

            // 3. rewardedSlotClosed
            googletag.pubads().addEventListener('rewardedSlotClosed', () => {
              if (gptSlotRef.current) {
                googletag.destroySlots([gptSlotRef.current]);
                gptSlotRef.current = null;
              }
            });

            googletag.enableServices();
            googletag.display(slot);
          }
        } catch (gptErr) {
          console.warn('[GPT] Initialization note:', gptErr);
        }
      });
    } catch (e) {
      console.warn('[GPT] Setup note:', e);
    }

    return () => {
      try {
        const win = window as any;
        if (win.googletag && gptSlotRef.current) {
          win.googletag.cmd.push(() => {
            if (gptSlotRef.current) {
              win.googletag.destroySlots([gptSlotRef.current]);
              gptSlotRef.current = null;
            }
          });
        }
      } catch {}
    };
  }, [isOpen, isGamWeb, adUnitId, diagnostic?.adUnitPath]);

  if (!isOpen) return null;

  const handleAttemptClose = () => {
    if (countdown > 0 && lifecycleState === 'AD_PRESENTED') {
      setShowDismissConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDismiss = () => {
    setShowDismissConfirm(false);
    hasTriggeredCompletionRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    onAdDismissed();
  };

  const handleCancelDismiss = () => {
    setShowDismissConfirm(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tangazo la Zawadi la AI"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-stone-900 border border-stone-700 text-stone-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top Header Badge */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-stone-950 border-b border-stone-800 text-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${badgeColor}`}>
              <Tv className="w-3 h-3" />
              {badgeText}
            </span>
            <span className="text-[10px] text-stone-400 hidden sm:inline">
              {isGamWeb ? 'Google Ad Manager Web' : 'Mock Simulator'} ({platform})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {lifecycleState === 'AD_PRESENTED' && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-stone-800 text-amber-400 font-semibold border border-stone-700">
                {countdown > 0 ? `Zawadi baada ya sekunde ${countdown}s` : 'Imekamilika!'}
              </span>
            )}
            <button
              type="button"
              id="ai-ad-close-btn"
              onClick={handleAttemptClose}
              className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              title="Funga"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body Based on Lifecycle State */}
        <div className="p-5 flex flex-col items-center justify-center min-h-[300px] text-center">
          {/* 1. LOADING STATE */}
          {(lifecycleState === 'AD_REQUESTED' || lifecycleState === 'AD_LOADING') && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-stone-200">
                  {isGamWeb ? 'Inaandaa tangazo la Google Ad Manager...' : 'Inaandaa simulator ya majaribio...'}
                </p>
                <p className="text-xs text-stone-400 mt-1 font-mono">
                  Unit: {adUnitId || diagnostic?.adUnitPath || (isGamWeb ? 'HAIJAWEKWA' : 'MOCK_REWARDED')}
                </p>
              </div>
            </div>
          )}

          {/* 2. PRESENTED AD VIDEO / INTERACTIVE SIMULATION */}
          {lifecycleState === 'AD_PRESENTED' && !showDismissConfirm && (
            <div className="w-full flex flex-col items-center gap-4">
              {/* Watermark Banner */}
              <div className="w-full py-1.5 px-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 flex items-center justify-between font-mono">
                <span className="font-bold">
                  {isGamWeb
                    ? mode === 'PRODUCTION'
                      ? 'GAM Production:'
                      : 'Google Ad Manager TEST configuration:'
                    : 'Ufugaji Update MOCK TEST:'}
                </span>
                <span className="truncate ml-2">{adUnitId || diagnostic?.adUnitPath || (isGamWeb ? 'HAIJAWEKWA' : 'MOCK_REWARDED')}</span>
              </div>

              {/* Runtime Diagnostic Proof (Requirement 8) */}
              <div className="w-full py-1 px-3 bg-stone-950/80 border border-stone-800 rounded-lg text-[10px] text-stone-400 font-mono flex items-center justify-between">
                <span>
                  Provider: <strong className="text-stone-200">{diagnostic?.provider || (isGamWeb ? 'GAM_WEB' : 'MOCK')}</strong> ({diagnostic?.mode || (isGamWeb ? 'REAL_PROVIDER' : 'SIMULATION')})
                </span>
                <span>
                  Env: <strong className="text-stone-200">{diagnostic?.environment || mode}</strong> | mock: <strong className={isGamWeb ? 'text-emerald-400' : 'text-amber-400'}>{String(Boolean(diagnostic?.mock ?? !isGamWeb))}</strong>
                </span>
              </div>

              {/* Simulated Creative Video Frame */}
              <div className="w-full aspect-video bg-gradient-to-br from-stone-800 via-stone-850 to-stone-900 border border-stone-700 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden shadow-inner">
                {/* Simulated playback progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-stone-700 overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Ufugaji Update Educational Showcase
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1 rounded hover:bg-stone-700/60 text-stone-300"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Animated Showcase Content */}
                <div className="my-auto py-2 text-center animate-in fade-in duration-300" key={activeFrameIndex}>
                  <p className="text-base font-bold text-white mb-1">
                    Ushauri wa Kisasa wa Ufugaji
                  </p>
                  <p className="text-xs text-stone-300 max-w-sm mx-auto leading-relaxed">
                    {adTips[activeFrameIndex]}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-stone-400 border-t border-stone-750 pt-2">
                  <span className="font-mono text-stone-400">Hakuna mapato halisi yanayozalishwa</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {countdown === 0 ? 'Tayari!' : `${countdown}s zimesalia`}
                  </span>
                </div>
              </div>

              {/* Reward Policy Reminder */}
              <p className="text-[11px] text-stone-400">
                Tazama sekunde zote 5 ili kupata <strong className="text-emerald-400">+5 maswali ya bure ya maandishi</strong>.
              </p>
            </div>
          )}

          {/* 3. DISMISS CONFIRMATION PROMPT */}
          {showDismissConfirm && (
            <div className="w-full flex flex-col items-center gap-3 py-4 animate-in fade-in duration-150">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-stone-100">
                Je, una uhakika unataka kufunga tangazo?
              </h3>
              <p className="text-xs text-stone-300 max-w-sm leading-relaxed">
                Ukifunga sasa kabla ya muda kumalizika, <strong>hutapata zawadi ya maswali 5 ya AI</strong>.
              </p>

              <div className="flex items-center gap-3 mt-4 w-full justify-center">
                <button
                  type="button"
                  onClick={handleCancelDismiss}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Endelea Kutazama
                </button>
                <button
                  type="button"
                  id="ai-ad-confirm-dismiss-btn"
                  onClick={handleConfirmDismiss}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs border border-stone-700 transition-colors cursor-pointer"
                >
                  Funga Bila Zawadi
                </button>
              </div>
            </div>
          )}

          {/* 4. VERIFYING STATE */}
          {(lifecycleState === 'AD_COMPLETED' || lifecycleState === 'REWARD_PENDING_VERIFICATION') && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <div>
                <p className="text-sm font-bold text-stone-100">
                  Umekamilisha tangazo!
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  Seva inathibitisha uthibitisho wa tangazo na kuongeza maswali yako 5...
                </p>
              </div>
            </div>
          )}

          {/* 5. REWARD GRANTED STATE */}
          {lifecycleState === 'REWARD_GRANTED' && (
            <div className="flex flex-col items-center gap-3 py-4 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-stone-100">
                Hongera sana!
              </h3>
              <p className="text-sm font-semibold text-emerald-400">
                Umefanikiwa kupata zawadi ya maswali 5 ya AI.
              </p>
              <p className="text-xs text-stone-400 max-w-sm mt-1 leading-relaxed">
                Maswali haya 5 ni ya <strong>maandishi pekee</strong>. Maswali ya picha na video bado yanahitaji kifurushi cha Premium.
              </p>
              <button
                type="button"
                id="ai-ad-reward-done-btn"
                onClick={onClose}
                className="mt-4 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Endelea na Msaidizi wa AI</span>
              </button>
            </div>
          )}

          {/* 6. DUPLICATE STATE */}
          {lifecycleState === 'REWARD_DUPLICATE' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-stone-100">
                Zawadi Tayari Imethibitishwa
              </h3>
              <p className="text-xs text-stone-400 max-w-sm">
                Token hii ya zawadi tayari imeshathibitishwa awali na hakuna maswali ya ziada yaliyoongezwa.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs transition-colors"
              >
                Funga
              </button>
            </div>
          )}

          {/* 7. REJECTED OR FAILED STATE */}
          {(lifecycleState === 'REWARD_REJECTED' || lifecycleState === 'AD_FAILED') && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-stone-100">
                Hitilafu ya Uthibitisho wa Tangazo
              </h3>
              <p className="text-xs text-rose-300 max-w-sm">
                {errorMessage || 'Tangazo halikuweza kuthibitishwa na seva. Tafadhali jaribu tena au tumia Premium.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs transition-colors"
              >
                Funga
              </button>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-4 py-2.5 bg-stone-950 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mamlaka ya Seva (Server-Authoritative)</span>
          </span>
          <span className="font-mono text-[10px] text-stone-400">
            Hali: {lifecycleState}
          </span>
        </div>
      </div>
    </div>
  );
};
