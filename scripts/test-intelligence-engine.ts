/**
 * V1.4A — Intelligence Engine 16 Scenarios Validation Test Suite
 * Validates deterministic behavior, data coverage, non-invention, isolation, and regression.
 */

import {
  getLivestockIntelligenceSnapshot,
  serializeIntelligenceSnapshotForAI,
  calculateDataCoverage
} from '../src/services/livestockIntelligenceEngine';
import { calculateLivestockBalance, sortEventsChronologicallyDesc } from '../src/utils/livestockBalance';
import { LivestockRecord, LivestockEvent, EventType } from '../src/types';

function createMockRecord(overrides: Partial<LivestockRecord> & { recordId: string; livestockCategory: string; livestockType: string; quantity: number }): LivestockRecord {
  return {
    userId: 'default_user',
    dateAdded: '2026-01-01',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
    notes: '',
    ...overrides
  };
}

function createMockEvent(overrides: Partial<LivestockEvent> & { eventId: string; eventType: EventType; eventDate: string }): LivestockEvent {
  return {
    quantity: null,
    title: '',
    notes: '',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
    ...overrides
  };
}

function runTests() {
  console.log('================================================================');
  console.log('  RUNNING 16 V1.4A INTELLIGENCE ENGINE VALIDATION SCENARIOS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] Scenario ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Scenario ${name}: ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // --- Scenario 1: Empty Farm ---
  {
    const emptyRecords: LivestockRecord[] = [];
    const emptyEvents: Record<string, LivestockEvent[]> = {};
    const snapshot = getLivestockIntelligenceSnapshot('farmer_empty', emptyRecords, emptyEvents);

    const ok =
      snapshot.totalLivestock === 0 &&
      snapshot.totalRecords === 0 &&
      snapshot.emptyState.isEmpty === true &&
      snapshot.dataCoverage.sufficiency === 'INSUFFICIENT' &&
      snapshot.observations.length === 1 &&
      snapshot.observations[0].category === 'SUMMARY';
    assert(ok, '1: Empty Farm', `Expected INSUFFICIENT, isEmpty=true, category=SUMMARY`);
  }

  // --- Scenario 2: Additions Only ---
  {
    const record = createMockRecord({
      recordId: 'rec_broilers',
      userId: 'farmer_add',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Nyama (Broilers)',
      quantity: 100
    });
    const events: LivestockEvent[] = [
      createMockEvent({
        eventId: 'evt_birth_1',
        eventType: 'birth',
        quantity: 20,
        eventDate: '2026-01-10'
      }),
      createMockEvent({
        eventId: 'evt_purchase_1',
        eventType: 'purchase',
        quantity: 30,
        eventDate: '2026-01-15'
      })
    ];

    const snapshot = getLivestockIntelligenceSnapshot('farmer_add', [record], { [record.recordId]: events });
    const ok =
      snapshot.totalStartingLivestock === 100 &&
      snapshot.totalLivestock === 150 &&
      snapshot.recentActivity.additions === 50 &&
      snapshot.recentActivity.reductions === 0 &&
      snapshot.totalNetChange === 50;
    assert(ok, '2: Additions Only', `Expected 150 current, 50 additions; got total=${snapshot.totalLivestock}`);
  }

  // --- Scenario 3: Reductions Only ---
  {
    const record = createMockRecord({
      recordId: 'rec_layers',
      userId: 'farmer_red',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Mayai (Layers)',
      quantity: 100
    });
    const events: LivestockEvent[] = [
      createMockEvent({
        eventId: 'evt_death_1',
        eventType: 'death',
        quantity: 10,
        eventDate: '2026-01-05'
      }),
      createMockEvent({
        eventId: 'evt_sale_1',
        eventType: 'sale',
        quantity: 15,
        eventDate: '2026-01-10'
      }),
      createMockEvent({
        eventId: 'evt_slaughter_1',
        eventType: 'sale',
        quantity: 5,
        eventDate: '2026-01-15',
        title: 'Kuchinjwa kwa kitoweo'
      })
    ];

    const snapshot = getLivestockIntelligenceSnapshot('farmer_red', [record], { [record.recordId]: events });
    const ok =
      snapshot.totalLivestock === 70 &&
      snapshot.recentActivity.reductions === 30 &&
      snapshot.recentActivity.mortality === 10 &&
      snapshot.totalNetChange === -30;
    assert(ok, '3: Reductions Only', `Expected 70 current, 30 reductions; got total=${snapshot.totalLivestock}, reductions=${snapshot.recentActivity.reductions}`);
  }

  // --- Scenario 4: Mortality Pattern Analysis ---
  {
    const record = createMockRecord({
      recordId: 'rec_mortality',
      userId: 'farmer_mort',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Kienyeji',
      quantity: 100
    });
    const events: LivestockEvent[] = [
      createMockEvent({
        eventId: 'evt_d1',
        eventType: 'death',
        quantity: 5,
        eventDate: '2026-01-05',
        notes: 'Homa'
      }),
      createMockEvent({
        eventId: 'evt_d2',
        eventType: 'death',
        quantity: 3,
        eventDate: '2026-01-12',
        notes: 'Kuharisha'
      })
    ];

    const snapshot = getLivestockIntelligenceSnapshot('farmer_mort', [record], { [record.recordId]: events });
    const mortObs = snapshot.observations.find((o) => o.category === 'MORTALITY');
    const ok =
      snapshot.recentActivity.mortality === 8 &&
      snapshot.totalLivestock === 92 &&
      mortObs !== undefined &&
      mortObs.dataBacked === true;
    assert(ok, '4: Mortality Pattern Analysis', `Expected 8 mortality; got ${snapshot.recentActivity.mortality}`);
  }

  // --- Scenario 5: Vaccination History ---
  {
    const record = createMockRecord({
      recordId: 'rec_dairy',
      userId: 'farmer_vax',
      livestockCategory: 'Cattle',
      livestockType: "Ng'ombe wa Maziwa",
      quantity: 50
    });
    const events: LivestockEvent[] = [
      createMockEvent({
        eventId: 'evt_vax_1',
        eventType: 'vaccination',
        quantity: 50,
        eventDate: '2026-01-15',
        title: 'Chanjo ya Kimeta (Anthrax)'
      }),
      createMockEvent({
        eventId: 'evt_vax_2',
        eventType: 'vaccination',
        quantity: 50,
        eventDate: '2026-02-15',
        title: 'Chanjo ya Ndigana (ECF)'
      })
    ];

    const snapshot = getLivestockIntelligenceSnapshot('farmer_vax', [record], { [record.recordId]: events });
    const vaxObs = snapshot.observations.find((o) => o.category === 'VACCINATION');
    const ok =
      snapshot.recentActivity.vaccinations === 2 &&
      vaxObs !== undefined &&
      vaxObs.title === 'Chanjo Zilizorekodiwa';
    assert(ok, '5: Vaccination History', `Expected 2 vax events; got ${snapshot.recentActivity.vaccinations}`);
  }

  // --- Scenario 6: Treatment History ---
  {
    const record = createMockRecord({
      recordId: 'rec_goats',
      userId: 'farmer_treat',
      livestockCategory: 'Goats',
      livestockType: 'Mbuzi wa Maziwa',
      quantity: 20
    });
    const events: LivestockEvent[] = [
      createMockEvent({
        eventId: 'evt_treat_1',
        eventType: 'treatment',
        quantity: 4,
        eventDate: '2026-01-20',
        title: 'Matibabu ya Nimonia',
        notes: 'Sindano ya Oxytetracycline siku 3'
      })
    ];

    const snapshot = getLivestockIntelligenceSnapshot('farmer_treat', [record], { [record.recordId]: events });
    const treatObs = snapshot.observations.find((o) => o.category === 'TREATMENT');
    const ok =
      snapshot.recentActivity.treatments === 1 &&
      treatObs !== undefined &&
      treatObs.title === 'Matibabu Yaliyorekodiwa';
    assert(ok, '6: Treatment History', `Expected 1 treatment event; got ${snapshot.recentActivity.treatments}`);
  }

  // --- Scenario 7: Date Ordering ---
  {
    const events: LivestockEvent[] = [
      createMockEvent({ eventId: 'e2', eventType: 'vaccination', eventDate: '2026-02-15', quantity: 50 }),
      createMockEvent({ eventId: 'e1', eventType: 'birth', eventDate: '2026-01-10', quantity: 10 }),
      createMockEvent({ eventId: 'e3', eventType: 'death', eventDate: '2026-03-01', quantity: 2 })
    ];

    const sorted = sortEventsChronologicallyDesc(events);
    const ok =
      sorted[0].eventDate === '2026-03-01' &&
      sorted[1].eventDate === '2026-02-15' &&
      sorted[2].eventDate === '2026-01-10';
    assert(ok, '7: Date Ordering', `Expected descending order: 2026-03-01, 2026-02-15, 2026-01-10`);
  }

  // --- Scenario 8: Historical Correction ---
  {
    const record = createMockRecord({
      recordId: 'rec_corr',
      userId: 'farmer_corr',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Nyama',
      quantity: 100
    });
    const eventV1 = createMockEvent({
      eventId: 'evt_vifo',
      eventType: 'death',
      quantity: 10,
      eventDate: '2026-01-15'
    });

    const snap1 = getLivestockIntelligenceSnapshot('farmer_corr', [record], { [record.recordId]: [eventV1] });
    const eventV2 = createMockEvent({
      eventId: 'evt_vifo',
      eventType: 'death',
      quantity: 4,
      eventDate: '2026-01-15'
    });
    const snap2 = getLivestockIntelligenceSnapshot('farmer_corr', [record], { [record.recordId]: [eventV2] });

    const ok = snap1.totalLivestock === 90 && snap2.totalLivestock === 96 && snap2.recentActivity.mortality === 4;
    assert(ok, '8: Historical Correction', `After correction, expected 96 livestock and 4 deaths`);
  }

  // --- Scenario 9: Deletion of Event ---
  {
    const record = createMockRecord({
      recordId: 'rec_del',
      userId: 'farmer_del',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Mayai',
      quantity: 50
    });
    const event1 = createMockEvent({ eventId: 'e1', eventType: 'sale', quantity: 10, eventDate: '2026-01-10' });
    const event2 = createMockEvent({ eventId: 'e2', eventType: 'birth', quantity: 15, eventDate: '2026-01-15' });

    const snapBefore = getLivestockIntelligenceSnapshot('farmer_del', [record], { [record.recordId]: [event1, event2] });
    const snapAfter = getLivestockIntelligenceSnapshot('farmer_del', [record], { [record.recordId]: [event2] });

    const ok = snapBefore.totalLivestock === 55 && snapAfter.totalLivestock === 65 && snapAfter.recentActivity.reductions === 0;
    assert(ok, '9: Deletion of Event', `Expected total to jump from 55 to 65 after deletion`);
  }

  // --- Scenario 10: Record Baseline Update ---
  {
    const recordV1 = createMockRecord({
      recordId: 'rec_base',
      userId: 'farmer_base',
      livestockCategory: 'Cattle',
      livestockType: "Ng'ombe wa Maziwa",
      quantity: 10
    });
    const event = createMockEvent({ eventId: 'e1', eventType: 'birth', quantity: 2, eventDate: '2026-01-15' });

    const snap1 = getLivestockIntelligenceSnapshot('farmer_base', [recordV1], { [recordV1.recordId]: [event] });
    const recordV2 = { ...recordV1, quantity: 14 };
    const snap2 = getLivestockIntelligenceSnapshot('farmer_base', [recordV2], { [recordV2.recordId]: [event] });

    const ok = snap1.totalLivestock === 12 && snap2.totalLivestock === 16;
    assert(ok, '10: Record Baseline Update', `Expected total to update from 12 to 16`);
  }

  // --- Scenario 11: Multiple Livestock Types ---
  {
    const records: LivestockRecord[] = [
      createMockRecord({ recordId: 'c1', userId: 'farmer_multi', livestockCategory: 'Cattle', livestockType: "Ng'ombe wa Maziwa", quantity: 10 }),
      createMockRecord({ recordId: 'p1', userId: 'farmer_multi', livestockCategory: 'Poultry', livestockType: 'Kuku wa Kienyeji', quantity: 100 }),
      createMockRecord({ recordId: 'g1', userId: 'farmer_multi', livestockCategory: 'Goats', livestockType: 'Mbuzi wa Nyama', quantity: 25 })
    ];
    const events: Record<string, LivestockEvent[]> = {
      p1: [createMockEvent({ eventId: 'pe1', eventType: 'death', quantity: 5, eventDate: '2026-01-10' })],
      c1: [createMockEvent({ eventId: 'ce1', eventType: 'vaccination', quantity: 10, eventDate: '2026-01-12' })]
    };

    const snapshot = getLivestockIntelligenceSnapshot('farmer_multi', records, events);
    const cattleType = snapshot.livestockByType.find(t => t.livestockType.includes("Ng'ombe"));
    const poultryType = snapshot.livestockByType.find(t => t.livestockType.includes('Kuku'));
    const goatsType = snapshot.livestockByType.find(t => t.livestockType.includes('Mbuzi'));

    const ok =
      snapshot.totalRecords === 3 &&
      snapshot.totalStartingLivestock === 135 &&
      snapshot.totalLivestock === 130 &&
      poultryType?.currentQuantity === 95 &&
      poultryType?.mortality === 5 &&
      cattleType?.currentQuantity === 10 &&
      cattleType?.vaccinations === 1 &&
      goatsType?.currentQuantity === 25;
    assert(ok, '11: Multiple Livestock Types', `Clean segregation verified.`);
  }

  // --- Scenario 12: Data Insufficiency Assessment ---
  {
    const r0: LivestockRecord[] = [];
    const cov0 = calculateDataCoverage(r0, {});

    const r1: LivestockRecord[] = [createMockRecord({ recordId: 'r1', userId: 'u', livestockCategory: 'Poultry', livestockType: 'Kuku', quantity: 10 })];
    const cov1 = calculateDataCoverage(r1, {
      r1: [createMockEvent({ eventId: 'e1', eventType: 'birth', quantity: 1, eventDate: '2026-01-02' })]
    });

    const r2: LivestockRecord[] = [
      createMockRecord({ recordId: 'r1', userId: 'u', livestockCategory: 'Poultry', livestockType: 'Kuku', quantity: 10 }),
      createMockRecord({ recordId: 'r2', userId: 'u', livestockCategory: 'Cattle', livestockType: "Ng'ombe", quantity: 5 })
    ];
    const evtsSufficient: Record<string, LivestockEvent[]> = {
      r1: [
        createMockEvent({ eventId: 'e1', eventType: 'vaccination', eventDate: '2026-01-05' }),
        createMockEvent({ eventId: 'e2', eventType: 'birth', quantity: 2, eventDate: '2026-01-15' }),
        createMockEvent({ eventId: 'e3', eventType: 'death', quantity: 1, eventDate: '2026-01-25' }),
        createMockEvent({ eventId: 'e4', eventType: 'sale', quantity: 1, eventDate: '2026-02-05' })
      ]
    };
    const cov2 = calculateDataCoverage(r2, evtsSufficient);

    const ok =
      cov0.sufficiency === 'INSUFFICIENT' &&
      cov1.sufficiency === 'LIMITED' &&
      cov2.sufficiency === 'SUFFICIENT';
    assert(ok, '12: Data Insufficiency Assessment', `Expected INSUFFICIENT, LIMITED, SUFFICIENT`);
  }

  // --- Scenario 13: Farmer Isolation ---
  {
    const farmerA_rec: LivestockRecord[] = [
      createMockRecord({ recordId: 'rec_A', userId: 'farmer_A', livestockCategory: 'Cattle', livestockType: "Ng'ombe", quantity: 10 })
    ];
    const farmerB_rec: LivestockRecord[] = [
      createMockRecord({ recordId: 'rec_B', userId: 'farmer_B', livestockCategory: 'Poultry', livestockType: 'Kuku', quantity: 200 })
    ];

    const snapA = getLivestockIntelligenceSnapshot('farmer_A', farmerA_rec, {});
    const snapB = getLivestockIntelligenceSnapshot('farmer_B', farmerB_rec, {});

    const ok =
      snapA.uid === 'farmer_A' &&
      snapA.totalLivestock === 10 &&
      snapB.uid === 'farmer_B' &&
      snapB.totalLivestock === 200 &&
      !snapA.livestockByType.some(g => g.livestockType.includes('Kuku')) &&
      !snapB.livestockByType.some(g => g.livestockType.includes("Ng'ombe"));
    assert(ok, '13: Farmer Isolation', `Farmer A and B data isolated cleanly.`);
  }

  // --- Scenario 14: AI Separation & Prompt Serialization ---
  {
    const record = createMockRecord({
      recordId: 'rec_ai',
      userId: 'farmer_ai',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Kienyeji',
      quantity: 50
    });
    const events: LivestockEvent[] = [
      createMockEvent({ eventId: 'e1', eventType: 'death', quantity: 2, eventDate: '2026-01-10' })
    ];
    const snapshot = getLivestockIntelligenceSnapshot('farmer_ai', [record], { [record.recordId]: events });
    const serialized = serializeIntelligenceSnapshotForAI(snapshot);

    const ok =
      serialized.includes('[MSINGI WA INTELLIGENCE YA MIFUGO (V1.4A FOUNDATION)]') &&
      serialized.includes('[SHUGHULI ZILIZOREKODIWA (FACTS ONLY)]') &&
      serialized.includes('[MIONGOZO YA USALAMA KWA AI]') &&
      serialized.includes('USIBUNI vifo, manunuzi, vizazi, chanjo') &&
      serialized.includes('Jumla ya Mifugo Sasa: 48') &&
      serialized.includes('Vifo/Upotevu (Mortality): 2');
    assert(ok, '14: AI Separation & Non-Hallucination Boundaries', `Prompt contains strict boundaries and exact facts.`);
  }

  // --- Scenario 15: Non-Invention Principle ---
  {
    const record = createMockRecord({
      recordId: 'rec_no_vax',
      userId: 'farmer_novax',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Nyama',
      quantity: 40
    });
    const snapshot = getLivestockIntelligenceSnapshot('farmer_novax', [record], {});
    const serialized = serializeIntelligenceSnapshotForAI(snapshot);

    const ok =
      snapshot.recentActivity.vaccinations === 0 &&
      snapshot.recentActivity.treatments === 0 &&
      snapshot.recentActivity.mortality === 0 &&
      serialized.includes('Chanjo (Vaccinations): 0') &&
      serialized.includes('Matibabu (Treatments): 0');
    assert(ok, '15: Non-Invention Principle (No Phantom Events)', `Reports 0 when data is absent without inventing.`);
  }

  // --- Scenario 16: Regression Check Against Existing Balance Engine ---
  {
    const record = createMockRecord({
      recordId: 'rec_reg',
      userId: 'farmer_reg',
      livestockCategory: 'Poultry',
      livestockType: 'Kuku wa Kienyeji',
      quantity: 100
    });
    const mappedEvents: LivestockEvent[] = [
      createMockEvent({ eventId: 'e1', eventType: 'birth', quantity: 20, eventDate: '2026-01-05' }),
      createMockEvent({ eventId: 'e2', eventType: 'death', quantity: 5, eventDate: '2026-01-10' }),
      createMockEvent({ eventId: 'e3', eventType: 'sale', quantity: 15, eventDate: '2026-01-15' }),
      createMockEvent({ eventId: 'e4', eventType: 'purchase', quantity: 10, eventDate: '2026-01-20' })
    ];

    const balanceFromOldEngine = calculateLivestockBalance(record.quantity, mappedEvents);
    const snapFromNewEngine = getLivestockIntelligenceSnapshot('farmer_reg', [record], { [record.recordId]: mappedEvents });
    const poultryType = snapFromNewEngine.livestockByType[0];

    const ok =
      poultryType.currentQuantity === balanceFromOldEngine.currentQuantity &&
      poultryType.additions === balanceFromOldEngine.totalAdditions &&
      poultryType.reductions === balanceFromOldEngine.totalReductions &&
      snapFromNewEngine.totalLivestock === balanceFromOldEngine.currentQuantity &&
      snapFromNewEngine.totalLivestock === 110;
    assert(ok, '16: Regression Check (Matches calculateLivestockBalance)', `Both engines compute currentQuantity = 110 identical match.`);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TEST SUMMARY: ${passed}/16 PASSED, ${failed}/16 FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
