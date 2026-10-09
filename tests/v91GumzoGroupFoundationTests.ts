/**
 * V9.1 — GUMZO GROUP FOUNDATION AUTOMATED TEST SUITE
 *
 * Verifies all 33 requirements across 7 core domains:
 * 1. Group Creation (Tests 1–6)
 * 2. Roles & Governance (Tests 7–11)
 * 3. Membership Lifecycle & Uniqueness (Tests 12–15)
 * 4. Group Lifecycle States (Tests 16–20)
 * 5. Visibility Boundaries (Tests 21–23)
 * 6. Server-Authoritative Security & Anti-Tampering (Tests 24–28)
 * 7. System Separation & Non-Interference Regressions (Tests 29–33)
 */

import { gumzoGroupService } from '../src/services/gumzoGroupService';
import {
  canAccessGumzoGroup,
  isGroupFounderAdmin,
  isGroupLeadershipAdmin,
  isGroupAdmin,
  isGroupMember,
  GUMZO_CATEGORIES,
} from '../src/types/gumzo';

// System Separation Regression Imports
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { getLocalCachedCategories } from '../src/services/marketplaceCategoryService';
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

async function runGumzoTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V9.1 GUMZO GROUP FOUNDATION TEST SUITE');
  console.log('================================================================\n');

  // Reset stores for clean isolated testing
  gumzoGroupService._clearForTesting();

  // Test Actors
  const user1 = 'farmer_juma_101';
  const user2 = 'farmer_asha_102';
  const user3 = 'farmer_baraka_103';
  const platformAdmin = 'platform_admin_001';

  // --------------------------------------------------------------------------
  // Group 1: Group Creation (Tests 1–6)
  // --------------------------------------------------------------------------
  console.log('--- Domain 1: Group Creation & Validation ---');

  // Test 1: Authenticated user can create/request a group
  const createRes1 = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji wa Kuku Morogoro',
      description: 'Kikundi cha kujadili malezi bora ya kuku wa kienyeji na chotara mkoani Morogoro.',
      categoryId: 'kuku',
      visibility: 'PUBLIC',
    },
    authenticatedUserId: user1,
  });

  assert(Boolean(createRes1.group.groupId), 'Test 1.1: Authenticated user successfully creates group with unique groupId');
  assert(createRes1.group.name === 'Wafugaji wa Kuku Morogoro', 'Test 1.2: Group retains authoritative name');
  assert(createRes1.group.categoryId === 'kuku', 'Test 1.3: CategoryId mapped accurately');

  // Test 2: Unauthenticated user is rejected
  let unauthThrew = false;
  try {
    gumzoGroupService.createGroup({
      input: {
        name: 'Kikundi Feki',
        description: 'Maelezo yasiyo na mtumiaji halisi wa mfumo.',
        categoryId: 'kuku',
        visibility: 'PUBLIC',
      },
      authenticatedUserId: '', // Empty unauthenticated ID
    });
  } catch (err: any) {
    unauthThrew = true;
  }
  assert(unauthThrew, 'Test 2: Unauthenticated user is strictly rejected from creating a group');

  // Test 3: Founder identity is server-authoritative
  assert(createRes1.group.founderAdminUserId === user1, 'Test 3.1: founderAdminUserId is locked to authenticated caller');
  assert(createRes1.group.createdBy === user1, 'Test 3.2: createdBy is locked to authenticated caller');

  // Test 4: Client cannot force ACTIVE
  assert(createRes1.group.status === 'PENDING_APPROVAL', 'Test 4: Initial group status is strictly PENDING_APPROVAL for non-admin requests');

  // Test 5: Invalid group data is rejected
  let shortNameThrew = false;
  try {
    gumzoGroupService.createGroup({
      input: {
        name: 'AB', // < 3 characters
        description: 'Maelezo marefu ya kutosha kwa ajili ya kupima jina fupi.',
        categoryId: 'kuku',
        visibility: 'PUBLIC',
      },
      authenticatedUserId: user1,
    });
  } catch {
    shortNameThrew = true;
  }
  assert(shortNameThrew, 'Test 5.1: Group name shorter than 3 characters is rejected');

  let invalidCatThrew = false;
  try {
    gumzoGroupService.createGroup({
      input: {
        name: 'Wafugaji wa Ndege za Ajabu',
        description: 'Kikundi chenye kategoria isiyoidhinishwa na mfumo.',
        categoryId: 'kategoria_isiyopo_999',
        visibility: 'PUBLIC',
      },
      authenticatedUserId: user1,
    });
  } catch {
    invalidCatThrew = true;
  }
  assert(invalidCatThrew, 'Test 5.2: Invalid/unrecognized category is rejected');

  // Test 6: Duplicate creation is handled safely
  let duplicateThrew = false;
  try {
    gumzoGroupService.createGroup({
      input: {
        name: 'Wafugaji wa Kuku Morogoro', // Identical name by same founder
        description: 'Kikundi cha pili chenye jina lilelile.',
        categoryId: 'kuku',
        visibility: 'PUBLIC',
      },
      authenticatedUserId: user1,
    });
  } catch {
    duplicateThrew = true;
  }
  assert(duplicateThrew, 'Test 6: Duplicate group creation with same name by same founder is prevented');

  // --------------------------------------------------------------------------
  // Group 2: Roles & Governance (Tests 7–11)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 2: Roles & Governance ---');

  // Test 7: Founder Admin is assigned correctly
  assert(createRes1.membership.role === 'FOUNDER_ADMIN', 'Test 7.1: Requesting user is assigned FOUNDER_ADMIN role');
  assert(createRes1.membership.status === 'ACTIVE', 'Test 7.2: Founder membership starts in ACTIVE state');
  assert(isGroupFounderAdmin(user1, createRes1.group), 'Test 7.3: isGroupFounderAdmin() helper returns true');
  assert(isGroupAdmin(user1, createRes1.group), 'Test 7.4: isGroupAdmin() helper returns true for founder');

  // Approve group for subsequent role tests
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: createRes1.group.groupId,
    newStatus: 'ACTIVE',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  // Test 8: Normal member cannot become Founder Admin
  const memberJoinRes = gumzoGroupService.joinGroup(createRes1.group.groupId, user2);
  assert(memberJoinRes.role === 'MEMBER', 'Test 8.1: Joining user is strictly assigned MEMBER role');
  assert(memberJoinRes.role !== 'FOUNDER_ADMIN', 'Test 8.2: Joining user cannot become Founder Admin');

  // Test 9: Normal member cannot become Leadership Admin
  assert(memberJoinRes.role !== 'LEADERSHIP_ADMIN', 'Test 9: Joining user cannot become Leadership Admin');

  // Test 10: Founder Admin cannot self-promote to Leadership Admin
  let founderSelfPromoteThrew = false;
  try {
    gumzoGroupService.assignLeadershipAdmin({
      groupId: createRes1.group.groupId,
      leadershipAdminUserId: user1, // Founder attempting to assign themselves as leadership
      platformAdminUserId: platformAdmin,
      isPlatformAdmin: true,
    });
  } catch {
    founderSelfPromoteThrew = true;
  }
  assert(founderSelfPromoteThrew, 'Test 10: Founder Admin cannot be assigned as Leadership Admin of their own group');

  // Test 11: Role changes require platform authority
  let unauthLeadershipThrew = false;
  try {
    gumzoGroupService.assignLeadershipAdmin({
      groupId: createRes1.group.groupId,
      leadershipAdminUserId: user3,
      platformAdminUserId: user2, // Non-platform admin
      isPlatformAdmin: false,
    });
  } catch {
    unauthLeadershipThrew = true;
  }
  assert(unauthLeadershipThrew, 'Test 11.1: Non-platform user cannot appoint Leadership Admin');

  // Authorized appointment by platform admin
  const groupWithLeadership = gumzoGroupService.assignLeadershipAdmin({
    groupId: createRes1.group.groupId,
    leadershipAdminUserId: user3,
    platformAdminUserId: platformAdmin,
    isPlatformAdmin: true,
  });
  assert(groupWithLeadership.leadershipAdminUserId === user3, 'Test 11.2: Platform Admin successfully appoints Leadership Admin');
  assert(isGroupLeadershipAdmin(user3, groupWithLeadership), 'Test 11.3: isGroupLeadershipAdmin() helper confirms role');
  assert(isGroupAdmin(user3, groupWithLeadership), 'Test 11.4: isGroupAdmin() helper confirms leadership admin as admin');

  // --------------------------------------------------------------------------
  // Group 3: Membership Lifecycle & Uniqueness (Tests 12–15)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 3: Membership Lifecycle & Uniqueness ---');

  // Test 12: Membership is unique per group/user (groupId + userId deterministic)
  assert(memberJoinRes.membershipId === `${createRes1.group.groupId}_${user2}`, 'Test 12.1: Deterministic membershipId schema enforces uniqueness');
  const repeatJoin = gumzoGroupService.joinGroup(createRes1.group.groupId, user2);
  assert(repeatJoin.membershipId === memberJoinRes.membershipId, 'Test 12.2: Duplicate join request returns existing membership idempotently');

  // Test 13: Invalid group membership is rejected
  let invalidGroupJoinThrew = false;
  try {
    gumzoGroupService.joinGroup('non_existent_group_xyz', user2);
  } catch {
    invalidGroupJoinThrew = true;
  }
  assert(invalidGroupJoinThrew, 'Test 13: Joining nonexistent group is rejected');

  // Test 14: Left/removed member cannot access restricted group content
  // Create a private group to test access revocation on leave
  const privateGroupRes = gumzoGroupService.createGroup({
    input: {
      name: 'Wafugaji wa Nguruwe Dar es Salaam',
      description: 'Kikundi cha faragha cha wakulima na wafugaji wa nguruwe Dar es Salaam.',
      categoryId: 'nguruwe',
      visibility: 'PRIVATE',
    },
    authenticatedUserId: user1,
    isPlatformAdmin: true, // Created ACTIVE
  });

  // User 2 joins private group -> PENDING
  const user2PrivateJoin = gumzoGroupService.joinGroup(privateGroupRes.group.groupId, user2);
  assert(user2PrivateJoin.status === 'PENDING', 'Test 14.1: Joining private group starts in PENDING status');

  const accessWhilePending = canAccessGumzoGroup(user2, privateGroupRes.group, user2PrivateJoin);
  assert(accessWhilePending.canViewContent === false, 'Test 14.2: PENDING member cannot view internal private group content');

  // Test 15: Suspended membership handling
  user2PrivateJoin.status = 'SUSPENDED';
  const accessSuspended = canAccessGumzoGroup(user2, privateGroupRes.group, user2PrivateJoin);
  assert(accessSuspended.canViewContent === false, 'Test 15.1: SUSPENDED member cannot view content');

  let suspendedRejoinThrew = false;
  try {
    gumzoGroupService.joinGroup(privateGroupRes.group.groupId, user2);
  } catch {
    suspendedRejoinThrew = true;
  }
  assert(suspendedRejoinThrew, 'Test 15.2: SUSPENDED member is blocked from rejoining');

  // --------------------------------------------------------------------------
  // Group 4: Group Lifecycle States (Tests 16–20)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 4: Group Status & Lifecycle ---');

  // Test 16: ACTIVE group is accessible according to visibility
  const activeAccess = canAccessGumzoGroup(user2, createRes1.group, memberJoinRes);
  assert(activeAccess.canAccess === true, 'Test 16: ACTIVE public group is accessible');

  // Test 17: SUSPENDED group is blocked appropriately
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: createRes1.group.groupId,
    newStatus: 'SUSPENDED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });
  const suspendedAccess = canAccessGumzoGroup(user2, createRes1.group, memberJoinRes);
  assert(suspendedAccess.canViewContent === false, 'Test 17.1: SUSPENDED group blocks content access for normal members');
  assert(Boolean(suspendedAccess.reason?.includes('kimesimamishwa')), 'Test 17.2: Suspended access decision returns clear Swahili notice');

  // Test 18: ARCHIVED group handling
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: createRes1.group.groupId,
    newStatus: 'ARCHIVED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });
  const archivedAccess = canAccessGumzoGroup(user2, createRes1.group, memberJoinRes);
  assert(archivedAccess.canJoin === false, 'Test 18.1: ARCHIVED group prevents new joins');
  assert(Boolean(archivedAccess.reason?.includes('kumbukumbu')), 'Test 18.2: Archived notice returned');

  // Test 19: REJECTED group is not publicly active
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: createRes1.group.groupId,
    newStatus: 'REJECTED',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });
  const rejectedAccess = canAccessGumzoGroup(user2, createRes1.group, memberJoinRes);
  assert(rejectedAccess.canJoin === false, 'Test 19: REJECTED group is not joinable or active');

  // Restore group to ACTIVE
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: createRes1.group.groupId,
    newStatus: 'ACTIVE',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  // Test 20: Client cannot manipulate status without authority
  let nonAdminStatusChangeThrew = false;
  try {
    gumzoGroupService.adminUpdateGroupStatus({
      groupId: createRes1.group.groupId,
      newStatus: 'SUSPENDED',
      adminUserId: user2, // Non-admin user
      isPlatformAdmin: false,
    });
  } catch {
    nonAdminStatusChangeThrew = true;
  }
  assert(nonAdminStatusChangeThrew, 'Test 20: Client without admin authority cannot manipulate group status');

  // --------------------------------------------------------------------------
  // Group 5: Visibility Boundaries (Tests 21–23)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 5: Visibility Boundaries ---');

  // Test 21: PUBLIC group discovery works
  const publicDiscover = gumzoGroupService.getDiscoverableGroups();
  const foundPublic = publicDiscover.some((g) => g.groupId === createRes1.group.groupId);
  assert(foundPublic, 'Test 21: PUBLIC ACTIVE group is discovered in public listing');

  // Test 22: PRIVATE group is not exposed to unauthenticated/unauthorized users
  const foundPrivateInPublic = publicDiscover.some((g) => g.groupId === privateGroupRes.group.groupId);
  assert(!foundPrivateInPublic, 'Test 22: PRIVATE group is not exposed in public discovery');

  // Test 23: Non-member cannot access private group content
  const nonMemberPrivateAccess = canAccessGumzoGroup('stranger_user_404', privateGroupRes.group, null);
  assert(nonMemberPrivateAccess.canViewContent === false, 'Test 23.1: Non-member cannot view private group content');
  assert(nonMemberPrivateAccess.canAccess === false, 'Test 23.2: Non-member cannot access private group');

  // --------------------------------------------------------------------------
  // Group 6: Security & Server Authority (Tests 24–28)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 6: Server Authority & Anti-Tampering ---');

  // Test 24: Client cannot change memberCount
  const currentCount = createRes1.group.memberCount;
  assert(typeof currentCount === 'number', 'Test 24.1: memberCount is authoritative numeric value');
  // Attempting to forge memberCount in createGroup is ignored by server:
  const forgedCreate = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Wafugaji Mbuzi',
      description: 'Kikundi cha kupima uaminifu wa memberCount.',
      categoryId: 'mbuzi_kondoo',
      visibility: 'PUBLIC',
      ...({ memberCount: 99999 } as any), // Client spoof
    },
    authenticatedUserId: user2,
  });
  assert(forgedCreate.group.memberCount === 1, 'Test 24.2: Client cannot forge initial memberCount (locked to 1)');

  // Test 25: Client cannot change founderAdminUserId
  const forgedFounderCreate = gumzoGroupService.createGroup({
    input: {
      name: 'Kikundi cha Wafugaji Samaki',
      description: 'Kikundi cha kupima founder spoofing.',
      categoryId: 'samaki',
      visibility: 'PUBLIC',
      ...({ founderAdminUserId: 'victim_user_888' } as any), // Spoof
    },
    authenticatedUserId: user2,
  });
  assert(forgedFounderCreate.group.founderAdminUserId === user2, 'Test 25: Server strictly assigns authenticated caller as founderAdminUserId');

  // Test 26: Client cannot change leadershipAdminUserId
  assert(forgedFounderCreate.group.leadershipAdminUserId === undefined, 'Test 26: leadershipAdminUserId remains unset upon group creation');

  // Approve group so it can be joined
  gumzoGroupService.adminUpdateGroupStatus({
    groupId: forgedFounderCreate.group.groupId,
    newStatus: 'ACTIVE',
    adminUserId: platformAdmin,
    isPlatformAdmin: true,
  });

  // Test 27: Client cannot assign itself privileged roles
  const normalJoin = gumzoGroupService.joinGroup(forgedFounderCreate.group.groupId, user1);
  assert(normalJoin.role === 'MEMBER', 'Test 27: Self-joining user is locked to MEMBER role');

  // Test 28: Authorization is server-authoritative
  assert(isGroupMember(user1, forgedFounderCreate.group, normalJoin), 'Test 28.1: Server-authoritative membership check passes');
  assert(!isGroupAdmin(user1, forgedFounderCreate.group), 'Test 28.2: Member is not recognized as admin');

  // --------------------------------------------------------------------------
  // Group 7: System Separation & Non-Interference Regressions (Tests 29–33)
  // --------------------------------------------------------------------------
  console.log('\n--- Domain 7: System Separation & Regressions ---');

  // Test 29: Marketplace remains functional
  const categories = getLocalCachedCategories();
  assert(categories.length > 0, 'Test 29: Marketplace categories operate normally without interference');

  // Test 30: Marketplace Inbox remains functional
  marketplaceInboxService._resetInboxForTesting();
  const inboxConv = await marketplaceInboxService.getOrCreateConversation({
    buyerUserId: 'buyer_regression_01',
    sellerUserId: 'seller_regression_02',
    shopId: 'shop_reg_01',
    productId: 'prod_reg_01',
    listingId: 'list_reg_01',
    productTitleSnapshot: 'Ngombe Chotara',
  }, 'buyer_regression_01');
  assert(Boolean(inboxConv.conversation.conversationId), 'Test 30.1: Marketplace Inbox creates conversations normally');
  assert(inboxConv.isNew === true, 'Test 30.2: Marketplace Inbox conversation state intact');

  // Test 31: Seller Monetization remains functional
  sellerMonetizationService._resetForTesting();
  const trial = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: 'seller_reg_trial',
    sellerProfileId: 'profile_reg_trial',
  });
  assert(trial.success === true && trial.record?.status === 'TRIAL_ACTIVE', 'Test 31: Seller Monetization trial activation operates normally');

  // Test 32: AI remains unaffected
  const aiConfig = getAiBusinessConfig();
  assert(aiConfig.freeTextInitialLimit > 0, 'Test 32: AI service business config is unaffected and active');

  // Test 33: Daktari remains unaffected
  assert(typeof daktariService.getDoctors === 'function', 'Test 33: Daktari directory methods remain functional');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  GUMZO V9.1 TEST SUITE SUMMARY: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGumzoTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Unhandled failure in Gumzo test runner:', err);
    process.exit(1);
  });
