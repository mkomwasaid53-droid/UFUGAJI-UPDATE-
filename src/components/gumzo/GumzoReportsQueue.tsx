import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Flag,
  CheckCircle2,
  XCircle,
  Clock,
  EyeOff,
  Trash2,
  UserX,
  Filter,
  RefreshCw,
  Loader2,
  FileText,
  Search,
  ExternalLink,
  Info
} from 'lucide-react';
import {
  GumzoReportRecord,
  GumzoReportStatus,
  GumzoReportReason,
  GumzoReportAction,
  GUMZO_REPORT_REASONS,
  GumzoGroup
} from '../../types/gumzo';
import { useAuth } from '../../context/AuthContext';
import { gumzoEnforcementService } from '../../services/gumzoEnforcementService';

interface GumzoReportsQueueProps {
  groupId?: string; // Optional: when provided, strictly locks to this group (e.g. for Founder Admin)
  groupName?: string;
  isFounderAdmin?: boolean;
}

export const GumzoReportsQueue: React.FC<GumzoReportsQueueProps> = ({
  groupId,
  groupName,
  isFounderAdmin = false
}) => {
  const { user, isAdmin } = useAuth();
  const currentUserId = user?.uid || 'admin';

  const [reports, setReports] = useState<GumzoReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<GumzoReportStatus | 'ALL'>('ALL');
  const [reasonFilter, setReasonFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Resolution modal state
  const [selectedReport, setSelectedReport] = useState<GumzoReportRecord | null>(null);
  const [resolutionAction, setResolutionAction] = useState<GumzoReportAction>('NONE');
  const [internalNotes, setInternalNotes] = useState<string>('');
  const [publicReason, setPublicReason] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (groupId) params.append('groupId', groupId);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const token = user ? await user.getIdToken().catch(() => null) : null;
      const headers: Record<string, string> = {
        'x-user-id': currentUserId,
        'x-is-admin': isAdmin ? 'true' : 'false'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let data: GumzoReportRecord[] = [];
      try {
        const res = await fetch(`/api/gumzo/admin/reports?${params.toString()}`, {
          method: 'GET',
          headers
        });

        if (res.ok) {
          data = await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kupakia ripoti.');
        }
      } catch (netErr: any) {
        // Fallback to in-memory / local enforcement service
        data = gumzoEnforcementService.getAdminReports({
          actingAdminUserId: currentUserId,
          isPlatformAdmin: isAdmin,
          groupId,
          status: statusFilter === 'ALL' ? undefined : statusFilter
        });
      }

      setReports(data || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu ya kupakia ripoti za Gumzo.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [groupId, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: reports.length,
      open: reports.filter((r) => r.status === 'OPEN').length,
      underReview: reports.filter((r) => r.status === 'UNDER_REVIEW').length,
      actionTaken: reports.filter((r) => r.status === 'ACTION_TAKEN').length,
      dismissed: reports.filter((r) => r.status === 'DISMISSED').length
    };
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (reasonFilter !== 'ALL' && r.reason !== reasonFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTarget = r.targetId.toLowerCase().includes(q);
        const matchesReporter = (r.reporterDisplayName || r.reporterUserId || '').toLowerCase().includes(q);
        const matchesDetails = (r.details || '').toLowerCase().includes(q);
        if (!matchesTarget && !matchesReporter && !matchesDetails) return false;
      }
      return true;
    });
  }, [reports, reasonFilter, searchQuery]);

  const handleOpenResolutionModal = (report: GumzoReportRecord, action: GumzoReportAction) => {
    setSelectedReport(report);
    setResolutionAction(action);
    setResolveError(null);
    setInternalNotes('');
    setPublicReason(
      action === 'CONTENT_HIDDEN'
        ? 'Maudhui yamefichwa kufuatia mapitio ya ripoti ya jumuiya.'
        : action === 'CONTENT_REMOVED'
        ? 'Maudhui yameondolewa kufuatia ukiukwaji wa miongozo ya jamii.'
        : action === 'MEMBER_SUSPENDED'
        ? 'Uanachama umesimamishwa kwa muda kufuatia ukiukwaji wa mara kwa mara.'
        : 'Ripoti imekaguliwa na kutupiliwa mbali bila hatua za adhabu.'
    );
  };

  const handleExecuteResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;

    if (!internalNotes.trim()) {
      setResolveError('Tafadhali andika maelezo ya ndani (internal note) ya uamuzi huu.');
      return;
    }

    try {
      setIsResolving(true);
      setResolveError(null);

      const token = user ? await user.getIdToken().catch(() => null) : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-user-id': currentUserId,
        'x-is-admin': isAdmin ? 'true' : 'false'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let updatedReport: GumzoReportRecord;
      try {
        const res = await fetch(`/api/gumzo/admin/reports/${selectedReport.reportId}/resolve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: resolutionAction,
            internalNotes: internalNotes.trim(),
            publicReason: publicReason.trim() || undefined
          })
        });

        if (res.ok) {
          updatedReport = await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kutekeleza uamuzi wa ripoti.');
        }
      } catch (netErr: any) {
        // Fallback to direct service
        updatedReport = await gumzoEnforcementService.resolveReport({
          input: {
            reportId: selectedReport.reportId,
            action: resolutionAction,
            internalNotes: internalNotes.trim(),
            publicReason: publicReason.trim() || undefined
          },
          actingAdminUserId: currentUserId,
          isPlatformAdmin: isAdmin
        });
      }

      setReports((prev) =>
        prev.map((r) => (r.reportId === updatedReport.reportId ? updatedReport : r))
      );

      setSuccessMsg(`Hatua ya ripoti ${selectedReport.reportId} imetekelezwa kikamilifu.`);
      setSelectedReport(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setResolveError(err.message || 'Hitilafu wakati wa kutekeleza uamuzi.');
    } finally {
      setIsResolving(false);
    }
  };

  const getReasonLabel = (code: string) => {
    const r = GUMZO_REPORT_REASONS.find((item) => item.code === code);
    return r ? r.labelSwahili : code;
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-900 text-base flex items-center gap-2">
                <span>Foleni ya Ripoti za Jamii (Gumzo Reports Queue)</span>
                {isFounderAdmin && (
                  <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                    Founder Admin Scoped
                  </span>
                )}
              </h3>
              <p className="text-xs text-stone-500">
                {groupId
                  ? `Usimamizi wa ripoti za wanachama katika kikundi: ${groupName || groupId}`
                  : 'Ukaguzi wa ripoti za wanachama katika vikundi vyote vya Gumzo'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadReports}
            disabled={isLoading}
            className="self-start sm:self-auto px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Onyesha Upya</span>
          </button>
        </div>

        {/* Counter cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            <span className="text-[11px] block font-medium opacity-80">Ripoti Zote</span>
            <span className="text-lg font-extrabold">{counts.total}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('OPEN')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'OPEN'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/70'
            }`}
          >
            <span className="text-[11px] block font-medium opacity-80">Mpya (OPEN)</span>
            <span className="text-lg font-extrabold text-amber-900 group-hover:text-amber-950">
              {counts.open}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ACTION_TAKEN')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'ACTION_TAKEN'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <span className="text-[11px] block font-medium opacity-80">Zilizoshughulikiwa</span>
            <span className="text-lg font-extrabold">{counts.actionTaken}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('DISMISSED')}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'DISMISSED'
                ? 'bg-stone-600 text-white border-stone-600 shadow-xs'
                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
            }`}
          >
            <span className="text-[11px] block font-medium opacity-80">Zilizotupiliwa Mbali</span>
            <span className="text-lg font-extrabold">{counts.dismissed}</span>
          </button>
        </div>

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-stone-100 text-xs">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Tafuta kwa neno au ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-amber-600 focus:bg-white transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full sm:w-auto py-2 px-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-700 focus:outline-none focus:border-amber-600"
            >
              <option value="ALL">Sababu Zote za Ripoti</option>
              {GUMZO_REPORT_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.labelSwahili} ({r.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Success alert */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-stone-400 hover:text-stone-700 text-xs font-bold px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Error alert */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Reports List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Inapakia foleni ya ripoti za Gumzo...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-stone-200 border-dashed space-y-2">
          <ShieldCheck className="w-8 h-8 mx-auto text-emerald-600" />
          <h4 className="font-bold text-stone-800 text-sm">Hakuna Ripoti Katika Kigezo Hiki</h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Jamii ya Gumzo iko salama. Hakuna ripoti mpya zinazosubiri ukaguzi kwa sasa.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <div
              key={report.reportId}
              className={`p-4 rounded-2xl border transition-all text-xs bg-white space-y-3 ${
                report.status === 'OPEN'
                  ? 'border-amber-300 shadow-xs ring-1 ring-amber-100'
                  : 'border-stone-200/90 hover:border-stone-300'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] font-bold text-stone-500">
                    #{report.reportId.slice(-8)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                    report.status === 'OPEN'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : report.status === 'ACTION_TAKEN'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}>
                    {report.status}
                  </span>

                  <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-semibold text-[10px]">
                    {report.targetType === 'POST' ? 'Chapisho (Post)' : 'Maoni (Comment)'}
                  </span>

                  <span className="text-[11px] text-stone-400">·</span>
                  <span className="text-[11px] text-stone-500">
                    Kikundi: <strong className="text-stone-700">{report.groupId}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(report.createdAt).toLocaleString('sw-TZ')}</span>
                </div>
              </div>

              {/* Report Reason & Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-stone-50/70 p-3 rounded-xl border border-stone-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    Sababu ya Ripoti
                  </span>
                  <p className="font-bold text-stone-900 text-xs flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5 text-amber-600" />
                    <span>{getReasonLabel(report.reason)}</span>
                  </p>
                  {report.details ? (
                    <p className="text-[11px] text-stone-600 mt-1 italic whitespace-pre-wrap">
                      "{report.details}"
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-400 mt-1 italic">
                      (Hakuna maelezo ya ziada yaliyotolewa na mwanachama)
                    </p>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    Wahusika wa Ripoti (Protected Metadata)
                  </span>
                  <p className="text-[11px] text-stone-600">
                    Mtoa Ripoti: <strong className="text-stone-800">{report.reporterDisplayName || 'Mwanachama'}</strong>{' '}
                    <span className="text-stone-400">({report.reporterUserId.slice(-6)})</span>
                  </p>
                  <p className="text-[11px] text-stone-600 mt-0.5">
                    Mwandishi wa Maudhui: <strong className="text-stone-800">{report.targetAuthorUserId}</strong>
                  </p>
                </div>
              </div>

              {/* Resolution Info if already resolved */}
              {report.status !== 'OPEN' && report.reviewedAt && (
                <div className="p-3 bg-stone-100/70 rounded-xl border border-stone-200 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-600">
                    <span className="font-bold">
                      Uamuzi: <span className="text-stone-900">{report.actionTaken}</span>
                    </span>
                    <span>
                      Ilikaguliwa: {new Date(report.reviewedAt).toLocaleString('sw-TZ')} na {report.reviewedByRole || 'Admin'}
                    </span>
                  </div>
                  {report.internalNotes && (
                    <p className="text-[11px] text-stone-500 italic">
                      Maelezo ya ndani: {report.internalNotes}
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons (Only for OPEN or UNDER_REVIEW reports) */}
              {(report.status === 'OPEN' || report.status === 'UNDER_REVIEW') && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => handleOpenResolutionModal(report, 'NONE')}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Tupilia Mbali (Dismiss)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenResolutionModal(report, 'CONTENT_HIDDEN')}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Ficha Maudhui</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenResolutionModal(report, 'CONTENT_REMOVED')}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ondoa Maudhui (Remove)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenResolutionModal(report, 'MEMBER_SUSPENDED')}
                    className="px-3 py-1.5 bg-rose-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Simamisha Mwanachama</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolution Confirmation Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-stone-200 flex flex-col">
            <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Tekeleza Hatua ya Usimamizi (Admin Action)
                  </h3>
                  <p className="text-xs text-stone-500">
                    Ripoti #{selectedReport.reportId.slice(-8)} · {selectedReport.targetType}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteResolution} className="p-5 space-y-4">
              {resolveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{resolveError}</span>
                </div>
              )}

              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1">
                <span className="font-bold">Hatua Iliyochaguliwa:</span>{' '}
                <strong className="uppercase">{resolutionAction}</strong>
                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                  Hatua hii itarekodiwa kwenye daftari lisilobadilika la ukaguzi (Audit Log) na itatuma taarifa kwa wahusika bila kufichua utambulisho wa mtoa ripoti.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-800">
                  Maelezo ya Ndani ya Usimamizi (Mandatory Internal Notes)
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  required
                  placeholder="Eleza sababu ya uamuzi huu kwa madhumuni ya ukaguzi wa ndani..."
                  className="w-full text-xs border border-stone-300 rounded-xl p-3 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-800">
                  Sababu kwa Umma / Mhusika (Public Notice)
                </label>
                <input
                  type="text"
                  value={publicReason}
                  onChange={(e) => setPublicReason(e.target.value)}
                  placeholder="Sababu itakayoonekana kwa mhusika (bila kuathiri usalama wa mtoa ripoti)"
                  className="w-full text-xs border border-stone-300 rounded-xl p-3 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  disabled={isResolving}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
                >
                  Ghairi
                </button>
                <button
                  type="submit"
                  disabled={isResolving}
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Thibitisha Hatua</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
