/**
 * V1.0 — GUMZO ENFORCEMENT & CONTENT MODERATION SERVICE
 *
 * Implements authoritative, safe, server-enforced moderation, reporting,
 * and visibility governance for Gumzo groups, posts, comments, and media.
 *
 * Key Principles:
 * 1. Two-Admin Governance:
 *    - FOUNDER_ADMIN: Scoped strictly to their group. Cannot moderate outside their group.
 *    - LEADERSHIP_ADMIN: Global governance scope across all groups.
 *    - MEMBER: Cannot moderate; cannot access admin-only post actions.
 * 2. Proportionality & Anti-Vigilante:
 *    - A user report creates an OPEN report record for admin triage.
 *    - A single report NEVER automatically hides content or suspends the author.
 * 3. Reporter Privacy:
 *    - Reporter identity and admin internal notes are strictly protected from the reported user.
 * 4. Content Visibility:
 *    - Hidden or removed content fails closed on feeds, direct-ID lookups, and media access.
 * 5. Notifications:
 *    - Idempotent notification dispatch for receipts, alerts, resolutions, and moderation actions.
 * 6. Audit Trail:
 *    - Append-only, authoritative logging via gumzoAuditService.
 */

import {
  GumzoPost,
  GumzoComment,
  GumzoGroup,
  GumzoGroupRole,
  GumzoReportRecord,
  GumzoReportReason,
  GumzoReportStatus,
  GumzoReportAction,
  SubmitGumzoReportInput,
  ResolveGumzoReportInput,
  GUMZO_REPORT_REASONS,
  canUserViewPost,
  canUserViewComment,
  isGroupFounderAdmin,
  isGroupLeadershipAdmin
} from '../types/gumzo';
import { gumzoGroupService } from './gumzoGroupService';
import { gumzoPostService } from './gumzoPostService';
import { gumzoCommentService } from './gumzoCommentService';
import { gumzoAuditService } from './gumzoAuditService';
import {
  dispatchGumzoReportReceivedNotification,
  dispatchGumzoAdminReportAlertNotification,
  dispatchGumzoReportResolvedNotification,
  dispatchGumzoContentModeratedNotification
} from './notificationService';

const isNode = typeof window === 'undefined';

// Local storage key for browser hydration
const LOCAL_REPORTS_KEY = 'ufugaji_gumzo_reports';

// Primary in-memory store for reports: Key = reportId
const reportsStore = new Map<string, GumzoReportRecord>();

function hydrateReportsFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((r: GumzoReportRecord) => reportsStore.set(r.reportId, r));
      }
    }
  } catch {}
}

function persistReportsToLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(Array.from(reportsStore.values())));
  } catch {}
}

if (!isNode) {
  hydrateReportsFromLocalStorage();
}

// Disk persistence handles (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let REPORTS_FILE = 'data/gumzo_reports.json';
let hasLoadedFromDisk = false;

export function initGumzoReportsStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  REPORTS_FILE = diskPath ? diskPath.join(baseDir, 'gumzo_reports.json') : `${baseDir}/gumzo_reports.json`;

  hasLoadedFromDisk = false;
  loadReportsFromDisk(true);
}

// Auto-initialize if running in Node.js
if (isNode) {
  try {
    const nodeReq = (globalThis as any).require;
    if (!diskFs && typeof nodeReq === 'function') {
      diskFs = nodeReq('fs');
      diskPath = nodeReq('path');
      initGumzoReportsStorage(diskFs, diskPath);
    }
  } catch {}
}

function loadReportsFromDisk(force = false): void {
  if (!diskFs || !diskFs.existsSync) return;
  if (hasLoadedFromDisk && !force) return;
  hasLoadedFromDisk = true;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    if (diskFs.existsSync(REPORTS_FILE)) {
      const data = JSON.parse(diskFs.readFileSync(REPORTS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        reportsStore.clear();
        data.forEach((r: GumzoReportRecord) => reportsStore.set(r.reportId, r));
      }
    }
  } catch (err) {
    console.warn('[gumzoEnforcementService] Disk load warning:', err);
  }
}

function persistReportsToDisk(): void {
  if (typeof window !== 'undefined') {
    persistReportsToLocalStorage();
    return;
  }
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }
    diskFs.writeFileSync(REPORTS_FILE, JSON.stringify(Array.from(reportsStore.values()), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[gumzoEnforcementService] Disk persist warning:', err);
  }
}

export class GumzoEnforcementService {
  /**
   * Helper: verify if an admin is authorized to moderate in a specific group.
   * - FOUNDER_ADMIN: must match group.founderAdminUserId (or membership role FOUNDER_ADMIN for that group)
   * - LEADERSHIP_ADMIN / Platform Admin: global governance authority across all groups
   * - Other / Member: denied
   */
  public canAdminModerateInGroup(
    adminUserId: string,
    group: GumzoGroup,
    isPlatformAdmin = false
  ): { allowed: boolean; role?: 'FOUNDER_ADMIN' | 'LEADERSHIP_ADMIN'; reason?: string } {
    if (!adminUserId || !adminUserId.trim()) {
      return { allowed: false, reason: 'Hujaingia kwenye mfumo (401 Unauthorized).' };
    }
    if (!group) {
      return { allowed: false, reason: 'Kikundi hakikupatikana.' };
    }

    if (isPlatformAdmin) {
      return { allowed: true, role: 'LEADERSHIP_ADMIN' };
    }

    // Check Leadership Admin
    if (isGroupLeadershipAdmin(adminUserId, group)) {
      return { allowed: true, role: 'LEADERSHIP_ADMIN' };
    }

    // Check Founder Admin (strictly scoped to this group)
    if (isGroupFounderAdmin(adminUserId, group)) {
      return { allowed: true, role: 'FOUNDER_ADMIN' };
    }

    // Check membership explicitly for role
    const membership = gumzoGroupService.getMembership(group.groupId, adminUserId);
    if (membership && membership.status === 'ACTIVE') {
      if (membership.role === 'LEADERSHIP_ADMIN') {
        return { allowed: true, role: 'LEADERSHIP_ADMIN' };
      }
      if (membership.role === 'FOUNDER_ADMIN') {
        return { allowed: true, role: 'FOUNDER_ADMIN' };
      }
    }

    // Check if user is a global platform admin via user service if available
    return {
      allowed: false,
      reason: 'Huna mamlaka ya usimamizi (Admin) katika kikundi hiki (403 Forbidden).'
    };
  }

  /**
   * 1. SUBMIT GUMZO REPORT
   *
   * Enforces:
   * - Authenticated user only (401 if missing)
   * - Target content must exist in group (404 if not found)
   * - Self-reporting is strictly blocked (400 if reporter == author)
   * - Reason validation against canonical GUMZO_REPORT_REASONS
   * - Idempotency: duplicate active report returns existing record without spamming
   * - Anti-Vigilante: does NOT automatically hide content or suspend user
   * - Immutable audit logging & notifications (receipt to reporter, alert to group admin)
   */
  public async submitReport(params: {
    input: SubmitGumzoReportInput;
    reporterUserId: string;
    reporterDisplayName?: string;
    isPlatformAdmin?: boolean;
  }): Promise<GumzoReportRecord> {
    const { input, reporterUserId, reporterDisplayName, isPlatformAdmin = false } = params;
    if (isNode) loadReportsFromDisk();

    if (!reporterUserId || !reporterUserId.trim()) {
      const err = new Error('Huruhusiwi kuwasilisha ripoti bila kuingia kwenye akaunti yako (401 Unauthorized).');
      (err as any).statusCode = 401;
      throw err;
    }

    const { groupId, targetType, targetId, reason, details } = input;
    if (!groupId || !targetType || !targetId || !reason) {
      const err = new Error('Taarifa zote muhimu za ripoti zinahitajika (groupId, targetType, targetId, reason).');
      (err as any).statusCode = 400;
      throw err;
    }

    // Validate reason
    const validReason = GUMZO_REPORT_REASONS.find((r) => r.code === reason);
    if (!validReason) {
      const err = new Error(`Sababu ya ripoti "${reason}" haikubaliki.`);
      (err as any).statusCode = 400;
      throw err;
    }

    // Validate group existence
    const group = gumzoGroupService.getGroupById(groupId, reporterUserId, isPlatformAdmin);
    if (!group) {
      const err = new Error('Kikundi hakikupatikana au huna idhini ya kukifikia.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Validate target content existence & retrieve author
    let targetAuthorUserId = '';
    let targetPreview = '';

    if (targetType === 'POST') {
      const post = gumzoPostService.getRawPost(targetId);
      if (!post || post.groupId !== groupId) {
        const err = new Error('Chapisho lililoripotiwa halikupatikana katika kikundi hiki.');
        (err as any).statusCode = 404;
        throw err;
      }
      targetAuthorUserId = post.authorUserId;
      targetPreview = post.content ? post.content.slice(0, 100) : '[Media post]';
    } else if (targetType === 'COMMENT') {
      const postId = input.postId;
      if (!postId) {
        const err = new Error('Kitambulisho cha chapisho (postId) kinahitajika kuripoti maoni.');
        (err as any).statusCode = 400;
        throw err;
      }
      const comment = gumzoCommentService.getCommentById(groupId, postId, targetId, reporterUserId, isPlatformAdmin);
      if (!comment) {
        const err = new Error('Maoni yaliyoripotiwa hayakupatikana katika kikundi hiki.');
        (err as any).statusCode = 404;
        throw err;
      }
      targetAuthorUserId = comment.authorUserId;
      targetPreview = comment.content ? comment.content.slice(0, 100) : '[Media comment]';
    } else {
      const err = new Error('Aina ya maudhui yaliyoripotiwa lazima iwe POST au COMMENT.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Self-reporting prevention
    if (targetAuthorUserId === reporterUserId) {
      const err = new Error('Huwezi kuripoti chapisho au maoni yako mwenyewe.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Idempotency check: existing OPEN or UNDER_REVIEW report by same reporter on same target
    const existingActive = Array.from(reportsStore.values()).find(
      (r) =>
        r.groupId === groupId &&
        r.targetType === targetType &&
        r.targetId === targetId &&
        r.reporterUserId === reporterUserId &&
        (r.status === 'OPEN' || r.status === 'UNDER_REVIEW')
    );

    if (existingActive) {
      // Return existing without duplicating or spamming admins
      return existingActive;
    }

    const now = new Date().toISOString();
    const reportId = `grep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const report: GumzoReportRecord = {
      reportId,
      groupId,
      targetType,
      targetId,
      postId: input.postId,
      reason,
      details: details ? details.trim() : undefined,
      reporterUserId,
      reporterDisplayName: reporterDisplayName || 'Mwanachama wa Jamii',
      targetAuthorUserId,
      status: 'OPEN',
      actionTaken: 'NONE',
      createdAt: now,
      updatedAt: now,
    };

    reportsStore.set(reportId, report);
    persistReportsToDisk();

    // Immutable audit logging
    gumzoAuditService.logEvent({
      actorUserId: reporterUserId,
      action: 'REPORT_SUBMITTED',
      targetType: targetType === 'POST' ? 'POST' : 'COMMENT',
      targetResourceId: targetId,
      groupId,
      outcome: 'SUCCESS',
      reason: validReason.labelSwahili,
      details: {
        reportId,
        reasonCode: reason,
        targetAuthorUserId,
      },
    });

    // Notifications:
    // 1. Receipt to reporter (protecting privacy)
    try {
      await dispatchGumzoReportReceivedNotification({
        reporterUserId,
        reportId,
        groupId,
        groupName: group.name,
        targetType,
      });
    } catch (e) {
      console.warn('[gumzoEnforcementService] Receipt notification failed:', e);
    }

    // 2. Alert to group administrators (Founder Admin and Leadership Admin)
    const adminRecipients = new Set<string>();
    if (group.founderAdminUserId && group.founderAdminUserId !== reporterUserId) {
      adminRecipients.add(group.founderAdminUserId);
    }
    if (group.leadershipAdminUserId && group.leadershipAdminUserId !== reporterUserId) {
      adminRecipients.add(group.leadershipAdminUserId);
    }

    for (const adminId of adminRecipients) {
      try {
        await dispatchGumzoAdminReportAlertNotification({
          adminUserId: adminId,
          reportId,
          groupId,
          groupName: group.name,
          targetType,
          targetId,
          reasonLabel: validReason.labelSwahili,
        });
      } catch (e) {
        console.warn(`[gumzoEnforcementService] Admin alert notification failed for ${adminId}:`, e);
      }
    }

    return report;
  }

  /**
   * 2. RESOLVE GUMZO REPORT (Authorized Admin Only)
   *
   * Enforces:
   * - Caller must be verified admin for this specific group (or global leadership/platform admin)
   * - Founder admin from another group receives 403 Forbidden
   * - Regular member receives 403 Forbidden
   * - Executes selected moderation action (HIDE, REMOVE, SUSPEND_MEMBER, or DISMISS)
   * - Preserves audit trail with admin notes and reviewer identity
   * - Dispatches safe resolution notification to reporter
   * - Dispatches transparent moderation notice to author (without leaking reporter)
   */
  public async resolveReport(params: {
    input: ResolveGumzoReportInput;
    actingAdminUserId: string;
    isPlatformAdmin?: boolean;
  }): Promise<GumzoReportRecord> {
    const { input, actingAdminUserId, isPlatformAdmin = false } = params;
    if (isNode) loadReportsFromDisk();

    const report = reportsStore.get(input.reportId);
    if (!report) {
      const err = new Error(`Ripoti ${input.reportId} haikupatikana.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const group = gumzoGroupService.getGroupById(report.groupId, actingAdminUserId, isPlatformAdmin);
    if (!group) {
      const err = new Error('Kikundi cha ripoti hii hakikupatikana.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Verify admin scope
    const authCheck = this.canAdminModerateInGroup(actingAdminUserId, group, isPlatformAdmin);
    if (!authCheck.allowed) {
      gumzoAuditService.logEvent({
        actorUserId: actingAdminUserId,
        action: 'PRIVILEGE_ESCALATION_ATTEMPT',
        targetType: 'GOVERNANCE',
        targetResourceId: input.reportId,
        groupId: report.groupId,
        outcome: 'DENIED',
        reason: 'Mtumiaji asiye na mamlaka amejaribu kushughulikia ripoti ya kikundi kingine.',
      });
      const err = new Error(authCheck.reason || 'Huna mamlaka ya kushughulikia ripoti hii (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();
    report.status = input.action === 'NONE' ? 'DISMISSED' : 'ACTION_TAKEN';
    report.actionTaken = input.action;
    report.internalNotes = input.internalNotes ? input.internalNotes.trim() : undefined;
    report.reviewedByUserId = actingAdminUserId;
    report.reviewedByRole = authCheck.role;
    report.reviewedAt = now;
    report.updatedAt = now;

    // Apply content or membership action
    if (input.action === 'CONTENT_HIDDEN') {
      if (report.targetType === 'POST') {
        await this.moderatePost({
          postId: report.targetId,
          action: 'HIDE',
          actingAdminUserId,
          isPlatformAdmin,
          reason: input.publicReason || 'Maudhui yamefichwa kufuatia mapitio ya ripoti ya jumuiya.',
        });
      } else if (report.targetType === 'COMMENT' && report.postId) {
        await this.moderateComment({
          groupId: report.groupId,
          postId: report.postId,
          commentId: report.targetId,
          action: 'HIDE',
          actingAdminUserId,
          isPlatformAdmin,
          reason: input.publicReason || 'Maoni yamefichwa kufuatia mapitio ya ripoti ya jumuiya.',
        });
      }
    } else if (input.action === 'CONTENT_REMOVED') {
      if (report.targetType === 'POST') {
        await this.moderatePost({
          postId: report.targetId,
          action: 'REMOVE',
          actingAdminUserId,
          isPlatformAdmin,
          reason: input.publicReason || 'Maudhui yameondolewa kufuatia ukiukwaji wa miongozo.',
        });
      } else if (report.targetType === 'COMMENT' && report.postId) {
        await this.moderateComment({
          groupId: report.groupId,
          postId: report.postId,
          commentId: report.targetId,
          action: 'REMOVE',
          actingAdminUserId,
          isPlatformAdmin,
          reason: input.publicReason || 'Maoni yameondolewa kufuatia ukiukwaji wa miongozo.',
        });
      }
    } else if (input.action === 'MEMBER_SUSPENDED') {
      try {
        gumzoGroupService.updateMembershipStatus(
          report.groupId,
          report.targetAuthorUserId,
          'SUSPENDED',
          actingAdminUserId,
          input.publicReason || 'Uanachama umesimamishwa kufuatia ripoti ya ukiukwaji wa miongozo.'
        );
      } catch (e) {
        console.warn('[gumzoEnforcementService] Member suspend warning:', e);
      }
    }

    reportsStore.set(report.reportId, report);
    persistReportsToDisk();

    // Audit log
    gumzoAuditService.logEvent({
      actorUserId: actingAdminUserId,
      action: input.action === 'NONE' ? 'REPORT_DISMISSED' : 'REPORT_RESOLVED',
      targetType: report.targetType === 'POST' ? 'POST' : 'COMMENT',
      targetResourceId: report.targetId,
      groupId: report.groupId,
      outcome: 'SUCCESS',
      reason: input.publicReason || (input.action === 'NONE' ? 'Ripoti imetupiliwa mbali bila hatua za adhabu.' : 'Hatua ya usimamizi imetekelezwa.'),
      details: {
        reportId: report.reportId,
        actionTaken: input.action,
        reviewedByRole: authCheck.role,
        internalNotes: input.internalNotes,
      },
    });

    // Notify Reporter (safe closure notice without leaking internal notes)
    try {
      await dispatchGumzoReportResolvedNotification({
        reporterUserId: report.reporterUserId,
        reportId: report.reportId,
        groupId: report.groupId,
        groupName: group.name,
        targetType: report.targetType,
        actionTaken: input.action,
      });
    } catch (e) {
      console.warn('[gumzoEnforcementService] Reporter resolution notice error:', e);
    }

    // Notify Content Owner if content was hidden or removed (without revealing reporter)
    if (input.action === 'CONTENT_HIDDEN' || input.action === 'CONTENT_REMOVED') {
      try {
        await dispatchGumzoContentModeratedNotification({
          authorUserId: report.targetAuthorUserId,
          groupId: report.groupId,
          groupName: group.name,
          targetType: report.targetType,
          targetId: report.targetId,
          actionTaken: input.action,
          publicReason: input.publicReason,
        });
      } catch (e) {
        console.warn('[gumzoEnforcementService] Author moderation notice error:', e);
      }
    }

    return report;
  }

  /**
   * 3. DIRECT POST MODERATION (HIDE, RESTORE, REMOVE)
   * Authoritative, scoped by group for Founder Admin, global for Leadership Admin.
   */
  public async moderatePost(params: {
    postId: string;
    action: 'HIDE' | 'RESTORE' | 'REMOVE';
    actingAdminUserId: string;
    isPlatformAdmin?: boolean;
    reason?: string;
  }): Promise<GumzoPost> {
    const { postId, action, actingAdminUserId, isPlatformAdmin = false, reason } = params;

    const post = gumzoPostService.getRawPost(postId);
    if (!post) {
      const err = new Error(`Chapisho ${postId} halikupatikana.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const group = gumzoGroupService.getGroupById(post.groupId, actingAdminUserId, isPlatformAdmin);
    if (!group) {
      const err = new Error('Kikundi cha chapisho hili hakikupatikana.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Scope check
    const authCheck = this.canAdminModerateInGroup(actingAdminUserId, group, isPlatformAdmin);
    if (!authCheck.allowed) {
      const err = new Error(authCheck.reason || 'Huna mamlaka ya kusimamia chapisho hili (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();

    if (action === 'HIDE') {
      post.status = 'HIDDEN';
      post.visibility = 'HIDDEN';
      post.moderationStatus = 'HIDDEN';
      post.moderatedAt = now;
      post.moderatedBy = actingAdminUserId;
      post.moderationReason = reason || 'Chapisho limefichwa na uongozi.';
    } else if (action === 'RESTORE') {
      post.status = 'PUBLISHED';
      post.visibility = 'VISIBLE';
      post.moderationStatus = 'RESTORED';
      post.moderatedAt = now;
      post.moderatedBy = actingAdminUserId;
      post.moderationReason = reason || 'Chapisho limerejeshwa na uongozi.';
    } else if (action === 'REMOVE') {
      post.status = 'DELETED';
      post.visibility = 'HIDDEN';
      post.moderationStatus = 'REMOVED';
      post.deletedAt = now;
      post.updatedBy = actingAdminUserId;
      post.moderatedAt = now;
      post.moderatedBy = actingAdminUserId;
      post.moderationReason = reason || 'Chapisho limeondolewa na uongozi.';
    }

    post.updatedAt = now;
    post.updatedBy = actingAdminUserId;

    // Use updatePost on post service to persist safely
    gumzoPostService.updatePost({
      postId,
      input: {
        status: post.status,
        visibility: post.visibility,
        moderationStatus: post.moderationStatus,
      },
      authenticatedUserId: actingAdminUserId,
      isPlatformAdmin: true, // internal service authorization
    });

    gumzoAuditService.logEvent({
      actorUserId: actingAdminUserId,
      action: action === 'RESTORE' ? 'POST_RESTORED' : (action === 'REMOVE' ? 'ADMIN_POST_DELETED' : 'POST_MODERATED'),
      targetType: 'POST',
      targetResourceId: postId,
      groupId: post.groupId,
      outcome: 'SUCCESS',
      reason: reason || `Msimamizi ametekeleza hatua ya: ${action}`,
      details: {
        action,
        actingRole: authCheck.role,
        postAuthorUserId: post.authorUserId,
      },
    });

    return post;
  }

  /**
   * 4. DIRECT COMMENT MODERATION (HIDE, RESTORE, REMOVE)
   */
  public async moderateComment(params: {
    groupId: string;
    postId: string;
    commentId: string;
    action: 'HIDE' | 'RESTORE' | 'REMOVE';
    actingAdminUserId: string;
    isPlatformAdmin?: boolean;
    reason?: string;
  }): Promise<GumzoComment> {
    const { groupId, postId, commentId, action, actingAdminUserId, isPlatformAdmin = false, reason } = params;

    const group = gumzoGroupService.getGroupById(groupId, actingAdminUserId, isPlatformAdmin);
    if (!group) {
      const err = new Error('Kikundi hakikupatikana.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Scope check
    const authCheck = this.canAdminModerateInGroup(actingAdminUserId, group, isPlatformAdmin);
    if (!authCheck.allowed) {
      const err = new Error(authCheck.reason || 'Huna mamlaka ya kusimamia maoni katika kikundi hiki (403 Forbidden).');
      (err as any).statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();

    if (action === 'HIDE') {
      const hidden = gumzoCommentService.hideComment({
        groupId,
        postId,
        commentId,
        authenticatedUserId: actingAdminUserId,
        isPlatformAdmin: true,
        reason,
      });
      hidden.moderationStatus = 'HIDDEN';
      hidden.moderatedAt = now;
      hidden.moderatedBy = actingAdminUserId;
      hidden.moderationReason = reason;

      gumzoAuditService.logEvent({
        actorUserId: actingAdminUserId,
        action: 'COMMENT_MODERATED',
        targetType: 'COMMENT',
        targetResourceId: commentId,
        groupId,
        outcome: 'SUCCESS',
        reason: reason || 'Msimamizi ameficha maoni.',
        details: { action: 'HIDE', actingRole: authCheck.role },
      });
      return hidden;
    }

    if (action === 'REMOVE') {
      const deleted = gumzoCommentService.deleteComment({
        groupId,
        postId,
        commentId,
        authenticatedUserId: actingAdminUserId,
        isPlatformAdmin: true,
      });
      deleted.moderationStatus = 'REMOVED';
      deleted.moderatedAt = now;
      deleted.moderatedBy = actingAdminUserId;
      deleted.moderationReason = reason;

      gumzoAuditService.logEvent({
        actorUserId: actingAdminUserId,
        action: 'COMMENT_MODERATED',
        targetType: 'COMMENT',
        targetResourceId: commentId,
        groupId,
        outcome: 'SUCCESS',
        reason: reason || 'Msimamizi ameondoa maoni.',
        details: { action: 'REMOVE', actingRole: authCheck.role },
      });
      return deleted;
    }

    if (action === 'RESTORE') {
      const comment = gumzoCommentService.getCommentById(groupId, postId, commentId, actingAdminUserId, true);
      if (!comment) {
        const err = new Error('Maoni hayakupatikana.');
        (err as any).statusCode = 404;
        throw err;
      }

      comment.status = 'PUBLISHED';
      comment.moderationStatus = 'RESTORED';
      comment.hiddenAt = undefined;
      comment.hiddenBy = undefined;
      comment.moderatedAt = now;
      comment.moderatedBy = actingAdminUserId;
      comment.moderationReason = reason || 'Maoni yamerejeshwa na uongozi.';
      comment.updatedAt = now;
      comment.updatedBy = actingAdminUserId;

      // Update active comment count on post
      const activeCount = gumzoCommentService.getActiveCommentCount(postId);
      gumzoPostService.updatePostCommentCount(postId, activeCount);

      gumzoAuditService.logEvent({
        actorUserId: actingAdminUserId,
        action: 'COMMENT_RESTORED',
        targetType: 'COMMENT',
        targetResourceId: commentId,
        groupId,
        outcome: 'SUCCESS',
        reason: reason || 'Msimamizi amerejesha maoni kuwa amilifu.',
        details: { action: 'RESTORE', actingRole: authCheck.role },
      });
      return comment;
    }

    throw new Error(`Hatua isiyojulikana: ${action}`);
  }

  /**
   * 5. GET ADMIN REPORTS QUEUE
   * Scoped to group for Founder Admin, global for Leadership Admin.
   */
  public getAdminReports(params: {
    actingAdminUserId: string;
    isPlatformAdmin?: boolean;
    groupId?: string;
    status?: GumzoReportStatus;
  }): GumzoReportRecord[] {
    const { actingAdminUserId, isPlatformAdmin = false, groupId, status } = params;
    if (isNode) loadReportsFromDisk();

    const allReports = Array.from(reportsStore.values());

    return allReports.filter((r) => {
      // Group filter
      if (groupId && r.groupId !== groupId) return false;

      // Scope check for acting admin
      const group = gumzoGroupService.getGroupById(r.groupId, actingAdminUserId, isPlatformAdmin);
      if (!group) return false;

      const authCheck = this.canAdminModerateInGroup(actingAdminUserId, group, isPlatformAdmin);
      if (!authCheck.allowed) return false;

      // Status filter
      if (status && r.status !== status) return false;

      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 6. SANITIZATION FOR USER & PUBLIC SURFACES
   */

  /**
   * Strips sensitive reporter and moderation internal notes for ordinary clients.
   */
  public sanitizeReportForUser(
    report: GumzoReportRecord,
    callerUserId?: string | null,
    isAdmin = false
  ): Partial<GumzoReportRecord> {
    if (isAdmin) return report;
    // Reporter can see their own report but never internal notes
    if (callerUserId && report.reporterUserId === callerUserId) {
      const { internalNotes, ...safe } = report;
      return safe;
    }
    // General user cannot see reporter ID or notes
    return {
      reportId: report.reportId,
      groupId: report.groupId,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      status: report.status,
      actionTaken: report.actionTaken,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  /**
   * Masks restricted post content on public surfaces if post is hidden or removed.
   */
  public sanitizePostForPublic(
    post: GumzoPost,
    callerUserId?: string | null,
    isGroupAdmin = false
  ): GumzoPost {
    const isHiddenOrRemoved =
      post.status === 'HIDDEN' ||
      post.status === 'DELETED' ||
      post.visibility === 'HIDDEN' ||
      post.moderationStatus === 'HIDDEN' ||
      post.moderationStatus === 'REMOVED';

    if (!isHiddenOrRemoved) {
      return post;
    }

    if (isGroupAdmin || (callerUserId && post.authorUserId === callerUserId && post.moderationStatus !== 'HIDDEN' && post.moderationStatus !== 'REMOVED')) {
      return post;
    }

    return {
      ...post,
      content: '[Maudhui haya yamefichwa au kuondolewa na wasimamizi wa jamii]',
      media: [],
    };
  }

  /**
   * Masks restricted comment content on public surfaces if comment is hidden or removed.
   */
  public sanitizeCommentForPublic(
    comment: GumzoComment,
    callerUserId?: string | null,
    isGroupAdmin = false
  ): GumzoComment {
    const isHiddenOrRemoved =
      comment.status === 'HIDDEN' ||
      comment.status === 'DELETED' ||
      comment.moderationStatus === 'HIDDEN' ||
      comment.moderationStatus === 'REMOVED';

    if (!isHiddenOrRemoved) {
      return comment;
    }

    if (isGroupAdmin) {
      return comment;
    }

    return {
      ...comment,
      content: '[Maoni haya yameondolewa na wasimamizi]',
      media: [],
    };
  }

  /**
   * 7. MEDIA ACCESS VALIDATION
   * Prevents unauthorized access to media attached to hidden or removed posts/comments.
   */
  public validateMediaAccess(params: {
    mediaUrlOrPath: string;
    callerUserId?: string | null;
    isPlatformAdmin?: boolean;
  }): { allowed: boolean; reason?: string } {
    const { mediaUrlOrPath, callerUserId, isPlatformAdmin = false } = params;
    if (!mediaUrlOrPath) return { allowed: false, reason: 'Njia ya faili haipo.' };

    if (isPlatformAdmin) return { allowed: true };

    // Search matching post
    const allPosts = gumzoPostService.getAllRawPosts();
    for (const post of allPosts) {
      const hasMedia = (post.media || []).some(
        (m) => m.url === mediaUrlOrPath || (m.storagePath && mediaUrlOrPath.includes(m.storagePath))
      );
      if (hasMedia) {
        const isHiddenOrRemoved =
          post.status === 'HIDDEN' ||
          post.status === 'DELETED' ||
          post.visibility === 'HIDDEN' ||
          post.moderationStatus === 'HIDDEN' ||
          post.moderationStatus === 'REMOVED';

        if (isHiddenOrRemoved) {
          const group = gumzoGroupService.getGroupById(post.groupId, callerUserId, isPlatformAdmin);
          if (!group) return { allowed: false, reason: 'Maudhui yamefichwa.' };
          const auth = this.canAdminModerateInGroup(callerUserId || '', group, isPlatformAdmin);
          if (!auth.allowed && (!callerUserId || callerUserId !== post.authorUserId)) {
            return { allowed: false, reason: 'Picha au video hii imefichwa kufuatia hatua ya kimaadili.' };
          }
        }
      }
    }

    // Search matching comment
    const allComments = gumzoCommentService.getAllRawComments();
    for (const comment of allComments) {
      const hasMedia = (comment.media || []).some(
        (m) => m.url === mediaUrlOrPath || (m.storagePath && mediaUrlOrPath.includes(m.storagePath))
      );
      if (hasMedia) {
        const isHiddenOrRemoved =
          comment.status === 'HIDDEN' ||
          comment.status === 'DELETED' ||
          comment.moderationStatus === 'HIDDEN' ||
          comment.moderationStatus === 'REMOVED';

        if (isHiddenOrRemoved) {
          const group = gumzoGroupService.getGroupById(comment.groupId, callerUserId, isPlatformAdmin);
          if (!group) return { allowed: false, reason: 'Maoni yamefichwa.' };
          const auth = this.canAdminModerateInGroup(callerUserId || '', group, isPlatformAdmin);
          if (!auth.allowed && (!callerUserId || callerUserId !== comment.authorUserId)) {
            return { allowed: false, reason: 'Picha au video hii ya maoni imefichwa.' };
          }
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Reset helper for testing isolation
   */
  public _resetForTesting(): void {
    reportsStore.clear();
    hasLoadedFromDisk = false;
  }
}

export const gumzoEnforcementService = new GumzoEnforcementService();
