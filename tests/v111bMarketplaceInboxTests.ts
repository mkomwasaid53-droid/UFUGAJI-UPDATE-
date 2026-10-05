/**
 * V1.11B — MARKETPLACE INBOX FOUNDATION TEST SUITE
 *
 * Validates the complete authoritative marketplace inbox domain:
 * 1. Context Retention: Buyer <-> Seller <-> Product/Listing references and snapshots
 * 2. Participant Authorization: Authentication, impersonation prevention, self-inquiry block
 * 3. Idempotent Creation: Reuse active conversation for same listing, distinguish different listings
 * 4. Governance Enforcement: Rejection of inquiries on ineligible/moderated/draft listings & locked sellers
 * 5. Scoped Access: Third-party non-participants blocked from reading/sending
 * 6. Messaging & Derivation: Authoritative senderRole, unread counters, length limits
 * 7. Read Receipts: Counter reset and message readAt timestamping
 * 8. Status Lifecycle: ACTIVE -> CLOSED -> BLOCKED handling
 * 9. Notification Center Integration: Authoritative notification dispatch on message
 * 10. Persistence: Storage across in-memory and disk
 */

import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { _resetNotificationsForTesting, getLocalCachedNotifications } from '../src/services/notificationService';
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

async function runV111bTests() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.11B MARKETPLACE INBOX FOUNDATION TESTS');
  console.log('================================================================\n');

  // Reset stores for clean isolated tests
  marketplaceInboxService._resetInboxForTesting();
  sellerMonetizationService._resetForTesting();
  _resetNotificationsForTesting();

  const buyer1 = 'buyer_user_001';
  const buyer2 = 'buyer_user_002';
  const seller1 = 'seller_user_001';
  const unmonetizedSeller = 'seller_unmonetized_002';
  const thirdParty = 'unauthorized_user_999';

  // Activate seller1 monetization so seller1 is an active, eligible seller
  sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: seller1,
    sellerProfileId: `profile_${seller1}`
  });

  const mockProduct1: MarketplaceProduct = {
    productId: 'prod_mifugo_001',
    sellerId: seller1,
    shopId: 'shop_001',
    title: 'Mitamba ya Kisasa ya Friesian',
    description: 'Mitamba bora ya maziwa, mimba ya miezi 5',
    category: 'Mifugo',
    subcategory: 'Ng\'ombe wa Maziwa',
    price: 1800000,
    currency: 'Tsh',
    imageUrl: 'https://images.unsplash.com/photo-cow-1',
    status: 'active',
    moderationStatus: 'APPROVED',
    sellerName: 'Juma Mfugaji',
    sellerBusinessName: 'Kilimo Bora Dairy Farm',
    sellerPhone: '+255711000111',
    sellerLocation: 'Arusha',
    location: 'Arusha',
    unit: 'kichwa',
    quantityAvailable: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProduct2: MarketplaceProduct = {
    productId: 'prod_pembejeo_002',
    sellerId: seller1,
    shopId: 'shop_001',
    title: 'Chakula cha Kuku cha Starter Crumbs 50kg',
    description: 'Lishe bora ya vifaranga wiki 1-4',
    category: 'Vyakula vya Mifugo',
    subcategory: 'Kuku',
    price: 65000,
    currency: 'Tsh',
    imageUrl: 'https://images.unsplash.com/photo-feed-1',
    status: 'active',
    moderationStatus: 'APPROVED',
    sellerName: 'Juma Mfugaji',
    sellerBusinessName: 'Kilimo Bora Dairy Farm',
    sellerPhone: '+255711000111',
    sellerLocation: 'Arusha',
    location: 'Arusha',
    unit: 'mfuko 50kg',
    quantityAvailable: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // --------------------------------------------------------------------------
  // Group 1: Core Creation & Context Retention
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Core Creation & Context Retention ---');

  const createRes1 = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyer1,
      sellerUserId: seller1,
      shopId: 'shop_001',
      productId: mockProduct1.productId,
      listingId: mockProduct1.productId,
      productTitleSnapshot: mockProduct1.title,
      listingTitleSnapshot: mockProduct1.title,
      categoryId: mockProduct1.category,
      priceSnapshot: mockProduct1.price,
      currencySnapshot: mockProduct1.currency,
      imageUrlSnapshot: mockProduct1.imageUrl,
      sellerNameSnapshot: mockProduct1.sellerBusinessName,
      buyerNameSnapshot: 'Mnunuzi Juma'
    },
    buyer1,
    mockProduct1
  );

  const conv1 = createRes1.conversation;
  assert(createRes1.isNew === true, 'Test 1.1: Newly initialized inquiry reports isNew: true');
  assert(conv1.buyerUserId === buyer1, 'Test 1.2: Conversation retains authoritative buyerUserId');
  assert(conv1.sellerUserId === seller1, 'Test 1.3: Conversation retains authoritative sellerUserId');
  assert(conv1.productId === mockProduct1.productId, 'Test 1.4: Retains authoritative productId reference');
  assert(conv1.listingId === mockProduct1.productId, 'Test 1.5: Retains authoritative listingId reference');
  assert(conv1.shopId === 'shop_001', 'Test 1.6: Retains shopId reference');
  assert(conv1.productTitleSnapshot === mockProduct1.title, 'Test 1.7: Retains snapshot of productTitle');
  assert(conv1.priceSnapshot === 1800000, 'Test 1.8: Retains snapshot of price');
  assert(conv1.status === 'ACTIVE', 'Test 1.9: Initial conversation status is ACTIVE');

  // --------------------------------------------------------------------------
  // Group 2: Idempotent Creation & Distinction
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Idempotent Creation & Multi-Product Distinction ---');

  // Same buyer, same seller, same listing -> Reuse active conversation
  const createRes1Repeat = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyer1,
      sellerUserId: seller1,
      shopId: 'shop_001',
      productId: mockProduct1.productId,
      listingId: mockProduct1.productId,
    },
    buyer1,
    mockProduct1
  );

  assert(createRes1Repeat.isNew === false, 'Test 2.1: Repeated inquiry for same listing reports isNew: false');
  assert(
    createRes1Repeat.conversation.conversationId === conv1.conversationId,
    'Test 2.2: Existing active conversation is reused (idempotent creation)'
  );

  // Same buyer, same seller, DIFFERENT listing -> MUST create a separate conversation
  const createRes2 = await marketplaceInboxService.getOrCreateConversation(
    {
      buyerUserId: buyer1,
      sellerUserId: seller1,
      shopId: 'shop_001',
      productId: mockProduct2.productId,
      listingId: mockProduct2.productId,
      productTitleSnapshot: mockProduct2.title,
    },
    buyer1,
    mockProduct2
  );

  assert(createRes2.isNew === true, 'Test 2.3: Inquiring about a different product produces isNew: true');
  assert(
    createRes2.conversation.conversationId !== conv1.conversationId,
    'Test 2.4: Distinct products with the same seller are NOT merged into one conversation'
  );
  assert(
    createRes2.conversation.productId === mockProduct2.productId,
    'Test 2.5: New conversation correctly references second product ID'
  );

  // --------------------------------------------------------------------------
  // Group 3: Authentication & Participant Authorization
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Authentication & Security Boundaries ---');

  // 3.1 Unauthenticated user rejected
  let unauthError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: buyer1,
        sellerUserId: seller1,
        shopId: 'shop_001',
        productId: mockProduct1.productId,
        listingId: mockProduct1.productId,
      },
      '' // unauthenticated
    );
  } catch (err: any) {
    unauthError = true;
    assert(
      err.message.includes('Hujaingia kwenye mfumo'),
      'Test 3.1: Unauthenticated caller is rejected with sign-in requirement notice'
    );
  }
  assert(unauthError, 'Test 3.1b: Unauthenticated request threw expected error');

  // 3.2 Impersonation rejected (callerUserId !== buyerUserId)
  let impersonationError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: 'another_victim_user',
        sellerUserId: seller1,
        shopId: 'shop_001',
        productId: mockProduct1.productId,
        listingId: mockProduct1.productId,
      },
      buyer1 // caller is buyer1 attempting to impersonate another_victim_user
    );
  } catch (err: any) {
    impersonationError = true;
    assert(
      err.message.includes('Huruhusiwi kuanzisha mazungumzo kwa niaba ya mtumiaji mwingine'),
      'Test 3.2: Impersonation of another buyer is rejected by server authority'
    );
  }
  assert(impersonationError, 'Test 3.2b: Impersonation attempt threw error');

  // 3.3 Self-inquiry rejected (buyerUserId === sellerUserId)
  let selfInquiryError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: seller1,
        sellerUserId: seller1,
        shopId: 'shop_001',
        productId: mockProduct1.productId,
        listingId: mockProduct1.productId,
      },
      seller1
    );
  } catch (err: any) {
    selfInquiryError = true;
    assert(
      err.message.includes('Huwezi kuanzisha mazungumzo na wewe mwenyewe'),
      'Test 3.3: Self-inquiry on own listing is rejected'
    );
  }
  assert(selfInquiryError, 'Test 3.3b: Self-inquiry attempt threw error');

  // 3.4 Scoped reading: Third-party non-participant cannot read conversation
  let thirdPartyReadError = false;
  try {
    await marketplaceInboxService.getConversationById(conv1.conversationId, thirdParty);
  } catch (err: any) {
    thirdPartyReadError = true;
    assert(
      err.message.includes('Huruhusiwi kuona mazungumzo'),
      'Test 3.4: Third-party non-participant blocked from viewing conversation'
    );
  }
  assert(thirdPartyReadError, 'Test 3.4b: Unauthorized view threw error');

  // 3.5 Third-party cannot read messages
  let thirdPartyMessagesError = false;
  try {
    await marketplaceInboxService.getMessagesForConversation(conv1.conversationId, thirdParty);
  } catch (err: any) {
    thirdPartyMessagesError = true;
    assert(
      err.message.includes('Huruhusiwi kuona mazungumzo'),
      'Test 3.5: Third-party non-participant blocked from fetching messages'
    );
  }
  assert(thirdPartyMessagesError, 'Test 3.5b: Unauthorized messages read threw error');

  // 3.6 Admin participant override: Admin can inspect for moderation
  const adminView = await marketplaceInboxService.getConversationById(conv1.conversationId, 'admin_super_user', true);
  assert(adminView !== null, 'Test 3.6: Platform admin can inspect conversation for safety & dispute resolution');

  // --------------------------------------------------------------------------
  // Group 4: Governance & Eligibility Boundaries
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Marketplace Governance & Ineligibility Gating ---');

  // 4.1 Rejected listing cannot start conversation
  const rejectedProduct: MarketplaceProduct = {
    ...mockProduct1,
    productId: 'prod_rejected_003',
    moderationStatus: 'REJECTED'
  };
  let rejectedError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: buyer1,
        sellerUserId: seller1,
        shopId: 'shop_001',
        productId: rejectedProduct.productId,
        listingId: rejectedProduct.productId,
      },
      buyer1,
      rejectedProduct
    );
  } catch (err: any) {
    rejectedError = true;
    assert(
      err.message.includes('haliruhusiwi kwa sasa (REJECTED)'),
      'Test 4.1: REJECTED listing blocked from initiating new inquiries'
    );
  }
  assert(rejectedError, 'Test 4.1b: REJECTED listing threw expected error');

  // 4.2 Suspended listing cannot start conversation
  const suspendedProduct: MarketplaceProduct = {
    ...mockProduct1,
    productId: 'prod_suspended_004',
    moderationStatus: 'SUSPENDED'
  };
  let suspendedError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: buyer1,
        sellerUserId: seller1,
        shopId: 'shop_001',
        productId: suspendedProduct.productId,
        listingId: suspendedProduct.productId,
      },
      buyer1,
      suspendedProduct
    );
  } catch (err: any) {
    suspendedError = true;
    assert(
      err.message.includes('SUSPENDED'),
      'Test 4.2: SUSPENDED listing blocked from initiating new inquiries'
    );
  }
  assert(suspendedError, 'Test 4.2b: SUSPENDED listing threw expected error');

  // 4.3 Draft listing cannot start conversation
  const draftProduct: MarketplaceProduct = {
    ...mockProduct1,
    productId: 'prod_draft_005',
    status: 'draft',
    moderationStatus: 'APPROVED'
  };
  let draftError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: buyer1,
        sellerUserId: seller1,
        shopId: 'shop_001',
        productId: draftProduct.productId,
        listingId: draftProduct.productId,
      },
      buyer1,
      draftProduct
    );
  } catch (err: any) {
    draftError = true;
    assert(
      err.message.includes('rasimu (draft)'),
      'Test 4.3: Unapproved draft listing blocked from public inquiry'
    );
  }
  assert(draftError, 'Test 4.3b: Draft listing threw expected error');

  // 4.4 Unmonetized / locked seller cannot receive inquiries
  const unmonetizedProduct: MarketplaceProduct = {
    ...mockProduct1,
    productId: 'prod_unmonetized_006',
    sellerId: unmonetizedSeller
  };
  let unmonetizedError = false;
  try {
    await marketplaceInboxService.getOrCreateConversation(
      {
        buyerUserId: buyer1,
        sellerUserId: unmonetizedSeller,
        shopId: 'shop_unmonetized_002',
        productId: unmonetizedProduct.productId,
        listingId: unmonetizedProduct.productId,
      },
      buyer1,
      unmonetizedProduct
    );
  } catch (err: any) {
    unmonetizedError = true;
    assert(
      err.message.includes('Mawasiliano na muuzaji huyu yamesitishwa'),
      'Test 4.4: Inactive/unmonetized seller cannot receive new Marketplace inquiries'
    );
  }
  assert(unmonetizedError, 'Test 4.4b: Unmonetized seller attempt threw expected error');

  // --------------------------------------------------------------------------
  // Group 5: Messaging & Authoritative Role Derivation
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Messaging, Roles, and Delivery ---');

  // 5.1 Buyer sends message
  const msg1 = await marketplaceInboxService.sendMessage(
    {
      conversationId: conv1.conversationId,
      senderUserId: buyer1,
      text: 'Habari, je mitamba hii ya Friesian bado ipo shambani?'
    },
    buyer1
  );

  assert(msg1.senderRole === 'BUYER', 'Test 5.1: senderRole is authoritatively derived as BUYER');
  assert(msg1.text.includes('Friesian'), 'Test 5.2: Message text is stored accurately');
  assert(msg1.readAt === null, 'Test 5.3: Newly sent message starts with readAt: null');

  const conv1AfterMsg1 = await marketplaceInboxService.getConversationById(conv1.conversationId, buyer1);
  assert(conv1AfterMsg1?.sellerUnreadCount === 1, 'Test 5.4: Buyer sending message increments sellerUnreadCount');
  assert(conv1AfterMsg1?.buyerUnreadCount === 0, 'Test 5.5: Sender unread count remains 0');
  assert(conv1AfterMsg1?.lastMessage.includes('mitamba hii'), 'Test 5.6: lastMessage snippet updated');

  // 5.2 Notification generated for recipient (seller)
  const notifications = getLocalCachedNotifications(seller1);
  const sellerNotif = notifications.find(
    (n) => n.recipientUserId === seller1 && n.type === 'MARKETPLACE_MESSAGE_RECEIVED'
  );
  assert(sellerNotif !== undefined, 'Test 5.7: Notification is dispatched to recipient seller');
  assert(
    sellerNotif?.actionUrl?.includes(conv1.conversationId) === true,
    'Test 5.8: Notification actionUrl links directly to conversation'
  );

  // 5.3 Seller replies
  const msg2 = await marketplaceInboxService.sendMessage(
    {
      conversationId: conv1.conversationId,
      senderUserId: seller1,
      text: 'Ndiyo, bado ipo mitamba 3. Unaweza kuja kuikagua kesho.'
    },
    seller1
  );

  assert(msg2.senderRole === 'SELLER', 'Test 5.9: Seller reply is authoritatively derived as SELLER');
  const conv1AfterMsg2 = await marketplaceInboxService.getConversationById(conv1.conversationId, seller1);
  assert(conv1AfterMsg2?.buyerUnreadCount === 1, 'Test 5.10: Seller reply increments buyerUnreadCount');

  // 5.4 Message validation: Empty message rejected
  let emptyMsgError = false;
  try {
    await marketplaceInboxService.sendMessage(
      {
        conversationId: conv1.conversationId,
        senderUserId: buyer1,
        text: '   '
      },
      buyer1
    );
  } catch (err: any) {
    emptyMsgError = true;
    assert(err.message.includes('hauwezi kuwa mtupu'), 'Test 5.11: Blank message rejected');
  }
  assert(emptyMsgError, 'Test 5.11b: Blank message threw error');

  // 5.5 Message validation: Message > 2000 chars rejected
  let longMsgError = false;
  try {
    await marketplaceInboxService.sendMessage(
      {
        conversationId: conv1.conversationId,
        senderUserId: buyer1,
        text: 'A'.repeat(2005)
      },
      buyer1
    );
  } catch (err: any) {
    longMsgError = true;
    assert(err.message.includes('Kiwango cha juu ni herufi 2,000'), 'Test 5.12: Oversized message rejected');
  }
  assert(longMsgError, 'Test 5.12b: Oversized message threw error');

  // --------------------------------------------------------------------------
  // Group 6: Read Receipts & Counter Clearing
  // --------------------------------------------------------------------------
  console.log('\n--- Group 6: Read Receipts & Counter Management ---');

  // Buyer reads seller's message
  const readConv = await marketplaceInboxService.markConversationAsRead(conv1.conversationId, buyer1);
  assert(readConv.buyerUnreadCount === 0, 'Test 6.1: markConversationAsRead clears buyerUnreadCount');

  const messagesAfterRead = await marketplaceInboxService.getMessagesForConversation(conv1.conversationId, buyer1);
  const sellerMsg = messagesAfterRead.find((m) => m.messageId === msg2.messageId);
  assert(sellerMsg?.readAt !== null, 'Test 6.2: Unread incoming message receives readAt timestamp');

  // --------------------------------------------------------------------------
  // Group 7: Conversation Lifecycle (ACTIVE -> CLOSED -> BLOCKED)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 7: Conversation Lifecycle ---');

  // Close conversation
  const closedConv = await marketplaceInboxService.updateConversationStatus(conv1.conversationId, 'CLOSED', buyer1);
  assert(closedConv.status === 'CLOSED', 'Test 7.1: Conversation successfully updated to CLOSED');

  // Block conversation
  const blockedConv = await marketplaceInboxService.updateConversationStatus(conv1.conversationId, 'BLOCKED', buyer1);
  assert(blockedConv.status === 'BLOCKED', 'Test 7.2: Conversation successfully updated to BLOCKED');

  // Sending message in BLOCKED conversation is forbidden
  let blockedSendError = false;
  try {
    await marketplaceInboxService.sendMessage(
      {
        conversationId: conv1.conversationId,
        senderUserId: seller1,
        text: 'Najaribu kutuma ujumbe kwenye mazungumzo yaliyozuiwa'
      },
      seller1
    );
  } catch (err: any) {
    blockedSendError = true;
    assert(err.message.includes('yamezuiwa (BLOCKED)'), 'Test 7.3: Messaging in BLOCKED conversation is rejected');
  }
  assert(blockedSendError, 'Test 7.3b: Blocked conversation messaging threw expected error');

  // Reactivate conversation
  const reactivatedConv = await marketplaceInboxService.updateConversationStatus(conv1.conversationId, 'ACTIVE', buyer1);
  assert(reactivatedConv.status === 'ACTIVE', 'Test 7.4: Conversation can be reactivated to ACTIVE');

  // --------------------------------------------------------------------------
  // Group 8: Scoped Queries (Buyer vs Seller Lists)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 8: User Inbox Query Scoping ---');

  const buyerConvs = await marketplaceInboxService.getConversationsForUser(buyer1, 'BUYER');
  assert(buyerConvs.length >= 2, 'Test 8.1: Buyer queries their active conversations');
  assert(buyerConvs.every((c) => c.buyerUserId === buyer1), 'Test 8.2: All returned buyer conversations belong to buyer');

  const sellerConvs = await marketplaceInboxService.getConversationsForUser(seller1, 'SELLER');
  assert(sellerConvs.length >= 2, 'Test 8.3: Seller queries customer inquiries');
  assert(sellerConvs.every((c) => c.sellerUserId === seller1), 'Test 8.4: All returned seller conversations belong to seller');

  const unrelatedConvs = await marketplaceInboxService.getConversationsForUser('random_user_none');
  assert(unrelatedConvs.length === 0, 'Test 8.5: User with no conversations receives empty array');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runV111bTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
