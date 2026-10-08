/**
 * V9.2 — GUMZO ADMIN POSTS SERVICE
 *
 * Implements authoritative business logic and persistence for Gumzo Admin Posts:
 * Core Principle: Only authorized Gumzo admins (FOUNDER_ADMIN, LEADERSHIP_ADMIN)
 * can create new posts. Members cannot create independent posts.
 *
 * Enforces:
 * 1. Post Creation & Lifecycle (DRAFT, PUBLISHED, HIDDEN, DELETED)
 * 2. Post Visibility (VISIBLE, HIDDEN)
 * 3. Server-authoritative post ownership, timestamps & author roles
 * 4. Text content & media attachment limits
 * 5. Feed retrieval & ordering (pinned first, newest published first)
 * 6. Post editing & soft deletion
 * 7. Group lifecycle propagation (suspended/archived groups block posting & obey visibility)
 */

import {
  GumzoPost,
  GumzoPostStatus,
  GumzoPostVisibility,
  GumzoMediaItem,
  CreateGumzoPostInput,
  UpdateGumzoPostInput,
  GumzoGroup,
  GumzoMembership,
  canUserCreatePost,
  canUserEditPost,
  canUserDeletePost,
  canUserViewPost
} from '../types/gumzo';
import { gumzoGroupService } from './gumzoGroupService';

const isNode = typeof window === 'undefined';

// In-memory primary store for posts: Key = postId
const postsStore = new Map<string, GumzoPost>();

// Disk persistence handles (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let POSTS_FILE = 'data/gumzo_posts.json';

export function initGumzoPostsStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  POSTS_FILE = diskPath ? diskPath.join(baseDir, 'gumzo_posts.json') : `${baseDir}/gumzo_posts.json`;

  loadFromDisk();
}

function loadFromDisk(): void {
  if (!diskFs || !diskFs.existsSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    if (diskFs.existsSync(POSTS_FILE)) {
      const data = JSON.parse(diskFs.readFileSync(POSTS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        postsStore.clear();
        data.forEach((p: GumzoPost) => postsStore.set(p.postId, p));
      }
    }
  } catch (err) {
    console.warn('[gumzoPostService] Disk load warning:', err);
  }
}

function persistToDisk(): void {
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    diskFs.writeFileSync(POSTS_FILE, JSON.stringify(Array.from(postsStore.values()), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[gumzoPostService] Disk persist warning:', err);
  }
}

export class GumzoPostService {
  /**
   * 1. CREATE ADMIN POST (Server-Authoritative)
   *
   * Enforces:
   * - Caller must be authenticated
   * - Caller must be verified FOUNDER_ADMIN or LEADERSHIP_ADMIN of the group (or platform admin)
   * - Member role is strictly DENIED (403)
   * - Parent group must exist and not be SUSPENDED, ARCHIVED, or REJECTED
   * - Content validation (min 1 char, max 5,000 chars)
   * - Media attachments (max 10 items)
   * - Server-derived authorRole, createdAt, updatedAt, postId, authorUserId
   */
  public createPost(params: {
    input: CreateGumzoPostInput;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoPost {
    const { input, authenticatedUserId, isPlatformAdmin = false } = params;
    if (isNode) loadFromDisk();

    if (!authenticatedUserId || !authenticatedUserId.trim()) {
      throw new Error('Huruhusiwi kuandika chapisho bila kuingia kwenye mfumo (401 Authenticated user required).');
    }

    const { groupId } = input;
    if (!groupId) {
      throw new Error('GroupId inahitajika (GroupId is required).');
    }

    const group = gumzoGroupService.getGroupById(groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error(`Kikundi ${groupId} hakikupatikana au hakiruhusu machapisho.`);
    }

    const membership = gumzoGroupService.getMembership(groupId, authenticatedUserId);

    // Strict Admin Authorization Check
    const authCheck = canUserCreatePost(authenticatedUserId, group, membership, isPlatformAdmin);
    if (!authCheck.allowed) {
      throw new Error(authCheck.reason || 'Huruhusiwi kuandika chapisho. Mamlaka ya uongozi (Admin) yanahitajika (403 PERMISSION_DENIED).');
    }

    // Content validation
    const trimmedContent = (input.content || '').trim();
    if (!trimmedContent && (!input.media || input.media.length === 0)) {
      throw new Error('Chapisho lazima liwe na maandishi au viambatisho (Media).');
    }
    if (trimmedContent.length > 5000) {
      throw new Error('Urefu wa chapisho hauwezi kuzidi herufi 5,000.');
    }

    // Media validation
    const sanitizedMedia: GumzoMediaItem[] = [];
    if (input.media && Array.isArray(input.media)) {
      if (input.media.length > 10) {
        throw new Error('Huruhusiwi kuweka zaidi ya picha/faili 10 kwa chapisho moja.');
      }
      for (const m of input.media) {
        if (!m.url || typeof m.url !== 'string') continue;
        sanitizedMedia.push({
          id: m.id || `med_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: m.type === 'video' ? 'video' : m.type === 'file' ? 'file' : 'image',
          url: m.url,
          thumbnailUrl: m.thumbnailUrl,
          caption: m.caption ? m.caption.substring(0, 300) : undefined,
          sizeBytes: typeof m.sizeBytes === 'number' ? m.sizeBytes : undefined,
        });
      }
    }

    const now = new Date().toISOString();
    const postId = `pst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const status: GumzoPostStatus = input.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    const visibility: GumzoPostVisibility = input.visibility === 'HIDDEN' ? 'HIDDEN' : 'VISIBLE';
    const authorRole = authCheck.role || (group.founderAdminUserId === authenticatedUserId ? 'FOUNDER_ADMIN' : 'LEADERSHIP_ADMIN');

    const post: GumzoPost = {
      postId,
      groupId,
      authorUserId: authenticatedUserId,
      authorRole,
      content: trimmedContent,
      media: sanitizedMedia,
      status,
      visibility,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === 'PUBLISHED' ? now : undefined,
      createdBy: authenticatedUserId,
      updatedBy: authenticatedUserId,
      isPinned: false,
    };

    postsStore.set(postId, post);
    persistToDisk();

    return post;
  }

  /**
   * 2. GET POST BY ID
   * Checks access authorization relative to group & caller.
   */
  public getPostById(
    postId: string,
    callerUserId?: string | null,
    isPlatformAdmin = false
  ): GumzoPost | null {
    if (isNode) loadFromDisk();
    const post = postsStore.get(postId);
    if (!post) return null;

    const group = gumzoGroupService.getGroupById(post.groupId, callerUserId, isPlatformAdmin);
    if (!group) return null;

    const membership = callerUserId ? gumzoGroupService.getMembership(post.groupId, callerUserId) : null;
    if (!canUserViewPost(callerUserId, post, group, membership, isPlatformAdmin)) {
      return null;
    }

    return post;
  }

  /**
   * 3. GET POST FEED FOR A GROUP
   * - Enforces group-level access control
   * - Returns visible posts ordered by pinned first, then newest published first
   * - Hides deleted posts from normal feed
   */
  public getGroupPosts(params: {
    groupId: string;
    callerUserId?: string | null;
    isPlatformAdmin?: boolean;
    includeDrafts?: boolean;
    limit?: number;
    offset?: number;
  }): { posts: GumzoPost[]; total: number } {
    const { groupId, callerUserId, isPlatformAdmin = false, includeDrafts = false, limit = 50, offset = 0 } = params;
    if (isNode) loadFromDisk();

    const group = gumzoGroupService.getGroupById(groupId, callerUserId, isPlatformAdmin);
    if (!group) {
      return { posts: [], total: 0 };
    }

    const membership = callerUserId ? gumzoGroupService.getMembership(groupId, callerUserId) : null;

    // Filter posts for this group
    const matching = Array.from(postsStore.values()).filter((p) => {
      if (p.groupId !== groupId) return false;
      if (p.status === 'DELETED') return false; // Exclude deleted from regular feed

      // View permission check
      if (!canUserViewPost(callerUserId, p, group, membership, isPlatformAdmin)) {
        return false;
      }

      // If drafts are not requested, ensure it's PUBLISHED
      if (!includeDrafts && p.status === 'DRAFT') {
        return false;
      }

      return true;
    });

    // Sort: pinned first, then publishedAt (or createdAt) descending
    matching.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      const timeA = new Date(a.publishedAt || a.createdAt).getTime();
      const timeB = new Date(b.publishedAt || b.createdAt).getTime();
      return timeB - timeA;
    });

    const total = matching.length;
    const paginated = matching.slice(offset, offset + limit);

    return { posts: paginated, total };
  }

  /**
   * 4. UPDATE / EDIT POST
   * Enforces:
   * - Caller must be author or group leadership admin / platform admin
   * - Cannot edit DELETED posts
   * - Author role & ownership are immutable
   */
  public updatePost(params: {
    postId: string;
    input: UpdateGumzoPostInput;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoPost {
    const { postId, input, authenticatedUserId, isPlatformAdmin = false } = params;
    if (isNode) loadFromDisk();

    const post = postsStore.get(postId);
    if (!post) {
      throw new Error(`Chapisho ${postId} halikupatikana.`);
    }

    const group = gumzoGroupService.getGroupById(post.groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error(`Kikundi cha chapisho hili hakikupatikana.`);
    }

    if (!canUserEditPost(authenticatedUserId, post, group, isPlatformAdmin)) {
      throw new Error('Huruhusiwi kuhariri chapisho hili (403 PERMISSION_DENIED).');
    }

    if (post.status === 'DELETED') {
      throw new Error('Chapisho lililofutwa haliwezi kuhaririwa.');
    }

    const now = new Date().toISOString();

    if (input.content !== undefined) {
      const trimmed = input.content.trim();
      if (!trimmed && (!input.media || input.media.length === 0) && post.media.length === 0) {
        throw new Error('Chapisho haliwezi kuwa tupu.');
      }
      if (trimmed.length > 5000) {
        throw new Error('Urefu wa chapisho hauwezi kuzidi herufi 5,000.');
      }
      post.content = trimmed;
    }

    if (input.media !== undefined && Array.isArray(input.media)) {
      if (input.media.length > 10) {
        throw new Error('Huruhusiwi kuweka zaidi ya picha/faili 10.');
      }
      post.media = input.media;
    }

    if (input.status !== undefined) {
      const validStatuses: GumzoPostStatus[] = ['DRAFT', 'PUBLISHED', 'HIDDEN', 'DELETED'];
      if (!validStatuses.includes(input.status)) {
        throw new Error(`Hali ya chapisho "${input.status}" haitambuliki.`);
      }
      if (input.status === 'PUBLISHED' && !post.publishedAt) {
        post.publishedAt = now;
      }
      if (input.status === 'DELETED' && !post.deletedAt) {
        post.deletedAt = now;
      }
      post.status = input.status;
    }

    if (input.visibility !== undefined) {
      if (input.visibility !== 'VISIBLE' && input.visibility !== 'HIDDEN') {
        throw new Error('Visibility lazima iwe VISIBLE au HIDDEN.');
      }
      post.visibility = input.visibility;
    }

    if (input.isPinned !== undefined) {
      // Only admins can pin
      if (!isPlatformAdmin && group.founderAdminUserId !== authenticatedUserId && group.leadershipAdminUserId !== authenticatedUserId) {
        throw new Error('Ni viongozi wa kikundi pekee wanaoweza kubandika (Pin) chapisho.');
      }
      post.isPinned = input.isPinned;
    }

    post.updatedAt = now;
    post.updatedBy = authenticatedUserId;

    postsStore.set(postId, post);
    persistToDisk();

    return post;
  }

  /**
   * 5. SOFT-DELETE POST
   * Preserves historical audit record while removing from regular feed display.
   */
  public deletePost(params: {
    postId: string;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
    reason?: string;
  }): GumzoPost {
    const { postId, authenticatedUserId, isPlatformAdmin = false } = params;
    if (isNode) loadFromDisk();

    const post = postsStore.get(postId);
    if (!post) {
      throw new Error(`Chapisho ${postId} halikupatikana.`);
    }

    const group = gumzoGroupService.getGroupById(post.groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) {
      throw new Error(`Kikundi cha chapisho hili hakikupatikana.`);
    }

    if (!canUserDeletePost(authenticatedUserId, post, group, isPlatformAdmin)) {
      throw new Error('Huruhusiwi kufuta chapisho hili (403 PERMISSION_DENIED).');
    }

    const now = new Date().toISOString();
    post.status = 'DELETED';
    post.visibility = 'HIDDEN';
    post.deletedAt = now;
    post.updatedAt = now;
    post.updatedBy = authenticatedUserId;

    postsStore.set(postId, post);
    persistToDisk();

    return post;
  }

  /**
   * 6. MODERATE / HIDE POST (Leadership & Platform Admin)
   */
  public setPostVisibility(params: {
    postId: string;
    visibility: GumzoPostVisibility;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoPost {
    const { postId, visibility, authenticatedUserId, isPlatformAdmin = false } = params;
    if (isNode) loadFromDisk();

    const post = postsStore.get(postId);
    if (!post) throw new Error(`Chapisho ${postId} halikupatikana.`);

    const group = gumzoGroupService.getGroupById(post.groupId, authenticatedUserId, isPlatformAdmin);
    if (!group) throw new Error('Kikundi hakikupatikana.');

    const isGroupLeader = group.founderAdminUserId === authenticatedUserId || group.leadershipAdminUserId === authenticatedUserId;
    if (!isPlatformAdmin && !isGroupLeader) {
      throw new Error('Mamlaka ya uongozi yanahitajika kuficha chapisho.');
    }

    post.visibility = visibility;
    if (visibility === 'HIDDEN' && post.status === 'PUBLISHED') {
      post.status = 'HIDDEN';
    } else if (visibility === 'VISIBLE' && post.status === 'HIDDEN') {
      post.status = 'PUBLISHED';
    }
    post.updatedAt = new Date().toISOString();
    post.updatedBy = authenticatedUserId;

    postsStore.set(postId, post);
    persistToDisk();

    return post;
  }

  /**
   * 7. BROWSER / CLIENT API BRIDGES
   */
  public async fetchBrowserGroupPosts(params: {
    groupId: string;
    callerUserId?: string | null;
    token?: string | null;
  }): Promise<{ posts: GumzoPost[]; total: number }> {
    const { groupId, callerUserId, token } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/posts`, {
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.posts)) {
            data.posts.forEach((p: GumzoPost) => postsStore.set(p.postId, p));
            return data;
          }
        }
      } catch (err) {
        console.warn('[gumzoPostService] API fetch failed, using local store:', err);
      }
    }
    return this.getGroupPosts({ groupId, callerUserId });
  }

  public async postBrowserCreatePost(params: {
    input: CreateGumzoPostInput;
    callerUserId: string;
    token?: string | null;
    userRole?: string;
  }): Promise<GumzoPost> {
    const { input, callerUserId, token, userRole } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;
        if (userRole) headers['x-user-role'] = userRole;

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(input.groupId)}/posts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        });

        if (res.ok) {
          const post = await res.json();
          postsStore.set(post.postId, post);
          return post;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuandika chapisho.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.createPost({
      input,
      authenticatedUserId: callerUserId,
      isPlatformAdmin: userRole === 'admin',
    });
  }

  public async postBrowserUpdatePost(params: {
    postId: string;
    groupId: string;
    input: UpdateGumzoPostInput;
    callerUserId: string;
    token?: string | null;
    userRole?: string;
  }): Promise<GumzoPost> {
    const { postId, groupId, input, callerUserId, token, userRole } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;
        if (userRole) headers['x-user-role'] = userRole;

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(input),
        });

        if (res.ok) {
          const post = await res.json();
          postsStore.set(post.postId, post);
          return post;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuhariri chapisho.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.updatePost({
      postId,
      input,
      authenticatedUserId: callerUserId,
      isPlatformAdmin: userRole === 'admin',
    });
  }

  public async postBrowserDeletePost(params: {
    postId: string;
    groupId: string;
    callerUserId: string;
    token?: string | null;
    userRole?: string;
  }): Promise<GumzoPost> {
    const { postId, groupId, callerUserId, token, userRole } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;
        if (userRole) headers['x-user-role'] = userRole;

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`, {
          method: 'DELETE',
          headers,
        });

        if (res.ok) {
          const post = await res.json();
          postsStore.set(post.postId, post);
          return post;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kufuta chapisho.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.deletePost({
      postId,
      authenticatedUserId: callerUserId,
      isPlatformAdmin: userRole === 'admin',
    });
  }

  /**
   * 8. TESTING HELPERS
   */
  public _clearForTesting(persist = true): void {
    postsStore.clear();
    if (persist) {
      persistToDisk();
    }
  }

  public getAllPosts(): GumzoPost[] {
    if (isNode) loadFromDisk();
    return Array.from(postsStore.values());
  }
}

export const gumzoPostService = new GumzoPostService();
