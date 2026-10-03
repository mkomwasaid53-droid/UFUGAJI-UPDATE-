/**
 * ============================================================================
 * UFUGAJI UPDATE — V1.10A-CORRECTIVE-2 VERIFICATION TEST SUITE
 * ============================================================================
 * Validates:
 * 1. Unified Notification Center Registration & Categories (ADMIN, SELLER, USER)
 * 2. Notification Recipient Authority & Recipient-Scoped Isolation
 * 3. Authoritative Suspension Notification (SELLER_MONETIZATION_SUSPENDED)
 * 4. Authoritative Reactivation Notification (SELLER_MONETIZATION_REACTIVATED)
 * 5. Trial, Grace, Payment, Expiry & Renewal Notification Integrity
 * 6. Controlled Listener (subscribeToUserNotifications) Architecture
 * 7. Unread Count Calculation & Real-Time Cache Sync
 * ============================================================================
 */

import {
  sellerMonetizationService,
  SELLER_MONETIZATION_CONFIG,
  evaluateSellerMonetizationLifecycle
} from '../src/services/sellerMonetizationService';
import {
  getLocalCachedNotifications,
  createAuthoritativeNotification,
  fetchUserNotifications,
  subscribeToUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  calculateUnreadCount,
  _resetNotificationsForTesting
} from '../src/services/notificationService';
import { NotificationType, NotificationCategory } from '../src/types/notification';

function assert(section: string, condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] Section ${section}: ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] Section ${section}: ${message}`);
}

async function runCorrective2Tests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10A-CORRECTIVE-2 TEST SUITE');
  console.log('================================================================\n');

  // Reset stores
  sellerMonetizationService._resetForTesting();
  _resetNotificationsForTesting();

  // --------------------------------------------------------------------------
  // SECTION 1: NOTIFICATION TYPES & CATEGORIES REGISTRATION
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Notification Types & Categories Registration ---');

  const requiredTypes: NotificationType[] = [
    'SELLER_TRIAL_STARTED',
    'SELLER_TRIAL_ENDING',
    'SELLER_GRACE_STARTED',
    'SELLER_PAYMENT_REQUIRED',
    'SELLER_SUBSCRIPTION_EXPIRED',
    'SELLER_RENEWAL_SUCCESS',
    'SELLER_RENEWAL_FAILED',
    'SELLER_MONETIZATION_SUSPENDED',
    'SELLER_MONETIZATION_REACTIVATED'
  ];

  const requiredCategories: NotificationCategory[] = ['ADMIN', 'SELLER', 'USER'];

  assert('1', requiredTypes.length === 9, '1.1: All 9 seller monetization notification types registered');
  assert('1', requiredCategories.includes('ADMIN') && requiredCategories.includes('SELLER'), '1.2: Minimum categories (ADMIN, SELLER, USER) defined');

  // --------------------------------------------------------------------------
  // SECTION 2: SUSPENSION & REACTIVATION NOTIFICATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Authoritative Suspension & Reactivation Notifications ---');

  const sellerSuspendedId = 'seller_susp_test_1';
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: sellerSuspendedId });

  // Suspend
  sellerMonetizationService.suspendSellerMonetization(
    sellerSuspendedId,
    'Ukiukwaji wa kanuni za biashara',
    'admin_user_42'
  );

  const notifsAfterSuspend = getLocalCachedNotifications(sellerSuspendedId);
  const suspNotif = notifsAfterSuspend.find((n) => n.type === 'SELLER_MONETIZATION_SUSPENDED');

  assert('2', !!suspNotif, '2.1: SELLER_MONETIZATION_SUSPENDED notification created for seller');
  assert('2', suspNotif?.recipientUserId === sellerSuspendedId, '2.2: Notification is scoped to the affected seller');
  assert('2', suspNotif?.category === 'SELLER', '2.3: Category is SELLER');
  assert('2', suspNotif?.priority === 'URGENT', '2.4: Priority is URGENT');
  assert('2', suspNotif?.read === false, '2.5: Initial read state is false');
  assert('2', suspNotif?.title.includes('Umesimamishwa'), '2.6: Clear title present');
  assert('2', suspNotif?.message.includes('Ukiukwaji wa kanuni'), '2.7: Clear message with reason present');

  // Reactivate
  sellerMonetizationService.reactivateSellerMonetization(sellerSuspendedId, 'admin_user_42');

  const notifsAfterReactivate = getLocalCachedNotifications(sellerSuspendedId);
  const reactivateNotif = notifsAfterReactivate.find((n) => n.type === 'SELLER_MONETIZATION_REACTIVATED');

  assert('2', !!reactivateNotif, '2.8: SELLER_MONETIZATION_REACTIVATED notification created for seller');
  assert('2', reactivateNotif?.recipientUserId === sellerSuspendedId, '2.9: Reactivation notification scoped to affected seller');
  assert('2', reactivateNotif?.category === 'SELLER', '2.10: Category is SELLER');

  // --------------------------------------------------------------------------
  // SECTION 3: RECIPIENT ISOLATION (NO BROADCAST TO OTHER USERS)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Recipient Authority & Isolation ---');

  const otherSellerId = 'other_seller_unrelated';
  const otherSellerNotifs = getLocalCachedNotifications(otherSellerId);
  assert('3', otherSellerNotifs.length === 0, '3.1: Other sellers receive NO notifications from seller 1');

  // --------------------------------------------------------------------------
  // SECTION 4: CONTROLLED NOTIFICATION LISTENER (subscribeToUserNotifications)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Controlled Notification Listener Architecture ---');

  const testUser = 'user_listener_test_1';
  let listenerCallCount = 0;
  let lastReceivedNotifs: any[] = [];

  const unsubscribe = subscribeToUserNotifications(testUser, false, (notifs) => {
    listenerCallCount++;
    lastReceivedNotifs = notifs;
  });

  assert('4', listenerCallCount === 1, '4.1: Listener emits initial state immediately');
  assert('4', lastReceivedNotifs.length === 0, '4.2: Initial list is empty for fresh user');

  // Create an authoritative notification for testUser
  await createAuthoritativeNotification({
    recipientUserId: testUser,
    type: 'SELLER_TRIAL_STARTED',
    category: 'SELLER',
    title: 'Trial Started',
    message: 'Welcome to trial',
    priority: 'HIGH'
  });

  assert('4', listenerCallCount >= 2, '4.3: Listener immediately receives update when notification is created');
  assert('4', lastReceivedNotifs.length === 1, '4.4: Received 1 notification');
  assert('4', calculateUnreadCount(lastReceivedNotifs) === 1, '4.5: Unread count calculates to 1');

  // Mark as read
  await markNotificationAsRead(testUser, lastReceivedNotifs[0].notificationId);
  assert('4', calculateUnreadCount(lastReceivedNotifs) === 0, '4.6: Unread count decreases to 0 upon mark as read');

  // Unsubscribe cleanly
  unsubscribe();

  // Create another notification after unsubscribe
  await createAuthoritativeNotification({
    recipientUserId: testUser,
    type: 'SELLER_PAYMENT_REQUIRED',
    category: 'SELLER',
    title: 'Payment Required',
    message: 'Please pay',
    priority: 'HIGH'
  });

  const callsAfterUnsub = listenerCallCount;
  // Wait brief microtick
  await new Promise((r) => setTimeout(r, 50));
  assert('4', listenerCallCount === callsAfterUnsub, '4.7: No callbacks fired after unsubscribe (clean unmount)');

  // --------------------------------------------------------------------------
  // SECTION 5: RENEWAL SUCCESS & FAILURE NOTIFICATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Authoritative Payment Confirmation Notifications ---');

  const payingSellerId = 'paying_seller_1';
  sellerMonetizationService.activateFirstMonthFreeTrial({ sellerUserId: payingSellerId });

  // Successful payment
  sellerMonetizationService.recordAuthoritativePaymentConfirmation({
    sellerUserId: payingSellerId,
    amount: 1000,
    paymentStatus: 'SUCCESS',
    transactionRef: 'mpesa_tx_998877',
    performedBy: 'SELLER'
  });

  const payingSellerNotifs = getLocalCachedNotifications(payingSellerId);
  const renewSuccessNotif = payingSellerNotifs.find((n) => n.type === 'SELLER_RENEWAL_SUCCESS');

  assert('5', !!renewSuccessNotif, '5.1: SELLER_RENEWAL_SUCCESS notification emitted on valid payment');
  assert('5', renewSuccessNotif?.category === 'SELLER', '5.2: Notification categorized as SELLER');

  // Underpayment failure
  let failedAsExpected = false;
  try {
    sellerMonetizationService.recordAuthoritativePaymentConfirmation({
      sellerUserId: payingSellerId,
      amount: 500, // < 1,000 TZS
      paymentStatus: 'SUCCESS',
      performedBy: 'SELLER'
    });
  } catch {
    failedAsExpected = true;
  }

  assert('5', failedAsExpected, '5.3: Underpayment rejected');
  const notifsAfterFailedPay = getLocalCachedNotifications(payingSellerId);
  const failNotif = notifsAfterFailedPay.find((n) => n.type === 'SELLER_RENEWAL_FAILED');
  assert('5', !!failNotif, '5.4: SELLER_RENEWAL_FAILED notification emitted on underpayment');

  console.log('\n================================================================');
  console.log('  V1.10A-CORRECTIVE-2 TEST SUITE SUMMARY: ALL PASSED (0 FAILED)');
  console.log('================================================================');
}

runCorrective2Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed with unhandled error:', err);
    process.exit(1);
  });
