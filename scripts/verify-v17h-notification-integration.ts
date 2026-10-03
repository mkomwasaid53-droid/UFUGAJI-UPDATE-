/**
 * V1.7H & Phase 6 Final Integration & Regression Verification Script
 * Validates:
 * 1. Notification Model & Core Invariants
 * 2. Cross-user isolation & read/unread tracking
 * 3. Deduplication on authoritative events
 * 4. Governance event hook integrations:
 *    - Moderation decisions -> Seller notifications
 *    - Seller warnings & restrictions -> Seller notifications
 *    - Reports & appeals -> Admin & Seller notifications
 * 5. Phase 6 Regression across V1.7A–V1.7G
 */

import {
  createAuthoritativeNotification,
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  calculateUnreadCount,
  dispatchModerationNotification,
  dispatchWarningNotification,
  dispatchRestrictionNotification,
  dispatchRestrictionRevokedNotification,
  dispatchReportAdminNotification,
  dispatchAppealAdminNotification,
  dispatchAppealDecisionNotification
} from '../src/services/notificationService';
import {
  isProductMarketplaceEligible,
  filterMarketplaceEligibleProducts
} from '../src/services/marketplaceGovernanceEnforcement';
import { MarketplaceProduct } from '../src/types/marketplace';

// In-memory mock localStorage for Node testing
const mockStorage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }
};

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('=====================================================');
  console.log('🚀 RUNNING V1.7H NOTIFICATION & PHASE 6 REGRESSION');
  console.log('=====================================================\n');

  const sellerA = 'seller_alpha_123';
  const sellerB = 'seller_beta_456';
  const adminUser = 'admin_gamma_789';

  // ----------------------------------------------------
  // TEST SUITE 1: Basic Notification Creation & Model
  // ----------------------------------------------------
  console.log('--- SUITE 1: Notification Model & Creation ---');

  const notif1 = await createAuthoritativeNotification({
    recipientUserId: sellerA,
    type: 'CORRECTION_REQUESTED',
    category: 'GOVERNANCE',
    title: 'Marekebisho ya Tangazo',
    message: 'Tafadhali rekebisha picha ya mbuzi wako.',
    priority: 'HIGH',
    targetType: 'LISTING',
    targetId: 'prod_test_001',
    relatedProductId: 'prod_test_001',
    relatedListingId: 'prod_test_001',
    actionUrl: '/market?product=prod_test_001'
  });

  assert(notif1.notificationId.startsWith('notif_'), 'Notification ID has valid prefix');
  assert(notif1.recipientUserId === sellerA, 'Recipient UID correctly bound');
  assert(notif1.read === false, 'New notification is unread by default');
  assert(notif1.priority === 'HIGH', 'Notification priority preserved');
  assert(notif1.category === 'GOVERNANCE', 'Notification category preserved');

  // ----------------------------------------------------
  // TEST SUITE 2: Cross-User Isolation
  // ----------------------------------------------------
  console.log('\n--- SUITE 2: Cross-User Isolation & Privacy ---');

  const notifSellerB = await createAuthoritativeNotification({
    recipientUserId: sellerB,
    type: 'SELLER_WARNING_ISSUED',
    category: 'SELLER',
    title: 'Onyo la Muuzaji',
    message: 'Akaunti yako imepewa onyo la kiutawala.',
    priority: 'HIGH',
    relatedWarningId: 'warn_test_999'
  });

  const sellerANotifs = await fetchUserNotifications(sellerA, false);
  const sellerBNotifs = await fetchUserNotifications(sellerB, false);

  assert(
    sellerANotifs.every((n) => n.recipientUserId === sellerA),
    'Seller A can ONLY view their own notifications'
  );
  assert(
    sellerBNotifs.every((n) => n.recipientUserId === sellerB),
    'Seller B can ONLY view their own notifications'
  );
  assert(
    !sellerANotifs.some((n) => n.notificationId === notifSellerB.notificationId),
    'Seller A CANNOT access Seller B notifications (Zero data leakage)'
  );

  // ----------------------------------------------------
  // TEST SUITE 3: Read/Unread State Management
  // ----------------------------------------------------
  console.log('\n--- SUITE 3: Read & Unread Tracking ---');

  let unreadA = calculateUnreadCount(sellerANotifs);
  assert(unreadA >= 1, `Seller A has ${unreadA} unread notification(s)`);

  const markSuccess = await markNotificationAsRead(sellerA, notif1.notificationId, false);
  assert(markSuccess === true, 'Mark as read returns true on ownership match');

  const updatedSellerANotifs = await fetchUserNotifications(sellerA, false);
  const updatedItem = updatedSellerANotifs.find((n) => n.notificationId === notif1.notificationId);
  assert(updatedItem?.read === true, 'Notification state changed to read === true');
  assert(typeof updatedItem?.readAt === 'string', 'readAt timestamp is populated');
  assert(calculateUnreadCount(updatedSellerANotifs) === 0, 'Unread count reflects 0 after marking read');

  // Cross-user unauthorized mark-as-read attempt
  const hackAttempt = await markNotificationAsRead(sellerA, notifSellerB.notificationId, false);
  assert(hackAttempt === false, 'User cannot mark another user notification as read');

  // Mark all as read test
  await createAuthoritativeNotification({
    recipientUserId: sellerA,
    type: 'LISTING_UNDER_REVIEW',
    category: 'MARKETPLACE',
    title: 'Tangazo Linapitiwa',
    message: 'Tangazo lako lipo kwenye ukaguzi.'
  });
  await createAuthoritativeNotification({
    recipientUserId: sellerA,
    type: 'LISTING_RESTORED',
    category: 'MARKETPLACE',
    title: 'Tangazo Limerudishwa',
    message: 'Tangazo lako lipo hewani.'
  });

  let rechecked = await fetchUserNotifications(sellerA, false);
  assert(calculateUnreadCount(rechecked) === 2, 'Seller A has 2 unread notifications');

  await markAllNotificationsAsRead(sellerA, false);
  rechecked = await fetchUserNotifications(sellerA, false);
  assert(calculateUnreadCount(rechecked) === 0, 'markAllNotificationsAsRead cleared all unread flags');

  // ----------------------------------------------------
  // TEST SUITE 4: Authoritative Deduplication
  // ----------------------------------------------------
  console.log('\n--- SUITE 4: Deduplication on Recurring Events ---');

  const warningId = 'warn_dedup_001';
  const notifDup1 = await dispatchWarningNotification({
    sellerId: sellerA,
    warningId,
    severity: 'MODERATE',
    publicReason: 'Bei isiyo sahihi'
  });

  const notifDup2 = await dispatchWarningNotification({
    sellerId: sellerA,
    warningId,
    severity: 'MODERATE',
    publicReason: 'Bei isiyo sahihi'
  });

  assert(
    notifDup1?.notificationId === notifDup2?.notificationId,
    'Dispatching identical warningId returns existing notification without duplicate entry'
  );

  // ----------------------------------------------------
  // TEST SUITE 5: Governance Event Hooks
  // ----------------------------------------------------
  console.log('\n--- SUITE 5: Governance Event Hook Integration ---');

  // 5.1 Moderation Action Hook
  const modNotif = await dispatchModerationNotification({
    sellerId: sellerA,
    productId: 'prod_goat_99',
    productTitle: 'Mbuzi wa Kisasa Dodoma',
    action: 'REJECT',
    moderationId: 'mod_record_77',
    reasonCode: 'WRONG_CATEGORY',
    publicReason: 'Tangazo hili limewekwa kwenye kundi lisilo sahihi'
  });

  assert(modNotif?.type === 'LISTING_REJECTED', 'Moderation REJECT triggers LISTING_REJECTED notification');
  assert(modNotif?.recipientUserId === sellerA, 'Moderation notification targeted directly to seller');
  assert(modNotif?.priority === 'HIGH', 'Rejection notification priority is HIGH');
  assert(modNotif?.message.includes('rufaa'), 'Rejection notification mentions appeal rights');

  // 5.2 Seller Restriction Hook
  const rstNotif = await dispatchRestrictionNotification({
    sellerId: sellerA,
    restrictionId: 'rst_seller_44',
    restrictionType: 'LISTING_CREATE_RESTRICTED',
    reason: 'Ukiukwaji wa mara kwa mara wa vigezo vya picha'
  });

  assert(rstNotif?.type === 'SELLER_RESTRICTION_APPLIED', 'Impose restriction creates SELLER_RESTRICTION_APPLIED');
  assert(rstNotif?.priority === 'URGENT', 'Restriction notification priority is URGENT');

  // 5.3 Restriction Revocation Hook
  const rstRevNotif = await dispatchRestrictionRevokedNotification({
    sellerId: sellerA,
    restrictionId: 'rst_seller_44',
    revocationReason: 'Muuzaji amekamilisha mafunzo ya miongozo ya soko'
  });

  assert(rstRevNotif?.type === 'SELLER_RESTRICTION_REVOKED', 'Revoking restriction creates SELLER_RESTRICTION_REVOKED');

  // 5.4 Report to Admin Hook
  const repAdminNotif = await dispatchReportAdminNotification({
    reportId: 'rep_flag_11',
    targetType: 'PRODUCT',
    targetId: 'prod_fake_99',
    targetTitle: 'Kuku wa Bei Rahisi',
    reasonCategory: 'SUSPECTED_FRAUD'
  });

  assert(repAdminNotif?.type === 'REPORT_RECEIVED', 'Reporting generates REPORT_RECEIVED notification');
  assert(repAdminNotif?.recipientUserId === 'ADMIN_GROUP', 'Report notification addressed to ADMIN_GROUP');

  // 5.5 Appeal to Admin Hook
  const appAdminNotif = await dispatchAppealAdminNotification({
    appealId: 'app_rec_22',
    sellerId: sellerA,
    sellerName: 'Juma Mfugaji',
    targetType: 'MODERATION_DECISION',
    targetId: 'mod_record_77'
  });

  assert(appAdminNotif?.type === 'APPEAL_SUBMITTED', 'Appeal submission generates APPEAL_SUBMITTED notification');
  assert(appAdminNotif?.recipientUserId === 'ADMIN_GROUP', 'Appeal notification addressed to ADMIN_GROUP');

  // 5.6 Admin Appeal Decision Hook
  const appDecisionNotif = await dispatchAppealDecisionNotification({
    sellerId: sellerA,
    appealId: 'app_rec_22',
    status: 'ACCEPTED',
    adminDecisionSummary: 'Picha na maelezo yamethibitishwa kuwa sahihi',
    targetType: 'MODERATION_DECISION'
  });

  assert(appDecisionNotif?.type === 'APPEAL_DECISION_MADE', 'Appeal decision generates APPEAL_DECISION_MADE notification');
  assert(appDecisionNotif?.title.includes('Imekubaliwa'), 'Appeal ACCEPTED notification contains positive title');

  // 5.7 Admin Inbox Visibility
  const adminNotifs = await fetchUserNotifications(adminUser, true);
  assert(
    adminNotifs.some((n) => n.recipientUserId === 'ADMIN_GROUP'),
    'Admin can fetch ADMIN_GROUP governance notifications'
  );

  // ----------------------------------------------------
  // TEST SUITE 6: Full Phase 6 Regression (V1.7A - V1.7G)
  // ----------------------------------------------------
  console.log('\n--- SUITE 6: Phase 6 Regression (V1.7A–V1.7G Integrity) ---');

  // Create baseline mock product
  const baseProduct: MarketplaceProduct = {
    productId: 'prod_valid_101',
    sellerId: 'seller_valid_01',
    sellerName: 'Juma Mfugaji',
    sellerPhone: '0712345678',
    sellerLocation: 'Arusha, Arumeru',
    title: 'Ng\'ombe wa Maziwa Friesian',
    description: 'Ng\'ombe mwenye afya anayetoa lita 25 kwa siku.',
    price: 1500000,
    currency: 'TZS',
    category: 'dairy_cattle',
    categoryId: 'cat_livestock_01',
    unit: 'kichwa',
    quantityAvailable: 1,
    location: 'Arusha, Arumeru',
    region: 'Arusha',
    district: 'Arumeru',
    status: 'active',
    moderationStatus: 'APPROVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 6.1 Clean active product is eligible
  assert(
    isProductMarketplaceEligible(baseProduct) === true,
    'Clean active approved product is eligible for public marketplace'
  );

  // 6.2 Moderation REJECTED product is blocked
  const rejectedProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_rej_102',
    moderationStatus: 'REJECTED'
  };
  assert(
    isProductMarketplaceEligible(rejectedProduct) === false,
    'REJECTED listing is blocked by governance enforcement'
  );

  // 6.3 Moderation HIDDEN product is blocked
  const hiddenProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_hid_103',
    moderationStatus: 'HIDDEN'
  };
  assert(
    isProductMarketplaceEligible(hiddenProduct) === false,
    'HIDDEN listing is blocked by governance enforcement'
  );

  // 6.4 Moderation SUSPENDED product is blocked
  const suspendedProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_sus_104',
    moderationStatus: 'SUSPENDED'
  };
  assert(
    isProductMarketplaceEligible(suspendedProduct) === false,
    'SUSPENDED listing is blocked by governance enforcement'
  );

  // 6.5 Inactive status product is blocked
  const inactiveProduct: MarketplaceProduct = {
    ...baseProduct,
    productId: 'prod_ina_105',
    status: 'inactive'
  };
  assert(
    isProductMarketplaceEligible(inactiveProduct) === false,
    'Inactive listing status is blocked from public marketplace'
  );

  // 6.6 Bulk filter works accurately
  const catalog = [baseProduct, rejectedProduct, hiddenProduct, suspendedProduct, inactiveProduct];
  const filtered = filterMarketplaceEligibleProducts(catalog);
  assert(filtered.length === 1, `Bulk filtering accurately kept only ${filtered.length} of 5 products`);
  assert(filtered[0].productId === 'prod_valid_101', 'Filtered product is the valid approved product');

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal error in test script:', e);
  process.exit(1);
});
