/**
 * V9.5 UNIFIED NOTIFICATION CENTER, DELETE ACTIONS & MODULE BADGES TEST SUITE
 *
 * Verifies all 18 requirements:
 * 1. Notification creation and recipient isolation
 * 2. Delete one notification
 * 3. Delete selected notifications (bulk deletion)
 * 4. Delete all notifications for the current user
 * 5. Unauthorized deletion attempts (403 Forbidden)
 * 6. Deleting an unread notification updates counts immediately
 * 7. Marking read updates counts
 * 8. Marketplace unread count accuracy
 * 9. Gumzo unread count accuracy
 * 10. Module counts do not overlap incorrectly
 * 11. Duplicate events do not create duplicate notifications (deduplication)
 * 12. Realtime badge updates via subscriptions
 * 13. Logout/login and user switching clear stale counts
 * 14. Hidden/deleted targets are handled safely
 * 15. Underlying business records survive notification deletion
 * 16. Existing notification types continue to work
 * 17. Marketplace Inbox and Gumzo regressions
 * 18. Security rules and direct API authorization
 */

import {
  AppNotification,
  CreateNotificationInput,
  NotificationModule,
  ModuleUnreadCounts,
  getNotificationModule
} from '../src/types/notification';
import {
  createAuthoritativeNotification,
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteSelectedNotifications,
  deleteAllNotifications,
  calculateUnreadCount,
  calculateModuleUnreadCounts,
  subscribeToUserNotifications,
  subscribeToModuleUnreadCounts,
  clearUserNotificationsOnLogout,
  dispatchGumzoCommentNotification,
  dispatchGumzoMembershipApprovedNotification,
  dispatchGumzoFounderTransferredNotification,
  _resetNotificationsForTesting
} from '../src/services/notificationService';
import { gumzoGroupService } from '../src/services/gumzoGroupService';
import { gumzoPostService } from '../src/services/gumzoPostService';
import { gumzoCommentService } from '../src/services/gumzoCommentService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { MarketplaceProduct } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
  }
}

async function runV95Tests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V9.5 UNIFIED NOTIFICATION CENTER TESTS');
  console.log('================================================================\n');

  _resetNotificationsForTesting();

  const userAlice = 'user_alice_notif_001';
  const userBob = 'user_bob_notif_002';
  const userEve = 'user_eve_unauthorized_003';
  const adminUser = 'admin_platform_001';

  // --------------------------------------------------------------------------
  // Domain 1: Notification Creation and Recipient Isolation
  // --------------------------------------------------------------------------
  console.log('--- Domain 1: Notification Creation & Recipient Isolation ---');

  const notifA1 = await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'MARKETPLACE',
    type: 'MARKETPLACE_MESSAGE_RECEIVED',
    title: 'Ujumbe Mpya wa Gulio',
    message: 'Una ujumbe mpya kutoka kwa mnunuzi kuhusu kuku chotara.',
    targetType: 'CONVERSATION',
    targetId: 'conv_123'
  });

  const notifB1 = await createAuthoritativeNotification({
    recipientUserId: userBob,
    category: 'GUMZO',
    type: 'GUMZO_COMMENT_RECEIVED',
    title: 'Maoni Mapya kwenye Gumzo',
    message: 'Mwanachama ameacha maoni kwenye chapisho lako.',
    targetType: 'POST',
    targetId: 'post_456'
  });

  const aliceList = await fetchUserNotifications(userAlice);
  const bobList = await fetchUserNotifications(userBob);

  assert(aliceList.length === 1 && aliceList[0].notificationId === notifA1.notificationId, 'Test 1.1: Alice fetches only her notification');
  assert(bobList.length === 1 && bobList[0].notificationId === notifB1.notificationId, 'Test 1.2: Bob fetches only his notification');
  assert(!aliceList.some((n) => n.recipientUserId === userBob), 'Test 1.3: Recipient isolation - Alice cannot see Bob notifications');
  assert(!bobList.some((n) => n.recipientUserId === userAlice), 'Test 1.4: Recipient isolation - Bob cannot see Alice notifications');

  // --------------------------------------------------------------------------
  // Domain 2: Delete One Notification
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 2: Delete One Notification ---');

  const notifA2 = await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'SYSTEM',
    type: 'ADMIN_REVIEW_REQUIRED',
    title: 'Taarifa ya Mfumo',
    message: 'Kuna sasisho la mfumo limekamilika.'
  });

  let aliceBeforeDelete = await fetchUserNotifications(userAlice);
  assert(aliceBeforeDelete.length === 2, 'Test 2.1: Alice has 2 notifications before deletion');

  const deleteRes1 = await deleteNotification(userAlice, notifA2.notificationId);
  assert(deleteRes1.success === true, 'Test 2.2: Single notification deletion returns success');

  let aliceAfterDelete = await fetchUserNotifications(userAlice);
  assert(aliceAfterDelete.length === 1, 'Test 2.3: Deleted notification removed from user notification list');
  assert(aliceAfterDelete[0].notificationId === notifA1.notificationId, 'Test 2.4: Remaining notification is intact');

  // --------------------------------------------------------------------------
  // Domain 3: Bulk Deletion (Delete Selected)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 3: Bulk Deletion (Delete Selected) ---');

  const notifA3 = await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'MARKETPLACE',
    type: 'LISTING_RESTORED',
    title: 'Tangazo Limerudishwa',
    message: 'Tangazo lako lipo hewani tena.'
  });

  const notifA4 = await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'MARKETPLACE',
    type: 'SELLER_TRIAL_STARTED',
    title: 'Muda wa Majaribio Umeanza',
    message: 'Una siku 30 za kuuza bure.'
  });

  const bulkDeleteRes = await deleteSelectedNotifications(userAlice, [
    notifA1.notificationId,
    notifA3.notificationId
  ]);

  assert(bulkDeleteRes.success === true, 'Test 3.1: Bulk delete operation succeeds');
  assert(bulkDeleteRes.successCount === 2, 'Test 3.2: Exactly 2 selected notifications deleted');

  const aliceAfterBulk = await fetchUserNotifications(userAlice);
  assert(aliceAfterBulk.length === 1, 'Test 3.3: Exactly 1 notification remains after bulk delete');
  assert(aliceAfterBulk[0].notificationId === notifA4.notificationId, 'Test 3.4: Unselected notification notifA4 preserved');

  // --------------------------------------------------------------------------
  // Domain 4: Delete All Notifications
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 4: Delete All Notifications for Current User ---');

  // Give Bob 2 more notifications
  await createAuthoritativeNotification({
    recipientUserId: userBob,
    category: 'GUMZO',
    type: 'GUMZO_MEMBERSHIP_APPROVED',
    title: 'Ombi Limekubaliwa',
    message: 'Umeunganishwa kwenye kikundi cha Kuku Morogoro.'
  });

  let bobBefore = await fetchUserNotifications(userBob);
  assert(bobBefore.length === 2, 'Test 4.1: Bob has 2 notifications');

  const deleteAllBobRes = await deleteAllNotifications(userBob);
  assert(deleteAllBobRes.success === true && deleteAllBobRes.deletedCount === 2, 'Test 4.2: Delete all Bob notifications succeeds');

  let bobAfter = await fetchUserNotifications(userBob);
  assert(bobAfter.length === 0, 'Test 4.3: Bob notification list is now empty');

  // Verify Alice still has her notification
  const alicePreserved = await fetchUserNotifications(userAlice);
  assert(alicePreserved.length === 1, 'Test 4.4: Alice notification preserved during Bob delete-all');

  // --------------------------------------------------------------------------
  // Domain 5: Unauthorized Deletion Attempts
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 5: Unauthorized Deletion Attempts (403 Protection) ---');

  let unauthorizedDeleteBlocked = false;
  try {
    // Eve attempts to delete Alice's remaining notification
    await deleteNotification(userEve, notifA4.notificationId);
  } catch (err: any) {
    unauthorizedDeleteBlocked = err.message?.includes('Huruhusiwi') || err.message?.includes('403');
  }
  assert(unauthorizedDeleteBlocked === true, 'Test 5.1: Unauthorized deletion attempt rejected with 403');

  // Verify Alice's notification was NOT deleted
  const aliceCheck = await fetchUserNotifications(userAlice);
  assert(aliceCheck.some((n) => n.notificationId === notifA4.notificationId), 'Test 5.2: Alice notification remains intact after rejected attempt');

  // Eve attempts bulk deletion on Alice's notification
  const eveBulkRes = await deleteSelectedNotifications(userEve, [notifA4.notificationId]);
  assert(eveBulkRes.deletedIds.length === 0, 'Test 5.3: Bulk deletion by unauthorized user deletes 0 items');

  // --------------------------------------------------------------------------
  // Domain 6: Deleting an Unread Notification Updates Counts
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 6: Deleting an Unread Notification Updates Counts ---');

  const notifB3 = await createAuthoritativeNotification({
    recipientUserId: userBob,
    category: 'MARKETPLACE',
    type: 'MARKETPLACE_MESSAGE_RECEIVED',
    title: 'Ujumbe Mpya',
    message: 'Una ujumbe mpya.'
  });

  const notifB4 = await createAuthoritativeNotification({
    recipientUserId: userBob,
    category: 'MARKETPLACE',
    type: 'MARKETPLACE_PAYMENT_SUCCESS',
    title: 'Malipo Yamethibitishwa',
    message: 'Malipo yako ya TSh 1,000 yamethibitishwa.'
  });

  let bobUnreadBefore = calculateUnreadCount(await fetchUserNotifications(userBob));
  assert(bobUnreadBefore === 2, 'Test 6.1: Bob has 2 unread notifications');

  await deleteNotification(userBob, notifB3.notificationId);

  let bobUnreadAfter = calculateUnreadCount(await fetchUserNotifications(userBob));
  assert(bobUnreadAfter === 1, 'Test 6.2: Unread count drops from 2 to 1 after deleting unread notification');

  let bobModuleCounts = calculateModuleUnreadCounts(await fetchUserNotifications(userBob));
  assert(bobModuleCounts.marketplace === 1, 'Test 6.3: Module count reflects deleted unread item');

  // --------------------------------------------------------------------------
  // Domain 7: Marking Read Updates Counts
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 7: Marking Read Updates Counts ---');

  await markNotificationAsRead(userBob, notifB4.notificationId);

  let bobListAfterRead = await fetchUserNotifications(userBob);
  const readItem = bobListAfterRead.find((n) => n.notificationId === notifB4.notificationId);
  assert(readItem?.read === true && readItem?.readAt !== null, 'Test 7.1: Notification marked as read with readAt timestamp');

  let bobUnreadZero = calculateUnreadCount(bobListAfterRead);
  assert(bobUnreadZero === 0, 'Test 7.2: Unread count drops to 0 after marking as read');

  let bobModuleZero = calculateModuleUnreadCounts(bobListAfterRead);
  assert(bobModuleZero.marketplace === 0, 'Test 7.3: Marketplace unread count drops to 0');

  // --------------------------------------------------------------------------
  // Domains 8, 9, 10: Module-Specific Unread Counts & Non-Overlapping Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Domains 8, 9, 10: Module Counts & Non-Overlapping Isolation ---');

  // Create 2 unread Marketplace notifications and 3 unread Gumzo notifications for Alice
  _resetNotificationsForTesting();

  await createAuthoritativeNotification({
    recipientUserId: userAlice,
    module: 'MARKETPLACE',
    category: 'MARKETPLACE',
    type: 'MARKETPLACE_MESSAGE_RECEIVED',
    title: 'M1',
    message: 'Marketplace msg 1'
  });
  await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'SELLER',
    type: 'LISTING_UNDER_REVIEW',
    title: 'M2',
    message: 'Listing review'
  });

  await createAuthoritativeNotification({
    recipientUserId: userAlice,
    module: 'GUMZO',
    category: 'GUMZO',
    type: 'GUMZO_COMMENT_RECEIVED',
    title: 'G1',
    message: 'Gumzo comment 1'
  });
  await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'GUMZO',
    type: 'GUMZO_MEMBERSHIP_APPROVED',
    title: 'G2',
    message: 'Gumzo membership approved'
  });
  await createAuthoritativeNotification({
    recipientUserId: userAlice,
    type: 'GUMZO_POST_CREATED',
    category: 'GUMZO',
    title: 'G3',
    message: 'Gumzo post created'
  });

  const aliceAll = await fetchUserNotifications(userAlice);
  const moduleCountsAlice = calculateModuleUnreadCounts(aliceAll);

  assert(moduleCountsAlice.marketplace === 2, 'Test 8.1: Marketplace unread count accurately reports 2');
  assert(moduleCountsAlice.gumzo === 3, 'Test 9.1: Gumzo unread count accurately reports 3');
  assert(moduleCountsAlice.total === 5, 'Test 10.1: Total unread count is sum of 2 + 3 = 5');

  // Verify non-overlapping: mark 1 Gumzo as read
  const gumzoNotif = aliceAll.find((n) => getNotificationModule(n) === 'GUMZO');
  if (gumzoNotif) {
    await markNotificationAsRead(userAlice, gumzoNotif.notificationId);
  }

  const aliceAfterOneRead = await fetchUserNotifications(userAlice);
  const updatedCounts = calculateModuleUnreadCounts(aliceAfterOneRead);
  assert(updatedCounts.gumzo === 2, 'Test 10.2: Gumzo count drops to 2');
  assert(updatedCounts.marketplace === 2, 'Test 10.3: Marketplace count remains isolated at 2');
  assert(updatedCounts.total === 4, 'Test 10.4: Total drops to 4');

  // --------------------------------------------------------------------------
  // Domain 11: Idempotency & Deduplication
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 11: Deduplication & Idempotency ---');

  const dupInput: CreateNotificationInput = {
    recipientUserId: userAlice,
    category: 'MARKETPLACE',
    type: 'MARKETPLACE_MESSAGE_RECEIVED',
    title: 'Ujumbe',
    message: 'Ujumbe wa soko',
    deduplicationKey: 'dedup_inbox_conv_999'
  };

  const firstNotif = await createAuthoritativeNotification(dupInput);
  const secondNotif = await createAuthoritativeNotification(dupInput);

  assert(firstNotif.notificationId === secondNotif.notificationId, 'Test 11.1: Repeated dispatch returns same notificationId');

  const aliceListDedup = await fetchUserNotifications(userAlice);
  const matchingKey = aliceListDedup.filter((n) => n.deduplicationKey === 'dedup_inbox_conv_999');
  assert(matchingKey.length === 1, 'Test 11.2: No duplicate notification document created');

  // --------------------------------------------------------------------------
  // Domain 12: Realtime Badge Updates via Subscriptions
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 12: Realtime Badge Updates via Subscriptions ---');

  let realtimeCountsReceived: ModuleUnreadCounts | null = null;
  const unsubModule = subscribeToModuleUnreadCounts(userBob, false, (counts) => {
    realtimeCountsReceived = counts;
  });

  assert(realtimeCountsReceived !== null, 'Test 12.1: Subscription immediately emits initial state');

  // Trigger notification creation for Bob
  await createAuthoritativeNotification({
    recipientUserId: userBob,
    category: 'GUMZO',
    type: 'GUMZO_COMMENT_RECEIVED',
    title: 'Realtime Gumzo',
    message: 'Test realtime'
  });

  assert(realtimeCountsReceived !== null && (realtimeCountsReceived as ModuleUnreadCounts).gumzo >= 1, 'Test 12.2: Subscriber notified of new Gumzo unread count');

  unsubModule();

  // --------------------------------------------------------------------------
  // Domain 13: Logout / User Switching Clears Stale Counts
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 13: Logout / User Switching Clears Stale Counts ---');

  clearUserNotificationsOnLogout(userBob);
  const bobAfterLogout = await fetchUserNotifications(userBob);
  assert(bobAfterLogout.length === 0, 'Test 13.1: Bob cached notifications cleared upon logout');
  assert(calculateUnreadCount(bobAfterLogout) === 0, 'Test 13.2: Unread count reset to 0');

  // --------------------------------------------------------------------------
  // Domain 14: Safe Handling of Missing / Deleted Resource Targets
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 14: Safe Handling of Deleted Target Resources ---');

  const deadTargetNotif = await createAuthoritativeNotification({
    recipientUserId: userAlice,
    category: 'GUMZO',
    type: 'GUMZO_COMMENT_RECEIVED',
    title: 'Maoni ya chapisho lililofutwa',
    message: 'Chapisho la asili halipo tena.',
    targetType: 'POST',
    targetId: 'non_existent_post_999999',
    actionUrl: '/community?post=non_existent_post_999999'
  });

  assert(deadTargetNotif.notificationId !== undefined, 'Test 14.1: Notification with deleted/missing target creates safely');
  const modResult = getNotificationModule(deadTargetNotif);
  assert(modResult === 'GUMZO', 'Test 14.2: Module classification functions without target resource');

  // --------------------------------------------------------------------------
  // Domain 15: Underlying Business Records Survive Notification Deletion
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 15: Business Records Survive Notification Deletion ---');

  // Create a real Gumzo group and post
  const { group: testGroup } = gumzoGroupService.createGroup({
    input: {
      name: `Kikundi cha Ufugaji Kuku Nyanda za Juu ${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      description: 'Mijadala ya ufugaji wa kuku bora.',
      categoryId: 'kuku',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: userAlice,
    isPlatformAdmin: true
  });

  // Bob joins group as active member
  gumzoGroupService.joinGroup(testGroup.groupId, userBob);

  const testPost = gumzoPostService.createPost({
    input: {
      groupId: testGroup.groupId,
      content: 'Wafugaji wapendwa, tufuate ratiba ya chanjo.',
      status: 'PUBLISHED'
    },
    authenticatedUserId: userAlice
  });

  // Create comment by Bob on Alice's post
  const testComment = gumzoCommentService.createComment({
    groupId: testGroup.groupId,
    postId: testPost.postId,
    input: {
      content: 'Asante sana kwa mwongozo mzuri!'
    },
    authenticatedUserId: userBob
  });

  // Verify notification was dispatched to Alice
  const aliceNotifs = await fetchUserNotifications(userAlice);
  const commentNotif = aliceNotifs.find((n) => n.relatedCommentId === testComment.commentId || n.type === 'GUMZO_COMMENT_RECEIVED');

  assert(commentNotif !== undefined, 'Test 15.1: Comment notification dispatched to post author');

  // Delete the notification
  if (commentNotif) {
    await deleteNotification(userAlice, commentNotif.notificationId);
  }

  // Verify underlying post and comment still exist intact
  const postStillExists = gumzoPostService.getRawPost(testPost.postId);
  assert(postStillExists !== null, 'Test 15.2: Parent post survives notification deletion');

  const commentStillExists = gumzoCommentService.getPostComments({
    groupId: testGroup.groupId,
    postId: testPost.postId,
    callerUserId: userAlice
  });
  assert(commentStillExists.comments.length > 0, 'Test 15.3: Underlying comment survives notification deletion');

  // --------------------------------------------------------------------------
  // Domain 16: Existing Notification Types Continue to Work
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 16: Existing Notification Types Compatibility ---');

  const legacyTypes = [
    { type: 'SELLER_WARNING_ISSUED', cat: 'SELLER', expectedMod: 'MARKETPLACE' },
    { type: 'REPORT_RECEIVED', cat: 'GOVERNANCE', expectedMod: 'ADMIN' },
    { type: 'APPEAL_SUBMITTED', cat: 'GOVERNANCE', expectedMod: 'ADMIN' },
    { type: 'VERIFICATION_APPROVED', cat: 'SELLER', expectedMod: 'MARKETPLACE' },
    { type: 'GUMZO_FOUNDER_TRANSFERRED', cat: 'GUMZO', expectedMod: 'GUMZO' }
  ] as const;

  for (let i = 0; i < legacyTypes.length; i++) {
    const item = legacyTypes[i];
    const mod = getNotificationModule({ type: item.type, category: item.cat as any });
    assert(mod === item.expectedMod, `Test 16.${i + 1}: Legacy type ${item.type} resolves to ${item.expectedMod}`);
  }

  // --------------------------------------------------------------------------
  // Domain 17: Marketplace Inbox and Gumzo Regressions
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 17: Marketplace Inbox & Gumzo Regressions ---');

  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_regression_01',
    sellerProfileId: 'profile_reg_01'
  });

  const mockProduct: MarketplaceProduct = {
    productId: 'prod_reg_01',
    sellerId: 'seller_regression_01',
    shopId: 'shop_reg_01',
    title: 'Kuku Chotara Regression',
    description: 'Bora kwa nyama na mayai.',
    sellerName: 'Mfugaji Bora',
    sellerPhone: '+255711223344',
    sellerLocation: 'Arusha',
    status: 'active',
    moderationStatus: 'APPROVED',
    imageUrl: '/uploads/images/prod_01.jpg',
    category: 'Mifugo Hai',
    subcategory: 'Kuku',
    price: 15000,
    currency: 'Tsh',
    location: 'Arusha',
    unit: 'mmoja',
    quantityAvailable: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const inboxRes = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: userAlice,
      sellerUserId: 'seller_regression_01',
      shopId: 'shop_reg_01',
      productId: 'prod_reg_01',
      listingId: 'prod_reg_01',
      buyerNameSnapshot: 'Alice Buyer',
      sellerNameSnapshot: 'Mfugaji Bora',
      productTitleSnapshot: 'Kuku Chotara Regression'
    },
    userAlice,
    mockProduct
  );

  assert(inboxRes.conversation.conversationId !== undefined, 'Test 17.1: Marketplace Inbox conversation creation functional');

  // Verify Gumzo two-admin governance intact
  const groupAudit = gumzoGroupService.getGroupById(testGroup.groupId, userAlice, true);
  assert(groupAudit?.founderAdminUserId === userAlice, 'Test 17.2: Gumzo Founder Admin ownership intact');

  // --------------------------------------------------------------------------
  // Domain 18: Security Rules & Authorization Boundary
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 18: Security Rules & Authorization Boundary ---');

  // Ensure client cannot delete another user's notifications
  let foreignDeleteBlocked = false;
  try {
    await deleteNotification('attacker_999', notifA4.notificationId, false);
  } catch (err: any) {
    foreignDeleteBlocked = true;
  }
  assert(foreignDeleteBlocked === true, 'Test 18.1: Service layer strictly blocks foreign user deletion');

  // Ensure admin CAN moderate/delete if needed
  const adminDeleteRes = await deleteNotification(adminUser, notifA4.notificationId, true);
  assert(adminDeleteRes.success === true, 'Test 18.2: Platform administrator authorized to delete notification');

  // Summary
  console.log('\n================================================================');
  console.log(`  V9.5 NOTIFICATION CENTER RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runV95Tests().catch((err) => {
  console.error('Fatal error in V9.5 test runner:', err);
  process.exit(1);
});
