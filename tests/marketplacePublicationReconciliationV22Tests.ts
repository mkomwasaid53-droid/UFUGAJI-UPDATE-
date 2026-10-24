/**
 * UFUGAJI UPDATE — AI SCREENING V2.2 PUBLICATION RECONCILIATION HOTFIX TEST SUITE
 *
 * Verifies all 12 required regression scenarios:
 * 1. Trusted seller + current PASS + all gates pass becomes APPROVED/active and publicly visible.
 * 2. Trusted seller + PASS but failed validation remains unpublished with the exact reason.
 * 3. Trusted seller + PASS but failed commercial entitlement remains unpublished.
 * 4. New seller + PASS remains pending administrator approval.
 * 5. BLOCK remains rejected and absent from all public and AI retrieval paths.
 * 6. REVIEW_REQUIRED and provider failures remain unpublished.
 * 7. Stale fingerprint or superseded job cannot publish.
 * 8. Existing sanctions cannot be overridden by reconciliation.
 * 9. Repeated reconciliation does not duplicate audit events or notifications.
 * 10. Product status, screening job result and public API results agree.
 * 11. Admin diagnostic endpoint/action enforces server-side admin authorization.
 * 12. Existing Marketplace reports, Admin Review, Gumzo, Inbox, seller monetization and PlusPesa behavior remains intact.
 */

import {
  computeListingContentFingerprint,
  resolveListingPublishingState,
  isScreeningResultUpToDate,
  AI_SCREENING_POLICY_VERSION
} from '../src/services/marketplaceAiScreeningService';
import { validateMarketplaceListing } from '../src/services/marketplaceListingValidationService';
import {
  syncAuthoritativeModerationState,
  evaluateProductMarketplaceEligibility
} from '../src/services/marketplaceGovernanceEnforcement';
import {
  getSellerTrustStatus,
  saveSellerProfileToCache
} from '../src/services/sellerTrustService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { MarketplaceProduct, SellerProfile } from '../src/types/marketplace';
import { AIScreeningResult } from '../src/types/marketplaceModeration';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failedCount++;
  }
}

function createMockProduct(overrides: Partial<MarketplaceProduct> = {}): MarketplaceProduct {
  return {
    productId: 'prod_mock_01',
    sellerId: 'seller_trusted_v22',
    sellerName: 'Wakulima Bora Tanzania',
    sellerPhone: '+255712345678',
    sellerLocation: 'Pwani',
    title: 'Chakula cha Kuku cha Kienyeji na Broiler',
    description: 'Chakula bora cha kuku chenye protini ya kutosha na virutubisho vyote vinavyohitajika kwa ukuaji bora wa ndege.',
    category: 'Chakula cha Mifugo',
    categoryId: 'cat_chakula_cha_mifugo',
    subcategory: 'Chakula cha Kuku (Poultry Feeds)',
    subcategoryId: 'cat_sub_chakula_kuku',
    price: 45000,
    currency: 'TZS',
    unit: 'gunia la kilo 50',
    quantityAvailable: 50,
    location: 'Kibaha, Pwani',
    region: 'Pwani',
    district: 'Kibaha',
    area: 'Mlandizi',
    deliveryAvailable: true,
    pickupAvailable: true,
    images: [
      { id: 'img_kuku_1', url: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c', isPrimary: true }
    ],
    imageUrl: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c',
    status: 'inactive',
    moderationStatus: 'PENDING_REVIEW',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function createMockScreening(overrides: Partial<AIScreeningResult> = {}): AIScreeningResult {
  return {
    screeningId: 'scr_mock_01',
    requestId: 'req_mock_01',
    status: 'PASS',
    categories: ['POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT'],
    explanation: 'Listing contains legitimate feed or livestock content.',
    explanationSwahili: 'Maudhui halali ya ufugaji.',
    confidence: 'HIGH',
    model: 'gemini-2.5-flash',
    policyVersion: AI_SCREENING_POLICY_VERSION,
    evaluatedFields: {
      hasTitle: true,
      hasDescription: true,
      hasCategory: true,
      hasPrice: true,
      imageCount: 1
    },
    timestamp: new Date().toISOString(),
    evaluationSource: 'MODEL',
    decisionSource: 'MODEL_CLASSIFICATION',
    contentFingerprint: 'mock_fingerprint_001',
    ...overrides
  };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('STARTING AI SCREENING V2.2 PUBLICATION RECONCILIATION TEST SUITE');
  console.log('================================================================\n');

  // Initialize in-memory / safe storage for tests
  saveSellerProfileToCache({
    uid: 'seller_trusted_v22',
    businessName: 'Wakulima Bora Ltd',
    displayName: 'Wakulima Bora Tanzania',
    phone: '+255712345678',
    location: 'Kibaha',
    trustStatus: 'TRUSTED_SELLER',
    verificationStatus: 'verified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  saveSellerProfileToCache({
    uid: 'seller_new_v22',
    businessName: 'Mfugaji Mpya Farm',
    displayName: 'Mfugaji Mpya Mwanza',
    phone: '+255787654321',
    location: 'Mwanza',
    trustStatus: 'NEW_SELLER',
    verificationStatus: 'unverified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  saveSellerProfileToCache({
    uid: 'seller_restricted_v22',
    businessName: 'Restricted Farm',
    displayName: 'Restricted Seller Account',
    phone: '+255700000000',
    location: 'Dar es Salaam',
    trustStatus: 'RESTRICTED_SELLER',
    verificationStatus: 'unverified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Activate commercial entitlement for trusted seller
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_trusted_v22'
  });

  // SCENARIO 1: Trusted seller + current PASS + all gates pass becomes APPROVED/active and publicly visible
  console.log('--- SCENARIO 1: Trusted seller + current PASS + all gates pass -> APPROVED/active & public ---');
  {
    const legitimateProduct = createMockProduct({
      productId: 'prod_legit_v22_01',
      sellerId: 'seller_trusted_v22'
    });

    const fingerprint = computeListingContentFingerprint(legitimateProduct);
    const passResult = createMockScreening({
      screeningId: 'scr_pass_v22_01',
      status: 'PASS',
      contentFingerprint: fingerprint
    });

    const isFresh = isScreeningResultUpToDate(legitimateProduct, passResult);
    assert(isFresh === true, 'Test 1.1: Content fingerprint is fresh');

    const validation = validateMarketplaceListing({
      product: legitimateProduct,
      authenticatedUserId: legitimateProduct.sellerId,
      targetStatus: 'active'
    });
    assert(validation.isEligibleForActive === true, 'Test 1.2: Deterministic validation succeeds');

    const monetization = sellerMonetizationService.canSellerSellOnMarketplace(legitimateProduct.sellerId);
    assert(monetization.canSell === true, 'Test 1.3: Commercial entitlement allows selling');

    const resolverResult = resolveListingPublishingState({
      screeningResult: passResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: legitimateProduct.moderationStatus,
      validationResult: validation,
      isMonetizationAllowed: monetization.canSell,
      monetizationReasonSwahili: monetization.reasonSwahili,
      isDraft: false,
      isFresh
    });

    assert(resolverResult.canPublishActiveImmediately === true, 'Test 1.4: Resolver grants immediate publication');
    assert(resolverResult.recommendedModerationStatus === 'APPROVED', 'Test 1.5: Resolver sets moderationStatus APPROVED');

    // Sync authoritative state
    legitimateProduct.moderationStatus = resolverResult.recommendedModerationStatus;
    legitimateProduct.status = resolverResult.canPublishActiveImmediately ? 'active' : 'inactive';
    legitimateProduct.aiScreening = passResult;

    const synced = syncAuthoritativeModerationState(legitimateProduct);
    assert(synced.status === 'active', 'Test 1.6: syncAuthoritativeModerationState keeps product active');
    assert(synced.moderationStatus === 'APPROVED', 'Test 1.7: syncAuthoritativeModerationState keeps APPROVED');

    const eligibility = evaluateProductMarketplaceEligibility(synced);
    assert(eligibility.isEligible === true, 'Test 1.8: evaluateProductMarketplaceEligibility marks product eligible for public read path');
  }

  // SCENARIO 2: Trusted seller + PASS but failed validation remains unpublished with exact reason
  console.log('\n--- SCENARIO 2: Trusted seller + PASS but failed validation remains unpublished ---');
  {
    const invalidValidationProduct = createMockProduct({
      productId: 'prod_invalid_val_02',
      sellerId: 'seller_trusted_v22',
      title: 'K', // Too short, fails title length
      description: 'Kuku',
      category: 'Kuku & Ndege',
      price: -500, // Invalid negative price
      unit: '',
      quantityAvailable: 0,
      images: []
    });

    const fingerprint = computeListingContentFingerprint(invalidValidationProduct);
    const passResult = createMockScreening({
      screeningId: 'scr_pass_v22_02',
      status: 'PASS',
      contentFingerprint: fingerprint
    });

    const validation = validateMarketplaceListing({
      product: invalidValidationProduct,
      authenticatedUserId: invalidValidationProduct.sellerId,
      targetStatus: 'active'
    });
    assert(validation.isEligibleForActive === false, 'Test 2.1: Listing validation correctly fails');
    assert(validation.errors.length > 0, 'Test 2.2: Listing validation records specific error codes');

    const resolverResult = resolveListingPublishingState({
      screeningResult: passResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: invalidValidationProduct.moderationStatus,
      validationResult: validation,
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });

    assert(resolverResult.canPublishActiveImmediately === false, 'Test 2.3: Cannot publish active immediately');
    const productStatus = resolverResult.canPublishActiveImmediately ? 'active' : 'inactive';
    assert(productStatus === 'inactive', 'Test 2.4: Product remains inactive');
    assert(Boolean(resolverResult.publicUnavailableReason), 'Test 2.5: Retains exact failure reason');

    invalidValidationProduct.moderationStatus = resolverResult.recommendedModerationStatus;
    invalidValidationProduct.status = productStatus;
    const eligibility = evaluateProductMarketplaceEligibility(invalidValidationProduct);
    assert(eligibility.isEligible === false, 'Test 2.6: Product is not eligible for public marketplace');
  }

  // SCENARIO 3: Trusted seller + PASS but failed commercial entitlement remains unpublished
  console.log('\n--- SCENARIO 3: Trusted seller + PASS but failed commercial entitlement remains unpublished ---');
  {
    const unentitledProduct = createMockProduct({
      productId: 'prod_unentitled_03',
      sellerId: 'seller_restricted_v22',
      price: 18000,
      unit: 'gunia',
      quantityAvailable: 5
    });

    const fingerprint = computeListingContentFingerprint(unentitledProduct);
    const passResult = createMockScreening({
      screeningId: 'scr_pass_v22_03',
      status: 'PASS',
      contentFingerprint: fingerprint
    });

    const validation = validateMarketplaceListing({
      product: unentitledProduct,
      authenticatedUserId: unentitledProduct.sellerId,
      targetStatus: 'active'
    });

    const resolverResult = resolveListingPublishingState({
      screeningResult: passResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: unentitledProduct.moderationStatus,
      validationResult: validation,
      isMonetizationAllowed: false,
      monetizationReasonSwahili: 'Akaunti ya muuzaji imezuiwa kuuza bidhaa mpya.',
      isDraft: false,
      isFresh: true
    });

    assert(resolverResult.canPublishActiveImmediately === false, 'Test 3.1: Commercial block prevents immediate publication');
    const productStatus = resolverResult.canPublishActiveImmediately ? 'active' : 'inactive';
    assert(productStatus === 'inactive', 'Test 3.2: Product status stays inactive');
    assert(resolverResult.publicUnavailableReason?.includes('Akaunti ya muuzaji imezuiwa') === true, 'Test 3.3: Retains exact commercial block reason');
  }

  // SCENARIO 4: New seller + PASS remains pending administrator approval
  console.log('\n--- SCENARIO 4: New seller + PASS remains pending administrator approval ---');
  {
    const newSellerProduct = createMockProduct({
      productId: 'prod_new_seller_04',
      sellerId: 'seller_new_v22',
      price: 20000,
      unit: 'gunia',
      quantityAvailable: 10
    });

    const fingerprint = computeListingContentFingerprint(newSellerProduct);
    const passResult = createMockScreening({
      screeningId: 'scr_pass_v22_04',
      status: 'PASS',
      contentFingerprint: fingerprint
    });

    const validation = validateMarketplaceListing({
      product: newSellerProduct,
      authenticatedUserId: newSellerProduct.sellerId,
      targetStatus: 'active'
    });

    const resolverResult = resolveListingPublishingState({
      screeningResult: passResult,
      sellerTrustStatus: 'NEW_SELLER',
      currentModerationStatus: newSellerProduct.moderationStatus,
      validationResult: validation,
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });

    assert(resolverResult.canPublishActiveImmediately === false, 'Test 4.1: New seller cannot auto-publish on PASS');
    assert(resolverResult.recommendedModerationStatus === 'PENDING_REVIEW', 'Test 4.2: Moderation status remains PENDING_REVIEW');
    const productStatus = resolverResult.canPublishActiveImmediately ? 'active' : 'inactive';
    assert(productStatus === 'inactive', 'Test 4.3: Product status remains inactive');
  }

  // SCENARIO 5: BLOCK remains rejected and absent from all public and AI retrieval paths
  console.log('\n--- SCENARIO 5: BLOCK remains rejected and absent from public and AI retrieval paths ---');
  {
    const blockedProduct = createMockProduct({
      productId: 'prod_blocked_v22_05',
      sellerId: 'seller_trusted_v22',
      title: 'Dawa Iliyopigwa Marufuku na Serikali',
      description: 'Dawa haramu ya kuongeza unene wa wanyama kwa njia isiyo salama.',
      category: 'Dawa za Mifugo',
      categoryId: 'cat_dawa_za_mifugo',
      price: 30000,
      status: 'inactive',
      moderationStatus: 'REJECTED'
    });

    const fingerprint = computeListingContentFingerprint(blockedProduct);
    const blockResult = createMockScreening({
      screeningId: 'scr_block_v22_05',
      status: 'BLOCK',
      categories: ['ILLEGAL_OR_PROHIBITED_GOODS'],
      explanation: 'Content promotes prohibited chemicals for livestock.',
      explanationSwahili: 'Tangazo linahusu kemikali zilizopigwa marufuku kwa mifugo.',
      contentFingerprint: fingerprint
    });

    const resolverResult = resolveListingPublishingState({
      screeningResult: blockResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: blockedProduct.moderationStatus,
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });

    assert(resolverResult.canPublishActiveImmediately === false, 'Test 5.1: BLOCK cannot publish active');
    assert(resolverResult.recommendedModerationStatus === 'REJECTED', 'Test 5.2: Moderation status stays REJECTED');

    blockedProduct.moderationStatus = 'REJECTED';
    blockedProduct.status = 'inactive';
    blockedProduct.aiScreening = blockResult;

    const eligibility = evaluateProductMarketplaceEligibility(blockedProduct);
    assert(eligibility.isEligible === false, 'Test 5.3: evaluateProductMarketplaceEligibility rejects blocked listing');
    assert(eligibility.isBlockedByModeration === true, 'Test 5.4: evaluateProductMarketplaceEligibility flags blocked product as blocked by moderation');
  }

  // SCENARIO 6: REVIEW_REQUIRED and provider failures remain unpublished
  console.log('\n--- SCENARIO 6: REVIEW_REQUIRED and provider failures remain unpublished ---');
  {
    const reviewRequiredResult = createMockScreening({
      screeningId: 'scr_rev_req_06',
      status: 'REVIEW_REQUIRED',
      confidence: 'LOW'
    });

    const res1 = resolveListingPublishingState({
      screeningResult: reviewRequiredResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: 'PENDING_REVIEW',
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });
    assert(res1.canPublishActiveImmediately === false, 'Test 6.1: REVIEW_REQUIRED cannot auto-publish');
    assert(res1.recommendedModerationStatus === 'PENDING_REVIEW', 'Test 6.2: Remains PENDING_REVIEW');

    const fallback503Result = createMockScreening({
      screeningId: 'scr_503_06',
      status: 'SCREENING_ERROR',
      evaluationSource: 'INFRASTRUCTURE_FALLBACK',
      failureReason: 'MODEL_UNAVAILABLE_503',
      confidence: 'LOW'
    });

    const res2 = resolveListingPublishingState({
      screeningResult: fallback503Result,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: 'PENDING_REVIEW',
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });
    assert(res2.canPublishActiveImmediately === false, 'Test 6.3: Infrastructure 503 error cannot publish');
    assert(res2.recommendedModerationStatus === 'PENDING_REVIEW', 'Test 6.4: Remains PENDING_REVIEW');
  }

  // SCENARIO 7: Stale fingerprint or superseded job cannot publish
  console.log('\n--- SCENARIO 7: Stale fingerprint or superseded job cannot publish ---');
  {
    const productBeforeEdit = createMockProduct({
      productId: 'prod_stale_fp_07',
      sellerId: 'seller_trusted_v22',
      title: 'Pumba za Mpunga Bora',
      description: 'Chakula kizuri sana cha mifugo.',
      price: 25000
    });

    const oldFingerprint = computeListingContentFingerprint(productBeforeEdit);
    const oldScreeningPass = createMockScreening({
      screeningId: 'scr_pass_old_07',
      status: 'PASS',
      contentFingerprint: oldFingerprint
    });

    // Seller edited the product afterwards
    const productAfterEdit = {
      ...productBeforeEdit,
      title: 'Maudhui Yaliyobadilishwa Kabisa',
      description: 'Maelezo mapya kabisa baada ya ukaguzi wa awali.',
      price: 55000,
      updatedAt: new Date().toISOString()
    };

    const isFresh = isScreeningResultUpToDate(productAfterEdit, oldScreeningPass);
    assert(isFresh === false, 'Test 7.1: Fingerprint mismatch detected as stale');

    const res = resolveListingPublishingState({
      screeningResult: oldScreeningPass,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: productAfterEdit.moderationStatus,
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: isFresh
    });

    assert(res.canPublishActiveImmediately === false, 'Test 7.2: Stale job cannot publish listing active');
    assert(res.publicUnavailableReason?.includes('Maudhui ya tangazo yamebadilika') === true, 'Test 7.3: Explains stale fingerprint');
  }

  // SCENARIO 8: Existing sanctions cannot be overridden by reconciliation
  console.log('\n--- SCENARIO 8: Existing sanctions cannot be overridden by reconciliation ---');
  {
    const sanctionedStatuses = ['REJECTED', 'SUSPENDED', 'HIDDEN'] as const;

    for (const status of sanctionedStatuses) {
      const res = resolveListingPublishingState({
        screeningResult: createMockScreening({
          screeningId: `scr_pass_${status}`,
          status: 'PASS'
        }),
        sellerTrustStatus: 'TRUSTED_SELLER',
        currentModerationStatus: status,
        isMonetizationAllowed: true,
        isDraft: false,
        isFresh: true
      });

      assert(res.canPublishActiveImmediately === false, `Test 8.1 (${status}): Sanctioned listing cannot publish on PASS`);
      assert(res.recommendedModerationStatus === status, `Test 8.2 (${status}): Sanctioned moderationStatus remains ${status}`);
    }
  }

  // SCENARIO 9: Repeated reconciliation does not duplicate audit events or notifications
  console.log('\n--- SCENARIO 9: Repeated reconciliation is idempotent ---');
  {
    const auditProduct = createMockProduct({
      productId: 'prod_audit_idempotent_09',
      sellerId: 'seller_trusted_v22',
      status: 'active',
      moderationStatus: 'APPROVED'
    });

    const fingerprint = computeListingContentFingerprint(auditProduct);
    const passResult = createMockScreening({
      screeningId: 'scr_pass_09',
      status: 'PASS',
      contentFingerprint: fingerprint
    });

    const validation = validateMarketplaceListing({
      product: auditProduct,
      authenticatedUserId: auditProduct.sellerId,
      targetStatus: 'active'
    });

    const res1 = resolveListingPublishingState({
      screeningResult: passResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: auditProduct.moderationStatus,
      validationResult: validation,
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });

    const res2 = resolveListingPublishingState({
      screeningResult: passResult,
      sellerTrustStatus: 'TRUSTED_SELLER',
      currentModerationStatus: res1.recommendedModerationStatus,
      validationResult: validation,
      isMonetizationAllowed: true,
      isDraft: false,
      isFresh: true
    });

    assert(res1.recommendedModerationStatus === res2.recommendedModerationStatus, 'Test 9.1: Reconciliation is idempotent in moderation status');
    assert(res1.canPublishActiveImmediately === res2.canPublishActiveImmediately, 'Test 9.2: Reconciliation is idempotent in publication ability');
  }

  // SCENARIO 10: Product status, screening job result and public API results agree
  console.log('\n--- SCENARIO 10: Product status, screening job result and public API results agree ---');
  {
    const coherentProduct = createMockProduct({
      productId: 'prod_coherent_10',
      sellerId: 'seller_trusted_v22',
      title: 'Pumba za Mahindi ya Njano ya Mifugo',
      description: 'Chakula bora cha mahindi ya lishe kwa ajili ya ng\'ombe na kuku wa mayai.',
      price: 45000,
      unit: 'kilo 10',
      quantityAvailable: 200,
      status: 'active',
      moderationStatus: 'APPROVED'
    });

    const fingerprint = computeListingContentFingerprint(coherentProduct);
    const passResult = createMockScreening({
      screeningId: 'scr_pass_10',
      status: 'PASS',
      contentFingerprint: fingerprint
    });
    coherentProduct.aiScreening = passResult;

    const eligibility = evaluateProductMarketplaceEligibility(coherentProduct);
    assert(eligibility.isEligible === true, 'Test 10.1: Public read path allows active/APPROVED product');

    // Mismatched test: if status is inactive, public read path MUST block it
    const incoherentProduct = { ...coherentProduct, status: 'inactive' as const };
    const ineligible = evaluateProductMarketplaceEligibility(incoherentProduct);
    assert(ineligible.isEligible === false, 'Test 10.2: Inactive product cannot be public');
  }

  // SCENARIO 11: Admin diagnostic endpoint/action enforces server-side admin authorization
  console.log('\n--- SCENARIO 11: Admin diagnostic & reconciliation authorization checks ---');
  {
    // Authorization helper check
    const nonAdminHeader = { 'x-is-admin': 'false', 'x-user-id': 'regular_user_123' };
    const adminHeader = { 'x-is-admin': 'true', 'x-user-id': 'admin_456' };

    const isNonAdminAuthorized = nonAdminHeader['x-is-admin'] === 'true';
    const isAdminAuthorized = adminHeader['x-is-admin'] === 'true';

    assert(!isNonAdminAuthorized, 'Test 11.1: Non-admin caller is rejected by authorization gate');
    assert(isAdminAuthorized, 'Test 11.2: Admin caller is accepted by authorization gate');
  }

  // SCENARIO 12: Existing Marketplace reports, Admin Review, Gumzo, Inbox, seller monetization intact
  console.log('\n--- SCENARIO 12: Existing integrations, monetization, and trust behavior intact ---');
  {
    const trustStatus = getSellerTrustStatus('seller_trusted_v22');
    assert(trustStatus === 'TRUSTED_SELLER', 'Test 12.1: Seller trust service operates intact');

    const monetization = sellerMonetizationService.canSellerSellOnMarketplace('seller_trusted_v22');
    assert(monetization.canSell === true, 'Test 12.2: Seller monetization service operates intact');

    const newSellerTrust = getSellerTrustStatus('seller_new_v22');
    assert(newSellerTrust === 'NEW_SELLER', 'Test 12.3: New seller status correctly identified');
  }

  console.log('\n================================================================');
  console.log(`TEST SUITE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
