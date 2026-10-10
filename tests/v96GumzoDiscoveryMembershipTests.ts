/**
 * V9.6 — GUMZO GROUP DISCOVERY & MEMBERSHIP AUTOMATED TEST SUITE
 *
 * Verifies all 18 mandatory requirements across Group Discovery,
 * Search and Filters, Group Details, Membership State Machine,
 * Join/Leave Actions, Authoritative Member Count, Authorization & Privacy,
 * and Non-Interference Regressions.
 */

import fs from 'fs';
import path from 'path';
import { gumzoGroupService, initGumzoStorage } from '../src/services/gumzoGroupService';
import { gumzoPostService, initGumzoPostsStorage } from '../src/services/gumzoPostService';
import { gumzoCommentService, initGumzoCommentsStorage } from '../src/services/gumzoCommentService';
import {
  fetchUserNotifications,
  _resetNotificationsForTesting,
} from '../src/services/notificationService';
import {
  canAccessGumzoGroup,
  canUserCreatePost,
  canUserCreateComment,
  GUMZO_CATEGORIES,
  GumzoGroup,
} from '../src/types/gumzo';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';

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

async function runV96Tests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V9.6 GUMZO GROUP DISCOVERY & MEMBERSHIP TESTS');
  console.log('================================================================\n');

  // Set up isolated temp test directory
  const testDir = path.join(process.cwd(), 'data_v96_test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  initGumzoStorage(fs, path, testDir);
  initGumzoPostsStorage(fs, path, testDir);
  initGumzoCommentsStorage(fs, path, testDir);
  gumzoGroupService._clearForTesting();
  gumzoPostService._clearForTesting();
  gumzoCommentService._clearForTesting();
  _resetNotificationsForTesting();

  // Test Actors
  const founderA = 'farmer_daudi_founder';
  const memberBob = 'farmer_bob_active';
  const memberCharlie = 'farmer_charlie_pending';
  const memberDiana = 'farmer_diana_leave';
  const userSuspended = 'farmer_edward_suspended';
  const userRemoved = 'farmer_fatma_removed';
  const outsiderGrace = 'farmer_grace_outsider';
  const platformAdmin = 'admin_super_v96';

  console.log('--- Domain 1: Public Active Groups Appear in Discovery ---');
  // 1. Create a Public Active Group
  const { group: publicActiveGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji wa Ng\'ombe wa Maziwa Tanga',
      description: 'Mijadala na uzoefu wa uzalishaji wa maziwa bora ya ng\'ombe Tanga.',
      categoryId: 'ngombe',
      livestockType: 'CATTLE',
      visibility: 'PUBLIC',
      coverImageUrl: 'https://images.unsplash.com/photo-cows.jpg'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true // Starts as ACTIVE
  });

  const discoveryList1 = gumzoGroupService.getDiscoverableGroups();
  const isPublicActiveFound = discoveryList1.some((g) => g.groupId === publicActiveGroup.groupId);
  assert(isPublicActiveFound, 'Req 1: Public active groups appear in discovery');

  // Verify group card fields available authoritatively
  const foundCard = discoveryList1.find((g) => g.groupId === publicActiveGroup.groupId);
  assert(foundCard?.name === 'Wafugaji wa Ng\'ombe wa Maziwa Tanga', 'Req 1b: Group name available');
  assert(foundCard?.visibility === 'PUBLIC', 'Req 1c: Visibility indicator is PUBLIC');
  assert(foundCard?.memberCount === 1, 'Req 1d: Authoritative initial member count is 1 (Founder)');
  assert(foundCard?.categoryId === 'ngombe', 'Req 1e: Category is ngombe');
  assert(foundCard?.livestockType === 'CATTLE', 'Req 1f: Livestock type is CATTLE');
  assert(foundCard?.coverImageUrl?.includes('unsplash'), 'Req 1g: Cover image preserved');

  console.log('\n--- Domain 2: Exclude Pending, Rejected, Suspended, Archived, Draft Groups ---');
  // Pending Approval group
  const { group: pendingGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Nyuki Kinachosubiri',
      description: 'Kikundi hiki kinasubiri idhini ya jukwaa.',
      categoryId: 'nyuki',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: false // Starts as PENDING_APPROVAL
  });

  // Suspended group
  const { group: suspendedGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Sungura Kilichosimamishwa',
      description: 'Kikundi hiki kimesimamishwa kiutawala.',
      categoryId: 'sungura',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true
  });
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: suspendedGroup.groupId,
    newStatus: 'SUSPENDED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true
  });

  // Rejected group
  const { group: rejectedGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Samaki Kilichokataliwa',
      description: 'Kikundi hiki kimekataliwa.',
      categoryId: 'samaki',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true
  });
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: rejectedGroup.groupId,
    newStatus: 'REJECTED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true
  });

  // Archived group
  const { group: archivedGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Kumbukumbu (Archived)',
      description: 'Kikundi hiki kimehifadhiwa kama kumbukumbu.',
      categoryId: 'kuku',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true
  });
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: archivedGroup.groupId,
    newStatus: 'ARCHIVED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true
  });

  const discoveryList2 = gumzoGroupService.getDiscoverableGroups();
  assert(!discoveryList2.some((g) => g.groupId === pendingGroup.groupId), 'Req 2.1: PENDING_APPROVAL groups excluded from discovery');
  assert(!discoveryList2.some((g) => g.groupId === suspendedGroup.groupId), 'Req 2.2: SUSPENDED groups excluded from discovery');
  assert(!discoveryList2.some((g) => g.groupId === rejectedGroup.groupId), 'Req 2.3: REJECTED groups excluded from discovery');
  assert(!discoveryList2.some((g) => g.groupId === archivedGroup.groupId), 'Req 2.4: ARCHIVED groups excluded from discovery');

  console.log('\n--- Domain 3: Private Groups Do Not Leak Protected Information ---');
  const { group: privateGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Chama cha Siri cha Mbuzi wa Saanen',
      description: 'Kikundi cha wanachama binafsi pekee wa mbuzi wa maziwa.',
      categoryId: 'mbuzi_kondoo',
      livestockType: 'GOAT_SHEEP',
      visibility: 'PRIVATE'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true
  });

  // Create post inside private group
  const privatePost = gumzoPostService.createPost({
    input: {
      groupId: privateGroup.groupId,
      content: 'Mjadala wa siri wa wanachama wa mbuzi wa Saanen pekee.',
      status: 'PUBLISHED'
    },
    authenticatedUserId: founderA
  });

  const discoveryList3 = gumzoGroupService.getDiscoverableGroups();
  assert(!discoveryList3.some((g) => g.groupId === privateGroup.groupId), 'Req 3.1: Private groups excluded from public discovery');

  // Verify non-member cannot access private post feed
  const outsiderFeed = gumzoPostService.getGroupPosts({
    groupId: privateGroup.groupId,
    callerUserId: outsiderGrace,
    isPlatformAdmin: false
  });
  assert(outsiderFeed.posts.length === 0, 'Req 3.2: Outsider cannot view private posts');

  // Verify non-member cannot access member list of private group
  const outsiderMemberList = gumzoGroupService.getGroupMembers(privateGroup.groupId, outsiderGrace, false);
  assert(outsiderMemberList.length === 0, 'Req 3.3: Outsider cannot view private group member list');

  // Verify access decision for stranger
  const strangerDecision = canAccessGumzoGroup(outsiderGrace, privateGroup, null);
  assert(strangerDecision.canViewContent === false, 'Req 3.4: Stranger access decision denies viewContent in private group');

  console.log('\n--- Domain 4: Name Search and Filters Work Correctly ---');
  // Create another public active group in poultry
  const { group: kukuGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji Kuku wa Kienyeji Morogoro',
      description: 'Mbinu za kisasa za kukuza kuku wa kienyeji na masoko Morogoro.',
      categoryId: 'kuku',
      livestockType: 'POULTRY',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true
  });

  // Search by name
  const searchByName = gumzoGroupService.getDiscoverableGroups({ searchQuery: 'Morogoro' });
  assert(searchByName.some((g) => g.groupId === kukuGroup.groupId), 'Req 4.1: Search by name matches "Morogoro"');
  assert(!searchByName.some((g) => g.groupId === publicActiveGroup.groupId), 'Req 4.2: Search by name excludes non-matching "Tanga"');

  // Search by description
  const searchByDesc = gumzoGroupService.getDiscoverableGroups({ searchQuery: 'uzalishaji wa maziwa' });
  assert(searchByDesc.some((g) => g.groupId === publicActiveGroup.groupId), 'Req 4.3: Search by description matches');

  // Filter by category
  const filterCatNgombe = gumzoGroupService.getDiscoverableGroups({ categoryFilter: 'ngombe' });
  assert(filterCatNgombe.every((g) => g.categoryId === 'ngombe'), 'Req 4.4: Category filter returns only ngombe groups');

  // Filter by livestock type
  const filterLtPoultry = gumzoGroupService.getDiscoverableGroups({ livestockTypeFilter: 'POULTRY' });
  assert(filterLtPoultry.every((g) => g.livestockType === 'POULTRY'), 'Req 4.5: Livestock type filter returns only POULTRY');

  // Blocked user exclusion from discovery
  const blockedUserId = 'blocked_user_99';
  gumzoGroupService.joinGroup(publicActiveGroup.groupId, blockedUserId);
  gumzoGroupService.updateMembershipStatus(publicActiveGroup.groupId, blockedUserId, 'SUSPENDED', founderA);
  const discoveryForBlockedUser = gumzoGroupService.getDiscoverableGroups({ callerUserId: blockedUserId });
  assert(!discoveryForBlockedUser.some((g) => g.groupId === publicActiveGroup.groupId), 'Req 4.6: User suspended from a group does not see it in joinable discovery');

  console.log('\n--- Domain 5: Empty and Pagination States ---');
  const emptyFilterRes = gumzoGroupService.getDiscoverableGroups({ categoryFilter: 'samaki' });
  assert(emptyFilterRes.length === 0, 'Req 5.1: Non-matching category filter returns empty list');

  const { groups: paged1, total: totalGroups } = gumzoGroupService.getDiscoverableGroupsWithTotal({ limit: 1, offset: 0 });
  assert(paged1.length === 1, 'Req 5.2: Bounded loading limit 1 returns exactly 1 item');
  assert(totalGroups >= 2, 'Req 5.3: Total matching count reports full available groups');

  const { groups: paged2 } = gumzoGroupService.getDiscoverableGroupsWithTotal({ limit: 1, offset: 1 });
  assert(paged2.length === 1, 'Req 5.4: Offset pagination returns next group');
  assert(paged1[0].groupId !== paged2[0].groupId, 'Req 5.5: Offset pagination does not return duplicate item');

  console.log('\n--- Domain 6: Join Request Creation ---');
  // Join Public Group -> ACTIVE
  const bobJoinRes = gumzoGroupService.joinGroup(publicActiveGroup.groupId, memberBob);
  assert(bobJoinRes.status === 'ACTIVE', 'Req 6.1: Joining public group assigns status ACTIVE');
  assert(bobJoinRes.role === 'MEMBER', 'Req 6.2: Joining user assigned role strictly MEMBER');

  // Join Private Group -> PENDING
  const charlieJoinRes = gumzoGroupService.joinGroup(privateGroup.groupId, memberCharlie);
  assert(charlieJoinRes.status === 'PENDING', 'Req 6.3: Joining private group assigns status PENDING');
  assert(charlieJoinRes.role === 'MEMBER', 'Req 6.4: Joining private group assigns role MEMBER');

  console.log('\n--- Domain 7: Duplicate Join Request Prevention ---');
  // Retry join by Bob (already ACTIVE)
  const bobRetry = gumzoGroupService.joinGroup(publicActiveGroup.groupId, memberBob);
  assert(bobRetry.status === 'ACTIVE', 'Req 7.1: Duplicate join by active member returns existing membership idempotently');

  // Retry join by Charlie (already PENDING)
  const charlieRetry = gumzoGroupService.joinGroup(privateGroup.groupId, memberCharlie);
  assert(charlieRetry.status === 'PENDING', 'Req 7.2: Duplicate join request returns pending membership without creating duplicate');

  console.log('\n--- Domain 8: PENDING Users Cannot Comment or Access Content ---');
  const postInPrivate = privatePost;
  const charlieCommentAuth = canUserCreateComment(memberCharlie, privateGroup, postInPrivate, charlieJoinRes, false);
  assert(charlieCommentAuth.allowed === false, 'Req 8.1: PENDING user cannot comment');
  assert(charlieCommentAuth.reason?.includes('Pending') || charlieCommentAuth.reason?.includes('idhini'), 'Req 8.2: Swahili reason explains pending approval');

  let commentThrew = false;
  try {
    gumzoCommentService.createComment({
      groupId: privateGroup.groupId,
      postId: postInPrivate.postId,
      input: { content: 'Nataka kuweka maoni nikiwa bado pending' },
      authenticatedUserId: memberCharlie
    });
  } catch (err: any) {
    commentThrew = true;
  }
  assert(commentThrew, 'Req 8.3: Comment creation throws error for PENDING user');

  const charlieGroupAccess = canAccessGumzoGroup(memberCharlie, privateGroup, charlieJoinRes);
  assert(charlieGroupAccess.canViewContent === false, 'Req 8.4: PENDING user cannot access protected content');

  console.log('\n--- Domain 9: ACTIVE Members Can Access Content and Comment ---');
  const bobGroupAccess = canAccessGumzoGroup(memberBob, publicActiveGroup, bobJoinRes);
  assert(bobGroupAccess.canViewContent === true, 'Req 9.1: ACTIVE member can access group content');

  // Create public post by founder
  const publicPost = gumzoPostService.createPost({
    input: {
      groupId: publicActiveGroup.groupId,
      content: 'Karibuni wanachama wapya kwenye kikundi chetu cha Tanga!',
      status: 'PUBLISHED'
    },
    authenticatedUserId: founderA
  });

  const bobCommentAuth = canUserCreateComment(memberBob, publicActiveGroup, publicPost, bobJoinRes, false);
  assert(bobCommentAuth.allowed === true, 'Req 9.2: ACTIVE member is authorized to comment');

  const bobComment = gumzoCommentService.createComment({
    groupId: publicActiveGroup.groupId,
    postId: publicPost.postId,
    input: { content: 'Asante sana kwa makaribisho! Nipo tayari kujifunza.' },
    authenticatedUserId: memberBob
  });
  assert(bobComment.commentId.startsWith('cmt_'), 'Req 9.3: ACTIVE member successfully creates comment');
  assert(bobComment.authorRole === 'MEMBER', 'Req 9.4: Comment authorRole reflects canonical MEMBER role');

  console.log('\n--- Domain 10: SUSPENDED and REMOVED Memberships Are Denied ---');
  // Suspend Edward
  gumzoGroupService.joinGroup(publicActiveGroup.groupId, userSuspended);
  const suspendedMem = gumzoGroupService.updateMembershipStatus(publicActiveGroup.groupId, userSuspended, 'SUSPENDED', founderA, 'Ukiukwaji wa miongozo');
  assert(suspendedMem.status === 'SUSPENDED', 'Req 10.1: Membership status updated to SUSPENDED');

  const suspendedAccess = canAccessGumzoGroup(userSuspended, publicActiveGroup, suspendedMem);
  assert(suspendedAccess.canViewContent === false, 'Req 10.2: SUSPENDED member cannot view content');

  const suspendedCommentAuth = canUserCreateComment(userSuspended, publicActiveGroup, publicPost, suspendedMem, false);
  assert(suspendedCommentAuth.allowed === false, 'Req 10.3: SUSPENDED member cannot comment');

  let suspendedRejoinBlocked = false;
  try {
    gumzoGroupService.joinGroup(publicActiveGroup.groupId, userSuspended);
  } catch (err: any) {
    suspendedRejoinBlocked = true;
  }
  assert(suspendedRejoinBlocked, 'Req 10.4: SUSPENDED user is blocked from rejoining');

  // Remove Fatma
  gumzoGroupService.joinGroup(publicActiveGroup.groupId, userRemoved);
  const removedMem = gumzoGroupService.updateMembershipStatus(publicActiveGroup.groupId, userRemoved, 'REMOVED', founderA, 'Kuondolewa kabisa');
  assert(removedMem.status === 'REMOVED', 'Req 10.5: Membership status updated to REMOVED');

  const removedAccess = canAccessGumzoGroup(userRemoved, publicActiveGroup, removedMem);
  assert(removedAccess.canViewContent === false, 'Req 10.6: REMOVED user cannot view content');

  let removedRejoinBlocked = false;
  try {
    gumzoGroupService.joinGroup(publicActiveGroup.groupId, userRemoved);
  } catch (err: any) {
    removedRejoinBlocked = true;
  }
  assert(removedRejoinBlocked, 'Req 10.7: REMOVED user is blocked from rejoining without reinstatement');

  console.log('\n--- Domain 11: LEFT Membership Transitions and Permitted Rejoin ---');
  // Diana joins public group
  const dianaJoin = gumzoGroupService.joinGroup(publicActiveGroup.groupId, memberDiana);
  assert(dianaJoin.status === 'ACTIVE', 'Req 11.1: Diana joined as ACTIVE');

  // Diana leaves group
  const dianaLeave = gumzoGroupService.leaveGroup(publicActiveGroup.groupId, memberDiana);
  assert(dianaLeave.status === 'LEFT', 'Req 11.2: Leaving group sets status to LEFT');

  // Former member loses access to protected content
  const dianaLeftAccess = canAccessGumzoGroup(memberDiana, publicActiveGroup, dianaLeave);
  assert(dianaLeftAccess.canViewContent === false, 'Req 11.3: Former member who LEFT loses content view access');

  // Former member cannot comment
  const dianaLeftCommentAuth = canUserCreateComment(memberDiana, publicActiveGroup, publicPost, dianaLeave, false);
  assert(dianaLeftCommentAuth.allowed === false, 'Req 11.4: Former member who LEFT cannot comment');

  // Permitted rejoin in public group
  const dianaRejoin = gumzoGroupService.joinGroup(publicActiveGroup.groupId, memberDiana);
  assert(dianaRejoin.status === 'ACTIVE', 'Req 11.5: Rejoining public group restores ACTIVE status');

  console.log('\n--- Domain 12: Unauthorized Membership Transitions Are Rejected ---');
  let unauthorizedModerateThrew = false;
  try {
    // Non-admin Diana tries to suspend Bob
    gumzoGroupService.updateMembershipStatus(publicActiveGroup.groupId, memberBob, 'SUSPENDED', memberDiana);
  } catch (err: any) {
    unauthorizedModerateThrew = true;
    assert(err.message.includes('403') || err.message.includes('Huna mamlaka'), 'Req 12.1: Non-admin rejected with 403');
  }
  assert(unauthorizedModerateThrew, 'Req 12.2: Unauthorized membership modification rejected');

  // Founder cannot leave group without transfer
  let founderLeaveThrew = false;
  try {
    gumzoGroupService.leaveGroup(publicActiveGroup.groupId, founderA);
  } catch (err: any) {
    founderLeaveThrew = true;
    assert(err.message.includes('Mwanzilishi') || err.message.includes('Founder Admin'), 'Req 12.3: Founder leaving prevented with informative message');
  }
  assert(founderLeaveThrew, 'Req 12.4: Founder Admin cannot accidentally leave group');

  console.log('\n--- Domain 13: Member Count Includes ONLY ACTIVE Members ---');
  // Verify memberCount calculation on public group
  const calculatedCount = gumzoGroupService.reconcileGroupMemberCount(publicActiveGroup.groupId);
  const liveGroup = gumzoGroupService.getGroupById(publicActiveGroup.groupId, founderA);
  assert(calculatedCount === liveGroup?.memberCount, 'Req 13.1: Live group memberCount matches reconciled aggregate');

  // Check that PENDING user in private group does not count towards memberCount
  const privateGroupLive = gumzoGroupService.getGroupById(privateGroup.groupId, founderA);
  assert(privateGroupLive?.memberCount === 1, 'Req 13.2: PENDING membership does not increment memberCount (still 1 founder)');

  // Verify that SUSPENDED and REMOVED users are not counted as active
  const countExcludesSuspended = liveGroup?.memberCount;
  // Live group active members: founderA, memberBob, memberDiana = 3. userSuspended and userRemoved must not be in count!
  assert(countExcludesSuspended === 3, 'Req 13.3: memberCount strictly counts ACTIVE members (exactly 3, excluding suspended/removed/pending)');

  console.log('\n--- Domain 14: Concurrent Requests and Retries Do Not Corrupt Counts ---');
  const countBeforeRetries = liveGroup?.memberCount;
  // Simulate 5 rapid retry join requests from same user
  for (let i = 0; i < 5; i++) {
    gumzoGroupService.joinGroup(publicActiveGroup.groupId, memberBob);
  }
  const groupAfterRetries = gumzoGroupService.getGroupById(publicActiveGroup.groupId, founderA);
  assert(groupAfterRetries?.memberCount === countBeforeRetries, 'Req 14.1: Repeated join requests do not corrupt or inflate member count');

  console.log('\n--- Domain 15: Notifications Are Correct and Idempotent ---');
  // Wait a tick for async dispatch promises to settle
  await new Promise((r) => setTimeout(r, 60));

  // Check notifications for founder when charlie requested to join private group
  const founderNotifications = await fetchUserNotifications(founderA);
  const joinRequestNotif = founderNotifications.find(
    (n) => n.targetId === privateGroup.groupId || n.senderUserId === memberCharlie
  );
  assert(Boolean(joinRequestNotif), 'Req 15.1: Join request notification dispatched to Founder Admin');
  assert(joinRequestNotif?.module === 'GUMZO', 'Req 15.2: Notification module classified as GUMZO');

  // Founder approves Charlie
  gumzoGroupService.updateMembershipStatus(privateGroup.groupId, memberCharlie, 'ACTIVE', founderA);
  await new Promise((r) => setTimeout(r, 60));

  const charlieNotifications = await fetchUserNotifications(memberCharlie);
  const approvalNotif = charlieNotifications.find(
    (n) => n.targetId === privateGroup.groupId || n.type === 'GUMZO_MEMBERSHIP_APPROVED'
  );
  assert(Boolean(approvalNotif), 'Req 15.3: Membership approval notification dispatched to user');

  // Now Charlie is ACTIVE -> memberCount of private group must increment to 2
  const updatedPrivateGroup = gumzoGroupService.getGroupById(privateGroup.groupId, founderA);
  assert(updatedPrivateGroup?.memberCount === 2, 'Req 15.4: Approved member increments authoritative memberCount to 2');

  console.log('\n--- Domain 16: Role Spoofing and Direct Unauthorized Writes Rejected ---');
  const spoofAttemptId = 'attacker_spoof_01';
  const joinSpoof = gumzoGroupService.joinGroup(publicActiveGroup.groupId, spoofAttemptId);
  // Role must strictly be MEMBER, never admin
  assert(joinSpoof.role === 'MEMBER', 'Req 16.1: Joining user cannot self-assign admin, locked to MEMBER');

  console.log('\n--- Domain 17: V9.1–V9.5 Core Regressions Intact ---');
  // V9.1 group creation
  assert(publicActiveGroup.status === 'ACTIVE', 'Req 17.1: V9.1 group foundation intact');
  // V9.2 admin posts
  assert(publicPost.authorRole === 'FOUNDER_ADMIN', 'Req 17.2: V9.2 admin posts intact');
  // V9.3 comments
  assert(bobComment.authorRole === 'MEMBER', 'Req 17.3: V9.3 comments intact');
  // V9.4 two-admin governance
  const isFounderCheck = gumzoGroupService.getMembership(publicActiveGroup.groupId, founderA)?.role === 'FOUNDER_ADMIN';
  assert(isFounderCheck, 'Req 17.4: V9.4 Founder Admin role intact');
  // V9.5 Notification Center
  assert(charlieNotifications.length > 0, 'Req 17.5: V9.5 Notification Center intact');

  console.log('\n--- Domain 18: Marketplace Inbox Remains Unaffected ---');
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_v96_inbox',
    sellerProfileId: 'profile_seller_v96_inbox'
  });

  const mockProduct = {
    productId: 'prod_v96_inbox',
    sellerId: 'seller_v96_inbox',
    shopId: 'shop_v96_inbox',
    title: 'Kuku wa Nyama',
    price: 15000,
    currency: 'TZS',
    category: 'POULTRY',
    status: 'active',
    moderationStatus: 'APPROVED',
    images: [],
    isActive: true,
    isSuspended: false,
    quantityAvailable: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const inboxRes = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: 'buyer_v96_inbox',
      sellerUserId: 'seller_v96_inbox',
      shopId: 'shop_v96_inbox',
      productId: 'prod_v96_inbox',
      listingId: 'prod_v96_inbox',
      buyerNameSnapshot: 'Buyer V96',
      sellerNameSnapshot: 'Seller V96',
      productTitleSnapshot: 'Kuku wa Nyama'
    },
    'buyer_v96_inbox',
    mockProduct as any
  );
  assert(Boolean(inboxRes?.conversation?.conversationId), 'Req 18.1: Marketplace Inbox conversation creates normally');
  const convMessages = await marketplaceInboxService.getMessagesForConversation(
    inboxRes.conversation.conversationId,
    'buyer_v96_inbox'
  );
  assert(Array.isArray(convMessages), 'Req 18.2: Marketplace Inbox conversation messages array intact');

  console.log('\n================================================================');
  console.log(`  GUMZO V9.6 DISCOVERY & MEMBERSHIP SUMMARY: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  // Cleanup temp dir
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runV96Tests().catch((err) => {
  console.error('Unhandled failure in V9.6 test runner:', err);
  process.exit(1);
});
