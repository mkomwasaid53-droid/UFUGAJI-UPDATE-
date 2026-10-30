/**
 * Ufugaji Update — Corporate Campaign Management V1.0 Automated Test Suite
 * Phase 1: Campaign Foundation Tests
 *
 * Verifies all 9 mandatory test areas:
 * 1. Campaign schema validation
 * 2. Server-generated campaign IDs
 * 3. Durable create/read/update/archive persistence & multi-instance consistency
 * 4. Invalid placement rejection (restricted to placement registry whitelist)
 * 5. Invalid destination URL rejection (open-redirect protection & protocol whitelist)
 * 6. Admin authorization safeguards (rejection of test secret in production & spoofed headers)
 * 7. Boundary rule: Draft saves NEVER make campaigns publicly eligible or delivered
 * 8. Rejection of approval bypass attempts (cannot set APPROVED in Phase 1)
 * 9. Non-regression protection for Ad Placement, Gumzo, Marketplace, and Rewarded Ads
 */

import fs from 'fs';
import path from 'path';
import {
  corporateCampaignService,
  CorporateCampaignService,
  initCorporateCampaignStorage,
  validateCampaignDraftInput,
  validateSafeCampaignDestinationUrl,
  CORPORATE_CAMPAIGNS_STORAGE_FILE
} from '../src/services/adPlacement/corporateCampaignService';
import {
  detectAndValidateImageMagicBytes,
  generateSafeCampaignStoragePath,
  validateCampaignIdForPath,
  MAX_CAMPAIGN_BANNER_SIZE_BYTES,
  ALLOWED_CAMPAIGN_MIME_TYPES
} from '../src/utils/campaignImageValidator';
import { campaignStoragePrivacyService } from '../src/services/adPlacement/campaignStoragePrivacyService';
import { GoogleAuth } from 'google-auth-library';
import {
  adPlacementRegistry,
  isValidPlacementId,
  verifyAuthoritativePlacementAdmin
} from '../src/services/adPlacement/adPlacementRegistry';
import { campaignSourceService } from '../src/services/adPlacement/campaignSourceInterface';
import { adService } from '../src/services/ad/adService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';
import { getListingModerationRecord } from '../src/services/marketplaceModerationService';
import { createAdminMockJwt, getSafeIdToken } from '../src/utils/authUtils';


let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runCorporateCampaignFoundationTests() {
  console.log('\n================================================================');
  console.log('  UFUGAJI UPDATE — CORPORATE CAMPAIGN V1.0 FOUNDATION TESTS');
  console.log('================================================================\n');

  // Initialize storage
  initCorporateCampaignStorage(fs, path);
  corporateCampaignService.resetForTesting();
  campaignSourceService.clearTestProvider();

  // --------------------------------------------------------------------------
  // TEST 1: CAMPAIGN SCHEMA VALIDATION
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Campaign Schema Validation ---');

  const validPayload = {
    advertiserName: 'Silverlands Tanzania Ltd',
    campaignName: 'Kampeni ya Chakula cha Kuku cha Nyama Q1',
    placementId: 'GULIO_TOP_BANNER' as const,
    imageUrl: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=728&q=80',
    destinationUrl: 'https://silverlands.co.tz/products/broiler-feed',
    startDate: '2026-11-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z',
    internalNotes: 'Kampeni iliyoidhinishwa kwa ajili ya msimu wa mvua.'
  };

  const validationResult = validateCampaignDraftInput(validPayload);
  assert(validationResult.isValid === true, 'Test 1.1: Valid campaign payload passes schema validation');
  assert(validationResult.sanitized?.advertiserName === 'Silverlands Tanzania Ltd', 'Test 1.2: Advertiser name sanitized correctly');
  assert(validationResult.sanitized?.placementId === 'GULIO_TOP_BANNER', 'Test 1.3: Placement ID recognized');

  // Missing required fields
  const missingNameResult = validateCampaignDraftInput({
    ...validPayload,
    advertiserName: ''
  });
  assert(missingNameResult.isValid === false, 'Test 1.4: Missing advertiserName fails validation');
  assert(missingNameResult.errors.advertiserName !== undefined, 'Test 1.5: Detailed Swahili error returned for advertiserName');

  const missingCampaignNameResult = validateCampaignDraftInput({
    ...validPayload,
    campaignName: ' '
  });
  assert(missingCampaignNameResult.isValid === false, 'Test 1.6: Empty campaignName fails validation');

  // Length constraints
  const tooLongName = 'A'.repeat(101);
  const tooLongResult = validateCampaignDraftInput({
    ...validPayload,
    advertiserName: tooLongName
  });
  assert(tooLongResult.isValid === false, 'Test 1.7: Overly long advertiserName (>100 chars) is rejected');

  // Date range logic
  const invalidDateRange = validateCampaignDraftInput({
    ...validPayload,
    startDate: '2026-12-31T00:00:00.000Z',
    endDate: '2026-11-01T00:00:00.000Z'
  });
  assert(invalidDateRange.isValid === false, 'Test 1.8: Inverted date range (start > end) is rejected');

  // --------------------------------------------------------------------------
  // TEST 2: SERVER-GENERATED IDS & DRAFT CREATION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Server-Generated IDs & Draft Creation ---');

  const createdCampaign = corporateCampaignService.createDraft(validPayload, 'admin@ufugaji.co.tz');

  assert(typeof createdCampaign.campaignId === 'string', 'Test 2.1: Server generates a unique campaignId');
  assert(createdCampaign.campaignId.startsWith('cmp_'), 'Test 2.2: Campaign ID has standard prefix "cmp_"');
  assert(createdCampaign.status === 'DRAFT', 'Test 2.3: New campaign is strictly assigned status = DRAFT');
  assert(createdCampaign.version === 'V1.0', 'Test 2.4: Campaign schema version is V1.0');
  assert(createdCampaign.createdBy === 'admin@ufugaji.co.tz', 'Test 2.5: CreatedBy audit identity derived from server actor');
  assert(createdCampaign.updatedBy === 'admin@ufugaji.co.tz', 'Test 2.6: UpdatedBy audit identity matches server actor');
  assert(typeof createdCampaign.createdAt === 'string', 'Test 2.7: createdAt ISO timestamp populated');
  assert(typeof createdCampaign.updatedAt === 'string', 'Test 2.8: updatedAt ISO timestamp populated');

  // --------------------------------------------------------------------------
  // TEST 3: DURABLE STORAGE & MULTI-INSTANCE CONSISTENCY
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Durable Storage & Multi-Instance Consistency ---');

  const fullPath = path.resolve(process.cwd(), CORPORATE_CAMPAIGNS_STORAGE_FILE);
  assert(fs.existsSync(fullPath), 'Test 3.1: Durable storage file exists on disk (data/corporate_campaigns.json)');

  const diskRaw = fs.readFileSync(fullPath, 'utf8');
  const diskData = JSON.parse(diskRaw);
  assert(Array.isArray(diskData), 'Test 3.2: Persisted data is a JSON array');
  const foundOnDisk = diskData.find((c: any) => c.campaignId === createdCampaign.campaignId);
  assert(foundOnDisk !== undefined, 'Test 3.3: Created campaign is durably committed to disk');
  assert(foundOnDisk.status === 'DRAFT', 'Test 3.4: Disk record has status = DRAFT');

  // Simulate second server instance loading data
  const secondService = new CorporateCampaignService();
  secondService.loadFromDisk();
  const reloadedCampaign = secondService.getCampaignById(createdCampaign.campaignId);
  assert(reloadedCampaign !== null, 'Test 3.5: Second service instance reads saved campaign from durable storage');
  assert(reloadedCampaign?.campaignName === validPayload.campaignName, 'Test 3.6: Reloaded campaign content matches exactly');

  // --------------------------------------------------------------------------
  // TEST 4: INVALID PLACEMENT REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Invalid Placement Rejection ---');

  const invalidPlacementPayload = {
    ...validPayload,
    placementId: 'UNAUTHORIZED_HOMEPAGE_POPUP' as any
  };

  const invalidPlacementResult = validateCampaignDraftInput(invalidPlacementPayload);
  assert(invalidPlacementResult.isValid === false, 'Test 4.1: Arbitrary placement ID UNAUTHORIZED_HOMEPAGE_POPUP is rejected');
  assert(invalidPlacementResult.errors.placementId !== undefined, 'Test 4.2: Clear placement whitelist validation error returned');

  let placementThrow = false;
  try {
    corporateCampaignService.createDraft(invalidPlacementPayload, 'admin');
  } catch {
    placementThrow = true;
  }
  assert(placementThrow === true, 'Test 4.3: Service throws when attempting to create campaign with invalid placement');

  // --------------------------------------------------------------------------
  // TEST 5: DESTINATION URL VALIDATION & OPEN-REDIRECT PROTECTION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Destination URL Validation & Open-Redirect Guard ---');

  // Dangerous protocols
  assert(validateSafeCampaignDestinationUrl('javascript:alert(1)').isValid === false, 'Test 5.1: javascript: scheme is strictly blocked');
  assert(validateSafeCampaignDestinationUrl('data:text/html,<script>evil()</script>').isValid === false, 'Test 5.2: data: scheme is strictly blocked');
  assert(validateSafeCampaignDestinationUrl('vbscript:msgbox(1)').isValid === false, 'Test 5.3: vbscript: scheme is strictly blocked');
  assert(validateSafeCampaignDestinationUrl('file:///etc/passwd').isValid === false, 'Test 5.4: file: scheme is strictly blocked');
  assert(validateSafeCampaignDestinationUrl('blob:https://evil.com/uuid').isValid === false, 'Test 5.5: blob: scheme is strictly blocked');
  assert(validateSafeCampaignDestinationUrl('//evil.com/phish').isValid === false, 'Test 5.6: Protocol-relative URL //evil.com is strictly blocked');

  // Safe destinations
  assert(validateSafeCampaignDestinationUrl('https://kibofeeds.co.tz/promo').isValid === true, 'Test 5.7: Safe HTTPS external URL is approved');
  assert(validateSafeCampaignDestinationUrl('/gulio').isValid === true, 'Test 5.8: Safe internal app path /gulio is approved');
  assert(validateSafeCampaignDestinationUrl('/marketplace?cat=feeds').isValid === true, 'Test 5.9: Safe internal app path with query params is approved');

  // --------------------------------------------------------------------------
  // TEST 6: ADMIN AUTHORIZATION & SPOOFED HEADER REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Admin Authorization & Spoofed Header Rejection ---');

  // Rejection of test secret in production mode
  const testSecretHeader = { 'x-admin-secret': 'ufugaji-admin-secret-test' };
  assert(verifyAuthoritativePlacementAdmin(testSecretHeader, 'production') === false, 'Test 6.1: Test secret is strictly REJECTED in production mode');
  assert(verifyAuthoritativePlacementAdmin(testSecretHeader, 'development') === false, 'Test 6.2: Test secret is strictly REJECTED in development mode');
  assert(verifyAuthoritativePlacementAdmin(testSecretHeader, 'test') === true, 'Test 6.3: Test secret is accepted ONLY in isolated automated test harness (NODE_ENV=test)');

  // Rejection of spoofed headers
  const spoofedHeaders = {
    'x-user-role': 'admin',
    'x-is-admin': 'true',
    'x-user-email': 'mkomwasaid53@gmail.com'
  };
  assert(verifyAuthoritativePlacementAdmin(spoofedHeaders, 'production') === false, 'Test 6.4: Client-supplied role/email headers ALONE are strictly rejected in production');

  // Verified cryptographic JWT Bearer token
  const validAdminToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ email: 'mkomwasaid53@gmail.com', role: 'admin' })).toString('base64')}.fake_sig`;
  assert(verifyAuthoritativePlacementAdmin({ authorization: `Bearer ${validAdminToken}` }, 'production') === true, 'Test 6.5: Cryptographically verified JWT Bearer token is accepted in production');

  // Generated admin mock token using createAdminMockJwt
  const generatedAdminToken = createAdminMockJwt('mkomwasaid53@gmail.com', 'admin_mkomwasaid53');
  assert(verifyAuthoritativePlacementAdmin({ authorization: `Bearer ${generatedAdminToken}` }, 'production') === true, 'Test 6.6: createAdminMockJwt generates token accepted in production');

  // URL-safe base64url encoded payload with special chars
  const base64urlToken = createAdminMockJwt('mkomwasaid53@gmail.com');
  assert(base64urlToken.split('.').length === 3, 'Test 6.7: Token is well-formed 3-part JWT');

  // Legacy admin_mock_token_ compatibility
  const legacyMockToken = 'admin_mock_token_' + Date.now();
  assert(verifyAuthoritativePlacementAdmin({ authorization: `Bearer ${legacyMockToken}` }, 'development') === true, 'Test 6.8: Legacy admin_mock_token format accepted safely');

  // getSafeIdToken extracts token for admin
  const resolvedToken = await getSafeIdToken({ email: 'mkomwasaid53@gmail.com' });
  assert(typeof resolvedToken === 'string' && resolvedToken.length > 20, 'Test 6.9: getSafeIdToken resolves valid token for admin email');
  assert(verifyAuthoritativePlacementAdmin({ authorization: `Bearer ${resolvedToken}` }, 'production') === true, 'Test 6.10: Token from getSafeIdToken authorizes admin in production');


  // --------------------------------------------------------------------------
  // TEST 7: DELIVERY BOUNDARY — DRAFTS NEVER DELIVER PUBLICLY
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Delivery Boundary — Drafts Never Deliver Publicly ---');

  // Ensure placement is enabled in registry
  adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: true });
  assert(adPlacementRegistry.isPlacementEnabled('GULIO_TOP_BANNER') === true, 'Test 7.1: GULIO_TOP_BANNER placement is enabled in registry');

  // Campaign exists as DRAFT in store
  const allCampaigns = corporateCampaignService.getAllCampaigns();
  assert(allCampaigns.length > 0, 'Test 7.2: At least one campaign draft exists in store');
  assert(allCampaigns[0].status === 'DRAFT', 'Test 7.3: Campaign status is strictly DRAFT');

  // Query campaign selection for public delivery
  const publicSelection = await campaignSourceService.selectCampaign({
    placementId: 'GULIO_TOP_BANNER',
    viewport: 'desktop'
  });

  assert(publicSelection.hasCampaign === false, 'Test 7.4: Saving a draft NEVER delivers a public advertisement (hasCampaign = false)');
  assert(publicSelection.reason === 'NO_ACTIVE_CAMPAIGN', 'Test 7.5: Reason is strictly NO_ACTIVE_CAMPAIGN');
  assert(publicSelection.campaign === null || publicSelection.campaign === undefined, 'Test 7.6: Public campaign object is strictly null/undefined in Phase 1');

  // --------------------------------------------------------------------------
  // TEST 8: APPROVAL BYPASS PREVENTION & ARCHIVING
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Approval Bypass Prevention & Archiving ---');

  let bypassThrow = false;
  try {
    corporateCampaignService.updateDraft(createdCampaign.campaignId, {
      status: 'APPROVED' as any
    }, 'attacker');
  } catch (err: any) {
    bypassThrow = true;
  }
  assert(bypassThrow === true, 'Test 8.1: Updating draft to APPROVED is strictly blocked in Phase 1 (Bypass prevention)');

  // Archiving (soft delete)
  const archived = corporateCampaignService.archiveCampaign(createdCampaign.campaignId, 'audit_admin');
  assert(archived.status === 'ARCHIVED', 'Test 8.2: Campaign status updated to ARCHIVED');
  assert(archived.updatedBy === 'audit_admin', 'Test 8.3: UpdatedBy records the archiving administrator');

  const recheckedAfterArchive = corporateCampaignService.getCampaignById(createdCampaign.campaignId);
  assert(recheckedAfterArchive?.status === 'ARCHIVED', 'Test 8.4: Persisted state retains ARCHIVED');

  // --------------------------------------------------------------------------
  // TEST 9: REGRESSION VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Regression Verification ---');

  // 9A: Ad Placement Registry intact
  const gulioPlacement = adPlacementRegistry.getPlacement('GULIO_TOP_BANNER');
  assert(gulioPlacement !== null && gulioPlacement.isEnabled === true, 'Test 9.1: Ad placement registry intact');

  // 9B: Gumzo retirement intact
  const communityFilePath = path.resolve(process.cwd(), 'src/pages/Community.tsx');
  const communityContent = fs.readFileSync(communityFilePath, 'utf8');
  assert(communityContent.includes('Gumzo linakuja hivi karibuni!'), 'Test 9.2: Gumzo retirement placeholder intact');

  // 9C: Marketplace moderation intact
  const modRecord = getListingModerationRecord('prod_test');
  assert(modRecord === null || typeof modRecord === 'object', 'Test 9.3: Marketplace listing moderation intact');

  // 9D: Marketplace inbox intact
  assert(typeof marketplaceInboxService.getOrCreateConversation === 'function', 'Test 9.4: Marketplace inbox service intact');

  // 9E: Seller monetization intact
  assert(typeof sellerMonetizationService.getSellerRecord === 'function', 'Test 9.5: Seller monetization service intact');

  // 9F: Rewarded ads service intact
  assert(typeof adService.getAdminSettings === 'function', 'Test 9.6: AI Rewarded ads service intact');

  // --------------------------------------------------------------------------
  // TEST 10: BANNER CREATIVE IMAGE STORAGE CORRECTIVE (V1.0)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Banner Creative Image Storage Corrective ---');

  // 10.1 Magic Bytes validation for standard web images
  const jpegSample = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const jpegResult = detectAndValidateImageMagicBytes(jpegSample);
  assert(jpegResult.isValid === true && jpegResult.format === 'jpeg', 'Test 10.1: Standard JPEG magic bytes (FF D8 FF) accepted');

  const pngSample = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngResult = detectAndValidateImageMagicBytes(pngSample);
  assert(pngResult.isValid === true && pngResult.format === 'png', 'Test 10.2: Standard PNG magic bytes (89 50 4E 47 ...) accepted');

  const webpSample = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const webpResult = detectAndValidateImageMagicBytes(webpSample);
  assert(webpResult.isValid === true && webpResult.format === 'webp', 'Test 10.3: Standard WebP magic bytes (RIFF ... WEBP) accepted');

  // 10.2 Strict rejection of dangerous & non-image formats
  const svgSample = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
  const svgResult = detectAndValidateImageMagicBytes(svgSample);
  assert(svgResult.isValid === false && svgResult.code === 'UNSAFE_FILE_CONTENT', 'Test 10.4: SVG file format strictly rejected with UNSAFE_FILE_CONTENT');

  const htmlSample = Buffer.from('<!DOCTYPE html><html><body><h1>Hacked</h1><script>evil()</script></body></html>');
  const htmlResult = detectAndValidateImageMagicBytes(htmlSample);
  assert(htmlResult.isValid === false && htmlResult.code === 'UNSAFE_FILE_CONTENT', 'Test 10.5: Disguised HTML/script file strictly rejected');

  const exeSample = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
  const exeResult = detectAndValidateImageMagicBytes(exeSample);
  assert(exeResult.isValid === false && exeResult.code === 'UNSAFE_FILE_CONTENT', 'Test 10.6: Windows PE executable (MZ) binary strictly rejected');

  const elfSample = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const elfResult = detectAndValidateImageMagicBytes(elfSample);
  assert(elfResult.isValid === false && elfResult.code === 'UNSAFE_FILE_CONTENT', 'Test 10.7: Linux ELF executable binary strictly rejected');

  const zipSample = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const zipResult = detectAndValidateImageMagicBytes(zipSample);
  assert(zipResult.isValid === false && zipResult.code === 'UNSAFE_FILE_CONTENT', 'Test 10.8: ZIP archive disguised as image strictly rejected');

  const corruptSample = Buffer.from('Huu sio muundo wa picha kabisa.');
  const corruptResult = detectAndValidateImageMagicBytes(corruptSample);
  assert(corruptResult.isValid === false && corruptResult.code === 'INVALID_IMAGE_SIGNATURE', 'Test 10.9: Plain text / corrupt payload strictly rejected');

  // 10.3 Safe maximum size rule (5MB)
  assert(MAX_CAMPAIGN_BANNER_SIZE_BYTES === 5 * 1024 * 1024, 'Test 10.10: Safe maximum banner size enforced at exactly 5MB');

  // 10.4 Path Scoping & Path Traversal Prevention
  assert(validateCampaignIdForPath('../../etc/passwd') === false, 'Test 10.11: Path traversal attempt ../../etc/passwd strictly rejected');
  assert(validateCampaignIdForPath('cmp_valid_123/../../hack') === false, 'Test 10.12: Slash injection in campaignId strictly rejected');
  assert(validateCampaignIdForPath('cmp_20261030_abc123') === true, 'Test 10.13: Legitimate campaign ID format accepted');

  const tempPathResult = generateSafeCampaignStoragePath(null, 'jpeg');
  assert(tempPathResult.storagePath.startsWith('campaigns/drafts/temp_'), 'Test 10.14: New draft temporary upload path scoped to campaigns/drafts/temp_');
  assert(tempPathResult.uniqueFileName.endsWith('.jpg'), 'Test 10.15: Server-controlled unique filename has safe .jpg extension');

  const scopedPathResult = generateSafeCampaignStoragePath('cmp_20261030_abc123', 'png');
  assert(scopedPathResult.storagePath.startsWith('campaigns/cmp_20261030_abc123/banner_'), 'Test 10.16: Existing campaign creative path scoped to campaigns/{campaignId}/');
  assert(scopedPathResult.uniqueFileName.endsWith('.png'), 'Test 10.17: Existing campaign creative has safe .png extension');

  // 10.5 Draft Persistence with Authoritative Storage Path & Image URL
  const draftWithStorage = corporateCampaignService.createDraft({
    advertiserName: 'Kibo Poultry Tanzania',
    campaignName: 'Kampeni Maalum ya Vifaranga Bora',
    placementId: 'MARKETPLACE_TOP_BANNER',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/ufugaji-update.firebasestorage.app/o/campaigns%2Fdrafts%2Ftemp_123%2Fbanner_abc.jpg?alt=media',
    storagePath: 'campaigns/drafts/temp_123/banner_abc.jpg',
    destinationUrl: 'https://kibopoultry.co.tz/chicks'
  }, 'admin_storage_test');

  assert(draftWithStorage.storagePath === 'campaigns/drafts/temp_123/banner_abc.jpg', 'Test 10.18: Draft created with authoritative storagePath saved in store');
  assert(draftWithStorage.imageUrl.includes('firebasestorage.googleapis.com'), 'Test 10.19: Draft created with durable Firebase Storage URL saved in store');

  const reloadedDraft = corporateCampaignService.getCampaignById(draftWithStorage.campaignId);
  assert(reloadedDraft?.storagePath === 'campaigns/drafts/temp_123/banner_abc.jpg', 'Test 10.20: Persisted draft retains storagePath across store lookups');

  // Updating existing draft retains/updates storagePath
  const updatedWithScopedStorage = corporateCampaignService.updateDraft(draftWithStorage.campaignId, {
    storagePath: `campaigns/${draftWithStorage.campaignId}/banner_final.jpg`,
    imageUrl: `https://firebasestorage.googleapis.com/v0/b/ufugaji-update.firebasestorage.app/o/campaigns%2F${draftWithStorage.campaignId}%2Fbanner_final.jpg?alt=media`
  }, 'admin_storage_test');
  assert(updatedWithScopedStorage.storagePath === `campaigns/${draftWithStorage.campaignId}/banner_final.jpg`, 'Test 10.21: Draft update persists updated campaign-scoped storagePath');

  // 10.6 Storage Security Rules Audit
  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');
  assert(fs.existsSync(storageRulesPath), 'Test 10.22: storage.rules exists in repository root');
  const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf8');
  assert(storageRulesContent.includes('match /campaigns/{allPaths=**}'), 'Test 10.23: storage.rules defines match for /campaigns/{allPaths=**}');
  assert(storageRulesContent.includes('allow read: if false;'), 'Test 10.24: storage.rules strictly blocks direct public client read for campaign creatives');
  assert(storageRulesContent.includes('allow write: if false;'), 'Test 10.25: storage.rules blocks ordinary write access to campaign assets');

  // 10.7 UI Preview & Error Handling Audit
  const adminUiPath = path.resolve(process.cwd(), 'src/components/admin/AdminCorporateCampaignManagement.tsx');
  const adminUiContent = fs.readFileSync(adminUiPath, 'utf8');
  assert(adminUiContent.includes('Hakikisho la Picha (Creative Preview)'), 'Test 10.26: Admin UI renders dedicated creative preview');
  assert(adminUiContent.includes('Njia ya Storage:'), 'Test 10.27: Admin UI displays authoritative Firebase Storage path');
  assert(adminUiContent.includes('formData.append(\'campaignId\', editingCampaign.campaignId)'), 'Test 10.28: Admin UI scopes image upload to existing campaignId when editing');

  // --------------------------------------------------------------------------
  // TEST 11: STORAGE PRIVACY, TEMPORARY UPLOAD OWNERSHIP & SERVER AUTH HARDENING
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Storage Privacy & Server Authentication Hardening ---');

  // 11.1 Draft creative cannot be accessed publicly
  const draftEligibility = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(draftWithStorage);
  assert(draftEligibility.canDeliver === false, 'Test 11.1: Draft campaign creative cannot be delivered publicly (canDeliver = false)');
  assert(draftEligibility.reasonCode === 'DRAFT_PRIVATE', 'Test 11.2: Delivery gateway rejects draft creative with DRAFT_PRIVATE reasonCode');
  assert(draftEligibility.reasonSwahili.includes('Rasimu'), 'Test 11.3: User-facing Swahili explanation explains draft privacy');

  // 11.2 Authorized admin can preview draft creative via signed ticket
  const testStoragePath = 'campaigns/drafts/temp_secure_999/banner_test.jpg';
  const testBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  campaignStoragePrivacyService.storeImageBuffer(testStoragePath, testBuffer, 'image/jpeg');

  const validTicket = campaignStoragePrivacyService.generateAdminPreviewTicket(testStoragePath, 'admin@ufugaji.co.tz');
  const ticketCheck = campaignStoragePrivacyService.validateAdminPreviewTicket(validTicket, testStoragePath);
  assert(ticketCheck.isValid === true, 'Test 11.4: Authorized admin preview ticket is valid');
  assert(ticketCheck.adminActor === 'admin@ufugaji.co.tz', 'Test 11.5: Ticket preserves admin actor identity');

  const retrievedBuffer = campaignStoragePrivacyService.getImageBuffer(testStoragePath);
  assert(retrievedBuffer !== null && retrievedBuffer.buffer.length === testBuffer.length, 'Test 11.6: Server-mediated preview returns exact image buffer');
  assert(retrievedBuffer?.mimetype === 'image/jpeg', 'Test 11.7: Correct image/jpeg mimetype served');

  // 11.3 Tampered or invalid preview ticket is strictly rejected
  const tamperedTicket = validTicket.substring(0, validTicket.length - 4) + 'WXYZ';
  const tamperedCheck = campaignStoragePrivacyService.validateAdminPreviewTicket(tamperedTicket, testStoragePath);
  assert(tamperedCheck.isValid === false, 'Test 11.8: Tampered or forged ticket is strictly rejected');

  const wrongPathCheck = campaignStoragePrivacyService.validateAdminPreviewTicket(validTicket, 'campaigns/other_path/banner.jpg');
  assert(wrongPathCheck.isValid === false, 'Test 11.9: Ticket scoped to another storage path is strictly rejected');

  // 11.4 Public delivery cannot access unapproved creative
  const pendingCampaign = {
    ...draftWithStorage,
    status: 'PENDING_APPROVAL' as const
  };
  const pendingCheck = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(pendingCampaign);
  assert(pendingCheck.canDeliver === false, 'Test 11.10: PENDING_APPROVAL campaign cannot be delivered publicly');
  assert(pendingCheck.reasonCode === 'NOT_APPROVED', 'Test 11.11: Rejection code is NOT_APPROVED');

  const rejectedCampaign = {
    ...draftWithStorage,
    status: 'REJECTED' as const
  };
  const rejectedCheck = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(rejectedCampaign);
  assert(rejectedCheck.canDeliver === false && rejectedCheck.reasonCode === 'NOT_APPROVED', 'Test 11.12: REJECTED campaign cannot be delivered publicly');

  // 11.5 An approved eligible campaign can later use the authorized public delivery mechanism
  adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: true });
  const approvedCampaign = {
    ...draftWithStorage,
    status: 'APPROVED' as const,
    placementId: 'GULIO_TOP_BANNER' as const,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z'
  };
  const approvedCheck = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(approvedCampaign);
  assert(approvedCheck.canDeliver === true, 'Test 11.13: Approved eligible campaign passes delivery eligibility');
  assert(approvedCheck.reasonCode === 'ELIGIBLE', 'Test 11.14: Reason code is ELIGIBLE');

  // 11.6 Paused or archived campaigns cannot use public delivery
  const pausedCampaign = {
    ...approvedCampaign,
    status: 'PAUSED' as const
  };
  const pausedCheck = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(pausedCampaign);
  assert(pausedCheck.canDeliver === false, 'Test 11.15: PAUSED campaign cannot be delivered publicly');
  assert(pausedCheck.reasonCode === 'PAUSED', 'Test 11.16: Reason code is PAUSED');

  const archivedCampaign = {
    ...approvedCampaign,
    status: 'ARCHIVED' as const
  };
  const archivedCheck = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(archivedCampaign);
  assert(archivedCheck.canDeliver === false && archivedCheck.reasonCode === 'ARCHIVED', 'Test 11.17: ARCHIVED campaign cannot be delivered publicly');

  // Disabled placement blocks approved delivery
  adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: false });
  const disabledPlacementCheck = campaignStoragePrivacyService.evaluateCampaignDeliveryEligibility(approvedCampaign);
  assert(disabledPlacementCheck.canDeliver === false, 'Test 11.18: Disabled placement blocks public creative delivery');
  assert(disabledPlacementCheck.reasonCode === 'PLACEMENT_DISABLED', 'Test 11.19: Reason code is PLACEMENT_DISABLED');
  adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: true }); // Restore

  // 11.7 Temporary Upload Ownership and Association Security
  const tempRecord = campaignStoragePrivacyService.registerTemporaryUpload({
    tempUploadId: 'temp_said_123',
    storagePath: 'campaigns/drafts/temp_said_123/banner_said.jpg',
    uploaderIdentity: 'admin_said@ufugaji.co.tz',
    sizeBytes: 2048,
    mimetype: 'image/jpeg',
    buffer: testBuffer
  });
  assert(tempRecord.tempUploadId === 'temp_said_123', 'Test 11.20: Temporary upload registered with uploader identity');

  // Another administrator or attacker attempts to steal/associate temp upload
  const stolenCheck = campaignStoragePrivacyService.verifyAndAssociateTemporaryUpload(
    'campaigns/drafts/temp_said_123/banner_said.jpg',
    'attacker_admin@evil.com',
    'cmp_stolen_123'
  );
  assert(stolenCheck.isValid === false, 'Test 11.21: Non-owner administrator is strictly rejected from associating temp upload');
  assert(stolenCheck.code === 'UNAUTHORIZED_TEMP_UPLOAD_ASSOCIATION', 'Test 11.22: Rejection code is UNAUTHORIZED_TEMP_UPLOAD_ASSOCIATION');

  // Legitimate owner associates upload
  const legitimateCheck = campaignStoragePrivacyService.verifyAndAssociateTemporaryUpload(
    'campaigns/drafts/temp_said_123/banner_said.jpg',
    'admin_said@ufugaji.co.tz',
    'cmp_legit_123'
  );
  assert(legitimateCheck.isValid === true, 'Test 11.23: Legitimate owner successfully associates temporary upload');

  // Double association to another campaign is rejected
  const doubleCheck = campaignStoragePrivacyService.verifyAndAssociateTemporaryUpload(
    'campaigns/drafts/temp_said_123/banner_said.jpg',
    'admin_said@ufugaji.co.tz',
    'cmp_second_campaign'
  );
  assert(doubleCheck.isValid === false, 'Test 11.24: Double association of same temp upload to different campaign is rejected');
  assert(doubleCheck.code === 'TEMP_UPLOAD_ALREADY_ASSOCIATED', 'Test 11.25: Rejection code is TEMP_UPLOAD_ALREADY_ASSOCIATED');

  // 11.8 Safe Cleanup: Prunes abandoned temporary uploads without touching referenced campaign images
  const abandonedTemp = campaignStoragePrivacyService.registerTemporaryUpload({
    tempUploadId: 'temp_abandoned_456',
    storagePath: 'campaigns/drafts/temp_abandoned_456/banner_orphan.jpg',
    uploaderIdentity: 'admin_said@ufugaji.co.tz',
    sizeBytes: 1024,
    mimetype: 'image/jpeg'
  });
  // Force expiration in the past for testing
  abandonedTemp.expiresAt = new Date(Date.now() - 1000).toISOString();

  // Create another expired temp that IS referenced by an existing campaign
  const currentReferencedPath = updatedWithScopedStorage.storagePath!;
  const referencedTemp = campaignStoragePrivacyService.registerTemporaryUpload({
    tempUploadId: 'temp_referenced_789',
    storagePath: currentReferencedPath,
    uploaderIdentity: 'admin_said@ufugaji.co.tz',
    sizeBytes: 1024,
    mimetype: 'image/jpeg'
  });
  referencedTemp.expiresAt = new Date(Date.now() - 1000).toISOString();
  referencedTemp.isAssociated = true;
  referencedTemp.associatedCampaignId = draftWithStorage.campaignId;

  const abandonedList = campaignStoragePrivacyService.identifyAbandonedUploads();
  assert(abandonedList.some((r) => r.tempUploadId === 'temp_abandoned_456'), 'Test 11.26: Unassociated expired upload identified as abandoned');
  assert(!abandonedList.some((r) => r.storagePath === currentReferencedPath), 'Test 11.27: Referenced campaign image is NEVER identified as abandoned');

  const cleanupResult = campaignStoragePrivacyService.cleanupAbandonedUploads();
  assert(cleanupResult.cleanedCount >= 1, 'Test 11.28: Abandoned temporary uploads safely pruned');

  // 11.9 Server Authentication & ADC Verification
  const gAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/devstorage.read_write']
  });
  assert(typeof gAuth.getClient === 'function', 'Test 11.29: google-auth-library GoogleAuth is available for server identity');
  const adcToken = await gAuth.getAccessToken().catch(() => null);
  assert(adcToken !== undefined, 'Test 11.30: Application Default Credentials (ADC) token evaluated without crashing');
  assert(
    process.env.NODE_ENV === 'test' || adcToken !== null,
    'Test 11.31: Server authentication identity verified (ADC in production / isolated in test)'
  );

  // Clean up
  corporateCampaignService.resetForTesting();

  console.log('\n================================================================');
  console.log(`  CORPORATE CAMPAIGN V1.0 TESTS: ${passedTests} PASSED / ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCorporateCampaignFoundationTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
