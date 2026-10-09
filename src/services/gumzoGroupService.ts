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
  isGroupAdmin,
  TransferFounderAdminInput,
  canTransferFounderAdmin,
  GumzoGovernanceAuditEvent,
} from '../types/gumzo';
import { gumzoAuditService } from './gumzoAuditService';

const isNode = typeof window === 'undefined';

// Local storage keys for browser hydration
const LOCAL_GROUPS_KEY = 'ufugaji_gumzo_groups';
const LOCAL_MEMBERSHIPS_KEY = 'ufugaji_gumzo_memberships';

// In-memory primary stores
const groupsStore = new Map<string, GumzoGroup>();
const membershipsStore = new Map<string, GumzoMembership>(); // Key: `${groupId}_${userId}`

function hydrateFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawG = localStorage.getItem(LOCAL_GROUPS_KEY);
    if (rawG) {
      const parsedG = JSON.parse(rawG);
      if (Array.isArray(parsedG)) {
        parsedG.forEach((g: GumzoGroup) => groupsStore.set(g.groupId, g));
      }
    }
    const rawM = localStorage.getItem(LOCAL_MEMBERSHIPS_KEY);
    if (rawM) {
      const parsedM = JSON.parse(rawM);
      if (Array.isArray(parsedM)) {
        parsedM.forEach((m: GumzoMembership) => membershipsStore.set(m.membershipId, m));
      }
    }
  } catch {}
}

function persistToLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_GROUPS_KEY, JSON.stringify(Array.from(groupsStore.values())));
    localStorage.setItem(LOCAL_MEMBERSHIPS_KEY, JSON.stringify(Array.from(membershipsStore.values())));
  } catch {}
}

if (!isNode) {
  hydrateFromLocalStorage();
}

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

// Auto-initialize if running in Node.js
if (isNode) {
  try {
    import('fs').then((f) => {
      if (!diskFs) {
        diskFs = f.default || f;
        import('path').then((p) => {
          diskPath = p.default || p;
          initGumzoStorage(diskFs, diskPath);
        }).catch(() => {});
      }
    }).catch(() => {});
  } catch {}
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
        data.forEach((m: GumzoMembership) => {
          if (m && m.membershipId) {
            membershipsStore.set(m.membershipId, m);
          }
          if (m && m.groupId && m.userId) {
            membershipsStore.set(`${m.groupId}_${m.userId}`, m);
          }
        });
      }
    }

    // Auto-heal: Ensure every valid group has an active founder and leadership membership record
    let healed = false;
    for (const g of groupsStore.values()) {
      if (g.founderAdminUserId) {
        const fKey = `${g.groupId}_${g.founderAdminUserId}`;
        if (!membershipsStore.has(fKey)) {
          const founderM: GumzoMembership = {
            membershipId: fKey,
            groupId: g.groupId,
            userId: g.founderAdminUserId,
            role: 'FOUNDER_ADMIN',
            status: 'ACTIVE',
            joinedAt: g.createdAt || new Date().toISOString(),
            updatedAt: g.updatedAt || g.createdAt || new Date().toISOString(),
          };
          membershipsStore.set(fKey, founderM);
          healed = true;
        }
      }
      if (g.leadershipAdminUserId) {
        const lKey = `${g.groupId}_${g.leadershipAdminUserId}`;
        if (!membershipsStore.has(lKey)) {
          const leaderM: GumzoMembership = {
            membershipId: lKey,
            groupId: g.groupId,
            userId: g.leadershipAdminUserId,
            role: 'LEADERSHIP_ADMIN',
            status: 'ACTIVE',
            joinedAt: g.updatedAt || g.createdAt || new Date().toISOString(),
            updatedAt: g.updatedAt || g.createdAt || new Date().toISOString(),
          };
          membershipsStore.set(lKey, leaderM);
          healed = true;
        }
      }
    }
    if (healed && isNode) {
      persistToDisk();
    }
  } catch (err) {
    console.warn('[gumzoGroupService] Disk load warning:', err);
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

    const uniqueGroups = Array.from(
      new Map(Array.from(groupsStore.values()).map((g) => [g.groupId, g])).values()
    );
    const uniqueMemberships = Array.from(
      new Map(Array.from(membershipsStore.values()).map((m) => [m.membershipId || `${m.groupId}_${m.userId}`, m])).values()
    );

    diskFs.writeFileSync(GROUPS_FILE, JSON.stringify(uniqueGroups, null, 2), 'utf-8');
    diskFs.writeFileSync(MEMBERSHIPS_FILE, JSON.stringify(uniqueMemberships, null, 2), 'utf-8');
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

    gumzoAuditService.logEvent({
      actorUserId: authenticatedUserId,
      action: 'FOUNDER_ADMIN_ASSIGNED',
      targetType: 'GROUP',
      targetResourceId: groupId,
      groupId,
      outcome: 'SUCCESS',
      reason: 'Mwanzilishi ameteuliwa rasmi wakati wa kuunda kikundi.',
      details: {
        founderAdminUserId: authenticatedUserId,
        groupName: trimmedName,
        status: initialStatus,
      },
    });

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
    if (!groupId || !userId) return null;
    const directKey = `${groupId}_${userId}`;
    const direct = membershipsStore.get(directKey);
    if (direct) return direct;

    // Scan values for matching groupId and userId
    for (const m of membershipsStore.values()) {
      if (m && m.groupId === groupId && m.userId === userId) {
        return m;
      }
    }

    // Check if user is founder of the group
    const group = groupsStore.get(groupId);
    if (group && group.founderAdminUserId === userId) {
      const founderM: GumzoMembership = {
        membershipId: directKey,
        groupId,
        userId,
        role: 'FOUNDER_ADMIN',
        status: 'ACTIVE',
        joinedAt: group.createdAt || new Date().toISOString(),
        updatedAt: group.updatedAt || group.createdAt || new Date().toISOString(),
      };
      membershipsStore.set(directKey, founderM);
      if (isNode) persistToDisk();
      return founderM;
    }

    // Check if user is appointed leadership admin of the group
    if (group && group.leadershipAdminUserId === userId) {
      const leaderM: GumzoMembership = {
        membershipId: directKey,
        groupId,
        userId,
        role: 'LEADERSHIP_ADMIN',
        status: 'ACTIVE',
        joinedAt: group.updatedAt || group.createdAt || new Date().toISOString(),
        updatedAt: group.updatedAt || group.createdAt || new Date().toISOString(),
      };
      membershipsStore.set(directKey, leaderM);
      if (isNode) persistToDisk();
      return leaderM;
    }

    return null;
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
   * 8b. UPDATE MEMBERSHIP STATUS (Admin moderation: ACTIVE, SUSPENDED, REMOVED)
   */
  public updateMembershipStatus(groupId: string, userId: string, newStatus: GumzoMembershipStatus): GumzoMembership {
    if (isNode) loadFromDisk();
    const membershipId = `${groupId}_${userId}`;
    const membership = membershipsStore.get(membershipId);
    if (!membership) throw new Error('Uanachama haukupatikana.');
    membership.status = newStatus;
    membership.updatedAt = new Date().toISOString();
    membershipsStore.set(membershipId, membership);
    persistToDisk();
    return membership;
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

    const previousStatus = group.status;
    const now = new Date().toISOString();
    group.status = newStatus;
    group.updatedAt = now;
    groupsStore.set(groupId, group);
    persistToDisk();

    // Determine audit action
    const action = newStatus === 'SUSPENDED'
      ? 'GROUP_SUSPENDED'
      : (previousStatus === 'SUSPENDED' && newStatus === 'ACTIVE')
      ? 'GROUP_RESTORED'
      : 'GROUP_STATUS_UPDATED';

    gumzoAuditService.logEvent({
      actorUserId: adminUserId,
      action,
      targetType: 'GROUP',
      targetResourceId: groupId,
      groupId,
      outcome: 'SUCCESS',
      reason: params.reason || `Hali ya kikundi imebadilishwa kutoka ${previousStatus} hadi ${newStatus}.`,
      details: {
        previousStatus,
        newStatus,
        isPlatformAdmin,
      },
    });

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

    gumzoAuditService.logEvent({
      actorUserId: platformAdminUserId,
      action: 'LEADERSHIP_ADMIN_ASSIGNED',
      targetType: 'GROUP',
      targetResourceId: groupId,
      groupId,
      outcome: 'SUCCESS',
      reason: 'Leadership Admin ameteuliwa rasmi na uongozi wa jukwaa.',
      details: {
        leadershipAdminUserId,
        platformAdminUserId,
      },
    });

    return group;
  }

  /**
   * 10b. TRANSFER FOUNDER ADMIN (Leadership / Platform Admin Authority)
   *
   * Reassigns Founder Admin responsibility for a group:
   * - Only authorized Leadership Admin or Platform Admin can transfer
   * - Validates target account (not empty, not current founder, not current leadership admin)
   * - Previous founder is transitioned to MEMBER role (invalidates previous admin role)
   * - New founder becomes FOUNDER_ADMIN with ACTIVE status
   * - Records immutable audit event: FOUNDER_ADMIN_TRANSFERRED
   * - Invalidates stale permissions
   */
  public transferFounderAdmin(params: TransferFounderAdminInput): {
    group: GumzoGroup;
    previousFounderUserId: string;
    newFounderUserId: string;
    auditEvent: GumzoGovernanceAuditEvent;
  } {
    const { groupId, newFounderUserId, actingAdminUserId, isPlatformAdmin = false, reason } = params;
    if (isNode) loadFromDisk();

    if (!actingAdminUserId) {
      throw new Error('Hujaingia kwenye mfumo (Authenticated caller required).');
    }

    const group = groupsStore.get(groupId);
    if (!group) {
      throw new Error(`Kikundi ${groupId} hakikupatikana.`);
    }

    // Strictly Leadership Admin or Platform Admin can transfer Founder Admin
    const isLeadership = isGroupLeadershipAdmin(actingAdminUserId, group);
    if (!isPlatformAdmin && !isLeadership) {
      // Log privilege escalation attempt
      gumzoAuditService.logEvent({
        actorUserId: actingAdminUserId,
        action: 'PRIVILEGE_ESCALATION_ATTEMPT',
        targetType: 'GOVERNANCE',
        targetResourceId: groupId,
        groupId,
        outcome: 'DENIED',
        reason: 'Mtumiaji asiye na mamlaka ya Leadership Admin amejaribu kuhamisha uongozi wa mwanzilishi.',
        details: { attemptedNewFounder: newFounderUserId },
      });
      throw new Error('Huna mamlaka ya Leadership Admin kuhamisha uongozi wa mwanzilishi (403 Forbidden).');
    }

    if (!newFounderUserId || !newFounderUserId.trim()) {
      throw new Error('Tafadhali taja mtumiaji (User ID) mpya atakayekuwa Mwanzilishi (Founder Admin).');
    }

    const targetUserId = newFounderUserId.trim();

    if (group.founderAdminUserId === targetUserId) {
      throw new Error('Mtumiaji huyu tayari ndiye Mwanzilishi (Founder Admin) wa kikundi hiki.');
    }

    // Maintain distinction between the two admin roles:
    // A group cannot have the same user as both Founder Admin and Leadership Admin!
    if (group.leadershipAdminUserId && group.leadershipAdminUserId === targetUserId) {
      throw new Error('Mtumiaji huyu ni Leadership Admin wa kikundi hiki. Kiongozi hawezi kuwa Founder Admin na Leadership Admin kwa wakati mmoja.');
    }

    const previousFounderUserId = group.founderAdminUserId;
    const now = new Date().toISOString();

    // 1. Demote previous founder to regular active member
    const prevMembershipId = `${groupId}_${previousFounderUserId}`;
    const prevMembership = membershipsStore.get(prevMembershipId);
    if (prevMembership) {
      prevMembership.role = 'MEMBER';
      prevMembership.updatedAt = now;
      membershipsStore.set(prevMembershipId, prevMembership);
    } else {
      membershipsStore.set(prevMembershipId, {
        membershipId: prevMembershipId,
        groupId,
        userId: previousFounderUserId,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: group.createdAt || now,
        updatedAt: now,
      });
    }

    // 2. Promote target user to FOUNDER_ADMIN with ACTIVE status
    const newMembershipId = `${groupId}_${targetUserId}`;
    const newMembership = membershipsStore.get(newMembershipId);
    if (newMembership) {
      newMembership.role = 'FOUNDER_ADMIN';
      newMembership.status = 'ACTIVE';
      newMembership.updatedAt = now;
      membershipsStore.set(newMembershipId, newMembership);
    } else {
      membershipsStore.set(newMembershipId, {
        membershipId: newMembershipId,
        groupId,
        userId: targetUserId,
        role: 'FOUNDER_ADMIN',
        status: 'ACTIVE',
        joinedAt: now,
        updatedAt: now,
        approvedBy: actingAdminUserId,
      });
      group.memberCount = (group.memberCount || 1) + 1;
    }

    // 3. Update authoritative group record
    group.founderAdminUserId = targetUserId;
    group.updatedAt = now;
    groupsStore.set(groupId, group);

    persistToDisk();

    // 4. Record authoritative immutable audit event
    const auditEvent = gumzoAuditService.logEvent({
      actorUserId: actingAdminUserId,
      action: 'FOUNDER_ADMIN_TRANSFERRED',
      targetType: 'GROUP',
      targetResourceId: groupId,
      groupId,
      outcome: 'SUCCESS',
      reason: reason || 'Uhamisho rasmi wa wadhifa wa Founder Admin umekamilika na uongozi wa jukwaa.',
      details: {
        previousFounderUserId,
        newFounderUserId: targetUserId,
        actingAdminUserId,
        isPlatformAdmin,
      },
    });

    return {
      group,
      previousFounderUserId,
      newFounderUserId: targetUserId,
      auditEvent,
    };
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

  public async fetchBrowserUserMemberships(userId: string, token?: string | null): Promise<{ memberships: GumzoMembership[]; groups: GumzoGroup[] }> {
    if (!userId) return { memberships: [], groups: [] };
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'x-user-id': userId };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/gumzo/my-memberships', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.memberships)) {
            data.memberships.forEach((m: GumzoMembership) => membershipsStore.set(m.membershipId, m));
          }
          if (data && Array.isArray(data.groups)) {
            data.groups.forEach((g: GumzoGroup) => groupsStore.set(g.groupId, g));
          }
          persistToDisk();
          return {
            memberships: data.memberships || [],
            groups: data.groups || [],
          };
        }
      } catch (err) {
        console.warn('[gumzoGroupService] fetchBrowserUserMemberships error:', err);
      }
    }
    const mems = this.getUserMemberships(userId);
    const grps = this.getUserGroups(userId);
    return { memberships: mems, groups: grps };
  }

  public async fetchBrowserAdminGroups(options?: {
    statusFilter?: string;
    categoryFilter?: string;
    search?: string;
    callerUserId?: string;
    token?: string | null;
    userRole?: string;
    userEmail?: string;
  }): Promise<{
    groups: GumzoGroup[];
    total: number;
    counts: {
      total: number;
      pending: number;
      active: number;
      suspended: number;
      rejected: number;
      archived: number;
      draft: number;
    };
  }> {
    const { statusFilter, categoryFilter, search, callerUserId, token, userRole, userEmail } = options || {};
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams();
        if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);
        if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);
        if (search) params.append('search', search);

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (callerUserId) headers['x-user-id'] = callerUserId;
        if (userRole) headers['x-user-role'] = userRole;
        if (userEmail) headers['x-user-email'] = userEmail;
        headers['x-is-admin'] = 'true';

        const res = await fetch(`/api/gumzo/admin/groups?${params.toString()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && data.groups) {
            data.groups.forEach((g: GumzoGroup) => groupsStore.set(g.groupId, g));
            return {
              groups: data.groups,
              total: data.total ?? data.groups.length,
              counts: data.counts ?? {
                total: data.groups.length,
                pending: data.groups.filter((g: any) => g.status === 'PENDING_APPROVAL').length,
                active: data.groups.filter((g: any) => g.status === 'ACTIVE').length,
                suspended: data.groups.filter((g: any) => g.status === 'SUSPENDED').length,
                rejected: data.groups.filter((g: any) => g.status === 'REJECTED').length,
                archived: data.groups.filter((g: any) => g.status === 'ARCHIVED').length,
                draft: data.groups.filter((g: any) => g.status === 'DRAFT').length,
              },
            };
          }
        }
      } catch (err) {
        console.warn('[gumzoGroupService] fetchBrowserAdminGroups error, using local fallback:', err);
      }
    }

    // In-memory fallback
    let all = this.getAllGroups();
    const counts = {
      total: all.length,
      pending: all.filter((g) => g.status === 'PENDING_APPROVAL').length,
      active: all.filter((g) => g.status === 'ACTIVE').length,
      suspended: all.filter((g) => g.status === 'SUSPENDED').length,
      rejected: all.filter((g) => g.status === 'REJECTED').length,
      archived: all.filter((g) => g.status === 'ARCHIVED').length,
      draft: all.filter((g) => g.status === 'DRAFT').length,
    };
    if (statusFilter && statusFilter !== 'ALL') {
      all = all.filter((g) => g.status === statusFilter);
    }
    if (categoryFilter && categoryFilter !== 'all') {
      all = all.filter((g) => g.categoryId === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      all = all.filter((g) =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.groupId.toLowerCase().includes(q)
      );
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { groups: all, total: all.length, counts };
  }

  public async postBrowserUpdateGroupStatus(params: {
    groupId: string;
    newStatus: GumzoGroupStatus;
    adminUserId: string;
    token?: string | null;
    reason?: string;
    userRole?: string;
  }): Promise<GumzoGroup> {
    const { groupId, newStatus, adminUserId, token, reason, userRole } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (adminUserId) headers['x-user-id'] = adminUserId;
        if (userRole) headers['x-user-role'] = userRole;
        headers['x-is-admin'] = 'true';

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/status`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ status: newStatus, reason, adminUserId }),
        });
        if (res.ok) {
          const updated = await res.json();
          groupsStore.set(updated.groupId, updated);
          return updated;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kubadilisha hali ya kikundi.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.adminUpdateGroupStatus({
      groupId,
      newStatus,
      adminUserId,
      isPlatformAdmin: true,
      reason,
    });
  }

  public async postBrowserAssignLeadershipAdmin(params: {
    groupId: string;
    leadershipAdminUserId: string;
    platformAdminUserId: string;
    token?: string | null;
    userRole?: string;
  }): Promise<GumzoGroup> {
    const { groupId, leadershipAdminUserId, platformAdminUserId, token, userRole } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (platformAdminUserId) headers['x-user-id'] = platformAdminUserId;
        if (userRole) headers['x-user-role'] = userRole;
        headers['x-is-admin'] = 'true';

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/leadership`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ leadershipAdminUserId, platformAdminUserId }),
        });
        if (res.ok) {
          const updated = await res.json();
          groupsStore.set(updated.groupId, updated);
          return updated;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuteua Leadership Admin.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.assignLeadershipAdmin({
      groupId,
      leadershipAdminUserId,
      platformAdminUserId,
      isPlatformAdmin: true,
    });
  }

  public async postBrowserTransferFounderAdmin(params: {
    groupId: string;
    newFounderUserId: string;
    actingAdminUserId: string;
    reason?: string;
    token?: string | null;
    userRole?: string;
  }): Promise<{ group: GumzoGroup; previousFounderUserId: string; newFounderUserId: string; auditEvent: GumzoGovernanceAuditEvent }> {
    const { groupId, newFounderUserId, actingAdminUserId, reason, token, userRole } = params;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (actingAdminUserId) headers['x-user-id'] = actingAdminUserId;
        if (userRole) headers['x-user-role'] = userRole;
        headers['x-is-admin'] = 'true';

        const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/transfer-founder`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ newFounderUserId, actingAdminUserId, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.group) {
            groupsStore.set(data.group.groupId, data.group);
            return data;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Imeshindwa kuhamisha uongozi wa mwanzilishi.');
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('fetch')) {
          throw err;
        }
      }
    }
    return this.transferFounderAdmin({
      groupId,
      newFounderUserId,
      actingAdminUserId,
      isPlatformAdmin: true,
      reason,
    });
  }

  public async fetchBrowserAuditEvents(options?: {
    groupId?: string;
    action?: string;
    limit?: number;
    token?: string | null;
    callerUserId?: string;
  }): Promise<GumzoGovernanceAuditEvent[]> {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams();
        if (options?.groupId) params.append('groupId', options.groupId);
        if (options?.action) params.append('action', options.action);
        if (options?.limit) params.append('limit', String(options.limit));

        const headers: Record<string, string> = {};
        if (options?.token) headers['Authorization'] = `Bearer ${options.token}`;
        if (options?.callerUserId) headers['x-user-id'] = options.callerUserId;
        headers['x-is-admin'] = 'true';

        const res = await fetch(`/api/gumzo/admin/audit?${params.toString()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.auditEvents)) {
            return data.auditEvents;
          }
        }
      } catch (err) {
        console.warn('[gumzoGroupService] fetchBrowserAuditEvents error, using local fallback:', err);
      }
    }
    return gumzoAuditService.getEvents(options as any);
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
    if (isNode) loadFromDisk();
    return Array.from(groupsStore.values());
  }

  public getAllMemberships(): GumzoMembership[] {
    if (isNode) loadFromDisk();
    return Array.from(membershipsStore.values());
  }
}

export const gumzoGroupService = new GumzoGroupService();
