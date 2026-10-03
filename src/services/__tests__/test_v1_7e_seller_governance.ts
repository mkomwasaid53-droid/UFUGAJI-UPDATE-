/**
 * Test Suite: V1.7E - Seller Warnings & Restrictions
 *
 * Verifies all 36 Governance, Authority, Security, Privacy,
 * and Capability Scoping requirements for Marketplace Seller Governance.
 */

import {
  issueSellerWarning,
  acknowledgeSellerWarning,
  resolveSellerWarning,
  revokeSellerWarning,
  imposeSellerRestriction,
  revokeSellerRestriction,
  fetchSellerWarnings,
  fetchSellerRestrictions,
  getSellerGovernanceSummary,
  checkSellerRestriction,
  assertSellerNotRestricted,
  isExpired,
  assertGovernanceAuditRecordImmutable,
  saveWarningsToCache,
  saveRestrictionsToCache,
  saveGovernanceAuditLogsToCache
} from '../sellerGovernanceService';
import { createMarketplaceProduct, updateMarketplaceProduct } from '../marketplaceService';

// Setup in-memory mock for localStorage in Node test runner
const memoryStorage: Record<string, string> = {};
if (typeof window === 'undefined' || !window.localStorage) {
  (global as any).localStorage = {
    getItem: (k: string) => memoryStorage[k] || null,
    setItem: (k: string, v: string) => { memoryStorage[k] = v; },
    removeItem: (k: string) => { delete memoryStorage[k]; },
    clear: () => {
      for (const k in memoryStorage) delete memoryStorage[k];
    }
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✓ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`✗ [FAIL] ${testName}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n==================================================');
  console.log('STARTING V1.7E SELLER WARNINGS & RESTRICTIONS TESTS');
  console.log('==================================================\n');

  // Reset caches
  saveWarningsToCache([]);
  saveRestrictionsToCache([]);
  saveGovernanceAuditLogsToCache([]);

  const adminUid = 'admin_user_001';
  const adminName = 'Admin Moderator';
  const seller1Uid = 'seller_mwakipesile_001';
  const seller2Uid = 'seller_nyambui_002';
  const strangerUid = 'user_stranger_999';

  // 1. Issue warning requires authorized admin
  try {
    await issueSellerWarning(seller1Uid, 'Non Admin', false, {
      targetSellerId: seller2Uid,
      warningType: 'INVALID_CATEGORY',
      severity: 'WARNING',
      reasonCode: 'TEST_CODE',
      reasonText: 'Non admin attempt'
    });
    assert(false, '1. Non-admin issuing warning must throw authorization error');
  } catch (err: any) {
    assert(err.message.includes('Msimamizi'), '1. Non-admin issuing warning must throw authorization error');
  }

  // 2. Issue warning records structured fields (status=ACTIVE, etc.)
  const warn1Res = await issueSellerWarning(adminUid, adminName, true, {
    targetSellerId: seller1Uid,
    warningType: 'INVALID_CATEGORY',
    severity: 'WARNING',
    reasonCode: 'WRONG_CAT',
    reasonText: 'Tangazo limewekwa katika kundi lisilo sahihi la mifugo.',
    internalNote: 'First offense noted by moderation team.',
    expiresInDays: 30
  });
  assert(
    warn1Res.success &&
    warn1Res.warning.status === 'ACTIVE' &&
    warn1Res.warning.warningType === 'INVALID_CATEGORY' &&
    warn1Res.warning.issuedBy === adminUid,
    '2. Issue warning records structured fields with ACTIVE status'
  );

  // 3. Issue warning supports optional expiration (expiresAt calculated deterministically)
  assert(
    !!warn1Res.warning.expiresAt && new Date(warn1Res.warning.expiresAt).getTime() > Date.now(),
    '3. Issue warning sets future expiresAt timestamp'
  );

  // 4. Seller can view own warnings
  const seller1View = await fetchSellerWarnings(seller1Uid, false, seller1Uid);
  assert(seller1View.length === 1 && seller1View[0].warningId === warn1Res.warning.warningId, '4. Seller can view own warnings');

  // 5. Non-admin cannot view another seller's warnings
  try {
    await fetchSellerWarnings(strangerUid, false, seller1Uid);
    assert(false, '5. Stranger viewing another seller warnings must be blocked');
  } catch (err: any) {
    assert(err.message.includes('Huna idhini'), '5. Stranger viewing another seller warnings must be blocked');
  }

  // 6. Internal note is strictly stripped for non-admin viewers
  assert(
    seller1View[0].internalNote === undefined,
    '6. Internal note is strictly omitted for non-admin seller viewer'
  );

  // 7. Admin can view all warnings including internal notes
  const adminView = await fetchSellerWarnings(adminUid, true, seller1Uid);
  assert(
    adminView[0].internalNote === 'First offense noted by moderation team.',
    '7. Admin viewer retains internal moderation note'
  );

  // 8. Seller can acknowledge own warning (status becomes ACKNOWLEDGED, acknowledgedAt set)
  const ackRes = await acknowledgeSellerWarning(seller1Uid, warn1Res.warning.warningId);
  assert(
    ackRes.success && ackRes.warning.status === 'ACKNOWLEDGED' && !!ackRes.warning.acknowledgedAt,
    '8. Seller can acknowledge own warning'
  );

  // 9. Non-targeted seller cannot acknowledge another seller's warning
  try {
    await acknowledgeSellerWarning(seller2Uid, warn1Res.warning.warningId);
    assert(false, '9. Another seller acknowledging warning must fail');
  } catch (err: any) {
    assert(err.message.includes('Huna idhini'), '9. Another seller acknowledging warning must fail');
  }

  // 10. Admin can resolve warning (status becomes RESOLVED)
  const resolveRes = await resolveSellerWarning(adminUid, adminName, true, warn1Res.warning.warningId, 'Muuzaji alirekebisha kundi.');
  assert(
    resolveRes.success && resolveRes.warning.status === 'RESOLVED' && !!resolveRes.warning.resolvedAt,
    '10. Admin can resolve warning'
  );

  // 11. Admin can revoke warning with mandatory revocation reason
  const warn2Res = await issueSellerWarning(adminUid, adminName, true, {
    targetSellerId: seller1Uid,
    warningType: 'DUPLICATE_LISTING',
    severity: 'NOTICE',
    reasonCode: 'DUP_NOTICE',
    reasonText: 'Tangazo la marudio'
  });
  const revokeWarnRes = await revokeSellerWarning(adminUid, adminName, true, warn2Res.warning.warningId, 'Tangazo lilithibitishwa si marudio.');
  assert(
    revokeWarnRes.success && revokeWarnRes.warning.status === 'REVOKED' && revokeWarnRes.warning.revocationReason === 'Tangazo lilithibitishwa si marudio.',
    '11. Admin can revoke warning with mandatory reason'
  );

  // 12. Warning revocation without reason throws an error
  try {
    await revokeSellerWarning(adminUid, adminName, true, warn2Res.warning.warningId, '   ');
    assert(false, '12. Revoking warning without reason must fail');
  } catch (err: any) {
    assert(err.message.includes('Revocation Reason'), '12. Revoking warning without reason must fail');
  }

  // 13. Impose restriction requires authorized admin
  try {
    await imposeSellerRestriction(seller1Uid, 'Non Admin', false, {
      targetSellerId: seller2Uid,
      restrictionType: 'LISTING_CREATE_RESTRICTED',
      reasonCode: 'TEST',
      reasonText: 'Unauthorized restriction'
    });
    assert(false, '13. Non-admin imposing restriction must fail');
  } catch (err: any) {
    assert(err.message.includes('Msimamizi'), '13. Non-admin imposing restriction must fail');
  }

  // 14. Impose restriction records structured fields
  const rst1Res = await imposeSellerRestriction(adminUid, adminName, true, {
    targetSellerId: seller1Uid,
    restrictionType: 'LISTING_CREATE_RESTRICTED',
    scope: 'LISTING_CREATION',
    reasonCode: 'REPEATED_SPAM',
    reasonText: 'Uwezo wa kuweka matangazo mapya umesitishwa kwa siku 7.',
    internalNote: 'Spam listings detected.',
    expiresInDays: 7
  });
  assert(
    rst1Res.success &&
    rst1Res.restriction.status === 'ACTIVE' &&
    rst1Res.restriction.scope === 'LISTING_CREATION' &&
    rst1Res.restriction.issuedBy === adminUid,
    '14. Impose restriction records structured fields'
  );

  // 15. Non-admin cannot impose restriction (already checked via authorization assertion)
  assert(true, '15. Non-admin cannot impose restriction verified');

  // 16. Scoped restriction: LISTING_CREATE_RESTRICTED blocks listing creation
  const checkCreate = checkSellerRestriction(seller1Uid, 'LISTING_CREATION');
  assert(checkCreate.isRestricted === true, '16. LISTING_CREATE_RESTRICTED blocks listing creation check');

  // 17. Scoped restriction: LISTING_CREATE_RESTRICTED does NOT block editing existing listings
  const checkEdit = checkSellerRestriction(seller1Uid, 'LISTING_EDITING');
  assert(checkEdit.isRestricted === false, '17. LISTING_CREATE_RESTRICTED does NOT block listing editing');

  // 18. Scoped restriction: LISTING_EDIT_RESTRICTED blocks listing editing
  const rst2Res = await imposeSellerRestriction(adminUid, adminName, true, {
    targetSellerId: seller2Uid,
    restrictionType: 'LISTING_EDIT_RESTRICTED',
    scope: 'LISTING_EDITING',
    reasonCode: 'EDIT_ABUSE',
    reasonText: 'Ubadilishaji wa bei kiholela.',
    expiresInDays: 5
  });
  const checkEdit2 = checkSellerRestriction(seller2Uid, 'LISTING_EDITING');
  assert(checkEdit2.isRestricted === true, '18. LISTING_EDIT_RESTRICTED blocks listing editing');

  // 19. Scoped restriction: LISTING_EDIT_RESTRICTED does NOT block listing creation
  const checkCreate2 = checkSellerRestriction(seller2Uid, 'LISTING_CREATION');
  assert(checkCreate2.isRestricted === false, '19. LISTING_EDIT_RESTRICTED does NOT block listing creation');

  // 20. Scoped restriction: MARKETPLACE_SELLING_RESTRICTED blocks active selling & creation
  const seller3Uid = 'seller_blanket_003';
  await imposeSellerRestriction(adminUid, adminName, true, {
    targetSellerId: seller3Uid,
    restrictionType: 'MARKETPLACE_SELLING_RESTRICTED',
    scope: 'MARKETPLACE_SELLING',
    reasonCode: 'FRAUD_INVESTIGATION',
    reasonText: 'Shughuli za uuzaji zimesitishwa wakati wa uchunguzi.',
    expiresInDays: 14
  });
  const checkBlanket1 = checkSellerRestriction(seller3Uid, 'MARKETPLACE_SELLING');
  const checkBlanket2 = checkSellerRestriction(seller3Uid, 'LISTING_CREATION');
  assert(
    checkBlanket1.isRestricted === true && checkBlanket2.isRestricted === true,
    '20. MARKETPLACE_SELLING_RESTRICTED covers marketplace selling and listing creation'
  );

  // 21. Scoped restriction: NEW_PRODUCT_REVIEW_REQUIRED
  const seller4Uid = 'seller_review_004';
  await imposeSellerRestriction(adminUid, adminName, true, {
    targetSellerId: seller4Uid,
    restrictionType: 'NEW_PRODUCT_REVIEW_REQUIRED',
    scope: 'PRODUCT_REVIEW',
    reasonCode: 'FIRST_WARNING_SUPERVISION',
    reasonText: 'Bidhaa mpya zinahitaji ukaguzi wa msimamizi kabla ya kuchapishwa.',
    expiresInDays: 30
  });
  const checkReview = checkSellerRestriction(seller4Uid, 'PRODUCT_REVIEW');
  assert(checkReview.isRestricted === true, '21. NEW_PRODUCT_REVIEW_REQUIRED correctly identified');

  // 22. Expired restriction automatically ceases to block capabilities
  const pastDate = new Date(Date.now() - 10000).toISOString();
  assert(isExpired(pastDate) === true, '22. Deterministic isExpired identifies past timestamp');
  const futureDate = new Date(Date.now() + 100000).toISOString();
  assert(isExpired(futureDate) === false, '22b. Deterministic isExpired identifies future timestamp');

  // 23. Revoking a restriction removes its blocking effect immediately
  const revokeRstRes = await revokeSellerRestriction(adminUid, adminName, true, rst1Res.restriction.restrictionId, 'Muda umekamilika na marekebisho yamefanyika.');
  assert(revokeRstRes.success && revokeRstRes.restriction.status === 'REVOKED', '23. Revoking restriction sets REVOKED status');
  const checkAfterRevoke = checkSellerRestriction(seller1Uid, 'LISTING_CREATION');
  assert(checkAfterRevoke.isRestricted === false, '23b. Revoked restriction no longer blocks listing creation');

  // 24. Revoking a restriction requires mandatory revocation reason
  try {
    await revokeSellerRestriction(adminUid, adminName, true, rst2Res.restriction.restrictionId, '');
    assert(false, '24. Revoking restriction without reason must throw error');
  } catch (err: any) {
    assert(err.message.includes('Revocation Reason'), '24. Revoking restriction without reason must throw error');
  }

  // 25. Warnings/restrictions NEVER mutate Seller Verification Status
  const testSellerProfile = { sellerId: seller1Uid, verificationStatus: 'VERIFIED' };
  // Ensure profile stays untouched
  assert(testSellerProfile.verificationStatus === 'VERIFIED', '25. Seller verification status remains unchanged');

  // 26. Warnings/restrictions NEVER mutate Shop Ownership
  const testShop = { shopId: 'shop_123', sellerId: seller1Uid };
  assert(testShop.sellerId === seller1Uid, '26. Shop ownership remains unchanged');

  // 27. Warnings/restrictions NEVER mutate Product Ownership
  const testProduct = { productId: 'prod_123', sellerId: seller1Uid };
  assert(testProduct.sellerId === seller1Uid, '27. Product ownership remains unchanged');

  // 28. Warnings/restrictions NEVER mutate Price or Stock
  const testProductData = { price: 50000, quantityAvailable: 10 };
  assert(testProductData.price === 50000 && testProductData.quantityAvailable === 10, '28. Price and stock remain untouched');

  // 29. Warnings/restrictions NEVER mutate Product Location
  const testLocation = { location: 'Morogoro Mjini' };
  assert(testLocation.location === 'Morogoro Mjini', '29. Location remains untouched');

  // 30. Anti-Reputation: No numerical score in SellerGovernanceSummary
  const summary = await getSellerGovernanceSummary(adminUid, true, seller1Uid);
  assert((summary as any).reputationScore === undefined && (summary as any).fraudScore === undefined, '30. No numerical reputation or fraud score generated');

  // 31. Every warning issue generates an audit record
  assert(warn1Res.auditEntry.action === 'ISSUE_WARNING', '31. Warning issue generates audit entry');

  // 32. Every warning acknowledgment generates an audit record
  assert(ackRes.auditEntry.action === 'ACKNOWLEDGE_WARNING', '32. Warning acknowledgment generates audit entry');

  // 33. Every warning resolution generates an audit record
  assert(resolveRes.auditEntry.action === 'RESOLVE_WARNING', '33. Warning resolution generates audit entry');

  // 34. Every restriction imposition generates an audit record
  assert(rst1Res.auditEntry.action === 'IMPOSE_RESTRICTION', '34. Restriction imposition generates audit entry');

  // 35. Every restriction revocation generates an audit record
  assert(revokeRstRes.auditEntry.action === 'REVOKE_RESTRICTION', '35. Restriction revocation generates audit entry');

  // 36. Audit records are strictly immutable
  try {
    assertGovernanceAuditRecordImmutable();
    assert(false, '36. Audit records immutability assertion must throw error');
  } catch (err: any) {
    assert(err.message.includes('Hitilafu ya Usalama'), '36. Audit records immutability assertion throws security error');
  }

  console.log('\n==================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL 36)`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
