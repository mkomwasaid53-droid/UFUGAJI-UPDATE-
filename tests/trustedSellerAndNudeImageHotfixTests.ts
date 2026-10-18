/**
 * AUTOMATED HOTFIX VALIDATION TEST SUITE:
 * 1. TRUSTED SELLER PUBLISHING (ISSUE 1)
 * 2. MULTIMODAL AI SCREENING & NUDE IMAGE REJECTION (ISSUE 2)
 */

import {
  evaluateListingContentDeterministically,
  evaluateMarketplaceListingContent,
  resolveListingPublishingState,
  extractMultimodalImageParts,
  computeListingContentFingerprint
} from '../src/services/marketplaceAiScreeningService';
import {
  getSellerTrustStatus,
  updateSellerTrustStatus,
  saveSellerProfileToCache
} from '../src/services/sellerTrustService';
import {
  getListingModerationRecord,
  registerListingModerationRecord,
  fetchModerationQueue
} from '../src/services/marketplaceModerationService';
import { MarketplaceProduct } from '../src/types/marketplace';
import { SEED_GOVERNED_CATEGORIES } from '../src/services/marketplaceCategoryService';

// Ensure mock localStorage for node environment
const mockStorage: Record<string, string> = {};
if (typeof window === 'undefined' || !window.localStorage) {
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; }
  };
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✓ [PASS] ${testName}`);
  } else {
    failed++;
    const msg = `✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`;
    console.error(msg);
    errors.push(msg);
  }
}

export async function runHotfixValidationTests() {
  console.log('\n=============================================================');
  console.log('--- HOTFIX: TRUSTED SELLER PUBLISHING & MULTIMODAL SCREENING ---');
  console.log('=============================================================\n');

  // Seed categories
  localStorage.setItem(
    'ufugaji_marketplace_categories_cache',
    JSON.stringify(SEED_GOVERNED_CATEGORIES)
  );

  const adminId = 'admin_super_01';
  const adminName = 'Msimamizi Mkuu';

  // --------------------------------------------------------------------------
  // PART 1: ISSUE 1 — TRUSTED SELLER PUBLISHING
  // --------------------------------------------------------------------------
  console.log('--- ISSUE 1: TRUSTED SELLER PUBLISHING VERIFICATION ---');

  const trustedSellerId = 'seller_trusted_goat_keeper_01';
  await updateSellerTrustStatus({
    adminUserId: adminId,
    adminUserName: adminName,
    isAdmin: true,
    sellerId: trustedSellerId,
    newTrustStatus: 'TRUSTED_SELLER',
    reason: 'Muuzaji mzoefu wa mbuzi wa maziwa aliyeidhinishwa'
  });

  const authoritativeTrust = getSellerTrustStatus(trustedSellerId);
  assert(authoritativeTrust === 'TRUSTED_SELLER', '1.1: Authoritative trust status is TRUSTED_SELLER');

  // Legitimate goat listing submitted by TRUSTED_SELLER
  const goatListingInput = {
    productId: 'prod_goat_boer_001',
    sellerId: trustedSellerId,
    title: 'Mbuzi wa Maziwa (Dairy Goat - Saanen)',
    description: 'Mbuzi bora wa maziwa, anatoa lita 3 kwa siku. Amepewa chanjo zote.',
    category: 'Mbuzi',
    subcategory: 'Mbuzi wa Maziwa',
    price: 350000,
    images: [{ url: '/uploads/images/clean_saanen_goat.jpg' }]
  };

  const goatScreeningResult = evaluateListingContentDeterministically(goatListingInput);
  assert(goatScreeningResult.status === 'PASS', '1.2: Legitimate goat listing receives AI PASS');

  const goatResolution = resolveListingPublishingState({
    screeningResult: goatScreeningResult,
    sellerTrustStatus: authoritativeTrust,
    currentModerationStatus: 'PENDING_REVIEW'
  });

  assert(goatResolution.canPublishActiveImmediately === true, '1.3: TRUSTED_SELLER + PASS canPublishActiveImmediately is TRUE');
  assert(goatResolution.recommendedModerationStatus === 'APPROVED', '1.4: Recommended status is APPROVED');

  // In contrast, NEW_SELLER submitting the exact same goat listing
  const newSellerId = 'seller_new_farmer_02';
  const newSellerTrust = getSellerTrustStatus(newSellerId);
  assert(newSellerTrust === 'NEW_SELLER', '1.5: Unverified new seller defaults to NEW_SELLER');

  const newSellerResolution = resolveListingPublishingState({
    screeningResult: goatScreeningResult,
    sellerTrustStatus: newSellerTrust,
    currentModerationStatus: 'PENDING_REVIEW'
  });

  assert(newSellerResolution.canPublishActiveImmediately === false, '1.6: NEW_SELLER + PASS cannot auto-publish (held in PENDING_REVIEW)');
  assert(newSellerResolution.recommendedModerationStatus === 'PENDING_REVIEW', '1.7: NEW_SELLER recommended status is PENDING_REVIEW');

  // Registering moderation record for approved listing updates status correctly
  registerListingModerationRecord({
    moderationId: `mod_${goatListingInput.productId}`,
    targetType: 'LISTING',
    targetId: goatListingInput.productId,
    productId: goatListingInput.productId,
    listingId: goatListingInput.productId,
    sellerId: trustedSellerId,
    shopId: trustedSellerId,
    status: 'APPROVED',
    priority: 'NORMAL',
    reasonCode: null,
    reasonText: null,
    internalNote: null,
    publicExplanation: 'Tangazo limeidhinishwa kiotomatiki (Trusted Seller + AI Pass).',
    correctionInstructions: null,
    reviewedByUserId: 'system_ai_trusted_seller',
    reviewedByDisplayName: 'AI Screening + Trusted Seller',
    reviewedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const savedRecord = getListingModerationRecord(goatListingInput.productId);
  assert(savedRecord.status === 'APPROVED', '1.8: Moderation record for auto-approved trusted listing is APPROVED');

  // --------------------------------------------------------------------------
  // PART 2: ISSUE 2 — MULTIMODAL AI SCREENING & NUDE IMAGES
  // --------------------------------------------------------------------------
  console.log('\n--- ISSUE 2: NUDE IMAGE REJECTION & SAFETY SAFEGUARDS ---');

  // Test 2.1: Image URL or filename containing explicit keyword (nude/nudity/porn)
  const nudeImageListingInput = {
    productId: 'prod_test_nude_img_01',
    sellerId: trustedSellerId, // Even a TRUSTED_SELLER must be blocked
    title: 'Mbuzi wa Nyama (Boer)', // Legitimate title to test that image failure is not masked by title
    description: 'Mbuzi mzuri anauzwa bei nafuu.',
    category: 'Mbuzi',
    price: 150000,
    images: [{ url: '/uploads/images/nude_explicit_photo.jpg', id: 'img_nude_01' }]
  };

  const nudeScreeningResult = evaluateListingContentDeterministically(nudeImageListingInput);
  assert(nudeScreeningResult.status === 'BLOCK', '2.1: Nude image listing is strictly flagged as BLOCK');
  assert(
    nudeScreeningResult.categories.includes('SEXUAL_OR_EXPLICIT_CONTENT'),
    '2.2: Category is SEXUAL_OR_EXPLICIT_CONTENT'
  );

  const nudeResolution = resolveListingPublishingState({
    screeningResult: nudeScreeningResult,
    sellerTrustStatus: authoritativeTrust, // Even trusted seller cannot publish nude images
    currentModerationStatus: 'PENDING_REVIEW'
  });

  assert(nudeResolution.canPublishActiveImmediately === false, '2.3: Nude image can NEVER publish immediately');
  assert(nudeResolution.recommendedModerationStatus === 'REJECTED', '2.4: Nude image recommended status is REJECTED');

  // Test 2.2: Extract multimodal parts handles data URLs and file paths safely
  const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const parts = extractMultimodalImageParts([
    { dataUrl: sampleDataUrl, id: 'img_test_data' },
    { url: '/uploads/images/non_existent.jpg' }
  ]);
  assert(parts.length >= 1, '2.5: extractMultimodalImageParts successfully parsed base64 inlineData part');
  assert(parts[0].inlineData.mimeType === 'image/jpeg', '2.6: Correct mimeType extracted');

  // Test 2.3: Swahili explicit slang terms detection
  const swahiliSlangListing = {
    productId: 'prod_swahili_slang_01',
    sellerId: newSellerId,
    title: 'Kuku wa kienyeji',
    description: 'Picha za uchi na ngono haziruhusiwi kabisa',
    category: 'Kuku',
    price: 15000,
    images: []
  };
  const swahiliSlangResult = evaluateListingContentDeterministically(swahiliSlangListing);
  assert(swahiliSlangResult.status === 'BLOCK', '2.7: Swahili slang explicit terms (uchi/ngono) flagged as BLOCK');

  // Test 2.4: Veterinary context with wound/blood is REVIEW_REQUIRED, NOT BLOCK and NOT PASS
  const vetWoundListing = {
    productId: 'prod_vet_wound_01',
    sellerId: trustedSellerId,
    title: 'Matibabu ya Kidonda cha Mbuzi',
    description: 'Tiba na dawa ya kusafisha kidonda na damu kwa mbuzi waliojeruhiwa.',
    category: 'Dawa za Mifugo',
    price: 25000,
    images: [{ url: '/uploads/images/goat_wound_treatment.jpg' }]
  };
  const vetResult = evaluateListingContentDeterministically(vetWoundListing);
  assert(vetResult.status === 'REVIEW_REQUIRED', '2.8: Veterinary wound/blood context receives REVIEW_REQUIRED');
  assert(vetResult.categories.includes('POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT'), '2.9: Veterinary category assigned');

  console.log('\n=============================================================');
  console.log(`--- TEST SUMMARY: ${passed} PASSED / ${failed} FAILED ---`);
  console.log('=============================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in hotfix validation suite`);
  }
}

runHotfixValidationTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
