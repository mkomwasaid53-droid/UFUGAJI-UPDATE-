import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Calendar,
  History,
  DollarSign,
  ChevronRight,
  Info,
  Play
} from 'lucide-react';
import {
  SellerMonetizationRecord,
  SellerMonetizationAuditEntry,
  SellerMonetizationDiagnosticLog,
  SellerPaymentStatus,
  SellerPaymentIntent
} from '../../types/sellerMonetization';
import { sellerMonetizationService } from '../../services/sellerMonetizationService';
import { useAuth } from '../../context/AuthContext';

export const AdminSellerMonetization: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || user?.email === 'mkomwasaid53@gmail.com';

  const [records, setRecords] = useState<SellerMonetizationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<SellerMonetizationAuditEntry[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<SellerMonetizationDiagnosticLog[]>([]);
  const [paymentIntents, setPaymentIntents] = useState<SellerPaymentIntent[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'records' | 'audit' | 'diagnostic' | 'payments'>('records');
  const [selectedRecord, setSelectedRecord] = useState<SellerMonetizationRecord | null>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Suspend modal state
  const [suspendReason, setSuspendReason] = useState<string>('');
  const [showSuspendModal, setShowSuspendModal] = useState<boolean>(false);

  // Test payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [testPaymentAmount, setTestPaymentAmount] = useState<number>(1000);
  const [testPaymentRef, setTestPaymentRef] = useState<string>('');

  const getHeaders = async () => {
    const token = user ? await user.getIdToken() : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    headers['x-admin-secret'] = 'ufugaji-admin-secret-test';
    return headers;
  };

  const refreshLogs = async () => {
    try {
      const headers = await getHeaders();
      const [auditRes, diagRes, payRes] = await Promise.all([
        fetch('/api/seller/monetization/admin/audit', { headers }),
        fetch('/api/seller/monetization/admin/diagnostic', { headers }),
        fetch('/api/seller/monetization/admin/payments', { headers })
      ]);
      const auditData = await auditRes.json();
      const diagData = await diagRes.json();
      const payData = await payRes.json();
      if (auditRes.ok && auditData.auditLogs) {
        setAuditLogs(auditData.auditLogs);
      }
      if (diagRes.ok && diagData.diagnosticLogs) {
        setDiagnosticLogs(diagData.diagnosticLogs);
      }
      if (payRes.ok && payData.payments) {
        setPaymentIntents(payData.payments);
      }
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const headers = await getHeaders();
      const [listRes, auditRes, diagRes, payRes] = await Promise.all([
        fetch('/api/seller/monetization/admin/list', { headers }),
        fetch('/api/seller/monetization/admin/audit', { headers }),
        fetch('/api/seller/monetization/admin/diagnostic', { headers }),
        fetch('/api/seller/monetization/admin/payments', { headers })
      ]);

      const listData = await listRes.json();
      const auditData = await auditRes.json();
      const diagData = await diagRes.json();
      const payData = await payRes.json();

      if (listRes.ok && listData.records) {
        setRecords(listData.records);
        setStats(listData.stats);
      }
      if (auditRes.ok && auditData.auditLogs) {
        setAuditLogs(auditData.auditLogs);
      }
      if (diagRes.ok && diagData.diagnosticLogs) {
        setDiagnosticLogs(diagData.diagnosticLogs);
      }
      if (payRes.ok && payData.payments) {
        setPaymentIntents(payData.payments);
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya mtandao');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadData();
  }, []);

  const handleSuspend = async () => {
    if (!selectedRecord) return;
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/seller/monetization/admin/suspend', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerUserId: selectedRecord.sellerUserId,
          reason: suspendReason || 'Kusimamishwa na msimamizi'
        })
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setActionMessage('Usajili wa muuzaji umesimamishwa kiutawala.');
        setShowSuspendModal(false);
        setSuspendReason('');
        sellerMonetizationService.cacheRecord(data.record);
        setSelectedRecord(data.record);
        setRecords((prev) => prev.map((r) => r.sellerUserId === data.record.sellerUserId ? data.record : r));
        refreshLogs();
      } else {
        setActionError(data.error || 'Imeshindikana kusimamisha usajili.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!selectedRecord) return;
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/seller/monetization/admin/reactivate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerUserId: selectedRecord.sellerUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setActionMessage('Usajili wa muuzaji umerejeshwa kwa ufanisi.');
        sellerMonetizationService.cacheRecord(data.record);
        setSelectedRecord(data.record);
        setRecords((prev) => prev.map((r) => r.sellerUserId === data.record.sellerUserId ? data.record : r));
        refreshLogs();
      } else {
        setActionError(data.error || 'Imeshindikana kurejesha usajili.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!selectedRecord) return;
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/seller/monetization/admin/test-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerUserId: selectedRecord.sellerUserId,
          paymentStatus: 'SUCCESS',
          amount: testPaymentAmount,
          transactionRef: testPaymentRef || `sim_tx_${Date.now()}`,
          idempotencyKey: `pay_${selectedRecord.sellerUserId}_${Date.now()}`
        })
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setActionMessage('Malipo ya majaribio yamethibitishwa. Usajili umekuwa ACTIVE kwa siku 30.');
        setShowPaymentModal(false);
        setTestPaymentRef('');
        sellerMonetizationService.cacheRecord(data.record);
        setSelectedRecord(data.record);
        setRecords((prev) => prev.map((r) => r.sellerUserId === data.record.sellerUserId ? data.record : r));
        refreshLogs();
      } else {
        setActionError(data.error || 'Imeshindikana kurekodi malipo.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateGrace = async () => {
    if (!selectedRecord) return;
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/seller/monetization/admin/simulate-grace', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerUserId: selectedRecord.sellerUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setActionMessage('Simulizi ya Grace Period imekamilika kupitia injini rasmi ya seva ya lifecycle.');
        sellerMonetizationService.cacheRecord(data.record);
        setSelectedRecord(data.record);
        setRecords((prev) => prev.map((r) => r.sellerUserId === data.record.sellerUserId ? data.record : r));
        refreshLogs();
      } else {
        setActionError(data.error || 'Imeshindikana kuanzisha Grace Period.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateExpiry = async () => {
    if (!selectedRecord) return;
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/seller/monetization/admin/simulate-expiry', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerUserId: selectedRecord.sellerUserId
        })
      });
      const data = await res.json();
      if (res.ok && data.record) {
        setActionMessage('Simulizi ya kuisha kwa Grace Period (EXPIRED) imekamilika kupitia injini rasmi ya seva.');
        sellerMonetizationService.cacheRecord(data.record);
        setSelectedRecord(data.record);
        setRecords((prev) => prev.map((r) => r.sellerUserId === data.record.sellerUserId ? data.record : r));
        refreshLogs();
      } else {
        setActionError(data.error || 'Imeshindikana kumaliza Grace Period.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckPaymentStatus = async (paymentIntentId: string) => {
    setActionLoading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/seller/monetization/payment-status/${paymentIntentId}`, { headers });
      const data = await res.json();
      if (res.ok && data.paymentIntent) {
        setActionMessage(`Hali ya malipo ${paymentIntentId}: ${data.paymentIntent.status} (Imehakikiwa na mtoa huduma).`);
        loadData();
      } else {
        setActionError(data.error || 'Imeshindikana kupokea hali ya malipo.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya mtandao');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return iso;
    }
  };

  const filteredRecords = records.filter(
    (r) =>
      r.sellerUserId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.sellerProfileId && r.sellerProfileId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-stone-900 tracking-tight">
                USAJILI WA WAUZAJI (SELLER MONETIZATION V1.10B)
              </h2>
              <p className="text-xs text-stone-500">
                Usimamizi wa usajili wa kila mwezi (TSh 1,000), mwezi wa bure (Trial), na malipo ya simu (PlusPesa).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Pakia Upya</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-5">
            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 text-center">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">Jumla</span>
              <span className="text-base font-black text-stone-900">{stats.total}</span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-center">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">Bado</span>
              <span className="text-base font-black text-amber-900">{stats.notActivated}</span>
            </div>
            <div className="p-3 rounded-2xl bg-sky-50/60 border border-sky-200/80 text-center">
              <span className="text-[10px] font-bold text-sky-800 uppercase block">Trial Active</span>
              <span className="text-base font-black text-sky-900">{stats.trialActive}</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 text-center">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">Active</span>
              <span className="text-base font-black text-emerald-900">{stats.active}</span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-center">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">Grace</span>
              <span className="text-base font-black text-amber-900">{stats.gracePeriod}</span>
            </div>
            <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-200/80 text-center">
              <span className="text-[10px] font-bold text-rose-800 uppercase block">Expired</span>
              <span className="text-base font-black text-rose-900">{stats.expired}</span>
            </div>
            <div className="p-3 rounded-2xl bg-stone-100 border border-stone-300 text-center">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">Suspended</span>
              <span className="text-base font-black text-stone-900">{stats.suspended}</span>
            </div>
          </div>
        )}

        {/* Action feedback */}
        {actionMessage && (
          <div className="mt-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionMessage}</span>
          </div>
        )}
        {actionError && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Tabs: Records vs Audit vs Diagnostic vs Payments */}
        <div className="flex flex-wrap items-center gap-2 mt-6 border-b border-stone-200">
          <button
            type="button"
            onClick={() => setActiveTab('records')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'records'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Rekodi za Wauzaji ({records.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Kumbukumbu ya Ukaguzi (Audit Trail)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diagnostic')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'diagnostic'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Mwenendo wa Hali (Diagnostic Trail)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'border-amber-600 text-amber-800'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Miamala ya Malipo ({paymentIntents.length})</span>
          </button>
        </div>


        {/* TAB 1: RECORDS TABLE */}
        {activeTab === 'records' && (
          <div className="mt-4 space-y-4">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tafuta kwa Seller User ID..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div className="overflow-x-auto border border-stone-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                  <tr>
                    <th className="p-3">Seller ID</th>
                    <th className="p-3">Hali (Status)</th>
                    <th className="p-3">Plani / Bei</th>
                    <th className="p-3">Mwezi wa Bure (Trial)</th>
                    <th className="p-3">Kipindi / Renewal</th>
                    <th className="p-3 text-right">Vitendo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-400">
                        Hakuna rekodi za wauzaji zilizopatikana.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec) => (
                      <tr key={rec.sellerUserId} className="hover:bg-stone-50/80 transition-colors">
                        <td className="p-3 font-mono font-medium text-stone-800">
                          {rec.sellerUserId}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              rec.status === 'TRIAL_ACTIVE'
                                ? 'bg-sky-50 text-sky-800 border-sky-300'
                                : rec.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : rec.status === 'GRACE_PERIOD'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : rec.status === 'EXPIRED'
                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                : rec.status === 'SUSPENDED'
                                ? 'bg-stone-200 text-stone-800 border-stone-300'
                                : 'bg-stone-100 text-stone-600 border-stone-200'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-stone-900">
                            TSh {rec.price.toLocaleString()}
                          </span>{' '}
                          <span className="text-[10px] text-stone-500">/ mwezi</span>
                        </td>
                        <td className="p-3 text-stone-600">
                          {rec.trialEndAt ? formatDate(rec.trialEndAt) : 'Haijawashwa'}
                        </td>
                        <td className="p-3 text-stone-600">
                          {rec.nextRenewalAt ? formatDate(rec.nextRenewalAt) : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(rec)}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-200 transition-all cursor-pointer"
                          >
                            Tazama / Dhibiti
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-stone-500">
              Kumbukumbu ya mabadiliko ya usajili wa wauzaji iliyothibitishwa na seva (Server-Authoritative Audit Trail).
            </p>
            <div className="overflow-x-auto border border-stone-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                  <tr>
                    <th className="p-3">Muda</th>
                    <th className="p-3">Muuzaji</th>
                    <th className="p-3">Tukio (Event)</th>
                    <th className="p-3">Hali (Kutoka → Kwenda)</th>
                    <th className="p-3">Mtekelezaji</th>
                    <th className="p-3">Maelezo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-stone-400">
                        Hakuna matukio ya ukaguzi bado.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-stone-50/80">
                        <td className="p-3 text-stone-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('sw-TZ')}
                        </td>
                        <td className="p-3 text-stone-800 font-semibold">{log.sellerUserId}</td>
                        <td className="p-3 text-amber-800 font-bold">{log.eventType}</td>
                        <td className="p-3 text-stone-600">
                          {log.previousStatus || '—'} → <strong className="text-stone-900">{log.newStatus}</strong>
                        </td>
                        <td className="p-3 text-stone-500">{log.performedBy}</td>
                        <td className="p-3 text-stone-600 max-w-xs truncate" title={log.reason}>
                          {log.reason || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DIAGNOSTIC TRAIL TABLE (SECTION 28) */}
        {activeTab === 'diagnostic' && (
          <div className="mt-4 space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-900 font-medium">
              Kumbukumbu ya uchunguzi wa V1.10A-C3 inaonyesha uhamaji wa hali wa kila muuzaji: ni tukio gani, chanzo gani, na arifa gani zilitolewa bila marudio.
            </div>
            <div className="overflow-x-auto border border-stone-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                  <tr>
                    <th className="p-3">Muda</th>
                    <th className="p-3">Muuzaji</th>
                    <th className="p-3">Kitendo (Action)</th>
                    <th className="p-3">Ubadilishaji (A → B)</th>
                    <th className="p-3">Chanzo (Source)</th>
                    <th className="p-3">Mtekelezaji</th>
                    <th className="p-3">Transition ID</th>
                    <th className="p-3">Arifa Zilizotolewa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                  {diagnosticLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-stone-400">
                        Hakuna rekodi za uchunguzi wa mwenendo wa hali bado.
                      </td>
                    </tr>
                  ) : (
                    diagnosticLogs.map((diag) => (
                      <tr key={diag.id} className="hover:bg-stone-50/80">
                        <td className="p-3 text-stone-500 whitespace-nowrap">
                          {new Date(diag.timestamp).toLocaleString('sw-TZ')}
                        </td>
                        <td className="p-3 text-stone-800 font-semibold">{diag.sellerUserId}</td>
                        <td className="p-3 text-amber-800 font-bold">{diag.action}</td>
                        <td className="p-3 text-stone-600">
                          {diag.previousStatus} → <strong className="text-stone-900">{diag.nextStatus}</strong>
                        </td>
                        <td className="p-3 text-stone-600">{diag.source}</td>
                        <td className="p-3 text-stone-500">{diag.actorUserId}</td>
                        <td className="p-3 text-stone-500 max-w-xs truncate" title={diag.transitionId}>
                          {diag.transitionId}
                        </td>
                        <td className="p-3 text-stone-600">
                          {diag.notificationEventIds?.length > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                              {diag.notificationEventIds.length} arifa
                            </span>
                          ) : (
                            <span className="text-stone-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PAYMENTS TABLE */}
        {activeTab === 'payments' && (

          <div className="mt-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative max-w-md w-full">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tafuta kwa Seller ID, External ID au Namba ya Simu..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="text-xs text-stone-500 font-semibold">
                Jumla ya Miamala: <strong>{paymentIntents.length}</strong>
              </div>
            </div>

            <div className="overflow-x-auto border border-stone-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                  <tr>
                    <th className="p-3">Tarehe</th>
                    <th className="p-3">Seller ID</th>
                    <th className="p-3">Mpango (Plan)</th>
                    <th className="p-3">Mtoa Huduma</th>
                    <th className="p-3">Namba ya Simu</th>
                    <th className="p-3">Kiasi</th>
                    <th className="p-3">External ID / Ref</th>
                    <th className="p-3">Hali (Status)</th>
                    <th className="p-3">Matokeo & Kipindi</th>
                    <th className="p-3 text-right">Vitendo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {paymentIntents
                    .filter((p) =>
                      p.sellerUserId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      p.externalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (p.customerPhone && p.customerPhone.includes(searchTerm)) ||
                      (p.providerReference && p.providerReference.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-stone-400">
                        Hakuna miamala ya malipo iliyopatikana.
                      </td>
                    </tr>
                  ) : (
                    paymentIntents
                      .filter((p) =>
                        p.sellerUserId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.externalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (p.customerPhone && p.customerPhone.includes(searchTerm)) ||
                        (p.providerReference && p.providerReference.toLowerCase().includes(searchTerm.toLowerCase()))
                      )
                      .map((pay) => (
                        <tr key={pay.paymentIntentId} className="hover:bg-stone-50/80">
                          <td className="p-3 text-stone-500 whitespace-nowrap">
                            {new Date(pay.createdAt).toLocaleString('sw-TZ')}
                          </td>
                          <td className="p-3 text-stone-900 font-bold">{pay.sellerUserId}</td>
                          <td className="p-3 text-stone-700">
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[10px]">
                              {pay.plan || 'SELLER_MONTHLY'}
                            </span>
                          </td>
                          <td className="p-3 text-stone-700">
                            <span className="font-semibold">{pay.provider}</span>
                            {pay.providerNetwork && (
                              <span className="text-[10px] text-stone-500 block">
                                {pay.providerNetwork}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-stone-800 font-mono text-[11px]">{pay.customerPhone}</td>
                          <td className="p-3 font-black text-stone-900 whitespace-nowrap">
                            TSh {pay.amount.toLocaleString()} {pay.currency}
                          </td>
                          <td className="p-3 text-stone-600 max-w-xs truncate" title={pay.externalId}>
                            <span className="font-mono text-[11px] block">{pay.externalId}</span>
                            {pay.providerReference && (
                              <span className="text-[10px] text-stone-400 font-mono block">
                                Ref: {pay.providerReference}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {pay.status === 'SUCCESS' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                SUCCESS
                              </span>
                            )}
                            {(pay.status === 'PROCESSING' || pay.status === 'PENDING') && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                {pay.status}
                              </span>
                            )}
                            {(pay.status === 'FAILED' || pay.status === 'CANCELLED' || pay.status === 'EXPIRED') && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                {pay.status}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-stone-600 whitespace-nowrap">
                            {pay.resultingSellerState && (
                              <span className="font-bold text-[10px] block text-stone-800">
                                Hali: {pay.resultingSellerState}
                              </span>
                            )}
                            {pay.periodEnd ? (
                              <span className="text-[10px] text-emerald-700 block font-semibold">
                                Hadi: {new Date(pay.periodEnd).toLocaleDateString('sw-TZ')}
                              </span>
                            ) : null}
                            {pay.completedAt && (
                              <span className="text-[9px] text-stone-400 block">
                                Ilikamilika: {new Date(pay.completedAt).toLocaleTimeString('sw-TZ')}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleCheckPaymentStatus(pay.paymentIntentId)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                            >
                              Kagua Hali
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>


      {/* Selected Seller Management Drawer / Modal */}
      {selectedRecord && (
        <div className="bg-white rounded-3xl border border-stone-300 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h3 className="text-base font-black text-stone-900">
                Usimamizi wa Muuzaji: {selectedRecord.sellerUserId}
              </h3>
              <p className="text-xs text-stone-500">
                Hali ya sasa: <strong className="text-amber-800">{selectedRecord.status}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedRecord(null)}
              className="text-stone-400 hover:text-stone-700 text-sm font-bold"
            >
              Funga
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Plani</span>
              <span className="font-bold text-stone-900">{selectedRecord.plan}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Bei / Sarafu</span>
              <span className="font-bold text-stone-900">
                TSh {selectedRecord.price.toLocaleString()} {selectedRecord.currency}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Mwezi wa Bure Umeanza</span>
              <span className="font-semibold text-stone-800">{formatDate(selectedRecord.trialStartAt)}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Mwezi wa Bure Unaisha</span>
              <span className="font-semibold text-stone-800">{formatDate(selectedRecord.trialEndAt)}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Grace Period Inaisha</span>
              <span className="font-semibold text-stone-800">{formatDate(selectedRecord.graceEndAt)}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Next Renewal</span>
              <span className="font-semibold text-stone-800">{formatDate(selectedRecord.nextRenewalAt)}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Malipo ya Mwisho</span>
              <span className="font-semibold text-stone-800">
                {selectedRecord.lastPaymentStatus || 'NOT_REQUIRED'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-[10px] text-stone-500 font-bold block">Ameshatumia Trial?</span>
              <span className="font-semibold text-stone-800">
                {selectedRecord.hasHadTrial ? 'NDIYO' : 'HAPANA'}
              </span>
            </div>
          </div>

          {/* V1.10A-Corrective Section 7: Admin Grace-Period Management & Lifecycle Controls */}
          {(() => {
            const graceDaysRemaining = selectedRecord.graceEndAt
              ? Math.max(0, Math.ceil((new Date(selectedRecord.graceEndAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
              : 0;

            return (
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <h4 className="text-xs font-black text-stone-900 tracking-tight">
                      USIMAMIZI WA GRACE PERIOD NA MAJARIBIO (LIFECYCLE CONTROLS)
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    Governed: 7 Days
                  </span>
                </div>

                {/* A. Inspect Grace Details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-white border border-stone-200">
                    <span className="text-[10px] text-stone-500 font-bold block">Grace Start</span>
                    <span className="font-semibold text-stone-800">{formatDate(selectedRecord.graceStartAt)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-stone-200">
                    <span className="text-[10px] text-stone-500 font-bold block">Grace End</span>
                    <span className="font-semibold text-stone-800">{formatDate(selectedRecord.graceEndAt)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-stone-200">
                    <span className="text-[10px] text-stone-500 font-bold block">Siku Zilizobaki</span>
                    <span className={`font-black ${selectedRecord.status === 'GRACE_PERIOD' ? 'text-amber-800' : 'text-stone-700'}`}>
                      {selectedRecord.status === 'GRACE_PERIOD' ? `${graceDaysRemaining} Siku` : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-stone-200">
                    <span className="text-[10px] text-stone-500 font-bold block">Malipo Yanahitajika?</span>
                    <span className={`font-bold ${selectedRecord.status === 'GRACE_PERIOD' || selectedRecord.status === 'EXPIRED' ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {selectedRecord.status === 'GRACE_PERIOD' || selectedRecord.status === 'EXPIRED' ? 'NDIYO (TSh 1,000)' : 'HAPANA'}
                    </span>
                  </div>
                </div>

                {/* Controlled Test Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={handleSimulateGrace}
                    disabled={actionLoading || selectedRecord.status === 'SUSPENDED' || selectedRecord.status === 'GRACE_PERIOD'}
                    title="Jaribio la kiutawala: Badilisha hali kuwa GRACE_PERIOD kupitia injini rasmi ya seva"
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Simulate Grace Period (Test-Only)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSimulateExpiry}
                    disabled={actionLoading || selectedRecord.status !== 'GRACE_PERIOD'}
                    title="Jaribio la kiutawala: Maliza Grace Period na uweke EXPIRED kupitia injini rasmi ya seva"
                    className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Simulate Grace Expiry (Test-Only)</span>
                  </button>
                </div>

                <p className="text-[10px] text-stone-500 italic">
                  Ukaguzi wa Seva: Tarehe za Grace Period haziwezi kubadilishwa kiholela. Majaribio yote yanatekelezwa moja kwa moja kupitia injini rasmi ya lifecycle ya seva.
                </p>
              </div>
            );
          })()}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-stone-100">
            {selectedRecord.status !== 'SUSPENDED' ? (
              <button
                type="button"
                onClick={() => setShowSuspendModal(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
              >
                Simamisha Usajili (Suspend)
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={actionLoading}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Inarejesha...' : 'Rejesha Usajili (Reactivate)'}
              </button>
            )}

            {/* Test Payment Simulation Button */}
            <button
              type="button"
              onClick={() => setShowPaymentModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Simulate Malipo ya Mwezi (TSh 1,000)</span>
            </button>
          </div>
        </div>
      )}

      {/* Suspend Confirmation Modal */}
      {showSuspendModal && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-900">
              Kusimamisha Usajili wa Muuzaji
            </h3>
            <p className="text-xs text-stone-600">
              Muuzaji hataruhusiwa kuuza bidhaa mpya sokoni hadi atakaporejeshwa. Bidhaa zake na duka lake HAVITAFUTWA.
            </p>
            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                Sababu ya kusimamisha:
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Andika sababu hapa..."
                className="w-full p-3 rounded-xl border border-stone-200 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSuspendModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold hover:bg-stone-50 cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Inasitisha...' : 'Thibitisha Kusimamisha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Payment Simulation Modal */}
      {showPaymentModal && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-900">
              Simulate Malipo ya Usajili wa Muuzaji (V1.10A Foundation)
            </h3>
            <p className="text-xs text-stone-600">
              Kipengele hiki cha msimamizi kinajaribu uthibitisho rasmi wa seva wa malipo ya kila mwezi (TSh 1,000 TZS) bila kuunganisha mtoa huduma halisi wa malipo.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Kiasi cha Malipo (TZS):
                </label>
                <input
                  type="number"
                  value={testPaymentAmount}
                  onChange={(e) => setTestPaymentAmount(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-stone-200 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Kumbukumbu ya Muamala (Transaction Ref):
                </label>
                <input
                  type="text"
                  value={testPaymentRef}
                  onChange={(e) => setTestPaymentRef(e.target.value)}
                  placeholder="Mfano: TX_TEST_001"
                  className="w-full p-2.5 rounded-xl border border-stone-200 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold hover:bg-stone-50 cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Inathibitisha...' : 'Thibitisha Malipo (ACTIVE)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
