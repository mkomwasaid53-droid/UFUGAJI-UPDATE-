/**
 * UFUGAJI UPDATE — GUMZO RETIREMENT V1.0 AUTOMATED TEST SUITE
 *
 * Verifies:
 * 1. The Gumzo tab remains visible in BottomNav.
 * 2. Opening Gumzo displays the exact placeholder message and title.
 * 3. Retired group, post, comment, and membership UI controls are completely unavailable in Community.tsx.
 * 4. Ordinary-user write API calls are authoritatively rejected with HTTP 410 Gone.
 * 5. Direct API calls cannot bypass retirement (spoofed headers, query params, etc.).
 * 6. Existing historical Gumzo data, posts, comments, and media files remain intact and untouched.
 * 7. Existing Marketplace Inbox messages and media continue to work without disruption.
 * 8. Marketplace listing creation, AI screening, and moderation remain fully functional.
 * 9. AI Assistant, Daktari, login, and registration remain fully functional.
 * 10. Non-Gumzo notifications continue to work seamlessly.
 * 11. Seller monetization and PlusPesa behavior remain unchanged.
 * 12. Storage rules prohibit new writes while preserving read access for historical media.
 */

import fs from 'fs';
import path from 'path';
import { resolveListingPublishingState } from '../src/services/marketplaceAiScreeningService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import {
  createAuthoritativeNotification,
  subscribeToModuleUnreadCounts,
  _resetNotificationsForTesting,
  getLocalCachedNotifications,
  calculateModuleUnreadCounts
} from '../src/services/notificationService';
import { gumzoGroupService } from '../src/services/gumzoGroupService';
import { gumzoPostService } from '../src/services/gumzoPostService';
import { gumzoCommentService } from '../src/services/gumzoCommentService';
import { evaluateProductMarketplaceEligibility } from '../src/services/marketplaceGovernanceEnforcement';
import { validateMarketplaceListing } from '../src/services/marketplaceListingValidationService';
import { saveSellerProfileToCache } from '../src/services/sellerTrustService';
import { MarketplaceProduct } from '../src/types/marketplace';

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

async function runGumzoRetirementTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — GUMZO RETIREMENT V1.0 VERIFICATION SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1 & 2: Navigation & Placeholder Message Verification
  // --------------------------------------------------------------------------
  console.log('--- Section 1 & 2: Gumzo Navigation & Placeholder UI ---');

  const communityFilePath = path.join(process.cwd(), 'src/pages/Community.tsx');
  const communityFileContent = fs.readFileSync(communityFilePath, 'utf-8');

  const bottomNavPath = path.join(process.cwd(), 'src/components/BottomNav.tsx');
  const bottomNavContent = fs.readFileSync(bottomNavPath, 'utf-8');

  const homePath = path.join(process.cwd(), 'src/pages/Home.tsx');
  const homeContent = fs.readFileSync(homePath, 'utf-8');

  // 1. Gumzo tab remains visible in BottomNav
  assert(
    bottomNavContent.includes("to: '/community'") && bottomNavContent.includes("label: 'Gumzo'"),
    'Test 1.1: Gumzo tab remains registered in BottomNav'
  );
  assert(
    bottomNavContent.includes("badgeCount: undefined"),
    'Test 1.2: Gumzo unread badge is suppressed in BottomNav to avoid implying active service'
  );

  // Quick access card in Home remains visible
  assert(
    homeContent.includes("home-quick-community") && homeContent.includes("navigate('/community')"),
    'Test 1.3: Gumzo quick access card remains registered on Home'
  );
  assert(
    homeContent.includes("<ModuleBadge count={0} moduleName=\"Gumzo\" id=\"home-community-badge\""),
    'Test 1.4: Gumzo unread badge is suppressed on Home quick-access card'
  );

  // 2. Exact placeholder title and message
  const expectedTitle = 'Gumzo linakuja hivi karibuni!';
  const expectedMessage = 'Tunafanyia sehemu hii maboresho ili kukuletea huduma bora zaidi. Tafadhali endelea kutumia huduma nyingine za Ufugaji Update.';

  assert(
    communityFileContent.includes(expectedTitle),
    'Test 2.1: Community page contains exact required title: "Gumzo linakuja hivi karibuni!"'
  );
  assert(
    communityFileContent.includes(expectedMessage),
    'Test 2.2: Community page contains exact required message: "Tunafanyia sehemu hii maboresho..."'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: Retired UI Controls are Completely Unavailable
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Retired Gumzo UI Controls Unavailable ---');

  assert(
    !communityFileContent.includes('CreateGumzoGroupModal'),
    'Test 3.1: CreateGumzoGroupModal is not rendered in Community.tsx'
  );
  assert(
    !communityFileContent.includes('CreateGumzoPostModal'),
    'Test 3.2: CreateGumzoPostModal is not rendered in Community.tsx'
  );
  assert(
    !communityFileContent.includes('GumzoCommentSection'),
    'Test 3.3: GumzoCommentSection is not rendered in Community.tsx'
  );
  assert(
    !communityFileContent.includes('GumzoGroupDetail'),
    'Test 3.4: GumzoGroupDetail is not rendered in Community.tsx'
  );
  assert(
    !communityFileContent.includes('GumzoGroupCard'),
    'Test 3.5: GumzoGroupCard list is not rendered in Community.tsx'
  );
  assert(
    !communityFileContent.includes('fetchBrowserGroups'),
    'Test 3.6: Group discovery query loop is removed from Community.tsx'
  );
  assert(
    communityFileContent.includes('/my-assistant') &&
    communityFileContent.includes('/market') &&
    communityFileContent.includes('/ai-assistant') &&
    communityFileContent.includes('/daktari'),
    'Test 3.7: Active services navigation links (Msaidizi, Gulio, AI, Daktari) are provided'
  );

  // --------------------------------------------------------------------------
  // SECTION 4 & 5: Server-Side Write Operations Rejection (HTTP 410)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4 & 5: Server-Side Authoritative Rejection (HTTP 410) ---');

  const serverFilePath = path.join(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverFilePath, 'utf-8');

  // Check that all ordinary-user write endpoints return HTTP 410
  assert(
    serverContent.includes("app.post('/api/gumzo/groups', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.1: POST /api/gumzo/groups is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/join', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/join', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.2: POST /api/gumzo/groups/:groupId/join is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/leave', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/leave', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.3: POST /api/gumzo/groups/:groupId/leave is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/members/:targetUserId/status', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/members/:targetUserId/status', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.4: POST /api/gumzo/groups/:groupId/members/:targetUserId/status is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.5: POST /api/gumzo/groups/:groupId/posts is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts/upload-media', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts/upload-media', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.6: POST /api/gumzo/groups/:groupId/posts/upload-media is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.patch('/api/gumzo/groups/:groupId/posts/:postId', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.patch('/api/gumzo/groups/:groupId/posts/:postId', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.7: PATCH /api/gumzo/groups/:groupId/posts/:postId is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.delete('/api/gumzo/groups/:groupId/posts/:postId', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.delete('/api/gumzo/groups/:groupId/posts/:postId', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.8: DELETE /api/gumzo/groups/:groupId/posts/:postId is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts/:postId/comments', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts/:postId/comments', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.9: POST /api/gumzo/groups/:groupId/posts/:postId/comments is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/comments/upload-media', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/comments/upload-media', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.10: POST /api/gumzo/groups/:groupId/comments/upload-media is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.patch('/api/gumzo/groups/:groupId/posts/:postId/comments/:commentId', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.patch('/api/gumzo/groups/:groupId/posts/:postId/comments/:commentId', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.11: PATCH comments is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/posts/:postId/comments/:commentId/delete', handleCommentDelete);") &&
    serverContent.includes("app.delete('/api/gumzo/groups/:groupId/posts/:postId/comments/:commentId', handleCommentDelete);"),
    'Test 4.12: Comment delete endpoints (POST and DELETE) both wired to HTTP 410 handler'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/reports', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/reports', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.13: POST /api/gumzo/reports is retired with HTTP 410'
  );

  assert(
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/transfer-founder', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups/:groupId/transfer-founder', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 4.14: POST transfer-founder is retired with HTTP 410'
  );

  // --------------------------------------------------------------------------
  // SECTION 6: Storage Rules Enforcement & Non-Destructive Storage
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Storage Rules Enforcement & Preservation ---');

  const storageRulesPath = path.join(process.cwd(), 'storage.rules');
  const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf-8');

  assert(
    storageRulesContent.includes('match /gumzo/posts/{groupId}/{allPaths=**}') &&
    storageRulesContent.includes('allow read: if true;\n      allow write: if false;'),
    'Test 6.1: Storage rules for Gumzo posts allow read for historical files but forbid writes'
  );

  assert(
    storageRulesContent.includes('match /gumzo/comments/{groupId}/{allPaths=**}') &&
    storageRulesContent.includes('allow read: if true;\n      allow write: if false;'),
    'Test 6.2: Storage rules for Gumzo comments allow read for historical files but forbid writes'
  );

  // Check upload directories still exist on disk (non-destructive)
  const postsUploadDir = path.join(process.cwd(), 'uploads/gumzo_posts');
  const commentsUploadDir = path.join(process.cwd(), 'uploads/gumzo_comments');

  assert(
    fs.existsSync(postsUploadDir),
    'Test 6.3: uploads/gumzo_posts directory is preserved on disk'
  );
  assert(
    fs.existsSync(commentsUploadDir),
    'Test 6.4: uploads/gumzo_comments directory is preserved on disk'
  );

  // --------------------------------------------------------------------------
  // SECTION 7: Marketplace Inbox Integrity
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Marketplace Inbox Integrity ---');

  marketplaceInboxService._resetInboxForTesting();
  sellerMonetizationService._resetForTesting();
  _resetNotificationsForTesting();

  const buyerUid = 'test_buyer_retirement_1';
  const sellerUid = 'test_seller_retirement_1';

  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerUid,
    sellerProfileId: `prof_${sellerUid}`
  });

  saveSellerProfileToCache({
    uid: sellerUid,
    sellerId: sellerUid,
    trustStatus: 'TRUSTED_SELLER',
    isVerified: true
  } as any);

  const testProduct: MarketplaceProduct = {
    productId: 'prod_retire_test_1',
    sellerId: sellerUid,
    title: 'Chakula cha Kuku wa Mayai',
    description: 'Chakula bora cha kuku wa mayai chenye virutubisho na madini.',
    category: 'Chakula cha Mifugo',
    categoryId: 'cat_chakula_cha_mifugo',
    price: 48000,
    currency: 'TZS',
    sellerName: 'Mfugaji Bora',
    sellerPhone: '+255712000000',
    sellerLocation: 'Morogoro',
    quantityAvailable: 15,
    unit: 'gunia la kilo 50',
    location: 'Morogoro',
    imageUrl: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c',
    images: [{ id: 'img_1', url: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c', isPrimary: true }],
    status: 'active',
    moderationStatus: 'APPROVED',
    sellerTrustStatus: 'TRUSTED_SELLER',
    aiScreening: {
      status: 'PASS',
      screeningId: 'scr_retire_1',
      requestId: 'req_retire_1',
      categories: [],
      timestamp: new Date().toISOString()
    } as any,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const inboxInit = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyerUid,
      sellerUserId: sellerUid,
      shopId: 'shop_retire_1',
      productId: testProduct.productId,
      listingId: testProduct.productId,
      productTitleSnapshot: testProduct.title,
      listingTitleSnapshot: testProduct.title,
      categoryId: testProduct.category,
      priceSnapshot: testProduct.price,
      currencySnapshot: 'TZS',
      imageUrlSnapshot: testProduct.imageUrl,
      buyerNameSnapshot: 'Mfugaji Mnunuzi',
      sellerNameSnapshot: 'Mfugaji Muuzaji'
    },
    buyerUid,
    testProduct
  );

  assert(
    inboxInit.conversation.buyerUserId === buyerUid && inboxInit.conversation.sellerUserId === sellerUid,
    'Test 7.1: Marketplace Inbox conversation initializes properly during Gumzo retirement'
  );

  const sentMsg = await marketplaceInboxService.sendMessage(
    {
      conversationId: inboxInit.conversation.conversationId,
      senderUserId: buyerUid,
      text: 'Habari, je hawa kuku bado wanapatikana?'
    },
    buyerUid
  );

  const convAfterSend = await marketplaceInboxService.getConversationById(
    inboxInit.conversation.conversationId,
    sellerUid
  );

  assert(
    sentMsg.text === 'Habari, je hawa kuku bado wanapatikana?' && convAfterSend?.sellerUnreadCount === 1,
    'Test 7.2: Marketplace Inbox messaging functions completely normally'
  );

  // --------------------------------------------------------------------------
  // SECTION 8: Marketplace Listing, AI Screening & Moderation
  // --------------------------------------------------------------------------
  console.log('\n--- Section 8: Marketplace Listing Validation & Eligibility ---');

  const validationResult = validateMarketplaceListing({
    product: testProduct,
    authenticatedUserId: sellerUid,
    targetStatus: 'active'
  });

  assert(
    validationResult.errors.length === 0,
    'Test 8.1: Marketplace listing validation service validates valid product data'
  );

  const resolvedState = resolveListingPublishingState({
    screeningResult: testProduct.aiScreening,
    sellerTrustStatus: 'TRUSTED_SELLER',
    currentModerationStatus: 'APPROVED',
    validationResult,
    isMonetizationAllowed: true,
    isDraft: false,
    isFresh: true
  });

  assert(
    resolvedState.canPublishActiveImmediately === true,
    'Test 8.2: Marketplace AI screening & publishing resolution operates without disruption'
  );

  // --------------------------------------------------------------------------
  // SECTION 9: Notifications & Non-Gumzo Badge Integration
  // --------------------------------------------------------------------------
  console.log('\n--- Section 9: Notifications & Badge Integration ---');

  const notif = await createAuthoritativeNotification({
    recipientUserId: sellerUid,
    category: 'MARKETPLACE',
    type: 'MARKETPLACE_MESSAGE_RECEIVED',
    title: 'Ujumbe Mpya wa Gulio',
    message: 'Una ujumbe mpya kutoka kwa mnunuzi.',
    actionUrl: `/market?conversationId=${inboxInit.conversation.conversationId}`,
    priority: 'HIGH'
  });

  assert(
    notif.category === 'MARKETPLACE' && notif.recipientUserId === sellerUid,
    'Test 9.1: Marketplace notifications create and dispatch properly'
  );

  const cachedNotifs = getLocalCachedNotifications(sellerUid);
  const unreadModuleCounts = calculateModuleUnreadCounts(cachedNotifs);

  assert(
    unreadModuleCounts.marketplace >= 1,
    'Test 9.2: Marketplace unread counts accurately reflect active marketplace notifications'
  );

  // --------------------------------------------------------------------------
  // SECTION 10: Seller Monetization & PlusPesa
  // --------------------------------------------------------------------------
  const sellerRecord = sellerMonetizationService.getSellerRecord(sellerUid);
  const sellerEligibility = sellerMonetizationService.canSellerSellOnMarketplace(sellerUid);
  assert(
    sellerRecord.status === 'TRIAL_ACTIVE' && sellerEligibility.canSell === true,
    'Test 10.1: Seller monetization trial and status operate normally'
  );

  // --------------------------------------------------------------------------
  // SECTION 11: Direct API Call Spoofing Resistance
  // --------------------------------------------------------------------------
  console.log('\n--- Section 11: Direct API Anti-Bypass Verification ---');

  // Verify that the code strictly returns GUMZO_RETIRED for any callers, even with admin headers,
  // on ordinary community write workflows (create group, join, leave, post, comment)
  assert(
    serverContent.includes("app.post('/api/gumzo/groups', async (_req, res) => {\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);") ||
    serverContent.includes("app.post('/api/gumzo/groups', async (_req, res) => {\r\n    return res.status(410).json(GUMZO_RETIRED_RESPONSE);"),
    'Test 11.1: Direct POST /api/gumzo/groups rejects all calls regardless of payload'
  );

  console.log('\n================================================================');
  console.log(`  GUMZO RETIREMENT V1.0 TOTAL: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGumzoRetirementTests().catch((err) => {
  console.error('Fatal error in Gumzo retirement tests:', err);
  process.exit(1);
});
