/**
 * Ufugaji Update - Phase 6: Marketplace Governance
 * V1.7E: Seller Warnings & Restrictions Service
 *
 * This service manages structured seller warnings and controlled restrictions.
 *
 * Core Governance Invariants:
 * 1. Role-Protected: Only verified administrators can issue warnings, impose restrictions,
 *    resolve warnings, or revoke restrictions.
 * 2. Privacy Enforced: Internal notes are strictly stripped for non-administrators.
 * 3. Scope Enforced: Restrictions apply only to their declared capability (e.g. LISTING_CREATION).
 * 4. Authority Separation: Warnings/restrictions NEVER alter Seller Verification Status,
 *    Shop Ownership, Product Ownership, Price, Stock, Location, or Reviews.
 * 5. No Reputation/Fraud Score: NEVER compute a numerical score. Present only structured historical records.
 * 6. Deterministic Expiration: Expired restrictions no longer actively block capabilities.
 * 7. Immutable Audit Trail: All actions produce an append-only audit record.
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  SellerWarning,
  SellerRestriction,
  SellerGovernanceAuditEntry,
  SellerGovernanceSummary,
  IssueWarningInput,
  ImposeRestrictionInput,
  SellerRestrictionScope
} from '../types/sellerGovernance';
import { assertAdminAuthorized } from './marketplaceModerationService';
import {
  dispatchWarningNotification,
  dispatchRestrictionNotification,
  dispatchRestrictionRevokedNotification
} from './notificationService';

// ==========================================
// CACHE KEYS & ENVIRONMENT CONSTANTS
// ==========================================

const WARNINGS_CACHE_KEY = 'ufugaji_seller_warnings_cache';
const RESTRICTIONS_CACHE_KEY = 'ufugaji_seller_restrictions_cache';
const AUDIT_CACHE_KEY = 'ufugaji_seller_governance_audit_cache';

const isNode = typeof window === 'undefined' || !window.location || !window.location.origin;

async function safeFirestoreOp<T>(promise: Promise<T>, timeoutMs: number = 2000): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch {
    return null;
  }
}

// ==========================================
// LOCAL STORAGE CACHE HELPERS
// ==========================================

// In-memory cache variables for fast rendering/typing without repeated localStorage JSON parsing
let inMemoryWarningsCache: SellerWarning[] | null = null;
let inMemoryRestrictionsCache: SellerRestriction[] | null = null;
let inMemoryAuditLogsCache: SellerGovernanceAuditEntry[] | null = null;

export function getLocalCachedWarnings(): SellerWarning[] {
  if (inMemoryWarningsCache !== null) {
    return inMemoryWarningsCache;
  }
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(WARNINGS_CACHE_KEY);
    if (!raw) {
      inMemoryWarningsCache = [];
      return [];
    }
    const parsed = JSON.parse(raw);
    const result = Array.isArray(parsed) ? parsed : [];
    inMemoryWarningsCache = result;
    return result;
  } catch {
    return [];
  }
}

export function saveWarningsToCache(warnings: SellerWarning[]): void {
  inMemoryWarningsCache = [...warnings];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WARNINGS_CACHE_KEY, JSON.stringify(warnings));
    }
  } catch {}
}

export function getLocalCachedRestrictions(): SellerRestriction[] {
  if (inMemoryRestrictionsCache !== null) {
    return inMemoryRestrictionsCache;
  }
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RESTRICTIONS_CACHE_KEY);
    if (!raw) {
      inMemoryRestrictionsCache = [];
      return [];
    }
    const parsed = JSON.parse(raw);
    const result = Array.isArray(parsed) ? parsed : [];
    inMemoryRestrictionsCache = result;
    return result;
  } catch {
    return [];
  }
}

export function saveRestrictionsToCache(restrictions: SellerRestriction[]): void {
  inMemoryRestrictionsCache = [...restrictions];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RESTRICTIONS_CACHE_KEY, JSON.stringify(restrictions));
    }
  } catch {}
}

export function getLocalCachedGovernanceAuditLogs(): SellerGovernanceAuditEntry[] {
  if (inMemoryAuditLogsCache !== null) {
    return inMemoryAuditLogsCache;
  }
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(AUDIT_CACHE_KEY);
    if (!raw) {
      inMemoryAuditLogsCache = [];
      return [];
    }
    const parsed = JSON.parse(raw);
    const result = Array.isArray(parsed) ? parsed : [];
    inMemoryAuditLogsCache = result;
    return result;
  } catch {
    return [];
  }
}

export function saveGovernanceAuditLogsToCache(logs: SellerGovernanceAuditEntry[]): void {
  inMemoryAuditLogsCache = [...logs];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(logs));
    }
  } catch {}
}

// ==========================================
// DETERMINISTIC TIME & EXPIRATION HELPERS
// ==========================================

/**
 * Evaluates whether a warning or restriction has expired based on its expiresAt timestamp.
 */
export function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  try {
    const expiryTime = new Date(expiresAt).getTime();
    return !isNaN(expiryTime) && expiryTime <= Date.now();
  } catch {
    return false;
  }
}

// ==========================================
// READ ACCESS & PRIVACY STRIPPING
// ==========================================

/**
 * Fetches warnings for a specific seller.
 * PRIVACY INVARIANT: If the caller is NOT an admin, internalNote is strictly omitted!
 */
export async function fetchSellerWarnings(
  callerUserId: string,
  isAdmin: boolean,
  targetSellerId: string
): Promise<SellerWarning[]> {
  if (!targetSellerId || !targetSellerId.trim()) return [];
  const cleanSellerId = targetSellerId.trim();

  // Privacy barrier: Non-admins can only view their own warnings
  if (!isAdmin && cleanSellerId !== callerUserId.trim()) {
    throw new Error('Huna idhini ya kutazama kumbukumbu za usimamizi za muuzaji mwingine.');
  }

  const allWarnings = getLocalCachedWarnings();
  const sellerWarnings = allWarnings
    .filter((w) => w.sellerId === cleanSellerId)
    .map((w) => {
      // Deterministic expiry check
      const currentStatus = (w.status === 'ACTIVE' && isExpired(w.expiresAt)) ? 'EXPIRED' : w.status;
      const warningCopy = { ...w, status: currentStatus };

      // Strip internal moderation notes for non-admins
      if (!isAdmin) {
        delete warningCopy.internalNote;
      }
      return warningCopy;
    });

  return sellerWarnings;
}

/**
 * Fetches restrictions for a specific seller.
 * PRIVACY INVARIANT: Internal notes are strictly stripped for non-admins.
 */
export async function fetchSellerRestrictions(
  callerUserId: string,
  isAdmin: boolean,
  targetSellerId: string
): Promise<SellerRestriction[]> {
  if (!targetSellerId || !targetSellerId.trim()) return [];
  const cleanSellerId = targetSellerId.trim();

  if (!isAdmin && cleanSellerId !== callerUserId.trim()) {
    throw new Error('Huna idhini ya kutazama vizuizi vya muuzaji mwingine.');
  }

  const allRestrictions = getLocalCachedRestrictions();
  const sellerRestrictions = allRestrictions
    .filter((r) => r.sellerId === cleanSellerId)
    .map((r) => {
      const currentStatus = (r.status === 'ACTIVE' && isExpired(r.expiresAt)) ? 'EXPIRED' : r.status;
      const restrictionCopy = { ...r, status: currentStatus };

      if (!isAdmin) {
        delete restrictionCopy.internalNote;
      }
      return restrictionCopy;
    });

  return sellerRestrictions;
}

/**
 * Computes structured governance summary for a seller.
 * ANTI-SLOP & REPUTATION SAFETY MANDATE:
 * Absolutely NO seller reputation score, fraud score, trust score, or AI risk score is computed.
 */
export async function getSellerGovernanceSummary(
  callerUserId: string,
  isAdmin: boolean,
  targetSellerId: string
): Promise<SellerGovernanceSummary> {
  const cleanSellerId = (targetSellerId || '').trim();
  if (!cleanSellerId) {
    return {
      sellerId: '',
      activeWarningsCount: 0,
      totalWarningsCount: 0,
      activeRestrictions: [],
      hasActiveRestriction: false,
      isListingCreateRestricted: false,
      isListingEditRestricted: false,
      isMarketplaceSellingRestricted: false,
      isProductReviewRequired: false,
      warnings: [],
      restrictions: []
    };
  }

  const warnings = await fetchSellerWarnings(callerUserId, isAdmin, cleanSellerId);
  const restrictions = await fetchSellerRestrictions(callerUserId, isAdmin, cleanSellerId);

  const activeWarnings = warnings.filter((w) => w.status === 'ACTIVE');
  const activeRestrictions = restrictions.filter((r) => r.status === 'ACTIVE' && !isExpired(r.expiresAt));

  const isListingCreateRestricted = activeRestrictions.some(
    (r) => r.restrictionType === 'LISTING_CREATE_RESTRICTED' || r.scope === 'LISTING_CREATION' || r.restrictionType === 'MARKETPLACE_SELLING_RESTRICTED'
  );
  const isListingEditRestricted = activeRestrictions.some(
    (r) => r.restrictionType === 'LISTING_EDIT_RESTRICTED' || r.scope === 'LISTING_EDITING'
  );
  const isMarketplaceSellingRestricted = activeRestrictions.some(
    (r) => r.restrictionType === 'MARKETPLACE_SELLING_RESTRICTED' || r.scope === 'MARKETPLACE_SELLING'
  );
  const isProductReviewRequired = activeRestrictions.some(
    (r) => r.restrictionType === 'NEW_PRODUCT_REVIEW_REQUIRED' || r.scope === 'PRODUCT_REVIEW'
  );

  let effectiveRestrictionNotice: string | null = null;
  if (activeRestrictions.length > 0) {
    const first = activeRestrictions[0];
    effectiveRestrictionNotice = first.reasonText || 'Uwezo fulani wa sokoni umesitishwa kwa mujibu wa taratibu za usimamizi.';
  }

  let auditLogs: SellerGovernanceAuditEntry[] = [];
  if (isAdmin) {
    auditLogs = getLocalCachedGovernanceAuditLogs().filter((log) => log.sellerId === cleanSellerId);
  }

  return {
    sellerId: cleanSellerId,
    activeWarningsCount: activeWarnings.length,
    totalWarningsCount: warnings.length,
    activeRestrictions,
    hasActiveRestriction: activeRestrictions.length > 0,
    isListingCreateRestricted,
    isListingEditRestricted,
    isMarketplaceSellingRestricted,
    isProductReviewRequired,
    effectiveRestrictionNotice,
    warnings,
    restrictions,
    auditLogs
  };
}

// ==========================================
// ISSUE SELLER WARNING (ADMIN ONLY)
// ==========================================

export async function issueSellerWarning(
  adminUserId: string,
  adminUserName: string,
  isAdmin: boolean,
  input: IssueWarningInput
): Promise<{ success: boolean; warning: SellerWarning; auditEntry: SellerGovernanceAuditEntry }> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const targetSellerId = (input.targetSellerId || '').trim();
  if (!targetSellerId) {
    throw new Error('Kitambulisho cha muuzaji kinahitajika ili kutoa onyo.');
  }

  if (!input.reasonCode || !input.reasonCode.trim()) {
    throw new Error('Sababu ya kisheria (Reason Code) inahitajika.');
  }

  if (!input.reasonText || !input.reasonText.trim()) {
    throw new Error('Maelezo ya onyo kwa muuzaji (Swahili Explanation) yanahitajika.');
  }

  const now = new Date().toISOString();
  let expiresAt: string | null = null;
  if (input.expiresInDays && input.expiresInDays > 0) {
    const expDate = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    expiresAt = expDate.toISOString();
  }

  const warningId = `warn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditId = `aud_warn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const warning: SellerWarning = {
    warningId,
    sellerId: targetSellerId,
    userId: targetSellerId,
    shopId: input.shopId || targetSellerId,
    warningType: input.warningType,
    severity: input.severity,
    status: 'ACTIVE',
    reasonCode: input.reasonCode.trim(),
    reasonText: input.reasonText.trim(),
    internalNote: input.internalNote?.trim() || null,
    sourceType: input.sourceType || 'MODERATION',
    sourceId: input.sourceId || null,
    relatedListingId: input.relatedListingId || null,
    relatedModerationId: input.relatedModerationId || null,
    issuedBy: adminUserId,
    issuedByName: adminUserName,
    issuedAt: now,
    expiresAt
  };

  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'ISSUE_WARNING',
    targetType: 'SELLER_WARNING',
    targetId: warningId,
    sellerId: targetSellerId,
    performedBy: adminUserId,
    performedByName: adminUserName,
    performedAt: now,
    newState: warning,
    reasonCode: warning.reasonCode,
    reasonText: warning.reasonText,
    internalNote: warning.internalNote,
    sourceType: warning.sourceType,
    sourceId: warning.sourceId
  };

  // 1. Cache updates
  const warnings = getLocalCachedWarnings();
  warnings.unshift(warning);
  saveWarningsToCache(warnings);

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  // 2. Remote persistence (guarded)
  if (!isNode) {
    try {
      await safeFirestoreOp(setDoc(doc(db, 'sellerWarnings', warningId), warning), 1500);
      await safeFirestoreOp(setDoc(doc(db, 'sellerGovernanceAudit', auditId), auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore seller warning notice (cached locally):', err);
    }
  }

  // 3. Dispatch Authoritative Notification (V1.7H)
  try {
    await dispatchWarningNotification({
      sellerId: targetSellerId,
      warningId,
      severity: warning.severity,
      publicReason: warning.reasonText,
      correctionInstructions: undefined
    });
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya onyo kwa muuzaji:', notifErr);
  }

  return { success: true, warning, auditEntry };
}

// ==========================================
// ACKNOWLEDGE SELLER WARNING (SELLER ONLY)
// ==========================================

export async function acknowledgeSellerWarning(
  sellerUserId: string,
  warningId: string
): Promise<{ success: boolean; warning: SellerWarning; auditEntry: SellerGovernanceAuditEntry }> {
  if (!sellerUserId || !sellerUserId.trim()) {
    throw new Error('Lazima uwe umeingia kwenye akaunti yako ili kuthibitisha onyo.');
  }
  const cleanUserId = sellerUserId.trim();

  const allWarnings = getLocalCachedWarnings();
  const warningIndex = allWarnings.findIndex((w) => w.warningId === warningId);
  if (warningIndex < 0) {
    throw new Error('Onyo halikupatikana.');
  }

  const existingWarning = allWarnings[warningIndex];

  // Invariant: Only the targeted seller can acknowledge their own warning
  if (existingWarning.sellerId !== cleanUserId) {
    throw new Error('Huna idhini ya kuthibitisha onyo la muuzaji mwingine.');
  }

  // Acknowledgment means "I have read/received this warning", NOT an admission of guilt
  const now = new Date().toISOString();
  const updatedWarning: SellerWarning = {
    ...existingWarning,
    status: 'ACKNOWLEDGED',
    acknowledgedAt: now
  };

  const auditId = `aud_ack_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'ACKNOWLEDGE_WARNING',
    targetType: 'SELLER_WARNING',
    targetId: warningId,
    sellerId: cleanUserId,
    performedBy: cleanUserId,
    performedByName: 'Muuzaji (Acknowledge)',
    performedAt: now,
    previousState: { status: existingWarning.status },
    newState: { status: 'ACKNOWLEDGED', acknowledgedAt: now }
  };

  allWarnings[warningIndex] = updatedWarning;
  saveWarningsToCache(allWarnings);

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  if (!isNode) {
    try {
      await safeFirestoreOp(setDoc(doc(db, 'sellerWarnings', warningId), updatedWarning, { merge: true }), 1500);
      await safeFirestoreOp(setDoc(doc(db, 'sellerGovernanceAudit', auditId), auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore acknowledge warning notice (cached locally):', err);
    }
  }

  return { success: true, warning: updatedWarning, auditEntry };
}

// ==========================================
// RESOLVE SELLER WARNING (ADMIN ONLY)
// ==========================================

export async function resolveSellerWarning(
  adminUserId: string,
  adminUserName: string,
  isAdmin: boolean,
  warningId: string,
  resolutionNote?: string
): Promise<{ success: boolean; warning: SellerWarning; auditEntry: SellerGovernanceAuditEntry }> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const allWarnings = getLocalCachedWarnings();
  const warningIndex = allWarnings.findIndex((w) => w.warningId === warningId);
  if (warningIndex < 0) {
    throw new Error('Onyo halikupatikana.');
  }

  const existingWarning = allWarnings[warningIndex];
  const now = new Date().toISOString();

  const updatedWarning: SellerWarning = {
    ...existingWarning,
    status: 'RESOLVED',
    resolvedAt: now,
    internalNote: resolutionNote ? `${existingWarning.internalNote || ''}\n[Resolution: ${resolutionNote}]` : existingWarning.internalNote
  };

  const auditId = `aud_res_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'RESOLVE_WARNING',
    targetType: 'SELLER_WARNING',
    targetId: warningId,
    sellerId: existingWarning.sellerId,
    performedBy: adminUserId,
    performedByName: adminUserName,
    performedAt: now,
    previousState: { status: existingWarning.status },
    newState: { status: 'RESOLVED', resolvedAt: now },
    internalNote: resolutionNote
  };

  allWarnings[warningIndex] = updatedWarning;
  saveWarningsToCache(allWarnings);

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  if (!isNode) {
    try {
      await safeFirestoreOp(setDoc(doc(db, 'sellerWarnings', warningId), updatedWarning, { merge: true }), 1500);
      await safeFirestoreOp(setDoc(doc(db, 'sellerGovernanceAudit', auditId), auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore resolve warning notice (cached locally):', err);
    }
  }

  return { success: true, warning: updatedWarning, auditEntry };
}

// ==========================================
// REVOKE SELLER WARNING (ADMIN ONLY)
// ==========================================

export async function revokeSellerWarning(
  adminUserId: string,
  adminUserName: string,
  isAdmin: boolean,
  warningId: string,
  revocationReason: string
): Promise<{ success: boolean; warning: SellerWarning; auditEntry: SellerGovernanceAuditEntry }> {
  assertAdminAuthorized(adminUserId, isAdmin);

  if (!revocationReason || !revocationReason.trim()) {
    throw new Error('Sababu ya kubatilisha onyo (Revocation Reason) inahitajika kisheria.');
  }

  const allWarnings = getLocalCachedWarnings();
  const warningIndex = allWarnings.findIndex((w) => w.warningId === warningId);
  if (warningIndex < 0) {
    throw new Error('Onyo halikupatikana.');
  }

  const existingWarning = allWarnings[warningIndex];
  const now = new Date().toISOString();

  const updatedWarning: SellerWarning = {
    ...existingWarning,
    status: 'REVOKED',
    revokedAt: now,
    revokedBy: adminUserId,
    revocationReason: revocationReason.trim()
  };

  const auditId = `aud_revk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'REVOKE_WARNING',
    targetType: 'SELLER_WARNING',
    targetId: warningId,
    sellerId: existingWarning.sellerId,
    performedBy: adminUserId,
    performedByName: adminUserName,
    performedAt: now,
    previousState: { status: existingWarning.status },
    newState: { status: 'REVOKED', revokedAt: now, revokedBy: adminUserId, revocationReason },
    reasonText: revocationReason.trim()
  };

  allWarnings[warningIndex] = updatedWarning;
  saveWarningsToCache(allWarnings);

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  if (!isNode) {
    try {
      await safeFirestoreOp(setDoc(doc(db, 'sellerWarnings', warningId), updatedWarning, { merge: true }), 1500);
      await safeFirestoreOp(setDoc(doc(db, 'sellerGovernanceAudit', auditId), auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore revoke warning notice (cached locally):', err);
    }
  }

  return { success: true, warning: updatedWarning, auditEntry };
}

// ==========================================
// IMPOSE SELLER RESTRICTION (ADMIN ONLY)
// ==========================================

export async function imposeSellerRestriction(
  adminUserId: string,
  adminUserName: string,
  isAdmin: boolean,
  input: ImposeRestrictionInput
): Promise<{ success: boolean; restriction: SellerRestriction; auditEntry: SellerGovernanceAuditEntry }> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const targetSellerId = (input.targetSellerId || '').trim();
  if (!targetSellerId) {
    throw new Error('Kitambulisho cha muuzaji kinahitajika.');
  }

  if (!input.reasonCode || !input.reasonCode.trim()) {
    throw new Error('Sababu ya kisheria (Reason Code) inahitajika.');
  }

  if (!input.reasonText || !input.reasonText.trim()) {
    throw new Error('Maelezo ya kizuizi (Swahili Explanation) yanahitajika.');
  }

  // Derive explicit scope from restriction type
  let derivedScope: SellerRestrictionScope = 'LISTING_CREATION';
  if (input.restrictionType === 'LISTING_CREATE_RESTRICTED') {
    derivedScope = 'LISTING_CREATION';
  } else if (input.restrictionType === 'LISTING_EDIT_RESTRICTED') {
    derivedScope = 'LISTING_EDITING';
  } else if (input.restrictionType === 'MARKETPLACE_SELLING_RESTRICTED') {
    derivedScope = 'MARKETPLACE_SELLING';
  } else if (input.restrictionType === 'NEW_PRODUCT_REVIEW_REQUIRED') {
    derivedScope = 'PRODUCT_REVIEW';
  }

  const now = new Date().toISOString();
  let expiresAt: string | null = null;
  if (input.expiresInDays && input.expiresInDays > 0) {
    const expDate = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    expiresAt = expDate.toISOString();
  }

  const restrictionId = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditId = `aud_rst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const restriction: SellerRestriction = {
    restrictionId,
    sellerId: targetSellerId,
    userId: targetSellerId,
    shopId: input.shopId || targetSellerId,
    restrictionType: input.restrictionType,
    scope: input.scope || derivedScope,
    status: 'ACTIVE',
    reasonCode: input.reasonCode.trim(),
    reasonText: input.reasonText.trim(),
    internalNote: input.internalNote?.trim() || null,
    sourceType: input.sourceType || 'MODERATION',
    sourceId: input.sourceId || null,
    relatedWarningId: input.relatedWarningId || null,
    relatedListingId: input.relatedListingId || null,
    issuedBy: adminUserId,
    issuedByName: adminUserName,
    issuedAt: now,
    expiresAt
  };

  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'IMPOSE_RESTRICTION',
    targetType: 'SELLER_RESTRICTION',
    targetId: restrictionId,
    sellerId: targetSellerId,
    performedBy: adminUserId,
    performedByName: adminUserName,
    performedAt: now,
    newState: restriction,
    reasonCode: restriction.reasonCode,
    reasonText: restriction.reasonText,
    internalNote: restriction.internalNote,
    sourceType: restriction.sourceType,
    sourceId: restriction.sourceId
  };

  const allRestrictions = getLocalCachedRestrictions();
  allRestrictions.unshift(restriction);
  saveRestrictionsToCache(allRestrictions);

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  if (!isNode) {
    try {
      await safeFirestoreOp(setDoc(doc(db, 'sellerRestrictions', restrictionId), restriction), 1500);
      await safeFirestoreOp(setDoc(doc(db, 'sellerGovernanceAudit', auditId), auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore impose restriction notice (cached locally):', err);
    }
  }

  // Dispatch Authoritative Notification (V1.7H)
  try {
    await dispatchRestrictionNotification({
      sellerId: targetSellerId,
      restrictionId,
      restrictionType: restriction.restrictionType,
      reason: restriction.reasonText,
      expiresAt: restriction.expiresAt || undefined
    });
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya kizuizi kwa muuzaji:', notifErr);
  }

  return { success: true, restriction, auditEntry };
}

// ==========================================
// REVOKE SELLER RESTRICTION (ADMIN ONLY)
// ==========================================

export async function revokeSellerRestriction(
  adminUserId: string,
  adminUserName: string,
  isAdmin: boolean,
  restrictionId: string,
  revocationReason: string
): Promise<{ success: boolean; restriction: SellerRestriction; auditEntry: SellerGovernanceAuditEntry }> {
  assertAdminAuthorized(adminUserId, isAdmin);

  if (!revocationReason || !revocationReason.trim()) {
    throw new Error('Sababu ya kubatilisha kizuizi (Revocation Reason) inahitajika.');
  }

  const allRestrictions = getLocalCachedRestrictions();
  const index = allRestrictions.findIndex((r) => r.restrictionId === restrictionId);
  if (index < 0) {
    throw new Error('Kizuizi hakikupatikana.');
  }

  const existing = allRestrictions[index];
  const now = new Date().toISOString();

  const updated: SellerRestriction = {
    ...existing,
    status: 'REVOKED',
    revokedAt: now,
    revokedBy: adminUserId,
    revocationReason: revocationReason.trim()
  };

  const auditId = `aud_revrst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'REVOKE_RESTRICTION',
    targetType: 'SELLER_RESTRICTION',
    targetId: restrictionId,
    sellerId: existing.sellerId,
    performedBy: adminUserId,
    performedByName: adminUserName,
    performedAt: now,
    previousState: { status: existing.status },
    newState: { status: 'REVOKED', revokedAt: now, revokedBy: adminUserId, revocationReason },
    reasonText: revocationReason.trim()
  };

  allRestrictions[index] = updated;
  saveRestrictionsToCache(allRestrictions);

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  if (!isNode) {
    try {
      await safeFirestoreOp(setDoc(doc(db, 'sellerRestrictions', restrictionId), updated, { merge: true }), 1500);
      await safeFirestoreOp(setDoc(doc(db, 'sellerGovernanceAudit', auditId), auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore revoke restriction notice (cached locally):', err);
    }
  }

  // Dispatch Authoritative Notification (V1.7H)
  try {
    await dispatchRestrictionRevokedNotification({
      sellerId: existing.sellerId,
      restrictionId,
      revocationReason: revocationReason.trim()
    });
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya kuondoa kizuizi:', notifErr);
  }

  return { success: true, restriction: updated, auditEntry };
}

// ==========================================
// RESTRICTION ENFORCEMENT ENGINE
// ==========================================

/**
 * Checks whether a seller is currently restricted from performing a scoped capability.
 * Deterministically checks:
 * 1. Active status
 * 2. Expiration (if expiresAt has passed, restriction is no longer active)
 * 3. Scope match
 */
export function checkSellerRestriction(
  sellerId: string,
  scope: SellerRestrictionScope
): { isRestricted: boolean; restriction?: SellerRestriction; message?: string } {
  if (!sellerId || !sellerId.trim()) {
    return { isRestricted: false };
  }

  const cleanSellerId = sellerId.trim();
  const allRestrictions = getLocalCachedRestrictions();

  // Find active, unexpired restrictions matching this seller and scope
  const activeRestriction = allRestrictions.find((r) => {
    if (r.sellerId !== cleanSellerId) return false;
    if (r.status !== 'ACTIVE') return false;
    if (isExpired(r.expiresAt)) return false;

    // Direct scope match
    if (r.scope === scope) return true;

    // Blanket selling restriction covers creation and selling
    if (r.restrictionType === 'MARKETPLACE_SELLING_RESTRICTED') {
      if (scope === 'LISTING_CREATION' || scope === 'MARKETPLACE_SELLING') return true;
    }

    return false;
  });

  if (activeRestriction) {
    const defaultMsg =
      scope === 'LISTING_CREATION'
        ? 'Uwezo wako wa kuweka matangazo mapya ya sokoni umesitishwa kwa sasa.'
        : scope === 'LISTING_EDITING'
        ? 'Uwezo wa kurekebisha tangazo hili umesitishwa kwa sasa.'
        : scope === 'MARKETPLACE_SELLING'
        ? 'Uwezo wa kuuza bidhaa sokoni umesitishwa kwa sasa.'
        : 'Tangazo jipya linahitaji ukaguzi wa msimamizi kabla ya kuchapishwa sokoni.';

    const expiryNotice = activeRestriction.expiresAt
      ? ` (Hadi tarehe: ${new Date(activeRestriction.expiresAt).toLocaleDateString('sw-TZ')})`
      : '';

    return {
      isRestricted: true,
      restriction: activeRestriction,
      message: `${activeRestriction.reasonText || defaultMsg}${expiryNotice}`
    };
  }

  return { isRestricted: false };
}

/**
 * Throws a formatted Swahili error if seller has an active restriction blocking the capability.
 */
export function assertSellerNotRestricted(
  sellerId: string,
  scope: SellerRestrictionScope
): void {
  const check = checkSellerRestriction(sellerId, scope);
  if (check.isRestricted) {
    throw new Error(check.message || 'Kitendo hiki kimezuiwa kutokana na usimamizi wa sera za sokoni.');
  }
}

// ==========================================
// AUDIT LOGGING & IMMUTABILITY
// ==========================================

export async function fetchSellerGovernanceAuditLogs(
  adminUserId: string,
  isAdmin: boolean,
  targetSellerId?: string
): Promise<SellerGovernanceAuditEntry[]> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const localLogs = getLocalCachedGovernanceAuditLogs();
  if (targetSellerId && targetSellerId.trim()) {
    const cleanId = targetSellerId.trim();
    return localLogs.filter((log) => log.sellerId === cleanId);
  }
  return localLogs;
}

/**
 * Validates that a seller governance audit record cannot be modified or deleted.
 * Always throws error if invoked.
 */
export function assertGovernanceAuditRecordImmutable(): never {
  throw new Error(
    'Hitilafu ya Usalama: Rekodi za ukaguzi wa wauzaji (Governance Audit Log) haziwezi kubadilishwa wala kufutwa. Ni kumbukumbu ya kudumu ya kiutawala.'
  );
}
