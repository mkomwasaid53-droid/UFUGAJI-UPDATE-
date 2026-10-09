import React, { useState } from 'react';
import {
  Shield,
  Clock,
  MoreVertical,
  Edit2,
  Trash2,
  EyeOff,
  Check,
  X,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { GumzoComment } from '../../types/gumzo';
import { gumzoCommentService } from '../../services/gumzoCommentService';

interface GumzoCommentCardProps {
  comment: GumzoComment;
  groupId: string;
  postId: string;
  currentUserId: string;
  isAdmin: boolean;
  isGroupAdmin: boolean;
  onCommentUpdated: (updated: GumzoComment) => void;
  onCommentDeleted: (commentId: string) => void;
}

export const GumzoCommentCard: React.FC<GumzoCommentCardProps> = ({
  comment,
  groupId,
  postId,
  currentUserId,
  isAdmin,
  isGroupAdmin,
  onCommentUpdated,
  onCommentDeleted,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAuthor = currentUserId === comment.authorUserId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isGroupAdmin || isAdmin;
  const canHide = isGroupAdmin || isAdmin;

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed && (!comment.media || comment.media.length === 0)) {
      setActionError('Maoni hayawezi kuwa matupu.');
      return;
    }
    try {
      setIsSaving(true);
      setActionError(null);
      const updated = await gumzoCommentService.postBrowserUpdateComment({
        groupId,
        postId,
        commentId: comment.commentId,
        input: { content: trimmed },
        callerUserId: currentUserId,
      });
      setIsEditing(false);
      onCommentUpdated(updated);
    } catch (err: any) {
      setActionError(err.message || 'Imeshindwa kuhifadhi mabadiliko ya maoni.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Je, una uhakika unataka kufuta maoni haya?')) {
      return;
    }
    try {
      setIsDeleting(true);
      setActionError(null);
      await gumzoCommentService.postBrowserDeleteComment({
        groupId,
        postId,
        commentId: comment.commentId,
        callerUserId: currentUserId,
      });
      setShowMenu(false);
      onCommentDeleted(comment.commentId);
    } catch (err: any) {
      setActionError(err.message || 'Imeshindwa kufuta maoni.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleHide = async () => {
    try {
      setIsSaving(true);
      setActionError(null);
      const hidden = await gumzoCommentService.postBrowserHideComment({
        groupId,
        postId,
        commentId: comment.commentId,
        callerUserId: currentUserId,
      });
      setShowMenu(false);
      onCommentUpdated(hidden);
    } catch (err: any) {
      setActionError(err.message || 'Imeshindwa kuficha maoni.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('sw-TZ', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const roleBadge = () => {
    if (comment.authorRole === 'FOUNDER_ADMIN') {
      return (
        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-0.5">
          <Shield className="w-2.5 h-2.5 text-amber-700" />
          Mwanzilishi
        </span>
      );
    }
    if (comment.authorRole === 'LEADERSHIP_ADMIN') {
      return (
        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-0.5">
          <Shield className="w-2.5 h-2.5 text-emerald-700" />
          Kiongozi
        </span>
      );
    }
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
        Mwanachama
      </span>
    );
  };

  return (
    <div className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
      comment.status === 'HIDDEN'
        ? 'bg-amber-50/40 border-dashed border-amber-300'
        : 'bg-stone-50/70 hover:bg-stone-50 border-stone-200/80'
    }`}>
      {/* Comment Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-6 h-6 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-bold text-[11px] shrink-0">
            {(comment.authorDisplayName || comment.authorUserId || 'M').charAt(0).toUpperCase()}
          </div>
          <span className="font-bold text-stone-900">
            {comment.authorDisplayName || (isAuthor ? 'Wewe' : `Mfugaji ${comment.authorUserId.slice(-4)}`)}
          </span>
          {roleBadge()}
          <span className="text-[10px] text-stone-400 inline-flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {formatTime(comment.createdAt)}
          </span>
          {comment.isEdited && (
            <span className="text-[10px] text-stone-400 italic">
              (imehaririwa)
            </span>
          )}
          {comment.status === 'HIDDEN' && (
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900">
              Limefichwa na Uongozi
            </span>
          )}
        </div>

        {/* Action Menu button (for author or admin) */}
        {(canEdit || canDelete || canHide) && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
              title="Chaguo"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div
                className="absolute right-0 top-6 w-36 bg-white rounded-xl shadow-lg border border-stone-200 py-1 z-20 text-xs"
                onMouseLeave={() => setShowMenu(false)}
              >
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-stone-700 hover:bg-stone-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3 text-stone-500" />
                    <span>Hariri Maoni</span>
                  </button>
                )}
                {canHide && comment.status === 'PUBLISHED' && (
                  <button
                    type="button"
                    onClick={handleHide}
                    disabled={isSaving}
                    className="w-full text-left px-3 py-1.5 text-amber-700 hover:bg-amber-50 flex items-center gap-2 cursor-pointer"
                  >
                    <EyeOff className="w-3 h-3 text-amber-600" />
                    <span>Ficha Maoni</span>
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3 text-rose-500" />
                    <span>Futa Maoni</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Error if any */}
      {actionError && (
        <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[11px] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Comment Body / Edit View */}
      {isEditing ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={2}
            className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            placeholder="Rekebisha maoni yako..."
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditContent(comment.content);
              }}
              disabled={isSaving}
              className="px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-200 rounded cursor-pointer"
            >
              Ghairi
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="px-3 py-1 text-[11px] font-bold bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-colors flex items-center gap-1 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              <span>Hifadhi</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="text-stone-800 leading-relaxed whitespace-pre-wrap break-words">
          {comment.content}
        </div>
      )}

      {/* Comment Media Attachments if any */}
      {comment.media && comment.media.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {comment.media.map((med) => (
            <div key={med.id} className="rounded-lg overflow-hidden border border-stone-200 bg-white">
              {med.type === 'image' && (
                <img
                  src={med.url}
                  alt={med.caption || 'Picha ya maoni'}
                  className="w-full h-32 object-cover"
                  loading="lazy"
                />
              )}
              {med.type === 'video' && (
                <video
                  src={med.url}
                  controls
                  className="w-full h-32 object-cover bg-black"
                  preload="metadata"
                />
              )}
              {med.caption && (
                <p className="text-[10px] text-stone-500 italic p-1 bg-stone-50">
                  {med.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
