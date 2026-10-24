/**
 * V1.7G — MARKETPLACE GOVERNANCE ENFORCEMENT FOUNDATION
 *
 * Connects Admin Governance Decisions (V1.7D), Seller Restrictions (V1.7E),
 * Category Governance (V1.7A), and Listing Validation (V1.7B) directly to
 * real Marketplace read/write behavior.
 *
 * Core Principle:
 * ADMIN GOVERNANCE DECISION → AUTHORITATIVE STATE → ENFORCEMENT → MARKETPLACE BEHAVIOR
 *
 * Forbidden from public discovery:
 * - REJECTED
 * - HIDDEN
 * - SUSPENDED
 * - UNDER_REVIEW (pending review / correction)
 * - ESCALATED
 * - Seller restricted from MARKETPLACE_SELLING
 * - Category inactive in V1.7A
 * - Listing validation INVALID / BLOCKED in V1.7B
 */

import { MarketplaceProduct, DigitalShop } from '../types/marketplace';
import { ModerationStatus, AIScreeningResult } from '../types/marketplaceModeration';
import { getLocalCachedModerationRecords } from './marketplaceModerationService';
import { checkSellerRestriction, assertSellerNotRestricted } from './sellerGovernanceService';
import { getLocalCachedCategories, findCategoryById } from './marketplaceCategoryService';
import { sellerMonetizationService } from './sellerMonetizationService';
import { SellerSellingEligibility } from '../types/sellerMonetization';
import {
  isScreeningResultUpToDate,
  evaluateListingContentDeterministically
} from './marketplaceAiScreeningService';
import { getSellerTrustStatus } from './sellerTrustService';

export interface ShopGovernanceEligibility {
  isEligible: boolean;
  isSellerRestricted: boolean;
  isSellerMonetizationRestricted: boolean;
  monetizationEligibility: SellerSellingEligibility;
  publicUnavailableReason?: string;
}

export interface ProductGovernanceEligibility {
  isEligible: boolean; // True only if product can be discovered/bought by regular buyers
  isBlockedByModeration: boolean;
  moderationStatus: ModerationStatus;
  isSellerRestricted: boolean;
  isCategoryInactive: boolean;
  isValidationBlocked: boolean;
  isSellerMonetizationRestricted?: boolean;
  monetizationEligibility?: SellerSellingEligibility;
  isAiScreeningPassed?: boolean;
  isAiScreeningFresh?: boolean;
  isSellerTrustIneligible?: boolean;
  publicUnavailableReason?: string;
  sellerNotice?: string;
}

/**
 * Synchronizes a MarketplaceProduct with the authoritative moderation record
 * stored in the moderation engine and checks for seller restrictions.
 */
export function syncAuthoritativeModerationState(product: MarketplaceProduct): MarketplaceProduct {
  if (!product || !product.productId) return product;

  const records = getLocalCachedModerationRecords();
  const authoritativeRecord = records.find(
    (r) => r.productId === product.productId || r.targetId === product.productId
  );

  const screening = authoritativeRecord?.aiScreening || product.aiScreening;

  let authoritativeStatus: ModerationStatus =
    authoritativeRecord?.status || (product.moderationStatus as ModerationStatus) || 'NOT_REVIEWED';

  // If authoritativeRecord was PENDING_REVIEW, but product was actually updated to APPROVED by trusted seller auto-pass, check if it should be reconciled
  if (
    authoritativeRecord &&
    authoritativeRecord.status === 'PENDING_REVIEW' &&
    product.moderationStatus === 'APPROVED' &&
    screening?.status === 'PASS' &&
    isScreeningResultUpToDate(product, screening)
  ) {
    authoritativeStatus = 'APPROVED';
  }

  // RULE 1: An AI BLOCK must NEVER be overridden by previous approval or seller trust.
  // If the listing received an AI BLOCK, its authoritative status MUST be REJECTED.
  if (screening?.status === 'BLOCK') {
    authoritativeStatus = 'REJECTED';
  }

  // RULE 2: Content edit invalidation and screening freshness enforcement.
  // If content changed (isScreeningResultUpToDate is false) or screening is missing, an old APPROVED status is INVALID.
  // It cannot authorize public visibility; effective status falls back to PENDING_REVIEW.
  if (authoritativeStatus === 'APPROVED') {
    if (!screening || !screening.contentFingerprint) {
      authoritativeStatus = 'PENDING_REVIEW';
    } else {
      const isFresh = isScreeningResultUpToDate(product, screening);
      if (!isFresh) {
        authoritativeStatus = 'PENDING_REVIEW';
      }
    }
  }

  // Check seller-level selling restriction (V1.7E)
  const sellerId = product.sellerId;
  const sellerRestriction = sellerId
    ? checkSellerRestriction(sellerId, 'MARKETPLACE_SELLING')
    : { isRestricted: false };

  // If the moderation record or seller restriction dictates inactivity:
  let authoritativeProductStatus = product.status;
  if (
    authoritativeStatus === 'REJECTED' ||
    authoritativeStatus === 'HIDDEN' ||
    authoritativeStatus === 'SUSPENDED'
  ) {
    authoritativeProductStatus = 'inactive';
  } else if (authoritativeStatus === 'UNDER_REVIEW' || authoritativeStatus === 'PENDING_REVIEW') {
    if (authoritativeProductStatus === 'active') {
      authoritativeProductStatus = 'inactive';
    }
  } else if (authoritativeStatus === 'DRAFT') {
    authoritativeProductStatus = 'draft';
  } else if (sellerRestriction.isRestricted && authoritativeProductStatus === 'active') {
    authoritativeProductStatus = 'inactive';
  }

  return {
    ...product,
    status: authoritativeProductStatus,
    moderationStatus: authoritativeStatus,
    moderationId: authoritativeRecord?.moderationId || product.moderationId,
    moderatedAt: authoritativeRecord?.reviewedAt || product.moderatedAt,
    moderatedBy: authoritativeRecord?.reviewedByUserId || product.moderatedBy,
    moderationReasonCode: authoritativeRecord?.reasonCode || product.moderationReasonCode,
    moderationPublicReason:
      authoritativeRecord?.publicExplanation || product.moderationPublicReason,
    moderationCorrectionNote:
      authoritativeRecord?.correctionInstructions || product.moderationCorrectionNote,
    aiScreening: screening,
    aiScreenedAt: screening?.timestamp || product.aiScreenedAt
  };
}

/**
 * Evaluates whether a product is eligible for public Marketplace discovery
 * and returns comprehensive governance diagnostics.
 */
export function evaluateProductMarketplaceEligibility(
  product: MarketplaceProduct,
  options?: { checkMonetization?: boolean }
): ProductGovernanceEligibility {
  if (!product || !product.productId) {
    return {
      isEligible: false,
      isBlockedByModeration: true,
      moderationStatus: 'NOT_REVIEWED',
      isSellerRestricted: false,
      isCategoryInactive: false,
      isValidationBlocked: false,
      publicUnavailableReason: 'Tangazo halikupatikana.'
    };
  }

  const synced = syncAuthoritativeModerationState(product);
  const modStatus = (synced?.moderationStatus as ModerationStatus) || 'NOT_REVIEWED';

  // 1. Check Moderation Status: Only APPROVED or RESTORED are permitted in public feeds
  const blockedModerationStatuses: ModerationStatus[] = [
    'REJECTED',
    'HIDDEN',
    'SUSPENDED',
    'PENDING_REVIEW',
    'UNDER_REVIEW',
    'DRAFT',
    'NOT_REVIEWED',
    'ESCALATED'
  ];
  let isBlockedByModeration =
    blockedModerationStatuses.includes(modStatus) ||
    (modStatus !== 'APPROVED' && modStatus !== 'RESTORED');

  // 2. Check AI Screening: Must be current PASS for exact listing content fingerprint
  // (Section 3 & Section 5: AI Screening Freshness)
  let isAiScreeningPassed = false;
  let isAiScreeningFresh = false;
  let screeningDiagnostics = '';

  const screening = synced.aiScreening;
  if (screening) {
    if (screening.status === 'PASS') {
      isAiScreeningPassed = true;
    } else if (screening.status === 'BLOCK') {
      isAiScreeningPassed = false;
      isBlockedByModeration = true;
      screeningDiagnostics = 'Tangazo limezuiwa na mfumo wa AI kwa kukiuka sera za usalama na maudhui.';
    } else {
      isAiScreeningPassed = false;
      screeningDiagnostics = `Ukaguzi wa AI una hadhi ya ${screening.status}`;
    }

    if (screening.contentFingerprint) {
      const isFresh = isScreeningResultUpToDate(synced, screening);
      if (isFresh) {
        isAiScreeningFresh = true;
      } else {
        isAiScreeningFresh = false;
        isBlockedByModeration = true;
        screeningDiagnostics = 'Maudhui ya tangazo yamebadilika na yanahitaji ukaguzi mpya wa AI.';
      }
    } else {
      isAiScreeningFresh = isAiScreeningPassed;
    }
  } else {
    // Deterministic fallback evaluation for listings without existing screening record
    const evalResult = evaluateListingContentDeterministically({
      productId: synced.productId,
      sellerId: synced.sellerId,
      title: synced.title,
      description: synced.description,
      category: synced.category || synced.categoryId || '',
      subcategory: synced.subcategory || synced.subcategoryId || '',
      price: synced.price,
      images: synced.images || (synced.imageUrl ? [{ url: synced.imageUrl }] : [])
    });
    if (evalResult.status === 'PASS') {
      isAiScreeningPassed = true;
      isAiScreeningFresh = true;
    } else {
      isAiScreeningPassed = false;
      isAiScreeningFresh = false;
      screeningDiagnostics = `Ukaguzi wa maudhui umehitaji ukaguzi wa kiutawala (${evalResult.status})`;
    }
  }

  // 3. Check Seller Trust Policy (Section 6)
  // - NEW_SELLER: AI PASS still requires administrator review and approval (modStatus === 'APPROVED').
  // - TRUSTED_SELLER: AI PASS permits publication when all other publishing conditions satisfied.
  // - RESTRICTED_SELLER: active restriction policy blocks publication.
  const sellerTrust = synced.sellerId ? getSellerTrustStatus(synced.sellerId) : 'NEW_SELLER';
  let isSellerTrustIneligible = false;
  if (sellerTrust === 'RESTRICTED_SELLER') {
    isSellerTrustIneligible = true;
  } else if (sellerTrust === 'NEW_SELLER' && modStatus !== 'APPROVED' && modStatus !== 'RESTORED') {
    isSellerTrustIneligible = true;
  }

  // 4. Check Seller Restrictions (V1.7E)
  const isSellerRestricted = synced.sellerId
    ? checkSellerRestriction(synced.sellerId, 'MARKETPLACE_SELLING').isRestricted
    : false;

  // 5. Check Category Governance Status (V1.7A)
  let isCategoryInactive = false;
  try {
    const categories = getLocalCachedCategories();
    const catId = synced.categoryId || synced.category;
    if (catId) {
      const cat = findCategoryById(catId, categories);
      if (cat && cat.status !== 'ACTIVE') {
        isCategoryInactive = true;
      }
    }
  } catch {}

  // 6. Check Listing Validation Status (V1.7B)
  const isValidationBlocked =
    synced.validationStatus === 'INVALID' || synced.validationStatus === 'BLOCKED';

  // 7. Check Seller Monetization Eligibility (V1.10A - Section 8 & Corrective)
  let isSellerMonetizationRestricted = false;
  let monetizationEligibility: SellerSellingEligibility | undefined = undefined;
  if (synced.sellerId && options?.checkMonetization !== false) {
    monetizationEligibility = canSellerSellOnMarketplace(synced.sellerId);
    if (!monetizationEligibility.canSell) {
      isSellerMonetizationRestricted = true;
    }
  }

  // 8. Check Active Status
  const isActiveStatus = synced.status === 'active';

  // Combined Eligibility:
  // Must be active, moderation APPROVED, AI screening PASS & fresh,
  // seller trust eligible, not restricted, category active, valid, and monetization-eligible.
  const isEligible =
    isActiveStatus &&
    !isBlockedByModeration &&
    isAiScreeningPassed &&
    isAiScreeningFresh &&
    !isSellerTrustIneligible &&
    !isSellerRestricted &&
    !isCategoryInactive &&
    !isValidationBlocked &&
    !isSellerMonetizationRestricted;

  let publicUnavailableReason =
    'Tangazo hili halipatikani kwa sasa sokoni kwa sababu za kiutawala, usalama au ukaguzi wa kimfumo.';
  if (modStatus === 'REJECTED') {
    publicUnavailableReason = 'Tangazo hili limeondolewa sokoni kufuatia ukaguzi wa wasimamizi.';
  } else if (modStatus === 'HIDDEN') {
    publicUnavailableReason = 'Tangazo hili limefichwa kwa sasa na msimamizi wa mfumo.';
  } else if (modStatus === 'SUSPENDED') {
    publicUnavailableReason = 'Tangazo hili limesimamishwa kwa muda kwa sababu za kiutawala au usalama.';
  } else if (modStatus === 'PENDING_REVIEW' || modStatus === 'UNDER_REVIEW') {
    publicUnavailableReason = 'Tangazo hili linasubiri idhini na ukaguzi wa wasimamizi kabla ya kuonekana sokoni.';
  } else if (modStatus === 'DRAFT') {
    publicUnavailableReason = 'Tangazo hili bado ni Rasimu (Draft) na halijachapishwa sokoni.';
  } else if (!isAiScreeningPassed || !isAiScreeningFresh) {
    publicUnavailableReason =
      screeningDiagnostics || 'Tangazo hili linasubiri ukaguzi wa kiusalama wa maudhui.';
  } else if (isSellerTrustIneligible && sellerTrust === 'RESTRICTED_SELLER') {
    publicUnavailableReason = 'Huduma za muuzaji huyu zimesitishwa kwa muda kwa mujibu wa sera za soko.';
  } else if (isSellerRestricted) {
    publicUnavailableReason = 'Huduma za muuzaji huyu zimesitishwa kwa muda kwa mujibu wa sera za soko.';
  } else if (isCategoryInactive) {
    publicUnavailableReason = 'Kundi la tangazo hili limesitishwa au halipatikani kwa sasa.';
  } else if (isSellerMonetizationRestricted) {
    publicUnavailableReason =
      monetizationEligibility?.reasonSwahili || 'Usajili wa muuzaji umekwisha au haujaamilishwa sokoni.';
  }

  let sellerNotice = '';
  if (modStatus === 'REJECTED') {
    sellerNotice =
      'Tangazo lako limekataliwa na wasimamizi. Unaweza kufanya marekebisho yaliyoagizwa au kuwasilisha rufaa.';
  } else if (modStatus === 'HIDDEN') {
    sellerNotice = 'Tangazo lako limefichwa na wasimamizi wa soko.';
  } else if (modStatus === 'SUSPENDED') {
    sellerNotice =
      'Tangazo hili limesimamishwa na wasimamizi. Huwezi kuliwasha hadi masuala ya kiutawala yatakapotatuliwa.';
  } else if (modStatus === 'PENDING_REVIEW' || modStatus === 'UNDER_REVIEW') {
    sellerNotice =
      'Tangazo lako linasubiri ukaguzi na idhini ya msimamizi. Litaonekana sokoni mara tu litakapoidhinishwa.';
  } else if (modStatus === 'DRAFT') {
    sellerNotice = 'Tangazo hili bado ni rasimu (Draft).';
  } else if (!isAiScreeningPassed || !isAiScreeningFresh) {
    sellerNotice =
      screeningDiagnostics || 'Tangazo lako linahitaji ukaguzi wa kiusalama wa maudhui kabla ya kuonekana hadharani.';
  } else if (isSellerMonetizationRestricted) {
    sellerNotice =
      monetizationEligibility?.reasonSwahili || 'Usajili wa muuzaji unahitaji kuamilishwa au kufanywa upya.';
  }

  return {
    isEligible,
    isBlockedByModeration,
    moderationStatus: modStatus,
    isSellerRestricted,
    isCategoryInactive,
    isValidationBlocked,
    isSellerMonetizationRestricted,
    monetizationEligibility,
    isAiScreeningPassed,
    isAiScreeningFresh,
    isSellerTrustIneligible,
    publicUnavailableReason,
    sellerNotice
  };
}

/**
 * Strips internal administrative, private moderation notes, correction instructions,
 * reporter links, and reviewer IDs from product payloads delivered to ordinary buyers.
 */
export function sanitizeProductForPublic<T extends MarketplaceProduct>(product: T): T {
  if (!product) return product;
  const sanitized = { ...product };
  delete (sanitized as any).internalNote;
  delete (sanitized as any).internalNotes;
  delete (sanitized as any).privateModerationNote;
  delete (sanitized as any).adminNotes;
  delete sanitized.moderationCorrectionNote;
  delete (sanitized as any).relatedReportId;
  delete (sanitized as any).reportIds;
  delete (sanitized as any).reports;
  delete (sanitized as any).reviewedByUserId;
  delete (sanitized as any).reviewedBy;
  delete (sanitized as any).moderationRecord;
  delete (sanitized as any).adminReviewHistory;
  if (sanitized.aiScreening) {
    sanitized.aiScreening = {
      screeningId: sanitized.aiScreening.screeningId,
      status: sanitized.aiScreening.status,
      confidence: sanitized.aiScreening.confidence,
      policyVersion: sanitized.aiScreening.policyVersion,
      timestamp: sanitized.aiScreening.timestamp || (sanitized.aiScreening as any).screenedAt
    } as any;
  }
  return sanitized;
}

/**
 * Deterministic helper to evaluate whether a seller can commercially sell on Marketplace.
 * Section 8 requirement.
 */
export function canSellerSellOnMarketplace(sellerId: string): SellerSellingEligibility {
  return sellerMonetizationService.canSellerSellOnMarketplace(sellerId);
}

/**
 * Returns true if a product is strictly eligible for public discovery.
 */
export function isProductMarketplaceEligible(product: MarketplaceProduct): boolean {
  return evaluateProductMarketplaceEligibility(product).isEligible;
}

/**
 * Filters an array of products, ensuring ONLY authoritatively eligible products
 * are returned for public Marketplace discovery, search, AI, or recommendations.
 */
export function filterMarketplaceEligibleProducts(
  products: MarketplaceProduct[],
  options?: { sanitize?: boolean }
): MarketplaceProduct[] {
  if (!Array.isArray(products)) return [];
  const eligible = products
    .map(syncAuthoritativeModerationState)
    .filter((p) => isProductMarketplaceEligible(p));

  if (options?.sanitize) {
    return eligible.map((p) => sanitizeProductForPublic(p));
  }
  return eligible;
}

/**
 * Asserts that a seller or listing can be activated or modified to 'active'.
 * Throws a clear, informative error if blocked by governance.
 */
export function assertListingCanBeActivated(
  product: MarketplaceProduct,
  sellerId: string,
  isAdmin: boolean = false
): void {
  if (isAdmin) return; // Admins are governed by moderation actions

  const cleanSellerId = sellerId?.trim();
  if (cleanSellerId) {
    assertSellerNotRestricted(cleanSellerId, 'MARKETPLACE_SELLING');
    assertSellerNotRestricted(cleanSellerId, 'LISTING_EDITING');
  }

  const synced = syncAuthoritativeModerationState(product);
  const modStatus = (synced.moderationStatus as ModerationStatus) || 'NOT_REVIEWED';

  if (
    modStatus === 'REJECTED' ||
    modStatus === 'HIDDEN' ||
    modStatus === 'SUSPENDED' ||
    modStatus === 'UNDER_REVIEW' ||
    modStatus === 'PENDING_REVIEW' ||
    modStatus === 'DRAFT' ||
    modStatus === 'ESCALATED' ||
    (modStatus !== 'APPROVED' && modStatus !== 'RESTORED')
  ) {
    throw new Error(
      `Huwezi kuweka tangazo kuwa ACTIVE kwa sababu linahitaji idhini ya msimamizi (${modStatus}). Tafadhali wasilisha tangazo kwa ukaguzi (PENDING_REVIEW) na usubiri idhini ya msimamizi.`
    );
  }
}

/**
 * Evaluates whether a digital shop is authoritatively eligible for public discovery.
 * Section 7 requirement:
 * Public shop eligibility requires:
 * - Shop exists
 * - Seller monetization is TRIAL_ACTIVE or ACTIVE
 * - Seller is not administratively suspended/restricted
 * - Seller/shop/product governance is valid
 *
 * Therefore:
 * NOT_ACTIVATED -> private/not live
 * GRACE_PERIOD -> private/not live
 * EXPIRED -> private/not live
 * SUSPENDED -> private/not live
 */
export function evaluateShopMarketplaceEligibility(
  shop: DigitalShop | null | undefined
): ShopGovernanceEligibility {
  if (!shop || !shop.sellerId) {
    return {
      isEligible: false,
      isSellerRestricted: false,
      isSellerMonetizationRestricted: true,
      monetizationEligibility: sellerMonetizationService.canSellerSellOnMarketplace(''),
      publicUnavailableReason: 'Taarifa za duka hazipatikani.'
    };
  }

  const isExplicitlyDraft = shop.isPublished === false;
  const sellerRestricted = checkSellerRestriction(shop.sellerId, 'MARKETPLACE_SELLING').isRestricted;
  const monetizationEligibility = canSellerSellOnMarketplace(shop.sellerId);
  const isSellerMonetizationRestricted = !monetizationEligibility.canSell;

  const isEligible = !isExplicitlyDraft && !sellerRestricted && !isSellerMonetizationRestricted;

  let publicUnavailableReason = '';
  if (isExplicitlyDraft) {
    publicUnavailableReason = 'Duka hili bado lipo kwenye maandalizi (Draft) na halijawekwa hewani na muuzaji.';
  } else if (sellerRestricted) {
    publicUnavailableReason = 'Huduma za duka hili zimesitishwa kwa muda kwa mujibu wa sera za usimamizi wa soko.';
  } else if (isSellerMonetizationRestricted) {
    publicUnavailableReason =
      monetizationEligibility.reasonSwahili || 'Usajili wa muuzaji haujaamilishwa au umekwisha.';
  }

  return {
    isEligible,
    isSellerRestricted: sellerRestricted,
    isSellerMonetizationRestricted,
    monetizationEligibility,
    publicUnavailableReason
  };
}

/**
 * Returns true if a shop is strictly eligible to be discovered publicly on Marketplace.
 */
export function isShopMarketplaceEligible(shop: DigitalShop | null | undefined): boolean {
  return evaluateShopMarketplaceEligibility(shop).isEligible;
}

