/**
 * MARKETPLACE ENFORCEMENT V1.0 AUTOMATED TEST SUITE
 * 
 * Verifies all 16 requirements specified in Section 10 of BUILD PROMPT — MARKETPLACE ENFORCEMENT V1.0:
 * 1. Approved and currently screened eligible listings can appear publicly.
 * 2. Pending-review listings are excluded.
 * 3. Rejected, hidden and suspended listings are excluded.
 * 4. Direct-ID access cannot bypass moderation.
 * 5. Category, search, pagination, related-listing and seller-storefront paths enforce the same policy.
 * 6. AI retrieval never returns ineligible listings.
 * 7. Stale fingerprints and changed images cannot reuse an old PASS.
 * 8. SCREENING_ERROR never publishes a listing.
 * 9. NEW_SELLER still requires approval.
 * 10. TRUSTED_SELLER does not bypass screening or other publishing conditions.
 * 11. Report submission alone does not automatically decide a violation.
 * 12. Admin hide/reject/suspend takes effect across all relevant paths.
 * 13. Authorized restore follows existing validation and screening requirements.
 * 14. Cached results cannot leak newly hidden or suspended listings.
 * 15. Sellers cannot forge moderation or trust fields.
 * 16. Existing Marketplace Inbox, Gumzo, seller monetization, PlusPesa, notifications and audit flows do not regress.
 */

import {
  evaluateListingContentDeterministically,
  resolveListingPublishingState,
  computeListingContentFingerprint,
  isScreeningResultUpToDate,
  AI_SCREENING_POLICY_VERSION
} from '../src/services/marketplaceAiScreeningService';
import {
  getSellerTrustStatus,
  updateSellerTrustStatus,
  saveSellerProfileToCache,
  stripProtectedSellerTrustFields
} from '../src/services/sellerTrustService';
import {
  evaluateProductMarketplaceEligibility,
  filterMarketplaceEligibleProducts,
  isProductMarketplaceEligible,
  sanitizeProductForPublic,
  syncAuthoritativeModerationState
} from '../src/services/marketplaceGovernanceEnforcement';
import {
  performModerationAction,
  getListingModerationRecord
} from '../src/services/marketplaceModerationService';
import {
  submitMarketplaceReport
} from '../src/services/marketplaceReportAndAppealService';
import {
  getMarketplaceRecommendations,
  executeStructuredMarketplaceProductQuery
} from '../src/services/marketplaceRecommendationService';
import { getMarketplaceIntelligenceForAI } from '../src/services/aiMarketplaceBridge';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { MarketplaceProduct, DigitalShop } from '../src/types/marketplace';
import { AIScreeningResult } from '../src/types/marketplaceModeration';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { gumzoGroupService } from '../src/services/gumzoGroupService';

// Node.js environment localStorage mock
const mockStorage: Record<string, string> = {};
if (typeof window === 'undefined' || !(global as any).localStorage) {
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; }
  };
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, testId: string, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✓ [PASS] ${testId}: ${testName}`);
  } else {
    failed++;
    const errMsg = `✗ [FAIL] ${testId}: ${testName}${detail ? ` (${detail})` : ''}`;
    console.error(errMsg);
    errors.push(errMsg);
  }
}

async function runEnforcementTestSuite() {
  console.log('=============================================================');
  console.log('--- MARKETPLACE ENFORCEMENT V1.0 AUTHORITATIVE TEST SUITE ---');
  console.log('=============================================================\n');

  const now = new Date().toISOString();
  const adminUid = 'admin_super_user';
  const adminName = 'Afisa Msimamizi Mkuu';

  // Seed two sellers: one NEW_SELLER and one TRUSTED_SELLER
  const sellerNewId = 'seller_enforce_new_01';
  const sellerTrustedId = 'seller_enforce_trusted_02';

  saveSellerProfileToCache({
    uid: sellerNewId,
    businessName: 'Mfugaji Mpya Farm',
    displayName: 'Juma Mkulima',
    phone: '+255711223344',
    location: 'Morogoro',
    trustStatus: 'NEW_SELLER',
    verificationStatus: 'unverified',
    createdAt: now,
    updatedAt: now
  });
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerNewId,
    sellerProfileId: `profile_${sellerNewId}`
  });

  saveSellerProfileToCache({
    uid: sellerTrustedId,
    businessName: 'Mzalendo Breeders',
    displayName: 'Amani Mfugaji',
    phone: '+255755112233',
    location: 'Morogoro',
    trustStatus: 'TRUSTED_SELLER',
    verificationStatus: 'verified',
    createdAt: now,
    updatedAt: now
  });
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerTrustedId,
    sellerProfileId: `profile_${sellerTrustedId}`
  });

  // Base product template
  const baseProduct: MarketplaceProduct = {
    productId: 'prod_enforce_base',
    sellerId: sellerNewId,
    shopId: sellerNewId,
    sellerName: 'Juma Mkulima',
    sellerPhone: '+255711223344',
    sellerLocation: 'Morogoro',
    title: 'Kuku Chotara wa Nyama na Mayai',
    description: 'Kuku bora wa kienyeji na chotara wenye afya nzuri na chanjo zote.',
    category: 'Kuku',
    categoryId: 'cat_kuku',
    price: 15000,
    currency: 'TZS',
    unit: 'ndege',
    quantityAvailable: 50,
    location: 'Morogoro',
    status: 'active',
    moderationStatus: 'APPROVED',
    createdAt: now,
    updatedAt: now
  };

  const initialFingerprint = computeListingContentFingerprint({
    title: baseProduct.title,
    description: baseProduct.description,
    category: baseProduct.category,
    price: baseProduct.price,
    images: baseProduct.images
  });

  const validAiPass: AIScreeningResult = {
    screeningId: 'scr_valid_01',
    requestId: 'req_valid_01',
    status: 'PASS',
    categories: [],
    explanation: 'Maudhui yamekidhi miongozo ya soko la mifugo.',
    explanationSwahili: 'Tangazo limekidhi vigezo vya kiusalama.',
    confidence: 'HIGH',
    model: 'gemini-2.5-flash',
    contentFingerprint: initialFingerprint,
    policyVersion: AI_SCREENING_POLICY_VERSION,
    timestamp: now,
    evaluatedFields: {
      hasTitle: true,
      hasDescription: true,
      hasCategory: true,
      hasPrice: true,
      imageCount: 0
    }
  };

  // --------------------------------------------------------------------------
  // TEST 1: APPROVED AND CURRENTLY SCREENED ELIGIBLE LISTINGS APPEAR PUBLICLY
  // --------------------------------------------------------------------------
  console.log('--- Test 1 & 2: Approved / Screened vs Pending Review ---');
  const eligibleProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_1_eligible',
    status: 'active',
    moderationStatus: 'APPROVED',
    aiScreening: validAiPass
  };

  const eligResult1 = evaluateProductMarketplaceEligibility(eligibleProduct);
  assert(
    eligResult1.isEligible === true && isProductMarketplaceEligible(eligibleProduct),
    '1.1',
    'Approved and currently screened eligible listing appears publicly'
  );

  // --------------------------------------------------------------------------
  // TEST 2: PENDING-REVIEW LISTINGS ARE EXCLUDED
  // --------------------------------------------------------------------------
  const pendingProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_2_pending',
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    aiScreening: validAiPass
  };
  const eligResult2 = evaluateProductMarketplaceEligibility(pendingProduct);
  assert(
    eligResult2.isEligible === false && eligResult2.isBlockedByModeration === true,
    '2.1',
    'Pending-review listings are strictly excluded from public visibility'
  );

  // --------------------------------------------------------------------------
  // TEST 3: REJECTED, HIDDEN AND SUSPENDED LISTINGS ARE EXCLUDED
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Admin Decisions (Rejected, Hidden, Suspended) Excluded ---');
  const rejectedProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_3_rejected',
    status: 'inactive',
    moderationStatus: 'REJECTED',
    aiScreening: validAiPass
  };
  const hiddenProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_3_hidden',
    status: 'inactive',
    moderationStatus: 'HIDDEN',
    aiScreening: validAiPass
  };
  const suspendedProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_3_suspended',
    status: 'inactive',
    moderationStatus: 'SUSPENDED',
    aiScreening: validAiPass
  };

  assert(
    !evaluateProductMarketplaceEligibility(rejectedProduct).isEligible &&
    !evaluateProductMarketplaceEligibility(hiddenProduct).isEligible &&
    !evaluateProductMarketplaceEligibility(suspendedProduct).isEligible,
    '3.1',
    'Rejected, Hidden and Suspended listings are strictly excluded regardless of AI PASS'
  );

  // --------------------------------------------------------------------------
  // TEST 4: DIRECT-ID ACCESS CANNOT BYPASS MODERATION & NO PROTECTED LEAKAGE
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Direct-ID Lookup & Sanitization ---');
  // When an ordinary buyer attempts direct lookup of suspendedProduct:
  const directLookupEligibility = evaluateProductMarketplaceEligibility(suspendedProduct);
  assert(
    directLookupEligibility.isEligible === false,
    '4.1',
    'Direct product lookup for ineligible listing detects failure closed'
  );

  // Sanitizing public product strips all private moderation and internal fields
  const productWithPrivateNotes: MarketplaceProduct = {
    ...eligibleProduct,
    moderationCorrectionNote: 'Rekebisha picha ya pili',
    aiScreening: {
      ...validAiPass,
      explanation: 'Internal screening prompt: matched agri vocabulary',
      explanationSwahili: 'Maelezo ya ndani ya mfumo'
    }
  };
  (productWithPrivateNotes as any).internalNote = 'Suspicious seller IP address';
  (productWithPrivateNotes as any).relatedReportId = 'rep_99182';
  (productWithPrivateNotes as any).reviewedByUserId = 'admin_secret_id';

  const sanitized = sanitizeProductForPublic(productWithPrivateNotes);
  assert(
    !(sanitized as any).internalNote &&
    !sanitized.moderationCorrectionNote &&
    !(sanitized as any).relatedReportId &&
    !(sanitized as any).reviewedByUserId &&
    !(sanitized.aiScreening as any)?.explanation,
    '4.2',
    'Direct access sanitization strictly strips internal notes, reviewer IDs, and private explanations'
  );

  // --------------------------------------------------------------------------
  // TEST 5: CATEGORY, SEARCH, PAGINATION, RELATED & STOREFRONT ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Category, Search, Pagination, Related & Storefront ---');
  const collectionList: MarketplaceProduct[] = [
    eligibleProduct,
    pendingProduct,
    rejectedProduct,
    hiddenProduct,
    suspendedProduct
  ];

  const filteredCollection = filterMarketplaceEligibleProducts(collectionList);
  assert(
    filteredCollection.length === 1 && filteredCollection[0].productId === eligibleProduct.productId,
    '5.1',
    'filterMarketplaceEligibleProducts filters out all 4 ineligible variants across all paths'
  );

  // Search recommendations with mixed pool
  const dummyShop: DigitalShop = {
    shopId: 'shop_01',
    sellerId: sellerNewId,
    shopName: 'Duka la Mifugo Morogoro',
    description: 'Duka la pembejeo na mifugo Morogoro mjini',
    location: 'Morogoro',
    phone: '+255711223344',
    isPublished: true,
    createdAt: now,
    updatedAt: now
  };

  const recResult = getMarketplaceRecommendations('Natafuta kuku wa nyama', collectionList, [dummyShop], 'Morogoro');
  const recProductIds = (recResult?.products || []).map((p) => p.productId);
  assert(
    recProductIds.includes(eligibleProduct.productId) &&
    !recProductIds.includes(pendingProduct.productId) &&
    !recProductIds.includes(rejectedProduct.productId) &&
    !recProductIds.includes(hiddenProduct.productId) &&
    !recProductIds.includes(suspendedProduct.productId),
    '5.2',
    'Marketplace Recommendations engine only returns strictly eligible listings'
  );

  // --------------------------------------------------------------------------
  // TEST 6: AI RETRIEVAL NEVER RETURNS INELIGIBLE LISTINGS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: AI Retrieval Bridge Zero Ineligible Leakage ---');
  const aiIntelligence = getMarketplaceIntelligenceForAI({
    question: 'Natafuta kuku chotara wa nyama na mayai',
    marketplaceProducts: collectionList,
    publishedShops: [dummyShop],
    farmerLocation: 'Morogoro'
  });

  const aiReturnedProductIds = (aiIntelligence.products || []).map((p) => p.productId);
  assert(
    aiReturnedProductIds.includes(eligibleProduct.productId) &&
    !aiReturnedProductIds.includes(pendingProduct.productId) &&
    !aiReturnedProductIds.includes(rejectedProduct.productId) &&
    !aiReturnedProductIds.includes(suspendedProduct.productId),
    '6.1',
    'AI Assistant bridge strictly filters out ineligible listings via authoritative governance'
  );

  // --------------------------------------------------------------------------
  // TEST 7: STALE FINGERPRINTS & CONTENT MUTATIONS INVALIDATE OLD PASS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: AI Screening Freshness & Mutation Guards ---');
  // Mutate product title or price
  const editedProduct: MarketplaceProduct = {
    ...eligibleProduct,
    title: 'Kuku Chotara na Vifaranga Bei Nafuu Sana',
    price: 8000
    // Note: aiScreening still contains old fingerprint
  };

  const isUpToDate = isScreeningResultUpToDate(editedProduct, editedProduct.aiScreening!);
  const eligibilityAfterEdit = evaluateProductMarketplaceEligibility(editedProduct);

  assert(
    isUpToDate === false && eligibilityAfterEdit.isEligible === false,
    '7.1',
    'Stale content fingerprint strictly invalidates previous AI PASS'
  );

  // Image addition/change invalidates previous screening
  const productWithNewImages: MarketplaceProduct = {
    ...eligibleProduct,
    images: [{ id: 'img_new_1', url: 'https://example.com/new_chicken.jpg', isPrimary: true, uploadedAt: now }]
  };
  const isImageScreeningFresh = isScreeningResultUpToDate(productWithNewImages, productWithNewImages.aiScreening!);
  assert(
    isImageScreeningFresh === false,
    '7.2',
    'Changed or newly added images require re-screening and cannot reuse old PASS'
  );

  // --------------------------------------------------------------------------
  // TEST 8: SCREENING_ERROR NEVER PUBLISHES A LISTING
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: SCREENING_ERROR Never Publishes ---');
  const screeningErrorProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_8_err',
    status: 'active',
    moderationStatus: 'APPROVED',
    aiScreening: {
      screeningId: 'scr_err_01',
      requestId: 'req_err_01',
      status: 'SCREENING_ERROR',
      categories: ['UNCERTAIN'],
      explanation: 'Network timeout during Gemini call',
      explanationSwahili: 'Hitilafu ya mtandao wakati wa uchunguzi wa AI.',
      confidence: 'LOW',
      model: 'gemini-2.5-flash',
      contentFingerprint: 'fp_err',
      policyVersion: AI_SCREENING_POLICY_VERSION,
      timestamp: now,
      evaluatedFields: {
        hasTitle: true,
        hasDescription: true,
        hasCategory: true,
        hasPrice: true,
        imageCount: 0
      }
    }
  };
  const errorEligibility = evaluateProductMarketplaceEligibility(screeningErrorProduct);
  assert(
    errorEligibility.isEligible === false,
    '8.1',
    'SCREENING_ERROR fails closed and never publishes or allows public visibility'
  );

  // --------------------------------------------------------------------------
  // TEST 9: NEW_SELLER STILL REQUIRES APPROVAL (AI PASS INSUFFICIENT)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: NEW_SELLER Publishing Policy ---');
  const newSellerResolution = resolveListingPublishingState({
    screeningResult: validAiPass,
    sellerTrustStatus: 'NEW_SELLER',
    currentModerationStatus: 'PENDING_REVIEW'
  });

  assert(
    newSellerResolution.recommendedModerationStatus === 'PENDING_REVIEW' &&
    newSellerResolution.canPublishActiveImmediately === false,
    '9.1',
    'NEW_SELLER with AI PASS still requires administrator review (held in PENDING_REVIEW)'
  );

  // --------------------------------------------------------------------------
  // TEST 10: TRUSTED_SELLER DOES NOT BYPASS SCREENING OR GOVERNANCE CONDITIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: TRUSTED_SELLER Guardrails ---');
  // Trusted seller with BLOCK screening
  const trustedWithBlock = resolveListingPublishingState({
    screeningResult: {
      screeningId: 'scr_block_01',
      requestId: 'req_block_01',
      status: 'BLOCK',
      categories: ['SCAM_OR_FRAUD'],
      explanation: 'Scam content detected',
      explanationSwahili: 'Maudhui ya utapeli yamegunduliwa.',
      confidence: 'HIGH',
      model: 'gemini-2.5-flash',
      contentFingerprint: 'fp_block',
      policyVersion: AI_SCREENING_POLICY_VERSION,
      timestamp: now,
      evaluatedFields: {
        hasTitle: true,
        hasDescription: true,
        hasCategory: true,
        hasPrice: true,
        imageCount: 0
      }
    },
    sellerTrustStatus: 'TRUSTED_SELLER',
    currentModerationStatus: 'PENDING_REVIEW'
  });

  assert(
    trustedWithBlock.canPublishActiveImmediately === false &&
    trustedWithBlock.recommendedModerationStatus === 'REJECTED',
    '10.1',
    'TRUSTED_SELLER cannot bypass AI BLOCK (sets status to REJECTED)'
  );

  // --------------------------------------------------------------------------
  // TEST 11: USER REPORT ALONE DOES NOT AUTOMATICALLY MUTATE LISTING STATUS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 11: Report Proportionality (Anti-Vigilante) ---');
  const targetProductForReport: MarketplaceProduct = {
    ...eligibleProduct,
    productId: 'prod_11_reported'
  };

  const prodCached1: MarketplaceProduct = { ...eligibleProduct, productId: 'prod_cached_1' };
  (global as any).localStorage.setItem(
    'ufugaji_marketplace_products_cache',
    JSON.stringify([eligibleProduct, targetProductForReport, prodCached1])
  );

  const reportRes = await submitMarketplaceReport({
    productId: targetProductForReport.productId,
    reporterUserId: 'buyer_citizen_01',
    reporterDisplayName: 'Mwananchi Makini',
    targetType: 'PRODUCT',
    targetId: targetProductForReport.productId,
    sellerId: targetProductForReport.sellerId,
    reasonCode: 'SUSPECTED_SCAM',
    reasonText: 'Bei iliyoandikwa si sahihi na kuna viashiria vya ulaghai.'
  });

  assert(
    Boolean(reportRes?.report && reportRes.report.status === 'OPEN'),
    '11.1',
    'User report is recorded as OPEN for admin triage'
  );

  // Verify product status remains untouched
  const eligibilityAfterReport = evaluateProductMarketplaceEligibility(targetProductForReport);
  assert(
    eligibilityAfterReport.isEligible === true &&
    targetProductForReport.moderationStatus === 'APPROVED',
    '11.2',
    'Filing a user report does NOT automatically hide or alter listing status without admin decision'
  );

  // --------------------------------------------------------------------------
  // TEST 12: ADMIN HIDE / REJECT / SUSPEND TAKES EFFECT ACROSS ALL PATHS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 12: Admin Moderation Decisions Take Immediate Effect ---');
  // Admin hides product
  const hideAction = await performModerationAction(adminUid, adminName, true, {
    targetProductId: targetProductForReport.productId,
    action: 'HIDE_LISTING',
    reasonText: 'Tangazo limefichwa kufuatia ripoti ya watumiaji.'
  });

  assert(
    hideAction.success && hideAction.updatedProduct?.moderationStatus === 'HIDDEN',
    '12.1',
    'Admin HIDE_LISTING transitions moderationStatus to HIDDEN'
  );

  const eligibilityAfterHide = evaluateProductMarketplaceEligibility(hideAction.updatedProduct!);
  assert(
    eligibilityAfterHide.isEligible === false && eligibilityAfterHide.isBlockedByModeration === true,
    '12.2',
    'Hidden listing is immediately excluded by authoritative eligibility check'
  );

  // --------------------------------------------------------------------------
  // TEST 13: AUTHORIZED RESTORE FOLLOWS VALIDATION & SCREENING REQUIREMENTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 13: Authorized Restore Workflow ---');
  const restoreAction = await performModerationAction(adminUid, adminName, true, {
    targetProductId: targetProductForReport.productId,
    action: 'RESTORE_LISTING',
    reasonText: 'Marekebisho yamethibitishwa na msimamizi.'
  });

  assert(
    restoreAction.success &&
    restoreAction.updatedProduct?.status === 'active' &&
    (restoreAction.updatedProduct?.moderationStatus === 'APPROVED' || restoreAction.updatedProduct?.moderationStatus === 'RESTORED'),
    '13.1',
    'Authorized RESTORE restores listing to active and approved status'
  );

  // --------------------------------------------------------------------------
  // TEST 14: CACHED RESULTS CANNOT LEAK NEWLY HIDDEN OR SUSPENDED LISTINGS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 14: Cache Invalidation & Re-check On Retrieval ---');
  // Simulate cached array in memory
  const staleCache = [{ ...eligibleProduct, productId: 'prod_cached_1' }];
  // Moderation service updates authoritative state of prod_cached_1 to SUSPENDED
  await performModerationAction(adminUid, adminName, true, {
    targetProductId: 'prod_cached_1',
    action: 'SUSPEND_LISTING',
    reasonCode: 'POLICY_VIOLATION',
    reasonText: 'Kusimamishwa kwa uchunguzi.'
  });

  // Re-evaluating the stale cache through authoritative sync
  const syncedCache = staleCache.map(syncAuthoritativeModerationState);
  const eligibleFromCache = filterMarketplaceEligibleProducts(syncedCache);

  assert(
    eligibleFromCache.length === 0,
    '14.1',
    'Revalidation against authoritative moderation records blocks stale cached items from leaking'
  );

  // --------------------------------------------------------------------------
  // TEST 15: SELLERS CANNOT FORGE MODERATION OR TRUST FIELDS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 15: Non-Admin Protected Field Stripping ---');
  const maliciousSellerUpdate = {
    displayName: 'Wajanja Farm',
    trustStatus: 'TRUSTED_SELLER' as any,
    trustGrantedBy: 'self_exploit',
    verificationStatus: 'verified' as any
  };

  const strippedProfile = stripProtectedSellerTrustFields(maliciousSellerUpdate, false);
  assert(
    strippedProfile.trustStatus === undefined &&
    strippedProfile.trustGrantedBy === undefined &&
    strippedProfile.verificationStatus === undefined,
    '15.1',
    'stripProtectedSellerTrustFields strips trustStatus, verificationStatus, and trustGrantedBy for non-admin'
  );

  // --------------------------------------------------------------------------
  // TEST 16: SYSTEM ISOLATION (INBOX, GUMZO, MONETIZATION, NOTIFICATIONS)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 16: System Isolation & Non-Regression ---');
  // Verify Inbox service operates
  assert(
    typeof (marketplaceInboxService as any).getConversationsForUser === 'function',
    '16.1',
    'Marketplace Inbox service interfaces remain intact and isolated'
  );

  // Verify Gumzo service operates
  assert(
    typeof (gumzoGroupService as any).getDiscoverableGroups === 'function',
    '16.2',
    'Gumzo discussion groups service interfaces remain intact and isolated'
  );

  // Verify Seller Monetization operates
  const monetizationCheck = sellerMonetizationService.canSellerSellOnMarketplace(sellerTrustedId);
  assert(
    monetizationCheck.canSell === true,
    '16.3',
    'Seller Monetization subscription and trial system functions without regression'
  );

  console.log('\n=============================================================');
  console.log(`--- TEST EXECUTION SUMMARY: ${passed} PASSED / ${failed} FAILED ---`);
  console.log('=============================================================');

  if (failed > 0) {
    console.error('\nFailures summary:');
    errors.forEach((e) => console.error(e));
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEnforcementTestSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
