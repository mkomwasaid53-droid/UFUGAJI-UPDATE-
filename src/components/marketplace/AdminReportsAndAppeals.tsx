import React, { useState, useEffect } from 'react';
import {
  Flag,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  FileText,
  User,
  ShoppingBag,
  Store,
  MessageSquare,
  ArrowRight,
  RotateCcw,
  Check,
  Ban,
  AlertTriangle,
  History,
  Lock,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  ReportTargetType,
  ReportReasonCode,
  ReportStatus,
  ReportResolutionCode,
  MarketplaceReportRecord,
  AppealTargetType,
  AppealReasonCode,
  AppealStatus,
  AppealDecisionCode,
  MarketplaceAppealRecord,
  MarketplaceReportAppealAuditEntry,
  REPORT_REASON_METADATA,
  APPEAL_REASON_METADATA
} from '../../types/marketplaceReportAndAppeal';
import {
  fetchMarketplaceReports,
  reviewMarketplaceReport,
  fetchSellerAppeals,
  reviewSellerAppeal,
  fetchReportAppealAuditLogs
} from '../../services/marketplaceReportAndAppealService';

export const AdminReportsAndAppeals: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = true; // Authorized admin context

  const [activeTab, setActiveTab] = useState<'reports' | 'appeals' | 'audit'>('reports');

  // Reports state
  const [reports, setReports] = useState<MarketplaceReportRecord[]>([]);
  const [reportFilterStatus, setReportFilterStatus] = useState<string>('ALL');
  const [reportFilterTarget, setReportFilterTarget] = useState<string>('ALL');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<MarketplaceReportRecord | null>(null);

  // Appeals state
  const [appeals, setAppeals] = useState<MarketplaceAppealRecord[]>([]);
  const [appealFilterStatus, setAppealFilterStatus] = useState<string>('ALL');
  const [appealFilterTarget, setAppealFilterTarget] = useState<string>('ALL');
  const [appealSearchQuery, setAppealSearchQuery] = useState('');
  const [selectedAppeal, setSelectedAppeal] = useState<MarketplaceAppealRecord | null>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<MarketplaceReportAppealAuditEntry[]>([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // Form states for reviewing a report
  const [reportReviewStatus, setReportReviewStatus] = useState<'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [reportResolutionCode, setReportResolutionCode] = useState<ReportResolutionCode>('NO_ACTION_REQUIRED');
  const [reportResolutionText, setReportResolutionText] = useState('');
  const [reportModeratorNotes, setReportModeratorNotes] = useState('');
  const [isSubmittingReportReview, setIsSubmittingReportReview] = useState(false);

  // Form states for reviewing an appeal
  const [appealDecisionCode, setAppealDecisionCode] = useState<AppealDecisionCode>('UPHOLD_DECISION');
  const [appealDecisionText, setAppealDecisionText] = useState('');
  const [appealModeratorNotes, setAppealModeratorNotes] = useState('');
  const [appealExecuteUpdate, setAppealExecuteUpdate] = useState(true);
  const [isSubmittingAppealReview, setIsSubmittingAppealReview] = useState(false);

  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadAllData = async () => {
    if (!user?.uid) return;
    try {
      const rep = await fetchMarketplaceReports(user.uid, isAdmin);
      setReports(rep);
      const app = await fetchSellerAppeals(user.uid, isAdmin);
      setAppeals(app);
      const aud = await fetchReportAppealAuditLogs(user.uid, isAdmin);
      setAuditLogs(aud);
    } catch (err: any) {
      console.warn('Hitilafu ya kupakia data ya ripoti na rufaa:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [user?.uid]);

  // Report handling
  const handleOpenReportModal = (rep: MarketplaceReportRecord) => {
    setSelectedReport(rep);
    setReportReviewStatus(rep.status === 'OPEN' ? 'UNDER_REVIEW' : rep.status as any);
    setReportResolutionCode(rep.resolutionCode || 'NO_ACTION_REQUIRED');
    setReportResolutionText(rep.resolutionText || '');
    setReportModeratorNotes(rep.moderatorNotes || '');
  };

  const handleSubmitReportReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport || !user?.uid) return;
    setIsSubmittingReportReview(true);
    setStatusFeedback(null);
    try {
      await reviewMarketplaceReport(user.uid, user.displayName || 'Msimamizi wa Soko', isAdmin, selectedReport.reportId, {
        status: reportReviewStatus,
        resolutionCode: reportResolutionCode,
        resolutionText: reportResolutionText.trim() || undefined,
        moderatorNotes: reportModeratorNotes.trim() || undefined
      });
      setStatusFeedback({ type: 'success', message: 'Ripoti imekaguliwa na kusasishwa salama.' });
      setSelectedReport(null);
      await loadAllData();
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Hitilafu ya kukagua ripoti.' });
    } finally {
      setIsSubmittingReportReview(false);
    }
  };

  // Appeal handling
  const handleOpenAppealModal = (app: MarketplaceAppealRecord) => {
    setSelectedAppeal(app);
    setAppealDecisionCode(app.decisionCode || 'UPHOLD_DECISION');
    setAppealDecisionText(app.decisionText || '');
    setAppealModeratorNotes(app.moderatorNotes || '');
    setAppealExecuteUpdate(true);
  };

  const handleSubmitAppealReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppeal || !user?.uid) return;
    if (!appealDecisionText.trim()) {
      setStatusFeedback({ type: 'error', message: 'Tafadhali toa ufafanuzi wa uamuzi wa rufaa.' });
      return;
    }
    setIsSubmittingAppealReview(true);
    setStatusFeedback(null);
    try {
      await reviewSellerAppeal(user.uid, user.displayName || 'Msimamizi wa Soko', isAdmin, selectedAppeal.appealId, {
        decisionCode: appealDecisionCode,
        decisionText: appealDecisionText.trim(),
        moderatorNotes: appealModeratorNotes.trim() || undefined,
        executeStateUpdate: appealExecuteUpdate
      });
      setStatusFeedback({ type: 'success', message: 'Uamuzi wa rufaa umerekodiwa na kutekelezwa salama.' });
      setSelectedAppeal(null);
      await loadAllData();
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Hitilafu ya kutathmini rufaa.' });
    } finally {
      setIsSubmittingAppealReview(false);
    }
  };

  // Filtered lists
  const filteredReports = reports.filter((r) => {
    if (reportFilterStatus !== 'ALL' && r.status !== reportFilterStatus) return false;
    if (reportFilterTarget !== 'ALL' && r.targetType !== reportFilterTarget) return false;
    if (reportSearchQuery.trim()) {
      const q = reportSearchQuery.toLowerCase();
      return (
        r.targetId.toLowerCase().includes(q) ||
        r.reporterUserId.toLowerCase().includes(q) ||
        (r.sellerId && r.sellerId.toLowerCase().includes(q)) ||
        (r.reasonText && r.reasonText.toLowerCase().includes(q)) ||
        r.reasonCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredAppeals = appeals.filter((a) => {
    if (appealFilterStatus !== 'ALL' && a.status !== appealFilterStatus) return false;
    if (appealFilterTarget !== 'ALL' && a.targetType !== appealFilterTarget) return false;
    if (appealSearchQuery.trim()) {
      const q = appealSearchQuery.toLowerCase();
      return (
        a.appealId.toLowerCase().includes(q) ||
        a.targetId.toLowerCase().includes(q) ||
        a.sellerId.toLowerCase().includes(q) ||
        a.reasonText.toLowerCase().includes(q) ||
        a.reasonCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredAuditLogs = auditLogs.filter((l) => {
    if (!auditSearchQuery.trim()) return true;
    const q = auditSearchQuery.toLowerCase();
    return (
      l.auditId.toLowerCase().includes(q) ||
      l.targetId.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.performedByName.toLowerCase().includes(q)
    );
  });

  // Metric counts
  const openReportsCount = reports.filter((r) => r.status === 'OPEN').length;
  const underReviewReportsCount = reports.filter((r) => r.status === 'UNDER_REVIEW').length;
  const submittedAppealsCount = appeals.filter((a) => a.status === 'SUBMITTED').length;
  const underReviewAppealsCount = appeals.filter((a) => a.status === 'UNDER_REVIEW').length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-stone-900">
                Ripoti na Rufaa za Soko (V1.7F)
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                Governance Layer
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Usimamizi salama, unaofuatika na wa haki wa malalamiko ya watumiaji na rufaa za wauzaji.
            </p>
          </div>
        </div>

        {/* Core Principles Pill */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            Ripoti ni taarifa, si ushahidi
          </span>
          <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            Uamuzi wa kibinadamu (No AI Bans)
          </span>
        </div>
      </div>

      {/* Global Status Feedback */}
      {statusFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-stone-400 hover:text-stone-600 cursor-pointer text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Ripoti za Watumiaji (Reports)</span>
          {openReportsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-black">
              {openReportsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('appeals')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'appeals'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Rufaa za Wauzaji (Appeals)</span>
          {submittedAppealsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-black">
              {submittedAppealsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Ukaguzi na Kumbukumbu (Audit Trail)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. REPORTS TAB                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-semibold text-stone-500">Jumla ya Ripoti</span>
              <p className="text-xl font-bold text-stone-900 mt-0.5">{reports.length}</p>
            </div>
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-rose-800">Mpya Zilizofunguliwa</span>
              <p className="text-xl font-bold text-rose-950 mt-0.5">{openReportsCount}</p>
            </div>
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-amber-800">Chini ya Ukaguzi</span>
              <p className="text-xl font-bold text-amber-950 mt-0.5">{underReviewReportsCount}</p>
            </div>
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-emerald-800">Zilizotatuliwa</span>
              <p className="text-xl font-bold text-emerald-950 mt-0.5">
                {reports.filter((r) => r.status === 'RESOLVED' || r.status === 'DISMISSED').length}
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Tafuta ID ya tangazo, muuzaji au maelezo..."
                  value={reportSearchQuery}
                  onChange={(e) => setReportSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <select
                value={reportFilterStatus}
                onChange={(e) => setReportFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl font-semibold text-stone-700"
              >
                <option value="ALL">Hali Zote (All Status)</option>
                <option value="OPEN">Mpya (Open)</option>
                <option value="UNDER_REVIEW">Inakaguliwa (Under Review)</option>
                <option value="RESOLVED">Imetatuliwa (Resolved)</option>
                <option value="DISMISSED">Imetupiliwa Mbali (Dismissed)</option>
              </select>

              <select
                value={reportFilterTarget}
                onChange={(e) => setReportFilterTarget(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl font-semibold text-stone-700"
              >
                <option value="ALL">Walengwa Wote (All Targets)</option>
                <option value="PRODUCT">Bidhaa (Product)</option>
                <option value="LISTING">Tangazo (Listing)</option>
                <option value="SHOP">Duka (Shop)</option>
                <option value="SELLER">Muuzaji (Seller)</option>
                <option value="REVIEW">Tathmini (Review)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={loadAllData}
              className="text-stone-600 hover:text-stone-900 text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Pakia Upya</span>
            </button>
          </div>

          {/* Reports List */}
          {filteredReports.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 text-stone-500 space-y-1">
              <Flag className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">Hakuna ripoti zilizopatikana kwenye vigezo hivi.</p>
              <p className="text-xs">Watumiaji hawajaripoti maudhui yoyote au vichungi vimeweka masharti finyu.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((rep) => {
                const meta = REPORT_REASON_METADATA[rep.reasonCode] || {
                  sw: rep.reasonCode,
                  description: ''
                };
                return (
                  <div
                    key={rep.reportId}
                    className="p-4 bg-white border border-stone-200 hover:border-amber-400 rounded-2xl shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            rep.status === 'OPEN'
                              ? 'bg-rose-100 text-rose-800'
                              : rep.status === 'UNDER_REVIEW'
                              ? 'bg-amber-100 text-amber-800'
                              : rep.status === 'RESOLVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {rep.status}
                        </span>

                        <span className="px-2 py-0.5 bg-stone-100 text-stone-700 text-[10px] font-bold rounded-md">
                          Lengo: {rep.targetType}
                        </span>

                        <span className="text-[11px] text-stone-400 font-mono">
                          ID: {rep.targetId.substring(0, 18)}...
                        </span>

                        <span className="text-[10px] text-stone-400 ml-auto">
                          {new Date(rep.createdAt).toLocaleString('sw-TZ')}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-stone-900">{meta.sw}</h4>
                        <p className="text-xs text-stone-600 line-clamp-2 bg-stone-50 p-2 rounded-xl border border-stone-200/60 italic">
                          "{rep.reasonText}"
                        </p>
                      </div>

                      {rep.resolutionText && (
                        <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span><strong>Uamuzi:</strong> {rep.resolutionText}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
                      <button
                        type="button"
                        onClick={() => handleOpenReportModal(rep)}
                        className="px-3.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Kagua Ripoti</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. APPEALS TAB                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'appeals' && (
        <div className="space-y-4">
          {/* Appeals metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-semibold text-stone-500">Jumla ya Rufaa</span>
              <p className="text-xl font-bold text-stone-900 mt-0.5">{appeals.length}</p>
            </div>
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-amber-800">Zilizowasilishwa</span>
              <p className="text-xl font-bold text-amber-950 mt-0.5">{submittedAppealsCount}</p>
            </div>
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-emerald-800">Zilizokubaliwa</span>
              <p className="text-xl font-bold text-emerald-950 mt-0.5">
                {appeals.filter((a) => a.status === 'ACCEPTED' || a.status === 'PARTIALLY_ACCEPTED').length}
              </p>
            </div>
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl shadow-xs">
              <span className="text-[11px] font-bold text-stone-700">Zilizokataliwa/Ondolewa</span>
              <p className="text-xl font-bold text-stone-900 mt-0.5">
                {appeals.filter((a) => a.status === 'REJECTED' || a.status === 'WITHDRAWN').length}
              </p>
            </div>
          </div>

          {/* Appeal Filter Bar */}
          <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Tafuta ID ya rufaa, muuzaji au maelezo..."
                  value={appealSearchQuery}
                  onChange={(e) => setAppealSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <select
                value={appealFilterStatus}
                onChange={(e) => setAppealFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl font-semibold text-stone-700"
              >
                <option value="ALL">Hali Zote za Rufaa</option>
                <option value="SUBMITTED">Mpya (Submitted)</option>
                <option value="UNDER_REVIEW">Inakaguliwa (Under Review)</option>
                <option value="ACCEPTED">Imekubaliwa (Accepted)</option>
                <option value="PARTIALLY_ACCEPTED">Sehemu Imekubaliwa</option>
                <option value="REJECTED">Imekataliwa (Rejected)</option>
                <option value="WITHDRAWN">Imeondolewa na Muuzaji</option>
              </select>

              <select
                value={appealFilterTarget}
                onChange={(e) => setAppealFilterTarget(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl font-semibold text-stone-700"
              >
                <option value="ALL">Maamuzi Yote (All Decisions)</option>
                <option value="MODERATION_DECISION">Ukaguzi wa Tangazo</option>
                <option value="SELLER_WARNING">Onyo la Muuzaji</option>
                <option value="SELLER_RESTRICTION">Kizuizi cha Muuzaji</option>
              </select>
            </div>

            <button
              type="button"
              onClick={loadAllData}
              className="text-stone-600 hover:text-stone-900 text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Pakia Upya</span>
            </button>
          </div>

          {/* Appeals List */}
          {filteredAppeals.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 text-stone-500 space-y-1">
              <Scale className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">Hakuna rufaa zilizopatikana kwenye vigezo hivi.</p>
              <p className="text-xs">Hakuna muuzaji aliyewasilisha rufaa au vichungi vimebanwa.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAppeals.map((app) => {
                const meta = APPEAL_REASON_METADATA[app.reasonCode] || {
                  sw: app.reasonCode,
                  description: ''
                };
                return (
                  <div
                    key={app.appealId}
                    className="p-4 bg-white border border-stone-200 hover:border-amber-400 rounded-2xl shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            app.status === 'SUBMITTED'
                              ? 'bg-amber-100 text-amber-800'
                              : app.status === 'UNDER_REVIEW'
                              ? 'bg-blue-100 text-blue-800'
                              : app.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : app.status === 'PARTIALLY_ACCEPTED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : app.status === 'WITHDRAWN'
                              ? 'bg-stone-100 text-stone-600'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {app.status}
                        </span>

                        <span className="px-2 py-0.5 bg-stone-100 text-stone-700 text-[10px] font-bold rounded-md">
                          Lengo: {app.targetType}
                        </span>

                        <span className="text-[11px] text-stone-400 font-mono">
                          Muuzaji: {app.sellerId.substring(0, 14)}...
                        </span>

                        <span className="text-[10px] text-stone-400 ml-auto">
                          {new Date(app.submittedAt).toLocaleString('sw-TZ')}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-stone-900">{meta.sw}</h4>
                        <p className="text-xs text-stone-600 line-clamp-2 bg-stone-50 p-2 rounded-xl border border-stone-200/60 italic">
                          "{app.reasonText}"
                        </p>
                      </div>

                      {app.decisionText && (
                        <div className="text-[11px] text-stone-800 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span><strong>Uamuzi wa Wasimamizi:</strong> {app.decisionText}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
                      <button
                        type="button"
                        onClick={() => handleOpenAppealModal(app)}
                        className="px-3.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>Tathmini Rufaa</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AUDIT TRAIL TAB                                                        */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Tafuta kitendo, mtumiaji au ID ya uamuzi..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-stone-500">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span>Kumbukumbu hizi zinalindwa na haziwezi kurekebishwa wala kufutwa (Append-Only).</span>
            </div>
          </div>

          {filteredAuditLogs.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 text-stone-500">
              <History className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-semibold">Hakuna kumbukumbu za ukaguzi zilizopatikana.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAuditLogs.map((log) => (
                <div
                  key={log.auditId}
                  className="p-3 bg-white border border-stone-200 rounded-xl text-xs space-y-1.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded-md font-mono text-[11px]">
                      {log.action}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {new Date(log.performedAt).toLocaleString('sw-TZ')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-stone-600 text-[11px]">
                    <span>Aliyefanya: <strong className="text-stone-800">{log.performedByName}</strong> ({log.performedBy.substring(0, 10)}...)</span>
                    <span>Lengo: <strong className="text-stone-800">{log.targetType}</strong> ({log.targetId.substring(0, 16)}...)</span>
                    {log.sellerId && <span>Muuzaji: <strong className="text-stone-800">{log.sellerId.substring(0, 10)}...</strong></span>}
                  </div>

                  {log.reasonText && (
                    <p className="text-[11px] text-stone-700 bg-stone-50 p-2 rounded-lg border border-stone-200/60">
                      Maelezo: {log.reasonText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* REVIEW REPORT MODAL (ADMIN)                                               */}
      {/* ========================================================================= */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-70 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 flex items-center justify-center shrink-0">
                  <Flag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Kagua Ripoti ya Mtumiaji
                  </h3>
                  <p className="text-xs text-stone-500">
                    Lengo: <strong className="text-stone-800">{selectedReport.targetType}</strong> • ID: {selectedReport.targetId.substring(0, 16)}...
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Target Information */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-600">Sababu Iliyoripotiwa:</span>
                <span className="font-bold text-rose-900 bg-rose-100 px-2 py-0.5 rounded-md text-[11px]">
                  {selectedReport.reasonCode}
                </span>
              </div>
              <p className="text-stone-800 bg-white p-2 rounded-lg border border-stone-200/70 italic">
                "{selectedReport.reasonText}"
              </p>
              <div className="text-[11px] text-stone-500 pt-1 flex items-center justify-between">
                <span>Mtoa Ripoti (UID): {selectedReport.reporterUserId.substring(0, 16)}... (Protected)</span>
                <span>Tarehe: {new Date(selectedReport.createdAt).toLocaleDateString('sw-TZ')}</span>
              </div>
            </div>

            {/* Review Form */}
            <form onSubmit={handleSubmitReportReview} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-800 block">
                  Badilisha Hali ya Ripoti:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportReviewStatus('UNDER_REVIEW')}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      reportReviewStatus === 'UNDER_REVIEW'
                        ? 'bg-amber-100 border-amber-400 text-amber-900'
                        : 'bg-white border-stone-200 text-stone-600'
                    }`}
                  >
                    Inakaguliwa
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportReviewStatus('RESOLVED')}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      reportReviewStatus === 'RESOLVED'
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                        : 'bg-white border-stone-200 text-stone-600'
                    }`}
                  >
                    Imetatuliwa
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportReviewStatus('DISMISSED')}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      reportReviewStatus === 'DISMISSED'
                        ? 'bg-stone-200 border-stone-400 text-stone-900'
                        : 'bg-white border-stone-200 text-stone-600'
                    }`}
                  >
                    Tupilia Mbali
                  </button>
                </div>
              </div>

              {reportReviewStatus !== 'UNDER_REVIEW' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-800 block">
                    Kanuni ya Utatuzi (Resolution Code):
                  </label>
                  <select
                    value={reportResolutionCode}
                    onChange={(e) => setReportResolutionCode(e.target.value as ReportResolutionCode)}
                    className="w-full text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="NO_ACTION_REQUIRED">Hakuna Hatua Iliyohitajika (No Action Required)</option>
                    <option value="LISTING_MODERATED">Tangazo Limefanyiwa Ukaguzi (Listing Moderated)</option>
                    <option value="SELLER_WARNED">Muuzaji Ametumiwa Onyo (Seller Warned)</option>
                    <option value="SELLER_RESTRICTED">Muuzaji Amewekewa Kizuizi (Seller Restricted)</option>
                    <option value="DISMISSED_INVALID">Imetupiliwa: Malalamiko Si Sahihi</option>
                    <option value="DISMISSED_DUPLICATE">Imetupiliwa: Ripoti ya Marudio</option>
                    <option value="DISMISSED_INSUFFICIENT_EVIDENCE">Imetupiliwa: Ushahidi Haukutosha</option>
                    <option value="OTHER">Sababu Nyingine</option>
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-800 block">
                  Ufafanuzi wa Utatuzi (Unaoonekana kwa Mtoa Ripoti):
                </label>
                <textarea
                  value={reportResolutionText}
                  onChange={(e) => setReportResolutionText(e.target.value)}
                  placeholder="Eleza hatua iliyochukuliwa au matokeo ya ukaguzi kwa mtoa ripoti..."
                  rows={2}
                  className="w-full text-xs text-stone-800 bg-white border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-800 block flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-stone-500" />
                  Kumbukumbu za Ndani ya Wasimamizi (Private Internal Notes):
                </label>
                <textarea
                  value={reportModeratorNotes}
                  onChange={(e) => setReportModeratorNotes(e.target.value)}
                  placeholder="Maelezo ya ndani ya wasimamizi (hayaonekani kwa watumiaji wala wauzaji)..."
                  rows={2}
                  className="w-full text-xs text-stone-800 bg-stone-50 border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  disabled={isSubmittingReportReview}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 rounded-xl transition-colors cursor-pointer"
                >
                  Funga
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReportReview}
                  className="px-4 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmittingReportReview ? 'Inasasisha...' : 'Thibitisha Ukaguzi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REVIEW APPEAL MODAL (ADMIN)                                               */}
      {/* ========================================================================= */}
      {selectedAppeal && (
        <div
          className="fixed inset-0 z-70 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setSelectedAppeal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Tathmini ya Rufaa ya Muuzaji
                  </h3>
                  <p className="text-xs text-stone-500">
                    Muuzaji: {selectedAppeal.sellerId.substring(0, 16)}... • Lengo: {selectedAppeal.targetType}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppeal(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Context Card */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-600">Sababu ya Rufaa:</span>
                <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md text-[11px]">
                  {selectedAppeal.reasonCode}
                </span>
              </div>
              <p className="text-stone-800 bg-white p-2.5 rounded-lg border border-stone-200/70 italic leading-relaxed">
                "{selectedAppeal.reasonText}"
              </p>
              <div className="text-[11px] text-stone-500 pt-1 flex items-center justify-between">
                <span>Uamuzi unaolengwa: {selectedAppeal.targetId.substring(0, 16)}...</span>
                <span>Tarehe: {new Date(selectedAppeal.submittedAt).toLocaleDateString('sw-TZ')}</span>
              </div>
            </div>

            {/* Appeal Form */}
            <form onSubmit={handleSubmitAppealReview} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-800 block">
                  Uamuzi wa Wasimamizi (Appeal Decision Code):
                </label>
                <select
                  value={appealDecisionCode}
                  onChange={(e) => setAppealDecisionCode(e.target.value as AppealDecisionCode)}
                  className="w-full text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="REVERSE_DECISION">Kubali Rufaa & Futa Hatua (Reverse Decision)</option>
                  <option value="PARTIALLY_REVERSE">Kubali Sehemu ya Rufaa (Partially Reverse)</option>
                  <option value="REQUEST_CORRECTION">Omba Marekebisho Zaidi (Request Correction)</option>
                  <option value="UPHOLD_DECISION">Dumisha Uamuzi / Kataa Rufaa (Uphold Decision)</option>
                  <option value="NO_ACTION">Hakuna Hatua Iliyobadilishwa (No Action)</option>
                </select>
              </div>

              {/* Execution Checkbox */}
              {appealDecisionCode === 'REVERSE_DECISION' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1 text-emerald-900">
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={appealExecuteUpdate}
                      onChange={(e) => setAppealExecuteUpdate(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Tekeleza Mabadiliko Mara Moja (Auto-Revoke / Auto-Restore)</span>
                  </label>
                  <p className="text-[11px] text-emerald-700 pl-5">
                    Hii itafuta onyo/kizuizi au kurejesha tangazo lililokataliwa kwenye mfumo kiotomatiki kwa ushahidi wa rufaa hii.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-800 block">
                  Ufafanuzi wa Uamuzi (Unaoonekana kwa Muuzaji):
                </label>
                <textarea
                  value={appealDecisionText}
                  onChange={(e) => setAppealDecisionText(e.target.value)}
                  placeholder="Eleza sababu za kukubali au kukataa rufaa hii kwa muuzaji..."
                  rows={3}
                  required
                  className="w-full text-xs text-stone-800 bg-white border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-800 block flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-stone-500" />
                  Kumbukumbu za Ndani ya Wasimamizi (Private Internal Notes):
                </label>
                <textarea
                  value={appealModeratorNotes}
                  onChange={(e) => setAppealModeratorNotes(e.target.value)}
                  placeholder="Maelezo ya siri ya timu ya usimamizi kuhusu rufaa hii..."
                  rows={2}
                  className="w-full text-xs text-stone-800 bg-stone-50 border border-stone-300 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedAppeal(null)}
                  disabled={isSubmittingAppealReview}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 rounded-xl transition-colors cursor-pointer"
                >
                  Funga
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAppealReview || !appealDecisionText.trim()}
                  className="px-4 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>{isSubmittingAppealReview ? 'Inathibitisha...' : 'Wasilisha Uamuzi wa Rufaa'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
