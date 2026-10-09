import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Loader2,
  AlertCircle,
  MessageSquare,
  Image,
  Video,
  Smile,
  ChevronDown,
  Info,
  Lock,
  Upload,
  X,
  CheckCircle2,
  Paperclip
} from 'lucide-react';
import {
  GumzoPost,
  GumzoGroup,
  GumzoComment,
  GumzoMembership,
  canUserCreateComment
} from '../../types/gumzo';
import { gumzoCommentService } from '../../services/gumzoCommentService';
import { gumzoGroupService } from '../../services/gumzoGroupService';
import { uploadGumzoCommentMedia } from '../../services/mediaService';
import { GumzoCommentCard } from './GumzoCommentCard';

interface GumzoCommentSectionProps {
  groupId: string;
  group?: GumzoGroup;
  post: GumzoPost;
  currentUserId: string;
  membership?: GumzoMembership | null;
  isAdmin: boolean;
  isGroupAdmin: boolean;
  onCommentCountChanged?: (newCount: number) => void;
}

const COMMON_EMOJIS = ['👍', '👏', '🐮', '🐔', '🐐', '❤️', '😂', '🌿'];

export const GumzoCommentSection: React.FC<GumzoCommentSectionProps> = ({
  groupId,
  group,
  post,
  currentUserId,
  membership: propMembership,
  isAdmin,
  isGroupAdmin,
  onCommentCountChanged,
}) => {
  const [comments, setComments] = useState<GumzoComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [activeCount, setActiveCount] = useState(post.commentCount ?? 0);

  // Resolved membership state (falls back to local lookup if prop was omitted)
  const [resolvedMembership, setResolvedMembership] = useState<GumzoMembership | null>(
    propMembership || null
  );

  useEffect(() => {
    if (propMembership) {
      setResolvedMembership(propMembership);
    } else if (currentUserId && groupId) {
      // 1. Check local cache first for instant UI response
      const local = gumzoGroupService.getMembership(groupId, currentUserId);
      if (local) {
        setResolvedMembership(local);
      }
      // 2. Query authoritative server membership to guarantee active members are not rejected
      gumzoGroupService.fetchBrowserGroupById(groupId, currentUserId)
        .then((res) => {
          if (res.membership) {
            setResolvedMembership(res.membership);
          }
        })
        .catch((err) => {
          console.warn('[GumzoCommentSection] Membership lookup notice:', err);
        });
    }
  }, [propMembership, groupId, currentUserId]);

  // Composer state
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authorization check for creating comments
  const targetGroup: GumzoGroup = group || ({
    groupId,
    status: 'ACTIVE',
    founderAdminUserId: '',
    leadershipAdminUserId: '',
  } as any);

  const authDecision = canUserCreateComment(
    currentUserId,
    targetGroup,
    post,
    resolvedMembership,
    isAdmin
  );

  const loadComments = async (reset = false) => {
    try {
      setIsLoading(true);
      const targetOffset = reset ? 0 : offset;
      const res = await gumzoCommentService.fetchBrowserPostComments({
        groupId,
        postId: post.postId,
        callerUserId: currentUserId,
        limit: 20,
        offset: targetOffset,
      });

      if (reset) {
        setComments(res.comments);
        setOffset(res.comments.length);
      } else {
        setComments((prev) => {
          const existingIds = new Set(prev.map((c) => c.commentId));
          const newOnes = res.comments.filter((c) => !existingIds.has(c.commentId));
          return [...prev, ...newOnes];
        });
        setOffset((prev) => prev + res.comments.length);
      }

      setHasMore(res.hasMore);
      setActiveCount(res.activeCount);
      onCommentCountChanged?.(res.activeCount);
    } catch (err: any) {
      console.warn('Hitilafu ya kupakia maoni:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComments(true);
  }, [groupId, post.postId, currentUserId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|3gp|m4v)$/i);
    const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    const maxLabel = isVideo ? '50MB' : '15MB';

    if (file.size > maxBytes) {
      setComposerError(`Faili limezidi ukubwa unaoruhusiwa wa ${maxLabel} (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }

    setComposerError(null);
    setSelectedFile(file);
    setFileType(isVideo ? 'video' : 'image');

    const preview = URL.createObjectURL(file);
    setFilePreviewUrl(preview);
  };

  const handleClearAttachment = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setFileType(null);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();

    if (!trimmed && !selectedFile) {
      setComposerError('Tafadhali andika maoni au ambatanisha picha/video kabla ya kutuma.');
      return;
    }

    try {
      setIsSubmitting(true);
      setComposerError(null);

      let media: any[] | undefined;

      if (selectedFile) {
        setIsUploadingMedia(true);
        setUploadProgress(15);
        try {
          const uploadedMedia = await uploadGumzoCommentMedia({
            groupId,
            file: selectedFile,
            callerUserId: currentUserId,
            onProgress: (pct) => setUploadProgress(pct),
          });
          media = [uploadedMedia];
        } catch (uploadErr: any) {
          setIsUploadingMedia(false);
          setUploadProgress(null);
          setComposerError(uploadErr.message || 'Hitilafu wakati wa kupakia faili la maoni.');
          return;
        } finally {
          setIsUploadingMedia(false);
        }
      }

      const clientRequestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const created = await gumzoCommentService.postBrowserCreateComment({
        groupId,
        postId: post.postId,
        input: {
          content: trimmed,
          media,
          clientRequestId,
        },
        callerUserId: currentUserId,
      });

      // Append to comments
      setComments((prev) => [...prev, created]);
      setContent('');
      handleClearAttachment();
      setShowEmojiPicker(false);

      const nextCount = activeCount + 1;
      setActiveCount(nextCount);
      onCommentCountChanged?.(nextCount);
    } catch (err: any) {
      setComposerError(err.message || 'Imeshindwa kutuma maoni.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setContent((prev) => prev + emoji);
  };

  const handleCommentUpdated = (updated: GumzoComment) => {
    if (updated.status === 'HIDDEN' && !isAdmin && !isGroupAdmin && updated.authorUserId !== currentUserId) {
      // Remove from normal view if hidden by admin and not author
      setComments((prev) => prev.filter((c) => c.commentId !== updated.commentId));
      const nextCount = Math.max(0, activeCount - 1);
      setActiveCount(nextCount);
      onCommentCountChanged?.(nextCount);
      return;
    }
    setComments((prev) => prev.map((c) => (c.commentId === updated.commentId ? updated : c)));
  };

  const handleCommentDeleted = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.commentId !== commentId));
    const nextCount = Math.max(0, activeCount - 1);
    setActiveCount(nextCount);
    onCommentCountChanged?.(nextCount);
  };

  return (
    <div className="pt-3 border-t border-stone-100 space-y-3">
      {/* Header with count */}
      <div className="flex items-center justify-between text-xs text-stone-600 px-1">
        <span className="font-bold flex items-center gap-1.5 text-stone-800">
          <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
          <span>Maoni ya Wanachama ({activeCount})</span>
        </span>
        <span className="text-[11px] text-stone-400">
          Mada wazi kwa wanachama
        </span>
      </div>

      {/* Composer (Visible to active members/admins; notice shown otherwise) */}
      {authDecision.allowed ? (
        <form onSubmit={handleSubmit} className="space-y-2 bg-stone-50/80 p-3 rounded-xl border border-stone-200/90">
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Andika maoni yako hapa... (Swahili, English, emoji 👍)"
              rows={2}
              className="w-full p-2.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 resize-none"
            />
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Media Attachment Preview if file selected */}
          {selectedFile && filePreviewUrl && (
            <div className="p-2.5 bg-white rounded-lg border border-stone-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs font-semibold text-stone-800 truncate max-w-[200px]">
                    {selectedFile.name}
                  </span>
                  <span className="text-[10px] text-stone-500">
                    ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearAttachment}
                  className="p-1 text-stone-400 hover:text-rose-600 rounded cursor-pointer"
                  title="Ondoa kiambatisho"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="rounded-lg overflow-hidden max-h-32 bg-black flex items-center justify-center">
                {fileType === 'video' ? (
                  <video
                    src={filePreviewUrl}
                    controls
                    className="max-h-32 w-full object-contain"
                  />
                ) : (
                  <img
                    src={filePreviewUrl}
                    alt="Hakikisho la kiambatisho"
                    className="max-h-32 w-full object-contain"
                  />
                )}
              </div>

              {isUploadingMedia && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-emerald-800 font-bold">
                    <span>Inapakia faili kwenye kumbukumbu...</span>
                    <span>{uploadProgress || 10}%</span>
                  </div>
                  <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${uploadProgress || 15}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Emoji & Media Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-1.5 pt-0.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-stone-400 font-semibold mr-1">Emoji:</span>
              {COMMON_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => handleEmojiClick(em)}
                  className="w-6 h-6 rounded hover:bg-stone-200/70 text-xs flex items-center justify-center transition-colors cursor-pointer"
                  title={`Weka ${em}`}
                >
                  {em}
                </button>
              ))}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`ml-1 text-[11px] font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  selectedFile
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                }`}
                title="Ambatanisha picha au video"
              >
                <Paperclip className="w-3 h-3 text-stone-500" />
                <span>{selectedFile ? 'Badili Faili' : 'Picha/Video'}</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || (!content.trim() && !selectedFile)}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-xs min-h-[32px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Inatuma...</span>
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  <span>Tuma</span>
                </>
              )}
            </button>
          </div>

          {/* Composer Error */}
          {composerError && (
            <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{composerError}</span>
            </div>
          )}
        </form>
      ) : (
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-500 flex items-center gap-2">
          <Lock className="w-4 h-4 text-stone-400 shrink-0" />
          <span>{authDecision.reason || 'Jiunge na kikundi hiki ili uweze kutoa maoni.'}</span>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-2 pt-1">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <GumzoCommentCard
              key={comment.commentId}
              comment={comment}
              groupId={groupId}
              postId={post.postId}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isGroupAdmin={isGroupAdmin}
              onCommentUpdated={handleCommentUpdated}
              onCommentDeleted={handleCommentDeleted}
            />
          ))
        ) : isLoading ? (
          <div className="py-4 text-center text-xs text-stone-400 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
            <span>Inapakia maoni...</span>
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-stone-400 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
            Hakuna maoni bado. Kuwa wa kwanza kutoa maoni!
          </div>
        )}

        {/* Load More Pagination */}
        {hasMore && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => loadComments(false)}
              disabled={isLoading}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Inapakia...</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Tazama maoni zaidi</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
