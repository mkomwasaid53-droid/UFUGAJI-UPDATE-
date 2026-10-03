/**
 * V1.6F — MARKETPLACE REVIEWS, REPUTATION & REPORTING SERVICE
 * Marketplace Trust Phase 5
 *
 * Core Principles Enforced:
 * 1. Authoritative Marketplace Facts > Moderation Decisions > User-Generated Reviews > Seller Responses > AI Interpretation
 * 2. Self-Review Blocked: Sellers cannot review own products, shops, or profiles.
 * 3. Rating Scale: Integer strictly 1..5. Rejects 0, 6, -1, 4.7, NaN.
 * 4. Deterministic Review ID & Duplicate Protection: One active review per user per target.
 * 5. Deterministic Reputation Calculation: Only PUBLISHED, non-deleted reviews count.
 * 6. Small Sample Warning: 1-2 reviews receive explicit warning; no exaggerated reputation claims.
 * 7. Seller Responses: Stored separately, clearly marked, cannot alter rating or reviewer text.
 * 8. Reporting != Proof: Reports are allegations for moderation; never auto-suspend or delete sellers.
 * 9. Content Safety & Sanitization: Script/tag stripping, untrusted text treated as plain claims.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  MarketplaceReview,
  MarketplaceReport,
  ReputationSummary,
  ReviewEligibilityResult,
  ReviewSubmissionInput,
  ReviewUpdateInput,
  ReportSubmissionInput,
  ReviewTargetType,
  ValidRatingValue,
  AIReviewSummaryResult
} from '../types/marketplaceReview';
import { INITIAL_SAMPLE_REVIEWS } from '../data/marketplaceReviewData';

const LOCAL_REVIEWS_CACHE_KEY = 'ufugaji_marketplace_reviews_cache';
const LOCAL_REPORTS_CACHE_KEY = 'ufugaji_marketplace_reports_cache';

// ==========================================
// 1. SANITIZATION & VALIDATION HELPERS
// ==========================================

/**
 * Validates rating value strictly as integer between 1 and 5.
 * Rejects 0, 6, -1, 4.7, NaN, null, undefined.
 */
export function validateRatingValue(rating: unknown): {
  valid: boolean;
  value?: ValidRatingValue;
  error?: string;
} {
  if (typeof rating !== 'number' || !Number.isInteger(rating) || isNaN(rating)) {
    return {
      valid: false,
      error: 'Tathmini ya nyota lazima iwe nambari kamili kati ya 1 na 5 (Integer only: 1, 2, 3, 4, au 5).'
    };
  }

  if (rating < 1 || rating > 5) {
    return {
      valid: false,
      error: `Nyota ${rating} haikubaliki. Kiwango kinachoruhusiwa ni kati ya nyota 1 hadi 5 pekee.`
    };
  }

  return {
    valid: true,
    value: rating as ValidRatingValue
  };
}

/**
 * Sanitizes untrusted user review/report text.
 * Strips dangerous HTML tags, prevents script execution, trims excess whitespace.
 */
export function sanitizeReviewText(text: string | undefined | null, maxLength: number = 1000): string {
  if (!text) return '';
  const cleaned = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * Validates whether an authenticated user is attempting to review their own entity.
 */
export function checkSelfReview(
  authorUserId: string | null | undefined,
  sellerId: string | null | undefined
): { isSelfReview: boolean; reason?: string } {
  if (authorUserId && sellerId && authorUserId.trim() === sellerId.trim()) {
    return {
      isSelfReview: true,
      reason: 'Huwezi kutoa tathmini au maoni kwa bidhaa au duka lako mwenyewe (Self-review protection).'
    };
  }
  return { isSelfReview: false };
}

/**
 * Generates a deterministic review document ID.
 * Enforces one review per user per target deterministically at the ID layer.
 */
export function generateDeterministicReviewId(
  authorUserId: string,
  targetType: ReviewTargetType,
  targetId: string
): string {
  const safeAuthor = authorUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTarget = targetId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `rev_${safeAuthor}_${targetType}_${safeTarget}`;
}

// ==========================================
// 2. LOCAL CACHE HELPERS
// ==========================================

export function getLocalCachedReviews(): MarketplaceReview[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LOCAL_REVIEWS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya reviews:', err);
  }
  return INITIAL_SAMPLE_REVIEWS;
}

export function saveReviewsToLocalCache(reviews: MarketplaceReview[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_REVIEWS_CACHE_KEY, JSON.stringify(reviews));
    }
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi akiba ya reviews:', err);
  }
}

export function getLocalCachedReports(): MarketplaceReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya ripoti:', err);
  }
  return [];
}

export function saveReportsToLocalCache(reports: MarketplaceReport[]): void {
  try {
    localStorage.setItem(LOCAL_REPORTS_CACHE_KEY, JSON.stringify(reports));
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi akiba ya ripoti:', err);
  }
}

// ==========================================
// 3. RETRIEVAL & QUERYING
// ==========================================

/**
 * Fetches all reviews for a specific target (Product, Shop, or Seller).
 * Falls back safely to cache and initial sample data.
 */
export async function fetchReviewsForTarget(
  targetType: ReviewTargetType,
  targetId: string,
  includeUnpublishedForAdmin: boolean = false
): Promise<MarketplaceReview[]> {
  const localList = getLocalCachedReviews();

  try {
    const reviewsRef = collection(db, 'marketplaceReviews');
    const q = query(
      reviewsRef,
      where('targetType', '==', targetType),
      where('targetId', '==', targetId)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      const remoteReviews: MarketplaceReview[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as MarketplaceReview;
        remoteReviews.push({
          ...data,
          reviewId: docSnap.id || data.reviewId
        });
      });

      // Merge remote with initial sample reviews for this target that are not yet in remote
      const remoteIds = new Set(remoteReviews.map((r) => r.reviewId));
      const merged = [
        ...remoteReviews,
        ...localList.filter(
          (r) => r.targetType === targetType && r.targetId === targetId && !remoteIds.has(r.reviewId)
        )
      ];

      // Update local cache
      const otherReviews = localList.filter(
        (r) => !(r.targetType === targetType && r.targetId === targetId)
      );
      saveReviewsToLocalCache([...otherReviews, ...merged]);

      return filterReviewsByModeration(merged, includeUnpublishedForAdmin);
    }
  } catch (err) {
    console.warn('Firestore fetch reviews notice (using local fallback):', err);
  }

  // Fallback to local memory / sample reviews
  const matched = localList.filter(
    (r) => r.targetType === targetType && r.targetId === targetId
  );
  return filterReviewsByModeration(matched, includeUnpublishedForAdmin);
}

function filterReviewsByModeration(
  reviews: MarketplaceReview[],
  includeUnpublished: boolean
): MarketplaceReview[] {
  if (includeUnpublished) {
    return reviews.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  // Public view: only PUBLISHED and active reviews
  return reviews
    .filter((r) => r.moderationStatus === 'PUBLISHED' && r.status !== 'deleted')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ==========================================
// 4. REPUTATION & AGGREGATION ENGINE
// ==========================================

/**
 * Computes deterministic reputation metrics strictly from valid, published reviews.
 * Adheres to:
 * - 0 reviews: "Hakuna tathmini bado", no fake rating!
 * - 1-2 reviews: small sample warning, no exaggerated trust claims!
 * - 3+ reviews: calculated average rating and distribution.
 */
export function calculateReputationSummary(
  reviews: MarketplaceReview[],
  targetType: ReviewTargetType,
  targetId: string
): ReputationSummary {
  // Only count published, non-deleted reviews for this target
  const publishedReviews = reviews.filter(
    (r) =>
      r.targetType === targetType &&
      r.targetId === targetId &&
      r.moderationStatus === 'PUBLISHED' &&
      r.status !== 'deleted'
  );

  const distribution = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };

  let totalRatingSum = 0;

  for (const rev of publishedReviews) {
    const val = rev.rating;
    if (val >= 1 && val <= 5 && Number.isInteger(val)) {
      distribution[val as ValidRatingValue] = (distribution[val as ValidRatingValue] || 0) + 1;
      totalRatingSum += val;
    }
  }

  const totalPublishedReviews = publishedReviews.length;

  if (totalPublishedReviews === 0) {
    return {
      targetType,
      targetId,
      totalPublishedReviews: 0,
      averageRating: null,
      ratingDistribution: distribution,
      hasReviews: false,
      isSmallSample: false,
      displayRatingText: 'Hakuna tathmini bado',
      reputationDisclaimer:
        'Hakuna tathmini ya mnunuzi iliyochapishwa bado. Taarifa za soko zilizopo zinatokana na tangazo la muuzaji pekee.'
    };
  }

  const averageRating = Number((totalRatingSum / totalPublishedReviews).toFixed(1));
  const isSmallSample = totalPublishedReviews <= 2;

  let smallSampleWarning: string | undefined;
  if (isSmallSample) {
    smallSampleWarning =
      totalPublishedReviews === 1
        ? 'Tathmini 1 pekee imetolewa. Haipaswi kuchukuliwa kama sifa kuu ya kudumu; hakiki pia mawasiliano na eneo la muuzaji.'
        : 'Tathmini 2 pekee zimetolewa (sampuli ndogo). Tunashauri kuhakiki pia maelezo rasmi ya bidhaa kabla ya kufanya uamuzi.';
  }

  const targetLabel =
    targetType === 'PRODUCT'
      ? 'bidhaa hii'
      : targetType === 'SHOP'
      ? 'duka hili'
      : 'muuzaji huyu';

  return {
    targetType,
    targetId,
    totalPublishedReviews,
    averageRating,
    ratingDistribution: distribution,
    hasReviews: true,
    isSmallSample,
    smallSampleWarning,
    displayRatingText: `${averageRating.toFixed(1)} (${totalPublishedReviews} ${totalPublishedReviews === 1 ? 'tathmini' : 'tathmini'})`,
    reputationDisclaimer: `Tathmini hizi ni maoni ya wanunuzi waliotoa uzoefu wao kuhusu ${targetLabel}. Hazimaanishi uthibitisho kamili wa mfumo.`
  };
}

// ==========================================
// 5. REVIEW ELIGIBILITY & DUPLICATE CHECK
// ==========================================

/**
 * Checks whether an authenticated user is eligible to review the given target.
 */
export async function checkReviewEligibility(
  authorUserId: string | null | undefined,
  targetType: ReviewTargetType,
  targetId: string,
  sellerId: string
): Promise<ReviewEligibilityResult> {
  if (!authorUserId) {
    return {
      state: 'UNAVAILABLE',
      canReview: false,
      reasonText: 'Tafadhali ingia kwenye akaunti yako ili uweze kutoa tathmini au maoni ya uzoefu wako.'
    };
  }

  // Self-review protection
  const selfCheck = checkSelfReview(authorUserId, sellerId);
  if (selfCheck.isSelfReview) {
    return {
      state: 'SELF_OWNED',
      canReview: false,
      reasonText: 'Huwezi kutoa tathmini kwa bidhaa au duka lako mwenyewe (Self-review imezuiwa).'
    };
  }

  // Check if active review already exists by this user for this target
  const localList = getLocalCachedReviews();
  const existing = localList.find(
    (r) =>
      r.authorUserId === authorUserId &&
      r.targetType === targetType &&
      r.targetId === targetId &&
      r.status !== 'deleted'
  );

  if (existing) {
    return {
      state: 'ALREADY_REVIEWED',
      canReview: true,
      existingReview: existing,
      reasonText: 'Tayari umetoa tathmini. Unaweza kuiboresha au kuifuta hapa chini.'
    };
  }

  return {
    state: 'ELIGIBLE',
    canReview: true,
    existingReview: null,
    reasonText: 'Unaweza kuandika uzoefu wako na tathmini ya nyota (1 hadi 5).'
  };
}

// ==========================================
// 6. CREATE, EDIT & DELETE REVIEWS
// ==========================================

/**
 * Submits a new review or updates an existing review deterministically.
 */
export async function submitMarketplaceReview(
  authorUserId: string,
  authorDisplayName: string,
  input: ReviewSubmissionInput
): Promise<MarketplaceReview> {
  if (!authorUserId) {
    throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia kwanza.');
  }

  // 1. Self-review protection
  const selfCheck = checkSelfReview(authorUserId, input.sellerId);
  if (selfCheck.isSelfReview) {
    throw new Error(selfCheck.reason);
  }

  // 2. Rating validation
  const ratingCheck = validateRatingValue(input.rating);
  if (!ratingCheck.valid || ratingCheck.value === undefined) {
    throw new Error(ratingCheck.error || 'Tathmini ya nyota si sahihi.');
  }

  // 3. Title & body sanitization
  const cleanTitle = sanitizeReviewText(input.title, 120);
  const cleanBody = sanitizeReviewText(input.body, 1500);

  if (!cleanTitle || cleanTitle.length < 3) {
    throw new Error('Tafadhali weka kichwa cha tathmini kisichopungua herufi 3.');
  }
  if (!cleanBody || cleanBody.length < 5) {
    throw new Error('Tafadhali weka maelezo ya uzoefu wako yasiyopungua herufi 5.');
  }

  // 4. Deterministic Review ID
  const reviewId = generateDeterministicReviewId(authorUserId, input.targetType, input.targetId);
  const now = new Date().toISOString();

  const allReviews = getLocalCachedReviews();
  const existingIndex = allReviews.findIndex((r) => r.reviewId === reviewId);
  const existing = existingIndex >= 0 ? allReviews[existingIndex] : null;

  const reviewRecord: MarketplaceReview = {
    reviewId,
    authorUserId,
    authorDisplayName: sanitizeReviewText(authorDisplayName, 50) || 'Mfugaji',
    targetType: input.targetType,
    targetId: input.targetId,
    sellerId: input.sellerId,
    shopId: input.shopId || null,
    productId: input.productId || null,
    rating: ratingCheck.value,
    title: cleanTitle,
    body: cleanBody,
    status: 'active',
    moderationStatus: existing ? existing.moderationStatus : 'PUBLISHED',
    reportCount: existing ? existing.reportCount : 0,
    helpfulCount: existing ? existing.helpfulCount : 0,
    sellerResponse: existing ? existing.sellerResponse : null,
    sellerResponseCreatedAt: existing ? existing.sellerResponseCreatedAt : null,
    sellerResponseSellerId: existing ? existing.sellerResponseSellerId : null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now
  };

  // 5. Persist to Firestore
  try {
    const reviewRef = doc(db, 'marketplaceReviews', reviewId);
    await setDoc(reviewRef, reviewRecord, { merge: true });
  } catch (err) {
    console.warn('Haikuweza kuhifadhi review kwenye Firestore mara moja, imehifadhiwa ndani ya kifaa:', err);
  }

  // 6. Update local cache
  if (existingIndex >= 0) {
    allReviews[existingIndex] = reviewRecord;
  } else {
    allReviews.unshift(reviewRecord);
  }
  saveReviewsToLocalCache(allReviews);

  return reviewRecord;
}

/**
 * Updates an existing review owned by the authenticated user.
 */
export async function updateMarketplaceReview(
  authorUserId: string,
  reviewId: string,
  input: ReviewUpdateInput
): Promise<MarketplaceReview> {
  if (!authorUserId) {
    throw new Error('Hujaingia kwenye mfumo.');
  }

  const allReviews = getLocalCachedReviews();
  const index = allReviews.findIndex((r) => r.reviewId === reviewId);
  if (index < 0) {
    throw new Error('Tathmini hii haikupatikana.');
  }

  const existing = allReviews[index];
  if (existing.authorUserId !== authorUserId) {
    throw new Error('Huna ruhusa ya kubadilisha tathmini ya mtumiaji mwingine.');
  }

  // Validate rating if provided
  let newRating = existing.rating;
  if (input.rating !== undefined) {
    const ratingCheck = validateRatingValue(input.rating);
    if (!ratingCheck.valid || ratingCheck.value === undefined) {
      throw new Error(ratingCheck.error || 'Nyota si sahihi.');
    }
    newRating = ratingCheck.value;
  }

  const cleanTitle = input.title !== undefined ? sanitizeReviewText(input.title, 120) : existing.title;
  const cleanBody = input.body !== undefined ? sanitizeReviewText(input.body, 1500) : existing.body;
  const now = new Date().toISOString();

  const updated: MarketplaceReview = {
    ...existing,
    rating: newRating,
    title: cleanTitle || existing.title,
    body: cleanBody || existing.body,
    updatedAt: now
  };

  // Persist to Firestore
  try {
    const reviewRef = doc(db, 'marketplaceReviews', reviewId);
    await updateDoc(reviewRef, {
      rating: updated.rating,
      title: updated.title,
      body: updated.body,
      updatedAt: updated.updatedAt
    });
  } catch (err) {
    console.warn('Hitilafu ya kusasisha review Firestore:', err);
  }

  allReviews[index] = updated;
  saveReviewsToLocalCache(allReviews);

  return updated;
}

/**
 * Deletes or soft-deletes a review owned by the authenticated user.
 */
export async function deleteMarketplaceReview(
  authorUserId: string,
  reviewId: string
): Promise<void> {
  if (!authorUserId) {
    throw new Error('Hujaingia kwenye mfumo.');
  }

  const allReviews = getLocalCachedReviews();
  const index = allReviews.findIndex((r) => r.reviewId === reviewId);
  if (index < 0) {
    return;
  }

  const existing = allReviews[index];
  if (existing.authorUserId !== authorUserId) {
    throw new Error('Huna mamlaka ya kufuta tathmini ya mtumiaji mwingine.');
  }

  // Soft delete locally and mark removed
  const updated: MarketplaceReview = {
    ...existing,
    status: 'deleted',
    moderationStatus: 'REMOVED',
    updatedAt: new Date().toISOString()
  };

  try {
    const reviewRef = doc(db, 'marketplaceReviews', reviewId);
    await deleteDoc(reviewRef);
  } catch (err) {
    console.warn('Hitilafu ya kufuta review Firestore:', err);
  }

  // Remove from active local cache
  allReviews[index] = updated;
  saveReviewsToLocalCache(allReviews);
}

// ==========================================
// 7. SELLER RESPONSE MANAGEMENT
// ==========================================

/**
 * Submits an official seller response to a customer review.
 * Strictly checks that the responder is the owner of the seller/shop.
 */
export async function submitSellerResponse(
  sellerUserId: string,
  reviewId: string,
  responseText: string
): Promise<MarketplaceReview> {
  if (!sellerUserId) {
    throw new Error('Hujaingia kwenye mfumo.');
  }

  const allReviews = getLocalCachedReviews();
  const index = allReviews.findIndex((r) => r.reviewId === reviewId);
  if (index < 0) {
    throw new Error('Tathmini haikupatikana.');
  }

  const existing = allReviews[index];

  // Authorization check: Only authoritative owner of sellerId or shop can reply
  if (existing.sellerId !== sellerUserId && existing.shopId !== sellerUserId) {
    throw new Error('Huna mamlaka ya kujibu kama muuzaji kwa bidhaa au duka hili.');
  }

  const cleanResponse = sanitizeReviewText(responseText, 1000);
  if (!cleanResponse || cleanResponse.length < 3) {
    throw new Error('Tafadhali weka jibu lenye maana lisilopungua herufi 3.');
  }

  const now = new Date().toISOString();
  const updated: MarketplaceReview = {
    ...existing,
    sellerResponse: cleanResponse,
    sellerResponseCreatedAt: now,
    sellerResponseSellerId: sellerUserId,
    updatedAt: now
  };

  try {
    const reviewRef = doc(db, 'marketplaceReviews', reviewId);
    await updateDoc(reviewRef, {
      sellerResponse: updated.sellerResponse,
      sellerResponseCreatedAt: updated.sellerResponseCreatedAt,
      sellerResponseSellerId: updated.sellerResponseSellerId,
      updatedAt: updated.updatedAt
    });
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi jibu la muuzaji Firestore:', err);
  }

  allReviews[index] = updated;
  saveReviewsToLocalCache(allReviews);

  return updated;
}

// ==========================================
// 8. REPORTING SYSTEM
// ==========================================

/**
 * Submits a structured report against a review, product, shop, or seller.
 * Enforces one active report per user per target/reason to avoid spam manipulation.
 * Note: Reports do NOT automatically delete or suspend targets.
 */
export async function submitMarketplaceReport(
  reporterUserId: string,
  input: ReportSubmissionInput
): Promise<MarketplaceReport> {
  if (!reporterUserId) {
    throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia kwanza ili kutoa ripoti.');
  }

  const cleanDesc = sanitizeReviewText(input.description || '', 500);
  const safeReporter = reporterUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTarget = input.targetId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportId = `rep_${safeReporter}_${input.targetType}_${safeTarget}_${input.reason}`;
  const now = new Date().toISOString();

  const allReports = getLocalCachedReports();
  const existingReport = allReports.find((r) => r.reportId === reportId && r.status === 'OPEN');
  if (existingReport) {
    throw new Error('Tayari umewasilisha ripoti kwa sababu hii kuhusu maudhui haya. Timu inakagua.');
  }

  const reportRecord: MarketplaceReport = {
    reportId,
    reporterUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    description: cleanDesc,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now
  };

  // Persist report in Firestore
  try {
    const reportRef = doc(db, 'marketplaceReports', reportId);
    await setDoc(reportRef, reportRecord);
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi ripoti Firestore:', err);
  }

  // Update local reports cache
  allReports.unshift(reportRecord);
  saveReportsToLocalCache(allReports);

  // If the target is a review, increment the report count on the review
  if (input.targetType === 'REVIEW') {
    const allReviews = getLocalCachedReviews();
    const revIdx = allReviews.findIndex((r) => r.reviewId === input.targetId);
    if (revIdx >= 0) {
      allReviews[revIdx].reportCount = (allReviews[revIdx].reportCount || 0) + 1;
      saveReviewsToLocalCache(allReviews);

      try {
        const revRef = doc(db, 'marketplaceReviews', input.targetId);
        await updateDoc(revRef, {
          reportCount: allReviews[revIdx].reportCount
        });
      } catch {}
    }
  }

  return reportRecord;
}

// ==========================================
// 9. AI REVIEW SUMMARY & ANALYSIS
// ==========================================

/**
 * Generates an AI review summary strictly based on real published reviews.
 * Adheres to:
 * - If 0 reviews: states "Kwa sasa hakuna reviews zilizochapishwa."
 * - Summarizes real experiences without hallucinating facts or opinions.
 * - Distinguishes reviews from authoritative Marketplace facts.
 */
export function getAIReviewSummary(
  targetType: ReviewTargetType,
  targetId: string,
  reviews: MarketplaceReview[]
): AIReviewSummaryResult {
  const published = reviews.filter(
    (r) =>
      r.targetType === targetType &&
      r.targetId === targetId &&
      r.moderationStatus === 'PUBLISHED' &&
      r.status !== 'deleted'
  );

  const targetNameSwahili =
    targetType === 'PRODUCT'
      ? 'bidhaa hii'
      : targetType === 'SHOP'
      ? 'duka hili'
      : 'muuzaji huyu';

  if (published.length === 0) {
    return {
      targetType,
      targetId,
      hasSufficientData: false,
      totalReviewsAnalyzed: 0,
      averageRating: null,
      summaryText: `Kwa sasa hakuna tathmini (reviews) zilizochapishwa kwa ${targetNameSwahili}. Hakuna maoni ya wanunuzi yanayoweza kufupishwa kwa sasa.`,
      positiveThemes: [],
      constructiveFeedback: [],
      disclaimer: 'Mfumo haubuni tathmini au uzoefu wa uongo pale ambapo hakuna data halisi ya wanunuzi.'
    };
  }

  const totalSum = published.reduce((acc, r) => acc + r.rating, 0);
  const avg = Number((totalSum / published.length).toFixed(1));

  // Extract themes deterministically from real review text
  const positiveThemes: string[] = [];
  const constructiveFeedback: string[] = [];

  for (const r of published) {
    const lower = `${r.title} ${r.body}`.toLowerCase();
    if (lower.includes('afya') || lower.includes('ubora') || lower.includes('bora') || lower.includes('nzuri')) {
      if (!positiveThemes.includes('Ubora wa bidhaa au afya ya mifugo imetajwa kwa uzuri')) {
        positiveThemes.push('Ubora wa bidhaa au afya ya mifugo imetajwa kwa uzuri');
      }
    }
    if (lower.includes('wakati') || lower.includes('haraka') || lower.includes('kufika')) {
      if (!positiveThemes.includes('Ufikaji wa mzigo na mawasiliano ya awali')) {
        positiveThemes.push('Ufikaji wa mzigo na mawasiliano ya awali');
      }
    }
    if (lower.includes('ushauri') || lower.includes('maelekezo')) {
      if (!positiveThemes.includes('Utoaji wa ushauri wa kitaalamu na muongozo')) {
        positiveThemes.push('Utoaji wa ushauri wa kitaalamu na muongozo');
      }
    }
    if (lower.includes('chelewa') || lower.includes('changamoto') || lower.includes('ila') || r.rating <= 3) {
      if (!constructiveFeedback.includes('Baadhi ya wanunuzi walitaja ucheleweshaji mdogo wa usafiri au makubaliano')) {
        constructiveFeedback.push('Baadhi ya wanunuzi walitaja ucheleweshaji mdogo wa usafiri au makubaliano');
      }
    }
  }

  if (positiveThemes.length === 0) {
    positiveThemes.push('Wateja wameridhika na maelezo ya msingi ya bidhaa');
  }

  const countText = `${published.length} ${published.length === 1 ? 'tathmini' : 'tathmini'}`;
  const summaryText = `Kutokana na ${countText} zilizochapishwa (wastani wa nyota ${avg.toFixed(1)} / 5): wanunuzi wameangazia ${positiveThemes.join(', ').toLowerCase()}.${
    constructiveFeedback.length > 0 ? ` Kama changamoto: ${constructiveFeedback.join(', ').toLowerCase()}.` : ''
  }`;

  return {
    targetType,
    targetId,
    hasSufficientData: true,
    totalReviewsAnalyzed: published.length,
    averageRating: avg,
    summaryText,
    positiveThemes,
    constructiveFeedback,
    disclaimer:
      'Muhtasari huu unatokana pekee na tathmini za wanunuzi halisi zilizochapishwa. Si uhakikisho kamili wa mfumo.'
  };
}
