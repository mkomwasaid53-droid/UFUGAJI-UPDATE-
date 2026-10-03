/**
 * Ufugaji Update — V1.9D Advertising Operations, Analytics & Controlled Launch Section
 *
 * Implements the 4 core administrative observability & control sections:
 * Section A: Current Status & Safety Gate (Provider, Platform, Mode, Production toggle, Safety Gate)
 * Section B: Reward Overview (Today, Yesterday, Week, Month, Unique users, Duplicates, Rejected)
 * Section C: Reward Funnel (Quota Exhausted -> Offered -> Started -> Completed -> Verified -> +5 Granted)
 * Section D: Provider Health (Available/Unavailable, Error count, Last success, Last failure, Diagnostics)
 * Plus:
 * - Controlled Launch Controls under Safety Gate
 * - Emergency Rollback Kill Switch
 * - Date Range Filter in EAT / UTC+3
 * - Strict Cost & Revenue Boundaries (rewardCount != revenue, zero fake revenue)
 */

import React, { useState, useEffect } from 'react';
import {
  Gift,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Power,
  Activity,
  Calendar,
  Layers,
  Users,
  Database,
  Info,
  Clock,
  ArrowRight,
  TrendingUp,
  Radio
} from 'lucide-react';
import {
  AdDateRangeOption,
  AdOperationsAdminOverview,
  AdRewardFunnelMetrics,
  AdOperationalEvent
} from '../../types/adOperationsTypes';

interface AdminAdvertisingOperationsSectionProps {
  currentUser: any;
  onRefresh?: () => void;
}

export const AdminAdvertisingOperationsSection: React.FC<AdminAdvertisingOperationsSectionProps> = ({
  currentUser,
  onRefresh
}) => {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<AdOperationsAdminOverview | null>(null);
  const [dateRange, setDateRange] = useState<AdDateRangeOption>('TODAY');
  const [funnelData, setFunnelData] = useState<AdRewardFunnelMetrics | null>(null);
  const [recentEvents, setRecentEvents] = useState<AdOperationalEvent[]>([]);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Modal / Confirm state for emergency kill switch
  const [showKillSwitchConfirm, setShowKillSwitchConfirm] = useState(false);
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);

  // Production toggle loading
  const [prodToggleLoading, setProdToggleLoading] = useState(false);

  const getHeaders = async () => {
    const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
    return {
      'Content-Type': 'application/json',
      'Authorization': idToken ? `Bearer ${idToken}` : '',
      'x-user-id': currentUser?.uid || 'admin_user',
      'x-user-role': 'admin',
      'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
      'x-admin-secret': 'ufugaji-admin-secret-test'
    };
  };

  const loadData = async (selectedRange = dateRange) => {
    setLoading(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();

      const [overviewRes, funnelRes, eventsRes] = await Promise.all([
        fetch('/api/ads/admin/overview', { headers }),
        fetch(`/api/ads/admin/funnel?range=${selectedRange}`, { headers }),
        fetch('/api/ads/admin/events?limit=30', { headers })
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data);
      }
      if (funnelRes.ok) {
        const fData = await funnelRes.json();
        setFunnelData(fData.funnel || null);
      }
      if (eventsRes.ok) {
        const eData = await eventsRes.json();
        setRecentEvents(eData.events || []);
      }
    } catch (err: any) {
      console.error('Error loading V1.9D ad operations data:', err);
      setActionFeedback({ success: false, message: 'Hitilafu ya kupakia taarifa za uendeshaji wa matangazo.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(dateRange);
  }, [dateRange]);

  const handleToggleKillSwitch = async (activate: boolean) => {
    setKillSwitchLoading(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/kill-switch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ active: activate })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Hitilafu ya kubadili swichi ya dharura.');
      }
      setActionFeedback({
        success: true,
        message: data.message || (activate ? 'Matangazo yamesitishwa kwa dharura.' : 'Matangazo yamerejeshwa.')
      });
      setShowKillSwitchConfirm(false);
      await loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    } finally {
      setKillSwitchLoading(false);
    }
  };

  const handleToggleProduction = async (enable: boolean) => {
    setProdToggleLoading(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const endpoint = enable ? '/api/ads/admin/enable-production' : '/api/ads/admin/disable-production';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        const failing = data.failingConditions ? ` (${data.failingConditions.join(', ')})` : '';
        throw new Error((data.message || data.error || 'Hatua haikuweza kukamilika.') + failing);
      }
      setActionFeedback({
        success: true,
        message: data.message || (enable ? 'Production imewashwa kikamilifu.' : 'Production imezimwa.')
      });
      await loadData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu wakati wa kubadili production.' });
    } finally {
      setProdToggleLoading(false);
    }
  };

  const status = overview?.status;
  const isKilled = status?.killSwitchActive;
  const isProd = status?.productionEnabled;
  const safetyGate = status?.safetyGate;
  const health = overview?.providerHealth;
  const rewardOverview = overview?.rewardOverview;

  return (
    <div className="space-y-6">
      {/* Top Action Feedback Alert */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center justify-between border ${
            actionFeedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-stone-400 hover:text-stone-700 font-bold ml-3 cursor-pointer text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* Emergency Kill Switch Banner if Active */}
      {isKilled && (
        <div className="bg-rose-600 text-white rounded-2xl p-5 shadow-lg border-2 border-rose-700 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-7 h-7 text-white shrink-0" />
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider">
                  ⚠️ Swichi ya Dharura Ipo Hai (Emergency Kill Switch Active)
                </h4>
                <p className="text-xs text-rose-100 mt-0.5">
                  Matangazo yote ya zawadi yamesitishwa mara moja. Hakuna tangazo litakaloonyeshwa wala zawadi
                  itakayotolewa kwa watumiaji. Nafasi za bure na Premium bado zinalindwa.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleKillSwitch(false)}
              disabled={killSwitchLoading}
              className="px-4 py-2 bg-white text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm"
            >
              {killSwitchLoading ? 'Inarejesha...' : 'Rejesha Huduma ya Matangazo'}
            </button>
          </div>
        </div>
      )}

      {/* SECTION A: CURRENT STATUS & CONTROLLED LAUNCH */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-black text-stone-900 tracking-tight">
                Sehemu A: Hali ya Sasa & Geti la Usalama (Current Status & Controlled Launch)
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Udhibiti salama wa mtoa huduma, geti la usalama la kuzuia makosa, na uzalishaji wa matangazo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadData(dateRange)}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Pakia Upya</span>
            </button>

            {/* Emergency Kill Switch Button */}
            {!isKilled ? (
              <button
                type="button"
                onClick={() => setShowKillSwitchConfirm(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Sitisha Matangazo (Kill Switch)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleKillSwitch(false)}
                disabled={killSwitchLoading}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Washa Matangazo</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Mtoa Tangazo</span>
            <span className="text-xs font-black text-stone-900 mt-0.5 block truncate">
              {status?.providerName || 'GOOGLE_AD_MANAGER_WEB'}
            </span>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Jukwaa (Platform)</span>
            <span className="text-xs font-black text-stone-900 mt-0.5 block">
              {status?.platform || 'WEB'}
            </span>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Hali (Mode)</span>
            <span
              className={`text-xs font-black mt-0.5 inline-block px-1.5 py-0.5 rounded-md ${
                status?.mode === 'PRODUCTION'
                  ? 'bg-rose-100 text-rose-800'
                  : status?.mode === 'TEST'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {status?.mode || 'TEST'}
            </span>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Production Toggle</span>
            <span
              className={`text-xs font-black mt-0.5 inline-block px-1.5 py-0.5 rounded-md ${
                isProd ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'
              }`}
            >
              {isProd ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
            </span>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Safety Gate</span>
            <span
              className={`text-xs font-black mt-0.5 inline-block px-1.5 py-0.5 rounded-md ${
                safetyGate?.eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {safetyGate?.eligible ? 'PASSED (Tayari)' : 'BLOCKED (Hairuhusiwi)'}
            </span>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Utayari wa Mtandao</span>
            <span
              className={`text-xs font-black mt-0.5 inline-block px-1.5 py-0.5 rounded-md ${
                health?.status === 'AVAILABLE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : health?.status === 'DEGRADED'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {health?.status || 'AVAILABLE'}
            </span>
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Sera ya Idhini</span>
            <span className="text-xs font-black text-stone-900 mt-0.5 block truncate">
              OPT_IN_EXPLICIT
            </span>
          </div>
        </div>

        {/* Safety Gate Details & Production Enable Controls */}
        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {safetyGate?.eligible ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-600" />
              )}
              <span className="text-xs font-bold text-stone-900">
                Uchambuzi wa Geti la Usalama la Uzalishaji (Production Safety Gate Evaluation)
              </span>
            </div>

            {/* Controlled Launch Action Buttons */}
            <div className="flex items-center gap-2">
              {!isProd ? (
                <button
                  type="button"
                  onClick={() => handleToggleProduction(true)}
                  disabled={prodToggleLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {prodToggleLoading ? 'Inachambua...' : 'Washa Matangazo Halisi (Enable Production)'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleProduction(false)}
                  disabled={prodToggleLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-800 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {prodToggleLoading ? 'Inazima...' : 'Zima Uzalishaji (Disable Production)'}
                </button>
              )}
            </div>
          </div>

          {safetyGate?.failingConditions && safetyGate.failingConditions.length > 0 ? (
            <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200/80 text-xs text-amber-950 space-y-1">
              <span className="font-bold block">
                Mambo yanayozuia kuwasha uzalishaji ({safetyGate.failingConditions.length}):
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-stone-700 text-[11px]">
                {safetyGate.failingConditions.map((cond, i) => (
                  <li key={i}>{cond}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-emerald-800 font-medium bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
              Vigezo vyote vimekamilika. Msimamizi ana mamlaka ya kuwasha matangazo ya kibiashara.
            </p>
          )}
        </div>
      </div>

      {/* SECTION B: REWARD OVERVIEW (DATE FILTER & EAT TIMEZONE) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-black text-stone-900 tracking-tight">
                Sehemu B: Muhtasari wa Zawadi (Reward Overview)
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Saa rasmi za seva: <strong className="text-stone-700">EAT / UTC+3 (Tanzania)</strong>. Uhasibu
              haufanyiki kwa kutegemea saa za kivinjari.
            </p>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
            {(
              [
                { id: 'TODAY', label: 'Leo' },
                { id: 'YESTERDAY', label: 'Jana' },
                { id: 'LAST_7_DAYS', label: 'Siku 7' },
                { id: 'LAST_30_DAYS', label: 'Siku 30' }
              ] as const
            ).map((rng) => (
              <button
                key={rng.id}
                type="button"
                onClick={() => setDateRange(rng.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRange === rng.id
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                {rng.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-emerald-800 block">Zawadi Leo</span>
            <span className="text-2xl font-black text-emerald-950 mt-1 block">
              {rewardOverview?.today ?? 0}
            </span>
            <span className="text-[10px] text-emerald-700">Verified Today</span>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-stone-600 block">Zawadi Jana</span>
            <span className="text-2xl font-black text-stone-900 mt-1 block">
              {rewardOverview?.yesterday ?? 0}
            </span>
            <span className="text-[10px] text-stone-400">Verified Yesterday</span>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-stone-600 block">Wiki Hii (Siku 7)</span>
            <span className="text-2xl font-black text-stone-900 mt-1 block">
              {rewardOverview?.thisWeek ?? 0}
            </span>
            <span className="text-[10px] text-stone-400">Past 7 Days</span>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-stone-600 block">Mwezi Huu (Siku 30)</span>
            <span className="text-2xl font-black text-stone-900 mt-1 block">
              {rewardOverview?.thisMonth ?? 0}
            </span>
            <span className="text-[10px] text-stone-400">Past 30 Days</span>
          </div>

          <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-sky-800 block">Watumiaji wa Kipekee</span>
            <span className="text-2xl font-black text-sky-950 mt-1 block">
              {rewardOverview?.uniqueRewardedUsers ?? 0}
            </span>
            <span className="text-[10px] text-sky-700">Unique Users</span>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-amber-800 block">Majaribio ya Nakala</span>
            <span className="text-2xl font-black text-amber-950 mt-1 block">
              {rewardOverview?.duplicateAttempts ?? 0}
            </span>
            <span className="text-[10px] text-amber-700">Replay Attempts (+0)</span>
          </div>

          <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-rose-800 block">Zilizokataliwa</span>
            <span className="text-2xl font-black text-rose-950 mt-1 block">
              {rewardOverview?.rejectedRewards ?? 0}
            </span>
            <span className="text-[10px] text-rose-700">Rejected Rewards</span>
          </div>
        </div>
      </div>

      {/* SECTION C: REWARD FUNNEL METRICS */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-black text-stone-900 tracking-tight">
                Sehemu C: Mchakato wa Utoaji Zawadi (Reward Funnel Steps)
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Hatua 6 rasmi za mfuatano kutoka ukomo wa bure hadi kuongezwa kwa maswali 5.
            </p>
          </div>
          <span className="text-[11px] font-bold text-stone-500">
            Kipindi: <span className="text-stone-900">{funnelData?.timeWindow.label || 'Leo'}</span>
          </span>
        </div>

        {/* Funnel Steps Flow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {(funnelData?.steps || []).map((step, idx) => (
            <div
              key={step.step}
              className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-stone-400 uppercase">
                  <span>Hatua {idx + 1}</span>
                  {idx > 0 && step.conversionRateFromPreviousPct !== undefined && (
                    <span className="text-emerald-700 font-extrabold">
                      {step.conversionRateFromPreviousPct}%
                    </span>
                  )}
                </div>
                <h5 className="text-xs font-black text-stone-900 mt-1">{step.label}</h5>
                <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-2">{step.description}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-stone-200/60 flex items-baseline justify-between">
                <span className="text-xl font-black text-stone-900">{step.count}</span>
                <span className="text-[10px] text-stone-400">users / hits</span>
              </div>
            </div>
          ))}
        </div>

        {/* Funnel Dropoff & Leakage Summary */}
        <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Majaribio ya kurudia (Duplicates):{' '}
              <strong className="text-stone-900">{funnelData?.duplicateAttemptsCount ?? 0}</strong>
            </span>
            <span>
              Vipindi vilivyopitwa na wakati (Expired):{' '}
              <strong className="text-stone-900">{funnelData?.expiredSessionsCount ?? 0}</strong>
            </span>
            <span>
              Hitilafu ya utambulisho (User Mismatch):{' '}
              <strong className="text-stone-900">{funnelData?.userMismatchCount ?? 0}</strong>
            </span>
          </div>
          <div>
            <span>
              Jumla ya maswali ya bure yaliyotolewa:{' '}
              <strong className="text-emerald-700 font-black">
                +{funnelData?.totalGrantedTextQueriesAllowance ?? 0} maswali
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* SECTION D: PROVIDER HEALTH & DIAGNOSTICS */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-black text-stone-900 tracking-tight">
                Sehemu D: Afya ya Mtoa Tangazo (Provider Health & Diagnostics)
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Ukaguzi wa utayari wa mtandao bila kuonyesha funguo za siri (secrets).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                health?.status === 'AVAILABLE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : health?.status === 'DEGRADED'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  health?.status === 'AVAILABLE'
                    ? 'bg-emerald-600'
                    : health?.status === 'DEGRADED'
                    ? 'bg-amber-600'
                    : 'bg-rose-600'
                }`}
              />
              {health?.status === 'AVAILABLE' ? 'INAPATIKANA (AVAILABLE)' : health?.status || 'UNAVAILABLE'}
            </span>
          </div>
        </div>

        {/* Health Metrics Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[11px] font-bold text-stone-500 block">Hitilafu Masaa 24 Yaliyopita</span>
            <span className="text-xl font-black text-stone-900 mt-1 block">
              {health?.errorCountLast24h ?? 0}
            </span>
            <span className="text-[10px] text-stone-400">Total Provider Errors</span>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[11px] font-bold text-stone-500 block">Tukio la Mwisho Lililofaulu</span>
            <span className="text-xs font-black text-emerald-800 mt-1 block truncate">
              {health?.lastSuccessfulEventAt
                ? new Date(health.lastSuccessfulEventAt).toLocaleTimeString('sw-TZ')
                : 'Hakuna bado leo'}
            </span>
            <span className="text-[10px] text-stone-400">Last Successful Completion</span>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[11px] font-bold text-stone-500 block">Hitilafu ya Mwisho</span>
            <span className="text-xs font-black text-rose-800 mt-1 block truncate">
              {health?.lastFailureReason || 'Hakuna hitilafu iliyorekodiwa'}
            </span>
            <span className="text-[10px] text-stone-400">Last Failure State</span>
          </div>

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-[11px] font-bold text-stone-500 block">Uchunguzi wa Mwisho</span>
            <span className="text-xs font-black text-stone-900 mt-1 block truncate">
              {health?.lastDiagnosticCheckAt
                ? new Date(health.lastDiagnosticCheckAt).toLocaleTimeString('sw-TZ')
                : 'Sasa hivi'}
            </span>
            <span className="text-[10px] text-stone-400">Self-Diagnostic Check</span>
          </div>
        </div>
      </div>

      {/* STRICT FINANCIAL & COST BOUNDARY DISCLAIMER */}
      <div className="bg-amber-50/60 border border-amber-200/90 rounded-2xl p-4.5 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-700 shrink-0" />
          <h4 className="text-xs font-black uppercase tracking-wide text-amber-950">
            Mpaka wa Kifedha na Mapato (Cost & Revenue Boundary)
          </h4>
        </div>
        <p className="text-xs text-stone-700 leading-relaxed">
          {overview?.costAndRevenueDisclaimer.notice ||
            'Kiwango cha zawadi hakimaanishi mapato ya fedha (Reward Count ≠ Revenue). Mfumo hauonyeshi makadirio bandia ya fedha (TSh) bila data halisi kutoka kwa mtoa matangazo rasmi.'}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] font-bold text-stone-600">Mapato Yanayoonekana:</span>
          <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 text-[11px] font-mono font-bold">
            TSh 0 (Haijapimwa / Unmeasured)
          </span>
        </div>
      </div>

      {/* RECENT OPERATIONAL EVENTS AUDIT TRAIL */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-900">
              Kumbukumbu za Uendeshaji wa Matangazo (Operational Event Log)
            </h4>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Matukio ya hivi karibuni yaliyorekodiwa ki-seva kwa ajili ya ukaguzi.
            </p>
          </div>
          <span className="text-[11px] text-stone-400 font-bold">{recentEvents.length} matukio</span>
        </div>

        {recentEvents.length === 0 ? (
          <p className="text-xs text-stone-400 py-3 text-center">Hakuna matukio yaliyorekodiwa bado.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-[10px] uppercase font-bold text-stone-500 border-b border-stone-200 sticky top-0">
                <tr>
                  <th className="py-2 px-3">Muda</th>
                  <th className="py-2 px-3">Tukio (Event)</th>
                  <th className="py-2 px-3">Mtumiaji</th>
                  <th className="py-2 px-3">Mtoa Huduma</th>
                  <th className="py-2 px-3">Hali</th>
                  <th className="py-2 px-3">Sababu / Maelezo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {recentEvents.map((evt) => (
                  <tr key={evt.eventId} className="hover:bg-stone-50/70">
                    <td className="py-2 px-3 font-mono text-[10px] text-stone-500">
                      {new Date(evt.timestamp).toLocaleTimeString('sw-TZ')}
                    </td>
                    <td className="py-2 px-3 font-bold text-stone-900">{evt.eventType}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-stone-600 truncate max-w-[120px]">
                      {evt.userId}
                    </td>
                    <td className="py-2 px-3 text-stone-600">{evt.provider}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                          evt.success
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {evt.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-stone-500 truncate max-w-[200px]">
                      {evt.failureCode || (evt.metadata ? JSON.stringify(evt.metadata) : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Emergency Kill Switch Confirmation Modal */}
      {showKillSwitchConfirm && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-extrabold text-stone-900">
                Thibitisha Kusitisha Matangazo (Kill Switch)
              </h4>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Hatua hii itasitisha mara moja utoaji wa matangazo yote ya zawadi kwa watumiaji wote. Hakuna mtumiaji
              atakayeweza kuanzisha tangazo wala kupokea zawadi ya +5 mpaka utakaporejesha huduma hii.
            </p>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-950 font-medium">
              Vipengele vingine vya mfumo (Free quota, Premium, Marketplace, Daktari, My Assistant) vitaendelea
              kufanya kazi kama kawaida bila kuathirika.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowKillSwitchConfirm(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all cursor-pointer"
              >
                Ghairi (Cancel)
              </button>
              <button
                type="button"
                onClick={() => handleToggleKillSwitch(true)}
                disabled={killSwitchLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {killSwitchLoading ? 'Inasitisha...' : 'Ndio, Sitisha Sasa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
