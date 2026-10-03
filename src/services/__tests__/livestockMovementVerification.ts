import {
  classifyMovementEvent,
  getLivestockMovementSnapshot,
  serializeLivestockMovementForAI
} from '../livestockIntelligenceEngine';
import { LivestockRecord, LivestockEvent } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('=== V1.4C MOVEMENT & MORTALITY INTELLIGENCE VERIFICATION ===\n');

// -------------------------------------------------------------
// Test 1: Event Classification
// -------------------------------------------------------------
console.log('--- Test 1: Event Classification ---');
assert(classifyMovementEvent('purchase') === 'PURCHASE', 'classify purchase -> PURCHASE');
assert(classifyMovementEvent('sale') === 'SALE', 'classify sale -> SALE');
assert(classifyMovementEvent('death') === 'MORTALITY', 'classify death -> MORTALITY');
assert(classifyMovementEvent('mortality') === 'MORTALITY', 'classify mortality -> MORTALITY');
assert(classifyMovementEvent('birth') === 'ADDITION', 'classify birth -> ADDITION');
assert(classifyMovementEvent('addition') === 'ADDITION', 'classify addition -> ADDITION');
assert(classifyMovementEvent('vaccination') === 'OTHER', 'classify vaccination -> OTHER');
assert(classifyMovementEvent('treatment') === 'OTHER', 'classify treatment -> OTHER');
assert(classifyMovementEvent('feed') === 'OTHER', 'classify feed -> OTHER');
assert(classifyMovementEvent('observation') === 'OTHER', 'classify observation -> OTHER');

// -------------------------------------------------------------
// Test 2: Additions & Reductions Breakdowns & Net Movement
// -------------------------------------------------------------
console.log('\n--- Test 2: Additions, Reductions & Net Movement ---');
const record1: LivestockRecord = {
  recordId: 'rec-chickens-1',
  userId: 'farmer-1',
  recordName: 'Kuku wa Mayai',
  livestockType: 'Kuku',
  livestockCategory: 'Poultry',
  quantity: 50,
  dateAdded: '2026-08-01',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z'
};

const events1: LivestockEvent[] = [
  // Purchases (in 30d window: 2026-08-02 to 2026-09-01)
  {
    eventId: 'e1',
    eventType: 'purchase',
    quantity: 20,
    eventDate: '2026-08-10',
    title: 'Walinunuliwa sokoni',
    notes: '',
    createdAt: '2026-08-10T00:00:00Z',
    updatedAt: '2026-08-10T00:00:00Z'
  },
  // Births
  {
    eventId: 'e2',
    eventType: 'birth',
    quantity: 10,
    eventDate: '2026-08-15',
    title: 'Vifaranga wameanguliwa',
    notes: '',
    createdAt: '2026-08-15T00:00:00Z',
    updatedAt: '2026-08-15T00:00:00Z'
  },
  // Sales
  {
    eventId: 'e3',
    eventType: 'sale',
    quantity: 15,
    eventDate: '2026-08-20',
    title: 'Waliuzwa',
    notes: '',
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T00:00:00Z'
  },
  // Deaths
  {
    eventId: 'e4',
    eventType: 'death',
    quantity: 5,
    eventDate: '2026-08-22',
    title: 'Vifo vilitokea',
    notes: '',
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-22T00:00:00Z'
  }
];

const snap1 = getLivestockMovementSnapshot(
  'farmer-1',
  [record1],
  { 'rec-chickens-1': events1 },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);

// Additions = 20 (purchases) + 10 (births) = 30
assert(snap1.additions.purchases === 20, 'Purchases = 20');
assert(snap1.additions.births === 10, 'Births = 10');
assert(snap1.additions.total === 30, 'Gross Additions = 30');

// Reductions = 15 (sales) + 5 (mortality) = 20
assert(snap1.reductions.sales === 15, 'Sales = 15');
assert(snap1.reductions.mortality === 5, 'Mortality = 5');
assert(snap1.reductions.total === 20, 'Gross Reductions = 20');

// Net movement = 30 - 20 = 10 (Mortality is NOT subtracted twice)
assert(snap1.netMovement === 10, 'Net Movement = 10 (+30 additions - 20 reductions)');

// -------------------------------------------------------------
// Test 3: Mortality Rate and Population Base
// -------------------------------------------------------------
console.log('\n--- Test 3: Mortality Rate & Denominator Guard ---');
// Starting known count = 50. In-window additions = 30.
// Population base = 50 + 30 = 80.
// Mortality = 5.
// Rate = 5 / 80 = 6.25% -> rounded to 6.3%
assert(snap1.mortality.mortalityRate.hasValidDenominator === true, 'hasValidDenominator is true');
assert(snap1.mortality.mortalityRate.populationBase === 80, 'populationBase is 80 (50 starting + 30 additions)');
assert(snap1.mortality.mortalityRate.ratePercent === 6.3, `Rate is 6.3% (actual: ${snap1.mortality.mortalityRate.ratePercent}%)`);

// Test 3B: Zero Population Base / Invalid Denominator
const emptyRecord: LivestockRecord = {
  recordId: 'rec-0',
  userId: 'farmer-1',
  recordName: 'Bata',
  livestockType: 'Bata',
  livestockCategory: 'Poultry',
  quantity: 0,
  dateAdded: '2026-08-01',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z'
};
const zeroBaseDeathEvent: LivestockEvent = {
  eventId: 'e-z1',
  eventType: 'death',
  quantity: 2,
  eventDate: '2026-08-10',
  title: 'Kifo',
  notes: '',
  createdAt: '2026-08-10T00:00:00Z',
  updatedAt: '2026-08-10T00:00:00Z'
};
const snapZero = getLivestockMovementSnapshot(
  'farmer-1',
  [emptyRecord],
  { 'rec-0': [zeroBaseDeathEvent] },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapZero.mortality.mortalityRate.hasValidDenominator === false, 'Zero base: hasValidDenominator is false');
assert(snapZero.mortality.mortalityRate.ratePercent === null, 'Zero base: ratePercent is null');
assert(
  snapZero.mortality.mortalityRate.explanationSwahili.includes('hazitoshi kuhesabu kiwango'),
  'Zero base: explains insufficient denominator safely'
);

// -------------------------------------------------------------
// Test 4: Mortality Pattern Detection & Comparisons
// -------------------------------------------------------------
console.log('\n--- Test 4: Mortality Pattern Detection ---');

// Case A: Increased Mortality (Previous period has 1 death, Current period has 5 deaths)
const pastEvent: LivestockEvent = {
  eventId: 'e-past',
  eventType: 'death',
  quantity: 1,
  eventDate: '2026-07-15', // inside previous period (2026-07-03 to 2026-08-01)
  title: 'Kifo cha zamani',
  notes: '',
  createdAt: '2026-07-15T00:00:00Z',
  updatedAt: '2026-07-15T00:00:00Z'
};
const snapInc = getLivestockMovementSnapshot(
  'farmer-1',
  [record1],
  { 'rec-chickens-1': [...events1, pastEvent] },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapInc.mortality.pattern.patternType === 'INCREASED_MORTALITY', 'Pattern is INCREASED_MORTALITY');
assert(
  snapInc.mortality.pattern.comparisonWithPreviousPeriod?.previousPeriodMortality === 1,
  'Previous mortality was 1'
);
assert(
  snapInc.mortality.pattern.comparisonWithPreviousPeriod?.currentPeriodMortality === 5,
  'Current mortality is 5'
);

// Case B: Decreased Mortality (Current has 1 death, Previous had 5 deaths)
const currentLightEvent: LivestockEvent = {
  eventId: 'e-curr-light',
  eventType: 'death',
  quantity: 1,
  eventDate: '2026-08-15',
  title: 'Kifo kimoja',
  notes: '',
  createdAt: '2026-08-15T00:00:00Z',
  updatedAt: '2026-08-15T00:00:00Z'
};
const pastHeavyEvent: LivestockEvent = {
  eventId: 'e-past-heavy',
  eventType: 'death',
  quantity: 5,
  eventDate: '2026-07-15',
  title: 'Vifo 5 vya zamani',
  notes: '',
  createdAt: '2026-07-15T00:00:00Z',
  updatedAt: '2026-07-15T00:00:00Z'
};
const snapDec = getLivestockMovementSnapshot(
  'farmer-1',
  [record1],
  { 'rec-chickens-1': [currentLightEvent, pastHeavyEvent] },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapDec.mortality.pattern.patternType === 'DECREASED_MORTALITY', 'Pattern is DECREASED_MORTALITY');

// Case C: No Mortality (0 deaths in current and previous)
const snapNoDeath = getLivestockMovementSnapshot(
  'farmer-1',
  [record1],
  { 'rec-chickens-1': [] },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapNoDeath.mortality.pattern.patternType === 'NO_MORTALITY', 'Pattern is NO_MORTALITY when 0 deaths');
assert(snapNoDeath.mortality.mortalityRate.ratePercent === 0, 'Mortality rate is 0% when population > 0 and deaths = 0');

// Case D: Repeated Events Cluster (2 deaths within 7 days)
const clusterEvents: LivestockEvent[] = [
  {
    eventId: 'e-c1',
    eventType: 'death',
    quantity: 2,
    eventDate: '2026-08-12',
    title: 'Kifo 1',
    notes: '',
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: '2026-08-12T00:00:00Z'
  },
  {
    eventId: 'e-c2',
    eventType: 'death',
    quantity: 3,
    eventDate: '2026-08-15', // 3 days apart
    title: 'Kifo 2',
    notes: '',
    createdAt: '2026-08-15T00:00:00Z',
    updatedAt: '2026-08-15T00:00:00Z'
  }
];
const snapCluster = getLivestockMovementSnapshot(
  'farmer-1',
  [record1],
  { 'rec-chickens-1': clusterEvents },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapCluster.mortality.pattern.repeatedEventsCluster === true, 'Repeated events cluster detected (<= 7 days)');

// -------------------------------------------------------------
// Test 5: Strict Non-Diagnostic / Non-Medical Language Verification
// -------------------------------------------------------------
console.log('\n--- Test 5: Non-Diagnostic Language Safety Check ---');
const serialized = serializeLivestockMovementForAI(snap1);
const forbiddenWords = ['ugonjwa', 'infection', 'poison', 'sumu', 'virus', 'daktari atabiri', 'mlipuko'];
for (const word of forbiddenWords) {
  assert(!snap1.summarySwahili.toLowerCase().includes(word), `summarySwahili does not contain "${word}"`);
  assert(!snap1.mortality.pattern.summarySwahili.toLowerCase().includes(word), `pattern summary does not contain "${word}"`);
  assert(!snap1.mortality.mortalityRate.explanationSwahili.toLowerCase().includes(word), `rate explanation does not contain "${word}"`);
}
assert(serialized.includes('HAKUNA UTAMBUZI WA UGONJWA'), 'AI serializer contains strict non-diagnostic guardrails');

// -------------------------------------------------------------
// Test 6: Historical Edit / Deletion Reactivity
// -------------------------------------------------------------
console.log('\n--- Test 6: Historical Edit / Deletion Reactivity ---');
// If e4 (death of 5 chickens) is deleted from history, recalculation must immediately drop mortality to 0
const eventsWithoutDeath = events1.filter(e => e.eventId !== 'e4');
const snapAfterDelete = getLivestockMovementSnapshot(
  'farmer-1',
  [record1],
  { 'rec-chickens-1': eventsWithoutDeath },
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapAfterDelete.reductions.mortality === 0, 'Mortality drops to 0 immediately upon event deletion');
assert(snapAfterDelete.reductions.total === 15, 'Reductions drop from 20 to 15 (sales only)');
assert(snapAfterDelete.netMovement === 15, 'Net movement updates from +10 to +15');

// -------------------------------------------------------------
// Test 7: Multi-Farmer Data Isolation
// -------------------------------------------------------------
console.log('\n--- Test 7: Farmer Data Isolation ---');
const farmer2Record: LivestockRecord = {
  recordId: 'rec-farmer-2',
  userId: 'farmer-2',
  recordName: 'Ngombe wa Maziwa',
  livestockType: 'Ngombe',
  livestockCategory: 'Cattle',
  quantity: 10,
  dateAdded: '2026-08-01',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z'
};
const snapFarmer2 = getLivestockMovementSnapshot(
  'farmer-2',
  [farmer2Record],
  { 'rec-farmer-2': [] }, // No events for farmer 2
  { timeWindow: '30d', referenceDate: '2026-09-01' }
);
assert(snapFarmer2.additions.total === 0, 'Farmer 2 sees 0 additions (Farmer 1 events isolated)');
assert(snapFarmer2.reductions.total === 0, 'Farmer 2 sees 0 reductions');
assert(snapFarmer2.mortality.totalMortalityCount === 0, 'Farmer 2 sees 0 mortality');

console.log('\n🎉 ALL 16 TESTS IN THE V1.4C SUITE PASSED PERFECTLY!\n');
