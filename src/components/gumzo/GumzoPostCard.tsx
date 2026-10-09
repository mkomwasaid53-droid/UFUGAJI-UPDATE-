import React, { useState } from 'react';
import {
  Shield,
  Clock,
  MoreVertical,
  Edit2,
  Trash2,
  EyeOff,
  Eye,
  Pin,
  Check,
  X,
  AlertTriangle,
  Loader2,
  MessageSquare
} from 'lucide-react';
import {
  GumzoPost,
  GumzoGroup,
  GumzoMembership,
  canUserEditPost,
  canUserDeletePost
} from '../../types/gumzo';
import { gumzoPostService } from '../../services/gumzoPostService';
import { GumzoCommentSection } from './GumzoCommentSection';

interface GumzoPostCardProps {
  post: GumzoPost;
  group: GumzoGroup;
  currentUserId: string;
  membership?: GumzoMembership | null;
  isPlatformAdmin?: boolean;
  onPostUpdated: (updated: GumzoPost) => void;
  onPostDeleted: (deletedPostId: string) => void;
}

export const GumzoPostCard: React.FC<GumzoPostCardProps> = ({
  post,
  group,
  currentUserId,
  membership,
  isPlatformAdmin = false,
  onPostUpdated,
  onPostDeleted,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canEdit = canUserEditPost(currentUserId, post, group, isPlatformAdmin);
  const canDelete = canUserDeletePost(currentUserId, post, group, isPlatformAdmin);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('sw-TZ', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() && post.media.length === 0) {
      setErrorMsg('Maudhui ya chapisho hayawezi kuwa tupu.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);
      const updated = await gumzoPostService.postBrowserUpdatePost({
        postId: post.postId,
        groupId: post.groupId,
        input: { content: editContent.trim() },
        callerUserId: currentUserId,
        userRole: isPlatformAdmin ? 'admin' : undefined,
      });
      setIsEditing(false);
      onPostUpdated(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu wakati wa kuhifadhi mabadiliko.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePin = async () => {
    try {
      const updated = await gumzoPostService.postBrowserUpdatePost({
        postId: post.postId,
        groupId: post.groupId,
        input: { isPinned: !post.isPinned },
        callerUserId: currentUserId,
        userRole: isPlatformAdmin ? 'admin' : undefined,
      });
      setShowMenu(false);
      onPostUpdated(updated);
    } catch (err: any) {
      alert(err.message || 'Imeshindwa kubandika/kubandua chapisho.');
    }
  };

  const handleToggleVisibility = async () => {
    const nextVis = post.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE';
    try {
      const updated = await gumzoPostService.postBrowserUpdatePost({
        postId: post.postId,
        groupId: post.groupId,
        input: { visibility: nextVis, status: nextVis === 'HIDDEN' ? 'HIDDEN' : 'PUBLISHED' },
        callerUserId: currentUserId,
        userRole: isPlatformAdmin ? 'admin' : undefined,
      });
      setShowMenu(false);
      onPostUpdated(updated);
    } catch (err: any) {
      alert(err.message || 'Imeshindwa kubadilisha uonekano.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Je, una uhakika unataka kufuta chapisho hili?')) {
      return;
    }
    try {
      await gumzoPostService.postBrowserDeletePost({
        postId: post.postId,
        groupId: post.groupId,
        callerUserId: currentUserId,
        userRole: isPlatformAdmin ? 'admin' : undefined,
      });
      setShowMenu(false);
      onPostDeleted(post.postId);
    } catch (err: any) {
      alert(err.message || 'Imeshindwa kufuta chapisho.');
    }
  };

  return (
    <article className={`bg-white rounded-2xl border transition-all overflow-hidden ${
      post.isPinned
        ? 'border-emerald-300 shadow-xs bg-gradient-to-b from-emerald-50/20 to-white'
        : 'border-stone-200/90 hover:border-stone-300'
    }`}>
      {/* Pinned banner if pinned */}
      {post.isPinned && (
        <div className="bg-emerald-600 text-white text-[11px] font-bold px-4 py-1 flex items-center gap-1.5">
          <Pin className="w-3 h-3 rotate-45" />
          <span>Chapisho Lililobandikwa (Pinned Announcement)</span>
        </div>
      )}

      {/* Post Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center font-bold text-sm shrink-0">
            {post.authorRole === 'FOUNDER_ADMIN' ? 'FA' : 'LA'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-stone-900">
                {post.authorRole === 'FOUNDER_ADMIN' ? 'Msimamizi Mwanzilishi' : 'Uongozi wa Jukwaa'}
              </span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                post.authorRole === 'FOUNDER_ADMIN'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                <Shield className="w-2.5 h-2.5" />
                <span>{post.authorRole === 'FOUNDER_ADMIN' ? 'Founder Admin' : 'Leadership Admin'}</span>
              </span>

              {post.status === 'DRAFT' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Rasimu (Draft)
                </span>
              )}
              {post.visibility === 'HIDDEN' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-300">
                  Limefichwa (Hidden)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
              <Clock className="w-3 h-3" />
              <span>{formatDate(post.publishedAt || post.createdAt)}</span>
              {post.updatedAt !== post.createdAt && (
                <span className="italic">(limehaririwa)</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Menu (Only for authorized editors/admins) */}
        {(canEdit || canDelete) && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-stone-200 py-1.5 z-20 animate-in fade-in duration-100 text-xs">
                {canEdit && !isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-stone-50 text-stone-700 flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Hariri Chapisho</span>
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={handleTogglePin}
                    className="w-full text-left px-3.5 py-2 hover:bg-stone-50 text-stone-700 flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Pin className="w-3.5 h-3.5" />
                    <span>{post.isPinned ? 'Bandua Chapisho (Unpin)' : 'Bandika Juu (Pin)'}</span>
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={handleToggleVisibility}
                    className="w-full text-left px-3.5 py-2 hover:bg-stone-50 text-stone-700 flex items-center gap-2 cursor-pointer font-medium"
                  >
                    {post.visibility === 'VISIBLE' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ficha Chapisho</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Onyesha Chapisho</span>
                      </>
                    )}
                  </button>
                )}

                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer font-medium border-t border-stone-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Futa Chapisho</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post Content */}
      <div className="px-4 sm:px-5 pb-4 space-y-3">
        {isEditing ? (
          <div className="space-y-3 pt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              maxLength={5000}
              className="w-full text-sm border border-stone-300 focus:border-emerald-600 rounded-xl p-3 outline-hidden transition-all"
            />
            {errorMsg && (
              <p className="text-xs text-rose-600 font-medium">{errorMsg}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(post.content);
                  setErrorMsg(null);
                }}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                <span>Hifadhi</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
            {post.content}
          </p>
        )}

        {/* Media Attachments */}
        {post.media && post.media.length > 0 && (
          <div className="space-y-2 pt-1">
            {post.media.map((med) => (
              <div key={med.id} className="rounded-xl overflow-hidden border border-stone-200 bg-stone-50 max-h-96">
                {med.type === 'image' && (
                  <img
                    src={med.url}
                    alt={med.caption || 'Kiambatisho cha chapisho'}
                    className="w-full h-auto object-cover max-h-96"
                    loading="lazy"
                  />
                )}
                {med.type === 'video' && (
                  <video
                    src={med.url}
                    controls
                    className="w-full max-h-96 bg-black rounded-lg"
                    preload="metadata"
                  />
                )}
                {med.caption && (
                  <p className="text-[11px] text-stone-500 italic p-2 bg-stone-50 border-t border-stone-100">
                    {med.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* V9.3 — Comments Action Bar & Section */}
      <div className="px-4 sm:px-5 py-2.5 bg-stone-50/70 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
        <button
          type="button"
          onClick={() => setShowComments((prev) => !prev)}
          className="inline-flex items-center gap-1.5 font-bold text-emerald-800 hover:text-emerald-950 transition-colors cursor-pointer py-1 px-2 -ml-2 rounded-lg hover:bg-stone-100"
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
          <span>
            {typeof post.commentCount === 'number' && post.commentCount > 0
              ? `${post.commentCount} Maoni`
              : 'Toa Maoni (Comments)'}
          </span>
        </button>
        <span className="text-[11px] text-stone-400">
          Mada Rasmi ya Uongozi
        </span>
      </div>

      {showComments && (
        <div className="px-4 sm:px-5 pb-4">
          <GumzoCommentSection
            groupId={group.groupId}
            group={group}
            post={post}
            currentUserId={currentUserId}
            membership={membership}
            isAdmin={Boolean(isPlatformAdmin)}
            isGroupAdmin={Boolean(
              group.founderAdminUserId === currentUserId ||
              group.leadershipAdminUserId === currentUserId ||
              isPlatformAdmin
            )}
            onCommentCountChanged={(newCount) => {
              onPostUpdated({ ...post, commentCount: newCount });
            }}
          />
        </div>
      )}
    </article>
  );
};
