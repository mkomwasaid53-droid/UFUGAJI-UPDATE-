import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Users,
  Shield,
  Globe,
  Lock,
  Clock,
  AlertTriangle,
  Archive,
  XCircle,
  MessageSquare,
  LogOut,
  UserPlus,
  Loader2,
  Info,
  ShieldCheck,
  ExternalLink,
  PlusCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import {
  GumzoGroup,
  GumzoMembership,
  GumzoGroupStatus,
  GumzoPost,
  GUMZO_CATEGORIES,
  canAccessGumzoGroup,
  canUserCreatePost
} from '../../types/gumzo';
import { gumzoGroupService } from '../../services/gumzoGroupService';
import { gumzoPostService } from '../../services/gumzoPostService';
import { useAuth } from '../../context/AuthContext';
import { CreateGumzoPostModal } from './CreateGumzoPostModal';
import { GumzoPostCard } from './GumzoPostCard';

interface GumzoGroupDetailProps {
  group: GumzoGroup;
  currentUserId: string;
  initialMembership?: GumzoMembership | null;
  onBack: () => void;
  onGroupUpdated?: (updatedGroup: GumzoGroup) => void;
}

export const GumzoGroupDetail: React.FC<GumzoGroupDetailProps> = ({
  group,
  currentUserId,
  initialMembership,
  onBack,
  onGroupUpdated,
}) => {
  const { isAdmin } = useAuth();
  const [membership, setMembership] = useState<GumzoMembership | null>(initialMembership || null);
  const [memberCount, setMemberCount] = useState<number>(group.memberCount);
  const [posts, setPosts] = useState<GumzoPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAdminActing, setIsAdminActing] = useState(false);
  const [adminSuccessMsg, setAdminSuccessMsg] = useState<string | null>(null);

  // Authoritative admin posting check
  const postAuth = canUserCreatePost(currentUserId, group, membership, isAdmin);

  const loadPosts = async () => {
    try {
      setIsLoadingPosts(true);
      const res = await gumzoPostService.fetchBrowserGroupPosts({
        groupId: group.groupId,
        callerUserId: currentUserId,
      });
      setPosts(res.posts || []);
    } catch (err) {
      console.warn('Failed to fetch group posts:', err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  useEffect(() => {
    loadPosts();
    if (currentUserId && !membership) {
      gumzoGroupService.fetchBrowserGroupById(group.groupId, currentUserId).then((res) => {
        if (res.membership) {
          setMembership(res.membership);
        }
        if (res.group) {
          setMemberCount(res.group.memberCount);
        }
      }).catch((err) => {
        console.warn('Could not auto-fetch group membership:', err);
      });
    }
  }, [group.groupId, currentUserId]);

  const handlePostCreated = () => {
    loadPosts();
  };

  const handlePostUpdated = (updated: GumzoPost) => {
    setPosts((prev) => prev.map((p) => (p.postId === updated.postId ? updated : p)));
  };

  const handlePostDeleted = (deletedPostId: string) => {
    setPosts((prev) => prev.filter((p) => p.postId !== deletedPostId));
  };

  const categoryDef = GUMZO_CATEGORIES.find((c) => c.categoryId === group.categoryId);
  const accessDecision = canAccessGumzoGroup(currentUserId, group, membership, isAdmin);

  const isFounder = membership?.role === 'FOUNDER_ADMIN' || group.founderAdminUserId === currentUserId;
  const isLeadership = membership?.role === 'LEADERSHIP_ADMIN' || group.leadershipAdminUserId === currentUserId;
  const isMember = (membership?.role === 'MEMBER' || isFounder || isLeadership) && membership?.status === 'ACTIVE';

  const handleAdminStatusChange = async (nextStatus: GumzoGroupStatus, reason?: string) => {
    try {
      setIsAdminActing(true);
      setActionError(null);
      setAdminSuccessMsg(null);
      const updated = await gumzoGroupService.postBrowserUpdateGroupStatus({
        groupId: group.groupId,
        newStatus: nextStatus,
        adminUserId: currentUserId || 'admin',
        reason: reason || 'Marekebisho kutoka ukurasa wa kikundi na Msimamizi Mkuu',
        userRole: 'admin',
      });
      if (onGroupUpdated) {
        onGroupUpdated(updated);
      }
      setAdminSuccessMsg(`Hali ya kikundi imebadilishwa kuwa: ${nextStatus}`);
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya kubadilisha hali ya kikundi.');
    } finally {
      setIsAdminActing(false);
    }
  };

  const handleJoin = async () => {
    if (!currentUserId) {
      setActionError('Tafadhali ingia kwenye mfumo kujiunga na kikundi.');
      return;
    }
    try {
      setIsJoining(true);
      setActionError(null);
      const newMembership = await gumzoGroupService.postBrowserJoinGroup(group.groupId, currentUserId);
      setMembership(newMembership);
      if (newMembership.status === 'ACTIVE') {
        const nextCount = memberCount + 1;
        setMemberCount(nextCount);
        if (onGroupUpdated) {
          onGroupUpdated({ ...group, memberCount: nextCount });
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya kujiunga na kikundi.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Je, una uhakika unataka kujiondoa kwenye kikundi hiki?')) {
      return;
    }
    try {
      setIsLeaving(true);
      setActionError(null);
      const updatedMembership = await gumzoGroupService.postBrowserLeaveGroup(group.groupId, currentUserId);
      setMembership(updatedMembership);
      const nextCount = Math.max(1, memberCount - 1);
      setMemberCount(nextCount);
      if (onGroupUpdated) {
        onGroupUpdated({ ...group, memberCount: nextCount });
      }
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya kujiondoa kwenye kikundi.');
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in duration-150">
      {/* Top back navigation */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 px-3 py-1.5 rounded-xl shadow-2xs hover:bg-stone-50 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Rudi kwenye Orodha ya Vikundi</span>
      </button>

      {/* Main Group Header Card */}
      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
        {/* Banner pattern / Cover image */}
        <div className="h-32 sm:h-40 bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-950 relative p-5 flex flex-col justify-between text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-emerald-200 inline-flex items-center gap-1.5">
              <span>{categoryDef?.nameSwahili || group.categoryId}</span>
            </span>

            <div className="flex items-center gap-2">
              {group.visibility === 'PUBLIC' ? (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-black/30 backdrop-blur-md text-stone-200 border border-white/10 inline-flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-400" />
                  Kikundi cha Umma
                </span>
              ) : (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-amber-900/60 backdrop-blur-md text-amber-200 border border-amber-500/30 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400" />
                  Kikundi cha Faragha
                </span>
              )}
            </div>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight drop-shadow-xs">
              {group.name}
            </h1>
          </div>
        </div>

        {/* Content body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Metadata bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-100 text-xs">
            <div className="flex items-center gap-4 flex-wrap text-stone-600 font-medium">
              <span className="inline-flex items-center gap-1.5 bg-stone-100 px-3 py-1 rounded-xl">
                <Users className="w-4 h-4 text-emerald-700" />
                <strong className="text-stone-900">{memberCount}</strong> {memberCount === 1 ? 'Mwanachama' : 'Wanachama'}
              </span>

              {isFounder && (
                <span className="inline-flex items-center gap-1 text-purple-700 font-bold bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200">
                  <Shield className="w-3.5 h-3.5 text-purple-600" />
                  Wewe ni Mwanzilishi (Founder Admin)
                </span>
              )}
              {isLeadership && (
                <span className="inline-flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  Wewe ni Kiongozi (Leadership Admin)
                </span>
              )}
              {isMember && !isFounder && !isLeadership && (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                  Mwanachama Hai
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {!isMember && group.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={isJoining}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs min-h-[40px]"
                >
                  {isJoining ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  <span>{group.visibility === 'PUBLIC' ? 'Jiunge na Kikundi' : 'Omba Kujiunga'}</span>
                </button>
              )}

              {isMember && !isFounder && (
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={isLeaving}
                  className="px-3.5 py-2 bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
                >
                  {isLeaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  <span>Ondoka Kwenye Kikundi</span>
                </button>
              )}
            </div>
          </div>

          {actionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
          )}

          {adminSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{adminSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setAdminSuccessMsg(null)}
                className="text-stone-400 hover:text-stone-700 text-xs px-2"
              >
                Funga
              </button>
            </div>
          )}

          {/* Admin Governance Quick Controls Bar */}
          {isAdmin && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-stone-900">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <span className="font-bold">Mamlaka ya Msimamizi Mkuu (Admin):</span>{' '}
                  <span className="text-stone-600">
                    Hali ya sasa ni: <strong className="text-stone-900 font-mono">{group.status}</strong>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {group.status !== 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleAdminStatusChange('ACTIVE')}
                    disabled={isAdminActing}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                  >
                    {isAdminActing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    <span>{group.status === 'PENDING_APPROVAL' ? 'Idhinisha (ACTIVE)' : 'Rejesha (ACTIVE)'}</span>
                  </button>
                )}

                {group.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleAdminStatusChange('SUSPENDED', 'Imesimamishwa na Msimamizi Mkuu')}
                    disabled={isAdminActing}
                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                  >
                    {isAdminActing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    <span>Simamisha (SUSPENDED)</span>
                  </button>
                )}

                {group.status === 'PENDING_APPROVAL' && (
                  <button
                    type="button"
                    onClick={() => handleAdminStatusChange('REJECTED', 'Ombi halikukidhi vigezo vya jukwaa')}
                    disabled={isAdminActing}
                    className="px-3 py-1.5 bg-stone-700 hover:bg-stone-800 disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                  >
                    {isAdminActing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    <span>Kataa (REJECTED)</span>
                  </button>
                )}

                <a
                  href="/admin?tab=community"
                  className="px-3 py-1.5 bg-white border border-stone-300 text-stone-700 hover:text-stone-900 font-semibold rounded-xl hover:bg-stone-50 transition-colors inline-flex items-center gap-1"
                >
                  <span>Paneli ya Admin</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Kuhusu Kikundi Hiki
            </h3>
            <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
              {group.description}
            </p>
          </div>

          {/* Status notices if not ACTIVE */}
          {group.status === 'PENDING_APPROVAL' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
              <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Kikundi Kinasubiri Idhini ya Uongozi</p>
                <p className="text-blue-700 leading-relaxed">
                  Kikundi hiki kiko katika foleni ya ukaguzi wa uongozi wa jukwaa la Ufugaji Update ili kuhakikisha viwango na maadili ya jamii. Kitaonekana kwa umma pindi kitakapoidhinishwa (ACTIVE).
                </p>
              </div>
            </div>
          )}

          {group.status === 'SUSPENDED' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Kikundi Kimesimamishwa kwa Muda</p>
                <p className="text-rose-700 leading-relaxed">
                  Kikundi hiki kimesimamishwa kwa muda na uongozi wa jukwaa kwa sababu za usimamizi au ukaguzi wa miongozo.
                </p>
              </div>
            </div>
          )}

          {group.status === 'ARCHIVED' && (
            <div className="p-4 bg-stone-100 border border-stone-300 rounded-2xl flex items-start gap-3 text-xs text-stone-800">
              <Archive className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Kikundi cha Kumbukumbu (Archived)</p>
                <p className="text-stone-600 leading-relaxed">
                  Kikundi hiki kimefungwa na kiko kwenye kumbukumbu pekee. Hakuna shughuli mpya zinazoruhusiwa.
                </p>
              </div>
            </div>
          )}

          {group.status === 'REJECTED' && (
            <div className="p-4 bg-stone-100 border border-stone-300 rounded-2xl flex items-start gap-3 text-xs text-stone-800">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Ombi la Kikundi Halikukubaliwa</p>
                <p className="text-stone-600 leading-relaxed">
                  Ombi la kuanzisha kikundi hiki halikukidhi vigezo vya jukwaa la Gumzo.
                </p>
              </div>
            </div>
          )}

          {/* V9.2 — GUMZO ADMIN POSTS FEED & CONTROLS */}
          <div className="pt-6 border-t border-stone-100 space-y-4">
            {/* Feed Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Machapisho ya Viongozi (Admin Posts)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Mada na miongozo rasmi kutoka kwa viongozi wa kikundi hiki
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadPosts}
                  disabled={isLoadingPosts}
                  className="p-2 text-stone-400 hover:text-stone-700 bg-stone-50 border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
                  title="Onyesha upya machapisho"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPosts ? 'animate-spin' : ''}`} />
                </button>

                {/* Only authorized Gumzo admins see the Create Post button */}
                {postAuth.allowed && (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs min-h-[38px]"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Andika Post</span>
                  </button>
                )}
              </div>
            </div>

            {/* Member informational banner explaining admin-led principle */}
            {!postAuth.allowed && accessDecision.canViewContent && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 flex items-center gap-2">
                <Info className="w-4 h-4 text-stone-400 shrink-0" />
                <span>
                  <strong>Mfumo wa Uongozi wa Gumzo:</strong> Viongozi pekee (Founder & Leadership Admin) wanaweza kuanzisha mada au machapisho. Wanachama watatoa maoni (Comments) kwenye machapisho haya kuanzia Awamu ya V9.3.
                </span>
              </div>
            )}

            {/* Posts List */}
            {isLoadingPosts ? (
              <div className="p-12 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-700" />
                <p className="text-xs text-stone-500 font-medium">Inapakia machapisho ya kikundi...</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="p-10 bg-stone-50/80 border border-dashed border-stone-200 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200 flex items-center justify-center mx-auto text-stone-400 shadow-2xs">
                  <MessageSquare className="w-6 h-6 text-stone-300" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-stone-800">
                    Bado Hakuna Machapisho Katika Kikundi Hiki
                  </h4>
                  <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                    {postAuth.allowed
                      ? 'Wewe ni kiongozi wa kikundi hiki! Bonyeza kitufe cha "+ Andika Post" kuanzisha mada ya kwanza ya ufugaji, kutoa mwongozo au taarifa kwa wanachama.'
                      : 'Kikundi hiki hakijapokea mada au machapisho rasmi kutoka kwa viongozi wake bado. Endelea kufuatilia.'}
                  </p>
                </div>
                {postAuth.allowed && (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Anzisha Mada ya Kwanza</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {posts.map((post) => (
                  <GumzoPostCard
                    key={post.postId}
                    post={post}
                    group={group}
                    currentUserId={currentUserId}
                    membership={membership}
                    isPlatformAdmin={isAdmin}
                    onPostUpdated={handlePostUpdated}
                    onPostDeleted={handlePostDeleted}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Admin Post Creation Modal */}
      {isCreateModalOpen && (
        <CreateGumzoPostModal
          group={group}
          currentUserId={currentUserId}
          userRole={membership?.role}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onPostCreated={handlePostCreated}
        />
      )}
    </div>
  );
};
