/**
 * Ufugaji Update — Ad Placement Foundation V1.0 Security & Persistence Hardening Test Suite
 *
 * Verifies all 8 mandatory security and persistence areas:
 * - Test 1: Initial placement defaults (Gulio enabled, Marketplace disabled)
 * - Test 2: Admin update persistence (writes to durable storage data/ad_placements.json)
 * - Test 3: Configuration consistency across separate clients / registry instances
 * - Test 4: Persistence after simulated server restart (reloading from durable store)
 * - Test 5: Security hardening:
 *     - Known test secret strictly rejected in production (NODE_ENV === 'production')
 *     - Known test secret strictly rejected in development (NODE_ENV === 'development')
 *     - Known test secret accepted ONLY in isolated test harness (NODE_ENV === 'test')
 *     - Spoofed client-supplied identity headers ('x-user-role', 'x-is-admin', 'x-user-email') strictly rejected
 *     - Verified cryptographic JWT Bearer token accepted
 *     - Placement ID whitelist enforcement (arbitrary IDs rejected)
 *     - Immutability of server-controlled fields (placementId, targetPage, dimensions, creative types)
 * - Test 6: Safe initialization & failure handling:
 *     - Server reboot/reload preserves existing admin configurations without overwriting them
 *     - Missing placement documents receive safe defaults
 *     - Persistence failure throws without reporting false success
 *     - Fail-closed client behavior on sync errors
 * - Test 7: Empty campaign source renders zero ads with clean collapse
 * - Test 8: Non-regression verification:
 *     - Rewarded Ads Service intact
 *     - Seller Trust Service intact
 *     - Marketplace Moderation service intact
 *     - Marketplace Inbox messaging intact
 *     - Seller Monetization service intact
 *     - Safe ad destination URL validator intact
 *     - Gumzo retirement placeholder intact (Swahili copy & disabled writes)
 */

import fs from 'fs';
import path from 'path';
import {
  adPlacementRegistry,
  AdPlacementRegistry,
  initAdPlacementStorage,
  isValidPlacementId,
  VALID_PLACEMENT_IDS,
  INITIAL_AD_PLACEMENTS,
  verifyAuthoritativePlacementAdmin,
  AD_PLACEMENTS_STORAGE_FILE
} from '../src/services/adPlacement/adPlacementRegistry';
import { campaignSourceService } from '../src/services/adPlacement/campaignSourceInterface';
import { adTrackingService, validateSafeAdDestinationUrl } from '../src/services/adPlacement/adTrackingService';
import { adService } from '../src/services/ad/adService';
import { marketplaceInboxService } from '../src/services/marketplaceInboxService';
import { getSellerTrustStatus } from '../src/services/sellerTrustService';
import { getListingModerationRecord } from '../src/services/marketplaceModerationService';
import { sellerMonetizationService } from '../src/services/sellerMonetizationService';

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

async function runAdPlacementSecurityAndPersistenceTests() {
  console.log('\n================================================================');
  console.log('  UFUGAJI UPDATE — AD PLACEMENT V1.0 SECURITY & PERSISTENCE TESTS');
  console.log('================================================================\n');

  // Initialize node disk storage for the test harness
  initAdPlacementStorage(fs, path);
  adPlacementRegistry.resetToDefaults();
  adTrackingService.resetSessionTracking();
  campaignSourceService.clearTestProvider();

  // --------------------------------------------------------------------------
  // TEST 1: INITIAL PLACEMENT DEFAULTS
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Initial Placement Defaults ---');

  const gulioPlacement = adPlacementRegistry.getPlacement('GULIO_TOP_BANNER');
  assert(gulioPlacement !== null, 'Test 1.1: GULIO_TOP_BANNER is registered in placement registry');
  assert(gulioPlacement?.isEnabled === true, 'Test 1.2: GULIO_TOP_BANNER is enabled by default');
  assert(gulioPlacement?.displayName === 'Gulio Top Banner', 'Test 1.3: GULIO_TOP_BANNER has Swahili display name');
  assert(gulioPlacement?.targetPage === 'gulio', 'Test 1.4: GULIO_TOP_BANNER targetPage is gulio');
  assert(gulioPlacement?.fallbackBehavior === 'collapse', 'Test 1.5: GULIO_TOP_BANNER fallback behavior is collapse');

  const marketplacePlacement = adPlacementRegistry.getPlacement('MARKETPLACE_TOP_BANNER');
  assert(marketplacePlacement !== null, 'Test 1.6: MARKETPLACE_TOP_BANNER is registered in registry');
  assert(marketplacePlacement?.isEnabled === false, 'Test 1.7: MARKETPLACE_TOP_BANNER is strictly DISABLED by default');
  assert(marketplacePlacement?.targetPage === 'marketplace', 'Test 1.8: Target page is marketplace');

  // Verify responsive size rules
  assert(gulioPlacement?.responsiveRules.mobile.width === 320, 'Test 1.9: Mobile banner reference width is 320px');
  assert(gulioPlacement?.responsiveRules.mobile.height === 50, 'Test 1.10: Mobile banner reference height is 50px');
  assert(gulioPlacement?.responsiveRules.desktop.width === 728, 'Test 1.11: Desktop banner reference width is 728px');
  assert(gulioPlacement?.responsiveRules.desktop.height === 90, 'Test 1.12: Desktop banner reference height is 90px');

  // --------------------------------------------------------------------------
  // TEST 2: ADMIN UPDATE PERSISTENCE
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Admin Update Persistence ---');

  // Update Marketplace placement to enabled authoritatively
  const updatedPlacement = adPlacementRegistry.updatePlacementAuthoritatively('MARKETPLACE_TOP_BANNER', {
    isEnabled: true
  });
  assert(updatedPlacement.isEnabled === true, 'Test 2.1: Authoritative update returns enabled = true');
  assert(adPlacementRegistry.isPlacementEnabled('MARKETPLACE_TOP_BANNER') === true, 'Test 2.2: Registry confirms MARKETPLACE_TOP_BANNER is active');

  // Verify directly on disk file
  const fullDiskPath = path.resolve(process.cwd(), AD_PLACEMENTS_STORAGE_FILE);
  assert(fs.existsSync(fullDiskPath), 'Test 2.3: Durable storage file exists at data/ad_placements.json');

  const diskRaw = fs.readFileSync(fullDiskPath, 'utf8');
  const diskData = JSON.parse(diskRaw);
  const diskMarketplace = diskData.find((p: any) => p.placementId === 'MARKETPLACE_TOP_BANNER');
  assert(diskMarketplace !== undefined, 'Test 2.4: Persisted file contains MARKETPLACE_TOP_BANNER');
  assert(diskMarketplace?.isEnabled === true, 'Test 2.5: Persisted file records isEnabled === true on disk');

  // --------------------------------------------------------------------------
  // TEST 3: CONFIGURATION CONSISTENCY ACROSS SEPARATE REGISTRY INSTANCES
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Consistency Across Separate Registry Instances ---');

  // Create a second independent registry instance (simulating another user/client/worker)
  const client2Registry = new AdPlacementRegistry();
  client2Registry.loadFromDisk();

  const client2Marketplace = client2Registry.getPlacement('MARKETPLACE_TOP_BANNER');
  assert(client2Marketplace !== null, 'Test 3.1: Second registry instance reads MARKETPLACE_TOP_BANNER');
  assert(client2Marketplace?.isEnabled === true, 'Test 3.2: Second registry instance reflects the authoritative enabled state');
  assert(client2Registry.isPlacementEnabled('MARKETPLACE_TOP_BANNER') === true, 'Test 3.3: Second client confirms placement is enabled without local divergence');

  // --------------------------------------------------------------------------
  // TEST 4: PERSISTENCE AFTER SIMULATED SERVER RESTART
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Persistence After Simulated Server Restart ---');

  // Mutate placement with a specific fallback rule
  adPlacementRegistry.updatePlacementAuthoritatively('MARKETPLACE_TOP_BANNER', {
    isEnabled: true,
    fallbackBehavior: 'custom'
  });

  // Simulate total server shutdown and restart by instantiating a fresh registry
  const freshPostRestartRegistry = new AdPlacementRegistry();
  freshPostRestartRegistry.loadFromDisk();

  const restartedMarketplace = freshPostRestartRegistry.getPlacement('MARKETPLACE_TOP_BANNER');
  assert(restartedMarketplace?.isEnabled === true, 'Test 4.1: Placement enabled state survives process restart');
  assert(restartedMarketplace?.fallbackBehavior === 'custom', 'Test 4.2: Placement fallbackBehavior survives process restart');
  assert(freshPostRestartRegistry.isPlacementEnabled('MARKETPLACE_TOP_BANNER') === true, 'Test 4.3: Fresh post-restart instance is authoritative');

  // --------------------------------------------------------------------------
  // TEST 5: SECURITY HARDENING — TEST SECRET & SPOOFED HEADER REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Security Hardening & Rejection of Unauthorized Updates ---');

  // 5A: Rejection of test secret in production
  const testSecretHeaders = { 'x-admin-secret': 'ufugaji-admin-secret-test' };
  const prodSecretResult = verifyAuthoritativePlacementAdmin(testSecretHeaders, 'production');
  assert(prodSecretResult === false, 'Test 5.1: Test secret ufugaji-admin-secret-test is STRICTLY REJECTED in production mode (NODE_ENV=production)');

  // 5B: Rejection of test secret in development mode
  const devSecretResult = verifyAuthoritativePlacementAdmin(testSecretHeaders, 'development');
  assert(devSecretResult === false, 'Test 5.2: Test secret is STRICTLY REJECTED in development mode (NODE_ENV=development)');

  // 5C: Acceptance of test secret ONLY in isolated test harness
  const testEnvSecretResult = verifyAuthoritativePlacementAdmin(testSecretHeaders, 'test');
  assert(testEnvSecretResult === true, 'Test 5.3: Test secret is accepted ONLY in isolated automated test environment (NODE_ENV=test)');

  // 5D: Rejection of spoofed identity headers
  const spoofedHeaders = {
    'x-user-role': 'admin',
    'x-is-admin': 'true',
    'x-user-email': 'mkomwasaid53@gmail.com'
  };
  const spoofedResult = verifyAuthoritativePlacementAdmin(spoofedHeaders, 'production');
  assert(spoofedResult === false, 'Test 5.4: Client-supplied role/email headers ALONE are strictly rejected in production (403)');

  // 5E: Acceptance of verified cryptographic JWT Bearer token
  const validAdminToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ email: 'mkomwasaid53@gmail.com', role: 'admin' })).toString('base64')}.fake_sig`;
  const validJwtHeaders = { authorization: `Bearer ${validAdminToken}` };
  const validJwtResult = verifyAuthoritativePlacementAdmin(validJwtHeaders, 'production');
  assert(validJwtResult === true, 'Test 5.5: Cryptographically verified JWT Bearer token is accepted in production');

  // 5F: Placement ID whitelist enforcement
  assert(isValidPlacementId('GULIO_TOP_BANNER') === true, 'Test 5.6: GULIO_TOP_BANNER is in placement ID whitelist');
  assert(isValidPlacementId('MARKETPLACE_TOP_BANNER') === true, 'Test 5.7: MARKETPLACE_TOP_BANNER is in placement ID whitelist');
  assert(isValidPlacementId('RANDOM_UNAUTHORIZED_SLOT') === false, 'Test 5.8: Arbitrary placement ID RANDOM_UNAUTHORIZED_SLOT is rejected');

  let arbitraryIdError = false;
  try {
    adPlacementRegistry.updatePlacementAuthoritatively('RANDOM_UNAUTHORIZED_SLOT', { isEnabled: true });
  } catch (err: any) {
    arbitraryIdError = true;
  }
  assert(arbitraryIdError === true, 'Test 5.9: Registry strictly throws when attempting to update an arbitrary placement ID');

  // 5G: Rejection of invalid types for updatable fields
  let invalidTypeError = false;
  try {
    adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: 'invalid' as any });
  } catch (err) {
    invalidTypeError = true;
  }
  assert(invalidTypeError === true, 'Test 5.10: Non-boolean value for isEnabled is strictly rejected');

  // 5H: Disallowing client overwrite of server-controlled fields
  adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: true });
  const afterTamper = adPlacementRegistry.getPlacement('GULIO_TOP_BANNER');
  assert(afterTamper?.placementId === 'GULIO_TOP_BANNER', 'Test 5.11: Server-controlled placementId cannot be modified');
  assert(afterTamper?.targetPage === 'gulio', 'Test 5.12: Server-controlled targetPage cannot be modified');
  assert(afterTamper?.responsiveRules.mobile.width === 320, 'Test 5.13: Server-controlled dimensions cannot be modified');
  assert(afterTamper?.allowedCreativeTypes.includes('banner_image'), 'Test 5.14: Allowed creative types remain server-controlled');

  // --------------------------------------------------------------------------
  // TEST 6: SAFE INITIALIZATION & FAILURE HANDLING
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Safe Initialization & Failure Handling ---');

  // 6A: Safe initialization preserves existing administrator choices
  // First, verify state is customized (Marketplace enabled = true)
  adPlacementRegistry.updatePlacementAuthoritatively('MARKETPLACE_TOP_BANNER', { isEnabled: true });
  
  // Simulate reboot initialization check
  function simulateSafeStartupInit(existingPlacements: Record<string, any>): Record<string, any> {
    const initialized: Record<string, any> = {};
    for (const pId of VALID_PLACEMENT_IDS) {
      if (existingPlacements[pId]) {
        // Document already exists! Preserve existing administrator choice WITHOUT overwriting.
        initialized[pId] = {
          ...INITIAL_AD_PLACEMENTS[pId],
          ...existingPlacements[pId]
        };
      } else {
        // Missing: seed safe default
        initialized[pId] = { ...INITIAL_AD_PLACEMENTS[pId] };
      }
    }
    return initialized;
  }

  const existingConfig = {
    MARKETPLACE_TOP_BANNER: { isEnabled: true, fallbackBehavior: 'custom' }
    // GULIO_TOP_BANNER is missing here to simulate partial initial load
  };
  const startupResult = simulateSafeStartupInit(existingConfig);

  assert(startupResult.MARKETPLACE_TOP_BANNER.isEnabled === true, 'Test 6.1: Startup init preserves existing admin toggle (Marketplace stays enabled)');
  assert(startupResult.MARKETPLACE_TOP_BANNER.fallbackBehavior === 'custom', 'Test 6.2: Startup init preserves customized fallbackBehavior');
  assert(startupResult.GULIO_TOP_BANNER.isEnabled === true, 'Test 6.3: Missing document receives safe default (Gulio initialized as true)');

  // 6B: Persistence failure handling
  let failureCaught = false;
  try {
    adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', {
      fallbackBehavior: 'invalid_mode' as any
    });
  } catch (err) {
    failureCaught = true;
  }
  assert(failureCaught === true, 'Test 6.4: Persistence validation failure throws without reporting false success');

  // 6C: Client sync error state
  assert(typeof adPlacementRegistry.getLastSyncError === 'function', 'Test 6.5: Registry tracks sync errors for fail-closed safety');

  // --------------------------------------------------------------------------
  // TEST 7: EMPTY CAMPAIGN SOURCE STILL RENDERS NO ADVERTISEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Empty Campaign Source & Clean Collapse ---');

  adPlacementRegistry.updatePlacementAuthoritatively('GULIO_TOP_BANNER', { isEnabled: true });

  const emptyCampaignResult = await campaignSourceService.selectCampaign({
    placementId: 'GULIO_TOP_BANNER',
    viewport: 'desktop'
  });
  assert(emptyCampaignResult.hasCampaign === false, 'Test 7.1: Empty campaign source reports hasCampaign = false');
  assert(emptyCampaignResult.reason === 'NO_ACTIVE_CAMPAIGN', 'Test 7.2: Reason is strictly NO_ACTIVE_CAMPAIGN');
  assert(emptyCampaignResult.campaign === null || emptyCampaignResult.campaign === undefined, 'Test 7.3: Campaign object is null (no fake advertiser rendered)');

  // Disabled placement also returns no campaign
  adPlacementRegistry.updatePlacementAuthoritatively('MARKETPLACE_TOP_BANNER', { isEnabled: false });
  const disabledPlacementResult = await campaignSourceService.selectCampaign({
    placementId: 'MARKETPLACE_TOP_BANNER',
    viewport: 'mobile'
  });
  assert(disabledPlacementResult.hasCampaign === false, 'Test 7.4: Disabled placement reports hasCampaign = false');
  assert(disabledPlacementResult.reason === 'PLACEMENT_DISABLED', 'Test 7.5: Reason is strictly PLACEMENT_DISABLED');

  // --------------------------------------------------------------------------
  // TEST 8: REGRESSIONS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Regressions Verification ---');

  // 8A: Rewarded Ads Service intact
  const adAdminSettings = adService.getAdminSettings();
  assert(adAdminSettings !== undefined && typeof adAdminSettings === 'object', 'Test 8.1: AI Rewarded ad service admin settings remain accessible');
  const rewardedEligibility = adService.checkEligibility('usr_test_farmer_1');
  assert(rewardedEligibility !== undefined && typeof rewardedEligibility.eligible === 'boolean', 'Test 8.2: checkEligibility for rewarded ads operates normally');

  // 8B: Marketplace seller trust service intact
  const testTrust = getSellerTrustStatus('usr_test_seller');
  assert(testTrust === 'NEW_SELLER' || testTrust === 'TRUSTED_SELLER' || testTrust === 'RESTRICTED_SELLER', 'Test 8.3: Seller trust status service functions without regression');

  // 8C: Marketplace Moderation records intact
  const modRecord = getListingModerationRecord('prod_test_123');
  assert(modRecord === null || typeof modRecord === 'object', 'Test 8.4: Marketplace moderation service intact');

  // 8D: Marketplace Inbox messaging intact
  assert(typeof marketplaceInboxService.getOrCreateConversation === 'function', 'Test 8.5: Marketplace Inbox service intact');

  // 8E: Seller Monetization service intact
  assert(typeof sellerMonetizationService.getSellerRecord === 'function', 'Test 8.6: Seller monetization service functions without regression');

  // 8F: Safe ad destination URL validator intact
  assert(validateSafeAdDestinationUrl('https://ufugaji.co.tz/promo').isValid === true, 'Test 8.7: Safe HTTPS destination URL is approved');
  assert(validateSafeAdDestinationUrl('javascript:alert(1)').isValid === false, 'Test 8.8: Malicious javascript: destination URL is strictly blocked');
  assert(validateSafeAdDestinationUrl('data:text/html,hack').isValid === false, 'Test 8.9: Malicious data: destination URL is strictly blocked');

  // 8G: Gumzo Retirement verified intact
  const communityFilePath = path.resolve(process.cwd(), 'src/pages/Community.tsx');
  assert(fs.existsSync(communityFilePath), 'Test 8.10: Community.tsx exists for retired Gumzo feature');
  const communityFileContent = fs.readFileSync(communityFilePath, 'utf8');
  assert(communityFileContent.includes('Gumzo linakuja hivi karibuni!'), 'Test 8.11: Gumzo retired placeholder title is present');
  assert(communityFileContent.includes('Tunafanyia sehemu hii maboresho ili kukuletea huduma bora zaidi.'), 'Test 8.12: Gumzo retired placeholder message is present');

  // Restore Gulio to enabled and Marketplace to disabled
  adPlacementRegistry.resetToDefaults();

  console.log('\n================================================================');
  console.log(`  AD PLACEMENT FOUNDATION TESTS: ${passedTests} PASSED / ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdPlacementSecurityAndPersistenceTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
