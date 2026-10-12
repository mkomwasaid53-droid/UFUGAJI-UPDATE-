/**
 * V1.0 CONTENT MODERATION FOUNDATION — SELLER TRUST SERVICE
 *
 * Manages seller trust status:
 * - NEW_SELLER: Listings require admin approval before becoming active
 * - TRUSTED_SELLER: Can be granted ONLY by authorized admin action;
 *   In V1.0, AI screening is NOT yet integrated, so TRUSTED_SELLER listings
 *   must still be held in PENDING_REVIEW and cannot bypass admin review.
 * - RESTRICTED_SELLER: Active restrictions imposed by governance;
 *   restrictions cannot be overridden by trust status.
 *
 * Strict Non-Negotiable Rules:
 * 1. Paying subscription / monetization fee NEVER grants TRUSTED_SELLER.
 * 2. Identity verification (VERIFIED) NEVER grants TRUSTED_SELLER.
 * 3. TRUSTED_SELLER must be granted only by human admin authorization.
 * 4. Active restrictions always override trusted status.
 * 5. Sellers cannot self-assign trust status via API, UI, or direct writes.
 */

import { SellerProfile, SellerTrustStatus } from '../types/marketplace';
import { assertAdminAuthorized } from './marketplaceModerationService';
import { checkSellerRestriction } from './sellerGovernanceService';
import { SellerGovernanceAuditEntry } from '../types/sellerGovernance';
import {
  getLocalCachedGovernanceAuditLogs,
  saveGovernanceAuditLogsToCache
} from './sellerGovernanceService';

const LOCAL_SELLER_PROFILES_KEY = 'ufugaji_seller_profiles_cache';

// In-memory cache for fast lookups and Node.js testing
const inMemoryProfilesMap = new Map<string, SellerProfile>();

export function getLocalCachedSellerProfiles(): SellerProfile[] {
  try {
    if (typeof localStorage === 'undefined') {
      return Array.from(inMemoryProfilesMap.values());
    }
    const raw = localStorage.getItem(LOCAL_SELLER_PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((p) => inMemoryProfilesMap.set(p.uid, p));
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya wasifu wa wauzaji:', err);
  }
  return Array.from(inMemoryProfilesMap.values());
}

export function saveSellerProfileToCache(profile: SellerProfile): void {
  if (!profile || !profile.uid) return;
  inMemoryProfilesMap.set(profile.uid, profile);
  try {
    if (typeof localStorage !== 'undefined') {
      const all = getLocalCachedSellerProfiles();
      const idx = all.findIndex((p) => p.uid === profile.uid);
      if (idx >= 0) {
        all[idx] = profile;
      } else {
        all.push(profile);
      }
      localStorage.setItem(LOCAL_SELLER_PROFILES_KEY, JSON.stringify(all));
    }
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi wasifu wa muuzaji:', err);
  }
}

/**
 * Evaluates the authoritative trust status of a seller.
 * Deterministically enforces:
 * 1. Active governance restrictions override any trusted status -> RESTRICTED_SELLER
 * 2. Explicit admin-granted TRUSTED_SELLER
 * 3. Default for all sellers is NEW_SELLER
 * 4. Verification and paid status are completely decoupled and have zero effect on trust.
 */
export function getSellerTrustStatus(
  sellerId: string,
  sellerProfile?: SellerProfile | null
): SellerTrustStatus {
  if (!sellerId || !sellerId.trim()) {
    return 'NEW_SELLER';
  }

  const cleanSellerId = sellerId.trim();

  // 1. Restriction Check: Active restrictions override everything
  const restriction = checkSellerRestriction(cleanSellerId, 'MARKETPLACE_SELLING');
  const creationRestriction = checkSellerRestriction(cleanSellerId, 'LISTING_CREATION');
  if (restriction.isRestricted || creationRestriction.isRestricted) {
    return 'RESTRICTED_SELLER';
  }

  // 2. Fetch profile if not provided
  let profile = sellerProfile;
  if (!profile) {
    profile = inMemoryProfilesMap.get(cleanSellerId) || null;
    if (!profile) {
      const profiles = getLocalCachedSellerProfiles();
      profile = profiles.find((p) => p.uid === cleanSellerId) || null;
    }
  }

  // 3. Explicit profile trust status
  if (profile?.trustStatus === 'RESTRICTED_SELLER') {
    return 'RESTRICTED_SELLER';
  }

  if (profile?.trustStatus === 'TRUSTED_SELLER') {
    return 'TRUSTED_SELLER';
  }

  // 4. Default: NEW_SELLER
  return 'NEW_SELLER';
}

/**
 * Asserts that a seller has capability to publish in this stage.
 * In V1.0 Content Moderation Foundation:
 * - NEW_SELLER requires admin approval for all listings.
 * - TRUSTED_SELLER listings must also go through admin approval (PENDING_REVIEW)
 *   because Gemini AI screening is NOT yet integrated.
 * - RESTRICTED_SELLER cannot publish active listings.
 */
export function evaluateSellerPublishCapability(
  sellerId: string,
  sellerProfile?: SellerProfile | null,
  isAdmin: boolean = false
): {
  trustStatus: SellerTrustStatus;
  canBypassAdminReview: boolean;
  canPublishActiveImmediately: boolean;
  isRestricted: boolean;
  explanationSwahili: string;
} {
  if (isAdmin) {
    return {
      trustStatus: 'TRUSTED_SELLER',
      canBypassAdminReview: true,
      canPublishActiveImmediately: true,
      isRestricted: false,
      explanationSwahili: 'Msimamizi wa mfumo anaruhusiwa kuchapisha matangazo moja kwa moja.'
    };
  }

  const trustStatus = getSellerTrustStatus(sellerId, sellerProfile);

  if (trustStatus === 'RESTRICTED_SELLER') {
    return {
      trustStatus,
      canBypassAdminReview: false,
      canPublishActiveImmediately: false,
      isRestricted: true,
      explanationSwahili: 'Uwezo wa kuweka au kuchapisha matangazo umesitishwa kwa mujibu wa sera za soko.'
    };
  }

  if (trustStatus === 'TRUSTED_SELLER') {
    return {
      trustStatus,
      // In V1.0 without AI screening, even trusted sellers cannot bypass review
      canBypassAdminReview: false,
      canPublishActiveImmediately: false,
      isRestricted: false,
      explanationSwahili:
        'Tangazo limewasilishwa kwa ukaguzi wa wasimamizi (PENDING_REVIEW). Hatua za ukaguzi wa moja kwa moja zitaamilishwa katika toleo lijalo.'
    };
  }

  // NEW_SELLER
  return {
    trustStatus: 'NEW_SELLER',
    canBypassAdminReview: false,
    canPublishActiveImmediately: false,
    isRestricted: false,
    explanationSwahili:
      'Wauzaji wapya wanahitaji ukaguzi na idhini ya msimamizi kabla ya tangazo kuonekana sokoni (PENDING_REVIEW).'
  };
}

/**
 * Updates a seller's trust status (Admin Only).
 * Produces an immutable audit trail entry in seller governance audit logs.
 */
export async function updateSellerTrustStatus(params: {
  adminUserId: string;
  adminUserName: string;
  isAdmin: boolean;
  sellerId: string;
  newTrustStatus: SellerTrustStatus;
  reason: string;
}): Promise<{ success: boolean; profile: SellerProfile; auditEntry: SellerGovernanceAuditEntry }> {
  const { adminUserId, adminUserName, isAdmin, sellerId, newTrustStatus, reason } = params;

  // 1. Enforce Admin Authorization
  assertAdminAuthorized(adminUserId, isAdmin);

  if (!sellerId || !sellerId.trim()) {
    throw new Error('Kitambulisho cha muuzaji (sellerId) kinahitajika.');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Sababu ya kisheria (reason) inahitajika ili kubadilisha hadhi ya uaminifu wa muuzaji.');
  }

  const cleanSellerId = sellerId.trim();
  const now = new Date().toISOString();

  // 2. Fetch existing profile or create a base profile record
  let existingProfile = inMemoryProfilesMap.get(cleanSellerId) || null;
  if (!existingProfile) {
    const profiles = getLocalCachedSellerProfiles();
    existingProfile = profiles.find((p) => p.uid === cleanSellerId) || null;
  }

  const previousStatus = existingProfile?.trustStatus || 'NEW_SELLER';

  const updatedProfile: SellerProfile = {
    uid: cleanSellerId,
    businessName: existingProfile?.businessName || 'Biashara ya Mfugaji',
    displayName: existingProfile?.displayName || 'Muuzaji',
    phone: existingProfile?.phone || '',
    location: existingProfile?.location || 'Tanzania',
    region: existingProfile?.region || 'Dar es Salaam',
    verificationStatus: existingProfile?.verificationStatus || 'unverified',
    createdAt: existingProfile?.createdAt || now,
    updatedAt: now,
    ...existingProfile,
    trustStatus: newTrustStatus,
    trustGrantedAt: now,
    trustGrantedBy: adminUserId,
    trustReason: reason.trim()
  };

  saveSellerProfileToCache(updatedProfile);

  // 3. Append Immutable Audit Record
  const auditId = `aud_trust_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditEntry: SellerGovernanceAuditEntry = {
    auditId,
    action: 'IMPOSE_RESTRICTION', // Classified under governance actions
    targetType: 'SELLER_RESTRICTION',
    targetId: cleanSellerId,
    sellerId: cleanSellerId,
    performedBy: adminUserId,
    performedByName: adminUserName,
    performedAt: now,
    previousState: { trustStatus: previousStatus },
    newState: { trustStatus: newTrustStatus, trustReason: reason.trim() },
    reasonCode: `SELLER_TRUST_${newTrustStatus}`,
    reasonText: reason.trim()
  };

  const audits = getLocalCachedGovernanceAuditLogs();
  audits.unshift(auditEntry);
  saveGovernanceAuditLogsToCache(audits);

  return { success: true, profile: updatedProfile, auditEntry };
}

/**
 * Strips protected trust fields from client-supplied updates if caller is not an admin.
 * Prevents seller self-assignment of TRUSTED_SELLER status.
 */
export function stripProtectedSellerTrustFields(
  profileData: Partial<SellerProfile>,
  isAdmin: boolean = false
): Partial<SellerProfile> {
  if (isAdmin) return profileData;

  const clean = { ...profileData };
  delete clean.trustStatus;
  delete clean.trustGrantedAt;
  delete clean.trustGrantedBy;
  delete clean.trustReason;
  return clean;
}
