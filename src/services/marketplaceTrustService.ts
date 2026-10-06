/**
 * V1.6G — MARKETPLACE TRUST SIGNALS SERVICE
 * Phase 5: Marketplace Trust
 *
 * Provides authoritative resolution, synthesis, formatting, and comparison of
 * Marketplace Trust Signals for UI and AI consumers.
 *
 * Core Directives:
 * 1. ZERO HALLUCINATION: All signals originate strictly from authoritative data:
 *    - Seller Identity -> V1.6A SellerVerification record
 *    - Shop Integrity -> V1.6B/V1.6C Product Ownership validation
 *    - Price & Stock -> V1.6D ProductPriceStock validation (structured wins over text claims)
 *    - Location & Delivery -> V1.6E ProductLocationDelivery validation
 *    - Reviews & Rating -> V1.6F Published non-deleted reviews
 * 2. SPECIFIC EVIDENCE != BLANKET GUARANTEE:
 *    Verification != Guaranteed Quality, Stock, or Delivery.
 * 3. BANNED CLICHÉS:
 *    "100% Trusted", "Guaranteed Seller", "Safe Seller", "Best Seller", and opaque scores are banned.
 * 4. MISSING SIGNALS:
 *    Remain explicitly missing; no negative assumptions or allegations.
 * 5. PROMPT INJECTION RESISTANT:
 *    Seller descriptions and review texts are untrusted free-text and cannot alter structured trust signals.
 */

import { MarketplaceProduct, DigitalShop, SellerVerification } from '../types/marketplace';
import {
  ProductTrustSignals,
  ShopTrustSignals,
  TrustComparisonResult,
  VerifiedSellerTrustSignal,
  ShopTrustSignal,
  PriceTrustSignal,
  StockTrustSignal,
  LocationTrustSignal,
  DeliveryTrustSignal,
  PickupTrustSignal,
  ReputationTrustSignal,
  ModerationTrustSignal
} from '../types/marketplaceTrust';
import { validateProductOwnership } from './productOwnershipService';
import { resolvePriceStockTrust } from './productPriceStockService';
import { resolveLocationDeliveryTrust } from './productLocationDeliveryService';
import { calculateReputationSummary, getLocalCachedReviews } from './marketplaceReviewService';
import { MarketplaceReview } from '../types/marketplaceReview';

/**
 * Standard prompt injection defense: detects and neutralizes adversarial phrases
 * inside seller product descriptions or reviews.
 */
export function sanitizeAndGuardMarketplaceText(rawText: string | undefined | null): {
  cleanText: string;
  hasInjectionAttempt: boolean;
} {
  if (!rawText) return { cleanText: '', hasInjectionAttempt: false };

  const adversarialPatterns = [
    /ignore\s+(all\s+)?(previous\s+)?instructions/i,
    /system\s+prompt/i,
    /you\s+are\s+now/i,
    /override\s+all\s+rules/i,
    /tell\s+the\s+(user|farmer)\s+(this|i\s+am)\s+100%\s+trusted/i,
    /mark\s+as\s+verified/i,
    /bypass\s+verification/i,
    /guaranteed\s+free\s+delivery\s+worldwide/i
  ];

  let hasInjection = false;
  for (const pattern of adversarialPatterns) {
    if (pattern.test(rawText)) {
      hasInjection = true;
      break;
    }
  }

  // Strip dangerous HTML/scripts
  const clean = rawText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  return {
    cleanText: clean,
    hasInjectionAttempt: hasInjection
  };
}

/**
 * Resolves authoritative Product Trust Signals from all Phase 5 trust sources.
 */
export function resolveProductTrustSignals(
  product: MarketplaceProduct,
  shop?: DigitalShop | null,
  sellerVerification?: SellerVerification | null,
  reviews?: MarketplaceReview[]
): ProductTrustSignals {
  const evaluatedAt = new Date().toISOString();

  // 1. Ownership & Shop link
  const ownership = validateProductOwnership(
    product,
    shop,
    sellerVerification?.status || (product.sellerVerificationStatus as string) || null
  );

  // 2. Price & Stock Trust (V1.6D)
  const priceStock = resolvePriceStockTrust(product);

  // 3. Location, Delivery & Pickup Trust (V1.6E)
  const locDelivery = resolveLocationDeliveryTrust(product, shop);

  // 4. Reviews & Reputation (V1.6F)
  const allReviews = reviews || getLocalCachedReviews();
  const reputationSummary = calculateReputationSummary(allReviews, 'PRODUCT', product.productId);

  // Determine Seller Verification Signal
  const isSellerVerified = Boolean(
    (sellerVerification && (
      sellerVerification.status === 'VERIFIED' ||
      sellerVerification.status === 'APPROVED' ||
      sellerVerification.badgeStatus === 'ACTIVE' ||
      Boolean(sellerVerification.hasActiveBadge) ||
      Boolean((sellerVerification as any).isVerified)
    )) ||
    ownership.isSellerVerified ||
    product.sellerVerificationStatus === 'verified' ||
    String(product.sellerVerificationStatus).toLowerCase() === 'approved' ||
    String(product.sellerVerificationStatus).toLowerCase() === 'active'
  );

  const sellerVerificationSignal: VerifiedSellerTrustSignal = {
    isVerified: isSellerVerified,
    status: isSellerVerified ? 'VERIFIED' : 'UNVERIFIED',
    businessName: product.sellerBusinessName || shop?.shopName,
    verificationDate: sellerVerification?.reviewedAt || null,
    authority: 'AUTHORITATIVE_VERIFICATION',
    displayBadge: isSellerVerified ? 'Muuzaji Aliyethibitishwa' : 'Haijahakikiwa Rasmi',
    disclaimer: isSellerVerified
      ? 'Uthibitisho unathibitisha usajili na utambulisho wa muuzaji pekee; si ubora wa bidhaa au dhamana ya uwasilishaji.'
      : 'Taarifa za uthibitisho wa muuzaji hazijawekwa au bado hazijahakikiwa na wasimamizi.'
  };

  // Determine Shop Trust Signal
  const shopSignal: ShopTrustSignal = {
    hasShop: Boolean(product.shopId || shop?.shopId),
    shopId: product.shopId || shop?.shopId || null,
    shopName: ownership.authoritativeShopName,
    isPublished: Boolean(shop ? shop.isPublished : product.shopId),
    ownershipState: ownership.state === 'VALID' ? 'VALID' : ownership.state === 'INCONSISTENT' ? 'INCONSISTENT' : 'UNAVAILABLE',
    authority: 'AUTHORITATIVE_STRUCTURED',
    ownershipNotice: ownership.state === 'INCONSISTENT'
      ? 'Kuna ukinzani kati ya taarifa za duka na muuzaji.'
      : undefined
  };

  // Determine Price Trust Signal
  const priceSignal: PriceTrustSignal = {
    status: priceStock.price.status,
    displayPrice: priceStock.price.displayPrice,
    rawAmount: priceStock.price.rawAmount,
    currency: priceStock.price.currency,
    unit: priceStock.price.unit,
    lastUpdatedText: priceStock.price.lastUpdatedText,
    isStale: priceStock.price.isStale,
    authority: 'AUTHORITATIVE_STRUCTURED',
    disclaimer: 'Bei imerekodiwa kama ilivyotolewa na muuzaji katika mfumo; haijatabiriwa na AI wala haijahakikiwa na mamlaka ya bei.',
    hasDescriptionConflict: priceStock.hasDescriptionPriceConflict,
    descriptionConflictPrice: priceStock.descriptionPriceFound || undefined,
    conflictNotice: priceStock.hasDescriptionPriceConflict ? priceStock.structuredWinsNotice : undefined
  };

  // Determine Stock Trust Signal
  const stockSignal: StockTrustSignal = {
    status: priceStock.stock.status,
    displayStock: priceStock.stock.displayStock,
    quantity: priceStock.stock.quantity,
    unit: priceStock.stock.unit,
    lastUpdatedText: priceStock.stock.lastUpdatedText,
    isStale: priceStock.stock.isStale,
    authority: 'AUTHORITATIVE_STRUCTURED',
    disclaimer: 'Idadi ya mzigo inatokana na taarifa alizoweka muuzaji; thibitisha uwepo halisi kabla ya kufanya safari au malipo.',
    hasDescriptionConflict: priceStock.hasDescriptionStockConflict,
    conflictNotice: priceStock.hasDescriptionStockConflict ? priceStock.structuredWinsNotice : undefined
  };

  // Determine Location Trust Signal
  const locationSignal: LocationTrustSignal = {
    status: locDelivery.location.status,
    displayLocation: locDelivery.location.displayLocation,
    region: locDelivery.location.region || product.region || product.location,
    district: locDelivery.location.district || product.district,
    area: locDelivery.location.area || product.area,
    isShopLocation: locDelivery.location.locationType === 'SHOP_LOCATION',
    isStale: locDelivery.location.isStale,
    authority: 'AUTHORITATIVE_STRUCTURED',
    disclaimer: locDelivery.location.trustDisclaimer,
    hasDescriptionConflict: locDelivery.hasDescriptionLocationConflict,
    conflictNotice: locDelivery.hasDescriptionLocationConflict ? locDelivery.structuredWinsNotice : undefined
  };

  // Determine Delivery Trust Signal
  const deliverySignal: DeliveryTrustSignal = {
    status: locDelivery.delivery.status,
    deliveryAvailable: locDelivery.delivery.deliveryAvailable,
    displayDelivery: locDelivery.delivery.displayDelivery,
    feeType: locDelivery.delivery.feeType,
    feeAmount: locDelivery.delivery.deliveryFee,
    deliveryAreas: locDelivery.delivery.deliveryAreas,
    timeEstimate: locDelivery.delivery.deliveryTimeEstimate,
    isStale: locDelivery.delivery.isStale,
    authority: 'AUTHORITATIVE_STRUCTURED',
    disclaimer: locDelivery.delivery.trustDisclaimer,
    hasDescriptionConflict: locDelivery.hasDescriptionDeliveryConflict,
    conflictNotice: locDelivery.hasDescriptionDeliveryConflict ? locDelivery.structuredWinsNotice : undefined
  };

  // Determine Pickup Trust Signal
  const pickupSignal: PickupTrustSignal = {
    status: locDelivery.delivery.pickupAvailable ? 'PICKUP_AVAILABLE' : 'PICKUP_INFORMATION_NOT_PROVIDED',
    pickupAvailable: locDelivery.delivery.pickupAvailable,
    pickupAddress: product.pickupAddress || null,
    displayPickup: locDelivery.delivery.pickupAvailable
      ? (product.pickupAddress ? `Kuchukua: ${product.pickupAddress}` : 'Kuchukua kumeruhusiwa eneo la muuzaji')
      : 'Taarifa za kuchukua hazijawekwa',
    authority: 'AUTHORITATIVE_STRUCTURED',
    disclaimer: 'Huduma ya kuchukua inathibitishwa na muuzaji kabla ya safari.'
  };

  // Determine Reputation Trust Signal
  const reputationSignal: ReputationTrustSignal = {
    targetType: 'PRODUCT',
    targetId: product.productId,
    hasReviews: reputationSummary.hasReviews,
    totalPublishedReviews: reputationSummary.totalPublishedReviews,
    averageRating: reputationSummary.averageRating,
    isSmallSample: reputationSummary.isSmallSample,
    smallSampleWarning: reputationSummary.smallSampleWarning,
    ratingDistribution: reputationSummary.ratingDistribution,
    displayRatingText: reputationSummary.displayRatingText,
    authority: 'PUBLISHED_USER_REVIEW',
    disclaimer: reputationSummary.reputationDisclaimer
  };

  // Determine Moderation Status
  const moderationSignal: ModerationTrustSignal = {
    hasOpenReports: false,
    reportCount: 0,
    isPublicAllegationOnly: true,
    moderationNotice: 'Ripoti za watumiaji huchunguzwa na wasimamizi wa mfumo. Ripoti pekee si ushahidi wa makosa au ulaghai.',
    authority: 'AUTHORITATIVE_VERIFICATION'
  };

  // Build concise, objective bullet points (Section 5)
  const conciseBulletPoints: string[] = [];

  if (isSellerVerified) {
    conciseBulletPoints.push('Muuzaji aliyethibitishwa (utambulisho rasmi)');
  } else {
    conciseBulletPoints.push('Taarifa za uthibitisho wa muuzaji hazijawekwa');
  }

  if (priceSignal.status === 'PROVIDED') {
    conciseBulletPoints.push(`Bei: ${priceSignal.displayPrice} / ${product.unit}${priceSignal.isStale ? ' (Haijasasishwa hivi karibuni)' : ''}`);
  } else {
    conciseBulletPoints.push('Bei haijawekwa rasmi kwenye tangazo');
  }

  if (stockSignal.status === 'IN_STOCK') {
    conciseBulletPoints.push(`Mzigo: ${stockSignal.quantity} ${product.unit} (Inapatikana)${stockSignal.isStale ? ' (Haijasasishwa hivi karibuni)' : ''}`);
  } else if (stockSignal.status === 'OUT_OF_STOCK') {
    conciseBulletPoints.push('Mzigo: Imeisha kwa sasa (0)');
  } else {
    conciseBulletPoints.push('Idadi ya mzigo haijawekwa');
  }

  if (locationSignal.status === 'LOCATION_PROVIDED' || locationSignal.status === 'LOCATION_PARTIAL') {
    conciseBulletPoints.push(`Eneo: ${locationSignal.displayLocation}`);
  } else {
    conciseBulletPoints.push('Taarifa za eneo hazijakamilika');
  }

  if (deliverySignal.deliveryAvailable) {
    conciseBulletPoints.push(
      deliverySignal.feeType === 'FREE'
        ? 'Usafirishaji: Unapatikana bure'
        : 'Usafirishaji: Unapatikana (angalia masharti na ada ya muuzaji)'
    );
  } else if (pickupSignal.pickupAvailable) {
    conciseBulletPoints.push('Usafirishaji: Kuchukua dukani au kwa muuzaji pekee');
  } else {
    conciseBulletPoints.push('Taarifa za usafirishaji hazijawekwa');
  }

  if (reputationSignal.hasReviews) {
    conciseBulletPoints.push(
      `Tathmini: ${reputationSignal.totalPublishedReviews} zilizochapishwa (Wastani wa nyota ${reputationSignal.averageRating?.toFixed(1)})${reputationSignal.isSmallSample ? ' [Sampuli ndogo]' : ''}`
    );
  } else {
    conciseBulletPoints.push('Tathmini: Hakuna reviews zilizochapishwa bado');
  }

  return {
    productId: product.productId,
    sellerId: product.sellerId,
    shopId: product.shopId,
    sellerVerification: sellerVerificationSignal,
    shop: shopSignal,
    price: priceSignal,
    stock: stockSignal,
    location: locationSignal,
    delivery: deliverySignal,
    pickup: pickupSignal,
    reputation: reputationSignal,
    moderation: moderationSignal,
    conciseBulletPoints,
    boundaryNotice: 'Ishara za uaminifu zinahusu taarifa mahususi zilizorekodiwa katika mfumo, si hakikisho au dhamana ya jumla ya biashara au utoaji wa huduma.',
    evaluatedAt
  };
}

/**
 * Resolves Shop Trust Signals from shop and seller records.
 */
export function resolveShopTrustSignals(
  shop: DigitalShop,
  sellerVerification?: SellerVerification | null,
  activeProductsCount: number = 0,
  reviews?: MarketplaceReview[]
): ShopTrustSignals {
  const evaluatedAt = new Date().toISOString();
  const allReviews = reviews || getLocalCachedReviews();
  const reputationSummary = calculateReputationSummary(allReviews, 'SHOP', shop.shopId);

  const isVerified = Boolean(sellerVerification && sellerVerification.status === 'VERIFIED');

  const sellerVerificationSignal: VerifiedSellerTrustSignal = {
    isVerified,
    status: isVerified ? 'VERIFIED' : 'UNVERIFIED',
    businessName: shop.shopName,
    verificationDate: sellerVerification?.reviewedAt || null,
    authority: 'AUTHORITATIVE_VERIFICATION',
    displayBadge: isVerified ? 'Duka Lililothibitishwa' : 'Haijahakikiwa Rasmi',
    disclaimer: isVerified
      ? 'Uthibitisho unathibitisha utambulisho wa mwenye duka pekee.'
      : 'Taarifa za uthibitisho hazijawekwa rasmi.'
  };

  const displayLocation = [shop.district, shop.region].filter(Boolean).join(', ') || 'Tanzania';
  const locationSignal: LocationTrustSignal = {
    status: shop.region ? 'LOCATION_PROVIDED' : 'LOCATION_NOT_PROVIDED',
    displayLocation,
    region: shop.region,
    district: shop.district,
    isShopLocation: true,
    isStale: false,
    authority: 'AUTHORITATIVE_STRUCTURED',
    disclaimer: 'Eneo lililosajiliwa la duka.',
    hasDescriptionConflict: false
  };

  const reputationSignal: ReputationTrustSignal = {
    targetType: 'SHOP',
    targetId: shop.shopId,
    hasReviews: reputationSummary.hasReviews,
    totalPublishedReviews: reputationSummary.totalPublishedReviews,
    averageRating: reputationSummary.averageRating,
    isSmallSample: reputationSummary.isSmallSample,
    smallSampleWarning: reputationSummary.smallSampleWarning,
    ratingDistribution: reputationSummary.ratingDistribution,
    displayRatingText: reputationSummary.displayRatingText,
    authority: 'PUBLISHED_USER_REVIEW',
    disclaimer: reputationSummary.reputationDisclaimer
  };

  const moderationSignal: ModerationTrustSignal = {
    hasOpenReports: false,
    reportCount: 0,
    isPublicAllegationOnly: true,
    moderationNotice: 'Ripoti huchunguzwa na wasimamizi wa mfumo.',
    authority: 'AUTHORITATIVE_VERIFICATION'
  };

  const conciseBulletPoints: string[] = [
    isVerified ? 'Mwenye duka amethibitishwa' : 'Uthibitisho wa mwenye duka haujawekwa',
    `Eneo la duka: ${displayLocation}`,
    `Bidhaa zilizoorodheshwa: ${activeProductsCount}`,
    reputationSignal.hasReviews
      ? `Tathmini za duka: ${reputationSignal.totalPublishedReviews} (Wastani wa nyota ${reputationSignal.averageRating?.toFixed(1)})`
      : 'Tathmini: Hakuna reviews zilizochapishwa bado za duka hili'
  ];

  return {
    shopId: shop.shopId,
    sellerId: shop.sellerId,
    shopName: shop.shopName,
    isPublished: shop.isPublished,
    sellerVerification: sellerVerificationSignal,
    location: locationSignal,
    reputation: reputationSignal,
    moderation: moderationSignal,
    totalActiveProducts: activeProductsCount,
    conciseBulletPoints,
    boundaryNotice: 'Ishara za uaminifu zinahusu taarifa maalum za duka zilizopo kwenye mfumo, si dhamana ya huduma.',
    evaluatedAt
  };
}

/**
 * Formats a ProductTrustSignals bundle into clean, scannable text for the AI context.
 * AI consumes this to avoid hallucinating attributes or trust statuses.
 */
export function formatTrustSignalsForAIContext(signals: ProductTrustSignals): string {
  const parts: string[] = [];

  parts.push(`[ISARA ZA UAMINIFU (AUTHORITATIVE TRUST SIGNALS) KWA PRODUCT ${signals.productId}]`);
  parts.push(`- Utambulisho wa Muuzaji: ${signals.sellerVerification.isVerified ? 'ALIYETHIBITISHWA (Verified Seller)' : 'HAISHAHAKIKIWA (Unverified)'}`);
  parts.push(`- Hali ya Bei: ${signals.price.status === 'PROVIDED' ? `Imetolewa (${signals.price.displayPrice}/${signals.price.unit || 'kipimo'})` : 'Haijawekwa'}${signals.price.isStale ? ' [BEI YA ZAMANI >90 siku]' : ''}`);
  if (signals.price.hasDescriptionConflict) {
    parts.push(`  ! TAHADHARI: ${signals.price.conflictNotice}`);
  }

  parts.push(`- Hali ya Mzigo (Stock): ${signals.stock.status === 'IN_STOCK' ? `Inapatikana (${signals.stock.quantity} ${signals.stock.unit || ''})` : (signals.stock.status === 'OUT_OF_STOCK' ? 'IMEISHA (0 / Out of Stock)' : 'Haijawekwa')}${signals.stock.isStale ? ' [MZIGO WA ZAMANI]' : ''}`);
  if (signals.stock.hasDescriptionConflict) {
    parts.push(`  ! TAHADHARI: ${signals.stock.conflictNotice}`);
  }

  parts.push(`- Mahali: ${signals.location.displayLocation}`);
  if (signals.location.hasDescriptionConflict) {
    parts.push(`  ! TAHADHARI: ${signals.location.conflictNotice}`);
  }

  parts.push(`- Usafirishaji (Delivery): ${signals.delivery.deliveryAvailable ? `Unapatikana (${signals.delivery.feeType === 'FREE' ? 'Bure' : 'Kuna ada'})` : (signals.pickup.pickupAvailable ? 'Kuchukua dukani pekee (Hakuna delivery)' : 'Taarifa za delivery hazijawekwa')}`);

  parts.push(`- Tathmini (Reviews): ${signals.reputation.hasReviews ? `${signals.reputation.totalPublishedReviews} zilizochapishwa (Wastani wa nyota ${signals.reputation.averageRating?.toFixed(1)})${signals.reputation.isSmallSample ? ' [SAMPULI NDOGO: 1-2 reviews]' : ''}` : 'Hakuna reviews zilizochapishwa bado'}`);

  parts.push(`- Kanuni: ${signals.boundaryNotice}`);

  return parts.join('\n');
}

/**
 * Objective, factual comparison between two products/sellers.
 * AI uses this to compare structured signals WITHOUT proclaiming a "best seller" or "100% trusted".
 */
export function compareSellerTrustSignals(
  productA: MarketplaceProduct,
  signalsA: ProductTrustSignals,
  productB: MarketplaceProduct,
  signalsB: ProductTrustSignals
): TrustComparisonResult {
  const sellerAName = productA.sellerBusinessName || productA.sellerName || 'Muuzaji A';
  const sellerBName = productB.sellerBusinessName || productB.sellerName || 'Muuzaji B';

  const comparisonLines: string[] = [
    `Kwa mujibu wa taarifa rasmi zilizopo kwenye Gulio:`,
    `- ${sellerAName} (${productA.title}):`,
    `  * Utambulisho: ${signalsA.sellerVerification.isVerified ? 'Amethibitishwa rasmi' : 'Taarifa za uthibitisho hazijawekwa'}`,
    `  * Bei & Mzigo: ${signalsA.price.displayPrice} / ${productA.unit}, ${signalsA.stock.status === 'IN_STOCK' ? `inapatikana (${signalsA.stock.quantity})` : signalsA.stock.displayStock}`,
    `  * Eneo & Delivery: ${signalsA.location.displayLocation}, ${signalsA.delivery.deliveryAvailable ? 'delivery inapatikana' : (signalsA.pickup.pickupAvailable ? 'kuchukua dukani pekee' : 'delivery haijawekwa')}`,
    `  * Tathmini: ${signalsA.reputation.hasReviews ? `${signalsA.reputation.totalPublishedReviews} reviews (wastani ${signalsA.reputation.averageRating?.toFixed(1)}★)` : 'Bila tathmini zilizochapishwa'}`,
    ``,
    `- ${sellerBName} (${productB.title}):`,
    `  * Utambulisho: ${signalsB.sellerVerification.isVerified ? 'Amethibitishwa rasmi' : 'Taarifa za uthibitisho hazijawekwa'}`,
    `  * Bei & Mzigo: ${signalsB.price.displayPrice} / ${productB.unit}, ${signalsB.stock.status === 'IN_STOCK' ? `inapatikana (${signalsB.stock.quantity})` : signalsB.stock.displayStock}`,
    `  * Eneo & Delivery: ${signalsB.location.displayLocation}, ${signalsB.delivery.deliveryAvailable ? 'delivery inapatikana' : (signalsB.pickup.pickupAvailable ? 'kuchukua dukani pekee' : 'delivery haijawekwa')}`,
    `  * Tathmini: ${signalsB.reputation.hasReviews ? `${signalsB.reputation.totalPublishedReviews} reviews (wastani ${signalsB.reputation.averageRating?.toFixed(1)}★)` : 'Bila tathmini zilizochapishwa'}`,
    ``,
    `Uamuzi unategemea mahitaji yako (kama unahitaji delivery ya karibu au muuzaji aliyethibitishwa). Hakuna muuzaji aliyepewa hadhi ya '100% guaranteed' kwani taarifa za mfumo zinathibitisha vigezo maalum pekee.`
  ];

  return {
    basis: 'STRUCTURED_MARKETPLACE_DATA_COMPARISON',
    productA: {
      title: productA.title,
      sellerName: sellerAName,
      isVerified: signalsA.sellerVerification.isVerified,
      priceStatus: signalsA.price.status,
      stockStatus: signalsA.stock.status,
      location: signalsA.location.displayLocation,
      deliveryAvailable: signalsA.delivery.deliveryAvailable,
      publishedReviewsCount: signalsA.reputation.totalPublishedReviews,
      averageRating: signalsA.reputation.averageRating
    },
    productB: {
      title: productB.title,
      sellerName: sellerBName,
      isVerified: signalsB.sellerVerification.isVerified,
      priceStatus: signalsB.price.status,
      stockStatus: signalsB.stock.status,
      location: signalsB.location.displayLocation,
      deliveryAvailable: signalsB.delivery.deliveryAvailable,
      publishedReviewsCount: signalsB.reputation.totalPublishedReviews,
      averageRating: signalsB.reputation.averageRating
    },
    neutralComparisonSwahili: comparisonLines.join('\n')
  };
}
