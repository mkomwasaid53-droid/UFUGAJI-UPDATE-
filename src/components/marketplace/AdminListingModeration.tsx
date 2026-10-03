/**
 * V1.7D — Admin Marketplace Listing Moderation Component
 * Phase 6: Marketplace Governance
 *
 * Core Principles:
 * 1. Admin Moderation is a GOVERNANCE layer.
 * 2. Only authorized admins can access.
 * 3. AI classification is advisory only; cannot moderate or verify.
 * 4. Approval does NOT verify seller, product authenticity, or medical safety.
 * 5. Actions produce append-only immutable audit logs.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ModerationQueueItem,
  ModerationQueueFilter,
  ModerationStatus,
  ModerationPriority,
  MarketplaceModerationAuditEntry
} from '../../types/marketplaceModeration';
import {
  fetchModerationQueue,
  performModerationAction,
  fetchModerationAuditLogs
} from '../../services/marketplaceModerationService';
import { ListingModerationDetailModal } from './ListingModerationDetailModal';
import { ListingModerationActionModal } from './ListingModerationActionModal';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Flag,
  Sparkles,
  Eye,
  History,
  Info,
  Layers,
  FileText,
  AlertCircle,
  ChevronRight,
  UserCheck
} from 'lucide-react';

export const AdminListingModeration: React.FC = () => {
  const { user, isAdmin } = useAuth();

  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<ModerationQueueFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected item for detail view
  const [selectedItem, setSelectedItem] = useState<ModerationQueueItem | null>(null);

  // Action modal state
  const [actionItem, setActionItem] = useState<ModerationQueueItem | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | 'CORRECTION' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'ESCALATE' | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Audit history modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<MarketplaceModerationAuditEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Load Queue Data
  const loadQueue = async () => {
    if (!user?.uid || !isAdmin) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const items = await fetchModerationQueue(user.uid, isAdmin, filter, searchTerm);
      setQueue(items);
    } catch (err: any) {
      console.error('Hitilafu ya kupakia foleni ya ukaguzi:', err);
      setFeedback({ type: 'error', text: err.message || 'Haikuweza kupakia foleni ya ukaguzi wa matangazo.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [user?.uid, isAdmin, filter]);

  // Handle Search Debounce / Trigger
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadQueue();
  };

  // Open Action Modal from list or detail modal
  const handleTriggerAction = (
    item: ModerationQueueItem,
    type: 'APPROVE' | 'REJECT' | 'CORRECTION' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'ESCALATE'
  ) => {
    setActionItem(item);
    setActionType(type);
  };

  // Submit Action Execution
  const handleExecuteAction = async (params: any) => {
    if (!user?.uid || !isAdmin || !actionItem) return;
    setIsProcessingAction(true);
    setFeedback(null);

    try {
      const result = await performModerationAction(
        user.uid,
        user.displayName || user.email || 'Msimamizi wa Soko',
        isAdmin,
        {
          targetProductId: actionItem.product.productId,
          ...params
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Hatua ya ukaguzi ilishindwa kutekelezwa.');
      }

      setFeedback({
        type: 'success',
        text: `Hatua "${params.action}" imetekelezwa kikamilifu kwa tangazo "${actionItem.product.title}".`
      });

      // Close action modal and refresh item
      setActionItem(null);
      setActionType(null);
      if (selectedItem?.product.productId === actionItem.product.productId) {
        setSelectedItem(null);
      }

      await loadQueue();
    } catch (err: any) {
      console.error('Hitilafu ya kutekeleza moderation action:', err);
      setFeedback({ type: 'error', text: err.message || 'Hitilafu ya utekelezaji wa hatua ya ukaguzi.' });
      throw err;
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Open Audit Log Modal
  const handleOpenAuditLog = async () => {
    if (!user?.uid || !isAdmin) return;
    setIsAuditModalOpen(true);
    setIsLoadingAudit(true);
    try {
      const logs = await fetchModerationAuditLogs(user.uid, isAdmin);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error('Hitilafu ya kupakia rekodi za ukaguzi:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Compute Summary Metrics
  const stats = useMemo(() => {
    const total = queue.length;
    let notReviewed = 0;
    let reported = 0;
    let invalid = 0;
    let approved = 0;
    let suspended = 0;

    for (const item of queue) {
      if (item.moderationRecord.status === 'NOT_REVIEWED') notReviewed++;
      if (item.reportCount > 0) reported++;
      if (!item.validationResult.isEligibleForActive) invalid++;
      if (item.moderationRecord.status === 'APPROVED') approved++;
      if (item.moderationRecord.status === 'SUSPENDED' || item.moderationRecord.status === 'HIDDEN') suspended++;
    }

    return { total, notReviewed, reported, invalid, approved, suspended };
  }, [queue]);

  if (!isAdmin) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-stone-200 text-center space-y-2">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
        <h3 className="text-base font-bold text-stone-900">Ruhusa Imekataliwa</h3>
        <p className="text-xs text-stone-600">
          Ukurasa huu unaruhusiwa kwa wasimamizi walioidhinishwa wa Ufugaji Update pekee.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                <Shield className="w-4 h-4 text-emerald-700" />
              </span>
              <h3 className="text-sm font-bold text-stone-900">
                Ukaguzi wa Matangazo ya Soko (Listing Moderation Queue)
              </h3>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Safu ya Utawala: Uchunguzi wa vigezo vya matangazo, makundi rasmi (V1.7A), kuzuia ulaghai, na maamuzi ya kiutawala.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAuditLog}
              className="px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-xs font-semibold text-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-stone-600" />
              <span>Kumbukumbu ya Ukaguzi (Audit Log)</span>
            </button>

            <button
              onClick={loadQueue}
              disabled={isLoading}
              className="p-2 text-stone-600 hover:text-emerald-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              title="Pakia Upya Foleni"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Governance Boundary Disclaimer Banner */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Miongozo ya Utawala (Admin Boundary):</strong> Kuidhinisha tangazo kunamaanisha kuwa tangazo linakidhi sera za mfumo kuwepo sokoni. <u>Haibadili</u> utambulisho wa muuzaji (Seller Verification), haithibitishi ubora wa kitaalamu wa dawa za mifugo (hakuna cheti cha dawa), na haiwezi kubadilisha umiliki wa duka wala bidhaa.
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80">
            <span className="text-[10px] text-stone-500 font-medium">Jumla Matangazo</span>
            <p className="text-base font-bold text-stone-900">{stats.total}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
            <span className="text-[10px] text-blue-700 font-medium">Hayajakaguliwa</span>
            <p className="text-base font-bold text-blue-900">{stats.notReviewed}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
            <span className="text-[10px] text-rose-700 font-medium">Yenye Ripoti</span>
            <p className="text-base font-bold text-rose-900">{stats.reported}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] text-amber-700 font-medium">Yenye Hitilafu</span>
            <p className="text-base font-bold text-amber-900">{stats.invalid}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-medium">Yaliyoidhinishwa</span>
            <p className="text-base font-bold text-emerald-900">{stats.approved}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-100 border border-stone-300">
            <span className="text-[10px] text-stone-600 font-medium">Yaliyosimamishwa</span>
            <p className="text-base font-bold text-stone-800">{stats.suspended}</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tafuta kwa jina la bidhaa, muuzaji, kundi, au ID..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-emerald-600 font-normal"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-stone-900 text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              Tafuta
            </button>
          </form>

          {/* Quick Filter Select */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-stone-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ModerationQueueFilter)}
              className="text-xs py-2 px-2.5 rounded-xl border border-stone-200 bg-stone-50 font-medium focus:outline-emerald-600"
            >
              <option value="ALL">Yote (All)</option>
              <option value="NOT_REVIEWED">Hayajakaguliwa (Not Reviewed)</option>
              <option value="UNDER_REVIEW">Yenye Ukaguzi (Under Review)</option>
              <option value="REPORTED">Yenye Ripoti (Reported)</option>
              <option value="INVALID">Yasiyokidhi Vigezo (Invalid)</option>
              <option value="CATEGORY_MISMATCH">Mgongano wa Kundi (Category Mismatch)</option>
              <option value="SUSPENDED">Yaliyofungiwa / Kufichwa (Suspended/Hidden)</option>
              <option value="RECENTLY_UPDATED">Yaliyoboreshwa Karibuni (Recently Updated)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Queue Items List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 space-y-2">
          <RefreshCw className="w-6 h-6 text-emerald-700 animate-spin mx-auto" />
          <p className="text-xs text-stone-500">Inapakia orodha ya matangazo kwa ajili ya ukaguzi...</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h4 className="text-sm font-bold text-stone-800">Hakuna matangazo yanayolingana</h4>
          <p className="text-xs text-stone-500">Hakuna matangazo yaliyopatikana chini ya kichujio ulichochagua.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => {
            const { product, moderationRecord, validationResult, priority, reportCount, aiClassification } = item;
            const isApproved = moderationRecord.status === 'APPROVED';
            const isSuspendedOrHidden = moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN';

            return (
              <div
                key={product.productId}
                className={`bg-white border rounded-2xl p-4 shadow-xs transition-shadow hover:shadow-sm space-y-3 ${
                  priority === 'CRITICAL'
                    ? 'border-rose-300 ring-1 ring-rose-300/50'
                    : priority === 'HIGH'
                    ? 'border-amber-300'
                    : 'border-stone-200/80'
                }`}
              >
                {/* Top Row: Priority, IDs, and Moderation Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Priority Badge */}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        priority === 'CRITICAL'
                          ? 'bg-rose-600 text-white'
                          : priority === 'HIGH'
                          ? 'bg-amber-600 text-white'
                          : priority === 'NORMAL'
                          ? 'bg-blue-600 text-white'
                          : 'bg-stone-400 text-white'
                      }`}
                    >
                      {priority}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        moderationRecord.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : moderationRecord.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN'
                          ? 'bg-stone-200 text-stone-800 border border-stone-400'
                          : moderationRecord.status === 'UNDER_REVIEW'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}
                    >
                      {moderationRecord.status}
                    </span>

                    {/* Product ID */}
                    <span className="text-[10px] font-mono text-stone-400">
                      ID: {product.productId}
                    </span>
                  </div>

                  {/* Right Tags: Reports, Validation, AI signals */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {reportCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <Flag className="w-3 h-3 text-rose-600" /> Ripoti {reportCount}
                      </span>
                    )}

                    {!validationResult.isEligibleForActive ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" /> Hitilafu za Vigezo
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Vigezo Sahihi
                      </span>
                    )}

                    {aiClassification?.isMismatchWithSellerCategory && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" /> Tofauti ya Kundi (AI)
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle Row: Product info and Seller details */}
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-stone-900 hover:text-emerald-800 transition-colors">
                      {product.title}
                    </h4>

                    <div className="flex items-center gap-2 flex-wrap text-xs text-stone-600">
                      <span className="font-semibold px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700">
                        {product.category} {product.subcategory ? `› ${product.subcategory}` : ''}
                      </span>

                      <span className="font-bold text-emerald-800">
                        {product.currency} {product.price?.toLocaleString()} /{product.unit}
                      </span>

                      <span className="text-stone-400">•</span>

                      <span>Akiba: {product.quantityAvailable} {product.unit}</span>

                      <span className="text-stone-400">•</span>

                      <span>{product.location}</span>
                    </div>

                    {/* Seller details & Verification Badge */}
                    <div className="flex items-center gap-2 text-[11px] text-stone-500 pt-0.5">
                      <span>Muuzaji: <strong>{product.sellerName}</strong></span>
                      {product.sellerVerificationStatus === 'verified' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          <UserCheck className="w-3 h-3" /> Verified Seller
                        </span>
                      )}
                      <span className="font-mono text-stone-400">UID: {product.sellerId}</span>
                    </div>

                    {/* Validation Errors Preview if any */}
                    {validationResult.errors.length > 0 && (
                      <p className="text-[11px] text-rose-700 bg-rose-50/70 p-1.5 rounded border border-rose-200 font-medium">
                        Makosa: {validationResult.errors.map((e) => e.message).join('; ')}
                      </p>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex sm:flex-col items-center gap-1.5 shrink-0 self-end sm:self-center w-full sm:w-auto">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="w-full sm:w-auto px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-stone-600" /> Kagua (Inspect)
                    </button>

                    {isSuspendedOrHidden ? (
                      <button
                        onClick={() => handleTriggerAction(item, 'RESTORE')}
                        className="w-full sm:w-auto px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Rejesha
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 w-full">
                        <button
                          onClick={() => handleTriggerAction(item, 'REJECT')}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                          title="Kataa Tangazo"
                        >
                          Kataa
                        </button>
                        <button
                          onClick={() => handleTriggerAction(item, 'APPROVE')}
                          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                          title="Idhinisha Tangazo"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Idhinisha
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Inspection Modal */}
      {selectedItem && (
        <ListingModerationDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onActionClick={(type) => {
            handleTriggerAction(selectedItem, type);
          }}
        />
      )}

      {/* Action Confirmation Modal */}
      {actionItem && actionType && (
        <ListingModerationActionModal
          item={actionItem}
          actionType={actionType}
          onClose={() => {
            setActionItem(null);
            setActionType(null);
          }}
          onSubmit={handleExecuteAction}
          isProcessing={isProcessingAction}
        />
      )}

      {/* Audit Log Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-60 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm">Kumbukumbu Rasmi ya Ukaguzi (Moderation Audit Log)</h3>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-stone-50 border-b border-stone-200 text-xs text-stone-600">
              Kumbukumbu hizi zimehifadhiwa kwa usalama na haziwezi kufutwa wala kubadilishwa (Immutable Append-Only Audit Trail).
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingAudit ? (
                <div className="p-8 text-center text-xs text-stone-500">Inapakia rekodi za ukaguzi...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500">Hakuna rekodi za ukaguzi zilizohifadhiwa bado.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.auditId} className="p-3 bg-white border border-stone-200 rounded-xl text-xs space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-stone-900 uppercase">{log.action}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 font-mono text-stone-600">
                          {log.previousStatus} → {log.newStatus}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-stone-400">
                        {new Date(log.performedAt).toLocaleString('sw-TZ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-600">
                      <div>
                        <span>Bidhaa: </span>
                        <strong className="font-mono">{log.productId}</strong>
                      </div>
                      <div>
                        <span>Msimamizi: </span>
                        <strong>{log.performedByDisplayName}</strong>
                      </div>
                    </div>

                    {log.reasonText && (
                      <p className="text-[11px] text-stone-700 bg-stone-50 p-2 rounded border border-stone-100">
                        <strong>Sababu:</strong> {log.reasonText}
                      </p>
                    )}

                    {log.internalNote && (
                      <p className="text-[11px] text-amber-900 bg-amber-50/70 p-2 rounded border border-amber-200 italic">
                        <strong>Kumbukumbu ya Ndani (Private):</strong> {log.internalNote}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-stone-200 bg-stone-50 text-right">
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-stone-200 text-stone-800 hover:bg-stone-300 cursor-pointer"
              >
                Funga
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
