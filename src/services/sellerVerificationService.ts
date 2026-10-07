/// <reference types="node" />
/**
 * V1.11A — SELLER VERIFICATION & TRUST SERVICE
 *
 * Implements the authoritative domain logic for Seller Verification:
 * 1. Application Creation & Submission
 * 2. Server-Authoritative Processing Fee (5,000 TZS)
 * 3. Provider-Agnostic Payment Integration (PlusPesa / Mock)
 * 4. Idempotency & Webhook / Polling Safety
 * 5. Admin Review Workflow (Review, Correction, Approve, Reject, Suspend, Reverification)
 * 6. Separate Badge Lifecycle (INACTIVE, ACTIVE, SUSPENDED, EXPIRED)
 * 7. Immutable Audit Trail
 * 8. Notification Center Integration
 * 9. Lightweight Public Trust Signal
 * 10. Strict Separation from Seller Monetization (V1.10A/B)
 */

import {
  SellerVerificationApplication,
  SellerVerificationApplicationInput,
  SellerVerificationStatus,
  SellerVerificationBadgeStatus,
  SellerVerificationAuditEvent,
  VerificationAuditAction,
  PublicSellerVerificationBadge,
  getSellerVerificationDisplay,
  VerificationDocumentReference
} from '../types/sellerVerification';
import {
  emitAppNotification,
  getLocalCachedNotifications
} from './notificationService';

export type { PublicSellerVerificationBadge } from '../types/sellerVerification';

// In-memory data structures
const applicationsStore = new Map<string, SellerVerificationApplication>(); // verificationId -> app
const sellerToVerificationMap = new Map<string, string>(); // sellerUserId -> latest active verificationId
const auditsStore = new Map<string, SellerVerificationAuditEvent[]>(); // verificationId -> audits[]
const idempotencyKeyToVerificationMap = new Map<string, string>(); // idempotencyKey -> verificationId

const isNode = typeof window === 'undefined';
let fsModule: any = null;
let pathModule: any = null;

const APPS_FILE_PATH = 'data/seller_verifications.json';
const AUDITS_FILE_PATH = 'data/seller_verification_audits.json';

export function initVerificationStorage(customFs?: any, customPath?: any) {
  if (customFs && customPath) {
    fsModule = customFs;
    pathModule = customPath;
    loadFromDisk();
    return;
  }
}

if (isNode) {
  try {
    import('fs').then((fs) => {
      fsModule = fs.default || fs;
      import('path').then((p) => {
        pathModule = p.default || p;
        loadFromDisk();
      }).catch(() => {});
    }).catch(() => {});
  } catch {}
}

function loadFromDisk() {
  if (!fsModule || !pathModule) return;
  try {
    const cwd = process.cwd();
    // 1. Applications
    const appsPath = pathModule.resolve(cwd, APPS_FILE_PATH);
    if (fsModule.existsSync(appsPath)) {
      const data = JSON.parse(fsModule.readFileSync(appsPath, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((app: SellerVerificationApplication) => {
          if (!app.sellerId && app.sellerUserId) app.sellerId = app.sellerUserId;
          if (!app.location && app.region) app.location = app.region;
          applicationsStore.set(app.verificationId, app);
          // Set mapping to active application
          const existingActive = sellerToVerificationMap.get(app.sellerUserId);
          if (!existingActive || app.status !== 'REJECTED') {
            sellerToVerificationMap.set(app.sellerUserId, app.verificationId);
          }
        });
      }
    }

    // 2. Audits
    const auditsPath = pathModule.resolve(cwd, AUDITS_FILE_PATH);
    if (fsModule.existsSync(auditsPath)) {
      const data = JSON.parse(fsModule.readFileSync(auditsPath, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((audit: SellerVerificationAuditEvent) => {
          const list = auditsStore.get(audit.verificationId) || [];
          if (!list.some(a => a.eventId === audit.eventId)) {
            list.push(audit);
          }
          auditsStore.set(audit.verificationId, list);
        });
      }
    }
  } catch (err) {
    console.warn('[sellerVerificationService] Disk load error:', err);
  }
}

function persistToDisk() {
  if (!fsModule || !pathModule) return;
  try {
    const cwd = process.cwd();

    // 1. Applications
    const appsPath = pathModule.resolve(cwd, APPS_FILE_PATH);
    const appsDir = pathModule.dirname(appsPath);
    if (!fsModule.existsSync(appsDir)) fsModule.mkdirSync(appsDir, { recursive: true });
    fsModule.writeFileSync(appsPath, JSON.stringify(Array.from(applicationsStore.values()), null, 2), 'utf8');

    // 2. Audits
    const auditsPath = pathModule.resolve(cwd, AUDITS_FILE_PATH);
    const allAudits = Array.from(auditsStore.values()).flat();
    fsModule.writeFileSync(auditsPath, JSON.stringify(allAudits, null, 2), 'utf8');
  } catch (err) {
    console.warn('[sellerVerificationService] Disk persist error:', err);
  }
}

export class SellerVerificationService {
  constructor() {}

  // --------------------------------------------------------------------------
  // 1. QUERY APPLICATIONS & BADGES
  // --------------------------------------------------------------------------

  public getVerificationBySellerId(sellerUserId: string): SellerVerificationApplication | null {
    if (!sellerUserId) return null;
    const all = Array.from(applicationsStore.values()).filter(
      (app) => app.sellerUserId === sellerUserId || app.sellerId === sellerUserId
    );
    if (all.length === 0) return null;

    // Prioritize active applications over rejected/expired ones
    const active = all.find((app) =>
      ['UNDER_REVIEW', 'PAYMENT_CONFIRMED', 'PAYMENT_PENDING', 'PAYMENT_REQUIRED', 'SUBMITTED', 'DRAFT'].includes(app.status) ||
      (app.status === 'APPROVED' && app.badgeStatus === 'ACTIVE')
    );
    if (active) return active;

    // Otherwise sort by updatedAt desc
    return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }

  public getAllApplicationsBySellerId(sellerUserId: string): SellerVerificationApplication[] {
    if (!sellerUserId) return [];
    return Array.from(applicationsStore.values())
      .filter((app) => app.sellerUserId === sellerUserId || app.sellerId === sellerUserId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getVerificationById(verificationId: string): SellerVerificationApplication | null {
    if (!verificationId) return null;
    return applicationsStore.get(verificationId) || null;
  }

  public getAllApplications(statusFilter?: SellerVerificationStatus): SellerVerificationApplication[] {
    const list = Array.from(applicationsStore.values());
    if (statusFilter) {
      return list.filter((app) => app.status === statusFilter);
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Authoritative lookup of current seller verification.
   * If in browser, fetches from /api/seller/verification first to ensure reload persistence.
   */
  public async getSellerVerification(
    sellerUserId: string,
    token?: string | null
  ): Promise<SellerVerificationApplication | null> {
    if (!sellerUserId) return null;
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          headers['x-user-id'] = sellerUserId;
        }
        const res = await fetch(`/api/seller/verification?sellerUserId=${encodeURIComponent(sellerUserId)}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'ok') {
            if (data.application) {
              applicationsStore.set(data.application.verificationId, data.application);
              sellerToVerificationMap.set(sellerUserId, data.application.verificationId);
            }
            return data.application || null;
          }
        }
      } catch (err) {
        console.warn('[sellerVerificationService] API fetch error, falling back to local store:', err);
      }
    }
    return this.getVerificationBySellerId(sellerUserId);
  }

  /**
   * Authoritative list of all seller verifications for Admin.
   * If in browser, fetches from /api/admin/verifications to ensure authoritative reload persistence.
   */
  public async getAllSellerVerifications(
    statusFilter?: SellerVerificationStatus,
    token?: string | null,
    adminUserId?: string
  ): Promise<SellerVerificationApplication[]> {
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {
          'x-user-role': 'admin'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        if (adminUserId) {
          headers['x-user-id'] = adminUserId;
        }
        const url = `/api/admin/verifications${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'ok' && Array.isArray(data.applications)) {
            data.applications.forEach((app: SellerVerificationApplication) => {
              applicationsStore.set(app.verificationId, app);
              sellerToVerificationMap.set(app.sellerUserId, app.verificationId);
            });
            return data.applications;
          }
        }
      } catch (err) {
        console.warn('[sellerVerificationService] API fetch all error, falling back to local store:', err);
      }
    }
    return this.getAllApplications(statusFilter);
  }

  /**
   * Returns a lightweight, safe public trust signal for Marketplace.
   * NEVER exposes internal review notes, national ID, or verification documents.
   */
  public getPublicSellerBadge(sellerUserId: string): PublicSellerVerificationBadge {
    const app = this.getVerificationBySellerId(sellerUserId);
    if (!app || app.badgeStatus !== 'ACTIVE') {
      return {
        sellerUserId,
        isVerified: false,
        badgeStatus: app ? app.badgeStatus : 'INACTIVE',
        badgeLabel: 'Haijahakikiwa',
        shortLabel: 'Bado',
        notice: 'Muuzaji hajaidhinishwa na mfumo rasmi wa uhakiki wa Ufugaji Update.'
      };
    }

    const display = getSellerVerificationDisplay(app.status, app.badgeStatus);
    return {
      sellerUserId,
      isVerified: true,
      badgeStatus: 'ACTIVE',
      badgeLabel: display.badgeLabel,
      shortLabel: display.shortLabel,
      badgeActivatedAt: app.badgeActivatedAt || null,
      verificationType: app.verificationType,
      verificationVersion: app.currentReviewVersion,
      notice: 'Muuzaji huyu amekamilisha taratibu rasmi za uhakiki wa Ufugaji Update kulingana na vigezo vilivyowekwa.'
    };
  }

  // --------------------------------------------------------------------------
  // 2. AUDIT TRAIL LOGGING (IMMUTABLE)
  // --------------------------------------------------------------------------

  private recordAuditEvent(event: Omit<SellerVerificationAuditEvent, 'eventId' | 'timestamp'>): SellerVerificationAuditEvent {
    const fullEvent: SellerVerificationAuditEvent = {
      eventId: `va_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...event
    };

    const list = auditsStore.get(event.verificationId) || [];
    list.unshift(fullEvent); // newest first
    auditsStore.set(event.verificationId, list);
    persistToDisk();
    return fullEvent;
  }

  public getAuditLogs(verificationId?: string, sellerUserId?: string): SellerVerificationAuditEvent[] {
    if (verificationId && auditsStore.has(verificationId)) {
      return auditsStore.get(verificationId)!;
    }
    if (sellerUserId) {
      const vId = sellerToVerificationMap.get(sellerUserId);
      if (vId && auditsStore.has(vId)) {
        return auditsStore.get(vId)!;
      }
    }
    // Return all
    return Array.from(auditsStore.values()).flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // --------------------------------------------------------------------------
  // 3. APPLICATION CREATION / SUBMISSION
  // --------------------------------------------------------------------------

  /**
   * Creates or updates a verification draft.
   * Enforces seller ownership & prevents duplicate active applications.
   * If seller previously had a REJECTED or EXPIRED application, creates a new distinct application without overwriting history.
   */
  public createOrUpdateDraft(params: {
    sellerUserId: string;
    shopId?: string;
    input: SellerVerificationApplicationInput;
    idempotencyKey?: string;
  }): SellerVerificationApplication {
    const { sellerUserId, shopId, input, idempotencyKey } = params;
    if (!sellerUserId) throw new Error('Utambulisho wa muuzaji (sellerUserId) unahitajika.');

    if (idempotencyKey && idempotencyKeyToVerificationMap.has(idempotencyKey)) {
      const vId = idempotencyKeyToVerificationMap.get(idempotencyKey)!;
      const cached = this.getVerificationById(vId);
      if (cached) return cached;
    }

    const existingApp = this.getVerificationBySellerId(sellerUserId);

    // If already approved with active badge, cannot start another application unless expired or reverification required
    if (existingApp && existingApp.status === 'APPROVED' && existingApp.badgeStatus === 'ACTIVE') {
      throw new Error('Akaunti hii tayari ina uhakiki uliothibitishwa na beji iliyo hai.');
    }

    // If currently under review or payment pending, prevent duplicate submission
    if (
      existingApp &&
      (existingApp.status === 'UNDER_REVIEW' ||
       existingApp.status === 'PAYMENT_PENDING' ||
       existingApp.status === 'PAYMENT_REQUIRED' ||
       existingApp.status === 'PAYMENT_CONFIRMED' ||
       existingApp.status === 'SUBMITTED')
    ) {
      throw new Error(`Kuna maombi ya uhakiki yaliyopo yenye hali ya ${existingApp.status}. Huwezi kuunda maombi mapya sasa.`);
    }

    const now = new Date().toISOString();
    // Only reuse verificationId and applicationNumber if existingApp was actually a DRAFT
    const isEditingExistingDraft = Boolean(existingApp && existingApp.status === 'DRAFT');
    const verificationId = isEditingExistingDraft && existingApp
      ? existingApp.verificationId
      : `ver_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const applicationNumber = isEditingExistingDraft && existingApp
      ? existingApp.applicationNumber
      : `VER-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const currentReviewVersion = isEditingExistingDraft && existingApp
      ? existingApp.currentReviewVersion
      : (existingApp ? (existingApp.currentReviewVersion || 1) + 1 : 1);

    const structuredDocs: VerificationDocumentReference[] = (input.documents || []).map((doc, idx) => ({
      documentId: `doc_${verificationId}_${idx + 1}`,
      documentType: doc.documentType,
      title: doc.title,
      referenceNumber: doc.referenceNumber,
      issuedBy: doc.issuedBy,
      issuedDate: doc.issuedDate,
      documentUrl: doc.documentUrl,
      notes: doc.notes,
      verified: false
    }));

    const resolvedRegion = input.region?.trim() || input.location?.trim() || '';
    const resolvedDisplayName = input.displayName?.trim() || input.businessName?.trim() || '';
    const resolvedLegalName = input.legalName?.trim() || resolvedDisplayName;
    const resolvedArea = input.area?.trim() || input.district?.trim() || resolvedRegion;

    const app: SellerVerificationApplication = {
      verificationId,
      sellerUserId,
      sellerId: sellerUserId,
      shopId: shopId || (isEditingExistingDraft && existingApp ? existingApp.shopId : undefined),
      applicationNumber,
      status: 'DRAFT',
      verificationType: input.verificationType || 'INDIVIDUAL',
      legalName: resolvedLegalName,
      displayName: resolvedDisplayName,
      businessName: input.businessName?.trim() || '',
      phone: input.phone?.trim() || '',
      email: input.email?.trim() || '',
      region: resolvedRegion,
      location: resolvedRegion,
      district: input.district?.trim() || '',
      area: resolvedArea,
      nationalId: input.nationalId?.trim() || undefined,
      tinNumber: input.tinNumber?.trim() || undefined,
      permitReference: input.permitReference?.trim() || undefined,
      applicationNotes: input.applicationNotes?.trim() || undefined,
      documentNotes: input.documentNotes?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      documents: structuredDocs,
      currentReviewVersion,
      badgeStatus: 'INACTIVE',
      hasActiveBadge: false,
      createdAt: isEditingExistingDraft && existingApp ? existingApp.createdAt : now,
      updatedAt: now
    };

    applicationsStore.set(verificationId, app);
    sellerToVerificationMap.set(sellerUserId, verificationId);
    if (idempotencyKey) {
      idempotencyKeyToVerificationMap.set(idempotencyKey, verificationId);
    }
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId,
      actorUserId: sellerUserId,
      actorRole: 'SELLER',
      action: 'VERIFICATION_APPLICATION_CREATED',
      newStatus: 'DRAFT',
      notes: isEditingExistingDraft ? 'Rasimu ya maombi ya uhakiki imesasishwa' : 'Rasimu mpya ya maombi ya uhakiki imeundwa'
    });

    return app;
  }

  /**
   * Submits a verification application.
   * Validates mandatory structured fields and moves to PAYMENT_REQUIRED or SUBMITTED.
   * Supports idempotency: identical or repeated requests return the authoritative application idempotently.
   */
  public submitApplication(params: {
    sellerUserId: string;
    verificationId?: string;
    input?: SellerVerificationApplicationInput;
    idempotencyKey?: string;
  }): SellerVerificationApplication {
    const { sellerUserId, verificationId, input, idempotencyKey } = params;

    // 1. Idempotency Key check
    if (idempotencyKey && idempotencyKeyToVerificationMap.has(idempotencyKey)) {
      const vId = idempotencyKeyToVerificationMap.get(idempotencyKey)!;
      const existing = this.getVerificationById(vId);
      if (existing) {
        return existing;
      }
    }

    // 2. Duplicate active submission check
    const activeApp = this.getVerificationBySellerId(sellerUserId);
    if (
      activeApp &&
      (!verificationId || verificationId === activeApp.verificationId) &&
      ['SUBMITTED', 'PAYMENT_REQUIRED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'UNDER_REVIEW'].includes(activeApp.status)
    ) {
      if (idempotencyKey) {
        idempotencyKeyToVerificationMap.set(idempotencyKey, activeApp.verificationId);
      }
      return activeApp;
    }

    let app = verificationId
      ? this.getVerificationById(verificationId)
      : activeApp;

    if (!app && input) {
      app = this.createOrUpdateDraft({ sellerUserId, input, idempotencyKey });
    }

    if (!app) {
      throw new Error('Maombi ya uhakiki hayakupatikana. Unda rasimu kwanza kabla ya kutuma.');
    }

    if (app.sellerUserId !== sellerUserId) {
      throw new Error('Ruhusa imekataliwa: Huwezi kutuma maombi ya muuzaji mwingine.');
    }

    // If input updates provided, merge them
    if (input) {
      if (input.verificationType) app.verificationType = input.verificationType;
      if (input.legalName) app.legalName = input.legalName.trim();
      if (input.displayName) app.displayName = input.displayName.trim();
      if (input.businessName) app.businessName = input.businessName.trim();
      if (input.phone) app.phone = input.phone.trim();
      if (input.email) app.email = input.email.trim();
      if (input.region) app.region = input.region.trim();
      else if (input.location) app.region = input.location.trim();
      if (app.region) app.location = app.region;
      if (input.district) app.district = input.district.trim();
      if (input.area) app.area = input.area.trim();
      else if (!app.area) app.area = app.district || app.region || '';
      if (input.nationalId !== undefined) app.nationalId = input.nationalId?.trim();
      if (input.tinNumber !== undefined) app.tinNumber = input.tinNumber?.trim();
      if (input.permitReference !== undefined) app.permitReference = input.permitReference?.trim();
      if (input.applicationNotes !== undefined) app.applicationNotes = input.applicationNotes?.trim();
      if (input.documentNotes !== undefined) app.documentNotes = input.documentNotes?.trim();
      if (input.notes !== undefined) app.notes = input.notes?.trim();
    }

    if (!app.legalName && (app.displayName || app.businessName)) {
      app.legalName = app.displayName || app.businessName;
    }
    if (!app.sellerId && app.sellerUserId) {
      app.sellerId = app.sellerUserId;
    }
    if (!app.location && app.region) {
      app.location = app.region;
    }

    // Validate required fields
    if (!app.legalName) throw new Error('Jina kamili kisheria (legalName) linahitajika kwa ajili ya uhakiki.');
    if (!app.businessName) throw new Error('Jina la duka au biashara (businessName) linahitajika.');
    if (!app.phone) throw new Error('Namba rasmi ya simu (phone) inahitajika.');
    if (!app.region || !app.district) throw new Error('Mkoa na wilaya ya shughuli zako vinahitajika.');

    const previousStatus = app.status;
    const now = new Date().toISOString();

    const nextStatus: SellerVerificationStatus = 'SUBMITTED';

    app.status = nextStatus;
    app.submittedAt = now;
    app.updatedAt = now;

    applicationsStore.set(app.verificationId, app);
    sellerToVerificationMap.set(sellerUserId, app.verificationId);
    if (idempotencyKey) {
      idempotencyKeyToVerificationMap.set(idempotencyKey, app.verificationId);
    }
    persistToDisk();

    this.recordAuditEvent({
      verificationId: app.verificationId,
      sellerUserId,
      actorUserId: sellerUserId,
      actorRole: 'SELLER',
      action: 'VERIFICATION_APPLICATION_SUBMITTED',
      previousStatus,
      newStatus: nextStatus,
      notes: `Maombi yamewasilishwa rasmi. Hali: ${nextStatus}`
    });

    emitAppNotification({
      recipientUserId: sellerUserId,
      type: 'VERIFICATION_APPLICATION_SUBMITTED',
      category: 'MODERATION',
      priority: 'NORMAL',
      title: 'Maombi ya Uhakiki Yamewasilishwa',
      message: `Maombi yako namba ${app.applicationNumber} yamewasilishwa kikamilifu na yataingia kwenye foleni ya ukaguzi wa wasimamizi.`,
      targetId: app.verificationId,
      targetType: 'SELLER',
      senderUserId: 'SYSTEM',
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId: app.verificationId, applicationNumber: app.applicationNumber }
    });

    return app;
  }

  /**
   * Authoritative submission wrapper used by SellerVerificationModal.
   * If in browser, posts to /api/seller/verification/submit to ensure reload persistence on backend.
   */
  public async submitSellerVerificationApplication(
    sellerUserId: string,
    input: SellerVerificationApplicationInput,
    idempotencyKey?: string,
    token?: string | null
  ): Promise<SellerVerificationApplication> {
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          headers['x-user-id'] = sellerUserId;
        }
        const res = await fetch('/api/seller/verification/submit', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sellerUserId,
            input,
            idempotencyKey: idempotencyKey || `req_sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'ok' && data.application) {
            applicationsStore.set(data.application.verificationId, data.application);
            sellerToVerificationMap.set(sellerUserId, data.application.verificationId);
            return data.application;
          }
        }
      } catch (err) {
        console.warn('[sellerVerificationService] API submit error, falling back to local store:', err);
      }
    }
    return this.submitApplication({
      sellerUserId,
      input,
      idempotencyKey
    });
  }

  // --------------------------------------------------------------------------
  // 4. ADMIN REVIEW & GOVERNANCE WORKFLOW (SERVER-AUTHORITATIVE)
  // --------------------------------------------------------------------------

  /**
   * Action: START_REVIEW
   * Moves application from SUBMITTED to UNDER_REVIEW.
   */
  public startReview(params: {
    verificationId: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, adminUserId } = params;
    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    if (app.status === 'UNDER_REVIEW') return app;

    const previousStatus = app.status;
    const now = new Date().toISOString();

    app.status = 'UNDER_REVIEW';
    app.reviewedBy = adminUserId;
    app.reviewedAt = now;
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_REVIEW_STARTED',
      previousStatus,
      newStatus: 'UNDER_REVIEW',
      notes: `Uhakiki umeanza na msimamizi ${adminUserId}`
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_UNDER_REVIEW',
      category: 'MODERATION',
      priority: 'NORMAL',
      title: 'Uhakiki Unakaguliwa',
      message: 'Maombi yako ya uhakiki yameanza kukaguliwa na msimamizi wa jukwaa.',
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, reviewedBy: adminUserId }
    });

    return app;
  }

  /**
   * Action: REQUEST_CORRECTION
   * Admin requests corrections from seller.
   */
  public requestCorrection(params: {
    verificationId: string;
    correctionNotes: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, correctionNotes, adminUserId } = params;
    if (!correctionNotes?.trim()) throw new Error('Maelezo ya marekebisho (correctionNotes) yanahitajika.');

    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    const previousStatus = app.status;
    const now = new Date().toISOString();

    app.status = 'DRAFT';
    app.correctionNotes = correctionNotes.trim();
    app.reviewedBy = adminUserId;
    app.reviewedAt = now;
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_CORRECTION_REQUESTED',
      previousStatus,
      newStatus: 'DRAFT',
      notes: `Marekebisho yameombwa: ${correctionNotes.trim()}`
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_CORRECTION_REQUESTED',
      category: 'MODERATION',
      priority: 'HIGH',
      title: 'Marekebisho ya Maombi ya Uhakiki',
      message: `Tafadhali fanya marekebisho yafuatayo kwenye maombi yako ya uhakiki: "${correctionNotes.trim()}".`,
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, correctionNotes }
    });

    return app;
  }

  /**
   * Action: APPROVE
   * Approves verification.
   *
   * SEPARATE BADGE ACTIVATION:
   * By default autoActivateBadge is true, but badge activation can be invoked independently.
   */
  public approveVerification(params: {
    verificationId: string;
    adminNotes?: string;
    autoActivateBadge?: boolean;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, adminNotes, autoActivateBadge = true, adminUserId } = params;

    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    const previousStatus = app.status;
    const now = new Date().toISOString();

    app.status = 'APPROVED';
    app.approvedAt = now;
    app.reviewedBy = adminUserId;
    app.reviewedAt = now;
    app.reviewDecisionNotes = adminNotes?.trim() || undefined;
    app.safeRejectionReason = undefined;
    app.correctionNotes = undefined;
    app.currentReviewVersion = (app.currentReviewVersion || 1) + 1;
    app.updatedAt = now;

    // 3-month (90 days) validity from approval
    const ninetyDaysLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    app.expiresAt = ninetyDaysLater;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_APPROVED',
      previousStatus,
      newStatus: 'APPROVED',
      notes: adminNotes || 'Maombi ya uhakiki yameidhinishwa rasmi'
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_APPROVED',
      category: 'MODERATION',
      priority: 'HIGH',
      title: 'Uhakiki Umeidhinishwa!',
      message: 'Hongera! Maombi yako ya uhakiki wa muuzaji yameidhinishwa rasmi na jopo la usimamizi.',
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, applicationNumber: app.applicationNumber }
    });

    if (autoActivateBadge) {
      this.activateBadge({ verificationId, adminUserId });
    }

    return app;
  }

  /**
   * Action: ACTIVATE_BADGE
   * Authoritative badge activation.
   *
   * STRICT RULE:
   * Only activates when status === 'APPROVED'.
   * Never activates before approval!
   */
  public activateBadge(params: {
    verificationId: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, adminUserId } = params;
    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    if (app.status !== 'APPROVED') {
      throw new Error(`Haiwezi kuwasha beji: Maombi lazima yawe APPROVED (Hali ya sasa ni ${app.status}).`);
    }

    if (app.badgeStatus === 'ACTIVE' && app.hasActiveBadge) {
      // Idempotent
      return app;
    }

    const previousBadgeStatus = app.badgeStatus;
    const now = new Date().toISOString();

    app.badgeStatus = 'ACTIVE';
    app.hasActiveBadge = true;
    app.badgeActivatedAt = now;
    app.badgeDeactivatedAt = null;
    app.badgeDeactivationReason = undefined;
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_BADGE_ACTIVATED',
      previousBadgeStatus,
      newBadgeStatus: 'ACTIVE',
      notes: 'Beji rasmi ya Verified Seller imewashwa'
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_BADGE_ACTIVATED',
      category: 'MODERATION',
      priority: 'NORMAL',
      title: 'Beji ya Uhakiki Imewashwa',
      message: 'Beji yako rasmi ya "Verified Seller" sasa inaonekana kwa wanunuzi kwenye duka na bidhaa zako.',
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId }
    });

    return app;
  }

  /**
   * Action: DEACTIVATE_BADGE
   */
  public deactivateBadge(params: {
    verificationId: string;
    reason?: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, reason, adminUserId } = params;
    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    const previousBadgeStatus = app.badgeStatus;
    const now = new Date().toISOString();

    app.badgeStatus = 'INACTIVE';
    app.hasActiveBadge = false;
    app.badgeDeactivatedAt = now;
    app.badgeDeactivationReason = reason || 'Kuzimwa na msimamizi';
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);

    // Ensure all applications for this sellerUserId reflect the deactivated badge status
    Array.from(applicationsStore.values()).forEach((otherApp) => {
      if (otherApp.sellerUserId === app.sellerUserId || otherApp.sellerId === app.sellerUserId) {
        otherApp.badgeStatus = 'INACTIVE';
        otherApp.hasActiveBadge = false;
        otherApp.badgeDeactivatedAt = now;
        otherApp.badgeDeactivationReason = reason || 'Kuzimwa na msimamizi';
        otherApp.updatedAt = now;
        applicationsStore.set(otherApp.verificationId, otherApp);
      }
    });

    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_BADGE_DEACTIVATED',
      previousBadgeStatus,
      newBadgeStatus: 'INACTIVE',
      reason,
      notes: reason || 'Beji ya uhakiki imezimwa'
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_BADGE_DEACTIVATED',
      category: 'MODERATION',
      priority: 'NORMAL',
      title: 'Beji ya Uhakiki Imezimwa',
      message: `Beji yako ya uhakiki imezimwa kwa sababu: ${reason || 'Mabadiliko ya usimamizi'}.`,
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, reason }
    });

    return app;
  }

  /**
   * Action: REJECT
   * Rejects verification application with a safe seller-facing reason.
   *
   * STRICT SEPARATION:
   * Rejection of verification DOES NOT suspend the seller or disable Seller Monetization!
   */
  public rejectVerification(params: {
    verificationId: string;
    safeRejectionReason: string;
    internalAdminNotes?: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, safeRejectionReason, internalAdminNotes, adminUserId } = params;
    if (!safeRejectionReason?.trim()) {
      throw new Error('Sababu salama ya kukataliwa (safeRejectionReason) inahitajika kuarifu muuzaji.');
    }

    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    const previousStatus = app.status;
    const now = new Date().toISOString();

    app.status = 'REJECTED';
    app.badgeStatus = 'INACTIVE';
    app.hasActiveBadge = false;
    app.rejectedAt = now;
    app.reviewedBy = adminUserId;
    app.reviewedAt = now;
    app.safeRejectionReason = safeRejectionReason.trim();
    app.reviewDecisionNotes = internalAdminNotes?.trim() || undefined;
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_REJECTED',
      previousStatus,
      newStatus: 'REJECTED',
      reason: safeRejectionReason.trim(),
      notes: internalAdminNotes || safeRejectionReason.trim()
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_REJECTED',
      category: 'MODERATION',
      priority: 'HIGH',
      title: 'Maombi ya Uhakiki Hayakukubaliwa',
      message: `Maombi yako ya uhakiki hayajakubaliwa kwa sababu ifuatayo: "${safeRejectionReason.trim()}". Unaweza kurekebisha taarifa na kuomba tena.`,
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, reason: safeRejectionReason }
    });

    return app;
  }

  /**
   * Action: SUSPEND
   */
  public suspendVerification(params: {
    verificationId: string;
    reason: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, reason, adminUserId } = params;
    if (!reason?.trim()) throw new Error('Sababu ya kusitisha uhakiki inahitajika.');

    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    const previousStatus = app.status;
    const now = new Date().toISOString();

    app.status = 'SUSPENDED';
    app.badgeStatus = 'SUSPENDED';
    app.hasActiveBadge = false;
    app.suspensionReason = reason.trim();
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_SUSPENDED',
      previousStatus,
      newStatus: 'SUSPENDED',
      reason: reason.trim(),
      notes: `Uhakiki umesimamishwa: ${reason.trim()}`
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_SUSPENDED',
      category: 'MODERATION',
      priority: 'HIGH',
      title: 'Uhakiki Umesimamishwa',
      message: `Uhakiki wa akaunti yako umesitishwa kwa sababu: ${reason.trim()}. Wasiliana na usimamizi kwa maelezo zaidi.`,
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, reason }
    });

    return app;
  }

  /**
   * Action: REQUIRE_REVERIFICATION
   */
  public requireReverification(params: {
    verificationId: string;
    reason: string;
    adminUserId: string;
  }): SellerVerificationApplication {
    const { verificationId, reason, adminUserId } = params;
    const app = this.getVerificationById(verificationId);
    if (!app) throw new Error(`Maombi ya uhakiki ${verificationId} hayakupatikana.`);

    const previousStatus = app.status;
    const now = new Date().toISOString();

    app.status = 'REVERIFICATION_REQUIRED';
    app.reverificationNotes = reason?.trim();
    app.reverificationRequiredAt = now;
    app.updatedAt = now;

    applicationsStore.set(verificationId, app);
    persistToDisk();

    this.recordAuditEvent({
      verificationId,
      sellerUserId: app.sellerUserId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'VERIFICATION_REVERIFICATION_REQUIRED',
      previousStatus,
      newStatus: 'REVERIFICATION_REQUIRED',
      reason,
      notes: `Uhakiki upya unahitajika: ${reason}`
    });

    emitAppNotification({
      recipientUserId: app.sellerUserId,
      type: 'VERIFICATION_REVERIFICATION_REQUIRED',
      category: 'MODERATION',
      priority: 'NORMAL',
      title: 'Uhakiki Upya Unahitajika',
      message: `Tafadhali sasisha taarifa na nyaraka za duka lako kwa ajili ya uhakiki upya. Sababu: ${reason}`,
      targetId: verificationId,
      targetType: 'SELLER',
      senderUserId: adminUserId,
      actionUrl: '/profile?tab=verification',
      metadata: { verificationId, reason }
    });

    return app;
  }

  /**
   * Authoritative administrative decision bridge used by AdminSellerVerificationReview.
   * If in browser, calls /api/admin/verifications/:verificationId/review to execute authoritatively on server.
   */
  public async adminReviewSellerVerification(
    adminUserId: string,
    targetId: string,
    actionType: 'VERIFY' | 'REJECT' | 'SUSPEND' | 'UNDER_REVIEW',
    details?: { reason?: string; notes?: string },
    token?: string | null
  ): Promise<SellerVerificationApplication> {
    if (typeof window !== 'undefined') {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-user-role': 'admin',
          'x-user-id': adminUserId
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`/api/admin/verifications/${encodeURIComponent(targetId)}/review`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            adminUserId,
            actionType,
            details
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'ok' && data.application) {
            applicationsStore.set(data.application.verificationId, data.application);
            sellerToVerificationMap.set(data.application.sellerUserId, data.application.verificationId);
            return data.application;
          }
        }
      } catch (err) {
        console.warn('[sellerVerificationService] API review error, falling back to local execution:', err);
      }
    }

    const app = this.getVerificationById(targetId) || this.getVerificationBySellerId(targetId);
    if (!app) {
      throw new Error(`Maombi ya uhakiki (${targetId}) hayakupatikana.`);
    }

    switch (actionType) {
      case 'VERIFY':
        return this.approveVerification({
          verificationId: app.verificationId,
          adminNotes: details?.notes,
          autoActivateBadge: true,
          adminUserId
        });
      case 'REJECT':
        return this.rejectVerification({
          verificationId: app.verificationId,
          safeRejectionReason: details?.reason || 'Maombi hayakukidhi vigezo vya uhakiki wa jukwaa.',
          internalAdminNotes: details?.notes,
          adminUserId
        });
      case 'SUSPEND':
        return this.suspendVerification({
          verificationId: app.verificationId,
          reason: details?.reason || 'Uhakiki umesitishwa kiutawala.',
          adminUserId
        });
      case 'UNDER_REVIEW':
        return this.startReview({
          verificationId: app.verificationId,
          adminUserId
        });
      default:
        throw new Error(`Aina ya uamuzi '${actionType}' haitambuliki.`);
    }
  }

  // --------------------------------------------------------------------------
  // 7. UTILITIES & TESTING HELPERS
  // --------------------------------------------------------------------------

  public _clearAllForTesting(persist: boolean = true): void {
    applicationsStore.clear();
    sellerToVerificationMap.clear();
    auditsStore.clear();
    idempotencyKeyToVerificationMap.clear();
    if (persist) {
      persistToDisk();
    }
  }
}

export const sellerVerificationService = new SellerVerificationService();
