/**
 * V9.3 — GUMZO MEMBER COMMENTS SERVICE
 *
 * Implements authoritative business logic and persistence for Gumzo Member Comments:
 * Core Principle: Admin creates the post/topic; members & admins participate via comments.
 *
 * Enforces:
 * 1. Post/Comment Relationship (comment belongs strictly to one post and one group)
 * 2. Role Authorization (MEMBER, FOUNDER_ADMIN, LEADERSHIP_ADMIN can comment on active published posts)
 * 3. Server-authoritative derivation of authorUserId, authorRole, groupId, postId, timestamps
 * 4. Comment lifecycle: PUBLISHED, HIDDEN, DELETED (Soft-delete & soft-hide audit preservation)
 * 5. Comment editing: Member can only edit own comment; Admins have governance management authority
 * 6. Comment deletion/hiding: Member can delete own comment; Admins can delete or hide
 * 7. Comment ordering: createdAt ASC (oldest -> newest within a post)
 * 8. Authoritative active comment count per post
 * 9. Safe media handling (IMAGE, VIDEO) & Unicode emoji persistence
 * 10. Prepared event hooks for future notification layer (V9.5)
 */

import {
  GumzoComment,
  GumzoCommentStatus,
  CreateGumzoCommentInput,
  UpdateGumzoCommentInput,
  GumzoMediaItem,
  canUserCreateComment,
  canUserEditComment,
  canUserDeleteComment,
  canUserHideComment,
  canUserViewComment
} from '../types/gumzo';
import { gumzoGroupService } from './gumzoGroupService';
import { gumzoPostService } from './gumzoPostService';
import { gumzoAuditService } from './gumzoAuditService';
import { dispatchGumzoCommentNotification } from './notificationService';

const isNode = typeof window === 'undefined';

// Local storage key for browser hydration
const LOCAL_COMMENTS_KEY = 'ufugaji_gumzo_comments';

// In-memory primary store for comments: Key = commentId
const commentsStore = new Map<string, GumzoComment>();

// In-memory idempotency cache: Key = `${userId}_${clientRequestId}` -> commentId
const idempotencyStore = new Map<string, string>();

function hydrateFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((c: GumzoComment) => commentsStore.set(c.commentId, c));
      }
    }
  } catch {}
}

function persistToLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(Array.from(commentsStore.values())));
  } catch {}
}

if (!isNode) {
  hydrateFromLocalStorage();
}

// Disk persistence handles (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let COMMENTS_FILE = 'data/gumzo_comments.json';

export function initGumzoCommentsStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  COMMENTS_FILE = diskPath ? diskPath.join(baseDir, 'gumzo_comments.json') : `${baseDir}/gumzo_comments.json`;

  hasLoadedFromDisk = false;
  loadFromDisk(true);
}

let hasLoadedFromDisk = false;

// Auto-initialize if running in Node.js
if (isNode) {
  try {
    import('fs').then((f) => {
      if (!diskFs) {
        diskFs = f.default || f;
        import('path').then((p) => {
          diskPath = p.default || p;
          initGumzoCommentsStorage(diskFs, diskPath);
        }).catch(() => {});
      }
    }).catch(() => {});
  } catch {}
}

function loadFromDisk(force = false): void {
  if (!diskFs || !diskFs.existsSync) return;
  if (hasLoadedFromDisk && !force) return;
  hasLoadedFromDisk = true;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    if (diskFs.existsSync(COMMENTS_FILE)) {
      const data = JSON.parse(diskFs.readFileSync(COMMENTS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        commentsStore.clear();
        data.forEach((c: GumzoComment) => commentsStore.set(c.commentId, c));
      }
    }
  } catch (err) {
    console.warn('[gumzoCommentService] Disk load warning:', err);
  }
}

function persistToDisk(): void {
  if (typeof window !== 'undefined') {
    persistToLocalStorage();
    return;
  }
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    diskFs.writeFileSync(COMMENTS_FILE, JSON.stringify(Array.from(commentsStore.values()), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[gumzoCommentService] Disk persist warning:', err);
  }
}

// ============================================================================
// NOTIFICATION EVENT HOOKS (Prepared for V9.5)
// ============================================================================

export type GumzoCommentEventHook =
  | 'GUMZO_COMMENT_CREATED'
  | 'GUMZO_COMMENT_REPLY'
  | 'GUMZO_COMMENT_MODERATED';

export interface GumzoCommentEventPayload {
  event: GumzoCommentEventHook;
  comment: GumzoComment;
  performedByUserId: string;
  timestamp: string;
}

const eventListeners: ((payload: GumzoCommentEventPayload) => void)[] = [];

export function onGumzoCommentEvent(listener: (payload: GumzoCommentEventPayload) => void): () => void {
  eventListeners.push(listener);
  return () => {
    const idx = eventListeners.indexOf(listener);
    if (idx >= 0) eventListeners.splice(idx, 1);
  };
}

function emitCommentEvent(event: GumzoCommentEventHook, comment: GumzoComment, performedByUserId: string): void {
  const payload: GumzoCommentEventPayload = {
    event,
    comment,
    performedByUserId,
    timestamp: new Date().toISOString()
  };
  eventListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.warn('[gumzoCommentService] Event hook listener error:', e);
    }
  });
}

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

export class GumzoCommentService {
  /**
   * 1. CREATE COMMENT (Server-Authoritative)
   *
   * Enforces:
   * - Authenticated caller
   * - Parent group exists, is active, not suspended/archived
   * - Parent post exists, belongs to groupId, is PUBLISHED and VISIBLE
   * - Caller is active MEMBER, FOUNDER_ADMIN, LEADERSHIP_ADMIN, or platform admin
   * - Content is validated (prevent empty comments; max 2000 chars)
   * - Optional media validation (max 4 items, safe types)
   * - Server-authoritatively locks authorUserId, authorRole, groupId, postId, timestamps
   * - Idempotency protection against double-click submission
   * - Updates parent post commentCount
   * - Emits GUMZO_COMMENT_CREATED hook
   */
  public createComment(params: {
    groupId: string;
    postId: string;
    input: CreateGumzoCommentInput;
    authenticatedUserId: string;
    authorDisplayName?: string;
    isPlatformAdmin?: boolean;
  }): GumzoComment {
    const {
      groupId,
      postId,
      input,
      authenticatedUserId,
      authorDisplayName,
      isPlatformAdmin = false
    } = params;

    if (isNode) loadFromDisk();

    if (!authenticatedUserId || !authenticatedUserId.trim()) {
      throw new Error('Huruhusiwi kuweka maoni bila kuingia kwenye mfumo (Authenticated user required).');
    }

    if (!groupId || !groupId.trim()) {
      throw new Error('Kitambulisho cha kikundi (groupId) kinahitajika.');
    }
    if (!postId || !postId.trim()) {
      throw new Error('Kitambulisho cha chapisho (postId) kinahitajika.');
    }

    // 1. Idempotency Check
    if (input.clientRequestId) {
      const idempotencyKey = `${authenticatedUserId}_${input.clientRequestId}`;
      const existingCommentId = idempotencyStore.get(idempotencyKey);
      if (existingCommentId) {
        const existing = commentsStore.get(existingCommentId);
        if (existing) {
          return existing;
        }
      }
    }

    // 2. Validate Parent Group
    const group = gumzoGroupService.getGroupById(groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error('Kikundi hakikupatikana au hakiruhusu ufikiaji.');
    }

    // 3. Validate Parent Post
    const post = gumzoPostService.getRawPost(postId);
    if (!post) {
      throw new Error('Chapisho halikupatikana.');
    }
    if (post.groupId !== groupId) {
      throw new Error('Chapisho halilingani na kikundi kilichoombwa (Group and post mismatch).');
    }

    // 4. Verify Membership & Comment Authorization
    const membership = gumzoGroupService.getMembership(groupId, authenticatedUserId);
    const decision = canUserCreateComment(authenticatedUserId, group, post, membership, isPlatformAdmin);
    if (!decision.allowed) {
      gumzoAuditService.logEvent({
        actorUserId: authenticatedUserId,
        action: 'PRIVILEGE_ESCALATION_ATTEMPT',
        targetType: 'COMMENT',
        targetResourceId: postId,
        groupId,
        outcome: 'DENIED',
        reason: decision.reason || 'Mtumiaji asiye na uanachama hai amejaribu kuweka maoni.',
        details: { membershipStatus: membership?.status, role: membership?.role },
      });
      const err = new Error(decision.reason || 'Huna ruhusa ya kuweka maoni kwenye chapisho hili (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    // 5. Content Validation
    const trimmedContent = (input.content || '').trim();
    const hasMedia = Array.isArray(input.media) && input.media.length > 0;

    if (!trimmedContent && !hasMedia) {
      throw new Error('Maoni hayawezi kuwa matupu. Andika ujumbe au ambatanisha picha/video.');
    }
    if (trimmedContent.length > 2000) {
      throw new Error('Maoni ni marefu mno. Kiwango cha juu ni herufi 2,000.');
    }

    // 6. Media Validation (reusing existing safe media rules)
    let validatedMedia: GumzoMediaItem[] | undefined;
    if (hasMedia) {
      if (input.media!.length > 4) {
        throw new Error('Huwezi kuambatanisha zaidi ya faili 4 za media kwenye maoni moja.');
      }
      validatedMedia = input.media!.map((m, idx) => {
        if (!m.url || (!m.url.startsWith('/') && !m.url.startsWith('data:') && !m.url.startsWith('http'))) {
          throw new Error(`Kiungo cha faili ya media namba ${idx + 1} si sahihi.`);
        }
        return {
          id: m.id || `cmt_m_${Date.now()}_${idx}`,
          type: m.type === 'video' ? 'video' : 'image',
          url: m.url,
          storagePath: m.storagePath,
          thumbnailUrl: m.thumbnailUrl,
          caption: m.caption ? m.caption.slice(0, 300) : undefined,
          sizeBytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : undefined,
          mimeType: m.mimeType,
        };
      });
    }

    // 7. Server-Authoritative Assignment
    const now = new Date().toISOString();
    const commentId = `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const authorRole = decision.userRole || 'MEMBER';

    const newComment: GumzoComment = {
      commentId,
      groupId,
      postId,
      authorUserId: authenticatedUserId,
      authorRole,
      authorDisplayName: authorDisplayName || undefined,
      content: trimmedContent,
      media: validatedMedia,
      status: 'PUBLISHED',
      createdAt: now,
      updatedAt: now,
      createdBy: authenticatedUserId,
      updatedBy: authenticatedUserId,
      parentCommentId: input.parentCommentId || undefined
    };

    commentsStore.set(commentId, newComment);

    if (input.clientRequestId) {
      idempotencyStore.set(`${authenticatedUserId}_${input.clientRequestId}`, commentId);
    }

    persistToDisk();

    // 8. Update post commentCount atomically
    const activeCount = this.getActiveCommentCount(postId);
    gumzoPostService.updatePostCommentCount(postId, activeCount);

    // 9. Emit event hook and dispatch notification
    emitCommentEvent('GUMZO_COMMENT_CREATED', newComment, authenticatedUserId);
    try {
      const parentPost = gumzoPostService.getRawPost(postId);
      if (parentPost && parentPost.authorUserId && parentPost.authorUserId !== authenticatedUserId) {
        dispatchGumzoCommentNotification({
          postAuthorUserId: parentPost.authorUserId,
          commentAuthorUserId: authenticatedUserId,
          commentAuthorName: authorDisplayName || undefined,
          groupId,
          groupName: 'Kikundi cha Gumzo',
          postId,
          commentId,
          commentTextPreview: trimmedContent
        }).catch(() => {});
      }
    } catch {}

    return newComment;
  }

  /**
   * 2. GET POST COMMENTS
   *
   * Ordered by createdAt ASC (oldest -> newest, as specified in V9.3 requirement 12).
   * Excludes DELETED comments.
   * Excludes HIDDEN comments unless caller is author or group admin.
   * Supports pagination (limit, offset).
   */
  public getPostComments(params: {
    groupId: string;
    postId: string;
    callerUserId?: string | null;
    isPlatformAdmin?: boolean;
    limit?: number;
    offset?: number;
  }): {
    comments: GumzoComment[];
    total: number;
    activeCount: number;
    hasMore: boolean;
  } {
    const {
      groupId,
      postId,
      callerUserId,
      isPlatformAdmin = false,
      limit = 20,
      offset = 0
    } = params;

    if (isNode) loadFromDisk();

    const group = gumzoGroupService.getGroupById(groupId, callerUserId, isPlatformAdmin);
    if (!group) {
      return { comments: [], total: 0, activeCount: 0, hasMore: false };
    }

    const post = gumzoPostService.getRawPost(postId);
    if (!post || post.groupId !== groupId) {
      return { comments: [], total: 0, activeCount: 0, hasMore: false };
    }

    const membership = callerUserId ? gumzoGroupService.getMembership(groupId, callerUserId) : null;

    // Filter comments belonging to this post & group and visible to caller
    const allPostComments = Array.from(commentsStore.values()).filter((c) => {
      if (c.groupId !== groupId || c.postId !== postId) return false;
      return canUserViewComment(callerUserId, c, group, post, membership, isPlatformAdmin);
    });

    // Order: createdAt ASC (requirement 12: oldest first)
    allPostComments.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const activeCount = allPostComments.filter((c) => c.status === 'PUBLISHED').length;
    const paginated = allPostComments.slice(offset, offset + limit);
    const hasMore = offset + paginated.length < allPostComments.length;

    return {
      comments: paginated,
      total: allPostComments.length,
      activeCount,
      hasMore
    };
  }

  /**
   * 3. GET SINGLE COMMENT BY ID
   */
  public getCommentById(
    groupId: string,
    postId: string,
    commentId: string,
    callerUserId?: string | null,
    isPlatformAdmin = false
  ): GumzoComment | null {
    if (isNode) loadFromDisk();
    const comment = commentsStore.get(commentId);
    if (!comment || comment.groupId !== groupId || comment.postId !== postId) {
      return null;
    }

    const group = gumzoGroupService.getGroupById(groupId, callerUserId, isPlatformAdmin);
    if (!group) return null;

    const post = gumzoPostService.getRawPost(postId);
    if (!post) return null;

    const membership = callerUserId ? gumzoGroupService.getMembership(groupId, callerUserId) : null;
    if (!canUserViewComment(callerUserId, comment, group, post, membership, isPlatformAdmin)) {
      return null;
    }

    return comment;
  }

  /**
   * 4. EDIT COMMENT
   *
   * Enforces:
   * - Author can edit own comment (cannot edit another member's or admin's comment)
   * - Group admins / Platform admin can manage comments
   * - Content cannot be empty
   * - Immutable: commentId, groupId, postId, authorUserId, authorRole, createdBy, createdAt
   * - Sets isEdited = true, updatedAt, updatedBy
   */
  public editComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    input: UpdateGumzoCommentInput;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoComment {
    const {
      groupId,
      postId,
      commentId,
      input,
      authenticatedUserId,
      isPlatformAdmin = false
    } = params;

    if (isNode) loadFromDisk();

    const comment = commentsStore.get(commentId);
    if (!comment || comment.groupId !== groupId || comment.postId !== postId) {
      throw new Error('Maoni hayakupatikana.');
    }

    const group = gumzoGroupService.getGroupById(groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error('Kikundi hakikupatikana.');
    }

    if (!canUserEditComment(authenticatedUserId, comment, group, isPlatformAdmin)) {
      const err = new Error('Huna ruhusa ya kurekebisha maoni haya (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    const trimmedContent = input.content !== undefined ? input.content.trim() : comment.content;
    const media = input.media !== undefined ? input.media : comment.media;

    if (!trimmedContent && (!media || media.length === 0)) {
      throw new Error('Maoni hayawezi kuwa matupu.');
    }
    if (trimmedContent.length > 2000) {
      throw new Error('Maoni ni marefu mno. Kiwango cha juu ni herufi 2,000.');
    }

    const now = new Date().toISOString();
    comment.content = trimmedContent;
    comment.media = media;
    comment.updatedAt = now;
    comment.updatedBy = authenticatedUserId;
    comment.isEdited = true;

    commentsStore.set(commentId, comment);
    persistToDisk();

    emitCommentEvent('GUMZO_COMMENT_MODERATED', comment, authenticatedUserId);

    return comment;
  }

  /**
   * Alias for editComment
   */
  public updateComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    input: UpdateGumzoCommentInput;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoComment {
    return this.editComment(params);
  }

  /**
   * 5. DELETE COMMENT (Soft-delete with audit trail)
   *
   * - Author can delete own comment
   * - Group admins / Platform admin can delete
   * - Soft-delete: status = 'DELETED', deletedAt, deletedBy
   * - Updates parent post commentCount
   */
  public deleteComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoComment {
    const {
      groupId,
      postId,
      commentId,
      authenticatedUserId,
      isPlatformAdmin = false
    } = params;

    if (isNode) loadFromDisk();

    const comment = commentsStore.get(commentId);
    if (!comment || comment.groupId !== groupId || comment.postId !== postId) {
      throw new Error('Maoni hayakupatikana.');
    }

    const group = gumzoGroupService.getGroupById(groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error('Kikundi hakikupatikana.');
    }

    if (!canUserDeleteComment(authenticatedUserId, comment, group, isPlatformAdmin)) {
      const err = new Error('Huna mamlaka ya kufuta maoni haya (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();
    comment.status = 'DELETED';
    comment.deletedAt = now;
    comment.deletedBy = authenticatedUserId;
    comment.updatedAt = now;
    comment.updatedBy = authenticatedUserId;

    commentsStore.set(commentId, comment);
    persistToDisk();

    // Update active comment count on post
    const activeCount = this.getActiveCommentCount(postId);
    gumzoPostService.updatePostCommentCount(postId, activeCount);

    emitCommentEvent('GUMZO_COMMENT_MODERATED', comment, authenticatedUserId);

    gumzoAuditService.logEvent({
      actorUserId: authenticatedUserId,
      action: 'ADMIN_COMMENT_DELETED',
      targetType: 'COMMENT',
      targetResourceId: commentId,
      groupId,
      outcome: 'SUCCESS',
      reason: comment.authorUserId === authenticatedUserId ? 'Mwandishi amefuta maoni yake.' : 'Kiongozi wa kikundi amefuta maoni.',
      details: {
        authorUserId: comment.authorUserId,
        isAuthor: comment.authorUserId === authenticatedUserId,
        postId,
      },
    });

    return comment;
  }

  /**
   * 6. HIDE COMMENT (Admin Governance Action)
   *
   * - Only authorized admins can hide
   * - Soft-hide: status = 'HIDDEN', hiddenAt, hiddenBy
   * - Disappears from normal feed, retains audit trail
   */
  public hideComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
    reason?: string;
  }): GumzoComment {
    const {
      groupId,
      postId,
      commentId,
      authenticatedUserId,
      isPlatformAdmin = false,
      reason
    } = params;

    if (isNode) loadFromDisk();

    const comment = commentsStore.get(commentId);
    if (!comment || comment.groupId !== groupId || comment.postId !== postId) {
      throw new Error('Maoni hayakupatikana.');
    }

    const group = gumzoGroupService.getGroupById(groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error('Kikundi hakikupatikana.');
    }

    if (!canUserHideComment(authenticatedUserId, comment, group, isPlatformAdmin)) {
      const err = new Error('Mamlaka ya uongozi wa kikundi yanahitajika kuficha maoni (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();
    comment.status = 'HIDDEN';
    comment.hiddenAt = now;
    comment.hiddenBy = authenticatedUserId;
    comment.updatedAt = now;
    comment.updatedBy = authenticatedUserId;

    commentsStore.set(commentId, comment);
    persistToDisk();

    // Update active comment count on post
    const activeCount = this.getActiveCommentCount(postId);
    gumzoPostService.updatePostCommentCount(postId, activeCount);

    emitCommentEvent('GUMZO_COMMENT_MODERATED', comment, authenticatedUserId);

    gumzoAuditService.logEvent({
      actorUserId: authenticatedUserId,
      action: 'ADMIN_COMMENT_HIDDEN',
      targetType: 'COMMENT',
      targetResourceId: commentId,
      groupId,
      outcome: 'SUCCESS',
      reason: reason || 'Kiongozi wa kikundi ameficha maoni haya.',
      details: {
        authorUserId: comment.authorUserId,
        postId,
      },
    });

    return comment;
  }

  /**
   * 7. GET ACTIVE COMMENT COUNT
   * Excludes DELETED and HIDDEN comments.
   */
  public getActiveCommentCount(postId: string): number {
    if (isNode) loadFromDisk();
    let count = 0;
    for (const c of commentsStore.values()) {
      if (c.postId === postId && c.status === 'PUBLISHED') {
        count++;
      }
    }
    return count;
  }

  // ============================================================================
  // BROWSER API CLIENT METHODS
  // ============================================================================

  public async fetchBrowserPostComments(params: {
    groupId: string;
    postId: string;
    callerUserId?: string;
    token?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<{ comments: GumzoComment[]; total: number; activeCount: number; hasMore: boolean }> {
    const { groupId, postId, callerUserId, token, limit = 20, offset = 0 } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;

        const query = `?limit=${limit}&offset=${offset}`;
        const res = await fetch(
          `/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments${query}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.comments)) {
            data.comments.forEach((c: GumzoComment) => commentsStore.set(c.commentId, c));
            persistToDisk();
            return {
              comments: data.comments,
              total: data.total ?? data.comments.length,
              activeCount: data.activeCount ?? data.comments.length,
              hasMore: Boolean(data.hasMore)
            };
          }
        }
      } catch (err) {
        console.warn('[gumzoCommentService] fetchBrowserPostComments network warning:', err);
      }
    }
    return this.getPostComments({ groupId, postId, callerUserId, limit, offset });
  }

  public async postBrowserCreateComment(params: {
    groupId: string;
    postId: string;
    input: CreateGumzoCommentInput;
    callerUserId: string;
    authorDisplayName?: string;
    token?: string | null;
  }): Promise<GumzoComment> {
    const { groupId, postId, input, callerUserId, authorDisplayName, token } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;

        const res = await fetch(
          `/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ input, authorDisplayName })
          }
        );
        if (res.ok) {
          const created = await res.json();
          commentsStore.set(created.commentId, created);
          persistToDisk();
          return created;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuweka maoni.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.createComment({
      groupId,
      postId,
      input,
      authenticatedUserId: callerUserId,
      authorDisplayName
    });
  }

  public async postBrowserUpdateComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    input: UpdateGumzoCommentInput;
    callerUserId: string;
    token?: string | null;
  }): Promise<GumzoComment> {
    const { groupId, postId, commentId, input, callerUserId, token } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;

        const res = await fetch(
          `/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ input })
          }
        );
        if (res.ok) {
          const updated = await res.json();
          commentsStore.set(updated.commentId, updated);
          persistToDisk();
          return updated;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kurekebisha maoni.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.editComment({
      groupId,
      postId,
      commentId,
      input,
      authenticatedUserId: callerUserId
    });
  }

  public async postBrowserDeleteComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    callerUserId: string;
    token?: string | null;
  }): Promise<GumzoComment> {
    const { groupId, postId, commentId, callerUserId, token } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;

        const res = await fetch(
          `/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/delete`,
          {
            method: 'POST',
            headers
          }
        );
        if (res.ok) {
          const deleted = await res.json();
          commentsStore.set(deleted.commentId, deleted);
          persistToDisk();
          return deleted;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kufuta maoni.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.deleteComment({
      groupId,
      postId,
      commentId,
      authenticatedUserId: callerUserId
    });
  }

  public async postBrowserHideComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    callerUserId: string;
    token?: string | null;
  }): Promise<GumzoComment> {
    const { groupId, postId, commentId, callerUserId, token } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;

        const res = await fetch(
          `/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/hide`,
          {
            method: 'POST',
            headers
          }
        );
        if (res.ok) {
          const hidden = await res.json();
          commentsStore.set(hidden.commentId, hidden);
          persistToDisk();
          return hidden;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuficha maoni.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.hideComment({
      groupId,
      postId,
      commentId,
      authenticatedUserId: callerUserId
    });
  }

  // ============================================================================
  // TESTING HELPER METHODS
  // ============================================================================

  public _clearForTesting(): void {
    commentsStore.clear();
    idempotencyStore.clear();
  }

  public _getAllForTesting(): GumzoComment[] {
    return Array.from(commentsStore.values());
  }
}

export const gumzoCommentService = new GumzoCommentService();
