/**
 * V9.1 — GUMZO GROUP & MEMBERSHIP DOMAIN SERVICE
 *
 * Implements authoritative business logic and persistence for:
 * 1. Group Creation & Lifecycle (DRAFT, PENDING_APPROVAL, ACTIVE, SUSPENDED, ARCHIVED, REJECTED)
 * 2. Deterministic Group Membership (groupId_userId)
 * 3. Authoritative Role Assignment (FOUNDER_ADMIN, LEADERSHIP_ADMIN, MEMBER)
 * 4. Visibility & Access Decision Gateway (PUBLIC / PRIVATE)
 * 5. Safe Group Discovery
 */

import {
  GumzoGroup,
  GumzoMembership,
  GumzoGroupStatus,
  GumzoGroupVisibility,
  GumzoGroupRole,
  GumzoMembershipStatus,
  CreateGumzoGroupInput,
  GUMZO_CATEGORIES,
  canAccessGumzoGroup,
  isGroupFounderAdmin,
  isGroupLeadershipAdmin,
  isGroupAdmin
} from '../types/gumzo';

const isNode = typeof window === 'undefined';

// In-memory primary stores
const groupsStore = new Map<string, GumzoGroup>();
const membershipsStore = new Map<string, GumzoMembership>(); // Key: `${groupId}_${userId}`

// Disk persistence handles (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let GROUPS_FILE = 'data/gumzo_groups.json';
let MEMBERSHIPS_FILE = 'data/gumzo_memberships.json';

export function initGumzoStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  GROUPS_FILE = diskPath ? diskPath.join(baseDir, 'gumzo_groups.json') : `${baseDir}/gumzo_groups.json`;
  MEMBERSHIPS_FILE = diskPath ? diskPath.join(baseDir, 'gumzo_memberships.json') : `${baseDir}/gumzo_memberships.json`;

  loadFromDisk();
}

function loadFromDisk(): void {
  if (!diskFs || !diskFs.existsSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    if (diskFs.existsSync(GROUPS_FILE)) {
      const data = JSON.parse(diskFs.readFileSync(GROUPS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        groupsStore.clear();
        data.forEach((g: GumzoGroup) => groupsStore.set(g.groupId, g));
      }
    }

    if (diskFs.existsSync(MEMBERSHIPS_FILE)) {
      const data = JSON.parse(diskFs.readFileSync(MEMBERSHIPS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        membershipsStore.clear();
        data.forEach((m: GumzoMembership) => membershipsStore.set(m.membershipId, m));
      }
    }
  } catch (err) {
    console.warn('[gumzoGroupService] Disk load warning:', err);
  }
}

function persistToDisk(): void {
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    diskFs.writeFileSync(GROUPS_FILE, JSON.stringify(Array.from(groupsStore.values()), null, 2), 'utf-8');
    diskFs.writeFileSync(MEMBERSHIPS_FILE, JSON.stringify(Array.from(membershipsStore.values()), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[gumzoGroupService] Disk persist warning:', err);
  }
}


export class GumzoGroupService {
  /**
   * 1. CREATE GROUP (Server-Authoritative)
   * Enforces:
   * - Authenticated user exists
   * - Name and description length limits
   * - Category validation
   * - Requesting user becomes FOUNDER_ADMIN
   * - Initial status is PENDING_APPROVAL (or ACTIVE if platform admin)
   * - Client cannot force ACTIVE or manipulate member count
   */
  public createGroup(params: {
    input: CreateGumzoGroupInput;
    authenticatedUserId: string;
    isPlatformAdmin?: boolean;
  }): { group: GumzoGroup; membership: GumzoMembership } {
    const { input, authenticatedUserId, isPlatformAdmin = false } = params;

    if (!authenticatedUserId || !authenticatedUserId.trim()) {
      throw new Error('Huruhusiwi kuunda kikundi bila kuingia kwenye mfumo (Authenticated user required).');
    }

    const trimmedName = (input.name || '').trim();
    if (!trimmedName || trimmedName.length < 3) {
      throw new Error('Jina la kikundi linapaswa kuwa na angalau herufi 3.');
    }
    if (trimmedName.length > 100) {
      throw new Error('Jina la kikundi lisizidi herufi 100.');
    }

    const trimmedDesc = (input.description || '').trim();
    if (!trimmedDesc || trimmedDesc.length < 10) {
      throw new Error('Maelezo ya kikundi yanapaswa kuwa na angalau herufi 10 ili kueleza lengo la kikundi.');
    }
    if (trimmedDesc.length > 1500) {
      throw new Error('Maelezo ya kikundi yasizidi herufi 1,500.');
    }

    // Category validation
    const categoryExists = GUMZO_CATEGORIES.some((c) => c.categoryId === input.categoryId);
    if (!categoryExists) {
      throw new Error(`Kategoria ya ufugaji "${input.categoryId}" haitambuliki.`);
    }

    // Visibility validation
    if (input.visibility !== 'PUBLIC' && input.visibility !== 'PRIVATE') {
      throw new Error('Aina ya uonekano wa kikundi (visibility) lazima iwe PUBLIC au PRIVATE.');
    }

    // Check for duplicate group name by same founder
    const duplicate = Array.from(groupsStore.values()).find(
      (g) =>
        g.founderAdminUserId === authenticatedUserId &&
        g.name.toLowerCase() === trimmedName.toLowerCase() &&
        g.status !== 'ARCHIVED' &&
        g.status !== 'REJECTED'
    );
    if (duplicate) {
      throw new Error(`Tayari unamiliki kikundi chenye jina hili "${trimmedName}".`);
    }

    const now = new Date().toISOString();
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Initial status: PENDING_APPROVAL unless platform admin directly creates
    const initialStatus: GumzoGroupStatus = isPlatformAdmin ? 'ACTIVE' : 'PENDING_APPROVAL';

    const group: GumzoGroup = {
      groupId,
      name: trimmedName,
      description: trimmedDesc,
      categoryId: input.categoryId,
      livestockType: input.livestockType || GUMZO_CATEGORIES.find((c) => c.categoryId === input.categoryId)?.livestockType || 'GENERAL',
      coverImageUrl: input.coverImageUrl?.trim() || undefined,
      status: initialStatus,
      visibility: input.visibility,
      founderAdminUserId: authenticatedUserId,
      leadershipAdminUserId: undefined,
      memberCount: 1, // Founder is the first member
      createdAt: now,
      updatedAt: now,
      createdBy: authenticatedUserId,
    };

    // Deterministic founder membership
    const membershipId = `${groupId}_${authenticatedUserId}`;
    const membership: GumzoMembership = {
      membershipId,
      groupId,
      userId: authenticatedUserId,
      role: 'FOUNDER_ADMIN',
      status: 'ACTIVE',
      joinedAt: now,
      updatedAt: now,
    };

    groupsStore.set(groupId, group);
    membershipsStore.set(membershipId, membership);
    persistToDisk();

    return { group, membership };
  }

  /**
   * 2. GET GROUP BY ID
   */
  public getGroupById(groupId: string, callerUserId?: string, isPlatformAdmin = false): GumzoGroup | null {
    if (isNode) loadFromDisk();
    const group = groupsStore.get(groupId);
    if (!group) return null;

    const membership = callerUserId ? this.getMembership(groupId, callerUserId) : null;
    const access = canAccessGumzoGroup(callerUserId, group, membership, isPlatformAdmin);

    if (!access.canAccess) {
      return null;
    }

    return group;
  }

  /**
   * 3. GET MEMBERSHIP
   */
  public getMembership(groupId: string, userId: string): GumzoMembership | null {
    if (isNode) loadFromDisk();
    const membershipId = `${groupId}_${userId}`;
    return membershipsStore.get(membershipId) || null;
  }

  /**
   * 4. GET ALL ACTIVE MEMBERSHIPS FOR A USER
   */
  public getUserMemberships(userId: string): GumzoMembership[] {
    if (isNode) loadFromDisk();
    if (!userId) return [];
    return Array.from(membershipsStore.values()).filter(
      (m) => m.userId === userId && m.status === 'ACTIVE'
    );
  }

  /**
   * 5. GET GROUPS A USER BELONGS TO
   */
  public getUserGroups(userId: string): GumzoGroup[] {
    if (!userId) return [];
    const memberships = this.getUserMemberships(userId);
    const result: GumzoGroup[] = [];

    for (const m of memberships) {
      const g = groupsStore.get(m.groupId);
      if (g && (g.status === 'ACTIVE' || g.founderAdminUserId === userId)) {
        result.push(g);
      }
    }

    return result;
  }

  /**
   * 6. GET PUBLIC DISCOVERABLE GROUPS
   */
  public getDiscoverableGroups(callerUserId?: string, categoryFilter?: string): GumzoGroup[] {
    if (isNode) loadFromDisk();
    const groups = Array.from(groupsStore.values());

    return groups.filter((g) => {
      // Must be ACTIVE and PUBLIC, unless caller is founder or member
      if (categoryFilter && categoryFilter !== 'all' && g.categoryId !== categoryFilter) {
        return false;
      }

      if (g.status === 'ACTIVE' && g.visibility === 'PUBLIC') {
        return true;
      }

      // If caller is founder, allow seeing pending/draft
      if (callerUserId && g.founderAdminUserId === callerUserId) {
        return true;
      }

      return false;
    });
  }

  /**
   * 7. JOIN GROUP (Authoritative)
   * - Cannot join non-existent, archived, or rejected group
   * - Enforces uniqueness: cannot create duplicate active membership
   * - Member role is strictly MEMBER (cannot self-assign admin)
   */
  public joinGroup(groupId: string, userId: string): GumzoMembership {
    if (!userId) throw new Error('Hujaingia kwenye mfumo (Authentication required).');
    if (isNode) loadFromDisk();

    const group = groupsStore.get(groupId);
    if (!group) throw new Error('Kikundi hakikupatikana.');

    if (group.status !== 'ACTIVE') {
      throw new Error(`Huwezi kujiunga na kikundi hiki kwa sababu kiko katika hali ya ${group.status}.`);
    }

    const membershipId = `${groupId}_${userId}`;
    const existing = membershipsStore.get(membershipId);

    if (existing && existing.status === 'ACTIVE') {
      // Idempotent: Already an active member
      return existing;
    }

    if (existing && existing.status === 'SUSPENDED') {
      throw new Error('Uanachama wako katika kikundi hiki umesimamishwa kiutawala.');
    }

    const now = new Date().toISOString();
    // For PUBLIC groups, status is ACTIVE. For PRIVATE groups, PENDING approval.
    const initialMembershipStatus: GumzoMembershipStatus = group.visibility === 'PUBLIC' ? 'ACTIVE' : 'PENDING';

    const membership: GumzoMembership = {
      membershipId,
      groupId,
      userId,
      role: 'MEMBER', // Strictly MEMBER
      status: initialMembershipStatus,
      joinedAt: existing?.joinedAt || now,
      updatedAt: now,
    };

    membershipsStore.set(membershipId, membership);

    // Only increment member count if membership is ACTIVE
    if (initialMembershipStatus === 'ACTIVE' && (!existing || existing.status !== 'ACTIVE')) {
      group.memberCount = (group.memberCount || 0) + 1;
      group.updatedAt = now;
      groupsStore.set(groupId, group);
    }

    persistToDisk();
    return membership;
  }

  /**
   * 8. LEAVE GROUP (Authoritative)
   */
  public leaveGroup(groupId: string, userId: string): GumzoMembership {
    if (!userId) throw new Error('Hujaingia kwenye mfumo.');
    if (isNode) loadFromDisk();

    const group = groupsStore.get(groupId);
    if (!group) throw new Error('Kikundi hakikupatikana.');

    if (group.founderAdminUserId === userId) {
      throw new Error('Mwanzilishi (Founder Admin) hawezi kujiondoa bila kubadilisha uongozi au kufunga kikundi.');
    }

    const membershipId = `${groupId}_${userId}`;
    const existing = membershipsStore.get(membershipId);
    if (!existing || existing.status !== 'ACTIVE') {
      throw new Error('Wewe si mwanachama hai wa kikundi hiki.');
    }

    const now = new Date().toISOString();
    existing.status = 'LEFT';
    existing.updatedAt = now;
    membershipsStore.set(membershipId, existing);

    group.memberCount = Math.max(1, (group.memberCount || 1) - 1);
    group.updatedAt = now;
    groupsStore.set(groupId, group);

    persistToDisk();
    return existing;
  }

  /**
   * 9. ADMIN UPDATE GROUP STATUS (Platform / Leadership Admin Authority)
   */
  public adminUpdateGroupStatus(params: {
    groupId: string;
    newStatus: GumzoGroupStatus;
    adminUserId: string;
    isPlatformAdmin?: boolean;
    reason?: string;
  }): GumzoGroup {
    const { groupId, newStatus, adminUserId, isPlatformAdmin = false } = params;
    if (isNode) loadFromDisk();

    const group = groupsStore.get(groupId);
    if (!group) throw new Error(`Kikundi ${groupId} hakikupatikana.`);

    // Leadership admin or platform admin required
    const isLeadership = isGroupLeadershipAdmin(adminUserId, group);
    if (!isPlatformAdmin && !isLeadership) {
      throw new Error('Huruhusiwi kubadilisha hali ya kikundi (Platform or Leadership Admin authority required).');
    }

    const validStatuses: GumzoGroupStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED', 'REJECTED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Hali "${newStatus}" haitambuliki.`);
    }

    const now = new Date().toISOString();
    group.status = newStatus;
    group.updatedAt = now;
    groupsStore.set(groupId, group);
    persistToDisk();

    return group;
  }

  /**
   * 10. ASSIGN LEADERSHIP ADMIN (Platform Admin Authority)
   */
  public assignLeadershipAdmin(params: {
    groupId: string;
    leadershipAdminUserId: string;
    platformAdminUserId: string;
    isPlatformAdmin?: boolean;
  }): GumzoGroup {
    const { groupId, leadershipAdminUserId, platformAdminUserId, isPlatformAdmin = false } = params;
    if (isNode) loadFromDisk();

    if (!isPlatformAdmin) {
      throw new Error('Kuteua Leadership Admin kunahitaji mamlaka ya Platform Admin.');
    }

    const group = groupsStore.get(groupId);
    if (!group) throw new Error(`Kikundi ${groupId} hakikupatikana.`);

    // Prevent founder from being assigned as leadership admin of their own group (must remain distinct)
    if (group.founderAdminUserId === leadershipAdminUserId) {
      throw new Error('Founder Admin hawezi kuteuliwa kuwa Leadership Admin wa kikundi kilekile.');
    }

    const now = new Date().toISOString();
    group.leadershipAdminUserId = leadershipAdminUserId;
    group.updatedAt = now;
    groupsStore.set(groupId, group);

    // Create or update leadership admin membership
    const membershipId = `${groupId}_${leadershipAdminUserId}`;
    const existing = membershipsStore.get(membershipId);

    const membership: GumzoMembership = {
      membershipId,
      groupId,
      userId: leadershipAdminUserId,
      role: 'LEADERSHIP_ADMIN',
      status: 'ACTIVE',
      joinedAt: existing?.joinedAt || now,
      updatedAt: now,
      approvedBy: platformAdminUserId,
    };
    membershipsStore.set(membershipId, membership);

    persistToDisk();
    return group;
  }

  /**
   * 11. BROWSER API BRIDGES
   */
  public async fetchBrowserGroups(category?: string, callerUserId?: string): Promise<GumzoGroup[]> {
    if (typeof window !== 'undefined') {
      try {
        const query = category ? `?category=${encodeURIComponent(category)}` : '';
        const res = await fetch(`/api/gumzo/groups${query}`, {
          headers: callerUserId ? { 'x-user-id': callerUserId } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.groups) {
            data.groups.forEach((g: GumzoGroup) => groupsStore.set(g.groupId, g));
            return data.groups;
          }
        }
      } catch (err) {
        console.warn('[gumzoGroupService] API fetch groups error, falling back to local store:', err);
      }
    }
    return this.getDiscoverableGroups(callerUserId, category);
  }

  public async fetchBrowserGroupById(groupId: string, callerUserId?: string): Promise<{ group: GumzoGroup | null; membership: GumzoMembership | null }> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}`, {
          headers: callerUserId ? { 'x-user-id': callerUserId } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.group) {
            groupsStore.set(data.group.groupId, data.group);
            if (data.membership) {
              membershipsStore.set(data.membership.membershipId, data.membership);
            }
            return { group: data.group, membership: data.membership || null };
          }
        }
      } catch (err) {
        console.warn('[gumzoGroupService] API fetch group by ID error:', err);
      }
    }
    const group = this.getGroupById(groupId, callerUserId);
    const membership = callerUserId ? this.getMembership(groupId, callerUserId) : null;
    return { group, membership };
  }

  public async postBrowserCreateGroup(input: CreateGumzoGroupInput, userId: string, token?: string | null): Promise<{ group: GumzoGroup; membership: GumzoMembership }> {
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        else headers['x-user-id'] = userId;

        const res = await fetch('/api/gumzo/groups', {
          method: 'POST',
          headers,
          body: JSON.stringify({ input, userId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.group) {
            groupsStore.set(data.group.groupId, data.group);
            if (data.membership) {
              membershipsStore.set(data.membership.membershipId, data.membership);
            }
            return { group: data.group, membership: data.membership };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuunda kikundi.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.createGroup({ input, authenticatedUserId: userId });
  }

  public async postBrowserJoinGroup(groupId: string, userId: string, token?: string | null): Promise<GumzoMembership> {
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        else headers['x-user-id'] = userId;

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/join`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.membership) {
            membershipsStore.set(data.membership.membershipId, data.membership);
            if (data.group) {
              groupsStore.set(data.group.groupId, data.group);
            }
            return data.membership;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kujiunga na kikundi.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.joinGroup(groupId, userId);
  }

  public async postBrowserLeaveGroup(groupId: string, userId: string, token?: string | null): Promise<GumzoMembership> {
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        else headers['x-user-id'] = userId;

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/leave`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.membership) {
            membershipsStore.set(data.membership.membershipId, data.membership);
            if (data.group) {
              groupsStore.set(data.group.groupId, data.group);
            }
            return data.membership;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kujiondoa kwenye kikundi.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.leaveGroup(groupId, userId);
  }

  /**
   * 12. TESTING & ISOLATION HELPERS
   */
  public _clearForTesting(persist = true): void {
    groupsStore.clear();
    membershipsStore.clear();
    if (persist) {
      persistToDisk();
    }
  }

  public getAllGroups(): GumzoGroup[] {
    return Array.from(groupsStore.values());
  }

  public getAllMemberships(): GumzoMembership[] {
    return Array.from(membershipsStore.values());
  }
}

export const gumzoGroupService = new GumzoGroupService();
