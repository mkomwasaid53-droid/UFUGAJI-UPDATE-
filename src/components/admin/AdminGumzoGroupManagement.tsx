import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Archive,
  RefreshCw,
  Search,
  Filter,
  Loader2,
  Globe,
  Lock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Crown,
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  GumzoGroup,
  GumzoGroupStatus,
  GumzoGroupVisibility,
  GUMZO_CATEGORIES
} from '../../types/gumzo';
import { gumzoGroupService } from '../../services/gumzoGroupService';

export const AdminGumzoGroupManagement: React.FC = () => {
  const { user, role, isAdmin } = useAuth();
  const currentAdminUserId = user?.uid || 'admin';

  // State
  const [groups, setGroups] = useState<GumzoGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<GumzoGroupStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action in-progress tracking (per groupId)
  const [processingGroupId, setProcessingGroupId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals for governance actions with reasons
  const [modalAction, setModalAction] = useState<{
    type: 'REJECT' | 'SUSPEND' | 'ASSIGN_LEADERSHIP';
    group: GumzoGroup;
  } | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [leadershipUserIdInput, setLeadershipUserIdInput] = useState<string>('');

  // Summary counts
  const [counts, setCounts] = useState({
    total: 0,
    pending: 0,
    active: 0,
    suspended: 0,
    rejected: 0,
    archived: 0,
    draft: 0,
  });

  // Fetch groups from server
  const loadGroups = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const token = user ? await user.getIdToken().catch(() => null) : null;
      const res = await gumzoGroupService.fetchBrowserAdminGroups({
        statusFilter: statusFilter === 'ALL' ? undefined : statusFilter,
        categoryFilter: categoryFilter === 'all' ? undefined : categoryFilter,
        search: searchQuery.trim() || undefined,
        callerUserId: currentAdminUserId,
        userRole: 'admin',
        token,
        userEmail: user?.email || 'mkomwasaid53@gmail.com',
      });

      setGroups(res.groups);
      setCounts(res.counts);

      // If we haven't selected a status filter, and there are pending groups, set to PENDING_APPROVAL automatically on first load
      if (statusFilter === 'ALL' && res.counts.pending > 0 && !sessionStorage.getItem('gumzo_admin_filter_touched')) {
        setStatusFilter('PENDING_APPROVAL');
      }
    } catch (err: any) {
      console.error('Hitilafu ya kupakia vikundi vya Gumzo kwa admin:', err);
      setErrorMsg(err.message || 'Imeshindwa kupakia orodha ya vikundi vya Gumzo.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [statusFilter, categoryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadGroups();
  };

  // Status update execution
  const executeStatusUpdate = async (group: GumzoGroup, nextStatus: GumzoGroupStatus, reason?: string) => {
    try {
      setProcessingGroupId(group.groupId);
      setErrorMsg(null);
      setSuccessMsg(null);

      const token = user ? await user.getIdToken().catch(() => null) : null;
      const updated = await gumzoGroupService.postBrowserUpdateGroupStatus({
        groupId: group.groupId,
        newStatus: nextStatus,
        adminUserId: currentAdminUserId,
        reason,
        userRole: 'admin',
        token,
      });

      // Update state locally
      setGroups((prev) =>
        prev.map((g) => (g.groupId === group.groupId ? { ...g, status: nextStatus, updatedAt: updated.updatedAt } : g))
      );

      // Re-fetch counts
      loadGroups();

      const statusLabels: Record<GumzoGroupStatus, string> = {
        ACTIVE: 'Imeidhinishwa (ACTIVE)',
        REJECTED: 'Imekataliwa (REJECTED)',
        SUSPENDED: 'Imesimamishwa (SUSPENDED)',
        ARCHIVED: 'Imewekwa Kumbukumbu (ARCHIVED)',
        PENDING_APPROVAL: 'Inasubiri Idhini (PENDING_APPROVAL)',
        DRAFT: 'Rasimu (DRAFT)',
      };

      setSuccessMsg(`Kikundi "${group.name}" kimesasishwa kuwa: ${statusLabels[nextStatus] || nextStatus}.`);
      setModalAction(null);
      setActionReason('');
    } catch (err: any) {
      console.error('Hitilafu ya kubadilisha hali ya kikundi:', err);
      setErrorMsg(err.message || 'Imeshindwa kubadilisha hali ya kikundi.');
    } finally {
      setProcessingGroupId(null);
    }
  };

  // Leadership Admin assignment execution
  const executeAssignLeadership = async (group: GumzoGroup) => {
    const targetUserId = leadershipUserIdInput.trim();
    if (!targetUserId) {
      setErrorMsg('Tafadhali ingiza Kitambulisho (User ID) cha kiongozi unayetaka kumteua.');
      return;
    }

    if (targetUserId === group.founderAdminUserId) {
      setErrorMsg('Mwanzilishi (Founder Admin) hawezi kuwa Leadership Admin wa kikundi kilekile. Lazima wawe tofauti.');
      return;
    }

    try {
      setProcessingGroupId(group.groupId);
      setErrorMsg(null);
      setSuccessMsg(null);

      const token = user ? await user.getIdToken().catch(() => null) : null;
      const updated = await gumzoGroupService.postBrowserAssignLeadershipAdmin({
        groupId: group.groupId,
        leadershipAdminUserId: targetUserId,
        platformAdminUserId: currentAdminUserId,
        userRole: 'admin',
        token,
      });

      setGroups((prev) =>
        prev.map((g) =>
          g.groupId === group.groupId ? { ...g, leadershipAdminUserId: targetUserId, updatedAt: updated.updatedAt } : g
        )
      );

      setSuccessMsg(`Mtumiaji (${targetUserId}) ameteuliwa rasmi kuwa Leadership Admin wa kikundi "${group.name}".`);
      setModalAction(null);
      setLeadershipUserIdInput('');
      loadGroups();
    } catch (err: any) {
      console.error('Hitilafu ya kuteua Leadership Admin:', err);
      setErrorMsg(err.message || 'Imeshindwa kuteua Leadership Admin.');
    } finally {
      setProcessingGroupId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && g.categoryId !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          g.groupId.toLowerCase().includes(q) ||
          g.founderAdminUserId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [groups, statusFilter, categoryFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-950 text-white p-5 rounded-2xl shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Mamlaka ya Utawala wa Jamii (Gumzo Governance V9.1)
            </span>
            {counts.pending > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-stone-950 inline-flex items-center gap-1 animate-pulse">
                <Clock className="w-3 h-3" />
                {counts.pending} Zinazosubiri Idhini
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={loadGroups}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Pakia Upya"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sasisha</span>
          </button>
        </div>

        <div>
          <h2 className="text-lg font-extrabold tracking-tight">
            Usimamizi na Idhini ya Vikundi vya Gumzo
          </h2>
          <p className="text-xs text-stone-300 max-w-3xl leading-relaxed">
            Paneli rasmi ya Msimamizi Mkuu ya kupokea maombi ya vikundi vipya, kuidhinisha (Approve), kukataa (Reject), kusimamisha (Suspend), kuweka kumbukumbu (Archive), na kuteua Viongozi wa Jukwaa (Leadership Admin).
          </p>
        </div>

        {/* Lifecycle Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 text-stone-900">
          <div
            onClick={() => {
              sessionStorage.setItem('gumzo_admin_filter_touched', '1');
              setStatusFilter('PENDING_APPROVAL');
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'PENDING_APPROVAL'
                ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-500 shadow-xs'
                : 'bg-white/95 hover:bg-white border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600">
              <span>Zinazosubiri</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-amber-700 mt-1">{counts.pending}</div>
            <span className="text-[10px] text-stone-500">Kuhakikiwa</span>
          </div>

          <div
            onClick={() => {
              sessionStorage.setItem('gumzo_admin_filter_touched', '1');
              setStatusFilter('ACTIVE');
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-500 shadow-xs'
                : 'bg-white/95 hover:bg-white border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600">
              <span>Zilizo Hai</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-lg font-bold text-emerald-700 mt-1">{counts.active}</div>
            <span className="text-[10px] text-stone-500">Zinafanya kazi</span>
          </div>

          <div
            onClick={() => {
              sessionStorage.setItem('gumzo_admin_filter_touched', '1');
              setStatusFilter('SUSPENDED');
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'SUSPENDED'
                ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-500 shadow-xs'
                : 'bg-white/95 hover:bg-white border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600">
              <span>Zilizosimamishwa</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-lg font-bold text-rose-700 mt-1">{counts.suspended}</div>
            <span className="text-[10px] text-stone-500">Miongozo / Nidhamu</span>
          </div>

          <div
            onClick={() => {
              sessionStorage.setItem('gumzo_admin_filter_touched', '1');
              setStatusFilter('REJECTED');
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'REJECTED'
                ? 'bg-stone-200 border-stone-400 ring-2 ring-stone-600 shadow-xs'
                : 'bg-white/95 hover:bg-white border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600">
              <span>Zilizokataliwa</span>
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-lg font-bold text-stone-700 mt-1">{counts.rejected}</div>
            <span className="text-[10px] text-stone-500">Hazikukidhi vigezo</span>
          </div>

          <div
            onClick={() => {
              sessionStorage.setItem('gumzo_admin_filter_touched', '1');
              setStatusFilter('ARCHIVED');
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'ARCHIVED'
                ? 'bg-stone-200 border-stone-400 ring-2 ring-stone-600 shadow-xs'
                : 'bg-white/95 hover:bg-white border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600">
              <span>Kumbukumbu</span>
              <Archive className="w-3.5 h-3.5 text-stone-600" />
            </div>
            <div className="text-lg font-bold text-stone-700 mt-1">{counts.archived}</div>
            <span className="text-[10px] text-stone-500">Zilizofungwa</span>
          </div>

          <div
            onClick={() => {
              sessionStorage.setItem('gumzo_admin_filter_touched', '1');
              setStatusFilter('ALL');
            }}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-500 shadow-xs'
                : 'bg-white/95 hover:bg-white border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600">
              <span>Jumla Yote</span>
              <Users className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-lg font-bold text-blue-700 mt-1">{counts.total}</div>
            <span className="text-[10px] text-stone-500">Vikundi vyote</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-stone-400 hover:text-stone-700 text-xs px-2 py-0.5"
          >
            Funga
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-stone-400 hover:text-stone-700 text-xs px-2 py-0.5"
          >
            Funga
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('gumzo_admin_filter_touched', '1');
                setStatusFilter('PENDING_APPROVAL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'PENDING_APPROVAL'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Zinazosubiri Idhini ({counts.pending})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('gumzo_admin_filter_touched', '1');
                setStatusFilter('ACTIVE');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Zilizo Hai ({counts.active})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('gumzo_admin_filter_touched', '1');
                setStatusFilter('SUSPENDED');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'SUSPENDED'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Zilizosimamishwa ({counts.suspended})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('gumzo_admin_filter_touched', '1');
                setStatusFilter('REJECTED');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'REJECTED'
                  ? 'bg-stone-800 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <XCircle className="w-3 h-3" />
              <span>Zilizokataliwa ({counts.rejected})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('gumzo_admin_filter_touched', '1');
                setStatusFilter('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'ALL'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Zote ({counts.total})</span>
            </button>
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-stone-500 whitespace-nowrap">Kategoria:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 text-stone-800 focus:outline-emerald-600 cursor-pointer"
            >
              <option value="all">Kategoria Zote</option>
              {GUMZO_CATEGORIES.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.nameSwahili}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tafuta kikundi kwa jina, maelezo, founder user ID, au group ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-20 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-emerald-600 transition-colors"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-stone-800 hover:bg-stone-900 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
          >
            Tafuta
          </button>
        </form>
      </div>

      {/* Group List Area */}
      {isLoading ? (
        <div className="bg-white border border-stone-200/90 rounded-2xl p-10 flex flex-col items-center justify-center space-y-2 text-stone-500">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-700" />
          <p className="text-xs font-medium">Inapakia orodha ya vikundi kutoka mfumo wa Gumzo...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white border border-stone-200/90 rounded-2xl p-10 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
            {statusFilter === 'PENDING_APPROVAL' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            ) : (
              <Users className="w-6 h-6" />
            )}
          </div>
          <h3 className="text-sm font-bold text-stone-800">
            {statusFilter === 'PENDING_APPROVAL'
              ? 'Hakuna Vikundi Vinavyosubiri Idhini'
              : statusFilter === 'SUSPENDED'
              ? 'Hakuna Vikundi Vilivyosimamishwa'
              : statusFilter === 'REJECTED'
              ? 'Hakuna Vikundi Vilivyokataliwa'
              : 'Hakuna Vikundi Vilivyopatikana'}
          </h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            {statusFilter === 'PENDING_APPROVAL'
              ? 'Maombi yote ya kuanzisha vikundi vya Gumzo yamefanyiwa kazi. Kazi imekamilika!'
              : 'Hakuna kikundi kinacholingana na vichujio vya sasa.'}
          </p>
          {statusFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className="mt-2 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Tazama vikundi vyote ({counts.total})
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const categoryDef = GUMZO_CATEGORIES.find((c) => c.categoryId === group.categoryId);
            const isProcessing = processingGroupId === group.groupId;
            const isExpanded = expandedGroupId === group.groupId;

            return (
              <div
                key={group.groupId}
                className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-stone-900 leading-snug">
                        {group.name}
                      </h3>
                      {/* Status badge */}
                      {group.status === 'PENDING_APPROVAL' && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Inasubiri Idhini (Pending)
                        </span>
                      )}
                      {group.status === 'ACTIVE' && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Hai (Active)
                        </span>
                      )}
                      {group.status === 'SUSPENDED' && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Imesimamishwa (Suspended)
                        </span>
                      )}
                      {group.status === 'REJECTED' && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-stone-200 text-stone-800 border border-stone-300 inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-stone-600" />
                          Imekataliwa (Rejected)
                        </span>
                      )}
                      {group.status === 'ARCHIVED' && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200 inline-flex items-center gap-1">
                          <Archive className="w-3 h-3 text-stone-500" />
                          Kumbukumbu (Archived)
                        </span>
                      )}

                      {/* Visibility badge */}
                      {group.visibility === 'PUBLIC' ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 inline-flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5 text-stone-500" />
                          Umma
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5 text-amber-600" />
                          Faragha
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-stone-500 flex-wrap">
                      <span className="font-semibold text-emerald-800">
                        {categoryDef?.nameSwahili || group.categoryId}
                      </span>
                      <span>•</span>
                      <span>Aina: <strong>{group.livestockType}</strong></span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-stone-400" />
                        <strong>{group.memberCount}</strong> {group.memberCount === 1 ? 'mwanachama' : 'wanachama'}
                      </span>
                      <span>•</span>
                      <span>Tarehe: {new Date(group.createdAt).toLocaleDateString('sw-TZ')}</span>
                    </div>
                  </div>

                  {/* Top quick-action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Approve button */}
                    {group.status !== 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => executeStatusUpdate(group, 'ACTIVE')}
                        disabled={isProcessing}
                        className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs min-h-[34px]"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>{group.status === 'PENDING_APPROVAL' ? 'Idhinisha Kikundi' : 'Rejesha (Active)'}</span>
                      </button>
                    )}

                    {/* Reject button (for PENDING_APPROVAL) */}
                    {group.status === 'PENDING_APPROVAL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalAction({ type: 'REJECT', group });
                          setActionReason('Kikundi hakikidhi miongozo ya jukwaa la Gumzo.');
                        }}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[34px]"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Kataa Ombi</span>
                      </button>
                    )}

                    {/* Suspend button (for ACTIVE) */}
                    {group.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalAction({ type: 'SUSPEND', group });
                          setActionReason('Kikundi kimesimamishwa kwa uchunguzi wa miongozo ya jamii.');
                        }}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[34px]"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Simamisha (Suspend)</span>
                      </button>
                    )}

                    {/* Expand/Collapse toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedGroupId(isExpanded ? null : group.groupId)}
                      className="p-1.5 text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs transition-colors cursor-pointer"
                      title={isExpanded ? 'Funga maelezo' : 'Tazama maelezo zaidi'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Description snippet */}
                <p className="text-xs text-stone-600 leading-relaxed bg-stone-50/70 p-3 rounded-xl border border-stone-100">
                  {group.description}
                </p>

                {/* Expanded Management Drawer */}
                {isExpanded && (
                  <div className="pt-3 border-t border-stone-100 space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                          Mwanzilishi (Founder Admin ID)
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-stone-900 bg-white px-2 py-0.5 rounded border border-stone-200">
                            {group.founderAdminUserId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(group.founderAdminUserId, `founder_${group.groupId}`)}
                            className="p-1 text-stone-400 hover:text-stone-700"
                            title="Nakili ID"
                          >
                            {copiedId === `founder_${group.groupId}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                          Kiongozi wa Jukwaa (Leadership Admin ID)
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {group.leadershipAdminUserId ? (
                            <span className="font-mono text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {group.leadershipAdminUserId}
                            </span>
                          ) : (
                            <span className="text-stone-400 italic">Bado haijateuliwa</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setModalAction({ type: 'ASSIGN_LEADERSHIP', group });
                              setLeadershipUserIdInput(group.leadershipAdminUserId || '');
                            }}
                            className="text-[11px] font-bold text-blue-700 hover:underline ml-1"
                          >
                            {group.leadershipAdminUserId ? 'Badili' : 'Teua Kiongozi'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                          Kitambulisho cha Kikundi (Group ID)
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-stone-600 text-[11px]">
                            {group.groupId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(group.groupId, `grp_${group.groupId}`)}
                            className="p-1 text-stone-400 hover:text-stone-700"
                            title="Nakili ID"
                          >
                            {copiedId === `grp_${group.groupId}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                          Tarehe ya Marekebisho ya Mwisho
                        </span>
                        <span className="text-stone-700 font-medium">
                          {new Date(group.updatedAt).toLocaleString('sw-TZ')}
                        </span>
                      </div>
                    </div>

                    {/* Secondary Administrative Actions Bar */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Archive button */}
                        {group.status !== 'ARCHIVED' && (
                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(group, 'ARCHIVED')}
                            disabled={isProcessing}
                            className="px-2.5 py-1 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Archive className="w-3 h-3" />
                            <span>Weka Kumbukumbu (Archive)</span>
                          </button>
                        )}

                        {/* Reset to DRAFT if needed */}
                        {group.status !== 'DRAFT' && group.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(group, 'DRAFT')}
                            disabled={isProcessing}
                            className="px-2.5 py-1 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>Weka Rasimu (Draft)</span>
                          </button>
                        )}
                      </div>

                      <a
                        href={`/community`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
                      >
                        <span>Tazama Upande wa Mtumiaji (Community)</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Governance Modal (Rejection / Suspension / Assign Leadership) */}
      {modalAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    modalAction.type === 'REJECT'
                      ? 'bg-rose-100 text-rose-700'
                      : modalAction.type === 'SUSPEND'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {modalAction.type === 'REJECT' && <XCircle className="w-5 h-5" />}
                  {modalAction.type === 'SUSPEND' && <AlertTriangle className="w-5 h-5" />}
                  {modalAction.type === 'ASSIGN_LEADERSHIP' && <Crown className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    {modalAction.type === 'REJECT' && 'Kataa Kikundi cha Gumzo'}
                    {modalAction.type === 'SUSPEND' && 'Simamisha Kikundi cha Gumzo'}
                    {modalAction.type === 'ASSIGN_LEADERSHIP' && 'Teua Leadership Admin'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Kikundi: <strong className="text-stone-800">{modalAction.group.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body for Reject / Suspend */}
            {(modalAction.type === 'REJECT' || modalAction.type === 'SUSPEND') && (
              <div className="space-y-3">
                <p className="text-xs text-stone-600 leading-relaxed">
                  {modalAction.type === 'REJECT'
                    ? 'Taja sababu ya kukataa ombi hili la kikundi. Taarifa hii itatumiwa na mifumo ya utawala kueleza uamuzi.'
                    : 'Kusimamisha kikundi kutazuia wanachama kuingia na kuona maudhui ya ndani hadi kitakapoidhinishwa tena.'}
                </p>

                {/* Preset reasons */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-stone-700 block">
                    Chagua au Andika Sababu:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Hakiendani na sera za ufugaji',
                      'Maudhui yasiyofaa au matangazo potofu',
                      'Jina la kikundi lenye mkanganyiko',
                      'Lalamiko la ukiukaji wa maadili',
                      'Uchunguzi wa kiutawala unaendelea',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setActionReason(preset)}
                        className={`text-[10px] px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          actionReason === preset
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Eleza sababu ya uamuzi huu..."
                  className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-emerald-600 text-stone-900"
                />
              </div>
            )}

            {/* Modal Body for Assign Leadership Admin */}
            {modalAction.type === 'ASSIGN_LEADERSHIP' && (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-blue-700" />
                    Miongozo ya Utawala wa Viongozi Wawili (V9.1 / V9.4)
                  </p>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Leadership Admin anawakilisha jukwaa/shirika kwa ajili ya usimamizi wa kimaadili na viwango. <strong>Hawezi kuwa mtu yuleyule na Mwanzilishi (Founder Admin: {modalAction.group.founderAdminUserId})</strong>.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    Kitambulisho cha Mtumiaji (User ID ya Kiongozi):
                  </label>
                  <input
                    type="text"
                    value={leadershipUserIdInput}
                    onChange={(e) => setLeadershipUserIdInput(e.target.value)}
                    placeholder="Mfano: admin_juma_202 au uid kutoka users"
                    className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-emerald-600 text-stone-900 font-mono"
                  />
                  <p className="text-[10px] text-stone-400">
                    Ingiza User ID ya msimamizi au mtumiaji aliyethibitishwa ambaye atasimamia kikundi hiki.
                  </p>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="px-3.5 py-2 text-stone-600 hover:text-stone-900 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer"
              >
                Ghairi
              </button>

              {modalAction.type === 'REJECT' && (
                <button
                  type="button"
                  onClick={() => executeStatusUpdate(modalAction.group, 'REJECTED', actionReason)}
                  disabled={processingGroupId === modalAction.group.groupId}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {processingGroupId === modalAction.group.groupId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Thibitisha Kukataa</span>
                </button>
              )}

              {modalAction.type === 'SUSPEND' && (
                <button
                  type="button"
                  onClick={() => executeStatusUpdate(modalAction.group, 'SUSPENDED', actionReason)}
                  disabled={processingGroupId === modalAction.group.groupId}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {processingGroupId === modalAction.group.groupId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span>Thibitisha Kusimamisha</span>
                </button>
              )}

              {modalAction.type === 'ASSIGN_LEADERSHIP' && (
                <button
                  type="button"
                  onClick={() => executeAssignLeadership(modalAction.group)}
                  disabled={processingGroupId === modalAction.group.groupId}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {processingGroupId === modalAction.group.groupId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Crown className="w-3.5 h-3.5" />
                  )}
                  <span>Hifadhi Uteuzi</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
