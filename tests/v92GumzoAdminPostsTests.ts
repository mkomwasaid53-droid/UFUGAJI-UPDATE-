/**
 * V9.2 — GUMZO ADMIN POSTS AUTOMATED TEST SUITE
 *
 * Verifies all requirements across the 9 core domains specified in V9.2 User Request:
 * 1. Post Creation by Founder Admin (Tests 1–4)
 * 2. Post Creation by Leadership Admin (Tests 5–7)
 * 3. Member Restriction & 403 Enforcement (Tests 8–11)
 * 4. Post Lifecycle States (Tests 12–16)
 * 5. Media Attachments (Tests 17–19)
 * 6. Post Editing (Tests 20–23)
 * 7. Post Deletion & Soft-delete (Tests 24–27)
 * 8. Feed Ordering & Group Lifecycle Propagation (Tests 28–32)
 * 9. Non-Interference Regressions (Tests 33–36)
 */

import { gumzoGroupService } from '../src/services/gumzoGroupService';
import { gumzoPostService } from '../src/services/gumzoPostService';
import {
  canUserCreatePost,
  canUserEditPost,
  canUserDeletePost,
  canUserViewPost,
  GumzoPost
} from '../src/types/gumzo';

// System Separation Regression Imports
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { daktariService } from '../src/services/daktariService';
import { getAiBusinessConfig } from '../src/services/aiUsageTrackingService';

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

async function runV92GumzoPostTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V9.2 GUMZO ADMIN POSTS TEST SUITE');
  console.log('================================================================\n');

  // Reset stores for clean isolated testing
  gumzoGroupService._clearForTesting();
  gumzoPostService._clearForTesting();

  // Test Actors
  const founderUser = 'founder_juma_001';
  const leadershipUser = 'leader_asha_002';
  const memberUser = 'member_baraka_003';
  const outsiderUser = 'outsider_kelvin_004';
  const platformAdmin = 'platform_admin_001';

  // Setup Base Active Group
  const { group: baseGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji wa Kuku Tanzania',
      description: 'Kikundi cha kujadili malezi na lishe bora ya kuku nchini Tanzania.',
      categoryId: 'kuku',
      visibility: 'PUBLIC',
    },
    authenticatedUserId: founderUser,
    isPlatformAdmin: true, // Auto-active for test setup
  });

  // Assign Leadership Admin to the group
  gumzoGroupService.assignLeadershipAdmin({
    groupId: baseGroup.groupId,
    leadershipAdminUserId: leadershipUser,
    platformAdminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  // Member joins group
  gumzoGroupService.joinGroup(baseGroup.groupId, memberUser);

  // --------------------------------------------------------------------------
  // Domain 1: Post Creation by Founder Admin (Tests 1–4)
  // --------------------------------------------------------------------------
  console.log('--- Domain 1: Post Creation by Founder Admin ---');

  const post1 = gumzoPostService.createPost({
    input: {
      groupId: baseGroup.groupId,
      content: 'Karibuni wanachama wote kwenye kikundi chetu cha kuku! Mada ya wiki hii ni joto la vifaranga.',
      status: 'PUBLISHED',
      visibility: 'VISIBLE',
    },
    authenticatedUserId: founderUser,
  });

  assert(Boolean(post1.postId), 'Test 1.1: Founder Admin can create post with unique postId');
  assert(post1.authorUserId === founderUser, 'Test 1.2: Post authorUserId matches authenticated Founder');
  assert(post1.authorRole === 'FOUNDER_ADMIN', 'Test 1.3: Post authorRole is server-authoritatively set to FOUNDER_ADMIN');
  assert(post1.status === 'PUBLISHED', 'Test 1.4: Post status is PUBLISHED');
  assert(Boolean(post1.publishedAt), 'Test 2: publishedAt is set upon publication');

  // Unauthenticated creation fails
  let unauthThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: baseGroup.groupId,
        content: 'Chapisho lisilo na akaunti',
      },
      authenticatedUserId: '',
    });
  } catch {
    unauthThrew = true;
  }
  assert(unauthThrew, 'Test 3: Unauthenticated request is rejected');

  // Empty content without media fails
  let emptyThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: baseGroup.groupId,
        content: '   ',
      },
      authenticatedUserId: founderUser,
    });
  } catch {
    emptyThrew = true;
  }
  assert(emptyThrew, 'Test 4: Post with empty text and no media is rejected');

  // --------------------------------------------------------------------------
  // Domain 2: Post Creation by Leadership Admin (Tests 5–7)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 2: Post Creation by Leadership Admin ---');

  const post2 = gumzoPostService.createPost({
    input: {
      groupId: baseGroup.groupId,
      content: 'Mwongozo rasmi wa uongozi wa jukwaa kuhusu chanjo za mdondo (Newcastle disease).',
      status: 'PUBLISHED',
      visibility: 'VISIBLE',
    },
    authenticatedUserId: leadershipUser,
  });

  assert(Boolean(post2.postId), 'Test 5.1: Leadership Admin can create post');
  assert(post2.authorUserId === leadershipUser, 'Test 5.2: authorUserId matches Leadership Admin');
  assert(post2.authorRole === 'LEADERSHIP_ADMIN', 'Test 5.3: authorRole is server-authoritatively set to LEADERSHIP_ADMIN');

  // Platform admin can also create leadership post
  const postAdmin = gumzoPostService.createPost({
    input: {
      groupId: baseGroup.groupId,
      content: 'Tangazo rasmi kutoka Ufugaji Update Platform Administration.',
    },
    authenticatedUserId: platformAdmin,
    isPlatformAdmin: true,
  });
  assert(postAdmin.authorRole === 'LEADERSHIP_ADMIN', 'Test 6: Platform Admin post inherits LEADERSHIP_ADMIN role');

  // --------------------------------------------------------------------------
  // Domain 3: Member Restriction & 403 Enforcement (Tests 8–11)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 3: Member Restriction & 403 Enforcement ---');

  // Helper check
  const memberCheck = canUserCreatePost(
    memberUser,
    baseGroup,
    gumzoGroupService.getMembership(baseGroup.groupId, memberUser)
  );
  assert(memberCheck.allowed === false, 'Test 8: canUserCreatePost helper returns false for MEMBER');

  // Service attempt by member
  let memberThrew = false;
  let memberErrorMsg = '';
  try {
    gumzoPostService.createPost({
      input: {
        groupId: baseGroup.groupId,
        content: 'Habari, mimi ni mwanachama ninataka kuandika post hapa.',
      },
      authenticatedUserId: memberUser,
    });
  } catch (err: any) {
    memberThrew = true;
    memberErrorMsg = err.message || '';
  }
  assert(memberThrew, 'Test 9: Member post creation attempt throws authorization error');
  assert(
    memberErrorMsg.includes('Wanachama hawaruhusiwi') ||
    memberErrorMsg.includes('403') ||
    memberErrorMsg.includes('Mamlaka ya uongozi'),
    'Test 10: Error message explicitly states member restriction / 403'
  );

  // Outsider attempt
  let outsiderThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: baseGroup.groupId,
        content: 'Mimi sio mwanachama wala kiongozi.',
      },
      authenticatedUserId: outsiderUser,
    });
  } catch {
    outsiderThrew = true;
  }
  assert(outsiderThrew, 'Test 11: Non-member outsider cannot create post');

  // --------------------------------------------------------------------------
  // Domain 4: Post Lifecycle States (Tests 12–16)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 4: Post Lifecycle States ---');

  // Create Draft
  const draftPost = gumzoPostService.createPost({
    input: {
      groupId: baseGroup.groupId,
      content: 'Hii ni rasimu ya somo la ujenzi wa mabanda.',
      status: 'DRAFT',
    },
    authenticatedUserId: founderUser,
  });
  assert(draftPost.status === 'DRAFT', 'Test 12: Post can be saved as DRAFT');
  assert(!draftPost.publishedAt, 'Test 13: DRAFT has no publishedAt timestamp');

  // Feed check: member should NOT see DRAFT
  const memberFeed1 = gumzoPostService.getGroupPosts({
    groupId: baseGroup.groupId,
    callerUserId: memberUser,
  });
  const foundDraftInMemberFeed = memberFeed1.posts.some((p) => p.postId === draftPost.postId);
  assert(!foundDraftInMemberFeed, 'Test 14: Regular member feed excludes DRAFT posts');

  // Founder should see their own draft if requested
  const founderFeed = gumzoPostService.getGroupPosts({
    groupId: baseGroup.groupId,
    callerUserId: founderUser,
    includeDrafts: true,
  });
  const foundDraftInFounderFeed = founderFeed.posts.some((p) => p.postId === draftPost.postId);
  assert(foundDraftInFounderFeed, 'Test 15: Author can access DRAFT posts');

  // Publish the draft
  const publishedDraft = gumzoPostService.updatePost({
    postId: draftPost.postId,
    input: { status: 'PUBLISHED' },
    authenticatedUserId: founderUser,
  });
  assert(publishedDraft.status === 'PUBLISHED', 'Test 16.1: Draft successfully transitioned to PUBLISHED');
  assert(Boolean(publishedDraft.publishedAt), 'Test 16.2: publishedAt is populated upon transition to PUBLISHED');

  // --------------------------------------------------------------------------
  // Domain 5: Media Attachments (Tests 17–19)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 5: Media Attachments ---');

  const mediaPost = gumzoPostService.createPost({
    input: {
      groupId: baseGroup.groupId,
      content: 'Tazama picha hii ya banda bora la kuku lenye hewa ya kutosha.',
      media: [
        {
          id: 'med_01',
          type: 'image',
          url: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7',
          caption: 'Banda la kisasa la kuku',
        },
      ],
    },
    authenticatedUserId: founderUser,
  });
  assert(mediaPost.media.length === 1, 'Test 17: Post supports media attachments');
  assert(mediaPost.media[0].caption === 'Banda la kisasa la kuku', 'Test 18: Media caption preserved');

  // Excessive media rejection (>10)
  let excessMediaThrew = false;
  try {
    const elevenItems = Array(11).fill(0).map((_, i) => ({
      id: `med_${i}`,
      type: 'image' as const,
      url: `https://example.com/img_${i}.jpg`,
    }));
    gumzoPostService.createPost({
      input: {
        groupId: baseGroup.groupId,
        content: 'Picha nyingi kupita kiasi',
        media: elevenItems,
      },
      authenticatedUserId: founderUser,
    });
  } catch {
    excessMediaThrew = true;
  }
  assert(excessMediaThrew, 'Test 19: More than 10 media items rejected');

  // --------------------------------------------------------------------------
  // Domain 6: Post Editing (Tests 20–23)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 6: Post Editing ---');

  const edited = gumzoPostService.updatePost({
    postId: post1.postId,
    input: { content: 'Maudhui yaliyorekebishwa: Mada ya wiki hii ni joto na hewa ya vifaranga.' },
    authenticatedUserId: founderUser,
  });
  assert(edited.content.includes('Maudhui yaliyorekebishwa'), 'Test 20.1: Author can edit post content');
  assert(edited.authorUserId === founderUser, 'Test 20.2: Author identity remains immutable');
  assert(edited.updatedAt !== edited.createdAt, 'Test 20.3: updatedAt is updated');

  // Member cannot edit admin post
  let memberEditThrew = false;
  try {
    gumzoPostService.updatePost({
      postId: post1.postId,
      input: { content: 'Uhariri usioidhinishwa na mwanachama' },
      authenticatedUserId: memberUser,
    });
  } catch {
    memberEditThrew = true;
  }
  assert(memberEditThrew, 'Test 21: Member cannot edit post (403)');

  // Leadership admin can moderate/edit
  const moderatedByLeader = gumzoPostService.updatePost({
    postId: post1.postId,
    input: { isPinned: true },
    authenticatedUserId: leadershipUser,
  });
  assert(moderatedByLeader.isPinned === true, 'Test 22: Leadership Admin can pin post');

  // Outsider cannot edit
  let outsiderEditThrew = false;
  try {
    gumzoPostService.updatePost({
      postId: post1.postId,
      input: { content: 'Hacked by outsider' },
      authenticatedUserId: outsiderUser,
    });
  } catch {
    outsiderEditThrew = true;
  }
  assert(outsiderEditThrew, 'Test 23: Outsider cannot edit post');

  // --------------------------------------------------------------------------
  // Domain 7: Post Deletion & Soft-delete (Tests 24–27)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 7: Post Deletion & Soft-delete ---');

  const postToDelete = gumzoPostService.createPost({
    input: {
      groupId: baseGroup.groupId,
      content: 'Chapisho linaloenda kufutwa.',
    },
    authenticatedUserId: founderUser,
  });

  // Member cannot delete
  let memberDeleteThrew = false;
  try {
    gumzoPostService.deletePost({
      postId: postToDelete.postId,
      authenticatedUserId: memberUser,
    });
  } catch {
    memberDeleteThrew = true;
  }
  assert(memberDeleteThrew, 'Test 24: Member cannot delete post');

  // Author soft-deletes post
  const deletedPost = gumzoPostService.deletePost({
    postId: postToDelete.postId,
    authenticatedUserId: founderUser,
    reason: 'Limefutwa na mwandishi',
  });
  assert(deletedPost.status === 'DELETED', 'Test 25: Post status becomes DELETED');
  assert(Boolean(deletedPost.deletedAt), 'Test 26: deletedAt timestamp recorded (soft-delete audit preserved)');

  // Excluded from feed
  const feedAfterDelete = gumzoPostService.getGroupPosts({
    groupId: baseGroup.groupId,
    callerUserId: memberUser,
  });
  const foundDeleted = feedAfterDelete.posts.some((p) => p.postId === postToDelete.postId);
  assert(!foundDeleted, 'Test 27: DELETED post is excluded from group feed');

  // --------------------------------------------------------------------------
  // Domain 8: Feed Ordering & Group Lifecycle Propagation (Tests 28–32)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 8: Feed Ordering & Group Lifecycle Propagation ---');

  // Pinned post should appear first in feed
  const feedWithPin = gumzoPostService.getGroupPosts({
    groupId: baseGroup.groupId,
    callerUserId: memberUser,
  });
  assert(feedWithPin.posts.length > 0, 'Test 28.1: Feed returns active posts');
  assert(feedWithPin.posts[0].isPinned === true, 'Test 28.2: Pinned post appears first in the feed');

  // Create a suspended group
  const { group: suspendedGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi Kilichosimamishwa',
      description: 'Kikundi ambacho kitasimamishwa na uongozi.',
      categoryId: 'mbuzi_kondoo',
      visibility: 'PUBLIC',
    },
    authenticatedUserId: founderUser,
    isPlatformAdmin: true,
  });
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: suspendedGroup.groupId,
    newStatus: 'SUSPENDED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  // Post creation in suspended group must be rejected
  let suspendedPostThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: suspendedGroup.groupId,
        content: 'Kujaribu kupost kwenye kikundi kilichosimamishwa',
      },
      authenticatedUserId: founderUser,
    });
  } catch {
    suspendedPostThrew = true;
  }
  assert(suspendedPostThrew, 'Test 29: Cannot create post in a SUSPENDED group');

  // Create an archived group
  const { group: archivedGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Kumbukumbu',
      description: 'Kikundi cha zamani.',
      categoryId: 'ngombe',
      visibility: 'PUBLIC',
    },
    authenticatedUserId: founderUser,
    isPlatformAdmin: true,
  });
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: archivedGroup.groupId,
    newStatus: 'ARCHIVED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  // Post creation in archived group must be rejected
  let archivedPostThrew = false;
  try {
    gumzoPostService.createPost({
      input: {
        groupId: archivedGroup.groupId,
        content: 'Kujaribu kupost kwenye kikundi cha kumbukumbu',
      },
      authenticatedUserId: founderUser,
    });
  } catch {
    archivedPostThrew = true;
  }
  assert(archivedPostThrew, 'Test 30: Cannot create post in an ARCHIVED group');

  // Private group post visibility
  const { group: privateGroup } = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Siri cha Wafugaji',
      description: 'Mijadala ya faragha pekee.',
      categoryId: 'nguruwe',
      visibility: 'PRIVATE',
    },
    authenticatedUserId: founderUser,
    isPlatformAdmin: true,
  });
  const privatePost = gumzoPostService.createPost({
    input: {
      groupId: privateGroup.groupId,
      content: 'Mada ya faragha kwa wanachama tu.',
    },
    authenticatedUserId: founderUser,
  });

  // Non-member outsider cannot view post in private group
  const outsiderCanViewPrivate = canUserViewPost(outsiderUser, privatePost, privateGroup);
  assert(!outsiderCanViewPrivate, 'Test 31: Outsider cannot view post in PRIVATE group');

  // Founder can view post in private group
  const founderCanViewPrivate = canUserViewPost(founderUser, privatePost, privateGroup);
  assert(founderCanViewPrivate, 'Test 32: Founder can view post in PRIVATE group');

  // --------------------------------------------------------------------------
  // Domain 9: Non-Interference Regressions (Tests 33–36)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 9: Non-Interference Regressions ---');

  // Test 33: Marketplace Inbox remains intact
  marketplaceInboxService._resetInboxForTesting();
  const inboxConv = await marketplaceInboxService.getOrCreateConversation({
    buyerUserId: 'buyer_reg_01',
    sellerUserId: 'seller_reg_02',
    productId: 'prod_reg_01',
    listingId: 'list_reg_01',
    productTitleSnapshot: 'Kuku Chotara',
  }, 'buyer_reg_01');
  assert(Boolean(inboxConv.conversation.conversationId), 'Test 33: Marketplace Inbox service unaffected');

  // Test 34: Seller Monetization remains intact
  sellerMonetizationService._resetForTesting();
  const trial = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_reg_trial',
    sellerProfileId: 'profile_reg_trial',
  });
  assert(trial.success === true, 'Test 34: Seller Monetization service unaffected');

  // Test 35: Daktari service remains intact
  assert(typeof daktariService.getDoctors === 'function', 'Test 35: Daktari Clinical service unaffected');

  // Test 36: AI Business Config remains intact
  const aiConfig = getAiBusinessConfig();
  assert(Boolean(aiConfig), 'Test 36: AI business config unaffected');

  // Summary
  console.log('\n================================================================');
  console.log(`  V9.2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runV92GumzoPostTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
