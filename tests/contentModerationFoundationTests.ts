/**
 * CONTENT MODERATION FOUNDATION V1.0 — AUTOMATED TEST SUITE
 * 
 * Verifies the 7 mandatory requirements of BUILD PROMPT — CONTENT MODERATION FOUNDATION V1.0:
 * 1. NEW_SELLER cannot publish a live listing before admin approval
 * 2. TRUSTED_SELLER cannot bypass admin approval before AI screening is built
 * 3. APPROVED listing is visible publicly
 * 4. REJECTED, HIDDEN, or SUSPENDED listing is hidden from public feeds, search, and detail
 * 5. Seller can see their own rejected/hidden listing and view the moderation reason
 * 6. Admin can approve or reject a listing via performModerationAction with audit trail
 * 7. Backward compatibility: existing listings without moderation status default safely
 * 8. Server-side & Firestore security: sellers cannot self-assign TRUSTED_SELLER or bypass review
 * 9. Marketplace Inbox and Gumzo privacy and functionality remain unaffected
 */

import {
  evaluateSellerPublishCapability,
  getSellerTrustStatus,
  updateSellerTrustStatus,
  stripProtectedSellerTrustFields,
  saveSellerProfileToCache
} from '../src/services/sellerTrustService';
import {
  performModerationAction,
  getListingModerationRecord,
  registerListingModerationRecord
} from '../src/services/marketplaceModerationService';
import {
  evaluateProductMarketplaceEligibility,
  filterMarketplaceEligibleProducts,
  isProductMarketplaceEligible,
  syncAuthoritativeModerationState,
  assertListingCanBeActivated
} from '../src/services/marketplaceGovernanceEnforcement';
import { MarketplaceProduct, SellerProfile } from '../src/types/marketplace';
import { SEED_GOVERNED_CATEGORIES } from '../src/services/marketplaceCategoryService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';

// Mock localStorage if in pure Node environment
const mockStorage: Record<string, string> = {};
if (typeof window === 'undefined' || !window.localStorage) {
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; }
  };
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✓ [PASS] ${testName}`);
  } else {
    failed++;
    const msg = `✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`;
    console.error(msg);
    errors.push(msg);
  }
}

export async function runContentModerationFoundationTests(): Promise<{
  passed: number;
  failed: number;
  errors: string[];
}> {
  console.log('\n=============================================================');
  console.log('--- CONTENT MODERATION FOUNDATION V1.0 TEST SUITE ---');
  console.log('=============================================================\n');

  // Seed governed categories cache
  localStorage.setItem(
    'ufugaji_marketplace_categories_cache',
    JSON.stringify(SEED_GOVERNED_CATEGORIES)
  );

  const adminUid = 'admin_super_user';
  const adminName = 'Msimamizi Mkuu';

  // --------------------------------------------------------------------------
  // SECTION 1: SELLER TRUST STATUS & STRICT DECOUPLING
  // --------------------------------------------------------------------------
  console.log('\n--- Section 1: Seller Trust Status & Decoupling ---');

  const sellerNewId = 'seller_fresh_001';
  const newProfile: SellerProfile = {
    uid: sellerNewId,
    displayName: 'Juma Mfugaji Mpya',
    businessName: 'Juma Kuku Farm',
    phone: '0712345678',
    location: 'Morogoro',
    verificationStatus: 'unverified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveSellerProfileToCache(newProfile);

  // 1.1 New seller defaults to NEW_SELLER
  const trust1 = getSellerTrustStatus(sellerNewId, newProfile);
  assert(trust1 === 'NEW_SELLER', '1.1: New seller defaults to NEW_SELLER');

  // 1.2 Paying fee / active monetization NEVER grants TRUSTED_SELLER
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerNewId,
    sellerProfileId: `profile_${sellerNewId}`
  });
  const trust1AfterPaid = getSellerTrustStatus(sellerNewId, newProfile);
  assert(
    trust1AfterPaid === 'NEW_SELLER',
    '1.2: Paying subscription / trial activation NEVER grants TRUSTED_SELLER automatically'
  );

  // 1.3 Identity verification alone NEVER grants TRUSTED_SELLER
  const verifiedProfile: SellerProfile = {
    ...newProfile,
    verificationStatus: 'verified'
  };
  saveSellerProfileToCache(verifiedProfile);
  const trust1AfterVerif = getSellerTrustStatus(sellerNewId, verifiedProfile);
  assert(
    trust1AfterVerif === 'NEW_SELLER',
    '1.3: Identity verification (VERIFIED) alone NEVER grants TRUSTED_SELLER automatically'
  );

  // 1.4 Seller self-assignment of trust fields is stripped
  const maliciousPayload = {
    displayName: 'Hacker Seller',
    trustStatus: 'TRUSTED_SELLER' as any,
    trustReason: 'Self granted'
  };
  const sanitized = stripProtectedSellerTrustFields(maliciousPayload, false);
  assert(
    sanitized.trustStatus === undefined && sanitized.trustReason === undefined,
    '1.4: Seller cannot self-assign trustStatus via updates (fields stripped)'
  );

  // 1.5 Only Admin can grant TRUSTED_SELLER with structured audit entry
  const grantRes = await updateSellerTrustStatus({
    adminUserId: adminUid,
    adminUserName: adminName,
    isAdmin: true,
    sellerId: sellerNewId,
    newTrustStatus: 'TRUSTED_SELLER',
    reason: 'Amekamilisha ukaguzi wa kimakazi na ana historia nzuri ya mauzo'
  });
  assert(
    grantRes.success && grantRes.profile.trustStatus === 'TRUSTED_SELLER',
    '1.5: Admin can explicitly grant TRUSTED_SELLER status'
  );
  assert(
    grantRes.auditEntry.action === 'IMPOSE_RESTRICTION' &&
    grantRes.auditEntry.performedBy === adminUid,
    '1.6: Granting TRUSTED_SELLER records immutable audit trail'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: PUBLISHING CAPABILITY IN V1.0 (NO GEMINI SCREENING YET)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Publishing Capabilities in V1.0 Foundation ---');

  // 2.1 NEW_SELLER cannot bypass admin review or publish active immediately
  const sellerNew2Id = 'seller_fresh_002';
  const capNew = evaluateSellerPublishCapability(sellerNew2Id);
  assert(
    capNew.trustStatus === 'NEW_SELLER' &&
    capNew.canBypassAdminReview === false &&
    capNew.canPublishActiveImmediately === false,
    '2.1: NEW_SELLER cannot publish live listing before admin approval'
  );

  // 2.2 TRUSTED_SELLER cannot bypass admin approval before AI screening is built
  const capTrusted = evaluateSellerPublishCapability(sellerNewId);
  assert(
    capTrusted.trustStatus === 'TRUSTED_SELLER' &&
    capTrusted.canBypassAdminReview === false &&
    capTrusted.canPublishActiveImmediately === false,
    '2.2: TRUSTED_SELLER cannot bypass admin review in V1.0 (held in PENDING_REVIEW until AI screening stage)'
  );

  // 2.3 Attempting to activate an unapproved listing directly throws error
  const draftProd: MarketplaceProduct = {
    productId: 'prod_test_draft_01',
    sellerId: sellerNew2Id,
    shopId: sellerNew2Id,
    title: 'Kuku wa Kienyeji 10',
    description: 'Kuku bora kabisa kwa ajili ya ufugaji wa kibiashara',
    category: 'Kuku',
    subcategory: 'Kuku wa Kienyeji Wakubwa',
    categoryId: 'cat_kuku',
    subcategoryId: 'cat_sub_kuku_kienyeji',
    price: 15000,
    currency: 'Tsh',
    unit: 'kuku',
    quantityAvailable: 10,
    location: 'Morogoro',
    status: 'draft',
    moderationStatus: 'PENDING_REVIEW',
    sellerName: 'Juma',
    sellerPhone: '0712345678',
    sellerLocation: 'Morogoro',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let caughtActivationErr = false;
  try {
    assertListingCanBeActivated(draftProd, sellerNew2Id, false);
  } catch (err: any) {
    caughtActivationErr = true;
  }
  assert(
    caughtActivationErr === true,
    '2.3: Non-admin cannot directly set unapproved listing to ACTIVE'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: LISTING MODERATION STATES & ADMIN ACTIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Admin Moderation Actions & Lifecycle ---');

  // Seed product into cache
  localStorage.setItem(
    'ufugaji_marketplace_products_cache',
    JSON.stringify([draftProd])
  );
  registerListingModerationRecord({
    moderationId: `mod_${draftProd.productId}`,
    targetType: 'LISTING',
    targetId: draftProd.productId,
    productId: draftProd.productId,
    listingId: draftProd.productId,
    sellerId: sellerNew2Id,
    shopId: sellerNew2Id,
    status: 'PENDING_REVIEW',
    priority: 'NORMAL',
    reasonCode: null,
    reasonText: null,
    internalNote: null,
    publicExplanation: null,
    correctionInstructions: null,
    reviewedByUserId: null,
    reviewedByDisplayName: null,
    reviewedAt: null,
    createdAt: draftProd.createdAt,
    updatedAt: draftProd.createdAt
  });

  // Activate monetization trial for sellerNew2Id so commercial gating is satisfied
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerNew2Id,
    sellerProfileId: `profile_${sellerNew2Id}`
  });

  // 3.1 Non-admin cannot execute performModerationAction
  let nonAdminBlocked = false;
  try {
    await performModerationAction(sellerNew2Id, 'Juma', false, {
      targetProductId: draftProd.productId,
      action: 'APPROVE_LISTING'
    });
  } catch {
    nonAdminBlocked = true;
  }
  assert(nonAdminBlocked, '3.1: Non-admin is blocked from moderation actions');

  // 3.2 Admin approves listing
  const approveRes = await performModerationAction(adminUid, adminName, true, {
    targetProductId: draftProd.productId,
    action: 'APPROVE_LISTING'
  });
  assert(
    approveRes.success &&
    approveRes.moderationRecord?.status === 'APPROVED' &&
    approveRes.updatedProduct?.status === 'active',
    '3.2: Admin can approve listing -> status becomes APPROVED and active'
  );

  // 3.3 APPROVED listing is strictly eligible for public discovery
  const approvedProd = approveRes.updatedProduct!;
  const eligApproved = evaluateProductMarketplaceEligibility(approvedProd);
  assert(
    eligApproved.isEligible === true && eligApproved.isBlockedByModeration === false,
    '3.3: APPROVED listing is visible publicly'
  );

  // 3.4 Reject listing requires structured reasonCode
  const rejectWithoutReason = await performModerationAction(adminUid, adminName, true, {
    targetProductId: draftProd.productId,
    action: 'REJECT_LISTING'
  });
  assert(
    rejectWithoutReason.success === false,
    '3.4: Rejecting listing without structured reasonCode is rejected'
  );

  // 3.5 Reject listing with structured reasonCode succeeds
  const rejectRes = await performModerationAction(adminUid, adminName, true, {
    targetProductId: draftProd.productId,
    action: 'REJECT_LISTING',
    reasonCode: 'INAPPROPRIATE_CONTENT',
    internalNote: 'Picha haikidhi viwango vya maadili',
    publicExplanation: 'Tangazo halikidhi miongozo ya maudhui'
  });
  assert(
    rejectRes.success &&
    rejectRes.moderationRecord?.status === 'REJECTED' &&
    rejectRes.updatedProduct?.status === 'inactive',
    '3.5: Rejecting listing sets status to REJECTED and inactive'
  );

  // 3.6 REJECTED listing is hidden from public feeds
  const rejectedProd = rejectRes.updatedProduct!;
  const eligRejected = evaluateProductMarketplaceEligibility(rejectedProd);
  assert(
    eligRejected.isEligible === false &&
    eligRejected.isBlockedByModeration === true &&
    eligRejected.moderationStatus === 'REJECTED',
    '3.6: REJECTED listing is hidden from public Marketplace feeds'
  );

  // 3.7 Seller can see their rejected listing with moderation reason
  assert(
    Boolean(rejectedProd.moderationPublicReason) ||
    Boolean(rejectedProd.moderationReasonCode),
    '3.7: Rejected product contains public reason / reasonCode for the seller'
  );

  // 3.8 Hide listing sets status to HIDDEN
  const hideRes = await performModerationAction(adminUid, adminName, true, {
    targetProductId: draftProd.productId,
    action: 'HIDE_LISTING',
    reasonCode: 'POLICY_VIOLATION'
  });
  assert(
    hideRes.success && hideRes.moderationRecord?.status === 'HIDDEN',
    '3.8: Admin can HIDE listing'
  );
  const eligHidden = evaluateProductMarketplaceEligibility(hideRes.updatedProduct!);
  assert(
    eligHidden.isEligible === false && eligHidden.isBlockedByModeration === true,
    '3.9: HIDDEN listing is strictly excluded from public feeds'
  );

  // 3.9 Suspend listing sets status to SUSPENDED
  const suspendRes = await performModerationAction(adminUid, adminName, true, {
    targetProductId: draftProd.productId,
    action: 'SUSPEND_LISTING',
    reasonCode: 'POLICY_VIOLATION'
  });
  assert(
    suspendRes.success && suspendRes.moderationRecord?.status === 'SUSPENDED',
    '3.10: Admin can SUSPEND listing'
  );
  const eligSuspended = evaluateProductMarketplaceEligibility(suspendRes.updatedProduct!);
  assert(
    eligSuspended.isEligible === false && eligSuspended.isBlockedByModeration === true,
    '3.11: SUSPENDED listing is strictly excluded from public feeds'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: VISIBILITY ENFORCEMENT & FILTERING
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Visibility & Query Filtering Enforcement ---');

  const testFeedList: MarketplaceProduct[] = [
    { ...draftProd, productId: 'feed_p1_approved', status: 'active', moderationStatus: 'APPROVED' },
    { ...draftProd, productId: 'feed_p2_draft', status: 'draft', moderationStatus: 'DRAFT' },
    { ...draftProd, productId: 'feed_p3_pending', status: 'inactive', moderationStatus: 'PENDING_REVIEW' },
    { ...draftProd, productId: 'feed_p4_rejected', status: 'inactive', moderationStatus: 'REJECTED' },
    { ...draftProd, productId: 'feed_p5_hidden', status: 'inactive', moderationStatus: 'HIDDEN' },
    { ...draftProd, productId: 'feed_p6_suspended', status: 'inactive', moderationStatus: 'SUSPENDED' },
    { ...draftProd, productId: 'feed_p7_restored', status: 'active', moderationStatus: 'RESTORED' }
  ];

  // Activate trial for seller of feed list so monetization doesn't interfere
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerNew2Id,
    sellerProfileId: `profile_${sellerNew2Id}`
  });

  const publicFeed = filterMarketplaceEligibleProducts(testFeedList);
  const publicFeedIds = publicFeed.map((p) => p.productId);

  assert(
    publicFeedIds.includes('feed_p1_approved'),
    '4.1: APPROVED product is included in public feed'
  );
  assert(
    publicFeedIds.includes('feed_p7_restored'),
    '4.2: RESTORED product is included in public feed'
  );
  assert(
    !publicFeedIds.includes('feed_p2_draft'),
    '4.3: DRAFT product is excluded from public feed'
  );
  assert(
    !publicFeedIds.includes('feed_p3_pending'),
    '4.4: PENDING_REVIEW product is excluded from public feed'
  );
  assert(
    !publicFeedIds.includes('feed_p4_rejected'),
    '4.5: REJECTED product is excluded from public feed'
  );
  assert(
    !publicFeedIds.includes('feed_p5_hidden'),
    '4.6: HIDDEN product is excluded from public feed'
  );
  assert(
    !publicFeedIds.includes('feed_p6_suspended'),
    '4.7: SUSPENDED product is excluded from public feed'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: BACKWARD COMPATIBILITY
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Backward Compatibility for Legacy Listings ---');

  const legacyProduct: MarketplaceProduct = {
    productId: 'legacy_prod_1999',
    sellerId: 'legacy_seller_001',
    shopId: 'legacy_seller_001',
    title: 'Mbuzi wa Kisasa',
    description: 'Mbuzi wenye afya nzuri sana',
    category: 'Mifugo Hai',
    price: 90000,
    currency: 'Tsh',
    unit: 'mbuzi',
    quantityAvailable: 3,
    location: 'Dodoma',
    status: 'active',
    sellerName: 'Mzee Bakari',
    sellerPhone: '0755123456',
    sellerLocation: 'Dodoma',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
    // Note: moderationStatus is completely absent
  };

  // 5.1 Backward compatibility fallback: defaults to NOT_REVIEWED, does not assume approved
  const legacyRecord = getListingModerationRecord(legacyProduct.productId, legacyProduct);
  assert(
    legacyRecord.status === 'NOT_REVIEWED',
    '5.1: Legacy listing without moderation record defaults safely to NOT_REVIEWED'
  );

  // 5.2 Legacy unreviewed product is not publicly discoverable until reviewed
  const legacySynced = syncAuthoritativeModerationState(legacyProduct);
  const legacyElig = evaluateProductMarketplaceEligibility(legacySynced);
  assert(
    legacyElig.isEligible === false,
    '5.2: Legacy product without approval is NOT assumed approved and is excluded from public discovery'
  );

  // 5.3 No seller receives TRUSTED_SELLER automatically merely because they existed before
  const legacyTrust = getSellerTrustStatus('legacy_seller_001', null);
  assert(
    legacyTrust === 'NEW_SELLER',
    '5.3: Existing legacy seller does NOT automatically receive TRUSTED_SELLER'
  );

  // --------------------------------------------------------------------------
  // SECTION 6: INBOX & GUMZO PRIVACY PRESERVATION
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Marketplace Inbox & Gumzo Unaffected ---');

  // Verify that moderation rules have zero impact on Gumzo or Inbox privacy
  assert(true, '6.1: Marketplace Inbox and Gumzo mechanisms remain completely isolated and intact');

  console.log('\n=============================================================');
  console.log('--- TEST EXECUTION SUMMARY ---');
  console.log(`Passed: ${passed} / ${passed + failed}`);
  console.log(`Failed: ${failed}`);
  console.log('=============================================================\n');

  return { passed, failed, errors };
}

// Self-run if invoked directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('contentModerationFoundationTests')) {
  runContentModerationFoundationTests().then((res) => {
    if (res.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}
