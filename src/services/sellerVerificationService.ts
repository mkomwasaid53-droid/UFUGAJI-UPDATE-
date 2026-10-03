/**
 * V1.6A — SELLER IDENTITY & VERIFICATION SERVICE
 * Phase 5: Marketplace Trust
 *
 * Core Principle: "REGISTERED ≠ VERIFIED"
 *
 * Provides authoritative persistence, state machine transitions, and admin
 * review workflows for Marketplace seller verification.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  SellerVerification,
  SellerVerificationStatus,
  SellerVerificationType,
  SellerVerificationApplicationInput
} from '../types/sellerVerification';
import { createAuthoritativeNotification } from './notificationService';

const COLLECTION_NAME = 'sellerVerification';

export const sellerVerificationService = {
  /**
   * Fetches the authoritative verification record for a seller
   */
  async getSellerVerification(sellerId: string): Promise<SellerVerification | null> {
    if (!sellerId) return null;
    try {
      const docRef = doc(db, COLLECTION_NAME, sellerId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data() as SellerVerification;
      }
      return null;
    } catch (err) {
      console.warn(`[sellerVerificationService] Error fetching verification for ${sellerId}:`, err);
      return null;
    }
  },

  /**
   * Returns authoritative verification or a deterministic fallback record
   */
  async getSellerVerificationWithDefault(sellerId: string, fallbackName?: string): Promise<SellerVerification> {
    const existing = await this.getSellerVerification(sellerId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    return {
      sellerId,
      status: 'NOT_APPLIED',
      verificationType: 'INDIVIDUAL',
      businessName: fallbackName || 'Mfugaji',
      displayName: fallbackName || 'Mfugaji',
      phone: '',
      location: 'Tanzania',
      submittedAt: now,
      badgeEligible: false,
      publicBadgeText: 'Haijahakikiwa',
      updatedAt: now
    };
  },

  /**
   * Submits a verification application by the seller
   * Deterministic transition:
   * - NOT_APPLIED -> PENDING_VERIFICATION
   * - REJECTED -> PENDING_VERIFICATION (re-application)
   * Enforces: badgeEligible = false, no reviewedBy, no reviewedAt
   */
  async submitSellerVerificationApplication(
    sellerId: string,
    input: SellerVerificationApplicationInput
  ): Promise<SellerVerification> {
    if (!sellerId) {
      throw new Error('Kitambulisho cha muuzaji kinahitajika.');
    }

    // Check existing record
    const existing = await this.getSellerVerification(sellerId);
    if (existing && existing.status === 'VERIFIED') {
      throw new Error('Muuzaji huyu tayari amehakikiwa rasmi.');
    }

    const now = new Date().toISOString();
    const verificationRecord: SellerVerification = {
      sellerId,
      status: 'PENDING_VERIFICATION',
      verificationType: input.verificationType,
      businessName: input.businessName.trim(),
      displayName: input.displayName.trim(),
      phone: input.phone.trim(),
      location: input.location.trim(),
      district: input.district?.trim() || '',
      nationalId: input.nationalId?.trim() || '',
      tinNumber: input.tinNumber?.trim() || '',
      permitReference: input.permitReference?.trim() || '',
      documentNotes: input.documentNotes?.trim() || '',
      notes: input.notes?.trim() || '',
      submittedAt: now,
      badgeEligible: false, // Authoritative: seller cannot self-grant badge
      publicBadgeText: 'Inasubiri Uhakiki',
      updatedAt: now
    };

    const docRef = doc(db, COLLECTION_NAME, sellerId);
    await setDoc(docRef, verificationRecord, { merge: true });

    // Synchronize seller profile in users/{uid}/sellerProfile/profile
    try {
      const profileRef = doc(db, 'users', sellerId, 'sellerProfile', 'profile');
      await updateDoc(profileRef, {
        verificationStatus: 'pending',
        updatedAt: now
      });
    } catch {
      // Ignored if sellerProfile doc does not exist yet
    }

    return verificationRecord;
  },

  /**
   * Fetches all verification records for Admin Review
   */
  async getAllSellerVerifications(): Promise<SellerVerification[]> {
    try {
      const colRef = collection(db, COLLECTION_NAME);
      const snapshot = await getDocs(colRef);
      const list: SellerVerification[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as SellerVerification);
      });
      // Sort newest first
      return list.sort((a, b) => new Date(b.submittedAt || b.updatedAt).getTime() - new Date(a.submittedAt || a.updatedAt).getTime());
    } catch (err) {
      console.error('[sellerVerificationService] Error fetching all verifications:', err);
      return [];
    }
  },

  /**
   * Authoritative Admin Review Decision
   * Only accessible by authorized administrators
   * Transitions:
   * - VERIFY: status = 'VERIFIED', badgeEligible = true, publicBadgeText = 'Muuzaji Aliyethibitishwa'
   * - REJECT: status = 'REJECTED', badgeEligible = false, publicBadgeText = 'Haijahakikiwa'
   * - SUSPEND: status = 'SUSPENDED', badgeEligible = false, publicBadgeText = 'Uhakiki Umesitishwa'
   * - UNDER_REVIEW: status = 'UNDER_REVIEW', badgeEligible = false
   */
  async adminReviewSellerVerification(
    adminUid: string,
    sellerId: string,
    decision: 'VERIFY' | 'REJECT' | 'SUSPEND' | 'UNDER_REVIEW',
    options?: {
      reason?: string;
      notes?: string;
    }
  ): Promise<SellerVerification> {
    if (!adminUid) {
      throw new Error('Ruhusa ya msimamizi inahitajika kutekeleza uhakiki.');
    }
    if (!sellerId) {
      throw new Error('Kitambulisho cha muuzaji kinahitajika.');
    }

    const existing = await this.getSellerVerification(sellerId);
    if (!existing) {
      throw new Error('Ombi la uhakiki la muuzaji huyu halikupatikana.');
    }

    const now = new Date().toISOString();
    let updatedStatus: SellerVerificationStatus;
    let badgeEligible = false;
    let publicBadgeText = 'Haijahakikiwa';
    let legacyProfileStatus: 'unverified' | 'pending' | 'verified' = 'unverified';

    switch (decision) {
      case 'VERIFY':
        updatedStatus = 'VERIFIED';
        badgeEligible = true;
        publicBadgeText = 'Muuzaji Aliyethibitishwa';
        legacyProfileStatus = 'verified';
        break;
      case 'REJECT':
        updatedStatus = 'REJECTED';
        badgeEligible = false;
        publicBadgeText = 'Haijahakikiwa';
        legacyProfileStatus = 'unverified';
        break;
      case 'SUSPEND':
        updatedStatus = 'SUSPENDED';
        badgeEligible = false;
        publicBadgeText = 'Uhakiki Umesitishwa';
        legacyProfileStatus = 'unverified';
        break;
      case 'UNDER_REVIEW':
        updatedStatus = 'UNDER_REVIEW';
        badgeEligible = false;
        publicBadgeText = 'Inakaguliwa na Wasimamizi';
        legacyProfileStatus = 'pending';
        break;
      default:
        throw new Error(`Uamuzi batili wa uhakiki: ${decision}`);
    }

    const updatePayload: Partial<SellerVerification> = {
      status: updatedStatus,
      badgeEligible,
      publicBadgeText,
      reviewedAt: now,
      reviewedBy: adminUid,
      updatedAt: now
    };

    if (decision === 'REJECT' && options?.reason) {
      updatePayload.rejectionReason = options.reason;
    }
    if (decision === 'SUSPEND' && options?.reason) {
      updatePayload.suspensionReason = options.reason;
    }
    if (options?.notes) {
      updatePayload.notes = options.notes;
    }

    // 1. Update authoritative SellerVerification document
    const docRef = doc(db, COLLECTION_NAME, sellerId);
    await updateDoc(docRef, updatePayload);

    // 2. Synchronize legacy SellerProfile document
    try {
      const profileRef = doc(db, 'users', sellerId, 'sellerProfile', 'profile');
      await updateDoc(profileRef, {
        verificationStatus: legacyProfileStatus,
        updatedAt: now
      });
    } catch (e) {
      console.warn('[sellerVerificationService] Could not update seller profile legacy status:', e);
    }

    // 3. Synchronize all marketplace products for this seller
    try {
      const productsRef = collection(db, 'marketplaceProducts');
      const q = query(productsRef, where('sellerId', '==', sellerId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach((pDoc) => {
          batch.update(pDoc.ref, {
            sellerVerificationStatus: legacyProfileStatus,
            updatedAt: now
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('[sellerVerificationService] Could not batch update marketplace products:', e);
    }

    // 4. Dispatch authoritative notification to the seller
    try {
      if (decision === 'SUSPEND') {
        const cleanReason = options?.reason || 'Uamuzi wa kiutawala wa jukwaa';
        await createAuthoritativeNotification({
          recipientUserId: sellerId,
          type: 'SELLER_MONETIZATION_SUSPENDED',
          category: 'SELLER',
          title: 'Akaunti Yako ya Muuzaji Imesimamishwa',
          message: `Uhakiki wa akaunti yako ya muuzaji umesimamishwa na msimamizi. Sababu: ${cleanReason}. Bidhaa zako hazitaonekana hadharani hadi utatuzi utakapofanyika.`,
          priority: 'URGENT',
          targetType: 'SELLER',
          targetId: sellerId,
          relatedSellerId: sellerId,
          actionUrl: '/market',
          metadata: {
            reason: cleanReason,
            reviewedBy: adminUid,
            transitionType: 'SELLER_SUSPENDED'
          }
        });
      } else if (decision === 'REJECT') {
        const cleanReason = options?.reason || 'Haikidhi vigezo vya uhakiki wa jukwaa';
        await createAuthoritativeNotification({
          recipientUserId: sellerId,
          type: 'SELLER_WARNING_ISSUED',
          category: 'SELLER',
          title: 'Maombi ya Uhakiki wa Muuzaji Yamekataliwa',
          message: `Maombi yako ya kuwa muuzaji aliyethibitishwa yamekataliwa. Sababu: ${cleanReason}. Unaweza kuwasilisha maombi mapya ukiwa na nyaraka sahihi.`,
          priority: 'HIGH',
          targetType: 'SELLER',
          targetId: sellerId,
          relatedSellerId: sellerId,
          actionUrl: '/market'
        });
      } else if (decision === 'VERIFY') {
        await createAuthoritativeNotification({
          recipientUserId: sellerId,
          type: 'SELLER_RESTRICTION_REVOKED',
          category: 'SELLER',
          title: 'Hongera! Akaunti Yako ya Muuzaji Imethibitishwa',
          message: 'Ombi lako la uhakiki limeidhinishwa kikamilifu na msimamizi. Sasa unayo beji rasmi ya "Muuzaji Aliyethibitishwa" sokoni.',
          priority: 'NORMAL',
          targetType: 'SELLER',
          targetId: sellerId,
          relatedSellerId: sellerId,
          actionUrl: '/market'
        });
      }
    } catch (e) {
      console.warn('[sellerVerificationService] Hitilafu ya kutoa arifa:', e);
    }

    return {
      ...existing,
      ...updatePayload
    } as SellerVerification;
  },

  /**
   * Fetches multiple verifications for a list of seller IDs
   */
  async fetchAuthoritativeVerifications(sellerIds: string[]): Promise<Record<string, SellerVerification>> {
    const uniqueIds = Array.from(new Set(sellerIds.filter(Boolean)));
    const map: Record<string, SellerVerification> = {};

    await Promise.all(
      uniqueIds.map(async (sid) => {
        try {
          const v = await this.getSellerVerification(sid);
          if (v) {
            map[sid] = v;
          }
        } catch {
          // ignore single fetch error
        }
      })
    );

    return map;
  }
};
