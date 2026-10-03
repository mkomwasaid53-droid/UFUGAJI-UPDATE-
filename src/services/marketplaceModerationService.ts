/**
 * V1.7D — Admin Moderation Service
 * Phase 6: Marketplace Governance
 *
 * Core Governance Invariants:
 * 1. Admin Moderation is a GOVERNANCE layer, NOT a replacement for:
 *    - Seller Verification (V1.6A)
 *    - Shop Trust & Profile Integrity (V1.6B)
 *    - Product Trust & Ownership (V1.6C)
 *    - Price & Stock Trust (V1.6D)
 *    - Location & Delivery Trust (V1.6E)
 *    - Reviews & Reporting (V1.6F)
 *    - Trust Signals (V1.6G)
 *    - Category Governance (V1.7A)
 *    - Listing Validation (V1.7B)
 *    - AI Assisted Classification (V1.7C)
 *    - Daktari Verification
 *
 * 2. Admin Approval Meaning:
 *    Approval means: "The authorized moderator reviewed the listing under the
 *    applicable Marketplace governance rules and allowed it to remain in the Marketplace state."
 *    It does NOT automatically mean:
 *    - Seller Verified (sellerVerificationStatus is NOT changed)
 *    - Product Authentic (no authenticity claim is created)
 *    - Medical Approval (veterinary safety is NOT certified)
 *    - Government Certified
 *
 * 3. Revalidation & Ownership Immutability:
 *    - Moderator cannot arbitrarily rewrite sellerId, shopId, or price/stock.
 *    - Restoring or approving a listing requires current V1.7B listing validation and V1.7A category checks.
 *    - A listing under an inactive or non-existent category CANNOT be approved or restored.
 *
 * 4. Audit Trail:
 *    - Append-only and immutable.
 *    - Timestamp and performedBy are securely bound to the authenticated admin.
 *    - Internal notes are kept strictly private from public explanations.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MarketplaceProduct, ProductStatus } from '../types/marketplace';
import {
  MarketplaceModerationRecord,
  MarketplaceModerationAuditEntry,
  ModerationStatus,
  ModerationAction,
  ModerationPriority,
  ModerationReasonCode,
  MODERATION_REASON_LABELS,
  ModerationQueueFilter,
  ModerationQueueItem,
  PerformModerationActionInput,
  ModerationActionResult
} from '../types/marketplaceModeration';
import {
  validateMarketplaceListing,
  ValidateListingOptions
} from './marketplaceListingValidationService';
import {
  findCategoryById,
  getLocalCachedCategories
} from './marketplaceCategoryService';
import { dispatchModerationNotification } from './notificationService';
import {
  validateProductOwnership
} from './productOwnershipService';
import {
  resolvePriceStockTrust
} from './productPriceStockService';
import {
  resolveLocationDeliveryTrust
} from './productLocationDeliveryService';
import {
  getLocalCachedReports,
  getLocalCachedReviews
} from './marketplaceReviewService';
import {
  classifyListingDeterministically
} from './marketplaceAiClassificationService';
import {
  getLocalCachedProducts,
  updateMarketplaceProduct
} from './marketplaceService';

const LOCAL_MODERATION_CACHE_KEY = 'ufugaji_marketplace_moderation_cache';
const LOCAL_AUDIT_CACHE_KEY = 'ufugaji_marketplace_moderation_audit_cache';

// ==========================================
// 1. LOCAL CACHE & STORAGE
// ==========================================

export function getLocalCachedModerationRecords(): MarketplaceModerationRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_MODERATION_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya moderation:', err);
  }
  return [];
}

export function saveModerationRecordsToCache(records: MarketplaceModerationRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_MODERATION_CACHE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi akiba ya moderation:', err);
  }
}

export function getLocalCachedAuditLogs(): MarketplaceModerationAuditEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_AUDIT_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya audit logs:', err);
  }
  return [];
}

export function saveAuditLogsToCache(logs: MarketplaceModerationAuditEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_AUDIT_CACHE_KEY, JSON.stringify(logs));
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi akiba ya audit logs:', err);
  }
}

// ==========================================
// 2. AUTHORIZATION CHECK
// ==========================================

/**
 * Asserts that the calling user is an authorized Administrator.
 * Client-side isAdmin flags without a valid user ID are rejected.
 */
export function assertAdminAuthorized(
  userId: string | null | undefined,
  isAdmin: boolean | undefined
): void {
  if (!userId || !userId.trim() || !isAdmin) {
    throw new Error('Ruhusa imekataliwa: Hatua hii inahitaji mamlaka kamili ya Msimamizi (Admin). Watumiaji wa kawaida au wauzaji hawawezi kubadili hali ya ukaguzi.');
  }
}

// ==========================================
// 3. DETERMINISTIC PRIORITY DERIVATION
// ==========================================

/**
 * Computes moderation priority deterministically from structured governance signals.
 * Never uses an opaque AI trust score.
 */
export function deriveListingModerationPriority(
  product: MarketplaceProduct,
  validationErrorsCount: number,
  activeReportsCount: number,
  currentStatus: ModerationStatus,
  hasMismatchReview: boolean
): { priority: ModerationPriority; reasons: string[] } {
  const reasons: string[] = [];

  // CRITICAL triggers
  if (activeReportsCount >= 3) {
    reasons.push(`Ina ripoti ${activeReportsCount} kutoka kwa watumiaji (Zaidi ya kiwango cha kawaida)`);
  }
  if (currentStatus === 'ESCALATED') {
    reasons.push('Tangazo limepewa rufaa/uangalizi maalum (Escalated)');
  }
  if (product.status === 'active' && validationErrorsCount > 0) {
    reasons.push('Tangazo lipo LIVE lakini linashindwa ukaguzi wa kisheria (Validation Error)');
  }

  if (reasons.length > 0) {
    return { priority: 'CRITICAL', reasons };
  }

  // HIGH triggers
  if (activeReportsCount >= 1) {
    reasons.push(`Ina ripoti ${activeReportsCount} inayosubiri ukaguzi`);
  }
  if (currentStatus === 'SUSPENDED' || currentStatus === 'HIDDEN') {
    reasons.push('Tangazo limefungiwa au kufichwa kwa sababu ya sera');
  }
  if (validationErrorsCount > 0) {
    reasons.push('Taarifa za tangazo hazijakidhi vigezo kamili');
  }

  if (reasons.length > 0) {
    return { priority: 'HIGH', reasons };
  }

  // NORMAL triggers
  if (hasMismatchReview) {
    reasons.push('Kuna tofauti kati ya kundi alilochagua muuzaji na pendekezo la mfumo');
  }
  if (currentStatus === 'NOT_REVIEWED' && product.status === 'active') {
    reasons.push('Tangazo jipya lipo LIVE linasubiri ukaguzi wa awali');
  }
  if (currentStatus === 'UNDER_REVIEW') {
    reasons.push('Ukaguzi unaendelea na msimamizi');
  }

  if (reasons.length > 0) {
    return { priority: 'NORMAL', reasons };
  }

  // LOW: Drafts or already approved without issues
  return {
    priority: 'LOW',
    reasons: ['Hali ya kawaida, hakuna changamoto iliyotambuliwa']
  };
}

// ==========================================
// 4. RETRIEVAL & QUEUE SYNTHESIS
// ==========================================

/**
 * Retrieves the moderation record for a given product ID.
 * Returns a legacy default NOT_REVIEWED record if none exists.
 */
export function getListingModerationRecord(
  productId: string,
  product?: MarketplaceProduct
): MarketplaceModerationRecord {
  const cachedRecords = getLocalCachedModerationRecords();
  const existing = cachedRecords.find((r) => r.productId === productId || r.targetId === productId);

  if (existing) {
    return existing;
  }

  // Legacy fallback: Listing exists but has no explicit moderation record yet
  const authoritativeSellerId = product?.sellerId || 'unknown_seller';
  const authoritativeShopId = product?.shopId || authoritativeSellerId;
  const now = new Date().toISOString();

  const defaultRecord: MarketplaceModerationRecord = {
    moderationId: `mod_${productId}`,
    targetType: 'LISTING',
    targetId: productId,
    productId,
    listingId: productId,
    sellerId: authoritativeSellerId,
    shopId: authoritativeShopId,
    status: (product?.moderationStatus as ModerationStatus) || 'NOT_REVIEWED',
    priority: 'NORMAL',
    reasonCode: null,
    reasonText: null,
    internalNote: null,
    publicExplanation: null,
    correctionInstructions: null,
    reviewedByUserId: product?.moderatedBy || null,
    reviewedByDisplayName: null,
    reviewedAt: product?.moderatedAt || null,
    createdAt: product?.createdAt || now,
    updatedAt: product?.updatedAt || now
  };

  return defaultRecord;
}

/**
 * Builds the complete Moderation Queue by aggregating products,
 * validations, trust states, reports, and AI classification guidance.
 */
export async function fetchModerationQueue(
  adminUserId: string,
  isAdmin: boolean,
  filter: ModerationQueueFilter = 'ALL',
  searchTerm: string = ''
): Promise<ModerationQueueItem[]> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const products = getLocalCachedProducts();
  const allReports = getLocalCachedReports();
  const categories = getLocalCachedCategories();
  const moderationRecords = getLocalCachedModerationRecords();

  const queueItems: ModerationQueueItem[] = [];

  for (const product of products) {
    const moderationRecord = getListingModerationRecord(product.productId, product);

    // 1. Authoritative V1.7B Validation
    const validationResult = validateMarketplaceListing({
      product,
      authenticatedUserId: product.sellerId,
      targetStatus: product.status,
      governedCategories: categories,
      isAdmin: true
    });

    // 2. Authoritative V1.6C Ownership
    const ownershipValidation = validateProductOwnership(
      product,
      null,
      product.sellerVerificationStatus
    );

    // 3. Authoritative V1.6D Price & Stock Trust
    const priceStockTrust = resolvePriceStockTrust(product);

    // 4. Authoritative V1.6E Location & Delivery Trust
    const locationDeliveryTrust = resolveLocationDeliveryTrust(product);

    // 5. Active Reports (V1.6F)
    const productReports = allReports.filter(
      (rep) => rep.targetId === product.productId && rep.status !== 'DISMISSED'
    );

    // 6. Published Reviews (V1.6F)
    const allReviews = getLocalCachedReviews();
    const publishedReviews = allReviews.filter(
      (rev) => rev.targetType === 'PRODUCT' && rev.targetId === product.productId && rev.status === 'active'
    );

    // 7. Assistive AI Classification (V1.7C) - Guidance only
    const aiClassification = classifyListingDeterministically({
      title: product.title,
      description: product.description,
      sellerSelectedCategoryId: product.categoryId,
      sellerSelectedSubcategoryId: product.subcategoryId,
      sellerSelectedCategoryName: product.category,
      livestockType: product.livestockLink?.type,
      productType: product.livestockLink?.category
    });

    // Compute deterministic priority
    const hasMismatch = aiClassification.isMismatchWithSellerCategory;
    const { priority, reasons: priorityReasons } = deriveListingModerationPriority(
      product,
      validationResult.errors.length,
      productReports.length,
      moderationRecord.status,
      hasMismatch
    );

    // Update record priority in-memory
    moderationRecord.priority = priority;

    const item: ModerationQueueItem = {
      product,
      moderationRecord,
      validationResult,
      priority,
      priorityReasons,
      reportCount: productReports.length,
      reports: productReports,
      publishedReviews,
      aiClassification,
      ownershipValidation,
      priceStockTrust,
      locationDeliveryTrust
    };

    // Filter matching
    let matchesFilter = true;
    switch (filter) {
      case 'NOT_REVIEWED':
        matchesFilter = moderationRecord.status === 'NOT_REVIEWED';
        break;
      case 'UNDER_REVIEW':
        matchesFilter = moderationRecord.status === 'UNDER_REVIEW';
        break;
      case 'REPORTED':
        matchesFilter = productReports.length > 0;
        break;
      case 'INVALID':
        matchesFilter = validationResult.errors.length > 0 || !validationResult.isEligibleForActive;
        break;
      case 'NEEDS_REVIEW':
        matchesFilter =
          moderationRecord.status === 'UNDER_REVIEW' ||
          moderationRecord.status === 'NOT_REVIEWED' ||
          productReports.length > 0;
        break;
      case 'AI_CLASSIFICATION_AMBIGUOUS':
        matchesFilter = aiClassification.classificationStatus === 'AMBIGUOUS';
        break;
      case 'CATEGORY_MISMATCH':
        matchesFilter = aiClassification.isMismatchWithSellerCategory;
        break;
      case 'SUSPENDED':
        matchesFilter =
          moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN';
        break;
      case 'RECENTLY_UPDATED':
        matchesFilter = Boolean(product.updatedAt);
        break;
      case 'ALL':
      default:
        matchesFilter = true;
        break;
    }

    if (!matchesFilter) continue;

    // Search query matching (title, seller, category, productId)
    if (searchTerm && searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const matchTitle = product.title?.toLowerCase().includes(q);
      const matchSeller = product.sellerName?.toLowerCase().includes(q) || product.sellerBusinessName?.toLowerCase().includes(q);
      const matchCategory = product.category?.toLowerCase().includes(q) || product.subcategory?.toLowerCase().includes(q);
      const matchId = product.productId?.toLowerCase().includes(q);

      if (!matchTitle && !matchSeller && !matchCategory && !matchId) {
        continue;
      }
    }

    queueItems.push(item);
  }

  // Sort queue: CRITICAL first, then HIGH, then NORMAL, then LOW, then newest
  const priorityWeight: Record<ModerationPriority, number> = {
    CRITICAL: 4,
    HIGH: 3,
    NORMAL: 2,
    LOW: 1
  };

  queueItems.sort((a, b) => {
    const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (diff !== 0) return diff;
    return new Date(b.product.updatedAt || b.product.createdAt).getTime() -
           new Date(a.product.updatedAt || a.product.createdAt).getTime();
  });

  return queueItems;
}

// ==========================================
// 5. PERFORM AUTHORIZED MODERATION ACTION
// ==========================================

/**
 * Performs a controlled, authorized moderation action on a marketplace listing.
 * Ensures:
 * - Moderator is authorized.
 * - Rejection requires a structured reasonCode.
 * - Approval/Restoration runs mandatory validation and category check.
 * - Seller verification status is NEVER modified.
 * - Product ownership (sellerId, shopId) is NEVER modified.
 * - Append-only audit record is stored.
 */
export async function performModerationAction(
  adminUserId: string,
  adminDisplayName: string,
  isAdmin: boolean,
  input: PerformModerationActionInput
): Promise<ModerationActionResult> {
  // 1. Enforce Admin Authorization
  assertAdminAuthorized(adminUserId, isAdmin);

  const {
    targetProductId,
    action,
    reasonCode,
    reasonText,
    internalNote,
    publicExplanation,
    correctionInstructions
  } = input;

  if (!targetProductId || !targetProductId.trim()) {
    return { success: false, error: 'Kitambulisho cha bidhaa (targetProductId) kinahitajika.' };
  }

  const cleanProductId = targetProductId.trim();
  const products = getLocalCachedProducts();
  const targetProduct = products.find((p) => p.productId === cleanProductId);

  if (!targetProduct) {
    return { success: false, error: `Bidhaa yenye ID "${cleanProductId}" haikupatikana kwenye soko.` };
  }

  // 2. Validate Action Name
  const validActions: ModerationAction[] = [
    'START_REVIEW',
    'APPROVE_LISTING',
    'REJECT_LISTING',
    'HIDE_LISTING',
    'SUSPEND_LISTING',
    'RESTORE_LISTING',
    'REQUEST_CORRECTION',
    'ESCALATE'
  ];

  if (!validActions.includes(action)) {
    return { success: false, error: `Hatua ya ukaguzi "${action}" haitambuliwi na mfumo.` };
  }

  // 3. Rejection & Correction Validation
  if (action === 'REJECT_LISTING') {
    if (!reasonCode) {
      return {
        success: false,
        error: 'Sababu ya kisheria (reasonCode) inahitajika ili kukataa tangazo.'
      };
    }
  }

  if (action === 'REQUEST_CORRECTION') {
    if (!reasonCode && !correctionInstructions) {
      return {
        success: false,
        error: 'Tafadhali toa maelekezo ya marekebisho (correctionInstructions) kwa ajili ya muuzaji.'
      };
    }
  }

  // 4. Retrieve current moderation state
  const currentRecord = getListingModerationRecord(cleanProductId, targetProduct);
  const previousStatus = currentRecord.status;
  let newStatus: ModerationStatus = previousStatus;
  let updatedProductStatus: ProductStatus = targetProduct.status;

  const now = new Date().toISOString();

  // 5. Execute Action Logic with Strict Governance Guards
  switch (action) {
    case 'START_REVIEW':
      newStatus = 'UNDER_REVIEW';
      break;

    case 'APPROVE_LISTING': {
      // Revalidation Check: Check V1.7A Category Status
      const categories = getLocalCachedCategories();
      const targetCategoryId = targetProduct.categoryId || targetProduct.category;
      const matchedCategory = findCategoryById(targetCategoryId, categories);

      if (!matchedCategory) {
        return {
          success: false,
          validationBlocked: true,
          error: `Kundi "${targetProduct.category}" halipo kwenye orodha ya makundi rasmi (V1.7A). Tangazo haliwezi kuidhinishwa.`
        };
      }

      if (matchedCategory.status !== 'ACTIVE') {
        return {
          success: false,
          validationBlocked: true,
          error: `Kundi "${matchedCategory.name}" limerejeshwa/halitumiki (Status: ${matchedCategory.status}). Tangazo haliwezi kuidhinishwa chini ya kundi lisilo hai.`
        };
      }

      // Revalidation Check: Check V1.7B Listing Validation
      const validation = validateMarketplaceListing({
        product: targetProduct,
        authenticatedUserId: targetProduct.sellerId,
        targetStatus: 'active',
        governedCategories: categories,
        isAdmin: true
      });

      if (!validation.isEligibleForActive) {
        const errorList = validation.errors.map((e) => `• ${e.message}`).join('\n');
        return {
          success: false,
          validationBlocked: true,
          error: `Tangazo linashindwa vigezo vya lazima vya usajili (Listing Validation):\n${errorList}`
        };
      }

      newStatus = 'APPROVED';
      updatedProductStatus = 'active';
      break;
    }

    case 'REJECT_LISTING':
      newStatus = 'REJECTED';
      updatedProductStatus = 'inactive';
      break;

    case 'HIDE_LISTING':
      newStatus = 'HIDDEN';
      updatedProductStatus = 'inactive';
      break;

    case 'SUSPEND_LISTING':
      newStatus = 'SUSPENDED';
      updatedProductStatus = 'inactive';
      break;

    case 'RESTORE_LISTING': {
      // Revalidation Check before Restoration (V1.7B & V1.7A)
      const categories = getLocalCachedCategories();
      const targetCategoryId = targetProduct.categoryId || targetProduct.category;
      const matchedCategory = findCategoryById(targetCategoryId, categories);

      if (!matchedCategory || matchedCategory.status !== 'ACTIVE') {
        return {
          success: false,
          validationBlocked: true,
          error: 'Haliwezi kurejeshwa: Kundi la tangazo hili halipo au limesitishwa (Inactive Category).'
        };
      }

      // Ownership Check: Authoritative sellerId must exist and be valid
      if (!targetProduct.sellerId || targetProduct.sellerId === 'unknown_seller') {
        return {
          success: false,
          validationBlocked: true,
          error: 'Haliwezi kurejeshwa: Umiliki wa muuzaji (sellerId) si sahihi au hauwezi kuthibitishwa.'
        };
      }

      const validation = validateMarketplaceListing({
        product: targetProduct,
        authenticatedUserId: targetProduct.sellerId,
        targetStatus: 'active',
        governedCategories: categories,
        isAdmin: true
      });

      if (!validation.isEligibleForActive) {
        const errorList = validation.errors.map((e) => `• ${e.message}`).join('\n');
        return {
          success: false,
          validationBlocked: true,
          error: `Haliwezi kurejeshwa kwa sababu linashindwa ukaguzi wa sasa wa vigezo:\n${errorList}`
        };
      }

      newStatus = 'RESTORED';
      updatedProductStatus = 'active';
      break;
    }

    case 'REQUEST_CORRECTION':
      newStatus = 'UNDER_REVIEW';
      updatedProductStatus = 'draft';
      break;

    case 'ESCALATE':
      newStatus = 'ESCALATED';
      break;
  }

  // Safe Public Explanation
  const defaultPublicText = reasonCode ? MODERATION_REASON_LABELS[reasonCode]?.sw : '';
  const safePublicExplanation = publicExplanation?.trim() || defaultPublicText || '';

  // 6. Build Updated Moderation Record
  const updatedRecord: MarketplaceModerationRecord = {
    ...currentRecord,
    status: newStatus,
    previousStatus,
    lastAction: action,
    reasonCode: reasonCode || currentRecord.reasonCode || null,
    reasonText: reasonText?.trim() || (reasonCode ? MODERATION_REASON_LABELS[reasonCode]?.sw : null),
    internalNote: internalNote?.trim() || currentRecord.internalNote || null,
    publicExplanation: safePublicExplanation || currentRecord.publicExplanation || null,
    correctionInstructions: correctionInstructions?.trim() || currentRecord.correctionInstructions || null,
    reviewedByUserId: adminUserId,
    reviewedByDisplayName: adminDisplayName || 'Msimamizi wa Soko',
    reviewedAt: now,
    updatedAt: now
  };

  // 7. Build Immutable Audit Log Entry
  const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const auditEntry: MarketplaceModerationAuditEntry = {
    auditId,
    moderationId: updatedRecord.moderationId,
    targetType: 'LISTING',
    targetId: cleanProductId,
    productId: cleanProductId,
    sellerId: targetProduct.sellerId, // Strictly authoritative, cannot be hijacked
    shopId: targetProduct.shopId || targetProduct.sellerId,
    action,
    previousStatus,
    newStatus,
    reasonCode: reasonCode || null,
    reasonText: reasonText?.trim() || (reasonCode ? MODERATION_REASON_LABELS[reasonCode]?.sw : null),
    internalNote: internalNote?.trim() || null, // Kept strictly in audit/internal record
    publicExplanation: safePublicExplanation || null,
    correctionInstructions: correctionInstructions?.trim() || null,
    performedByUserId: adminUserId,
    performedByDisplayName: adminDisplayName || 'Msimamizi wa Soko',
    performedAt: now
  };

async function safeFirestoreOp<T>(promise: Promise<T>, timeoutMs: number = 2000): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch (err) {
    return null;
  }
}

  // 8. Update Product Record in Marketplace
  // CRITICAL INVARIANT: NEVER modify sellerVerificationStatus, productVerificationStatus,
  // sellerId, shopId, price, stock, or location as part of moderation!
  const productModerationUpdates: Partial<MarketplaceProduct> = {
    status: updatedProductStatus,
    moderationStatus: newStatus,
    moderationId: updatedRecord.moderationId,
    moderatedAt: now,
    moderatedBy: adminUserId,
    moderationReasonCode: reasonCode || undefined,
    moderationPublicReason: safePublicExplanation || undefined,
    moderationCorrectionNote: correctionInstructions?.trim() || undefined
  };

  // Apply updates to the product
  let finalProduct: MarketplaceProduct;
  const isNode = typeof window === 'undefined' || !window.location || !window.location.origin;

  if (isNode) {
    const existingIndex = products.findIndex((p) => p.productId === cleanProductId);
    if (existingIndex >= 0) {
      products[existingIndex] = {
        ...products[existingIndex],
        ...productModerationUpdates,
        updatedAt: now
      };
      finalProduct = products[existingIndex];
      try {
        localStorage.setItem('ufugaji_marketplace_products_cache', JSON.stringify(products));
      } catch {}
    } else {
      finalProduct = { ...targetProduct, ...productModerationUpdates };
    }
  } else {
    try {
      finalProduct = await updateMarketplaceProduct(
        targetProduct.sellerId,
        cleanProductId,
        productModerationUpdates,
        true // isAdmin
      );
    } catch {
      // If updateMarketplaceProduct throws because of status change, apply directly in cache
      const existingIndex = products.findIndex((p) => p.productId === cleanProductId);
      if (existingIndex >= 0) {
        products[existingIndex] = {
          ...products[existingIndex],
          ...productModerationUpdates,
          updatedAt: now
        };
        finalProduct = products[existingIndex];
        try {
          localStorage.setItem('ufugaji_marketplace_products_cache', JSON.stringify(products));
        } catch {}
      } else {
        finalProduct = { ...targetProduct, ...productModerationUpdates };
      }
    }
  }

  // 9. Persist Moderation Record to Cache and Firestore
  const allRecords = getLocalCachedModerationRecords();
  const existingRecIdx = allRecords.findIndex((r) => r.productId === cleanProductId);
  if (existingRecIdx >= 0) {
    allRecords[existingRecIdx] = updatedRecord;
  } else {
    allRecords.unshift(updatedRecord);
  }
  saveModerationRecordsToCache(allRecords);

  if (!isNode) {
    try {
      const modRef = doc(db, 'marketplaceModeration', cleanProductId);
      await safeFirestoreOp(setDoc(modRef, updatedRecord, { merge: true }), 1500);
    } catch (err) {
      console.warn('Firestore moderation record notice (cached locally):', err);
    }
  }

  // 10. Persist Immutable Audit Log Entry to Cache and Firestore
  const allAuditLogs = getLocalCachedAuditLogs();
  allAuditLogs.unshift(auditEntry);
  saveAuditLogsToCache(allAuditLogs);

  if (!isNode) {
    try {
      const auditRef = doc(db, 'marketplaceModerationAudit', auditId);
      await safeFirestoreOp(setDoc(auditRef, auditEntry), 1500);
    } catch (err) {
      console.warn('Firestore moderation audit log notice (cached locally):', err);
    }
  }

  // 11. Dispatch Authoritative Seller Notification (V1.7H)
  try {
    let notifAction: 'APPROVE' | 'REJECT' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'REQUEST_CORRECTION' | 'UNDER_REVIEW' = 'UNDER_REVIEW';
    if (action === 'APPROVE_LISTING') notifAction = 'APPROVE';
    else if (action === 'REJECT_LISTING') notifAction = 'REJECT';
    else if (action === 'HIDE_LISTING') notifAction = 'HIDE';
    else if (action === 'SUSPEND_LISTING') notifAction = 'SUSPEND';
    else if (action === 'RESTORE_LISTING') notifAction = 'RESTORE';
    else if (action === 'REQUEST_CORRECTION') notifAction = 'REQUEST_CORRECTION';
    else if (action === 'START_REVIEW') notifAction = 'UNDER_REVIEW';

    await dispatchModerationNotification({
      sellerId: targetProduct.sellerId,
      productId: cleanProductId,
      productTitle: targetProduct.title,
      action: notifAction,
      moderationId: updatedRecord.moderationId,
      reasonCode: reasonCode || undefined,
      publicReason: safePublicExplanation || undefined,
      correctionNote: correctionInstructions?.trim() || undefined
    });
  } catch (notifErr) {
    console.warn('Hitilafu ya kutoa arifa ya moderation (hatua imekamilika):', notifErr);
  }

  return {
    success: true,
    moderationRecord: updatedRecord,
    auditEntry,
    updatedProduct: finalProduct
  };
}

// ==========================================
// 6. AUDIT LOG RETRIEVAL & INTEGRITY
// ==========================================

/**
 * Retrieves the audit history for a specific listing or for all listings.
 * Enforces admin authorization.
 */
export async function fetchModerationAuditLogs(
  adminUserId: string,
  isAdmin: boolean,
  targetProductId?: string
): Promise<MarketplaceModerationAuditEntry[]> {
  assertAdminAuthorized(adminUserId, isAdmin);

  const localLogs = getLocalCachedAuditLogs();

  if (targetProductId && targetProductId.trim()) {
    const cleanId = targetProductId.trim();
    return localLogs.filter((log) => log.productId === cleanId || log.targetId === cleanId);
  }

  return localLogs;
}

/**
 * Validates that an audit record cannot be modified or deleted.
 * Always throws error if invoked.
 */
export function assertAuditRecordImmutable(): never {
  throw new Error('Hitilafu ya Usalama: Rekodi za ukaguzi (Audit Log) haziwezi kubadilishwa wala kufutwa. Ni kumbukumbu ya kudumu ya kiutawala.');
}
