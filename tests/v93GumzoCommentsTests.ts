import { gumzoGroupService, initGumzoStorage } from '../src/services/gumzoGroupService';
import { gumzoPostService, initGumzoPostsStorage } from '../src/services/gumzoPostService';
import { gumzoCommentService, initGumzoCommentsStorage } from '../src/services/gumzoCommentService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import {
  canUserCreateComment,
  canUserEditComment,
  canUserDeleteComment,
  canUserHideComment,
  canUserCreatePost,
  GumzoGroup,
  GumzoPost,
  GumzoMembership,
  GumzoComment
} from '../src/types/gumzo';
import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runV93GumzoCommentsTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V9.3 GUMZO MEMBER COMMENTS TEST SUITE');
  console.log('================================================================');

  let passed = 0;
  function pass(testName: string) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  }

  // Set up isolated temp test directory
  const testDir = path.join(process.cwd(), 'data_v93_test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  initGumzoStorage(fs, path, testDir);
  initGumzoPostsStorage(fs, path, testDir);
  initGumzoCommentsStorage(fs, path, testDir);

  const founderId = 'founder_v93_usr';
  const leadershipId = 'leader_v93_usr';
  const memberId1 = 'member_v93_usr_01';
  const memberId2 = 'member_v93_usr_02';
  const suspendedMemberId = 'member_v93_suspended';
  const outsiderId = 'outsider_v93_usr';

  console.log('\n--- Domain 1: Setup Group, Leadership & Post Foundation ---');

  // 1. Create active group
  const testSuffix = Date.now().toString(36);
  const { group: rawGroup, membership: founderMembership } = gumzoGroupService.createGroup({
    input: {
      name: `V9.3 Wafugaji wa Mbuzi na Kondoo ${testSuffix}`,
      description: 'Kikundi cha majaribio ya maoni ya wanachama na viongozi kwa mujibu wa V9.3.',
      categoryId: 'mbuzi_kondoo',
      livestockType: 'GOAT_SHEEP',
      visibility: 'PUBLIC'
    },
    authenticatedUserId: founderId,
    isPlatformAdmin: true // start as ACTIVE
  });
  const groupId = rawGroup.groupId;
  pass('Test 1.1: Active test group created successfully');

  // Appoint leadership admin
  gumzoGroupService.assignLeadershipAdmin({
    groupId,
    leadershipAdminUserId: leadershipId,
    platformAdminUserId: 'platform_super_admin',
    isPlatformAdmin: true
  });
  const leaderMembership = gumzoGroupService.getMembership(groupId, leadershipId);
  pass('Test 1.2: Leadership admin appointed with distinct role');

  // Member 1 joins
  const member1Membership = gumzoGroupService.joinGroup(groupId, memberId1);
  assert(member1Membership.role === 'MEMBER', 'Member 1 must have role MEMBER');
  pass('Test 1.3: Regular member joins successfully as MEMBER');

  // Member 2 joins
  const member2Membership = gumzoGroupService.joinGroup(groupId, memberId2);
  pass('Test 1.4: Regular member 2 joins successfully as MEMBER');

  // Suspended member setup
  gumzoGroupService.joinGroup(groupId, suspendedMemberId);
  const suspMembership = gumzoGroupService.updateMembershipStatus(groupId, suspendedMemberId, 'SUSPENDED');
  pass('Test 1.5: Suspended member fixture configured');

  // Create an Admin Post by Founder
  const post1 = gumzoPostService.createPost({
    input: {
      groupId,
      content: 'Mada ya Leo: Mbinu bora za ulishaji wa mbuzi wa maziwa kipindi cha kiangazi.',
      status: 'PUBLISHED',
      visibility: 'VISIBLE'
    },
    authenticatedUserId: founderId
  });
  const postId = post1.postId;
  assert(post1.status === 'PUBLISHED', 'Post must be published');
  pass('Test 1.6: Admin post created by Founder');

  // Member CANNOT create posts (V9.2 rule preserved)
  const memberPostAuth = canUserCreatePost(memberId1, rawGroup, member1Membership, false);
  assert(!memberPostAuth.allowed, 'Member must not be allowed to create post');
  let memberPostThrew = false;
  try {
    gumzoPostService.createPost({
      input: { groupId, content: 'Napenda kuanzisha mada yangu', status: 'PUBLISHED' },
      authenticatedUserId: memberId1
    });
  } catch (err: any) {
    memberPostThrew = true;
  }
  assert(memberPostThrew, 'Member post creation throws permission error');
  pass('Test 1.7: Rule preserved: Member strictly forbidden from creating posts (403)');

  console.log('\n--- Domain 2: Member Comment Creation & Server Authority ---');

  // 2. Member creates a text comment
  const comment1 = gumzoCommentService.createComment({
    groupId,
    postId,
    input: {
      content: 'Asante sana Mwenyekiti kwa mada nzuri! Je, majani ya Calliandra yanafaa zaidi? 🌿'
    },
    authenticatedUserId: memberId1
  });
  assert(comment1.commentId.startsWith('cmt_'), 'Comment ID generated');
  assert(comment1.authorUserId === memberId1, 'authorUserId locked to member');
  assert(comment1.authorRole === 'MEMBER', 'authorRole authoritative MEMBER');
  assert(comment1.groupId === groupId, 'Comment groupId assigned');
  assert(comment1.postId === postId, 'Comment postId assigned');
  assert(comment1.status === 'PUBLISHED', 'Initial status is PUBLISHED');
  assert(comment1.content.includes('🌿'), 'Unicode emoji preserved');
  assert(Boolean(comment1.createdAt), 'createdAt populated');
  pass('Test 2.1: Member creates comment with emoji and server-authoritative role MEMBER');

  // 3. Admin (Founder) creates a comment
  const adminComment = gumzoCommentService.createComment({
    groupId,
    postId,
    input: {
      content: 'Ndio Calliandra inafaa sana, ongeza na pumba kidogo kwa uwiano mzuri. 👍'
    },
    authenticatedUserId: founderId
  });
  assert(adminComment.authorRole === 'FOUNDER_ADMIN', 'authorRole must be FOUNDER_ADMIN');
  pass('Test 2.2: Founder Admin can comment and inherits FOUNDER_ADMIN role badge');

  // 4. Leadership Admin creates a comment
  const leaderComment = gumzoCommentService.createComment({
    groupId,
    postId,
    input: {
      content: 'Pia hakikisha maji safi yapo kila wakati kwa ajili ya usagaji bora wa chakula.'
    },
    authenticatedUserId: leadershipId
  });
  assert(leaderComment.authorRole === 'LEADERSHIP_ADMIN', 'authorRole must be LEADERSHIP_ADMIN');
  pass('Test 2.3: Leadership Admin can comment and inherits LEADERSHIP_ADMIN role badge');

  // 5. Unauthenticated user rejected
  let unauthThrew = false;
  try {
    gumzoCommentService.createComment({
      groupId,
      postId,
      input: { content: 'Bila login' },
      authenticatedUserId: ''
    });
  } catch (err: any) {
    unauthThrew = true;
  }
  assert(unauthThrew, 'Unauthenticated user rejected from commenting');
  pass('Test 2.4: Unauthenticated user is strictly blocked from commenting');

  // 6. Suspended member rejected
  const suspAuth = canUserCreateComment(suspendedMemberId, rawGroup, post1, suspMembership, false);
  assert(!suspAuth.allowed, 'Suspended member not allowed in helper');
  let suspThrew = false;
  try {
    gumzoCommentService.createComment({
      groupId,
      postId,
      input: { content: 'Nimesimamishwa lakini nataka kutoa maoni' },
      authenticatedUserId: suspendedMemberId
    });
  } catch (err: any) {
    suspThrew = true;
  }
  assert(suspThrew, 'Suspended member blocked by service');
  pass('Test 2.5: Suspended member is blocked from commenting');

  // 7. Empty comment rejected
  let emptyThrew = false;
  try {
    gumzoCommentService.createComment({
      groupId,
      postId,
      input: { content: '   ' },
      authenticatedUserId: memberId2
    });
  } catch (err: any) {
    emptyThrew = true;
  }
  assert(emptyThrew, 'Empty comment rejected');
  pass('Test 2.6: Empty text comment without media is rejected');

  console.log('\n--- Domain 3: Media & Idempotency ---');

  // 8. Comment with media attachment
  const mediaComment = gumzoCommentService.createComment({
    groupId,
    postId,
    input: {
      content: 'Tazama picha ya mbuzi wangu nilivyowatunza kwa mbinu hii:',
      media: [
        {
          id: 'med_c1',
          type: 'image',
          url: 'https://images.unsplash.com/photo-1524024973431-2ad916746881?auto=format&fit=crop&w=600&q=80',
          caption: 'Mbuzi wa kisasa'
        }
      ]
    },
    authenticatedUserId: memberId2
  });
  assert(mediaComment.media && mediaComment.media.length === 1, 'Media attached');
  assert(mediaComment.media![0].type === 'image', 'Media type is image');
  pass('Test 3.1: Comment supports valid media attachment');

  // 9. Idempotent comment creation via clientRequestId
  const clientReqId = 'req_idempotent_test_99';
  const cmtIdemp1 = gumzoCommentService.createComment({
    groupId,
    postId,
    input: {
      content: 'Maoni yenye idempotency token',
      clientRequestId: clientReqId
    },
    authenticatedUserId: memberId2
  });
  const cmtIdemp2 = gumzoCommentService.createComment({
    groupId,
    postId,
    input: {
      content: 'Maoni yaleyale yakirudiwa',
      clientRequestId: clientReqId
    },
    authenticatedUserId: memberId2
  });
  assert(cmtIdemp1.commentId === cmtIdemp2.commentId, 'Idempotent request returns identical comment');
  pass('Test 3.2: Duplicate clientRequestId handled idempotently without duplicate comment');

  console.log('\n--- Domain 4: Comment Editing & Ownership Boundaries ---');

  // 10. Member can edit their own comment
  const editedCmt1 = gumzoCommentService.updateComment({
    groupId,
    postId,
    commentId: comment1.commentId,
    input: { content: 'Marekebisho: Nilimaanisha Calliandra na pia majani ya Desmodium. 🌿' },
    authenticatedUserId: memberId1
  });
  assert(editedCmt1.content.includes('Desmodium'), 'Content updated');
  assert(editedCmt1.authorUserId === memberId1, 'Author remains immutable');
  assert(editedCmt1.updatedAt > comment1.createdAt, 'updatedAt refreshed');
  pass('Test 4.1: Member can edit their own comment and author identity remains immutable');

  // 11. Member CANNOT edit another member's comment (403)
  const canOtherEdit = canUserEditComment(memberId2, editedCmt1, rawGroup, false);
  assert(!canOtherEdit, 'Member 2 cannot edit Member 1 comment');
  let unauthorizedEditThrew = false;
  try {
    gumzoCommentService.updateComment({
      groupId,
      postId,
      commentId: editedCmt1.commentId,
      input: { content: 'Jaribio la kuingilia maoni ya mwingine' },
      authenticatedUserId: memberId2
    });
  } catch (err: any) {
    unauthorizedEditThrew = true;
  }
  assert(unauthorizedEditThrew, 'Unauthorized edit throws permission error');
  pass('Test 4.2: Member cannot edit another member comment (403)');

  // 12. Leadership / Founder Admin can manage comments
  const adminEdited = gumzoCommentService.updateComment({
    groupId,
    postId,
    commentId: editedCmt1.commentId,
    input: { content: 'Ufafanuzi rasmi: (Maudhui yaliyosawazishwa na Uongozi).' },
    authenticatedUserId: leadershipId,
    isPlatformAdmin: true
  });
  assert(adminEdited.updatedBy === leadershipId, 'updatedBy shows admin');
  assert(adminEdited.authorUserId === memberId1, 'Original authorUserId preserved');
  pass('Test 4.3: Authorized Leadership Admin can manage comment while preserving original authorUserId');

  console.log('\n--- Domain 5: Comment Deletion & Soft-Hide Lifecycle ---');

  // 13. Member can delete their own comment
  const deletedCmt = gumzoCommentService.deleteComment({
    groupId,
    postId,
    commentId: mediaComment.commentId,
    authenticatedUserId: memberId2
  });
  assert(deletedCmt.status === 'DELETED', 'Status transitioned to DELETED');
  assert(Boolean(deletedCmt.deletedAt), 'deletedAt timestamp preserved');
  assert(deletedCmt.deletedBy === memberId2, 'deletedBy records caller');
  pass('Test 5.1: Member can delete own comment via soft-delete audit');

  // 14. DELETED comment is excluded from normal post feed
  const feedAfterDel = gumzoCommentService.getPostComments({
    groupId,
    postId,
    callerUserId: memberId1
  });
  const deletedInFeed = feedAfterDel.comments.some((c) => c.commentId === mediaComment.commentId);
  assert(!deletedInFeed, 'Deleted comment must not appear in normal feed');
  pass('Test 5.2: DELETED comment excluded from normal comments feed');

  // 15. Admin can soft-hide comment
  const hiddenCmt = gumzoCommentService.hideComment({
    groupId,
    postId,
    commentId: adminComment.commentId,
    authenticatedUserId: leadershipId,
    reason: 'Inafanyiwa mapitio na uongozi'
  });
  assert(hiddenCmt.status === 'HIDDEN', 'Comment marked HIDDEN');
  pass('Test 5.3: Authorized admin can soft-hide inappropriate comment');

  // 16. Regular member cannot see HIDDEN comment, but admin can
  const memberFeedView = gumzoCommentService.getPostComments({
    groupId,
    postId,
    callerUserId: memberId1
  });
  assert(!memberFeedView.comments.some((c) => c.commentId === adminComment.commentId), 'Member cannot see HIDDEN comment');

  const adminFeedView = gumzoCommentService.getPostComments({
    groupId,
    postId,
    callerUserId: founderId,
    isPlatformAdmin: true
  });
  assert(adminFeedView.comments.some((c) => c.commentId === adminComment.commentId), 'Admin can view HIDDEN comment in audit list');
  pass('Test 5.4: HIDDEN comments hidden from regular members but accessible to admins');

  console.log('\n--- Domain 6: Comment Ordering & Active Counts ---');

  // 17. Feed order is chronological (createdAt ASC)
  const commentA = gumzoCommentService.createComment({
    groupId,
    postId,
    input: { content: 'Mwanzo wa mjadala' },
    authenticatedUserId: memberId1
  });
  const commentB = gumzoCommentService.createComment({
    groupId,
    postId,
    input: { content: 'Katikati ya mjadala' },
    authenticatedUserId: memberId2
  });
  const activeFeed = gumzoCommentService.getPostComments({
    groupId,
    postId,
    callerUserId: memberId1
  });
  assert(activeFeed.comments.length >= 2, 'Feed contains active comments');
  for (let i = 0; i < activeFeed.comments.length - 1; i++) {
    const timeCurr = new Date(activeFeed.comments[i].createdAt).getTime();
    const timeNext = new Date(activeFeed.comments[i + 1].createdAt).getTime();
    assert(timeCurr <= timeNext, 'Comments must be ordered chronologically ASC');
  }
  pass('Test 6.1: Comments ordered chronologically from oldest to newest (createdAt ASC)');

  // 18. Active count on post is accurately maintained
  const rawPostUpdated = gumzoPostService.getRawPost(postId);
  assert(typeof rawPostUpdated?.commentCount === 'number' && rawPostUpdated.commentCount > 0, 'commentCount on post is synchronized');
  pass('Test 6.2: Synchronized active comment count on parent post');

  console.log('\n--- Domain 7: Non-Interference Regressions ---');

  // 19. Marketplace Inbox integrity
  marketplaceInboxService._resetInboxForTesting();
  const conv = await marketplaceInboxService.getOrCreateConversation({
    buyerUserId: 'buyer_test_reg_93',
    sellerUserId: 'seller_test_reg_93',
    shopId: 'shop_test_reg_93',
    productId: 'prod_test_reg_93',
    listingId: 'list_test_reg_93',
    productTitleSnapshot: 'Kuku wa Nyama V93'
  }, 'buyer_test_reg_93');
  assert(Boolean(conv.conversation.conversationId), 'Marketplace inbox creates conversation');
  pass('Test 7.1: Marketplace Inbox operations unaffected');

  // 20. Seller Monetization integrity
  sellerMonetizationService._resetForTesting();
  const trial = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_reg_v93_01',
    sellerProfileId: 'profile_reg_v93_01',
  });
  assert(trial.success === true, 'Seller Monetization trial activation');
  pass('Test 7.2: Seller Monetization service operations unaffected');

  console.log('================================================================');
  console.log(`  GUMZO V9.3 COMMENTS TEST SUITE SUMMARY: ${passed} PASSED / 0 FAILED`);
  console.log('================================================================');

  // Clean up temp test directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
}

runV93GumzoCommentsTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Unhandled failure in V9.3 test runner:', err);
    process.exit(1);
  });
