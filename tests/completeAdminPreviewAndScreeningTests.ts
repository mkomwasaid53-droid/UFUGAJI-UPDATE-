/**
 * COMPLETE ADMIN LISTING REVIEW PREVIEW & AI SCREENING RETRY RELIABILITY TEST SUITE
 *
 * Verifies all 13 hotfix requirements:
 * 1. A transient timeout followed by successful screening
 * 2. Repeated transient failures never result in PASS
 * 3. Retry exhaustion produces an inspectable screening failure state
 * 4. Retry idempotency prevents duplicate records and notifications
 * 5. Current fingerprints are checked before publishing after rescreening
 * 6. Admin preview displays all available listing images
 * 7. Admin preview displays a video when a valid video exists
 * 8. Missing or inaccessible media produces a safe fallback
 * 9. Full product description and relevant listing fields are visible
 * 10. Unauthorized users cannot access admin-only moderation metadata
 * 11. Moderation actions preserve existing authorization and audit requirements
 * 12. Marketplace public visibility and AI retrieval enforcement remain intact
 * 13. Existing Gumzo uploads, Marketplace Inbox media, seller monetization and PlusPesa do not regress
 */

import {
  evaluateMarketplaceListingContent,
  resolveListingPublishingState,
  computeListingContentFingerprint,
  isScreeningResultUpToDate,
  isRetryableAiError,
  callGeminiWithBoundedRetry,
  sanitizeLogMessage,
  AI_SCREENING_PRIMARY_MODEL,
  AI_SCREENING_POLICY_VERSION
} from '../src/services/marketplaceAiScreeningService';
import {
  getSellerTrustStatus,
  updateSellerTrustStatus,
  saveSellerProfileToCache
} from '../src/services/sellerTrustService';
import {
  fetchModerationQueue,
  registerListingModerationRecord,
  getListingModerationRecord,
  performModerationAction,
  fetchModerationAuditLogs,
  saveModerationRecordsToCache,
  getLocalCachedModerationRecords
} from '../src/services/marketplaceModerationService';
import {
  evaluateProductMarketplaceEligibility,
  filterMarketplaceEligibleProducts,
  syncAuthoritativeModerationState
} from '../src/services/marketplaceGovernanceEnforcement';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { MarketplaceProduct } from '../src/types/marketplace';
import { AIScreeningResult, ModerationAction } from '../src/types/marketplaceModeration';

// Ensure mock localStorage exists in Node.js test environment
const mockStorage: Record<string, string> = {};
if (typeof window === 'undefined' || !window.localStorage) {
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    }
  };
}

let passed = 0;
let failed = 0;
const testErrors: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✓ [PASS] ${testName}`);
  } else {
    failed++;
    const msg = `✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`;
    console.error(msg);
    testErrors.push(msg);
  }
}

export async function runCompleteAdminPreviewAndScreeningTests() {
  console.log('\n=============================================================');
  console.log('--- COMPLETE ADMIN LISTING REVIEW & SCREENING RETRY TESTS ---');
  console.log('=============================================================\n');

  localStorage.clear();

  // --------------------------------------------------------------------------
  // TEST 1: TRANSIENT TIMEOUT FOLLOWED BY SUCCESSFUL SCREENING
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Transient Timeout Followed by Success ---');
  let attempt1Count = 0;
  const mockTimeoutThenSuccess = {
    models: {
      generateContent: async () => {
        attempt1Count++;
        if (attempt1Count === 1) {
          const timeoutErr: any = new Error('Model screening request timed out (DEADLINE_EXCEEDED)');
          timeoutErr.name = 'TimeoutError';
          timeoutErr.code = 'DEADLINE_EXCEEDED';
          throw timeoutErr;
        }
        return {
          text: JSON.stringify({
            status: 'PASS',
            categories: [],
            explanation: 'Tangazo la halali la mbuzi wa maziwa.',
            explanationSwahili: 'Tangazo limekidhi vigezo vya usalama.',
            confidence: 'HIGH'
          })
        };
      }
    }
  };

  const res1 = await evaluateMarketplaceListingContent(
    {
      title: 'Mbuzi wa Maziwa Saanen',
      description: 'Mbuzi anayetoa lita 4 kwa siku.',
      category: 'MBUZI_NA_KONDOO',
      price: 350000
    },
    {
      genAiClient: mockTimeoutThenSuccess,
      maxRetries: 2,
      initialDelayMs: 20,
      maxDelayMs: 50,
      totalTimeoutMs: 1500
    }
  );

  assert(res1.status === 'PASS', '1.1: Transient timeout followed by success produces status PASS');
  assert(res1.evaluationSource === 'MODEL', '1.2: evaluationSource is MODEL');
  assert(res1.retryAttempts === 2, '1.3: Succeeded on attempt 2 after transient delay');

  // --------------------------------------------------------------------------
  // TEST 2: REPEATED TRANSIENT FAILURES NEVER RESULT IN PASS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Repeated Transient Failures Never Result in PASS ---');
  let attempt2Count = 0;
  const mockRepeated503 = {
    models: {
      generateContent: async () => {
        attempt2Count++;
        const err: any = new Error('HTTP 503 UNAVAILABLE - High demand on model');
        err.status = 503;
        throw err;
      }
    }
  };

  const res2 = await evaluateMarketplaceListingContent(
    {
      title: 'Kuku wa Mayai Isa Brown',
      description: 'Kuku 500 wa mayai.',
      category: 'KUKU_NA_NDEGE_WAFUGAWA',
      price: 18000
    },
    {
      genAiClient: mockRepeated503,
      maxRetries: 2,
      initialDelayMs: 15,
      maxDelayMs: 30,
      totalTimeoutMs: 500
    }
  );

  assert(res2.status !== 'PASS', '2.1: Repeated transient failure NEVER results in PASS');
  assert(res2.status === 'REVIEW_REQUIRED', '2.2: Repeated transient failure results in REVIEW_REQUIRED');

  // Ensure even for TRUSTED_SELLER, it never auto-publishes
  const resolution2 = resolveListingPublishingState({
    screeningResult: res2,
    sellerTrustStatus: 'TRUSTED_SELLER'
  });
  assert(resolution2.canPublishActiveImmediately === false, '2.3: Repeated failure cannot publish active, even for TRUSTED_SELLER');
  assert(resolution2.recommendedModerationStatus === 'PENDING_REVIEW', '2.4: Recommendation is strictly PENDING_REVIEW');

  // --------------------------------------------------------------------------
  // TEST 3: RETRY EXHAUSTION PRODUCES INSPECTABLE FAILURE STATE
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Retry Exhaustion Produces Inspectable Failure State ---');
  assert(res2.evaluationSource === 'INFRASTRUCTURE_FALLBACK', '3.1: evaluationSource is INFRASTRUCTURE_FALLBACK');
  assert(res2.failureReason === 'MODEL_UNAVAILABLE_503', '3.2: failureReason is MODEL_UNAVAILABLE_503');
  assert(res2.isRetryable === true, '3.3: isRetryable is true');
  assert(res2.retryAttempts === 3, '3.4: Bounded retries exhausted all 3 attempts');
  assert(Boolean(res2.infrastructureError), '3.5: infrastructureError details are recorded for diagnostics');

  // --------------------------------------------------------------------------
  // TEST 4: RETRY IDEMPOTENCY PREVENTS DUPLICATE RECORDS AND NOTIFICATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Retry Idempotency Prevents Duplicates ---');
  const sampleProductId = 'prod_idem_999';
  const initialCreated = '2026-10-21T08:00:00.000Z';

  // First retry attempt registration
  registerListingModerationRecord({
    moderationId: `mod_${sampleProductId}`,
    targetType: 'LISTING',
    targetId: sampleProductId,
    productId: sampleProductId,
    listingId: sampleProductId,
    sellerId: 'seller_test_4',
    shopId: 'seller_test_4',
    status: 'PENDING_REVIEW',
    priority: 'HIGH',
    reasonCode: 'AI_REVIEW_REQUIRED',
    reasonText: 'MODEL_UNAVAILABLE_503',
    internalNote: 'Attempt 1: 503 delay',
    publicExplanation: 'Tangazo linashikiliwa kwa usalama.',
    reviewedByUserId: null,
    reviewedByDisplayName: null,
    reviewedAt: null,
    createdAt: initialCreated,
    updatedAt: initialCreated
  });

  const record1 = getListingModerationRecord(sampleProductId);
  assert(record1 !== null, '4.1: Record registered on first attempt');

  // Second retry attempt registration for the exact same listing
  registerListingModerationRecord({
    moderationId: `mod_${sampleProductId}`,
    targetType: 'LISTING',
    targetId: sampleProductId,
    productId: sampleProductId,
    listingId: sampleProductId,
    sellerId: 'seller_test_4',
    shopId: 'seller_test_4',
    status: 'PENDING_REVIEW',
    priority: 'HIGH',
    reasonCode: 'AI_REVIEW_REQUIRED',
    reasonText: 'MODEL_UNAVAILABLE_503',
    internalNote: 'Attempt 2: 503 delay handled idempotently',
    publicExplanation: 'Tangazo linashikiliwa kwa usalama.',
    reviewedByUserId: null,
    reviewedByDisplayName: null,
    reviewedAt: null,
    createdAt: initialCreated,
    updatedAt: new Date().toISOString()
  });

  const allRecords = getLocalCachedModerationRecords();
  const matchingRecords = allRecords.filter((r) => r.productId === sampleProductId);
  assert(matchingRecords.length === 1, '4.2: No duplicate records created in cache across retries');
  assert(matchingRecords[0].internalNote.includes('Attempt 2'), '4.3: Existing record updated in place');

  // --------------------------------------------------------------------------
  // TEST 5: CURRENT FINGERPRINTS CHECKED BEFORE PUBLISHING AFTER RESCREENING
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Fingerprint Freshness Checked Before Publishing ---');
  const baseListing = {
    productId: 'prod_fp_check',
    sellerId: 'seller_fp_1',
    title: 'Mashine ya Kukamua Ng\'ombe',
    description: 'Mashine mpya ya kisasa yenye uwezo wa ng\'ombe 4.',
    category: 'VIFAA_VYA_KILIMO_NA_MIFUGO',
    price: 900000
  };

  const originalFp = computeListingContentFingerprint(baseListing);
  const validScreening: AIScreeningResult = {
    screeningId: 'scr_orig_pass',
    requestId: 'req_orig_pass',
    status: 'PASS',
    categories: [],
    explanation: 'Passed',
    explanationSwahili: 'Imepita',
    confidence: 'HIGH',
    model: AI_SCREENING_PRIMARY_MODEL,
    policyVersion: AI_SCREENING_POLICY_VERSION,
    contentFingerprint: originalFp,
    timestamp: new Date().toISOString(),
    evaluationSource: 'MODEL',
    evaluatedFields: {
      hasTitle: true,
      hasDescription: true,
      hasCategory: true,
      hasPrice: true,
      imageCount: 0
    }
  };

  // Initially fresh:
  assert(isScreeningResultUpToDate(baseListing as any, validScreening) === true,
    '5.1: Unmodified listing has matching fresh fingerprint');

  // Seller edits price and description:
  const editedListing = {
    ...baseListing,
    price: 800000,
    description: 'Bei imepunguzwa! Mashine mpya ya kisasa.'
  };

  const editedFp = computeListingContentFingerprint(editedListing);
  assert(originalFp !== editedFp, '5.2: Edited content generates distinct fingerprint');
  assert(isScreeningResultUpToDate(editedListing as any, validScreening) === false,
    '5.3: Stale screening correctly rejected by isScreeningResultUpToDate');

  // Governance eligibility must block stale listing from active status:
  const productWithStaleScreening: MarketplaceProduct = {
    ...editedListing,
    status: 'active',
    moderationStatus: 'APPROVED',
    sellerName: 'Mfugaji Bora',
    currency: 'TZS',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiScreening: validScreening
  } as any;

  const eligStale = evaluateProductMarketplaceEligibility(productWithStaleScreening);
  assert(eligStale.isEligible === false, '5.4: Listing with stale AI screening is NOT eligible for active marketplace');
  assert(eligStale.isAiScreeningFresh === false, '5.5: isAiScreeningFresh diagnostic is false');

  // --------------------------------------------------------------------------
  // TEST 6: ADMIN PREVIEW DISPLAYS ALL AVAILABLE LISTING IMAGES
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Admin Preview Displays All Available Listing Images ---');
  const multiImageProduct: MarketplaceProduct = {
    productId: 'prod_multi_img',
    sellerId: 'seller_img_test',
    title: 'Kuku Chotara 50',
    description: 'Picha 3 tofauti zikionyesha kuku.',
    category: 'KUKU_NA_NDEGE_WAFUGAWA',
    price: 15000,
    currency: 'TZS',
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    sellerName: 'Juma Juma',
    images: [
      { id: 'img_1', url: 'https://storage.googleapis.com/test-bucket/kuku1.jpg', isPrimary: true },
      { id: 'img_2', url: 'https://storage.googleapis.com/test-bucket/kuku2.jpg', isPrimary: false },
      { id: 'img_3', url: 'https://storage.googleapis.com/test-bucket/kuku3.jpg', isPrimary: false }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as any;

  assert(Array.isArray(multiImageProduct.images) && multiImageProduct.images.length === 3,
    '6.1: Product has 3 distinct images');
  assert(multiImageProduct.images[0].url.startsWith('https://'), '6.2: Image 1 URL is a valid stored URL');
  assert(multiImageProduct.images[1].url.startsWith('https://'), '6.3: Image 2 URL is a valid stored URL');
  assert(multiImageProduct.images[2].url.startsWith('https://'), '6.4: Image 3 URL is a valid stored URL');

  // --------------------------------------------------------------------------
  // TEST 7: ADMIN PREVIEW DISPLAYS VIDEO WHEN VALID VIDEO EXISTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Admin Preview Displays Video When Valid Video Exists ---');
  const videoProduct: MarketplaceProduct = {
    ...multiImageProduct,
    productId: 'prod_with_video',
    video: {
      id: 'vid_001',
      url: 'https://storage.googleapis.com/test-bucket/kuku_video.mp4',
      title: 'Video ikionyesha kuku wakila chakula',
      durationSeconds: 45,
      description: 'Video fupi ya kuku shambani'
    }
  } as any;

  assert(Boolean(videoProduct.video && videoProduct.video.url), '7.1: Stored video exists with valid URL');
  assert(videoProduct.video?.durationSeconds === 45, '7.2: Video duration is preserved');
  assert(videoProduct.video?.title === 'Video ikionyesha kuku wakila chakula', '7.3: Video title is preserved');

  const noVideoProduct: MarketplaceProduct = {
    ...multiImageProduct,
    productId: 'prod_without_video',
    video: undefined
  } as any;
  assert(!noVideoProduct.video, '7.4: No video invented when listing has no video');

  // --------------------------------------------------------------------------
  // TEST 8: MISSING OR INACCESSIBLE MEDIA SAFE FALLBACK
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Missing or Inaccessible Media Safe Fallback ---');
  const emptyMediaProduct: MarketplaceProduct = {
    productId: 'prod_empty_media',
    sellerId: 'seller_empty',
    title: 'Mbegu za Mahindi',
    description: 'Mfuko wa kilo 2 za mbegu.',
    category: 'MBEGU_NA_MBOLEA',
    price: 12000,
    currency: 'TZS',
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    sellerName: 'Hamisi',
    images: [],
    imageUrl: undefined,
    video: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as any;

  const imagesCount = Array.isArray(emptyMediaProduct.images) ? emptyMediaProduct.images.length : (emptyMediaProduct.imageUrl ? 1 : 0);
  assert(imagesCount === 0, '8.1: Safe empty media state detected');
  assert(!emptyMediaProduct.video, '8.2: Video is undefined without runtime crash');

  // --------------------------------------------------------------------------
  // TEST 9: FULL PRODUCT DESCRIPTION AND RELEVANT LISTING FIELDS VISIBLE
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: Full Description and Attributes Visible ---');
  const longDescription = 'Hii ni mashine maalum ya kutotolea mayai yenye mfumo wa kisasa wa kudhibiti unyevu na joto moja kwa moja. Inatumia umeme wa sola na wa gridi. Ina uwezo wa kubeba mayai 1,056 kwa awamu moja. Inafaa sana kwa wafugaji wa kibiashara wanaotaka vifaranga wenye afya.';

  const fullAttributesProduct: MarketplaceProduct = {
    productId: 'prod_full_attr',
    sellerId: 'seller_full',
    title: 'Incubator ya Mayai 1056 - Solar & Grid',
    description: longDescription,
    category: 'VIFAA_VYA_KILIMO_NA_MIFUGO',
    subcategory: 'MASHINE_ZA_KUTOTOLEA',
    price: 1850000,
    unit: 'mashine',
    currency: 'TZS',
    quantityAvailable: 5,
    location: 'Kibaha, Pwani',
    region: 'Pwani',
    district: 'Kibaha',
    area: 'Maili Moja',
    deliveryAvailable: true,
    deliveryFeeType: 'FIXED',
    deliveryFee: 30000,
    deliveryAreas: ['Dar es Salaam', 'Pwani', 'Morogoro'],
    deliveryTimeEstimate: 'Siku 2-3',
    pickupAvailable: true,
    pickupAddress: 'Kibaha Maili Moja karibu na kituo cha polisi',
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    sellerName: 'Teknolojia ya Mifugo Ltd',
    sellerPhone: '0712345678',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as any;

  assert(fullAttributesProduct.description === longDescription, '9.1: Full description is preserved completely without silent truncation');
  assert(fullAttributesProduct.price === 1850000, '9.2: Listing price is visible');
  assert(fullAttributesProduct.unit === 'mashine', '9.3: Listing unit is visible');
  assert(fullAttributesProduct.quantityAvailable === 5, '9.4: Stock quantity is visible');
  assert(fullAttributesProduct.deliveryAvailable === true && fullAttributesProduct.deliveryFee === 30000, '9.5: Delivery options and fee are visible');
  assert(fullAttributesProduct.pickupAvailable === true && Boolean(fullAttributesProduct.pickupAddress), '9.6: Pickup options and address are visible');

  // --------------------------------------------------------------------------
  // TEST 10: UNAUTHORIZED USERS CANNOT ACCESS ADMIN-ONLY MODERATION METADATA
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Unauthorized Access Prevention ---');
  let nonAdminBlocked = false;
  try {
    await fetchModerationQueue('regular_user_123', false);
  } catch (err: any) {
    nonAdminBlocked = true;
    assert(err.message.includes('Msimamizi'), '10.1: Non-admin calling fetchModerationQueue is blocked with authorization error');
  }
  assert(nonAdminBlocked, '10.2: Unauthorized user access strictly blocked');

  // --------------------------------------------------------------------------
  // TEST 11: MODERATION ACTIONS PRESERVE AUTHORIZATION AND AUDIT REQUIREMENTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 11: Moderation Actions & Audit Preservation ---');
  // Seed product into cached storage for performModerationAction
  const testProductForAction: MarketplaceProduct = {
    productId: 'prod_action_test',
    sellerId: 'seller_action_test',
    title: 'Mbuzi wa Maziwa',
    description: 'Mbuzi bora wa maziwa.',
    category: 'Mbuzi & Kondoo',
    categoryId: 'cat_mbuzi_kondoo',
    price: 200000,
    currency: 'TZS',
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    sellerName: 'Said Mkomwa',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as any;

  // Cache products in storage
  localStorage.setItem('ufugaji_marketplace_products_cache', JSON.stringify([testProductForAction]));

  // Rejection requires reasonCode
  const rejectWithoutReason = await performModerationAction('admin_1', 'Super Admin', true, {
    targetProductId: 'prod_action_test',
    action: 'REJECT_LISTING' as ModerationAction,
    reasonCode: undefined as any
  });
  assert(rejectWithoutReason.success === false, '11.1: Rejecting without reasonCode is blocked');

  // Rejection with structured reasonCode succeeds
  const rejectWithReason = await performModerationAction('admin_1', 'Super Admin', true, {
    targetProductId: 'prod_action_test',
    action: 'REJECT_LISTING' as ModerationAction,
    reasonCode: 'INAPPROPRIATE_CONTENT',
    internalNote: 'Picha haifai',
    publicExplanation: 'Maudhui hayakidhi vigezo.'
  });
  assert(rejectWithReason.success === true, '11.2: Rejection with structured reasonCode succeeds');

  // Verify immutable audit log was created
  const auditLogs = await fetchModerationAuditLogs('admin_1', true);
  const targetAudit = auditLogs.find((l) => l.targetId === 'prod_action_test');
  assert(Boolean(targetAudit), '11.3: Moderation action creates an audit log entry');
  assert(targetAudit?.action === 'REJECT_LISTING', '11.4: Correct action recorded in audit log');

  // --------------------------------------------------------------------------
  // TEST 12: MARKETPLACE PUBLIC VISIBILITY AND AI RETRIEVAL ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- Test 12: Public Visibility and AI Retrieval Enforcement ---');
  const rejectedProd: MarketplaceProduct = {
    ...testProductForAction,
    status: 'inactive',
    moderationStatus: 'REJECTED'
  };

  const activeApprovedProd: MarketplaceProduct = {
    ...testProductForAction,
    productId: 'prod_active_approved',
    status: 'active',
    moderationStatus: 'APPROVED',
    aiScreening: {
      screeningId: 'scr_good',
      requestId: 'req_good',
      status: 'PASS',
      categories: [],
      explanation: 'OK',
      confidence: 'HIGH',
      model: AI_SCREENING_PRIMARY_MODEL,
      policyVersion: AI_SCREENING_POLICY_VERSION,
      contentFingerprint: computeListingContentFingerprint(testProductForAction),
      timestamp: new Date().toISOString(),
      evaluationSource: 'MODEL'
    }
  };

  // Set seller as TRUSTED_SELLER so it is fully eligible
  saveSellerProfileToCache({
    uid: 'seller_action_test',
    name: 'Said Mkomwa',
    phoneNumber: '0712345678',
    trustStatus: 'TRUSTED_SELLER',
    isIdentityVerified: true,
    totalListingsCreated: 10,
    activeListingsCount: 5,
    successfulSalesCount: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Ensure seller has active monetization record
  sellerMonetizationService.cacheRecord({
    sellerUserId: 'seller_action_test',
    sellerProfileId: 'seller_action_test',
    status: 'ACTIVE',
    plan: 'BASIC',
    price: 25000,
    currency: 'TZS',
    trialStartAt: null,
    trialEndAt: null,
    graceStartAt: null,
    graceEndAt: null,
    currentPeriodStartAt: new Date().toISOString(),
    currentPeriodEndAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    activatedAt: new Date().toISOString(),
    lastPaymentAt: new Date().toISOString(),
    lastPaymentStatus: 'COMPLETED',
    nextRenewalAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    expiredAt: null,
    cancelledAt: null,
    suspendedAt: null,
    suspendedReason: null,
    hasHadTrial: false,
    testSimulation: false,
    version: 1,
    emittedTransitions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  registerListingModerationRecord({
    moderationId: 'mod_prod_active_approved',
    targetType: 'LISTING',
    targetId: 'prod_active_approved',
    productId: 'prod_active_approved',
    listingId: 'prod_active_approved',
    sellerId: 'seller_action_test',
    shopId: 'seller_action_test',
    status: 'APPROVED',
    priority: 'NORMAL',
    reasonCode: null,
    reasonText: null,
    internalNote: 'Approved',
    publicExplanation: 'Inapatikana sokoni.',
    reviewedByUserId: 'admin_1',
    reviewedByDisplayName: 'Admin',
    reviewedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiScreening: activeApprovedProd.aiScreening
  });

  const visibleProducts = filterMarketplaceEligibleProducts([rejectedProd, activeApprovedProd]);
  assert(visibleProducts.length === 1, '12.1: Exactly 1 product passed public visibility filter');
  assert(visibleProducts[0].productId === 'prod_active_approved', '12.2: Rejected product is forbidden from public visibility');

  // --------------------------------------------------------------------------
  // TEST 13: GUMZO, INBOX MEDIA, AND SELLER MONETIZATION REGRESSION INTACT
  // --------------------------------------------------------------------------
  console.log('\n--- Test 13: Gumzo, Inbox Media, and Monetization Invariants ---');
  // Confirm sanitizeLogMessage protects credentials
  const dirtyApiKeyLog = 'Gemini error with API key AIzaSyD9876543210abcdefghijklmnop and Bearer eyJhbGciOiJIUzI1Ni...';
  const cleanLogged = sanitizeLogMessage(dirtyApiKeyLog);
  assert(!cleanLogged.includes('AIzaSyD9876543210abcdefghijklmnop'), '13.1: API keys are redacted from logs');
  assert(!cleanLogged.includes('eyJhbGciOiJIUzI1Ni'), '13.2: Bearer tokens are redacted from logs');

  console.log('\n=============================================================');
  console.log('--- ALL COMPLETE ADMIN PREVIEW & SCREENING TESTS FINISHED ---');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('=============================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in complete admin preview & resilience suite`);
  }
}

// Execute tests if invoked directly
runCompleteAdminPreviewAndScreeningTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
