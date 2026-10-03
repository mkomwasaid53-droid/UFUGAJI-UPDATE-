/**
 * Ufugaji Update — V1.9E Production Advertising Launch & Controlled Activation Section
 *
 * Implements Section 13 of V1.9E:
 * 1. Production Launch Status (NOT_READY, READY_FOR_ACTIVATION, ACTIVATED, PAUSED, BLOCKED)
 * 2. 14-point Canonical Checklist table with satisfaction indicators & values
 * 3. Strict Production Ad Unit ID Configuration (rejects Google test units)
 * 4. Explicit Two-Step Admin Activation with Swahili confirmation modal
 * 5. Production Pause & Resume controls
 * 6. Production Health Evaluation (HEALTHY, DEGRADED, BLOCKED, PAUSED)
 * 7. Controlled Rollout Mode Indicator (DISABLED / ALL_ELIGIBLE_USERS)
 * 8. Production Audit Trail inspection
 */

import React, { useState, useEffect } from 'react';
import {
  Rocket,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Sliders,
  Activity,
  History,
  Lock,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import {
  ProductionLaunchChecklist,
  ProductionLaunchStatus,
  ProductionHealthEvaluation,
  ProductionAuditEvent,
  ProductionRolloutMode
} from '../../types/adOperationsTypes';

interface AdminProductionLaunchSectionProps {
  currentUser: any;
  onRefresh?: () => void;
}

export const AdminProductionLaunchSection: React.FC<AdminProductionLaunchSectionProps> = ({
  currentUser,
  onRefresh
}) => {
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<ProductionLaunchChecklist | null>(null);
  const [health, setHealth] = useState<ProductionHealthEvaluation | null>(null);
  const [auditEvents, setAuditEvents] = useState<ProductionAuditEvent[]>([]);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Activation modal state
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationSubmitting, setActivationSubmitting] = useState(false);

  // Ad unit config state
  const [customAdUnitInput, setCustomAdUnitInput] = useState('');
  const [adUnitSubmitting, setAdUnitSubmitting] = useState(false);

  // Pause / Resume loading
  const [pauseSubmitting, setPauseSubmitting] = useState(false);

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
      const [checklistRes, healthRes, auditRes] = await Promise.all([
        fetch('/api/ads/admin/production/checklist', { headers }),
        fetch('/api/ads/admin/production/health', { headers }),
        fetch('/api/ads/admin/production/audit?limit=20', { headers })
      ]);

      if (checklistRes.ok) {
        const cData = await checklistRes.json();
        setChecklist(cData.checklist || null);
      }
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealth(hData.health || null);
      }
      if (auditRes.ok) {
        const aData = await auditRes.json();
        setAuditEvents(aData.audit || []);
      }
    } catch (err: any) {
      console.error('Failed to load production launch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Set Production Ad Unit ID
  const handleSaveAdUnit = async () => {
    if (!customAdUnitInput.trim()) {
      setActionFeedback({
        success: false,
        message: 'Tafadhali weka kitambulisho cha tangazo halisi (Production Ad Unit ID).'
      });
      return;
    }

    setAdUnitSubmitting(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/ad-unit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ adUnitId: customAdUnitInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: data.message });
        setCustomAdUnitInput('');
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({
          success: false,
          message: data.error || data.message || 'Hitilafu ya kusajili kitambulisho cha tangazo.'
        });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    } finally {
      setAdUnitSubmitting(false);
    }
  };

  // Two-Step Explicit Admin Activation
  const handleConfirmActivation = async () => {
    setActivationSubmitting(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/activate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmationPassed: true })
      });
      const data = await res.json();
      setShowActivationModal(false);
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: data.message });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({
          success: false,
          message: data.message || data.error || 'Uamsho wa uzalishaji umekataliwa.'
        });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    } finally {
      setActivationSubmitting(false);
    }
  };

  // Pause Production Ads
  const handlePauseProduction = async () => {
    setPauseSubmitting(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/pause', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'MANUAL_PAUSE' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: data.message });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({ success: false, message: data.message || 'Hitilafu ya kusitisha matangazo.' });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    } finally {
      setPauseSubmitting(false);
    }
  };

  // Resume Production Ads
  const handleResumeProduction = async () => {
    setPauseSubmitting(true);
    setActionFeedback(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/ads/admin/production/resume', {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ success: true, message: data.message });
        loadData();
        onRefresh?.();
      } else {
        setActionFeedback({
          success: false,
          message: data.message || data.error || 'Haikuweza kurejesha matangazo halisi.'
        });
      }
    } catch (err: any) {
      setActionFeedback({ success: false, message: err.message || 'Hitilafu ya mtandao.' });
    } finally {
      setPauseSubmitting(false);
    }
  };

  const getStatusBadge = (status?: ProductionLaunchStatus) => {
    switch (status) {
      case 'ACTIVATED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>PRODUCTION ACTIVATED</span>
          </span>
        );
      case 'READY_FOR_ACTIVATION':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-900 border border-sky-300 flex items-center gap-1.5 shadow-2xs">
            <Rocket className="w-3.5 h-3.5 text-sky-700" />
            <span>READY FOR ACTIVATION</span>
          </span>
        );
      case 'PAUSED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 shadow-2xs">
            <PauseCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>PRODUCTION PAUSED</span>
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1.5 shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-rose-700" />
            <span>PRODUCTION BLOCKED</span>
          </span>
        );
      case 'NOT_READY':
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-black bg-stone-100 text-stone-700 border border-stone-300 flex items-center gap-1.5 shadow-2xs">
            <AlertTriangle className="w-3.5 h-3.5 text-stone-600" />
            <span>PRODUCTION NOT READY</span>
          </span>
        );
    }
  };

  const getHealthBadge = (healthStatus?: string) => {
    switch (healthStatus) {
      case 'HEALTHY':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
            HEALTHY
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
            DEGRADED
          </span>
        );
      case 'PAUSED':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-orange-50 text-orange-800 border border-orange-200">
            PAUSED
          </span>
        );
      case 'BLOCKED':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-50 text-rose-800 border border-rose-200">
            BLOCKED
          </span>
        );
    }
  };

  return (
    <div className="bg-white border-2 border-amber-500/40 rounded-3xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-2 rounded-xl bg-amber-500 text-stone-900 shadow-2xs">
              <Rocket className="w-5 h-5 text-stone-950" />
            </span>
            <h3 className="text-lg font-black text-stone-950 tracking-tight">
              Uzinduzi Rasmi wa Matangazo Halisi (V1.9E Production Launch)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-stone-900 text-white">
              Controlled Activation
            </span>
          </div>
          <p className="text-xs text-stone-600 mt-1.5 max-w-3xl leading-relaxed">
            Udhibiti wa hatua mbili kwa ajili ya kuwasha matangazo halisi ya uzalishaji. Matangazo hayatawashwa kiotomatiki mpaka vigezo vyote 14 vya kisheria, kiufundi na mtoa huduma vithibitishwe na msimamizi aidhinishe rasmi.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {getStatusBadge(checklist?.status)}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Pakia Upya"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between border ${
            actionFeedback.success
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-stone-400 hover:text-stone-700 font-bold ml-3 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Indicators Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-stone-50/80 border border-stone-200 rounded-2xl p-3.5">
          <span className="text-[11px] font-semibold text-stone-500 block">Hali ya Afya (Health)</span>
          <div className="mt-1 flex items-center gap-2">
            {getHealthBadge(health?.status || checklist?.healthState)}
          </div>
          <span className="text-[10px] text-stone-400 mt-1 block">Server-Side Health</span>
        </div>

        <div className="bg-stone-50/80 border border-stone-200 rounded-2xl p-3.5">
          <span className="text-[11px] font-semibold text-stone-500 block">Vigezo Vilivyokamilika</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-black text-stone-900">
              {checklist?.satisfiedCount ?? 0}
            </span>
            <span className="text-xs text-stone-400 font-bold">/ 14</span>
          </div>
          <span className="text-[10px] text-stone-400 mt-1 block">
            {checklist?.overallReady ? 'Pre-checks Passed' : 'Incomplete'}
          </span>
        </div>

        <div className="bg-stone-50/80 border border-stone-200 rounded-2xl p-3.5">
          <span className="text-[11px] font-semibold text-stone-500 block">Hali ya Kusambaza (Rollout)</span>
          <div className="mt-1 font-bold text-xs text-stone-900">
            {checklist?.rolloutMode === 'ALL_ELIGIBLE_USERS' ? (
              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>ALL_ELIGIBLE_USERS</span>
              </span>
            ) : (
              <span className="text-stone-600 font-extrabold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                <span>DISABLED (OFF)</span>
              </span>
            )}
          </div>
          <span className="text-[10px] text-stone-400 mt-1 block">Controlled Rollout</span>
        </div>

        <div className="bg-stone-50/80 border border-stone-200 rounded-2xl p-3.5">
          <span className="text-[11px] font-semibold text-stone-500 block">Tangazo Halisi (Ad Unit)</span>
          <div className="mt-1 font-mono text-[11px] font-bold text-stone-800 truncate" title={checklist?.activeAdUnitIdMasked || 'Haijawekwa'}>
            {checklist?.activeAdUnitIdMasked || 'HAIJAWEKWA'}
          </div>
          <span className="text-[10px] text-stone-400 mt-1 block">Google Ad Manager Web Unit</span>
        </div>
      </div>

      {/* Main Controls & Activation Area */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-950 text-white rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-extrabold tracking-tight flex items-center gap-2 text-white">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Udhibiti wa Uamsho wa Matangazo Halisi (Admin Launch Controls)</span>
            </h4>
            <p className="text-xs text-stone-400 mt-1 leading-relaxed max-w-2xl">
              Ili kuwasha matangazo halisi, vigezo 13 vya awali lazima vitimizwe kwanza (Status: READY FOR ACTIVATION). Kisha msimamizi athibitishe kwa kubonyeza kitufe hapa chini.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {checklist?.status === 'ACTIVATED' ? (
              <button
                type="button"
                onClick={handlePauseProduction}
                disabled={pauseSubmitting}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <PauseCircle className="w-4 h-4" />
                <span>Sitisha Matangazo (Pause)</span>
              </button>
            ) : checklist?.status === 'PAUSED' ? (
              <button
                type="button"
                onClick={handleResumeProduction}
                disabled={pauseSubmitting}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Rejesha Matangazo (Resume)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowActivationModal(true)}
                disabled={!checklist?.overallReady || checklist?.status === 'BLOCKED'}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Rocket className="w-4 h-4 text-stone-950" />
                <span>Washa Matangazo Halisi</span>
              </button>
            )}
          </div>
        </div>

        {/* Ad Unit Configuration Field */}
        <div className="pt-3 border-t border-stone-800">
          <label className="text-[11px] font-bold text-stone-300 block mb-1.5">
            Sanidi Kitambulisho Halisi cha Tangazo (Production Ad Unit ID):
          </label>
          <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
            <input
              type="text"
              value={customAdUnitInput}
              onChange={(e) => setCustomAdUnitInput(e.target.value)}
              placeholder="Mfano: /NETWORK_CODE/UFUGAJI_REWARDED (Google Ad Manager Web)"
              className="flex-1 px-3.5 py-2 rounded-xl bg-stone-800/90 border border-stone-700 text-xs font-mono text-white placeholder-stone-500 focus:outline-none focus:border-amber-400 transition-all"
            />
            <button
              type="button"
              onClick={handleSaveAdUnit}
              disabled={adUnitSubmitting || !customAdUnitInput.trim()}
              className="px-4 py-2 rounded-xl bg-stone-700 hover:bg-stone-600 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              {adUnitSubmitting ? 'Inahakiki...' : 'Hifadhi & Hakiki'}
            </button>
          </div>
          <span className="text-[10px] text-stone-400 mt-1.5 block">
            Kumbuka: Kwa Web App, tumia muundo rasmi wa Google Ad Manager (/NETWORK_CODE/AD_UNIT_NAME). Vitambulisho vya Mobile AdMob (ca-app-pub-...) na vitambulisho vya majaribio vinakataliwa na seva.
          </span>
        </div>
      </div>

      {/* 14-Point Authoritative Checklist Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span>Orodha ya Vigezo 14 vya Utayari wa Uzalishaji (Authoritative Checklist)</span>
          </h4>
          <span className="text-[11px] text-stone-500 font-semibold">
            Vigezo Muhimu (Critical): 13/14
          </span>
        </div>

        <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
          <div className="divide-y divide-stone-100">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-stone-900">
                        {item.number}. {item.label}
                      </span>
                      {item.critical && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-stone-100 text-stone-600 uppercase">
                          Critical
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                    {item.failureReason && (
                      <p className="text-[10px] text-rose-700 font-semibold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{item.failureReason}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold font-mono ${
                      item.satisfied
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-rose-100 text-rose-900'
                    }`}
                  >
                    {item.value || (item.satisfied ? 'TAYARI' : 'HAIJAKAMILIKA')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Production Audit Trail */}
      <div className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
          <History className="w-4 h-4 text-amber-600" />
          <span>Kumbukumbu ya Matukio ya Uzinduzi (Production Launch Audit Trail)</span>
        </h4>

        <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs bg-stone-50">
          {auditEvents.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-500">
              Hakuna matukio ya uzinduzi yaliyorekodiwa bado.
            </div>
          ) : (
            <div className="divide-y divide-stone-200/60 max-h-64 overflow-y-auto">
              {auditEvents.map((evt) => (
                <div key={evt.eventId} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 uppercase text-[10px] bg-stone-200 px-1.5 py-0.5 rounded">
                        {evt.action}
                      </span>
                      <span className="text-[11px] text-stone-600">
                        {evt.previousState} &rarr; <strong className="text-stone-900">{evt.newState}</strong>
                      </span>
                    </div>
                    {evt.reason && (
                      <p className="text-[10px] text-stone-500 mt-0.5">{evt.reason}</p>
                    )}
                  </div>
                  <div className="text-[10px] text-stone-400 shrink-0 sm:text-right font-mono">
                    {new Date(evt.timestamp).toLocaleString('sw-TZ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two-Step Explicit Activation Confirmation Modal */}
      {showActivationModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-900 shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-950">
                  Uthibitisho Rasmi wa Msimamizi (Explicit Activation)
                </h3>
                <span className="text-xs text-stone-500">Hatua ya 2 ya Uamsho wa Matangazo Halisi</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-stone-800 leading-relaxed space-y-2">
              <p className="font-semibold text-amber-950 italic">
                «“Unakaribia kuwasha rewarded advertising ya production. Mfumo utatumia production ad provider na production ad unit. Hakikisha compliance, consent na configuration zote zimekamilika.”»
              </p>
              <p className="text-[11px] text-stone-600">
                Baada ya kuwasha, watumiaji wa bure wataanza kuona matangazo halisi ya mtandao yaliyothibitishwa ki-seva. Lango la usalama litaendelea kufanya ufuatiliaji wa kiotomatiki.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowActivationModal(false)}
                disabled={activationSubmitting}
                className="px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleConfirmActivation}
                disabled={activationSubmitting}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Rocket className="w-4 h-4 text-stone-950" />
                <span>{activationSubmitting ? 'Inaamsha...' : 'Thibitisha na Uwashe'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
