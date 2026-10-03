/**
 * UFUGAJI UPDATE — V1.10A-CORRECTIVE-7 TEST SUITE
 *
 * UNIFIED FREE TRIAL UI STATE SYNCHRONIZATION
 *
 * Validates:
 * - Block A: Main CTA activation immediately updates shared state and notifies subscribers
 * - Block B: Catalogues activation immediately synchronizes Main UI to TRIAL_ACTIVE
 * - Block C: Weka Bidhaa Mpya activation immediately synchronizes Main UI to TRIAL_ACTIVE
 * - Block D: Duka (Washa Duka) activation immediately synchronizes Main UI to TRIAL_ACTIVE
 * - Block E: Weka Tangazo activation immediately synchronizes Main UI to TRIAL_ACTIVE
 * - Block F: Cross-route persistence across all components
 * - Block G: Refresh simulation restores authoritative state without reverting to NOT_ACTIVATED
 * - Block H: Regression invariants (one notification, idempotency, anti-replay, suspension rules)
 */

import {
  sellerMonetizationService,
  subscribeToSellerMonetization
} from '../src/services/sellerMonetizationService';
import {
  canSellerSellOnMarketplace,
  isProductMarketplaceEligible,
  isShopMarketplaceEligible
} from '../src/services/marketplaceGovernanceEnforcement';
import { getLocalCachedNotifications } from '../src/services/notificationService';
import { SellerMonetizationRecord } from '../src/types/sellerMonetization';
import { DigitalShop } from '../src/types/marketplace';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(testId: string, condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testId}: ${description}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${testId}: ${description}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  UFUGAJI UPDATE — V1.10A-CORRECTIVE-7 TEST SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // BLOCK A: MAIN ACTIVATION & IMMEDIATE SUBSCRIBER NOTIFICATION
  // --------------------------------------------------------------------------
  console.log('--- Block A: Main Activation & Subscriber Sync ---');
  const sellerA = `seller_sync_a_${Date.now()}`;
  let mainUiStateA: SellerMonetizationRecord | null = null;

  // Simulate Main UI component subscribing to seller monetization state
  const unsubscribeA = subscribeToSellerMonetization(sellerA, (updated) => {
    mainUiStateA = updated;
  });

  assert('Block A.1', mainUiStateA !== null && (mainUiStateA as SellerMonetizationRecord).status === 'NOT_ACTIVATED', 'Main UI receives initial NOT_ACTIVATED state');

  // Execute activation via Main CTA
  const resA = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerA,
    sellerProfileId: `shop_${sellerA}`,
    entryPoint: 'SELLER_MAIN_CTA'
  });

  assert('Block A.2', resA.success === true, 'Activation command succeeds');
  assert('Block A.3', resA.record.status === 'TRIAL_ACTIVE', 'Server returns TRIAL_ACTIVE');
  assert('Block A.4', mainUiStateA !== null && (mainUiStateA as SellerMonetizationRecord).status === 'TRIAL_ACTIVE', 'Main UI subscriber immediately updated to TRIAL_ACTIVE without manual refresh');

  unsubscribeA();

  // --------------------------------------------------------------------------
  // BLOCK B: CATALOGUES ACTIVATION SYNCHRONIZES MAIN UI
  // --------------------------------------------------------------------------
  console.log('\n--- Block B: Catalogues Activation Synchronizes Main UI ---');
  const sellerB = `seller_sync_b_${Date.now()}`;
  let mainUiStateB: SellerMonetizationRecord | null = null;

  // Main UI component subscribes
  const unsubscribeB = subscribeToSellerMonetization(sellerB, (updated) => {
    mainUiStateB = updated;
  });
  assert('Block B.1', mainUiStateB !== null && (mainUiStateB as SellerMonetizationRecord).status === 'NOT_ACTIVATED', 'Main UI starts at NOT_ACTIVATED');

  // Activation occurs through Entry Point B: Catalogues
  const resB = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerB,
    sellerProfileId: `shop_${sellerB}`,
    entryPoint: 'CATALOGUE_CTA'
  });

  assert('Block B.2', resB.success === true, 'Catalogues activation command succeeds');
  assert('Block B.3', (mainUiStateB as any)?.status === 'TRIAL_ACTIVE', 'Main UI immediately reflects TRIAL_ACTIVE when activated from Catalogues');
  assert('Block B.4', canSellerSellOnMarketplace(sellerB).canSell === true, 'Commercial access unlocks for seller');

  const notifsB = getLocalCachedNotifications(sellerB).filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Block B.5', notifsB.length === 1, 'Exactly one trial notification generated');

  unsubscribeB();

  // --------------------------------------------------------------------------
  // BLOCK C: WEKA BIDHAA MPYA ACTIVATION SYNCHRONIZES MAIN UI
  // --------------------------------------------------------------------------
  console.log('\n--- Block C: Weka Bidhaa Mpya Activation Synchronizes Main UI ---');
  const sellerC = `seller_sync_c_${Date.now()}`;
  let mainUiStateC: SellerMonetizationRecord | null = null;

  const unsubscribeC = subscribeToSellerMonetization(sellerC, (updated) => {
    mainUiStateC = updated;
  });

  // Activation occurs through Entry Point C: Weka Bidhaa Mpya (CREATE_LISTING)
  const resC = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerC,
    sellerProfileId: `shop_${sellerC}`,
    entryPoint: 'CREATE_LISTING'
  });

  assert('Block C.1', resC.success === true, 'Weka Bidhaa Mpya activation succeeds');
  assert('Block C.2', (mainUiStateC as any)?.status === 'TRIAL_ACTIVE', 'Main UI immediately reflects TRIAL_ACTIVE when activated from Weka Bidhaa Mpya');
  assert('Block C.3', canSellerSellOnMarketplace(sellerC).canSell === true, 'Product creation gate unlocked');

  unsubscribeC();

  // --------------------------------------------------------------------------
  // BLOCK D: DUKA (WASHA DUKA) ACTIVATION SYNCHRONIZES MAIN UI
  // --------------------------------------------------------------------------
  console.log('\n--- Block D: Duka (Washa Duka) Activation Synchronizes Main UI ---');
  const sellerD = `seller_sync_d_${Date.now()}`;
  let mainUiStateD: SellerMonetizationRecord | null = null;

  const unsubscribeD = subscribeToSellerMonetization(sellerD, (updated) => {
    mainUiStateD = updated;
  });

  // Activation occurs through Entry Point D: Duka (SHOP_PUBLISH_CTA)
  const resD = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerD,
    sellerProfileId: `shop_${sellerD}`,
    entryPoint: 'SHOP_PUBLISH_CTA'
  });

  assert('Block D.1', resD.success === true, 'Duka publish activation succeeds');
  assert('Block D.2', (mainUiStateD as any)?.status === 'TRIAL_ACTIVE', 'Main UI immediately reflects TRIAL_ACTIVE when activated from Duka');

  // Verify Shop Eligibility
  const sampleShopD: DigitalShop = {
    shopId: `shop_${sellerD}`,
    sellerId: sellerD,
    shopName: 'Shamba Bora',
    description: 'Duka la mfano',
    location: 'Arusha Mjini',
    region: 'Arusha',
    district: 'Arusha Mjini',
    phone: '0712345678',
    whatsapp: '0712345678',
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  assert('Block D.3', isShopMarketplaceEligible(sampleShopD) === true, 'Shop is eligible on marketplace following activation');

  unsubscribeD();

  // --------------------------------------------------------------------------
  // BLOCK E: WEKA TANGAZO LA BIDHAA (MARKET BANNER) SYNCHRONIZES MAIN UI
  // --------------------------------------------------------------------------
  console.log('\n--- Block E: Weka Tangazo (Market Banner) Synchronizes Main UI ---');
  const sellerE = `seller_sync_e_${Date.now()}`;
  let mainUiStateE: SellerMonetizationRecord | null = null;

  const unsubscribeE = subscribeToSellerMonetization(sellerE, (updated) => {
    mainUiStateE = updated;
  });

  // Activation occurs through Entry Point E: Market top banner (WEKA_TANGAZO_CTA)
  const resE = sellerMonetizationService.activateFirstMonthFreeTrial({
    sellerUserId: sellerE,
    sellerProfileId: `shop_${sellerE}`,
    entryPoint: 'WEKA_TANGAZO_CTA'
  });

  assert('Block E.1', resE.success === true, 'Market banner activation succeeds');
  assert('Block E.2', (mainUiStateE as any)?.status === 'TRIAL_ACTIVE', 'Main UI immediately reflects TRIAL_ACTIVE when activated from Market banner');
  assert('Block E.3', canSellerSellOnMarketplace(sellerE).canSell === true, 'Commercial access fully unlocked');

  unsubscribeE();

  // --------------------------------------------------------------------------
  // BLOCK F: CROSS-ROUTE PERSISTENCE (ALL CONSUMERS SEE UNIFIED STATE)
  // --------------------------------------------------------------------------
  console.log('\n--- Block F: Cross-Route Persistence ---');
  // Reading from different consumer perspectives for sellerE
  const recordMain = sellerMonetizationService.getSellerRecord(sellerE);
  const recordCatalogues = sellerMonetizationService.getSellerRecord(sellerE);
  const recordProductModal = sellerMonetizationService.getSellerRecord(sellerE);
  const recordShopView = sellerMonetizationService.getSellerRecord(sellerE);

  assert('Block F.1', recordMain.status === 'TRIAL_ACTIVE', 'Main view reads TRIAL_ACTIVE');
  assert('Block F.2', recordCatalogues.status === 'TRIAL_ACTIVE', 'Catalogues view reads TRIAL_ACTIVE');
  assert('Block F.3', recordProductModal.status === 'TRIAL_ACTIVE', 'Product modal reads TRIAL_ACTIVE');
  assert('Block F.4', recordShopView.status === 'TRIAL_ACTIVE', 'Shop view reads TRIAL_ACTIVE');

  // --------------------------------------------------------------------------
  // BLOCK G: REFRESH SIMULATION RESTORES PERSISTED AUTHORITATIVE STATE
  // --------------------------------------------------------------------------
  console.log('\n--- Block G: Refresh Simulation ---');
  // Re-read after simulated fresh consumer subscription
  let freshMountState: SellerMonetizationRecord | null = null;
  const unsubFresh = subscribeToSellerMonetization(sellerE, (rec) => {
    freshMountState = rec;
  });

  assert('Block G.1', freshMountState !== null && (freshMountState as any).status === 'TRIAL_ACTIVE', 'Freshly mounted component immediately receives TRIAL_ACTIVE');
  assert('Block G.2', (freshMountState as any).hasHadTrial === true, 'hasHadTrial remains true');
  assert('Block G.3', Boolean((freshMountState as any).trialEndAt), 'trialEndAt is preserved');

  unsubFresh();

  // --------------------------------------------------------------------------
  // BLOCK H: REGRESSION INVARIANTS & INTEGRATION DEFENSE
  // --------------------------------------------------------------------------
  console.log('\n--- Block H: Regression Invariants ---');
  // 1. One notification only
  const allNotifsE = getLocalCachedNotifications(sellerE).filter((n) => n.type === 'SELLER_TRIAL_STARTED');
  assert('Block H.1', allNotifsE.length === 1, 'Only one trial notification created');

  // 2. Anti-replay
  sellerMonetizationService.simulateGracePeriod(sellerE, 'admin');
  assert('Block H.2', sellerMonetizationService.getSellerRecord(sellerE).status === 'GRACE_PERIOD', 'Transitions to GRACE_PERIOD');

  let replayBlocked = false;
  try {
    sellerMonetizationService.activateFirstMonthFreeTrial({
      sellerUserId: sellerE,
      entryPoint: 'CATALOGUE_CTA'
    });
  } catch {
    replayBlocked = true;
  }
  assert('Block H.3', replayBlocked === true, 'Free trial cannot be replayed from GRACE_PERIOD');

  // 3. Monotonic protection: cannot fall back to NOT_ACTIVATED
  assert('Block H.4', sellerMonetizationService.getSellerRecord(sellerE).status === 'GRACE_PERIOD', 'Record does not fall back to NOT_ACTIVATED');

  console.log('\n================================================================');
  console.log(`  V1.10A-CORRECTIVE-7 SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
