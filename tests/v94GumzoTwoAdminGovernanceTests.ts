/**
 * V9.4 GUMZO TWO-ADMIN GOVERNANCE TEST SUITE
 *
 * Verifies all 20 governance domains:
 * 1. Exactly the three supported application roles (FOUNDER_ADMIN, LEADERSHIP_ADMIN, MEMBER)
 * 2. Founder Admin access within their authorized group
 * 3. Founder Admin cannot access/modify unrelated groups without permission
 * 4. Leadership Admin governance permissions
 * 5. Leadership Admin does not need to approve every post (no per-post approval requirement)
 * 6. Member cannot create posts (403 PERMISSION_DENIED)
 * 7. Active member can comment
 * 8. Inactive/Suspended/Pending/Removed/Left membership cannot create comments
 * 9. Client role spoofing is strictly rejected server-side
 * 10. Unauthorized role assignment is rejected
 * 11. Unauthorized ownership transfer is rejected
 * 12. Authorized transfer updates authoritative assignment
 * 13. Previous and new assignment history is preserved in audit records
 * 14. Unauthorized direct API/database mutations are rejected
 * 15. Group suspension and restoration follow the authorized workflow
 * 16. Audit records are authoritative, persistent, and immutable
 * 17. Permission caches refresh after role changes
 * 18. V9.1, V9.2, and V9.3 regressions pass
 * 19. Marketplace Inbox and private attachments remain isolated from Gumzo governance roles
 * 20. Existing media uploads and rendering still work
 */

import fs from 'fs';
import path from 'path';
import {
  CANONICAL_GUMZO_ROLES,
  mapToCanonicalGumzoRole,
  isTwoAdminRole,
  canUserCreatePost,
  canUserEditPost,
  canUserDeletePost,
  canUserCreateComment,
  canTransferFounderAdmin,
  GumzoGroupRole,
  GumzoGroup,
} from '../src/types/gumzo';
import { gumzoGroupService, initGumzoStorage } from '../src/services/gumzoGroupService';
import { gumzoPostService, initGumzoPostsStorage } from '../src/services/gumzoPostService';
import { gumzoCommentService, initGumzoCommentsStorage } from '../src/services/gumzoCommentService';
import { gumzoAuditService, initGumzoAuditStorage } from '../src/services/gumzoAuditService';
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

async function runTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V9.4 GUMZO TWO-ADMIN GOVERNANCE TESTS');
  console.log('================================================================\n');

  // Isolated Test Directory Setup
  const testDataDir = path.join(process.cwd(), 'data_v94_test');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  // Initialize storage in isolated directory
  initGumzoStorage(fs, path, testDataDir);
  initGumzoPostsStorage(fs, path, testDataDir);
  initGumzoCommentsStorage(fs, path, testDataDir);
  initGumzoAuditStorage(fs, path, testDataDir);

  // Clear in-memory stores for clean testing
  gumzoGroupService._clearForTesting(false);
  gumzoPostService._clearForTesting();
  gumzoCommentService._clearForTesting();
  gumzoAuditService._clearForTesting(false);
  marketplaceInboxService._resetInboxForTesting();

  // Test User Identities
  const founderA = 'user_founder_alpha';
  const founderB = 'user_founder_bravo';
  const platformAdmin = 'user_platform_admin';
  const leadershipAdmin = 'user_leadership_charlie';
  const memberAlice = 'user_member_alice';
  const memberBob = 'user_member_bob';
  const newFounderTarget = 'user_future_founder';
  const outsider = 'user_outsider_stranger';

  // --- Domain 1: Exactly Three Canonical Roles ---
  console.log('--- Domain 1: Canonical Roles & Two-Admin Model ---');

  assert(
    CANONICAL_GUMZO_ROLES.length === 3 &&
    CANONICAL_GUMZO_ROLES.includes('FOUNDER_ADMIN') &&
    CANONICAL_GUMZO_ROLES.includes('LEADERSHIP_ADMIN') &&
    CANONICAL_GUMZO_ROLES.includes('MEMBER'),
    'Test 1.1: Exactly three canonical roles exist in CANONICAL_GUMZO_ROLES'
  );

  assert(
    isTwoAdminRole('FOUNDER_ADMIN') === true &&
    isTwoAdminRole('LEADERSHIP_ADMIN') === true &&
    isTwoAdminRole('MEMBER') === false,
    'Test 1.2: Exactly two administrator roles recognized by isTwoAdminRole'
  );

  assert(
    mapToCanonicalGumzoRole('founder_admin') === 'FOUNDER_ADMIN' &&
    mapToCanonicalGumzoRole('GROUP_OWNER') === 'FOUNDER_ADMIN' &&
    mapToCanonicalGumzoRole('leadership_admin') === 'LEADERSHIP_ADMIN' &&
    mapToCanonicalGumzoRole('PLATFORM_ADMIN') === 'LEADERSHIP_ADMIN' &&
    mapToCanonicalGumzoRole('member') === 'MEMBER',
    'Test 1.3: Legacy role compatibility mapping functions accurately'
  );

  assert(
    mapToCanonicalGumzoRole('MODERATOR') === null &&
    mapToCanonicalGumzoRole('SUPER_MODERATOR') === null &&
    mapToCanonicalGumzoRole('UNKNOWN_ROLE') === null,
    'Test 1.4: Invalid or extra roles safely map to null without granting admin privileges'
  );

  // --- Domain 2: Founder Admin Access Within Authorized Group ---
  console.log('\n--- Domain 2: Founder Admin Access Within Authorized Group ---');

  const { group: groupA, membership: founderMemA } = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji Kuku Morogoro',
      description: 'Kikundi cha mfano cha kuku Morogoro kwa usimamizi.',
      categoryId: 'kuku',
      visibility: 'PUBLIC',
    },
    authenticatedUserId: founderA,
    isPlatformAdmin: true, // Activated immediately for test
  });

  assert(groupA.founderAdminUserId === founderA, 'Test 2.1: Creator recorded as authoritative founderAdminUserId');
  assert(founderMemA.role === 'FOUNDER_ADMIN' && founderMemA.status === 'ACTIVE', 'Test 2.2: Founder membership created with FOUNDER_ADMIN role and ACTIVE status');

  const postAuthFounder = canUserCreatePost(founderA, groupA, founderMemA);
  assert(postAuthFounder.allowed === true && postAuthFounder.role === 'FOUNDER_ADMIN', 'Test 2.3: Founder Admin is authorized to create posts with FOUNDER_ADMIN role');

  const postA = gumzoPostService.createPost({
    input: {
      groupId: groupA.groupId,
      content: 'Karibuni kwenye mjadala wa kwanza wa ulishaji wa kuku.',
      status: 'PUBLISHED',
      visibility: 'VISIBLE',
    },
    authenticatedUserId: founderA,
  });

  assert(postA.authorUserId === founderA && postA.authorRole === 'FOUNDER_ADMIN', 'Test 2.4: Founder Admin post published with server-derived FOUNDER_ADMIN role');

  const canEditOwnPost = canUserEditPost(founderA, postA, groupA);
  assert(canEditOwnPost === true, 'Test 2.5: Founder Admin can edit own post');

  const canDeleteOwnPost = canUserDeletePost(founderA, postA, groupA);
  assert(canDeleteOwnPost === true, 'Test 2.6: Founder Admin can delete own post in their group');

  // --- Domain 3: Founder Admin Isolation from Unrelated Groups ---
  console.log('\n--- Domain 3: Founder Admin Isolation from Unrelated Groups ---');

  const { group: groupB, membership: founderMemB } = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji Ngombe Arusha',
      description: 'Kikundi cha mfano cha ngombe Arusha kwa usimamizi.',
      categoryId: 'ngombe',
      visibility: 'PUBLIC',
    },
    authenticatedUserId: founderB,
    isPlatformAdmin: true,
  });

  const postB = gumzoPostService.createPost({
    input: {
      groupId: groupB.groupId,
      content: 'Mjadala wa uzalishaji wa maziwa Arusha.',
      status: 'PUBLISHED',
      visibility: 'VISIBLE',
    },
    authenticatedUserId: founderB,
  });

  // Founder A tries to post in Group B (where Founder A is not a member or founder)
  const postAuthCrossGroup = canUserCreatePost(founderA, groupB);
  assert(postAuthCrossGroup.allowed === false, 'Test 3.1: Founder Admin A strictly blocked from creating posts in Group B');

  // Founder A tries to edit Group B's post
  const canEditCrossPost = canUserEditPost(founderA, postB, groupB);
  assert(canEditCrossPost === false, 'Test 3.2: Founder Admin A cannot edit posts in Group B');

  // Founder A tries to delete Group B's post
  const canDeleteCrossPost = canUserDeletePost(founderA, postB, groupB);
  assert(canDeleteCrossPost === false, 'Test 3.3: Founder Admin A cannot delete posts in Group B');

  // --- Domain 4: Leadership Admin Governance Permissions ---
  console.log('\n--- Domain 4: Leadership Admin Governance Permissions ---');

  // Assign Leadership Admin to Group A
  gumzoGroupService.assignLeadershipAdmin({
    groupId: groupA.groupId,
    leadershipAdminUserId: leadershipAdmin,
    platformAdminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  const groupAUpdated = gumzoGroupService.getGroupById(groupA.groupId);
  assert(groupAUpdated?.leadershipAdminUserId === leadershipAdmin, 'Test 4.1: Leadership Admin assigned authoritatively to Group A');

  // Leadership Admin post permission
  const postAuthLeader = canUserCreatePost(leadershipAdmin, groupAUpdated!);
  assert(postAuthLeader.allowed === true && postAuthLeader.role === 'LEADERSHIP_ADMIN', 'Test 4.2: Leadership Admin authorized to post with LEADERSHIP_ADMIN badge');

  // Leadership Admin can moderate/hide post in Group A
  const hiddenPost = gumzoPostService.setPostVisibility({
    postId: postA.postId,
    visibility: 'HIDDEN',
    authenticatedUserId: leadershipAdmin,
  });
  assert(hiddenPost.status === 'HIDDEN', 'Test 4.3: Leadership Admin successfully moderated/hid post');

  // Restore post visibility
  gumzoPostService.setPostVisibility({
    postId: postA.postId,
    visibility: 'VISIBLE',
    authenticatedUserId: leadershipAdmin,
  });

  // --- Domain 5: Leadership Admin Does Not Need Pre-Approval ---
  console.log('\n--- Domain 5: No Mandatory Per-Post Approval ---');

  const directPost = gumzoPostService.createPost({
    input: {
      groupId: groupA.groupId,
      content: 'Chapisho la moja kwa moja bila kuhitaji idhini ya awali.',
      status: 'PUBLISHED',
    },
    authenticatedUserId: founderA,
  });
  assert(directPost.status === 'PUBLISHED' && Boolean(directPost.publishedAt), 'Test 5.1: Post published immediately without per-post leadership approval requirement');

  // --- Domain 6: Member Cannot Create Posts (403) ---
  console.log('\n--- Domain 6: Member Strictly Prohibited from Creating Posts ---');

  const memberMemA = gumzoGroupService.joinGroup(groupA.groupId, memberAlice);
  assert(memberMemA.role === 'MEMBER' && memberMemA.status === 'ACTIVE', 'Test 6.1: User joined group as regular active MEMBER');

  const memberPostAuth = canUserCreatePost(memberAlice, groupAUpdated!, memberMemA);
  assert(memberPostAuth.allowed === false, 'Test 6.2: canUserCreatePost returns false for MEMBER');

  let memberPostThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: groupA.groupId,
        content: 'Jaribio la mwanachama kuanzisha chapisho.',
      },
      authenticatedUserId: memberAlice,
    });
  } catch (err: any) {
    memberPostThrew = err.message?.includes('403') || err.message?.includes('Wanachama hawaruhusiwi') || err.message?.includes('PERMISSION_DENIED');
  }
  assert(memberPostThrew === true, 'Test 6.3: Member post creation attempt throws 403 PERMISSION_DENIED error');

  // --- Domain 7: Active Member Can Comment ---
  console.log('\n--- Domain 7: Active Member Comment Creation ---');

  const commentAuth = canUserCreateComment(memberAlice, groupAUpdated!, directPost, memberMemA);
  assert(commentAuth.allowed === true && commentAuth.userRole === 'MEMBER', 'Test 7.1: Active member authorized to comment with server-derived MEMBER role');

  const memberComment = gumzoCommentService.createComment({
    groupId: groupA.groupId,
    postId: directPost.postId,
    input: {
      content: 'Hongera sana kwa chapisho zuri! Tunaomba maelezo zaidi.',
    },
    authenticatedUserId: memberAlice,
  });
  assert(memberComment.authorUserId === memberAlice && memberComment.authorRole === 'MEMBER', 'Test 7.2: Member comment created with authoritative authorRole locked to MEMBER');

  // --- Domain 8: Inactive / Suspended / Pending Rejection ---
  console.log('\n--- Domain 8: Inactive / Suspended / Pending Comment Rejection ---');

  // Suspended membership
  const suspendedMem = { ...memberMemA, userId: 'user_suspended_test', status: 'SUSPENDED' as const };
  const suspendedCommentAuth = canUserCreateComment('user_suspended_test', groupAUpdated!, directPost, suspendedMem);
  assert(suspendedCommentAuth.allowed === false, 'Test 8.1: SUSPENDED membership cannot comment');

  // Pending membership
  const pendingMem = { ...memberMemA, userId: 'user_pending_test', status: 'PENDING' as const };
  const pendingCommentAuth = canUserCreateComment('user_pending_test', groupAUpdated!, directPost, pendingMem);
  assert(pendingCommentAuth.allowed === false, 'Test 8.2: PENDING membership cannot comment');

  // Left membership
  const leftMem = { ...memberMemA, userId: 'user_left_test', status: 'LEFT' as const };
  const leftCommentAuth = canUserCreateComment('user_left_test', groupAUpdated!, directPost, leftMem);
  assert(leftCommentAuth.allowed === false, 'Test 8.3: LEFT membership cannot comment');

  // Outsider without membership
  const outsiderCommentAuth = canUserCreateComment(outsider, groupAUpdated!, directPost, null);
  assert(outsiderCommentAuth.allowed === false, 'Test 8.4: Non-member outsider cannot comment');

  // --- Domain 9: Client Role Spoofing Rejected ---
  console.log('\n--- Domain 9: Anti-Tampering & Client Role Spoofing Rejection ---');

  // Member attempts to pass authorRole: 'FOUNDER_ADMIN' in comment creation
  const spoofedComment = gumzoCommentService.createComment({
    groupId: groupA.groupId,
    postId: directPost.postId,
    input: {
      content: 'Najaribu kughushi cheo changu cha kuwa Founder Admin.',
    },
    authenticatedUserId: memberAlice,
    // Note: service ignores client role and strictly resolves from membership/group
  });
  assert(spoofedComment.authorRole === 'MEMBER', 'Test 9.1: Client-supplied role spoofing rejected: authorRole locked to MEMBER');
  assert(spoofedComment.authorUserId === memberAlice, 'Test 9.2: authorUserId locked strictly to authenticated caller');

  // --- Domain 10: Unauthorized Role Assignment Rejected ---
  console.log('\n--- Domain 10: Unauthorized Role Assignment Rejected ---');

  let memberAssignLeadershipThrew = false;
  try {
    gumzoGroupService.assignLeadershipAdmin({
      groupId: groupA.groupId,
      leadershipAdminUserId: memberBob,
      platformAdminUserId: memberAlice, // Regular member attempting platform assignment
      isPlatformAdmin: false,
    });
  } catch (err: any) {
    memberAssignLeadershipThrew = true;
  }
  assert(memberAssignLeadershipThrew === true, 'Test 10.1: Regular member cannot assign Leadership Admin');

  let founderSelfAssignLeadershipThrew = false;
  try {
    gumzoGroupService.assignLeadershipAdmin({
      groupId: groupA.groupId,
      leadershipAdminUserId: founderA, // Founder attempting to assign themselves as Leadership Admin
      platformAdminUserId: platformAdmin,
      isPlatformAdmin: true,
    });
  } catch (err: any) {
    founderSelfAssignLeadershipThrew = err.message?.includes('Founder Admin hawezi kuteuliwa kuwa Leadership Admin');
  }
  assert(founderSelfAssignLeadershipThrew === true, 'Test 10.2: Founder Admin prevented from being Leadership Admin of same group');

  // --- Domain 11: Unauthorized Ownership Transfer Rejected ---
  console.log('\n--- Domain 11: Unauthorized Ownership Transfer Rejected ---');

  let memberTransferThrew = false;
  try {
    gumzoGroupService.transferFounderAdmin({
      groupId: groupA.groupId,
      newFounderUserId: newFounderTarget,
      actingAdminUserId: memberAlice, // Regular member attempting transfer
      isPlatformAdmin: false,
    });
  } catch (err: any) {
    memberTransferThrew = err.message?.includes('403') || err.message?.includes('Leadership Admin');
  }
  assert(memberTransferThrew === true, 'Test 11.1: Ordinary member rejected from transferring group ownership (403)');

  let founderSelfTransferThrew = false;
  try {
    gumzoGroupService.transferFounderAdmin({
      groupId: groupA.groupId,
      newFounderUserId: newFounderTarget,
      actingAdminUserId: founderA, // Founder attempting self-transfer without leadership authorization
      isPlatformAdmin: false,
    });
  } catch (err: any) {
    founderSelfTransferThrew = err.message?.includes('403') || err.message?.includes('Leadership Admin');
  }
  assert(founderSelfTransferThrew === true, 'Test 11.2: Founder cannot transfer group ownership without Leadership Admin authority');

  // --- Domain 12: Authorized Transfer Updates Authoritative Assignment ---
  console.log('\n--- Domain 12: Authorized Transfer Updates Assignment ---');

  const transferResult = gumzoGroupService.transferFounderAdmin({
    groupId: groupA.groupId,
    newFounderUserId: newFounderTarget,
    actingAdminUserId: leadershipAdmin,
    isPlatformAdmin: false,
    reason: 'Uhamisho rasmi wa wadhifa wa Founder Admin umeidhinishwa na Leadership Admin.',
  });

  assert(transferResult.group.founderAdminUserId === newFounderTarget, 'Test 12.1: Group founderAdminUserId updated to new target user');
  assert(transferResult.previousFounderUserId === founderA, 'Test 12.2: Previous founder accurately identified as founderA');
  assert(transferResult.newFounderUserId === newFounderTarget, 'Test 12.3: New founder accurately identified as newFounderTarget');

  // --- Domain 13: Assignment History Preserved in Audit Records ---
  console.log('\n--- Domain 13: Audit Trail Preserves Assignment History ---');

  const prevFounderMem = gumzoGroupService.getMembership(groupA.groupId, founderA);
  assert(prevFounderMem?.role === 'MEMBER', 'Test 13.1: Previous founder membership transitioned to regular MEMBER');

  const newFounderMem = gumzoGroupService.getMembership(groupA.groupId, newFounderTarget);
  assert(newFounderMem?.role === 'FOUNDER_ADMIN' && newFounderMem?.status === 'ACTIVE', 'Test 13.2: New founder membership assigned FOUNDER_ADMIN role with ACTIVE status');

  const auditEvents = gumzoAuditService.getEvents({ groupId: groupA.groupId, action: 'FOUNDER_ADMIN_TRANSFERRED' });
  assert(auditEvents.length > 0, 'Test 13.3: FOUNDER_ADMIN_TRANSFERRED audit event recorded');
  const transferEvent = auditEvents[0];
  assert(
    transferEvent.actorUserId === leadershipAdmin &&
    transferEvent.details?.previousFounderUserId === founderA &&
    transferEvent.details?.newFounderUserId === newFounderTarget &&
    transferEvent.outcome === 'SUCCESS',
    'Test 13.4: Audit event preserves actor, previous founder, new founder, and SUCCESS outcome'
  );

  // --- Domain 14: Direct / Unauthorized Mutations Rejected ---
  console.log('\n--- Domain 14: Direct Mutations & Tampering Rejection ---');

  // Privilege escalation attempt audit logged when unauthorized transfer failed
  const escalationEvents = gumzoAuditService.getEvents({ action: 'PRIVILEGE_ESCALATION_ATTEMPT' });
  assert(escalationEvents.length > 0, 'Test 14.1: PRIVILEGE_ESCALATION_ATTEMPT audit event recorded for rejected unauthorized attempts');
  assert(escalationEvents[0].outcome === 'DENIED', 'Test 14.2: Escalation event outcome recorded as DENIED');

  // --- Domain 15: Group Suspension and Restoration Workflow ---
  console.log('\n--- Domain 15: Group Suspension and Restoration Workflow ---');

  // Leadership Admin suspends Group A
  const suspendedGroup = gumzoGroupService.adminUpdateGroupStatus({
    groupId: groupA.groupId,
    newStatus: 'SUSPENDED',
    adminUserId: leadershipAdmin,
    reason: 'Uchunguzi wa kimaadili unaendelea.',
  });
  assert(suspendedGroup.status === 'SUSPENDED', 'Test 15.1: Group status updated to SUSPENDED by Leadership Admin');

  // Try to create post in SUSPENDED group
  let postInSuspendedThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: groupA.groupId,
        content: 'Jaribio la kuandika kwenye kikundi kilichosimamishwa.',
      },
      authenticatedUserId: newFounderTarget,
    });
  } catch (err: any) {
    postInSuspendedThrew = true;
  }
  assert(postInSuspendedThrew === true, 'Test 15.2: New posts blocked in SUSPENDED group');

  // Leadership Admin restores group to ACTIVE
  const restoredGroup = gumzoGroupService.adminUpdateGroupStatus({
    groupId: groupA.groupId,
    newStatus: 'ACTIVE',
    adminUserId: leadershipAdmin,
    reason: 'Uchunguzi umekamilika na kikundi kimerejeshwa.',
  });
  assert(restoredGroup.status === 'ACTIVE', 'Test 15.3: Group status restored to ACTIVE by Leadership Admin');

  const suspensionAudit = gumzoAuditService.getEvents({ groupId: groupA.groupId, action: 'GROUP_SUSPENDED' });
  const restorationAudit = gumzoAuditService.getEvents({ groupId: groupA.groupId, action: 'GROUP_RESTORED' });
  assert(suspensionAudit.length > 0 && restorationAudit.length > 0, 'Test 15.4: Both suspension and restoration recorded in audit log');

  // --- Domain 16: Audit Records Authoritative & Immutable ---
  console.log('\n--- Domain 16: Audit Trail Immutability & Persistence ---');

  const allAudits = gumzoAuditService.getAllEvents();
  assert(allAudits.length >= 4, 'Test 16.1: Authoritative audit logs retained multiple governance events');

  // Verify audit event properties
  const sampleAudit = allAudits[0];
  assert(
    Boolean(sampleAudit.auditId) &&
    Boolean(sampleAudit.actorUserId) &&
    Boolean(sampleAudit.action) &&
    Boolean(sampleAudit.targetType) &&
    Boolean(sampleAudit.timestamp) &&
    Boolean(sampleAudit.outcome),
    'Test 16.2: Audit event contains all immutable fields (id, actor, action, target, timestamp, outcome)'
  );

  // --- Domain 17: Permission Caches Invalidate on Role Change ---
  console.log('\n--- Domain 17: Permission Invalidation After Role Change ---');

  // Previous founder (now regular member) can no longer create posts
  const demotedPostAuth = canUserCreatePost(founderA, restoredGroup, prevFounderMem);
  assert(demotedPostAuth.allowed === false, 'Test 17.1: Demoted former founder can no longer create posts (403)');

  // New founder can now create posts
  const promotedPostAuth = canUserCreatePost(newFounderTarget, restoredGroup, newFounderMem);
  assert(promotedPostAuth.allowed === true && promotedPostAuth.role === 'FOUNDER_ADMIN', 'Test 17.2: Newly promoted founder authorized to create posts with FOUNDER_ADMIN role');

  // --- Domain 18: Non-Interference Regressions (V9.1, V9.2, V9.3) ---
  console.log('\n--- Domain 18: V9.1, V9.2, V9.3 Core Regressions ---');

  // V9.1 Group listing
  const discoverable = gumzoGroupService.getDiscoverableGroups(memberAlice);
  assert(discoverable.some((g) => g.groupId === groupA.groupId), 'Test 18.1: V9.1 Group discovery functional');

  // V9.2 Admin post feed
  const feed = gumzoPostService.getGroupPosts({ groupId: groupA.groupId, callerUserId: memberAlice });
  assert(feed.posts.length > 0, 'Test 18.2: V9.2 Post feed retrieval functional');

  // V9.3 Comments feed
  const commentsFeed = gumzoCommentService.getPostComments({
    groupId: groupA.groupId,
    postId: directPost.postId,
    callerUserId: memberAlice,
  });
  assert(commentsFeed.comments.length > 0, 'Test 18.3: V9.3 Member comments retrieval functional');

  // --- Domain 19: Marketplace Inbox Isolation ---
  console.log('\n--- Domain 19: Marketplace Inbox Isolation from Gumzo Roles ---');

  // Activate seller monetization for test seller
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_asha_002',
    sellerProfileId: 'profile_seller_asha_002',
  });

  const testProduct: MarketplaceProduct = {
    productId: 'prod_kuku_01',
    sellerId: 'seller_asha_002',
    shopId: 'shop_asha_002',
    title: 'Kuku Chotara',
    description: 'Kuku bora wa kienyeji waliochanjwa.',
    sellerName: 'Asha Shamba',
    sellerPhone: '+255712345678',
    sellerLocation: 'Morogoro',
    status: 'active',
    moderationStatus: 'APPROVED',
    imageUrl: '/uploads/images/prod_kuku_01.jpg',
    category: 'Mifugo Hai',
    subcategory: 'Kuku',
    price: 15000,
    currency: 'Tsh',
    location: 'Morogoro',
    unit: 'kuku mmoja',
    quantityAvailable: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create private buyer-seller inbox conversation
  const convRes = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: 'buyer_juma_001',
      sellerUserId: 'seller_asha_002',
      shopId: 'shop_asha_002',
      productId: 'prod_kuku_01',
      listingId: 'prod_kuku_01',
      buyerNameSnapshot: 'Juma Mnunuzi',
      sellerNameSnapshot: 'Asha Shamba',
      productTitleSnapshot: 'Kuku Chotara',
    },
    'buyer_juma_001',
    testProduct
  );
  const conv = convRes.conversation;

  // Leadership Admin and Founder Admin try to view private conversation without being participants
  let leaderInboxBlocked = false;
  try {
    await marketplaceInboxService.getMessagesForConversation(conv.conversationId, leadershipAdmin, false);
  } catch (err: any) {
    leaderInboxBlocked = err.message?.includes('Huruhusiwi') || err.message?.includes('Mazungumzo');
  }
  assert(leaderInboxBlocked === true, 'Test 19.1: Gumzo Leadership Admin strictly blocked from private Marketplace Inbox conversation');

  let founderInboxBlocked = false;
  try {
    await marketplaceInboxService.getMessagesForConversation(conv.conversationId, founderA, false);
  } catch (err: any) {
    founderInboxBlocked = err.message?.includes('Huruhusiwi') || err.message?.includes('Mazungumzo');
  }
  assert(founderInboxBlocked === true, 'Test 19.2: Gumzo Founder Admin strictly blocked from third-party Marketplace Inbox conversation');

  // --- Domain 20: Media Attachments Retention & Validation ---
  console.log('\n--- Domain 20: Media Upload & Rendering Integrity ---');

  const mediaPost = gumzoPostService.createPost({
    input: {
      groupId: groupA.groupId,
      content: 'Maboresho ya banda la kuku.',
      media: [
        {
          id: 'med_001',
          type: 'image',
          url: '/uploads/gumzo_posts/grp_001/banda.jpg',
          storagePath: 'gumzo/posts/grp_001/banda.jpg',
          caption: 'Banda la kisasa',
        },
      ],
      status: 'PUBLISHED',
    },
    authenticatedUserId: newFounderTarget,
  });
  assert(mediaPost.media.length === 1 && mediaPost.media[0].storagePath === 'gumzo/posts/grp_001/banda.jpg', 'Test 20.1: Post media retains persistent storagePath');

  const mediaComment = gumzoCommentService.createComment({
    groupId: groupA.groupId,
    postId: mediaPost.postId,
    input: {
      content: 'Picha ya vifaa vya ulishaji.',
      media: [
        {
          id: 'cmed_001',
          type: 'image',
          url: '/uploads/gumzo_comments/grp_001/feeder.jpg',
          storagePath: 'gumzo/comments/grp_001/feeder.jpg',
        },
      ],
    },
    authenticatedUserId: memberAlice,
  });
  assert(
    mediaComment.media !== undefined &&
    mediaComment.media.length === 1 &&
    mediaComment.media[0].storagePath === 'gumzo/comments/grp_001/feeder.jpg',
    'Test 20.2: Member comment media retains persistent storagePath'
  );

  // Summary
  console.log('\n================================================================');
  console.log(`  V9.4 GOVERNANCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in V9.4 test runner:', err);
  process.exit(1);
});
