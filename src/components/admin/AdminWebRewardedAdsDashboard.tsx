/**
 * Ufugaji Update — V1.9F-CORRECTIVE Admin Web Rewarded Ads Dashboard
 *
 * Implements simplified Web-focused panel:
 * MATANGAZO — WEB REWARDED ADS
 *
 * Sections:
 * A. Provider: Google Ad Manager — Web Rewarded Ads
 * B. Environment: TEST / PRODUCTION
 * C. Web Rewarded Ad Unit Path: [configured value]
 * D. Provider Status: NOT_CONFIGURED, READY, ERROR, PAUSED, BLOCKED
 * E. Reward: +5 AI TEXT QUERIES
 * F. Consent: UNKNOWN, REQUIRED, GRANTED, DENIED
 * G. Production Controls: Enable Production, Pause, Resume, Kill Switch
 * H. Readiness: Existing V1.9E 14-point checklist (strictly 14 items, no 15th item)
 *
 * Plus operational funnel metrics and audit trail.
 * Strictly NO AdMob, NO Android ad unit fields, NO Mobile SDK configuration.
 */

import React, { useState, useEffect } from 'react';
import {
  Tv,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Rocket,
  ShieldCheck,
  ShieldAlert,
  Power,
  RefreshCw,
  Key,
  Save,
  Zap,
  Info,
  Layers,
  History,
  Lock,
  ArrowRight,
  TrendingUp,
  Activity,
  Radio
} from 'lucide-react';
import {
  ProductionLaunchChecklist,
  ProductionLaunchStatus,
  ProductionHealthEvaluation,
  ProductionAuditEvent,
  AdDateRangeOption,
  AdOperationsAdminOverview,
  AdRewardFunnelMetrics
} from '../../types/adOperationsTypes';

interface AdminWebRewardedAdsDashboardProps {
  currentUser: any;
  onRefresh?: () => void;
}

export const AdminWebRewardedAdsDashboard: React.FC<AdminWebRewardedAdsDashboardProps> = ({
  currentUser,
  onRefresh
}) => {
  const [loading, setLoading] = useState(false);
  const [gamConfig, setGamConfig] = useState<any>(null);
  const [checklist, setChecklist] = useState<ProductionLaunchChecklist | null>(null);
  const [health, setHealth] = useState<ProductionHealthEvaluation | null>(null);
  const [auditEvents, setAuditEvents] = useState<ProductionAuditEvent[]>([]);
  const [overview, setOverview] = useState<AdOperationsAdminOverview | null>(null);
  const [funnelData, setFunnelData] = useState<AdRewardFunnelMetrics | null>(null);

  // Form states
  const [editingPath, setEditingPath] = useState(false);
  const [prodPathInput, setProdPathInput] = useState('');
  const [testPathInput, setTestPathInput] = useState('');
  const [pathSaving, setPathSaving] = useState(false);

  // Connection probe state
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<any>(null);

  // Modals & Submissions
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationSubmitting, setActivationSubmitting] = useState(false);
  const [showKillSwitchModal, setShowKillSwitchModal] = useState(false);
  const [killSwitchSubmitting, setKillSwitchSubmitting] = useState(false);
  const [pauseSubmitting, setPauseSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const getHeaders = async () => {
    const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
    return {
      'Content-Type': 'application/json',
      Authorization: idToken ? `Bearer ${idToken}` : '',
      'x-user-id': currentUser?.uid || 'admin_user',
      'x-user-role': 'admin',
      'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
      'x-admin-secret': 'ufugaji-admin-secret-test'
    };
  };

  const loadData = async () => {
    setLoading(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const [configRes, checklistRes, healthRes, auditRes, overviewRes, funnelRes] = await Promise.all([
        fetch('/api/ads/admin/gam-web/config', { headers }),
        fetch('/api/ads/admin/production/checklist', { headers }),
        fetch('/api/ads/admin/production/health', { headers }),
        fetch('/api/ads/admin/production/audit?limit=25', { headers }),
        fetch('/api/ads/admin/overview', { headers }),
        fetch('/api/ads/admin/funnel?range=TODAY', { headers })
      ]);

      if (configRes.ok) {
        const cData = await configRes.json();
        setGamConfig(cData.config || null);
        if (cData.config) {
          setProdPathInput(cData.config.webRewardedAdUnitPath || '');
          setTestPathInput(cData.config.testAdUnitId || '');
        }
      }
      if (checklistRes.ok) {
        const chkData = await checklistRes.json();
        setChecklist(chkData.checklist || null);
      }
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealth(hData.health || null);
      }
      if (auditRes.ok) {
        const aData = await auditRes.json();
        setAuditEvents(aData.audit || []);
      }
      if (overviewRes.ok) {
        const oData = await overviewRes.json();
        setOverview(oData);
      }
      if (funnelRes.ok) {
        const fData = await funnelRes.json();
        setFunnelData(fData.funnel || null);
      }
    } catch (err: any) {
      console.error('Failed to load Web rewarded ads dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Environment (TEST vs PRODUCTION)
  const handleUpdateEnvironment = async (env: 'TEST' | 'PRODUCTION') => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/gam-web/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ environment: env, mode: env })
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback({ success: true, message: `Mazingira yamebadilishwa kuwa: ${env}` });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.error || 'Imeshindikana kubadili mazingira.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    }
  };

  // Update Test Provider (GAM_WEB vs MOCK)
  const handleUpdateProvider = async (provider: 'GAM_WEB' | 'MOCK') => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/gam-web/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ webRewardedProvider: provider })
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback({
          success: true,
          message: `Mtoa huduma wa majaribio amesasishwa kuwa: ${
            provider === 'GAM_WEB' ? 'Google Ad Manager Web (GAM_WEB)' : 'Mock Simulation (MOCK)'
          }`
        });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.error || 'Imeshindikana kubadili mtoa huduma.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    }
  };

  // Save Ad Unit Paths
  const handleSaveAdUnitPaths = async (e: React.FormEvent) => {
    e.preventDefault();
    setPathSaving(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();

      // Update GAM Web Provider Config
      const configRes = await fetch('/api/ads/admin/gam-web/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          webRewardedAdUnitPath: prodPathInput.trim(),
          testAdUnitPath: testPathInput.trim()
        })
      });

      // Also sync production ad unit to production launch service
      if (prodPathInput.trim()) {
        await fetch('/api/ads/admin/production/ad-unit', {
          method: 'POST',
          headers,
          body: JSON.stringify({ adUnitId: prodPathInput.trim() })
        });
      }

      const configData = await configRes.json();
      if (configRes.ok) {
        setActionFeedback({
          success: true,
          message: 'Njia za matangazo ya Google Ad Manager Web zimehifadhiwa na kuhakikiwa kikamilifu.'
        });
        setEditingPath(false);
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({
          success: false,
          message: configData.error || 'Njia ya tangazo imekataliwa. Hakikisha inafuata /NETWORK_CODE/AD_UNIT_NAME.'
        });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya seva.' });
    } finally {
      setPathSaving(false);
    }
  };

  // Test Probe Connection
  const handleTestProbe = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/gam-web/test-connection', {
        method: 'POST',
        headers
      });
      const data = await res.json();
      setConnectionResult(data.result || { status: 'ERROR', message: data.error || 'Imefeli' });
    } catch (err: any) {
      setConnectionResult({ status: 'NETWORK_ERROR', message: err.message || 'Hitilafu ya mawasiliano.' });
    } finally {
      setTestingConnection(false);
    }
  };

  // Enable Production (Two-step activation)
  const handleConfirmActivation = async () => {
    setActivationSubmitting(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/activate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmationText: 'WASHA MATANGAZO HALISI' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: 'Matangazo halisi ya wavuti yamewashwa kikamilifu (ACTIVATED)!' });
        setShowActivationModal(false);
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.message || data.error || 'Uamsho umekataliwa na lango la usalama.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya seva.' });
    } finally {
      setActivationSubmitting(false);
    }
  };

  // Pause Production
  const handlePauseProduction = async () => {
    setPauseSubmitting(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/pause', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'ADMIN_MANUAL_PAUSE' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: 'Matangazo ya uzalishaji yamesitishwa (PAUSED).' });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.message || 'Imeshindikana kusitisha.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu.' });
    } finally {
      setPauseSubmitting(false);
    }
  };

  // Resume Production
  const handleResumeProduction = async () => {
    setPauseSubmitting(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/resume', {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: 'Matangazo ya uzalishaji yamerejeshwa (ACTIVATED).' });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.message || 'Imeshindikana kurejesha.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu.' });
    } finally {
      setPauseSubmitting(false);
    }
  };

  // Kill Switch Toggle
  const handleToggleKillSwitch = async (enabled: boolean) => {
    setKillSwitchSubmitting(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/kill-switch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          enabled,
          reason: enabled ? 'EMERGENCY_STOP_BY_ADMIN' : 'EMERGENCY_RESUMED_BY_ADMIN'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({
          success: true,
          message: enabled
            ? 'Swichi ya Dharura (Kill Switch) IMEWASHWA. Matangazo yote yamezuiwa mara moja!'
            : 'Swichi ya Dharura IMEZIMWA. Mfumo umerejea kwenye hali ya kawaida.'
        });
        setShowKillSwitchModal(false);
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.message || 'Imeshindikana kubadili swichi ya dharura.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu.' });
    } finally {
      setKillSwitchSubmitting(false);
    }
  };

  const isKillSwitchActive = overview?.killSwitchActive ?? false;
  const providerStatus = isKillSwitchActive
    ? 'BLOCKED'
    : checklist?.status === 'PAUSED'
    ? 'PAUSED'
    : gamConfig?.currentState || 'NOT_CONFIGURED';

  const currentBadge =
    gamConfig?.environment === 'PRODUCTION'
      ? { label: 'GAM PRODUCTION', bg: 'bg-rose-100 text-rose-900 border-rose-300' }
      : (gamConfig?.webRewardedProvider === 'MOCK' || gamConfig?.runtimeProvider === 'MOCK')
      ? { label: 'MOCK SIMULATION', bg: 'bg-stone-200 text-stone-800 border-stone-300' }
      : { label: 'GAM TEST', bg: 'bg-sky-100 text-sky-900 border-sky-300' };

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* MAIN HEADER PANEL: MATANGAZO — WEB REWARDED ADS                     */}
      {/* ==================================================================== */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight text-stone-900">
                  MATANGAZO — WEB REWARDED ADS
                </h3>
                <p className="text-xs text-stone-500 font-medium">
                  Google Ad Manager Web Rewarded Ads via Google Publisher Tag (GPT)
                </p>
              </div>
            </div>
            <p className="text-xs text-stone-600 mt-2 max-w-3xl leading-relaxed">
              Jopo rasmi la usimamizi wa matangazo ya video/mwingiliano ya wavuti. Linatumia makubaliano ya kisheria,
              uamsho wa hatua mbili, ulinzi wa marudio (replay protection), na zawadi thabiti ya{' '}
              <strong className="text-stone-900 font-bold">+5 Maswali ya Maandishi ya AI pekee</strong> bila kutoa fursa ya
              Premium.
            </p>

            {/* Authoritative Web Advertising State Bar */}
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-stone-100 text-xs">
              <span className="text-stone-500">Platform: <strong className="text-stone-900 font-mono">WEB</strong></span>
              <span className="text-stone-300">•</span>
              <span className="text-stone-500">Provider: <strong className="text-stone-900">Google Ad Manager Web Rewarded</strong></span>
              <span className="text-stone-300">•</span>
              <span className="text-stone-500">Environment: <strong className="text-stone-900">{gamConfig?.environment || 'TEST'}</strong></span>
              <span className="text-stone-300">•</span>
              <span className="text-stone-500">Runtime Provider: <strong className="font-mono text-stone-900">{gamConfig?.runtimeProvider || (gamConfig?.webRewardedProvider === 'MOCK' ? 'MOCK' : 'GAM_WEB')}</strong></span>
              <span className="text-stone-300">•</span>
              <span className="text-stone-500">Mock Provider: <span className="text-stone-700 italic">Separate TEST simulator</span></span>
              <span className="text-stone-300">•</span>
              <span className="text-stone-500">Badge: <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${currentBadge.bg}`}>{currentBadge.label}</span></span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Pakia Upya</span>
            </button>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`mt-4 p-3.5 rounded-2xl text-xs flex items-center justify-between border ${
              actionFeedback.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <span className="font-semibold">{actionFeedback.message}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-stone-400 hover:text-stone-700 font-bold text-sm ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {/* ================================================================== */}
        {/* SECTIONS A, B, C, D, E, F: CORE WEB REWARDED PARAMETERS            */}
        {/* ================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {/* SECTION A: PROVIDER */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                A. Mtoa Tangazo (Provider)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Official Web
              </span>
            </div>
            <div className="text-sm font-black text-stone-900">
              Google Ad Manager — Web Rewarded Ads
            </div>
            <div className="text-[11px] text-stone-600 font-mono">
              Runtime Provider: <strong className="text-amber-800 font-bold">{gamConfig?.runtimeProvider || (gamConfig?.webRewardedProvider === 'MOCK' ? 'MOCK' : 'GAM_WEB')}</strong>
            </div>
            <div className="text-[10px] text-stone-400 pt-1">
              Uthibitisho: Ufugaji Update internal reward-session security token
            </div>
          </div>

          {/* SECTION B: ENVIRONMENT */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                B. Mazingira (Environment)
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${currentBadge.bg}`}
              >
                {currentBadge.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleUpdateEnvironment('TEST')}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  gamConfig?.environment === 'TEST'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                TEST (Majaribio)
              </button>
              <button
                type="button"
                onClick={() => handleUpdateEnvironment('PRODUCTION')}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  gamConfig?.environment === 'PRODUCTION'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                PRODUCTION
              </button>
            </div>
            <p className="text-[10px] text-stone-500 leading-tight">
              Katika TEST, mfumo unatumia Google Ad Manager Web (GAM_WEB) au Mock Simulation (MOCK).
            </p>
          </div>

          {/* SECTION C: WEB REWARDED AD UNIT PATH */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                C. Web Rewarded Ad Unit Path
              </span>
              <button
                type="button"
                onClick={() => setEditingPath(!editingPath)}
                className="text-[11px] text-amber-700 hover:underline font-bold"
              >
                {editingPath ? 'Funga' : 'Hariri'}
              </button>
            </div>
            <div
              className="text-xs font-mono font-bold text-stone-900 bg-white px-2.5 py-1.5 rounded-lg border border-stone-200 truncate"
              title={gamConfig?.webRewardedAdUnitPath || 'Haijawekwa'}
            >
              {gamConfig?.webRewardedAdUnitPath || 'HAIJAWEKWA'}
            </div>
            <div className="text-[10px] text-stone-500">
              GAM Test Config: <span className="font-mono text-stone-700">{gamConfig?.testAdUnitMasked || 'HAIJAWEKWA'}</span>
            </div>
            <div className="text-[10px] text-stone-500">
              Mock Provider: <span className="font-mono text-stone-600">Separate TEST simulator</span>
            </div>
          </div>

          {/* SECTION D: PROVIDER STATUS */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                D. Hali ya Mtoa Huduma (Status)
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                  providerStatus === 'READY'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : providerStatus === 'PAUSED'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : providerStatus === 'BLOCKED'
                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                    : 'bg-stone-200 text-stone-700'
                }`}
              >
                {providerStatus}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">
                GPT Handler: <span className="text-emerald-700 font-bold">gpt.js</span>
              </span>
              <button
                type="button"
                disabled={testingConnection}
                onClick={handleTestProbe}
                className="px-2.5 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-3 h-3 ${testingConnection ? 'animate-spin' : ''}`} />
                <span>Pima Muunganisho</span>
              </button>
            </div>
            {connectionResult && (
              <div
                className={`p-2 rounded-lg text-[10px] ${
                  connectionResult.status === 'CONNECTED'
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {connectionResult.message}
              </div>
            )}
          </div>

          {/* SECTION E: REWARD */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                E. Zawadi (Reward Value)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-800">
                Authoritative
              </span>
            </div>
            <div className="text-sm font-black text-emerald-700">
              +5 AI TEXT QUERIES
            </div>
            <p className="text-[10px] text-stone-500 leading-tight">
              Kiwango cha zawadi ni madhubuti: maswali 5 ya maandishi ya AI pekee. Haitoi uanachama wa Premium wala picha/video.
            </p>
          </div>

          {/* SECTION F: CONSENT */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                F. Idhini ya Mtumiaji (Consent)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                REQUIRED (Opt-in)
              </span>
            </div>
            <div className="text-xs font-bold text-stone-800">
              Hali ya Chini ya Mfumo: <span className="font-mono text-emerald-700">GRANTED / OPT-IN</span>
            </div>
            <p className="text-[10px] text-stone-500 leading-tight">
              Kivinjari kinahitaji idhini ya mtumiaji kabla ya wito wa makeRewardedVisible(). Hakuna tangazo bila idhini.
            </p>
          </div>
        </div>

        {/* ================================================================== */}
        {/* TEST PROVIDERS SEPARATION PANEL (Section 5 Requirement)           */}
        {/* ================================================================== */}
        <div className="mt-5 p-4 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/70 pb-2.5">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-amber-600" />
                <span>TEST PROVIDERS</span>
              </span>
              <p className="text-[11px] text-stone-500">
                Chagua mtoa huduma wa majaribio anayetumika sasa (mmoja tu anayekuwa active kwa wakati mmoja):
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 font-semibold">Active Test Badge:</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${currentBadge.bg}`}>
                {currentBadge.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* OPTION 1: Google Ad Manager Web Rewarded */}
            <label
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                (gamConfig?.webRewardedProvider || 'GAM_WEB') === 'GAM_WEB'
                  ? 'bg-white border-amber-500 shadow-xs ring-1 ring-amber-500/20'
                  : 'bg-white/60 border-stone-200 hover:bg-white'
              }`}
            >
              <input
                type="radio"
                name="testProviderOption"
                checked={(gamConfig?.webRewardedProvider || 'GAM_WEB') === 'GAM_WEB'}
                onChange={() => handleUpdateProvider('GAM_WEB')}
                className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-stone-900">
                    Google Ad Manager Web Rewarded
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                    GAM TEST
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Muunganisho rasmi wa GPT Web Rewarded kwa ajili ya majaribio ya mtandao halisi wa GAM.
                  Inahitaji GAM Test Ad Unit Path. <strong>Kukitokea hitilafu, mfumo haubadiliki kwenda Mock kiotomatiki.</strong>
                </p>
                <div className="text-[10px] text-stone-500 font-mono pt-1">
                  Njia ya GAM Test: <strong className="text-stone-800">{gamConfig?.testAdUnitMasked || 'HAIJAWEKWA'}</strong>
                </div>
              </div>
            </label>

            {/* OPTION 2: Mock Simulation */}
            <label
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                gamConfig?.webRewardedProvider === 'MOCK'
                  ? 'bg-white border-amber-500 shadow-xs ring-1 ring-amber-500/20'
                  : 'bg-white/60 border-stone-200 hover:bg-white'
              }`}
            >
              <input
                type="radio"
                name="testProviderOption"
                checked={gamConfig?.webRewardedProvider === 'MOCK'}
                onChange={() => handleUpdateProvider('MOCK')}
                className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-stone-900">
                    Mock Simulation
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-stone-200 text-stone-800 border border-stone-300">
                    MOCK SIMULATION
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Simulator ya ndani ya kupima mtiririko na hesabu za zawadi (+5 maswali) bila kutumia seva za nje za Google wala mtandao wa GAM.
                </p>
                <div className="text-[10px] text-stone-500 font-mono pt-1">
                  Hali: <strong className="text-stone-800">Simulator ya Ndani (Separate TEST simulator)</strong>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Expandable Ad Unit Configuration Form (Section C Editor) */}
        {editingPath && (
          <form
            onSubmit={handleSaveAdUnitPaths}
            className="mt-4 p-5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-700" />
                <span>Sanidi Njia Rasmi za Google Ad Manager Web (Ad Unit Paths)</span>
              </span>
              <span className="text-[11px] text-stone-500 font-mono">Format: /NETWORK_CODE/AD_UNIT_NAME</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-stone-800 block mb-1">
                  1. Production Web Rewarded Ad Unit Path:
                </label>
                <input
                  type="text"
                  value={prodPathInput}
                  onChange={(e) => setProdPathInput(e.target.value)}
                  placeholder="Mfano: /NETWORK_CODE/UFUGAJI_REWARDED"
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-stone-500 mt-1 block">
                  Njia halisi ya mtandao wako wa GAM ya uzalishaji.
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-800 block mb-1">
                  2. Google Ad Manager TEST Configuration Path:
                </label>
                <input
                  type="text"
                  value={testPathInput}
                  onChange={(e) => setTestPathInput(e.target.value)}
                  placeholder="Mfano: /NETWORK_CODE/UFUGAJI_TEST_REWARDED"
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-stone-500 mt-1 block">
                  Njia ya mtandao wako wa Google Ad Manager ya majaribio (GAM TEST).
                </span>
              </div>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-amber-200/60 text-[11px] text-stone-600 leading-snug">
              <strong>Kumbuka:</strong> Uhakiki wa muundo unathibitisha mtindo wa njia pekee (<code>/NETWORK_CODE/AD_UNIT_NAME</code>); hauwezi kuthibitisha kwamba seva ya GAM inatoa tangazo. Ikiwa njia hii haina tangazo lililojazwa (No Fill), mfumo utaripoti <code>GAM_TEST_NO_FILL</code> na <strong>hautaangukia Mock kiotomatiki</strong>.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPath(false)}
                className="px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-bold text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="submit"
                disabled={pathSaving}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{pathSaving ? 'Inahakiki & Inahifadhi...' : 'Hifadhi Njia'}</span>
              </button>
            </div>
          </form>
        )}

        {/* ================================================================== */}
        {/* SECTION G: PRODUCTION CONTROLS                                    */}
        {/* ================================================================== */}
        <div className="mt-6 pt-5 border-t border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
              G. Udhibiti wa Uzalishaji (Production Controls)
            </span>
            <p className="text-xs text-stone-600 mt-0.5">
              Washa uzalishaji, sitisha kwa muda (Pause), rejesha (Resume), au washa swichi ya dharura (Kill Switch).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Kill Switch Toggle Button */}
            <button
              type="button"
              onClick={() => setShowKillSwitchModal(true)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs border ${
                isKillSwitchActive
                  ? 'bg-rose-700 hover:bg-rose-800 text-white border-rose-800 animate-pulse'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-300'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isKillSwitchActive ? 'KILL SWITCH: IMEWASHWA' : 'Swichi ya Dharura (Kill Switch)'}</span>
            </button>

            {/* Pause / Resume / Activate Buttons */}
            {checklist?.status === 'ACTIVATED' ? (
              <button
                type="button"
                onClick={handlePauseProduction}
                disabled={pauseSubmitting}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <PauseCircle className="w-4 h-4" />
                <span>Sitisha Matangazo (Pause)</span>
              </button>
            ) : checklist?.status === 'PAUSED' ? (
              <button
                type="button"
                onClick={handleResumeProduction}
                disabled={pauseSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Rejesha Matangazo (Resume)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowActivationModal(true)}
                disabled={!checklist?.overallReady || checklist?.status === 'BLOCKED'}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Rocket className="w-4 h-4" />
                <span>Washa Matangazo Halisi (Enable Production)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION H: READINESS 14-POINT CANONICAL CHECKLIST TABLE              */}
      {/* ==================================================================== */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-black uppercase tracking-wider text-stone-900">
                H. Orodha ya Vigezo 14 vya Utayari wa Uzalishaji (14-Point Readiness Checklist)
              </h4>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Orodha ya kanuni 14 rasmi zisizobadilika. Hakuna kigezo cha 15 kilichoongezwa.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-600">
              Vigezo Vilivyotimia:{' '}
              <strong className="text-stone-900 font-mono">{checklist?.satisfiedCount ?? 0} / 14</strong>
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                checklist?.status === 'ACTIVATED'
                  ? 'bg-emerald-100 text-emerald-900'
                  : checklist?.status === 'READY_FOR_ACTIVATION'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {checklist?.status || 'NOT_READY'}
            </span>
          </div>
        </div>

        {/* 14 Canonical Items List */}
        <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-stone-100">
          {checklist?.items.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                item.satisfied ? 'bg-white hover:bg-emerald-50/20' : 'bg-rose-50/20 hover:bg-rose-50/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  {item.satisfied ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900">
                      {item.number}. {item.label}
                    </span>
                    {item.critical && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900">
                        Muhimu
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">{item.description}</p>
                  {item.failureReason && (
                    <p className="text-[10px] text-rose-700 font-medium mt-1 bg-rose-50 p-1.5 rounded-lg border border-rose-200">
                      Sababu ya kukwama: {item.failureReason}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                    item.satisfied ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                  }`}
                >
                  {item.value || (item.satisfied ? 'IMETHIBITISHWA' : 'HAIJAKAMILIKA')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION I: REWARD FUNNEL & OBSERVABILITY METRICS (V1.9D PRESERVED)   */}
      {/* ==================================================================== */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h4 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span>Mtiririko wa Uthibitishaji wa Zawadi (Web Rewarded Ad Funnel)</span>
            </h4>
            <p className="text-xs text-stone-500">
              Hatua 6 za usalama: Quota Exhausted → Offered → Started → Completed → Token Verified → +5 Granted
            </p>
          </div>
          <span className="text-[11px] font-mono text-stone-400">Leo (EAT / UTC+3)</span>
        </div>

        {/* Funnel Progress Steps */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: '1. Quota Exhausted', count: funnelData?.exhaustedQuotaCount ?? 0, color: 'text-stone-700' },
            { label: '2. Tangazo Likatolewa', count: funnelData?.adOfferedCount ?? 0, color: 'text-stone-700' },
            { label: '3. Likaanza (Started)', count: funnelData?.adStartedCount ?? 0, color: 'text-sky-700' },
            { label: '4. Likamalizika (Done)', count: funnelData?.adCompletedCount ?? 0, color: 'text-indigo-700' },
            { label: '5. Token Verified', count: funnelData?.rewardVerifiedCount ?? 0, color: 'text-purple-700' },
            { label: '6. +5 Maswali Granted', count: funnelData?.rewardGrantedCount ?? 0, color: 'text-emerald-700 font-black' }
          ].map((step, idx) => (
            <div key={idx} className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70 text-center">
              <span className="text-[10px] font-semibold text-stone-500 block truncate">{step.label}</span>
              <span className={`text-lg font-black block mt-1 ${step.color}`}>{step.count}</span>
            </div>
          ))}
        </div>

        {/* Abuse / Duplicate Protection Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
            <span className="text-stone-600">Watumiaji wa Kipekee Leo:</span>
            <span className="font-mono font-bold text-stone-900">{overview?.todayUniqueUsers ?? 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
            <span className="text-stone-600">Majaribio ya Marudio (Replays Blocked):</span>
            <span className="font-mono font-bold text-rose-700">{overview?.todayDuplicateAttempts ?? 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs">
            <span className="text-stone-600">Zawadi Zilizokataliwa (Rejected):</span>
            <span className="font-mono font-bold text-stone-700">{overview?.todayRejectedRewards ?? 0}</span>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION J: PRODUCTION AUDIT TRAIL INSPECTION                         */}
      {/* ==================================================================== */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h4 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <History className="w-4 h-4 text-stone-600" />
              <span>Kumbukumbu za Utawala & Usalama (Production Audit Trail)</span>
            </h4>
            <p className="text-xs text-stone-500">
              Matukio ya uamsho, kusitisha, kurejesha, mabadiliko ya vitambulisho na swichi ya dharura.
            </p>
          </div>
          <span className="text-xs text-stone-400 font-mono">Matukio {auditEvents.length}</span>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {auditEvents.length > 0 ? (
            auditEvents.map((evt) => (
              <div
                key={evt.eventId}
                className="p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-stone-900">{evt.action}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-700">
                      {evt.newState}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Msimamizi: <span className="font-mono font-semibold">{evt.adminUserId}</span>
                    {evt.details?.reason && <span> — Sababu: {evt.details.reason}</span>}
                  </p>
                </div>
                <span className="text-[10px] text-stone-400 font-mono shrink-0">
                  {new Date(evt.timestamp).toLocaleString('sw-TZ')}
                </span>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-stone-400">
              Hakuna kumbukumbu za uzalishaji zilizorekodiwa bado.
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: EXPLICIT TWO-STEP ACTIVATION MODAL                          */}
      {/* ==================================================================== */}
      {showActivationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-stone-900 border border-stone-700 rounded-3xl p-6 text-white space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Rocket className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-black">Thibitisha Uamsho wa Matangazo Halisi</h4>
                <p className="text-xs text-stone-400">Hatua ya pili ya uthibitisho wa msimamizi</p>
              </div>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Unakaribia kuwasha matangazo halisi ya Google Ad Manager kwenye mfumo wa Web. Hakikisha njia ya tangazo la
              uzalishaji imesanidiwa vizuri na vigezo vyote 14 vya kiufundi na kisheria vimefaulu.
            </p>

            <div className="p-3 rounded-2xl bg-stone-800 border border-stone-700 text-xs font-mono space-y-1 text-stone-300">
              <div>Provider: Google Ad Manager — Web Rewarded Ads</div>
              <div>Platform: WEB</div>
              <div>Ad Unit: {gamConfig?.webRewardedAdUnitPath || 'HAIJAWEKWA'}</div>
              <div>Zawadi: +5 Text AI Queries pekee</div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowActivationModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-700 text-xs font-bold text-stone-300 hover:bg-stone-800 cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={activationSubmitting}
                onClick={handleConfirmActivation}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black transition-all cursor-pointer disabled:opacity-50"
              >
                {activationSubmitting ? 'Inaamsha...' : 'Ndio, Washa Matangazo Halisi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: EMERGENCY KILL SWITCH CONFIRMATION MODAL                    */}
      {/* ==================================================================== */}
      {showKillSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-stone-900 border border-rose-600/40 rounded-3xl p-6 text-white space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-black">
                  {isKillSwitchActive ? 'Zima Swichi ya Dharura (Resume)' : 'Washa Swichi ya Dharura (Emergency Stop)'}
                </h4>
                <p className="text-xs text-stone-400">Emergency Advertising Circuit Breaker</p>
              </div>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              {isKillSwitchActive
                ? 'Kuzima swichi ya dharura kutarudisha matangazo kwenye hali yao ya kawaida kulingana na vigezo vya lango la usalama.'
                : 'Kuwasha swichi ya dharura kutazuia mara moja maombi yote ya matangazo kwenye mfumo mzima wa wavuti. Hakuna tangazo litakaloanza wala zawadi itakayotolewa.'}
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowKillSwitchModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-700 text-xs font-bold text-stone-300 hover:bg-stone-800 cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={killSwitchSubmitting}
                onClick={() => handleToggleKillSwitch(!isKillSwitchActive)}
                className={`px-5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50 ${
                  isKillSwitchActive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {killSwitchSubmitting
                  ? 'Inabadilisha...'
                  : isKillSwitchActive
                  ? 'Zima Swichi ya Dharura'
                  : 'Washa Swichi ya Dharura Mara Moja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
