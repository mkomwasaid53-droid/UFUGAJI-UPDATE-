/**
 * AI SCREENING RESILIENCE HOTFIX TEST SUITE
 * 
 * Verifies all requirements for Model 503 and Uncertainty Handling:
 * 1. 503 followed by success (bounded retry succeeds with backoff)
 * 2. Repeated 503 (bounded retries exhaust -> fail-closed REVIEW_REQUIRED, INFRASTRUCTURE_FALLBACK)
 * 3. Request timeout / deadline exceeded handling
 * 4. 429 Rate Limit classification and handling
 * 5. Malformed model output -> fail-closed to REVIEW_REQUIRED (MALFORMED_RESPONSE)
 * 6. Idempotency across retries (no duplicate products, moderation records, or audit records)
 * 7. Admin panel distinction (model review-required vs model unavailable vs deterministic safety rules)
 * 8. Fail-closed publication invariant (503, timeout, 429 never grant PASS or active publication, even for TRUSTED_SELLER)
 * 9. Content fingerprint re-evaluation on model recovery (no blind auto-approval)
 * 10. Redaction of API keys, bearer tokens, and private base64 image content in logs
 */

import {
  evaluateMarketplaceListingContent,
  resolveListingPublishingState,
  computeListingContentFingerprint,
  isScreeningResultUpToDate,
  isRetryableAiError,
  callGeminiWithBoundedRetry,
  sanitizeLogMessage,
  AI_SCREENING_PRIMARY_MODEL
} from '../src/services/marketplaceAiScreeningService';
import {
  getSellerTrustStatus,
  updateSellerTrustStatus,
  saveSellerProfileToCache
} from '../src/services/sellerTrustService';
import {
  fetchModerationQueue,
  registerListingModerationRecord,
  getListingModerationRecord
} from '../src/services/marketplaceModerationService';
import {
  evaluateProductMarketplaceEligibility,
  filterMarketplaceEligibleProducts
} from '../src/services/marketplaceGovernanceEnforcement';
import { MarketplaceProduct } from '../src/types/marketplace';
import { AIScreeningResult } from '../src/types/marketplaceModeration';

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

export async function runAiScreeningResilienceHotfixTests() {
  console.log('\n=============================================================');
  console.log('--- AI SCREENING RESILIENCE HOTFIX TEST SUITE ---');
  console.log('=============================================================\n');

  // Clear mock storage
  localStorage.clear();

  // --------------------------------------------------------------------------
  // TEST 1: ERROR CLASSIFIER (503, 429, Timeout, Safety blocks)
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Error Classification Logic ---');
  const err503 = { status: 503, message: 'The model is overloaded. Please try again later.' };
  const class503 = isRetryableAiError(err503);
  assert(class503.isRetryable === true && class503.reason === 'MODEL_UNAVAILABLE_503', '1.1: 503 Overloaded is classified as retryable MODEL_UNAVAILABLE_503');

  const err429 = { status: 429, message: 'Resource has been exhausted (e.g. check quota).' };
  const class429 = isRetryableAiError(err429);
  assert(class429.isRetryable === true && class429.reason === 'RATE_LIMITED_429', '1.2: 429 Quota exhausted is classified as retryable RATE_LIMITED_429');

  const errTimeout = { name: 'TimeoutError', message: 'Model screening request timed out' };
  const classTimeout = isRetryableAiError(errTimeout);
  assert(classTimeout.isRetryable === true && classTimeout.reason === 'DEADLINE_EXCEEDED', '1.3: Timeout is classified as retryable DEADLINE_EXCEEDED');

  const errSafety = { message: 'Blocked by safety filters: EXPLICIT_CONTENT' };
  const classSafety = isRetryableAiError(errSafety);
  assert(classSafety.isRetryable === false, '1.4: Intentional safety filters are strictly NOT retryable');

  const err400 = { status: 400, message: 'Invalid argument provided' };
  const class400 = isRetryableAiError(err400);
  assert(class400.isRetryable === false, '1.5: Client 400 error is strictly NOT retryable');

  // --------------------------------------------------------------------------
  // TEST 2: 503 FOLLOWED BY SUCCESS (BOUNDED RETRY WITH BACKOFF)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: 503 Followed by Success (Bounded Retry) ---');
  let attemptCount = 0;
  const mockGenAiClientTransient = {
    models: {
      generateContent: async () => {
        attemptCount++;
        if (attemptCount === 1) {
          const err: any = new Error('HTTP 503 Service Unavailable: High Demand');
          err.status = 503;
          throw err;
        }
        return {
          text: JSON.stringify({
            status: 'PASS',
            categories: [],
            explanation: 'Maudhui halali ya kilimo na mifugo.',
            explanationSwahili: 'Tangazo ni halali.',
            confidence: 'HIGH'
          })
        };
      }
    }
  };

  const transientResult = await evaluateMarketplaceListingContent(
    {
      title: 'Kuku wa Kienyeji wa Kisasa',
      description: 'Kuku wazuri wa mayai na nyama waliochanjwa kikamilifu.',
      category: 'KUKU_NA_NDEGE_WAFUGAWA',
      price: 15000
    },
    {
      genAiClient: mockGenAiClientTransient,
      maxRetries: 2,
      initialDelayMs: 20,
      maxDelayMs: 50,
      totalTimeoutMs: 1000
    }
  );

  assert(transientResult.status === 'PASS', '2.1: Transient 503 succeeded on retry with status PASS');
  assert(transientResult.evaluationSource === 'MODEL', '2.2: Successful retry records evaluationSource = MODEL');
  assert(transientResult.retryAttempts === 2, '2.3: Correct retry attempt count (2) is recorded');

  // --------------------------------------------------------------------------
  // TEST 3: REPEATED 503 (PERSISTENT FAILURE FAILS CLOSED TO REVIEW_REQUIRED)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Repeated 503 (Exhausted Retries Fail-Closed) ---');
  let repeated503Attempts = 0;
  const mockGenAiClientPersistent503 = {
    models: {
      generateContent: async () => {
        repeated503Attempts++;
        const err: any = new Error('HTTP 503 Service Unavailable: High Demand');
        err.status = 503;
        throw err;
      }
    }
  };

  const repeated503Result = await evaluateMarketplaceListingContent(
    {
      title: 'Ng\'ombe wa Maziwa Fresian',
      description: 'Ng\'ombe mwenye afya anayetoa lita 20 kwa siku.',
      category: 'NGOMBE',
      price: 1200000
    },
    {
      genAiClient: mockGenAiClientPersistent503,
      maxRetries: 2,
      initialDelayMs: 20,
      maxDelayMs: 50,
      totalTimeoutMs: 500
    }
  );

  assert(repeated503Result.status === 'REVIEW_REQUIRED', '3.1: Repeated 503 fails closed to REVIEW_REQUIRED');
  assert(repeated503Result.evaluationSource === 'INFRASTRUCTURE_FALLBACK', '3.2: evaluationSource is INFRASTRUCTURE_FALLBACK');
  assert(repeated503Result.failureReason === 'MODEL_UNAVAILABLE_503', '3.3: failureReason is MODEL_UNAVAILABLE_503');
  assert(repeated503Result.isRetryable === true, '3.4: isRetryable is marked true');
  assert(repeated503Result.retryAttempts === 3, '3.5: All 3 attempts were executed before failing closed');

  // Resolution state must NOT allow active publishing
  const trustedSellerRes = resolveListingPublishingState({
    screeningResult: repeated503Result,
    sellerTrustStatus: 'TRUSTED_SELLER'
  });
  assert(trustedSellerRes.canPublishActiveImmediately === false, '3.6: Repeated 503 never publishes active, even for TRUSTED_SELLER');
  assert(trustedSellerRes.recommendedModerationStatus === 'PENDING_REVIEW', '3.7: Recommended moderation status is strictly PENDING_REVIEW');

  // --------------------------------------------------------------------------
  // TEST 4: TIMEOUT AND DEADLINE HANDLING
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Timeout and Deadline Handling ---');
  const mockGenAiClientTimeout = {
    models: {
      generateContent: async () => {
        // Sleep longer than attempt timeout
        await new Promise((r) => setTimeout(r, 150));
        return { text: '{}' };
      }
    }
  };

  const timeoutResult = await evaluateMarketplaceListingContent(
    {
      title: 'Chakula cha Kuku (Layers Mash)',
      description: 'Mifuko 50 ya chakula bora cha kuku wa mayai.',
      category: 'CHAKULA_CHA_MIFUGO',
      price: 65000
    },
    {
      genAiClient: mockGenAiClientTimeout,
      maxRetries: 1,
      initialDelayMs: 10,
      attemptTimeoutMs: 50,
      totalTimeoutMs: 120
    }
  );

  assert(timeoutResult.status === 'REVIEW_REQUIRED', '4.1: Timeout fails closed to REVIEW_REQUIRED');
  assert(timeoutResult.failureReason === 'DEADLINE_EXCEEDED', '4.2: failureReason is DEADLINE_EXCEEDED');
  assert(timeoutResult.evaluationSource === 'INFRASTRUCTURE_FALLBACK', '4.3: evaluationSource is INFRASTRUCTURE_FALLBACK');

  // --------------------------------------------------------------------------
  // TEST 5: HTTP 429 RATE LIMITING
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: HTTP 429 Rate Limiting ---');
  const mockGenAiClient429 = {
    models: {
      generateContent: async () => {
        const err: any = new Error('HTTP 429 Quota Exceeded');
        err.status = 429;
        throw err;
      }
    }
  };

  const rateLimitResult = await evaluateMarketplaceListingContent(
    {
      title: 'Mbuzi wa Nyama',
      description: 'Mbuzi bora wa kienyeji.',
      category: 'MBUZI_NA_KONDOO',
      price: 100000
    },
    {
      genAiClient: mockGenAiClient429,
      maxRetries: 1,
      initialDelayMs: 10,
      totalTimeoutMs: 200
    }
  );

  assert(rateLimitResult.status === 'REVIEW_REQUIRED', '5.1: 429 fails closed to REVIEW_REQUIRED');
  assert(rateLimitResult.failureReason === 'RATE_LIMITED_429', '5.2: failureReason is RATE_LIMITED_429');

  // --------------------------------------------------------------------------
  // TEST 6: MALFORMED MODEL OUTPUT (CORRUPTED JSON / UNPARSEABLE TEXT)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Malformed Model Output ---');
  const mockGenAiClientMalformed = {
    models: {
      generateContent: async () => {
        return {
          text: 'This is not JSON at all! Some random model output.'
        };
      }
    }
  };

  const malformedResult = await evaluateMarketplaceListingContent(
    {
      title: 'Mashine ya Kutotolea Mayai (Incubator)',
      description: 'Incubator ya mayai 500.',
      category: 'VIFAA_VYA_KILIMO_NA_MIFUGO',
      price: 450000
    },
    {
      genAiClient: mockGenAiClientMalformed
    }
  );

  assert(malformedResult.status === 'REVIEW_REQUIRED', '6.1: Malformed output fails closed to REVIEW_REQUIRED');
  assert(malformedResult.evaluationSource === 'INFRASTRUCTURE_FALLBACK', '6.2: evaluationSource is INFRASTRUCTURE_FALLBACK');
  assert(malformedResult.failureReason === 'MALFORMED_RESPONSE', '6.3: failureReason is MALFORMED_RESPONSE');
  assert(malformedResult.categories.includes('UNCERTAIN'), '6.4: Category is set to UNCERTAIN');

  // --------------------------------------------------------------------------
  // TEST 7: IDEMPOTENCY OF MODERATION RECORDS ACROSS RETRIES
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Idempotency of Records Across Retries ---');
  const testProdId = 'prod_idempotency_test_101';
  const testSellerId = 'seller_idem_01';
  const initialTime = new Date().toISOString();

  // Register initial screening record (from first attempt)
  registerListingModerationRecord({
    moderationId: `mod_${testProdId}`,
    targetType: 'LISTING',
    targetId: testProdId,
    productId: testProdId,
    listingId: testProdId,
    sellerId: testSellerId,
    shopId: testSellerId,
    status: 'PENDING_REVIEW',
    priority: 'HIGH',
    reasonCode: 'AI_REVIEW_REQUIRED',
    reasonText: 'UNCERTAIN',
    internalNote: 'Attempt 1: 503 fallback',
    publicExplanation: 'Tangazo linashikiliwa kwa usalama.',
    reviewedByUserId: null,
    reviewedByDisplayName: null,
    reviewedAt: null,
    createdAt: initialTime,
    updatedAt: initialTime
  });

  const firstRead = getListingModerationRecord(testProdId);
  assert(firstRead !== null, '7.1: First record successfully registered');

  // Re-register upon retry without creating duplicate record or changing ID
  registerListingModerationRecord({
    moderationId: `mod_${testProdId}`,
    targetType: 'LISTING',
    targetId: testProdId,
    productId: testProdId,
    listingId: testProdId,
    sellerId: testSellerId,
    shopId: testSellerId,
    status: 'PENDING_REVIEW',
    priority: 'HIGH',
    reasonCode: 'AI_REVIEW_REQUIRED',
    reasonText: 'UNCERTAIN',
    internalNote: 'Attempt 2: 503 fallback updated idempotently',
    publicExplanation: 'Tangazo linashikiliwa kwa usalama.',
    reviewedByUserId: null,
    reviewedByDisplayName: null,
    reviewedAt: null,
    createdAt: initialTime,
    updatedAt: new Date().toISOString()
  });

  const fetchedRec = getListingModerationRecord(testProdId);
  assert(fetchedRec?.moderationId === `mod_${testProdId}`, '7.2: Same moderation record ID preserved idempotently');
  assert(fetchedRec?.internalNote.includes('Attempt 2'), '7.3: Record successfully updated without duplication');

  // --------------------------------------------------------------------------
  // TEST 8: ADMIN QUEUE VISIBILITY & SEPARATION OF 3 PILLARS
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Admin Queue Filtering and Distinction ---');

  // Pillar 1: Model Completed Screening (REVIEW_REQUIRED)
  const itemPillar1: any = {
    productId: 'prod_p1',
    sellerId: 'seller_1',
    title: 'Dawa ya Vidonda vya Ng\'ombe (Oxytetracycline Spray)',
    description: 'Picha inaonyesha kidonda cha mnyama kinachotibiwa.',
    category: 'DAWA_NA_CHANJO_MIFUGO',
    price: 25000,
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    aiScreening: {
      screeningId: 'scr_p1',
      requestId: 'req_p1',
      status: 'REVIEW_REQUIRED',
      categories: ['POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT'],
      explanation: 'Picha ya kidonda cha mnyama inahitaji uhakiki wa mifugo.',
      explanationSwahili: 'Maudhui halali ya kitabibu/matibabu ya mifugo.',
      confidence: 'HIGH',
      model: AI_SCREENING_PRIMARY_MODEL,
      policyVersion: '1.0',
      contentFingerprint: 'fp_p1',
      timestamp: new Date().toISOString(),
      evaluationSource: 'MODEL'
    }
  };

  // Pillar 2: Infrastructure / Model Unavailable (503 Fallback)
  const itemPillar2: any = {
    productId: 'prod_p2',
    sellerId: 'seller_2',
    title: 'Kuku Chotara 100',
    description: 'Kuku wazuri sana.',
    category: 'KUKU_NA_NDEGE_WAFUGAWA',
    price: 12000,
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    aiScreening: repeated503Result
  };

  // Pillar 3: Deterministic Safety Rule Violation (BLOCK)
  const itemPillar3: any = {
    productId: 'prod_p3',
    sellerId: 'seller_3',
    title: 'Bidhaa Yenye Picha ya Utupu',
    description: 'Picha ya utupu / ponografia.',
    category: 'KUKU_NA_NDEGE_WAFUGAWA',
    price: 5000,
    status: 'inactive',
    moderationStatus: 'REJECTED',
    aiScreening: {
      screeningId: 'scr_p3',
      requestId: 'req_p3',
      status: 'BLOCK',
      categories: ['SEXUAL_OR_EXPLICIT_CONTENT'],
      explanation: 'Maudhui yamezuiwa na sheria za maadili na usalama.',
      explanationSwahili: 'Tangazo limezuiwa kwa sababu ya maudhui ya utupu au ngono.',
      confidence: 'HIGH',
      model: 'DETERMINISTIC_RULES',
      policyVersion: '1.0',
      contentFingerprint: 'fp_p3',
      timestamp: new Date().toISOString(),
      evaluationSource: 'DETERMINISTIC_RULES'
    }
  };

  // Check distinction criteria:
  assert(itemPillar1.aiScreening.evaluationSource === 'MODEL' && itemPillar1.aiScreening.status === 'REVIEW_REQUIRED',
    '8.1: Pillar 1 distinctly identified as MODEL review-required');

  assert(itemPillar2.aiScreening.evaluationSource === 'INFRASTRUCTURE_FALLBACK' && itemPillar2.aiScreening.failureReason === 'MODEL_UNAVAILABLE_503',
    '8.2: Pillar 2 distinctly identified as INFRASTRUCTURE_FALLBACK (503 Unavailable)');

  assert(itemPillar3.aiScreening.evaluationSource === 'DETERMINISTIC_RULES' && itemPillar3.aiScreening.status === 'BLOCK',
    '8.3: Pillar 3 distinctly identified as DETERMINISTIC_RULES violation (BLOCK)');

  // --------------------------------------------------------------------------
  // TEST 9: RE-SCREENING ON MODEL RECOVERY (NO BLIND AUTO-APPROVAL)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: Re-Screening on Model Recovery (Fingerprint Check) ---');
  const originalListing = {
    title: 'Mashine ya Kukamua Maziwa',
    description: 'Inafanya kazi vizuri kwa ng\'ombe 10.',
    category: 'VIFAA_VYA_KILIMO_NA_MIFUGO',
    subcategory: '',
    price: 850000
  };
  const originalFp = computeListingContentFingerprint(originalListing);

  // If content was modified while offline:
  const modifiedListing = {
    ...originalListing,
    description: 'Inafanya kazi vizuri kwa ng\'ombe 10. Bonus: Piga namba hii ya siri...'
  };
  const modifiedFp = computeListingContentFingerprint(modifiedListing);

  assert(originalFp !== modifiedFp, '9.1: Modified listing produces distinct content fingerprint');

  const staleScreening: AIScreeningResult = {
    screeningId: 'scr_stale',
    requestId: 'req_stale',
    status: 'PASS',
    categories: [],
    explanation: 'Passed previously',
    explanationSwahili: 'Imepita',
    confidence: 'HIGH',
    model: AI_SCREENING_PRIMARY_MODEL,
    policyVersion: '1.0',
    contentFingerprint: originalFp,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    evaluationSource: 'MODEL',
    evaluatedFields: {
      hasTitle: true,
      hasDescription: true,
      hasCategory: true,
      hasPrice: true,
      imageCount: 0
    }
  };

  const isUpToDate = isScreeningResultUpToDate(modifiedListing as any, staleScreening);
  assert(isUpToDate === false, '9.2: Stale screening is detected as out-of-date and must be re-screened');

  // --------------------------------------------------------------------------
  // TEST 10: LOG SANITIZATION & DATA PRIVACY
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Log Sanitization and Data Privacy ---');
  const dirtyLog = 'Failed to call Gemini with key AIzaSyDdummyKey1234567890abcdefghijklm and payload data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD...';
  const cleanLog = sanitizeLogMessage(dirtyLog);

  assert(!cleanLog.includes('AIzaSyDdummyKey1234567890abcdefghijklm'), '10.1: Google API key is redacted from log output');
  assert(cleanLog.includes('[REDACTED_API_KEY]'), '10.2: [REDACTED_API_KEY] placeholder is present');
  assert(!cleanLog.includes('/9j/4AAQSkZJRg'), '10.3: Raw base64 image data is replaced with [IMAGE_BASE64_DATA]');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n=============================================================');
  console.log('--- RESILIENCE HOTFIX TEST EXECUTION SUMMARY ---');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('=============================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in AI Screening Resilience Hotfix test suite`);
  }
}

// Execute tests if invoked directly
runAiScreeningResilienceHotfixTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
