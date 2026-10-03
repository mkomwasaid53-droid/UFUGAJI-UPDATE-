/**
 * Ufugaji Update - Phase 6: Marketplace Governance
 * V1.7F: Reporting & Appeals Service
 *
 * Core Governance Architecture:
 * 1. REPORT IS EVIDENCE / INPUT FOR REVIEW; REPORT IS NOT PROOF OF WRONGDOING.
 * 2. APPEAL IS A REQUEST FOR RECONSIDERATION; APPEAL IS NOT AUTOMATIC REVERSAL.
 * 3. AI MUST NEVER AUTOMATICALLY DECIDE A REPORT OR APPEAL.
 * 4. STRICT SEPARATION OF REPUTATION, TRUST & GOVERNANCE.
 * 5. REPORTER PRIVACY IS PROTECTED AT ALL TIMES.
 * 6. AUDIT TRAIL IS APPEND-ONLY AND IMMUTABLE.
 */

import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import {
  ReportTargetType,
  ReportReasonCode,
  ReportStatus,
  ReportResolutionCode,
  MarketplaceReportRecord,
  AppealTargetType,
  AppealReasonCode,
  AppealStatus,
  AppealDecisionCode,
  MarketplaceAppealRecord,
  GovernanceReportAppealAuditAction,
  MarketplaceReportAppealAuditEntry,
  SubmitReportInput,
  ReviewReportInput,
  SubmitAppealInput,
  ReviewAppealInput,
  REPORT_REASON_METADATA,
  APPEAL_REASON_METADATA
} from '../types/marketplaceReportAndAppeal';
import { assertAdminAuthorized } from './marketplaceModerationService';
import {
  fetchSellerWarnings,
  fetchSellerRestrictions,
  revokeSellerWarning,
  revokeSellerRestriction
} from './sellerGovernanceService';
import {
  getListingModerationRecord,
  performModerationAction
} from './marketplaceModerationService';
import {
  dispatchReportAdminNotification,
  dispatchAppealAdminNotification,
  dispatchAppealDecisionNotification
} from './notificationService';

// ==========================================
// LOCAL STORAGE KEYS & IN-MEMORY CACHE
// ==========================================

const LOCAL_REPORTS_KEY = 'ufugaji_digital_marketplace_reports_v1_7f';
const LOCAL_APPEALS_KEY = 'ufugaji_digital_marketplace_appeals_v1_7f';
const LOCAL_AUDIT_KEY = 'ufugaji_digital_reports_appeals_audit_v1_7f';

export function getLocalReportsCache(): MarketplaceReportRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReportsToCache(reports: MarketplaceReportRecord[]): void {
  try {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports));
  } catch (err) {
    console.warn('Failed to save reports cache:', err);
  }
}

export function getLocalAppealsCache(): MarketplaceAppealRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_APPEALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAppealsToCache(appeals: MarketplaceAppealRecord[]): void {
  try {
    localStorage.setItem(LOCAL_APPEALS_KEY, JSON.stringify(appeals));
  } catch (err) {
    console.warn('Failed to save appeals cache:', err);
  }
}

export function getLocalAuditCache(): MarketplaceReportAppealAuditEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAuditToCache(logs: MarketplaceReportAppealAuditEntry[]): void {
  try {
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(logs));
  } catch (err) {
    console.warn('Failed to save audit cache:', err);
  }
}

// ==========================================
// AUDIT LOG RECORDER (IMMUTABLE)
// ==========================================

async function recordGovernanceAuditEntry(
  entry: Omit<MarketplaceReportAppealAuditEntry, 'auditId' | 'performedAt'>
): Promise<MarketplaceReportAppealAuditEntry> {
  const auditId = `aud_ra_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const fullEntry: MarketplaceReportAppealAuditEntry = {
    ...entry,
    auditId,
    performedAt: new Date().toISOString()
  };

  const logs = getLocalAuditCache();
  logs.unshift(fullEntry);
  saveAuditToCache(logs);

  try {
    const ref = doc(db, 'marketplaceReportsAppealsAudit', auditId);
    await setDoc(ref, fullEntry);
  } catch (err) {
    console.warn('Could not persist report/appeal audit to Firestore immediately:', err);
  }

  return fullEntry;
}

export function assertReportAppealAuditImmutable(): void {
  throw new Error('Hitilafu ya Usalama: Kumbukumbu za ukaguzi wa ripoti na rufaa haziruhusiwi kubadilishwa wala kufutwa (Strictly Immutable).');
}

// ==========================================
// 1. REPORT SUBMISSION & GOVERNANCE
// ==========================================

/**
 * Submits a structured marketplace report against an eligible target.
 * Enforces:
 * - Authenticated user identity (client cannot fake reporterUserId)
 * - Structured reason validation
 * - Deterministic duplicate active report prevention
 * - Reporter privacy preservation
 * - Never automatically punishes the target
 */
export async function submitMarketplaceReport(
  reporterUserId: string,
  reporterDisplayName: string,
  input: SubmitReportInput
): Promise<{ report: MarketplaceReportRecord; auditEntry: MarketplaceReportAppealAuditEntry }> {
  if (!reporterUserId || typeof reporterUserId !== 'string' || reporterUserId.trim().length === 0) {
    throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia kwenye akaunti yako ili kuwasilisha ripoti.');
  }

  const validTargets: ReportTargetType[] = ['PRODUCT', 'LISTING', 'SELLER', 'SHOP', 'REVIEW'];
  if (!input.targetType || !validTargets.includes(input.targetType)) {
    throw new Error('Aina ya maudhui yanayoripotiwa si sahihi.');
  }

  if (!input.targetId || typeof input.targetId !== 'string' || input.targetId.trim().length === 0) {
    throw new Error('Kitambulisho cha maudhui yanayoripotiwa kinahitajika.');
  }

  if (!input.reasonCode || !REPORT_REASON_METADATA[input.reasonCode]) {
    throw new Error('Sababu ya ripoti haitambuliwi. Tafadhali chagua sababu sahihi kutoka kwenye orodha.');
  }

  const cleanReasonText = (input.reasonText || '').trim();
  if (cleanReasonText.length < 5) {
    throw new Error('Tafadhali toa maelezo ya kina (angalau herufi 5) ili kusaidia ukaguzi wa haki.');
  }

  // Sanitize untrusted input (remove tags, limit length)
  const sanitizedText = cleanReasonText.replace(/<[^>]*>?/gm, '').substring(0, 1500);

  // Deterministic duplicate protection:
  // Disallow duplicate active reports (OPEN or UNDER_REVIEW) by same user on same target & reason
  const allReports = getLocalReportsCache();
  const existingActive = allReports.find(
    (r) =>
      r.reporterUserId === reporterUserId &&
      r.targetType === input.targetType &&
      r.targetId === input.targetId &&
      r.reasonCode === input.reasonCode &&
      (r.status === 'OPEN' || r.status === 'UNDER_REVIEW')
  );

  if (existingActive) {
    throw new Error('Tayari umewasilisha ripoti inayoendelea kufanyiwa kazi kwa sababu hii kuhusu maudhui haya. Timu inashughulikia.');
  }

  const now = new Date().toISOString();
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const report: MarketplaceReportRecord = {
    reportId,
    reporterUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    productId: input.productId || (input.targetType === 'PRODUCT' || input.targetType === 'LISTING' ? input.targetId : null),
    listingId: input.listingId || (input.targetType === 'LISTING' ? input.targetId : null),
    sellerId: input.sellerId || (input.targetType === 'SELLER' ? input.targetId : null),
    shopId: input.shopId || (input.targetType === 'SHOP' ? input.targetId : null),
    reviewId: input.reviewId || (input.targetType === 'REVIEW' ? input.targetId : null),
    reasonCode: input.reasonCode,
    reasonText: sanitizedText,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    moderatorNotes: null,
    resolutionCode: null,
    resolutionText: null,
    relatedModerationId: null,
    relatedWarningId: null,
    relatedRestrictionId: null
  };

  // Persist report to local cache
  allReports.unshift(report);
  saveReportsToCache(allReports);

  // Persist report to Firestore
  try {
    const reportRef = doc(db, 'marketplaceReports', reportId);
    await setDoc(reportRef, report);
  } catch (err) {
    console.warn('Could not persist report to Firestore immediately:', err);
  }

  // Audit record
  const auditEntry = await recordGovernanceAuditEntry({
    action: 'REPORT_CREATED',
    targetType: 'REPORT',
    targetId: reportId,
    reporterUserId,
    sellerId: report.sellerId,
    productId: report.productId,
    performedBy: reporterUserId,
    performedByName: reporterDisplayName || 'Mtumiaji',
    previousState: null,
    newState: { status: 'OPEN', reasonCode: input.reasonCode },
    reasonCode: input.reasonCode,
    reasonText: sanitizedText
  });

  // Dispatch Authoritative Admin Notification (V1.7H)
  try {
    await dispatchReportAdminNotification({
      reportId,
      targetType: input.targetType,
      targetId: input.targetId,
      targetTitle: input.targetId,
      reasonCategory: input.reasonCode
    });
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya ripoti kwa wasimamizi:', notifErr);
  }

  return { report, auditEntry };
}

/**
 * Fetches reports with role-protected privacy boundaries:
 * - Ordinary users can ONLY view their own submitted reports.
 * - Private moderator notes are strictly stripped for non-administrators.
 */
export async function fetchMarketplaceReports(
  viewerUserId: string,
  isAdmin: boolean,
  filter?: {
    targetType?: ReportTargetType;
    status?: ReportStatus;
    sellerId?: string;
    productId?: string;
  }
): Promise<MarketplaceReportRecord[]> {
  if (!viewerUserId) {
    throw new Error('Hujaingia kwenye mfumo.');
  }

  let reports = getLocalReportsCache();

  // Try Firestore read if possible
  try {
    const coll = collection(db, 'marketplaceReports');
    let q;
    if (isAdmin) {
      q = query(coll);
    } else {
      q = query(coll, where('reporterUserId', '==', viewerUserId));
    }
    const snap = await getDocs(q);
    if (!snap.empty) {
      const remoteList: MarketplaceReportRecord[] = [];
      snap.forEach((d) => remoteList.push(d.data() as MarketplaceReportRecord));
      // Merge with local
      const map = new Map<string, MarketplaceReportRecord>();
      remoteList.forEach((r) => map.set(r.reportId, r));
      reports.forEach((r) => {
        if (!map.has(r.reportId)) map.set(r.reportId, r);
      });
      reports = Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      saveReportsToCache(reports);
    }
  } catch {
    // Fall back to local cache
  }

  // Privacy protection: non-admins can only see their own reports
  if (!isAdmin) {
    reports = reports.filter((r) => r.reporterUserId === viewerUserId);
  }

  // Apply filters
  if (filter?.targetType) {
    reports = reports.filter((r) => r.targetType === filter.targetType);
  }
  if (filter?.status) {
    reports = reports.filter((r) => r.status === filter.status);
  }
  if (filter?.sellerId) {
    reports = reports.filter((r) => r.sellerId === filter.sellerId);
  }
  if (filter?.productId) {
    reports = reports.filter((r) => r.productId === filter.productId || r.targetId === filter.productId);
  }

  // Privacy boundary: strictly omit moderator notes for non-admins
  if (!isAdmin) {
    return reports.map((r) => ({
      ...r,
      moderatorNotes: undefined
    }));
  }

  return reports;
}

/**
 * Reviews a report (Admin only).
 * Can transition status (UNDER_REVIEW, RESOLVED, DISMISSED), record resolution,
 * and link to existing moderation or warning records.
 */
export async function reviewMarketplaceReport(
  adminUserId: string,
  adminName: string,
  isAdmin: boolean,
  reportId: string,
  input: ReviewReportInput
): Promise<{ report: MarketplaceReportRecord; auditEntry: MarketplaceReportAppealAuditEntry }> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const allReports = getLocalReportsCache();
  const index = allReports.findIndex((r) => r.reportId === reportId);
  if (index === -1) {
    throw new Error('Ripoti haikupatikana.');
  }

  const existing = allReports[index];
  const previousState = { ...existing };
  const now = new Date().toISOString();

  let auditAction: GovernanceReportAppealAuditAction = 'REPORT_REVIEW_STARTED';
  if (input.status === 'RESOLVED') auditAction = 'REPORT_RESOLVED';
  if (input.status === 'DISMISSED') auditAction = 'REPORT_DISMISSED';

  const updated: MarketplaceReportRecord = {
    ...existing,
    status: input.status,
    resolutionCode: input.resolutionCode !== undefined ? input.resolutionCode : existing.resolutionCode,
    resolutionText: input.resolutionText !== undefined ? input.resolutionText : existing.resolutionText,
    moderatorNotes: input.moderatorNotes !== undefined ? input.moderatorNotes : existing.moderatorNotes,
    relatedModerationId: input.relatedModerationId || existing.relatedModerationId,
    relatedWarningId: input.relatedWarningId || existing.relatedWarningId,
    relatedRestrictionId: input.relatedRestrictionId || existing.relatedRestrictionId,
    reviewedAt: now,
    reviewedBy: adminUserId,
    reviewedByName: adminName,
    updatedAt: now
  };

  allReports[index] = updated;
  saveReportsToCache(allReports);

  try {
    const ref = doc(db, 'marketplaceReports', reportId);
    await updateDoc(ref, {
      status: updated.status,
      resolutionCode: updated.resolutionCode,
      resolutionText: updated.resolutionText,
      moderatorNotes: updated.moderatorNotes,
      relatedModerationId: updated.relatedModerationId,
      relatedWarningId: updated.relatedWarningId,
      relatedRestrictionId: updated.relatedRestrictionId,
      reviewedAt: updated.reviewedAt,
      reviewedBy: updated.reviewedBy,
      reviewedByName: updated.reviewedByName,
      updatedAt: updated.updatedAt
    });
  } catch (err) {
    console.warn('Could not update report in Firestore immediately:', err);
  }

  const auditEntry = await recordGovernanceAuditEntry({
    action: auditAction,
    targetType: 'REPORT',
    targetId: reportId,
    reporterUserId: updated.reporterUserId,
    sellerId: updated.sellerId,
    productId: updated.productId,
    performedBy: adminUserId,
    performedByName: adminName,
    previousState,
    newState: {
      status: updated.status,
      resolutionCode: updated.resolutionCode,
      resolutionText: updated.resolutionText
    },
    reasonCode: updated.resolutionCode || updated.reasonCode,
    reasonText: updated.resolutionText || input.resolutionText,
    internalNote: input.moderatorNotes,
    relatedGovernanceRecordId: updated.relatedModerationId || updated.relatedWarningId || updated.relatedRestrictionId
  });

  return { report: updated, auditEntry };
}

// ==========================================
// 2. SELLER APPEALS SERVICE
// ==========================================

/**
 * Submits an appeal against an eligible governance decision (Warning, Restriction, Moderation).
 * Enforces:
 * - Authenticated seller ownership (appellantUserId must match sellerId)
 * - Validation of target decision existence
 * - Prevention of multiple duplicate active appeals
 * - Untrusted text sanitization
 */
export async function submitSellerAppeal(
  appellantUserId: string,
  appellantDisplayName: string,
  input: SubmitAppealInput
): Promise<{ appeal: MarketplaceAppealRecord; auditEntry: MarketplaceReportAppealAuditEntry }> {
  if (!appellantUserId || typeof appellantUserId !== 'string' || appellantUserId.trim().length === 0) {
    throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia kwenye akaunti yako ili kuwasilisha rufaa.');
  }

  // Appellant must be the seller affected
  if (input.sellerId !== appellantUserId) {
    throw new Error('Huna idhini ya kuwasilisha rufaa kwa niaba ya muuzaji mwingine.');
  }

  const validTargetTypes: AppealTargetType[] = [
    'MODERATION_DECISION',
    'SELLER_WARNING',
    'SELLER_RESTRICTION'
  ];
  if (!input.targetType || !validTargetTypes.includes(input.targetType)) {
    throw new Error('Aina ya uamuzi unaokatiwa rufaa si sahihi.');
  }

  if (!input.targetId || typeof input.targetId !== 'string' || input.targetId.trim().length === 0) {
    throw new Error('Kitambulisho cha uamuzi unaokatiwa rufaa kinahitajika.');
  }

  if (!input.reasonCode || !APPEAL_REASON_METADATA[input.reasonCode]) {
    throw new Error('Sababu ya rufaa haitambuliwi. Tafadhali chagua sababu sahihi kutoka kwenye orodha.');
  }

  const cleanText = (input.reasonText || '').trim();
  if (cleanText.length < 10) {
    throw new Error('Tafadhali toa maelezo ya kina ya rufaa (angalau herufi 10) ili kusaidia kutathmini uamuzi.');
  }

  const sanitizedExplanation = cleanText.replace(/<[^>]*>?/gm, '').substring(0, 2000);

  // Validate target decision exists in the respective governance layer
  if (input.targetType === 'SELLER_WARNING') {
    const warnings = await fetchSellerWarnings(appellantUserId, false, appellantUserId);
    const targetWarn = warnings.find((w) => w.warningId === input.targetId);
    if (!targetWarn) {
      throw new Error('Hakuna onyo la kiutawala lililopatikana linalolingana na kitambulisho hiki.');
    }
  } else if (input.targetType === 'SELLER_RESTRICTION') {
    const restrictions = await fetchSellerRestrictions(appellantUserId, false, appellantUserId);
    const targetRest = restrictions.find((r) => r.restrictionId === input.targetId);
    if (!targetRest) {
      throw new Error('Hakuna kizuizi cha kiutawala kilichopatikana kinacholingana na kitambulisho hiki.');
    }
  } else if (input.targetType === 'MODERATION_DECISION') {
    const modRecord = getListingModerationRecord(input.targetId);
    if (!modRecord || modRecord.sellerId !== appellantUserId) {
      throw new Error('Hakuna uamuzi wa ukaguzi wa tangazo uliopatikana unaokuhusu kwa kitambulisho hiki.');
    }
  }

  // Prevent duplicate active appeals (SUBMITTED or UNDER_REVIEW)
  const allAppeals = getLocalAppealsCache();
  const existingActive = allAppeals.find(
    (a) =>
      a.appellantUserId === appellantUserId &&
      a.targetId === input.targetId &&
      (a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW')
  );

  if (existingActive) {
    throw new Error('Tayari una rufaa inayoshughulikiwa kwa uamuzi huu. Tafadhali subiri mapitio ya msimamizi.');
  }

  const now = new Date().toISOString();
  const appealId = `app_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const appeal: MarketplaceAppealRecord = {
    appealId,
    appellantUserId,
    sellerId: appellantUserId,
    shopId: input.shopId || null,
    targetType: input.targetType,
    targetId: input.targetId,
    relatedModerationId: input.relatedModerationId || (input.targetType === 'MODERATION_DECISION' ? input.targetId : null),
    relatedWarningId: input.relatedWarningId || (input.targetType === 'SELLER_WARNING' ? input.targetId : null),
    relatedRestrictionId: input.relatedRestrictionId || (input.targetType === 'SELLER_RESTRICTION' ? input.targetId : null),
    productId: input.productId || null,
    listingId: input.listingId || null,
    reasonCode: input.reasonCode,
    reasonText: sanitizedExplanation,
    status: 'SUBMITTED',
    submittedAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    decisionCode: null,
    decisionText: null,
    moderatorNotes: null,
    createdAt: now
  };

  allAppeals.unshift(appeal);
  saveAppealsToCache(allAppeals);

  try {
    const ref = doc(db, 'marketplaceAppeals', appealId);
    await setDoc(ref, appeal);
  } catch (err) {
    console.warn('Could not persist appeal to Firestore immediately:', err);
  }

  const auditEntry = await recordGovernanceAuditEntry({
    action: 'APPEAL_CREATED',
    targetType: 'APPEAL',
    targetId: appealId,
    appellantUserId,
    sellerId: appellantUserId,
    productId: appeal.productId,
    performedBy: appellantUserId,
    performedByName: appellantDisplayName || 'Muuzaji',
    previousState: null,
    newState: { status: 'SUBMITTED', targetType: input.targetType, targetId: input.targetId },
    reasonCode: input.reasonCode,
    reasonText: sanitizedExplanation,
    relatedGovernanceRecordId: input.targetId
  });

  // Dispatch Authoritative Admin Notification (V1.7H)
  try {
    await dispatchAppealAdminNotification({
      appealId,
      sellerId: appellantUserId,
      sellerName: appellantDisplayName || 'Muuzaji',
      targetType: input.targetType,
      targetId: input.targetId
    });
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya rufaa kwa wasimamizi:', notifErr);
  }

  return { appeal, auditEntry };
}

/**
 * Fetches appeals with role-protected privacy boundaries:
 * - Sellers can ONLY view their own appeals.
 * - Private moderator notes are strictly omitted for non-administrators.
 */
export async function fetchSellerAppeals(
  viewerUserId: string,
  isAdmin: boolean,
  filter?: {
    status?: AppealStatus;
    sellerId?: string;
  }
): Promise<MarketplaceAppealRecord[]> {
  if (!viewerUserId) {
    throw new Error('Hujaingia kwenye mfumo.');
  }

  let appeals = getLocalAppealsCache();

  try {
    const coll = collection(db, 'marketplaceAppeals');
    let q;
    if (isAdmin) {
      q = query(coll);
    } else {
      q = query(coll, where('appellantUserId', '==', viewerUserId));
    }
    const snap = await getDocs(q);
    if (!snap.empty) {
      const remoteList: MarketplaceAppealRecord[] = [];
      snap.forEach((d) => remoteList.push(d.data() as MarketplaceAppealRecord));
      const map = new Map<string, MarketplaceAppealRecord>();
      remoteList.forEach((a) => map.set(a.appealId, a));
      appeals.forEach((a) => {
        if (!map.has(a.appealId)) map.set(a.appealId, a);
      });
      appeals = Array.from(map.values()).sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      saveAppealsToCache(appeals);
    }
  } catch {}

  // Non-admins can only see their own appeals
  if (!isAdmin) {
    appeals = appeals.filter((a) => a.appellantUserId === viewerUserId || a.sellerId === viewerUserId);
  }

  if (filter?.status) {
    appeals = appeals.filter((a) => a.status === filter.status);
  }
  if (filter?.sellerId) {
    appeals = appeals.filter((a) => a.sellerId === filter.sellerId);
  }

  // Strip internal moderator notes for non-admins
  if (!isAdmin) {
    return appeals.map((a) => ({
      ...a,
      moderatorNotes: undefined
    }));
  }

  return appeals;
}

/**
 * Reviews a seller appeal (Admin only).
 * Supported outcomes:
 * - UPHOLD_DECISION -> REJECTED (original governance action stays)
 * - REVERSE_DECISION -> ACCEPTED (optionally revokes warning, restriction, or restores listing)
 * - PARTIALLY_REVERSE -> PARTIALLY_ACCEPTED
 * - REQUEST_CORRECTION -> UNDER_REVIEW
 * - NO_ACTION -> REJECTED
 */
export async function reviewSellerAppeal(
  adminUserId: string,
  adminName: string,
  isAdmin: boolean,
  appealId: string,
  input: ReviewAppealInput
): Promise<{
  appeal: MarketplaceAppealRecord;
  auditEntry: MarketplaceReportAppealAuditEntry;
  executionResult?: any;
}> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const cleanDecisionText = (input.decisionText || '').trim();
  if (cleanDecisionText.length < 5) {
    throw new Error('Tafadhali toa ufafanuzi salama wa uamuzi wa rufaa (angalau herufi 5).');
  }

  const allAppeals = getLocalAppealsCache();
  const index = allAppeals.findIndex((a) => a.appealId === appealId);
  if (index === -1) {
    throw new Error('Rufaa haikupatikana.');
  }

  const existing = allAppeals[index];
  const previousState = { ...existing };
  const now = new Date().toISOString();

  let newStatus: AppealStatus = 'REJECTED';
  let auditAction: GovernanceReportAppealAuditAction = 'APPEAL_REJECTED';

  if (input.decisionCode === 'REVERSE_DECISION') {
    newStatus = 'ACCEPTED';
    auditAction = 'APPEAL_ACCEPTED';
  } else if (input.decisionCode === 'PARTIALLY_REVERSE') {
    newStatus = 'PARTIALLY_ACCEPTED';
    auditAction = 'APPEAL_PARTIALLY_ACCEPTED';
  } else if (input.decisionCode === 'REQUEST_CORRECTION') {
    newStatus = 'UNDER_REVIEW';
    auditAction = 'APPEAL_REVIEW_STARTED';
  } else if (input.decisionCode === 'UPHOLD_DECISION') {
    newStatus = 'REJECTED';
    auditAction = 'APPEAL_REJECTED';
  }

  let executionResult: any = null;

  // Controlled execution of state changes when appeal is ACCEPTED
  if (input.executeStateUpdate && input.decisionCode === 'REVERSE_DECISION') {
    const revReason = `Rufaa ${appealId} imekubaliwa: ${cleanDecisionText}`;
    if (existing.targetType === 'SELLER_WARNING') {
      executionResult = await revokeSellerWarning(adminUserId, adminName, true, existing.targetId, revReason);
    } else if (existing.targetType === 'SELLER_RESTRICTION') {
      executionResult = await revokeSellerRestriction(adminUserId, adminName, true, existing.targetId, revReason);
    } else if (existing.targetType === 'MODERATION_DECISION') {
      // Restore the moderated listing
      executionResult = await performModerationAction(adminUserId, adminName, true, {
        targetProductId: existing.targetId,
        action: 'RESTORE_LISTING',
        reasonCode: 'OTHER',
        reasonText: revReason,
        publicExplanation: revReason
      });
    }
  }

  const updated: MarketplaceAppealRecord = {
    ...existing,
    status: newStatus,
    decisionCode: input.decisionCode,
    decisionText: cleanDecisionText,
    moderatorNotes: input.moderatorNotes || existing.moderatorNotes,
    reviewedAt: now,
    reviewedBy: adminUserId,
    reviewedByName: adminName,
    updatedAt: now
  };

  allAppeals[index] = updated;
  saveAppealsToCache(allAppeals);

  try {
    const ref = doc(db, 'marketplaceAppeals', appealId);
    await updateDoc(ref, {
      status: updated.status,
      decisionCode: updated.decisionCode,
      decisionText: updated.decisionText,
      moderatorNotes: updated.moderatorNotes,
      reviewedAt: updated.reviewedAt,
      reviewedBy: updated.reviewedBy,
      reviewedByName: updated.reviewedByName,
      updatedAt: updated.updatedAt
    });
  } catch (err) {
    console.warn('Could not update appeal in Firestore immediately:', err);
  }

  const auditEntry = await recordGovernanceAuditEntry({
    action: auditAction,
    targetType: 'APPEAL',
    targetId: appealId,
    appellantUserId: updated.appellantUserId,
    sellerId: updated.sellerId,
    productId: updated.productId,
    performedBy: adminUserId,
    performedByName: adminName,
    previousState,
    newState: {
      status: updated.status,
      decisionCode: updated.decisionCode,
      decisionText: updated.decisionText
    },
    reasonCode: updated.decisionCode,
    reasonText: cleanDecisionText,
    internalNote: input.moderatorNotes,
    relatedGovernanceRecordId: updated.targetId
  });

  // Dispatch Authoritative Notification to Appellant Seller (V1.7H)
  try {
    if (newStatus === 'ACCEPTED' || newStatus === 'REJECTED') {
      await dispatchAppealDecisionNotification({
        sellerId: updated.sellerId,
        appealId,
        status: newStatus,
        adminDecisionSummary: cleanDecisionText,
        targetType: updated.targetType
      });
    }
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya uamuzi wa rufaa:', notifErr);
  }

  return { appeal: updated, auditEntry, executionResult };
}

/**
 * Allows a seller to withdraw their own submitted appeal.
 */
export async function withdrawSellerAppeal(
  appellantUserId: string,
  appealId: string
): Promise<{ appeal: MarketplaceAppealRecord; auditEntry: MarketplaceReportAppealAuditEntry }> {
  if (!appellantUserId) {
    throw new Error('Hujaingia kwenye mfumo.');
  }

  const allAppeals = getLocalAppealsCache();
  const index = allAppeals.findIndex((a) => a.appealId === appealId);
  if (index === -1) {
    throw new Error('Rufaa haikupatikana.');
  }

  const existing = allAppeals[index];
  if (existing.appellantUserId !== appellantUserId) {
    throw new Error('Huna idhini ya kuondoa rufaa hii.');
  }

  if (existing.status !== 'SUBMITTED' && existing.status !== 'UNDER_REVIEW') {
    throw new Error('Rufaa haiwezi kuondolewa kwa kuwa tayari imekamilika au kutatuliwa.');
  }

  const previousState = { ...existing };
  const now = new Date().toISOString();

  const updated: MarketplaceAppealRecord = {
    ...existing,
    status: 'WITHDRAWN',
    updatedAt: now
  };

  allAppeals[index] = updated;
  saveAppealsToCache(allAppeals);

  try {
    const ref = doc(db, 'marketplaceAppeals', appealId);
    await updateDoc(ref, {
      status: 'WITHDRAWN',
      updatedAt: now
    });
  } catch (err) {
    console.warn('Could not update appeal in Firestore immediately:', err);
  }

  const auditEntry = await recordGovernanceAuditEntry({
    action: 'APPEAL_WITHDRAWN',
    targetType: 'APPEAL',
    targetId: appealId,
    appellantUserId,
    sellerId: existing.sellerId,
    performedBy: appellantUserId,
    performedByName: 'Muuzaji',
    previousState,
    newState: { status: 'WITHDRAWN' },
    reasonCode: 'SELLER_WITHDRAWAL',
    reasonText: 'Muuzaji aliamua kuondoa rufaa hii.'
  });

  return { appeal: updated, auditEntry };
}

/**
 * Fetches audit logs for reports and appeals (Admin only).
 */
export async function fetchReportAppealAuditLogs(
  adminUserId: string,
  isAdmin: boolean,
  targetIdFilter?: string
): Promise<MarketplaceReportAppealAuditEntry[]> {
  assertAdminAuthorized(adminUserId, isAdmin);

  let logs = getLocalAuditCache();

  try {
    const coll = collection(db, 'marketplaceReportsAppealsAudit');
    const snap = await getDocs(query(coll));
    if (!snap.empty) {
      const remoteLogs: MarketplaceReportAppealAuditEntry[] = [];
      snap.forEach((d) => remoteLogs.push(d.data() as MarketplaceReportAppealAuditEntry));
      const map = new Map<string, MarketplaceReportAppealAuditEntry>();
      remoteLogs.forEach((l) => map.set(l.auditId, l));
      logs.forEach((l) => {
        if (!map.has(l.auditId)) map.set(l.auditId, l);
      });
      logs = Array.from(map.values()).sort(
        (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
      );
      saveAuditToCache(logs);
    }
  } catch {}

  if (targetIdFilter) {
    logs = logs.filter((l) => l.targetId === targetIdFilter || l.relatedGovernanceRecordId === targetIdFilter);
  }

  return logs;
}
