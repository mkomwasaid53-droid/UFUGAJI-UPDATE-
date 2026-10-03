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
import { ModerationStatus } from '../types/marketplaceModeration';
import { getLocalCachedModerationRecords } from './marketplaceModerationService';
import { checkSellerRestriction, assertSellerNotRestricted } from './sellerGovernanceService';
import { getLocalCachedCategories, findCategoryById } from './marketplaceCategoryService';
import { sellerMonetizationService } from './sellerMonetizationService';
import { SellerSellingEligibility } from '../types/sellerMonetization';

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

  let authoritativeStatus: ModerationStatus =
    authoritativeRecord?.status || (product.moderationStatus as ModerationStatus) || 'NOT_REVIEWED';

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
  } else if (authoritativeStatus === 'UNDER_REVIEW') {
    if (authoritativeProductStatus === 'active') {
      authoritativeProductStatus = 'draft';
    }
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
      authoritativeRecord?.correctionInstructions || product.moderationCorrectionNote
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
  const synced = syncAuthoritativeModerationState(product);
  const modStatus = (synced.moderationStatus as ModerationStatus) || 'NOT_REVIEWED';

  // 1. Check Moderation Status
  const blockedModerationStatuses: ModerationStatus[] = [
    'REJECTED',
    'HIDDEN',
    'SUSPENDED',
    'UNDER_REVIEW',
    'ESCALATED'
  ];
  const isBlockedByModeration = blockedModerationStatuses.includes(modStatus);

  // 2. Check Seller Restrictions (V1.7E)
  const isSellerRestricted = synced.sellerId
    ? checkSellerRestriction(synced.sellerId, 'MARKETPLACE_SELLING').isRestricted
    : false;

  // 3. Check Category Governance Status (V1.7A)
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

  // 4. Check Listing Validation Status (V1.7B)
  const isValidationBlocked =
    synced.validationStatus === 'INVALID' || synced.validationStatus === 'BLOCKED';

  // 5. Check Seller Monetization Eligibility (V1.10A - Section 8 & Corrective)
  // Marketplace visibility = existing listing eligibility AND seller/shop/product validity
  // AND moderation eligibility AND seller governance restrictions AND applicable seller monetization eligibility.
  // Note: Monetization NEVER overrides moderation or trust restrictions.
  let isSellerMonetizationRestricted = false;
  let monetizationEligibility: SellerSellingEligibility | undefined = undefined;
  if (synced.sellerId && options?.checkMonetization !== false) {
    monetizationEligibility = canSellerSellOnMarketplace(synced.sellerId);
    if (!monetizationEligibility.canSell) {
      isSellerMonetizationRestricted = true;
    }
  }

  // 6. Check Active Status
  const isActiveStatus = synced.status === 'active';

  // Combined Eligibility:
  // Must be active, not blocked by moderation, not under restricted seller,
  // in an active category, valid, and monetization-eligible.
  const isEligible =
    isActiveStatus &&
    !isBlockedByModeration &&
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
  } else if (modStatus === 'UNDER_REVIEW') {
    publicUnavailableReason = 'Tangazo hili lipo kwenye ukaguzi wa wasimamizi na halijaidhinishwa bado.';
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
  } else if (modStatus === 'UNDER_REVIEW') {
    sellerNotice =
      'Tangazo lako linakaguliwa na wasimamizi wa soko. Litaonekana sokoni mara tu litakapoidhinishwa.';
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
    publicUnavailableReason,
    sellerNotice
  };
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
  products: MarketplaceProduct[]
): MarketplaceProduct[] {
  if (!Array.isArray(products)) return [];
  return products
    .map(syncAuthoritativeModerationState)
    .filter((p) => isProductMarketplaceEligible(p));
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
    modStatus === 'ESCALATED'
  ) {
    throw new Error(
      `Huwezi kuweka tangazo kuwa ACTIVE kwa sababu limewekewa vikwazo vya kiutawala (${modStatus}). Tafadhali wasilisha rufaa au fanya marekebisho yaliyoagizwa na usubiri idhini ya msimamizi.`
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

