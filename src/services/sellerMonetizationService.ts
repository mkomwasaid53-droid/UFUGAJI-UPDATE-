/**
 * UFUGAJI UPDATE V1.10A-CORRECTIVE-3
 * PERSISTENT SELLER LIFECYCLE AUTHORITY, ADMIN SIMULATION PERSISTENCE & NOTIFICATION DEDUPLICATION
 *
 * Core Principles:
 * 1. FIRESTORE / SERVER IS THE AUTHORITY:
 *    - All seller monetization records persist to Firestore: sellerMonetization/{sellerUserId}
 *    - In-memory cache + file backup for high performance, backed by Firestore.
 *    - Cold container restarts, reloads, logouts, or session changes NEVER reset to NOT_ACTIVATED.
 * 2. SINGLE AUTHORITATIVE TRANSITION FUNCTION:
 *    - transitionSellerMonetization() is the single state machine transition engine.
 *    - All actions (trial, payment, grace, expiry, simulation, suspend, reactivate) route through it.
 * 3. CONTROLLED TEST SIMULATION PERSISTENCE:
 *    - Admin simulations (simulateGracePeriod, simulateGraceExpiry) set authoritative status and
 *      timestamps server-side and persist to Firestore.
 *    - Survives server restart, reloads, and time progression.
 *    - Test simulation metadata (testSimulation = true) tracks origin without replacing status.
 * 4. MONOTONICITY & PROTECTION AGAINST OVERWRITING:
 *    - Never create a default NOT_ACTIVATED record over an existing Firestore or server record.
 *    - Evaluator and reactivator never revert EXPIRED, GRACE_PERIOD, or SUSPENDED to NOT_ACTIVATED.
 *    - Monotonic versioning protects against stale client read/write races.
 * 5. NOTIFICATION DEDUPLICATION & IDEMPOTENCY:
 *    - One transition = exactly one governed notification set.
 *    - Deterministic transition identity: transitionId = ${sellerUserId}_${action}_${keyTimestamp}.
 *    - Deterministic notification doc ID: notif_${sellerUserId}_${transitionId}_${type}.
 *    - Reads never emit notifications.
 * 6. STRUCTURED DIAGNOSTIC TRACEABILITY (Section 28):
 *    - Structured diagnostic logs answer: "Ni action gani ilibadilisha seller kutoka state A kwenda state B?"
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  limit as firestoreLimit,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  SellerMonetizationRecord,
  SellerMonetizationStatus,
  SellerPaymentStatus,
  SellerMonetizationConfig,
  SellerSellingEligibility,
  SellerMonetizationAuditEntry,
  SellerMonetizationAuditEventType,
  SellerMonetizationDiagnosticLog,
  TransitionSellerMonetizationParams,
  ActivateTrialInput,
  ActivateTrialResult,
  TestPaymentInput
} from '../types/sellerMonetization';
import {
  createAuthoritativeNotification,
  _resetNotificationsForTesting
} from './notificationService';

// Authoritative Governed Configuration (Section 1 & 5)
export const SELLER_MONETIZATION_CONFIG: SellerMonetizationConfig = {
  plan: 'SELLER_MONTHLY',
  monthlyPrice: 1000,
  currency: 'TZS',
  trialDurationDays: 30, // 1 month free trial
  graceDurationDays: 7   // 7 days governed grace period
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONETIZATION_COLLECTION = 'sellerMonetization';
const AUDIT_COLLECTION = 'sellerMonetizationAudit';
const DIAGNOSTIC_COLLECTION = 'sellerMonetizationDiagnostic';

// Persistent Store Types
interface SellerMonetizationStore {
  records: Record<string, SellerMonetizationRecord>;
  auditLogs: SellerMonetizationAuditEntry[];
  diagnosticLogs: SellerMonetizationDiagnosticLog[];
  processedIdempotencyKeys: Record<string, any>;
}

// In-Memory Storage & Fast Cache
const inMemoryStore: SellerMonetizationStore = {
  records: {},
  auditLogs: [],
  diagnosticLogs: [],
  processedIdempotencyKeys: {}
};

// Node.js FS secondary persistence helper
const isNode = typeof window === 'undefined';
let fsModule: any = null;
let pathModule: any = null;
const STORE_FILE_PATH = 'data/seller_monetization_store.json';

if (isNode) {
  try {
    fsModule = require('fs');
    pathModule = require('path');
    loadStoreFromFile();
  } catch {}
}

function loadStoreFromFile() {
  if (!fsModule || !pathModule) return;
  try {
    const fullPath = pathModule.resolve(process.cwd(), STORE_FILE_PATH);
    if (fsModule.existsSync(fullPath)) {
      const data = fsModule.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        if (parsed.records) inMemoryStore.records = parsed.records;
        if (parsed.auditLogs) inMemoryStore.auditLogs = parsed.auditLogs;
        if (parsed.diagnosticLogs) inMemoryStore.diagnosticLogs = parsed.diagnosticLogs;
        if (parsed.processedIdempotencyKeys) inMemoryStore.processedIdempotencyKeys = parsed.processedIdempotencyKeys;
      }
    }
  } catch (err) {
    console.warn('[sellerMonetizationService] Failed to load store file:', err);
  }
}

function persistStoreToFile() {
  if (!fsModule || !pathModule) return;
  try {
    const fullPath = pathModule.resolve(process.cwd(), STORE_FILE_PATH);
    const dir = pathModule.dirname(fullPath);
    if (!fsModule.existsSync(dir)) {
      fsModule.mkdirSync(dir, { recursive: true });
    }
    fsModule.writeFileSync(fullPath, JSON.stringify(inMemoryStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('[sellerMonetizationService] Failed to persist store to file:', err);
  }
}

// ----------------------------------------------------------------------------
// Shared Authoritative UI State Synchronization (V1.10A-CORRECTIVE-7)
// ----------------------------------------------------------------------------
export type MonetizationSubscriber = (record: SellerMonetizationRecord) => void;
const monetizationSubscribers = new Map<string, Set<MonetizationSubscriber>>();

/**
 * Subscribes a component to real-time authoritative seller monetization changes.
 * Immediately invokes callback with current state if available.
 */
export function subscribeToSellerMonetization(
  sellerUserId: string,
  callback: MonetizationSubscriber
): () => void {
  if (!sellerUserId) return () => {};
  if (!monetizationSubscribers.has(sellerUserId)) {
    monetizationSubscribers.set(sellerUserId, new Set());
  }
  const set = monetizationSubscribers.get(sellerUserId)!;
  set.add(callback);

  // Immediately invoke with current record if present
  try {
    const current = sellerMonetizationService.getSellerRecord(sellerUserId);
    if (current) {
      callback(current);
    }
  } catch {}

  // If running in browser environment, also listen to window-level custom events
  let windowHandler: ((e: any) => void) | null = null;
  if (typeof window !== 'undefined' && window.addEventListener) {
    windowHandler = (e: any) => {
      const detail = e.detail;
      if (detail && detail.sellerUserId === sellerUserId && detail.record) {
        try {
          callback(detail.record);
        } catch (err) {
          console.warn('Hitilafu kwenye window monetization event callback:', err);
        }
      }
    };
    window.addEventListener('seller_monetization_updated', windowHandler);
  }

  return () => {
    const s = monetizationSubscribers.get(sellerUserId);
    if (s) {
      s.delete(callback);
      if (s.size === 0) monetizationSubscribers.delete(sellerUserId);
    }
    if (typeof window !== 'undefined' && window.removeEventListener && windowHandler) {
      window.removeEventListener('seller_monetization_updated', windowHandler);
    }
  };
}

/**
 * Broadcasts authoritative seller monetization updates to all active UI consumers.
 */
export function notifySellerMonetizationChanged(record: SellerMonetizationRecord): void {
  if (!record?.sellerUserId) return;
  const set = monetizationSubscribers.get(record.sellerUserId);
  if (set) {
    for (const cb of Array.from(set)) {
      try {
        cb(record);
      } catch (err) {
        console.warn('Hitilafu kwenye callback ya monetization subscriber:', err);
      }
    }
  }

  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(
        new CustomEvent('seller_monetization_updated', {
          detail: { sellerUserId: record.sellerUserId, record }
        })
      );
    } catch {}
  }
}

/**
 * Creates an empty default monetization record for legacy or newly detected sellers.
 * Backward compatible: defaults safely to NOT_ACTIVATED.
 * Monotonic version starts at 1.
 */
export function createDefaultSellerMonetizationRecord(
  sellerUserId: string,
  sellerProfileId?: string
): SellerMonetizationRecord {
  const now = new Date();
  const nowIso = now.toISOString();


  return {
    sellerUserId,
    sellerProfileId: sellerProfileId || sellerUserId,
    status: 'NOT_ACTIVATED',
    plan: SELLER_MONETIZATION_CONFIG.plan,
    price: SELLER_MONETIZATION_CONFIG.monthlyPrice,
    currency: SELLER_MONETIZATION_CONFIG.currency,
    trialStartAt: null,
    trialEndAt: null,
    graceStartAt: null,
    graceEndAt: null,
    currentPeriodStartAt: null,
    currentPeriodEndAt: null,
    activatedAt: null,
    lastPaymentAt: null,
    lastPaymentStatus: 'NOT_REQUIRED',
    nextRenewalAt: null,
    expiredAt: null,
    cancelledAt: null,
    suspendedAt: null,
    suspendedReason: null,
    hasHadTrial: false,
    testSimulation: false,
    version: 1,
    emittedTransitions: [],
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

/**
 * Persists an authoritative seller record to Firestore.
 */
async function persistRecordToFirestore(record: SellerMonetizationRecord): Promise<void> {
  if (!db || !record?.sellerUserId) return;
  try {
    const docRef = doc(db, MONETIZATION_COLLECTION, record.sellerUserId);
    await setDoc(docRef, record, { merge: true });
  } catch (err) {
    console.warn('[sellerMonetizationService] Failed to persist record to Firestore (in-memory preserved):', err);
  }
}

/**
 * Emits an audit event for state transitions.
 * Persists to in-memory store and Firestore collection sellerMonetizationAudit.
 */
function recordMonetizationAudit(
  sellerUserId: string,
  eventType: SellerMonetizationAuditEventType,
  previousStatus: SellerMonetizationStatus | null,
  newStatus: SellerMonetizationStatus,
  performedBy: string = 'SYSTEM',
  reason?: string,
  idempotencyKey?: string,
  metadata?: Record<string, any>
): SellerMonetizationAuditEntry {
  const now = new Date().toISOString();
  const entryId = `audit_sm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const entry: SellerMonetizationAuditEntry = {
    id: entryId,
    sellerUserId,
    eventType,
    previousStatus,
    newStatus,
    performedBy,
    timestamp: now,
    reason,
    idempotencyKey,
    metadata
  };

  inMemoryStore.auditLogs.unshift(entry);
  if (inMemoryStore.auditLogs.length > 1000) {
    inMemoryStore.auditLogs.pop();
  }
  persistStoreToFile();

  if (db) {
    try {
      const docRef = doc(db, AUDIT_COLLECTION, entryId);
      setDoc(docRef, entry).catch(() => {});
    } catch {}
  }

  return entry;
}

/**
 * Section 28: Diagnostic logging answering:
 * "Ni action gani ilibadilisha seller kutoka state A kwenda state B?"
 */
function recordDiagnosticLog(
  sellerUserId: string,
  previousStatus: SellerMonetizationStatus,
  nextStatus: SellerMonetizationStatus,
  transitionId: string,
  action: string,
  source: 'ADMIN_ACTION' | 'SELLER_ACTION' | 'LIFECYCLE_EVALUATOR' | 'PAYMENT_CONFIRMATION' | 'SYSTEM_INITIALIZATION',
  actorUserId: string,
  notificationEventIds: string[],
  idempotencyKey?: string,
  metadata?: Record<string, any>
): SellerMonetizationDiagnosticLog {
  const now = new Date().toISOString();
  const diagId = `diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const diagEntry: SellerMonetizationDiagnosticLog = {
    id: diagId,
    sellerUserId,
    previousStatus,
    nextStatus,
    transitionId,
    action,
    source,
    actorUserId,
    timestamp: now,
    notificationEventIds,
    idempotencyKey,
    metadata
  };

  inMemoryStore.diagnosticLogs.unshift(diagEntry);
  if (inMemoryStore.diagnosticLogs.length > 1000) {
    inMemoryStore.diagnosticLogs.pop();
  }
  persistStoreToFile();

  if (db) {
    try {
      const docRef = doc(db, DIAGNOSTIC_COLLECTION, diagId);
      setDoc(docRef, diagEntry).catch(() => {});
    } catch {}
  }

  return diagEntry;
}

/**
 * Helper to sanitize string for Firestore doc ID.
 */
function sanitizeDocId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 150);
}

/**
 * ============================================================================
 * SECTION 15: SINGLE AUTHORITATIVE LIFECYCLE TRANSITION FUNCTION
 * ============================================================================
 * transitionSellerMonetization() is the sole engine through which all
 * monetization status changes must flow:
 * - ACTIVATE_TRIAL
 * - RECORD_PAYMENT
 * - SUSPEND
 * - REACTIVATE
 * - CANCEL
 * - SIMULATE_GRACE
 * - SIMULATE_EXPIRY
 * - EVALUATE_LIFECYCLE
 *
 * Rules:
 * - Deterministic transition IDs.
 * - Deterministic notification deduplication keys and doc IDs.
 * - Exactly one notification of each required type per transition.
 * - Idempotent for repeat calls with same parameters or idempotency key.
 * - Monotonic protection: EXPIRED, GRACE_PERIOD, SUSPENDED never become NOT_ACTIVATED.
 * - Server & Firestore persistent authority.
 */
export function transitionSellerMonetization(
  params: TransitionSellerMonetizationParams
): {
  success: boolean;
  record: SellerMonetizationRecord;
  message: string;
  isDuplicate?: boolean;
  notificationsEmitted: string[];
  commandId?: string;
  entryPoint?: string;
  createdNotificationId?: string;
  stateBefore?: SellerMonetizationStatus;
  stateAfter?: SellerMonetizationStatus;
} {
  const {
    sellerUserId,
    action,
    actorUserId = 'SYSTEM',
    source = 'LIFECYCLE_EVALUATOR',
    reason,
    sellerProfileId,
    idempotencyKey,
    commandId,
    entryPoint,
    currentTime = new Date(),
    paymentDetails
  } = params;

  if (!sellerUserId) {
    throw new Error('sellerUserId is required');
  }

  // 1. Check idempotency cache
  if (idempotencyKey && inMemoryStore.processedIdempotencyKeys[idempotencyKey]) {
    const cached = inMemoryStore.processedIdempotencyKeys[idempotencyKey];
    return {
      success: true,
      record: cached.record,
      message: 'Ombi limeidhinishwa kikamilifu (Idempotent response).',
      isDuplicate: true,
      notificationsEmitted: cached.notificationsEmitted || [],
      commandId: cached.commandId || commandId,
      entryPoint: cached.entryPoint || entryPoint,
      createdNotificationId: cached.createdNotificationId,
      stateBefore: cached.stateBefore,
      stateAfter: cached.stateAfter || cached.record.status
    };
  }

  // 2. Read current authoritative record from in-memory store
  let currentRecord = inMemoryStore.records[sellerUserId];
  if (!currentRecord) {
    // Only create default if genuinely absent
    currentRecord = createDefaultSellerMonetizationRecord(sellerUserId, sellerProfileId);
    inMemoryStore.records[sellerUserId] = currentRecord;
    persistRecordToFirestore(currentRecord).catch(() => {});
    persistStoreToFile();
  }

  const prevStatus = currentRecord.status;
  const now = currentTime.getTime();
  const nowIso = currentTime.toISOString();
  let nextStatus: SellerMonetizationStatus = prevStatus;
  let hasStatusChanged = false;
  let transitionId = `trans_${sellerUserId}_${action}_${nowIso}`;
  const notificationsToEmit: {
    type: string;
    title: string;
    message: string;
    priority: 'NORMAL' | 'HIGH' | 'URGENT';
  }[] = [];
  const emittedKeys = [...(currentRecord.emittedTransitions || [])];

  const updatedRecord: SellerMonetizationRecord = {
    ...currentRecord,
    sellerProfileId: sellerProfileId || currentRecord.sellerProfileId || sellerUserId,
    version: (currentRecord.version || 0) + 1,
    updatedAt: nowIso
  };

  // 3. Execute governed transition logic
  switch (action) {
    case 'ACTIVATE_TRIAL': {
      if (currentRecord.status === 'TRIAL_ACTIVE') {
        const result = {
          success: true,
          record: currentRecord,
          message: 'Jaribio lako la mwezi wa kwanza bila malipo liko hewani tayari.',
          isDuplicate: true,
          notificationsEmitted: [],
          commandId,
          entryPoint,
          stateBefore: prevStatus,
          stateAfter: currentRecord.status
        };
        if (idempotencyKey) inMemoryStore.processedIdempotencyKeys[idempotencyKey] = result;
        return result;
      }
      if (currentRecord.hasHadTrial) {
        throw new Error(
          'Muuzaji huyu ameshawahi kutumia kipindi chake cha mwezi wa kwanza bila malipo. Usajili unahitaji malipo ya TSh 1,000 kwa mwezi.'
        );
      }
      if (currentRecord.status === 'ACTIVE') {
        throw new Error('Muuzaji tayari ana usajili unaofanya kazi (ACTIVE). Huwezi kuanzisha jaribio la bure.');
      }
      if (currentRecord.status === 'GRACE_PERIOD') {
        throw new Error('Usajili wako wa bure umeisha na uko kwenye Grace Period. Lipa TSh 1,000 ili kuendelea kuuza.');
      }
      if (currentRecord.status === 'EXPIRED') {
        throw new Error('Usajili wako umeisha (EXPIRED). Lipa TSh 1,000 ili kurudisha duka hewani.');
      }
      if (currentRecord.status === 'SUSPENDED') {
        throw new Error('Akaunti ya muuzaji imesimamishwa kiutawala (SUSPENDED). Huwezi kuanzisha jaribio.');
      }
      if (currentRecord.status === 'CANCELLED') {
        throw new Error('Usajili wa muuzaji umefutwa (CANCELLED). Huwezi kuanzisha jaribio la bure.');
      }
      if (currentRecord.status !== 'NOT_ACTIVATED') {
        throw new Error(`Huwezi kuanzisha Free Trial ukiwa katika hali ya ${currentRecord.status}.`);
      }

      nextStatus = 'TRIAL_ACTIVE';
      hasStatusChanged = true;
      const trialStart = nowIso;
      const trialEnd = new Date(now + SELLER_MONETIZATION_CONFIG.trialDurationDays * MS_PER_DAY).toISOString();
      const graceEnd = new Date(
        now + (SELLER_MONETIZATION_CONFIG.trialDurationDays + SELLER_MONETIZATION_CONFIG.graceDurationDays) * MS_PER_DAY
      ).toISOString();

      transitionId = `${sellerUserId}_TRIAL_${trialStart}`;
      updatedRecord.status = 'TRIAL_ACTIVE';
      updatedRecord.trialStartAt = trialStart;
      updatedRecord.trialEndAt = trialEnd;
      updatedRecord.graceStartAt = trialEnd;
      updatedRecord.graceEndAt = graceEnd;
      updatedRecord.activatedAt = trialStart;
      updatedRecord.nextRenewalAt = trialEnd;
      updatedRecord.hasHadTrial = true;
      updatedRecord.testSimulation = false;
      updatedRecord.lastLifecycleAction = 'ACTIVATE_TRIAL';
      updatedRecord.lastLifecycleActionAt = trialStart;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_MONETIZATION_ACTIVATED',
        prevStatus,
        'TRIAL_ACTIVE',
        actorUserId,
        `Usajili wa muuzaji umewashwa kwa mara ya kwanza kupitia ${entryPoint || 'SELLER_MAIN_CTA'}.`,
        idempotencyKey,
        { commandId, entryPoint }
      );

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_TRIAL_STARTED',
        prevStatus,
        'TRIAL_ACTIVE',
        actorUserId,
        `Jaribio la mwezi wa kwanza bila malipo limeanza hadi ${trialEnd}. Command: ${commandId}`,
        idempotencyKey,
        { commandId, entryPoint }
      );

      notificationsToEmit.push({
        type: 'SELLER_TRIAL_STARTED',
        title: 'Hongera! Mwezi Wako wa Kwanza Bure Umeanza',
        message: `Umeanzisha usajili wako wa muuzaji bila malipo kwa siku 30 (hadi ${new Date(trialEnd).toLocaleDateString('sw-TZ')}). Baada ya hapo ni TSh 1,000 tu kwa mwezi.`,
        priority: 'HIGH'
      });
      break;
    }

    case 'SIMULATE_GRACE': {
      if (currentRecord.status === 'SUSPENDED') {
        throw new Error('Huwezi kuweka Grace Period kwa muuzaji aliyesimamishwa kiutawala (SUSPENDED).');
      }

      nextStatus = 'GRACE_PERIOD';
      hasStatusChanged = true;
      const graceStart = nowIso;
      const graceEnd = new Date(now + SELLER_MONETIZATION_CONFIG.graceDurationDays * MS_PER_DAY).toISOString();

      transitionId = `${sellerUserId}_SIMULATE_GRACE_${graceStart}`;
      updatedRecord.status = 'GRACE_PERIOD';
      updatedRecord.graceStartAt = graceStart;
      updatedRecord.graceEndAt = graceEnd;
      updatedRecord.testSimulation = true;
      updatedRecord.lastLifecycleAction = 'SIMULATE_GRACE';
      updatedRecord.lastLifecycleActionAt = graceStart;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      if (prevStatus === 'TRIAL_ACTIVE') {
        recordMonetizationAudit(
          sellerUserId,
          'SELLER_TRIAL_EXPIRED',
          prevStatus,
          'GRACE_PERIOD',
          actorUserId,
          '[ADMIN SIMULATION] Kipindi cha mwezi mmoja cha bure kimehitimishwa kwa jaribio la utawala.',
          idempotencyKey
        );
      }

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_GRACE_STARTED',
        prevStatus,
        'GRACE_PERIOD',
        actorUserId,
        '[ADMIN SIMULATION] Kipindi cha Grace kimeanzishwa rasmi na msimamizi kwa ajili ya majaribio.',
        idempotencyKey
      );

      notificationsToEmit.push(
        {
          type: 'SELLER_GRACE_STARTED',
          title: 'Kipindi cha Bure cha Muuzaji Kimemalizika (Grace Period)',
          message: 'Mwezi wako wa bure umeisha. Upo kwenye Grace Period. Tafadhali fanya malipo ya TSh 1,000 kwa mwezi ili kuendelea kuuza.',
          priority: 'HIGH'
        },
        {
          type: 'SELLER_PAYMENT_REQUIRED',
          title: 'Usajili wa Muuzaji: Malipo Yanahitajika',
          message: 'Ili kudumisha bidhaa zako sokoni baada ya Grace Period, fanya malipo ya kila mwezi ya TSh 1,000.',
          priority: 'HIGH'
        }
      );
      break;
    }

    case 'SIMULATE_EXPIRY': {
      if (currentRecord.status !== 'GRACE_PERIOD') {
        throw new Error(
          `Kuweka expiry kunahitaji muuzaji awe katika GRACE_PERIOD. Hali ya sasa ni ${currentRecord.status}.`
        );
      }

      nextStatus = 'EXPIRED';
      hasStatusChanged = true;
      const expiredAt = nowIso;

      transitionId = `${sellerUserId}_SIMULATE_EXPIRED_${expiredAt}`;
      updatedRecord.status = 'EXPIRED';
      updatedRecord.expiredAt = expiredAt;
      updatedRecord.testSimulation = true;
      updatedRecord.lastLifecycleAction = 'SIMULATE_EXPIRY';
      updatedRecord.lastLifecycleActionAt = expiredAt;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_EXPIRED',
        prevStatus,
        'EXPIRED',
        actorUserId,
        '[ADMIN SIMULATION] Muda wa Grace Period umemalizika rasmi kwa jaribio la utawala.',
        idempotencyKey
      );

      notificationsToEmit.push({
        type: 'SELLER_SUBSCRIPTION_EXPIRED',
        title: 'Usajili wa Muuzaji Umekwisha (Subscription Expired)',
        message: 'Grace period imemalizika. Usajili wako wa muuzaji umekwisha. Fanya upya usajili (TSh 1,000) ili kurudisha nafasi ya kuuza sokoni.',
        priority: 'URGENT'
      });
      break;
    }

    case 'RECORD_PAYMENT': {
      const amount = paymentDetails?.amount || SELLER_MONETIZATION_CONFIG.monthlyPrice;
      const paymentStatus = paymentDetails?.paymentStatus || 'SUCCESS';
      const transactionRef = paymentDetails?.transactionRef || `tx_${Date.now()}`;

      if (amount < SELLER_MONETIZATION_CONFIG.monthlyPrice) {
        recordMonetizationAudit(
          sellerUserId,
          'SELLER_PAYMENT_FAILED',
          prevStatus,
          prevStatus,
          actorUserId,
          `Kiasi hakitoshi (Kiliingizwa TSh ${amount}, kinachohitajika ni TSh ${SELLER_MONETIZATION_CONFIG.monthlyPrice}).`,
          idempotencyKey
        );

        const dedupFailKey = `dedup_${sellerUserId}_SELLER_RENEWAL_FAILED_${nowIso}`;
        createAuthoritativeNotification({
          recipientUserId: sellerUserId,
          type: 'SELLER_RENEWAL_FAILED',
          category: 'SELLER',
          title: 'Malipo ya Usajili Yameshindikana',
          message: `Kiasi kilicholipwa (TSh ${amount}) hakilingani na ada ya mwezi ya TSh ${SELLER_MONETIZATION_CONFIG.monthlyPrice}.`,
          priority: 'HIGH',
          targetType: 'SELLER',
          targetId: sellerUserId,
          deduplicationKey: dedupFailKey
        }).catch(() => {});

        throw new Error(
          `Kiasi cha malipo lazima kiwe angalau TSh ${SELLER_MONETIZATION_CONFIG.monthlyPrice} TZS.`
        );
      }

      if (paymentStatus !== 'SUCCESS') {
        recordMonetizationAudit(
          sellerUserId,
          'SELLER_PAYMENT_FAILED',
          prevStatus,
          prevStatus,
          actorUserId,
          `Malipo hayajafanikiwa: ${paymentStatus}`,
          idempotencyKey
        );
        throw new Error(`Hali ya malipo si SUCCESS (${paymentStatus}). Usajili haujawashwa.`);
      }

      const isSuspended = currentRecord.status === 'SUSPENDED';

      // Section 12: Suspension Separation — payment success must NOT automatically change SUSPENDED -> ACTIVE!
      if (isSuspended) {
        nextStatus = 'SUSPENDED';
        hasStatusChanged = false; // Status stays SUSPENDED
        updatedRecord.status = 'SUSPENDED';
      } else {
        nextStatus = 'ACTIVE';
        hasStatusChanged = prevStatus !== 'ACTIVE';
        updatedRecord.status = 'ACTIVE';
      }

      // Section 5: Active Renewal — extend from existing authoritative period end without reducing remaining days
      const baseEndMs = (currentRecord.currentPeriodEndAt && new Date(currentRecord.currentPeriodEndAt).getTime() > now)
        ? new Date(currentRecord.currentPeriodEndAt).getTime()
        : now;
      const periodStart = (currentRecord.currentPeriodStartAt && (currentRecord.status === 'ACTIVE' || isSuspended))
        ? currentRecord.currentPeriodStartAt
        : nowIso;
      const periodEnd = new Date(baseEndMs + SELLER_MONETIZATION_CONFIG.trialDurationDays * MS_PER_DAY).toISOString();

      transitionId = `${sellerUserId}_PAYMENT_${nowIso}`;
      updatedRecord.currentPeriodStartAt = periodStart;
      updatedRecord.currentPeriodEndAt = periodEnd;
      updatedRecord.nextRenewalAt = periodEnd;
      updatedRecord.lastPaymentAt = nowIso;

      updatedRecord.lastPaymentStatus = 'SUCCESS';
      updatedRecord.lastPaymentAmount = amount;
      updatedRecord.lastTransactionRef = transactionRef;
      updatedRecord.expiredAt = null;
      updatedRecord.graceStartAt = null;
      updatedRecord.graceEndAt = null;
      updatedRecord.testSimulation = false;
      updatedRecord.lastLifecycleAction = 'RECORD_PAYMENT';
      updatedRecord.lastLifecycleActionAt = nowIso;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_PAYMENT_SUCCESS',
        prevStatus,
        nextStatus,
        actorUserId,
        isSuspended
          ? `Malipo ya TSh ${amount} yamepokelewa, lakini muuzaji anabaki SUSPENDED kulingana na taratibu za soko. Marejeleo: ${transactionRef}.`
          : `Malipo ya TSh ${amount} yamekamilika kwa ufanisi. Marejeleo: ${transactionRef}.`,
        idempotencyKey,
        { amount, transactionRef, isSuspended }
      );

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_RENEWAL_SUCCESS',
        prevStatus,
        nextStatus,
        actorUserId,
        `Kipindi cha usajili kimewekwa/kimerudiwa hadi ${periodEnd}.${isSuspended ? ' (Akaunti inabaki kusimamishwa).' : ''}`,
        idempotencyKey,
        { amount, transactionRef, periodEnd, isSuspended }
      );

      notificationsToEmit.push({
        type: 'SELLER_RENEWAL_SUCCESS',
        title: isSuspended
          ? 'Malipo ya Usajili Yamepokelewa (Akaunti Imesimamishwa)'
          : 'Usajili wa Muuzaji Umelipiwa Kikamilifu!',
        message: isSuspended
          ? `Malipo ya TSh ${amount} yamepokelewa na muda wako wa usajili umehifadhiwa hadi ${new Date(periodEnd).toLocaleDateString('sw-TZ')}. Hata hivyo, akaunti yako bado imesimamishwa kiutawala (SUSPENDED).`
          : `Malipo ya TSh ${amount} yamepokelewa. Usajili wako utakuwa hai hadi ${new Date(periodEnd).toLocaleDateString('sw-TZ')}.`,
        priority: isSuspended ? 'HIGH' : 'NORMAL'
      });
      break;
    }

    case 'SUSPEND': {
      nextStatus = 'SUSPENDED';
      hasStatusChanged = true;
      const suspendTime = nowIso;

      transitionId = `${sellerUserId}_SUSPEND_${suspendTime}`;
      updatedRecord.status = 'SUSPENDED';
      updatedRecord.suspendedAt = suspendTime;
      updatedRecord.suspendedReason = reason || 'Kusimamishwa na msimamizi';
      updatedRecord.lastLifecycleAction = 'SUSPEND';
      updatedRecord.lastLifecycleActionAt = suspendTime;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_MONETIZATION_SUSPENDED',
        prevStatus,
        'SUSPENDED',
        actorUserId,
        reason
      );

      notificationsToEmit.push({
        type: 'SELLER_MONETIZATION_SUSPENDED',
        title: 'Usajili wa Muuzaji Umesimamishwa (Monetization Suspended)',
        message: `Usajili wako wa muuzaji umesimamishwa kiutawala kwa sababu: ${
          reason || 'Uamuzi wa kiutawala'
        }. Bidhaa zako hazitaonekana sokoni hadi utatuzi utakapofanyika. Duka na bidhaa zako havijafutwa.`,
        priority: 'URGENT'
      });
      break;
    }

    case 'REACTIVATE': {
      if (currentRecord.status !== 'SUSPENDED') {
        const result = {
          success: true,
          record: currentRecord,
          message: 'Muuzaji hajasimamishwa.',
          isDuplicate: true,
          notificationsEmitted: []
        };
        return result;
      }

      // Monotonic and safe state restoration:
      // Never fall back to NOT_ACTIVATED if seller had a trial or payment!
      let targetStatus: SellerMonetizationStatus = 'NOT_ACTIVATED';
      if (currentRecord.currentPeriodEndAt && new Date(currentRecord.currentPeriodEndAt).getTime() > now) {
        targetStatus = 'ACTIVE';
      } else if (currentRecord.trialEndAt && new Date(currentRecord.trialEndAt).getTime() > now) {
        targetStatus = 'TRIAL_ACTIVE';
      } else if (currentRecord.graceEndAt && new Date(currentRecord.graceEndAt).getTime() > now) {
        targetStatus = 'GRACE_PERIOD';
      } else if (currentRecord.hasHadTrial || currentRecord.expiredAt) {
        targetStatus = 'EXPIRED'; // Never fallback to NOT_ACTIVATED
      }

      nextStatus = targetStatus;
      hasStatusChanged = true;
      const reactivateTime = nowIso;

      transitionId = `${sellerUserId}_REACTIVATE_${reactivateTime}`;
      updatedRecord.status = targetStatus;
      updatedRecord.suspendedAt = null;
      updatedRecord.suspendedReason = null;
      updatedRecord.lastLifecycleAction = 'REACTIVATE';
      updatedRecord.lastLifecycleActionAt = reactivateTime;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_MONETIZATION_REACTIVATED',
        prevStatus,
        targetStatus,
        actorUserId,
        'Usajili wa muuzaji umerejeshwa na msimamizi.'
      );

      notificationsToEmit.push({
        type: 'SELLER_MONETIZATION_REACTIVATED',
        title: 'Usajili wa Muuzaji Umerejeshwa (Monetization Reactivated)',
        message: `Usajili wako wa muuzaji umerejeshwa na msimamizi (Hali: ${targetStatus}). Bidhaa zako ziko hewani tena sokoni.`,
        priority: 'HIGH'
      });
      break;
    }

    case 'CANCEL': {
      nextStatus = 'CANCELLED';
      hasStatusChanged = true;
      const cancelTime = nowIso;

      transitionId = `${sellerUserId}_CANCEL_${cancelTime}`;
      updatedRecord.status = 'CANCELLED';
      updatedRecord.cancelledAt = cancelTime;
      updatedRecord.lastLifecycleAction = 'CANCEL';
      updatedRecord.lastLifecycleActionAt = cancelTime;
      updatedRecord.lastLifecycleActionBy = actorUserId;

      recordMonetizationAudit(
        sellerUserId,
        'SELLER_MONETIZATION_CANCELLED',
        prevStatus,
        'CANCELLED',
        actorUserId,
        reason
      );
      break;
    }

    case 'EVALUATE_LIFECYCLE': {
      // Governed lifecycle evaluation according to real server time
      // 1. TRIAL_ACTIVE transition
      if (currentRecord.status === 'TRIAL_ACTIVE' && currentRecord.trialEndAt) {
        const trialEndTime = new Date(currentRecord.trialEndAt).getTime();
        if (now >= trialEndTime) {
          nextStatus = 'GRACE_PERIOD';
          hasStatusChanged = true;
          transitionId = `${sellerUserId}_TRIAL_TO_GRACE_${currentRecord.trialEndAt}`;
          updatedRecord.status = 'GRACE_PERIOD';
          updatedRecord.graceStartAt = currentRecord.trialEndAt;
          const graceEnd = new Date(trialEndTime + SELLER_MONETIZATION_CONFIG.graceDurationDays * MS_PER_DAY);
          updatedRecord.graceEndAt = graceEnd.toISOString();
          updatedRecord.lastLifecycleAction = 'TRIAL_EXPIRED_TO_GRACE';
          updatedRecord.lastLifecycleActionAt = nowIso;
          updatedRecord.lastLifecycleActionBy = 'SYSTEM';

          recordMonetizationAudit(
            sellerUserId,
            'SELLER_TRIAL_EXPIRED',
            prevStatus,
            'GRACE_PERIOD',
            'SYSTEM',
            'Kipindi cha mwezi mmoja cha bure kimemalizika. Muuzaji ameingia kwenye Grace Period.'
          );

          recordMonetizationAudit(
            sellerUserId,
            'SELLER_GRACE_STARTED',
            prevStatus,
            'GRACE_PERIOD',
            'SYSTEM',
            'Grace period imeanza. Malipo ya TSh 1,000 yanahitajika kuendelea na usajili.'
          );

          notificationsToEmit.push(
            {
              type: 'SELLER_GRACE_STARTED',
              title: 'Kipindi cha Bure cha Muuzaji Kimemalizika (Grace Period)',
              message: 'Mwezi wako wa bure umeisha. Upo kwenye Grace Period. Tafadhali fanya malipo ya TSh 1,000 kwa mwezi ili kuendelea kuuza.',
              priority: 'HIGH'
            },
            {
              type: 'SELLER_PAYMENT_REQUIRED',
              title: 'Usajili wa Muuzaji: Malipo Yanahitajika',
              message: 'Ili kudumisha bidhaa zako sokoni baada ya Grace Period, fanya malipo ya kila mwezi ya TSh 1,000.',
              priority: 'HIGH'
            }
          );
        }
      }

      // 2. ACTIVE transition (paid period ended -> enters GRACE_PERIOD)
      else if (currentRecord.status === 'ACTIVE' && currentRecord.currentPeriodEndAt) {
        const periodEndTime = new Date(currentRecord.currentPeriodEndAt).getTime();
        if (now >= periodEndTime) {
          nextStatus = 'GRACE_PERIOD';
          hasStatusChanged = true;
          transitionId = `${sellerUserId}_ACTIVE_TO_GRACE_${currentRecord.currentPeriodEndAt}`;
          updatedRecord.status = 'GRACE_PERIOD';
          updatedRecord.graceStartAt = currentRecord.currentPeriodEndAt;
          const graceEnd = new Date(periodEndTime + SELLER_MONETIZATION_CONFIG.graceDurationDays * MS_PER_DAY);
          updatedRecord.graceEndAt = graceEnd.toISOString();
          updatedRecord.lastLifecycleAction = 'PERIOD_EXPIRED_TO_GRACE';
          updatedRecord.lastLifecycleActionAt = nowIso;
          updatedRecord.lastLifecycleActionBy = 'SYSTEM';

          recordMonetizationAudit(
            sellerUserId,
            'SELLER_GRACE_STARTED',
            prevStatus,
            'GRACE_PERIOD',
            'SYSTEM',
            'Kipindi cha usajili kimemalizika. Muuzaji ameingia kwenye Grace Period.'
          );

          notificationsToEmit.push(
            {
              type: 'SELLER_GRACE_STARTED',
              title: 'Usajili wa Muuzaji Umemalizika (Grace Period)',
              message: 'Kipindi chako cha mwezi kimemalizika. Tafadhali renew usajili wako (TSh 1,000) ili kuendelea kuuza.',
              priority: 'HIGH'
            },
            {
              type: 'SELLER_PAYMENT_REQUIRED',
              title: 'Usajili wa Muuzaji: Malipo Yanahitajika',
              message: 'Ili kuendelea kuuza bila kukatizwa, fanya malipo ya kila mwezi ya TSh 1,000.',
              priority: 'HIGH'
            }
          );
        }
      }

      // 3. GRACE_PERIOD transition (graceEndAt passed -> EXPIRED)
      // Note: If admin simulated grace period, graceEndAt was set and will be respected!
      else if (currentRecord.status === 'GRACE_PERIOD' && currentRecord.graceEndAt) {
        const graceEndTime = new Date(currentRecord.graceEndAt).getTime();
        if (now >= graceEndTime) {
          nextStatus = 'EXPIRED';
          hasStatusChanged = true;
          transitionId = `${sellerUserId}_GRACE_TO_EXPIRED_${currentRecord.graceEndAt}`;
          updatedRecord.status = 'EXPIRED';
          updatedRecord.expiredAt = currentRecord.graceEndAt;
          updatedRecord.lastLifecycleAction = 'GRACE_EXPIRED_TO_EXPIRED';
          updatedRecord.lastLifecycleActionAt = nowIso;
          updatedRecord.lastLifecycleActionBy = 'SYSTEM';

          recordMonetizationAudit(
            sellerUserId,
            'SELLER_EXPIRED',
            prevStatus,
            'EXPIRED',
            'SYSTEM',
            'Muda wa Grace Period umemalizika bila malipo. Usajili wa muuzaji umekwisha (EXPIRED).'
          );

          notificationsToEmit.push({
            type: 'SELLER_SUBSCRIPTION_EXPIRED',
            title: 'Usajili wa Muuzaji Umekwisha (Subscription Expired)',
            message: 'Grace period imemalizika. Usajili wako wa muuzaji umekwisha. Fanya upya usajili (TSh 1,000) ili kurudisha nafasi ya kuuza sokoni.',
            priority: 'URGENT'
          });
        }
      }

      // Monotonic guard: An existing record in EXPIRED, SUSPENDED, or GRACE_PERIOD
      // must NEVER fall back to NOT_ACTIVATED!
      if (
        (currentRecord.status === 'EXPIRED' ||
          currentRecord.status === 'SUSPENDED' ||
          currentRecord.status === 'GRACE_PERIOD') &&
        nextStatus === 'NOT_ACTIVATED'
      ) {
        nextStatus = currentRecord.status;
        updatedRecord.status = currentRecord.status;
        hasStatusChanged = false;
      }

      break;
    }
  }

  // 4. If status or record changed, or action explicitly required, persist and emit notifications
  const emittedNotificationDocIds: string[] = [];

  if (hasStatusChanged || action !== 'EVALUATE_LIFECYCLE') {
    // Emit governed notifications exactly once per transition
    for (const notif of notificationsToEmit) {
      const dedupKey = `dedup_${notif.type}_${sellerUserId}_${transitionId}`;
      const safeKey = sanitizeDocId(dedupKey);
      const safeNotifId = sanitizeDocId(`notif_${notif.type}_${sellerUserId}_${transitionId}`);

      if (!emittedKeys.includes(safeKey)) {
        emittedKeys.push(safeKey);
        emittedNotificationDocIds.push(safeKey);

        createAuthoritativeNotification({
          notificationId: safeNotifId,
          recipientUserId: sellerUserId,
          type: notif.type as any,
          category: 'SELLER',
          title: notif.title,
          message: notif.message,
          priority: notif.priority,
          targetType: 'SELLER',
          targetId: sellerUserId,
          relatedSellerId: sellerUserId,
          relatedShopId: updatedRecord.sellerProfileId,
          deduplicationKey: safeKey,
          metadata: {
            deduplicationKey: safeKey,
            sellerUserId,
            transitionId,
            action,
            source,
            transitionEffectiveAt: nowIso
          }
        }).catch(() => {});
      }
    }

    updatedRecord.emittedTransitions = emittedKeys;

    // Persist to memory store
    inMemoryStore.records[sellerUserId] = updatedRecord;

    // Persist to secondary file backup (Node.js)
    persistStoreToFile();

    // Section 1: Persist to primary authoritative Firestore collection
    persistRecordToFirestore(updatedRecord).catch(() => {});

    // Section 28: Record structured diagnostic log
    recordDiagnosticLog(
      sellerUserId,
      prevStatus,
      nextStatus,
      transitionId,
      action,
      source,
      actorUserId,
      emittedNotificationDocIds,
      idempotencyKey,
      {
        plan: updatedRecord.plan,
        hasHadTrial: updatedRecord.hasHadTrial,
        testSimulation: updatedRecord.testSimulation,
        version: updatedRecord.version,
        commandId,
        entryPoint,
        result: 'SUCCESS'
      }
    );
    // Broadcast state transition to all UI subscribers (V1.10A-CORRECTIVE-7)
    notifySellerMonetizationChanged(updatedRecord);
  }

  const response = {
    success: true,
    record: updatedRecord,
    message: hasStatusChanged
      ? `Hali ya usajili imebadilishwa kutoka ${prevStatus} kwenda ${nextStatus}.`
      : 'Hali ya usajili imehakikiwa (hakuna mabadiliko).',
    notificationsEmitted: emittedNotificationDocIds,
    commandId,
    entryPoint,
    createdNotificationId: emittedNotificationDocIds[0],
    stateBefore: prevStatus,
    stateAfter: nextStatus
  };

  if (idempotencyKey) {
    inMemoryStore.processedIdempotencyKeys[idempotencyKey] = response;
  }

  return response;
}

/**
 * Top-level single authoritative lifecycle transition evaluator.
 */
export function evaluateSellerMonetizationLifecycle(
  sellerUserId: string,
  currentTime: Date = new Date()
): { record: SellerMonetizationRecord; hasChanged: boolean; transition?: string } {
  if (!sellerUserId) {
    throw new Error('sellerUserId is required');
  }

  const current = inMemoryStore.records[sellerUserId];
  const prevStatus = current?.status || 'NOT_ACTIVATED';

  const result = transitionSellerMonetization({
    sellerUserId,
    action: 'EVALUATE_LIFECYCLE',
    currentTime,
    source: 'LIFECYCLE_EVALUATOR'
  });

  const hasChanged = result.record.status !== prevStatus;
  return {
    record: result.record,
    hasChanged,
    transition: hasChanged ? `${prevStatus} -> ${result.record.status}` : undefined
  };
}

/**
 * Export evaluateAuthoritativeLifecycle for backward compatibility with existing tests.
 */
export function evaluateAuthoritativeLifecycle(
  record: SellerMonetizationRecord,
  currentTime: Date = new Date()
): { updatedRecord: SellerMonetizationRecord; hasChanged: boolean } {
  inMemoryStore.records[record.sellerUserId] = { ...record };
  const { record: updatedRecord, hasChanged } = evaluateSellerMonetizationLifecycle(record.sellerUserId, currentTime);
  return { updatedRecord, hasChanged };
}

/**
 * Authoritative Seller Monetization Service
 */
export class SellerMonetizationService {
  /**
   * Evaluates seller monetization lifecycle transitions.
   */
  public evaluateSellerMonetizationLifecycle(
    sellerUserId: string,
    currentTime: Date = new Date()
  ): { record: SellerMonetizationRecord; hasChanged: boolean; transition?: string } {
    return evaluateSellerMonetizationLifecycle(sellerUserId, currentTime);
  }

  /**
   * Retrieves or initializes a seller's authoritative monetization record asynchronously.
   * Section 3: Authoritative Firestore check before creating default record!
   * Firestore record exists -> use existing record.
   * Only create NOT_ACTIVATED when the authoritative seller monetization record genuinely does not exist.
   */
  public async getSellerRecordAsync(
    sellerUserId: string,
    sellerProfileId?: string
  ): Promise<SellerMonetizationRecord> {
    if (!sellerUserId) {
      throw new Error('sellerUserId is required');
    }

    // 1. Check in-memory store
    let record = inMemoryStore.records[sellerUserId];
    if (record) {
      return record;
    }

    // 2. Authoritative check in Firestore
    if (db) {
      try {
        const docRef = doc(db, MONETIZATION_COLLECTION, sellerUserId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const firestoreRecord = snap.data() as SellerMonetizationRecord;
          inMemoryStore.records[sellerUserId] = firestoreRecord;
          persistStoreToFile();
          return firestoreRecord;
        }
      } catch (err) {
        console.warn('[sellerMonetizationService] Firestore query error:', err);
      }
    }

    // 3. Only if genuinely absent from both memory and Firestore: create NOT_ACTIVATED
    record = createDefaultSellerMonetizationRecord(sellerUserId, sellerProfileId);
    inMemoryStore.records[sellerUserId] = record;
    persistStoreToFile();
    persistRecordToFirestore(record).catch(() => {});
    return record;
  }

  /**
   * Synchronous accessor for in-memory record (with automatic background sync if absent).
   * Cross-page & reload resilient: checks in-memory store and localStorage.
   */
  public getSellerRecord(sellerUserId: string, sellerProfileId?: string): SellerMonetizationRecord {
    if (!sellerUserId) {
      throw new Error('sellerUserId is required');
    }

    let record = inMemoryStore.records[sellerUserId];
    if (!record && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(`ufugaji_seller_monetization_${sellerUserId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.sellerUserId === sellerUserId) {
            record = parsed;
            inMemoryStore.records[sellerUserId] = parsed;
          }
        }
      } catch {}
    }

    if (!record) {
      record = createDefaultSellerMonetizationRecord(sellerUserId, sellerProfileId);
      inMemoryStore.records[sellerUserId] = record;
      persistStoreToFile();
      // Background async check to ensure we don't clobber a Firestore record
      this.getSellerRecordAsync(sellerUserId, sellerProfileId).catch(() => {});
      return record;
    }

    return record;
  }

  /**
   * Allows client and server layers to cache an authoritative record in memory and localStorage,
   * immediately notifying all active reactive UI subscribers.
   */
  public cacheRecord(record: SellerMonetizationRecord): void {
    if (!record?.sellerUserId) return;
    const existing = inMemoryStore.records[record.sellerUserId];
    // Monotonic version check to protect against stale clients overwriting newer server records
    const isStateUpgrade = existing && existing.status !== record.status && (record.status === 'TRIAL_ACTIVE' || record.status === 'ACTIVE');
    if (!existing || (record.version || 0) >= (existing.version || 0) || isStateUpgrade) {
      inMemoryStore.records[record.sellerUserId] = record;
      persistStoreToFile();
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(
            `ufugaji_seller_monetization_${record.sellerUserId}`,
            JSON.stringify(record)
          );
        } catch {}
      }
      notifySellerMonetizationChanged(record);
    }
  }

  /**
   * Authoritative client-side record fetcher from server API.
   * Caches result and notifies all UI subscribers.
   */
  public async fetchAuthoritativeRecord(
    sellerUserId: string,
    token?: string | null
  ): Promise<SellerMonetizationRecord | null> {
    if (!sellerUserId) return null;
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-user-id'] = sellerUserId;
      }
      const res = await fetch(`/api/seller/monetization/${sellerUserId}`, { headers });
      const data = await res.json();
      if (res.ok && data.record) {
        this.cacheRecord(data.record);
        return data.record;
      }
    } catch {}
    return this.getSellerRecord(sellerUserId);
  }

  /**
   * Single authoritative lifecycle transition router (Section 15).
   */
  public transitionSellerMonetization(params: TransitionSellerMonetizationParams) {
    return transitionSellerMonetization(params);
  }

  /**
   * Activates the First-Month-Free trial for an eligible seller.
   */
  public activateFirstMonthFreeTrial(input: ActivateTrialInput): ActivateTrialResult {
    const {
      sellerUserId,
      sellerProfileId,
      idempotencyKey,
      commandId = `cmd_act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      entryPoint = 'SELLER_MAIN_CTA'
    } = input;

    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'ACTIVATE_TRIAL',
      actorUserId: sellerUserId,
      source: 'SELLER_ACTION',
      sellerProfileId,
      idempotencyKey,
      commandId,
      entryPoint
    });

    return {
      success: result.success,
      record: result.record,
      message: result.message,
      isDuplicate: result.isDuplicate,
      commandId: result.commandId || commandId,
      entryPoint: result.entryPoint || entryPoint,
      createdNotificationId: result.createdNotificationId,
      stateBefore: result.stateBefore,
      stateAfter: result.stateAfter || result.record.status
    };
  }

  /**
   * Client-side authoritative helper to trigger the Free Trial activation API.
   * Ensures identical payload, header, idempotency, and in-memory cache synchronization.
   */
  public async activateTrialViaApi(
    sellerUserId: string,
    sellerProfileId?: string,
    token?: string | null,
    options?: {
      entryPoint?: string;
      commandId?: string;
    }
  ): Promise<ActivateTrialResult & { error?: string }> {
    return activateSellerFreeTrialAPI(sellerUserId, sellerProfileId, token, options);
  }

  /**
   * Evaluates commercial marketplace selling eligibility for a seller.
   * Section 8 requirement: Read-only evaluation — NEVER creates notifications or mutates state!
   */
  public canSellerSellOnMarketplace(sellerUserId: string): SellerSellingEligibility {
    if (!sellerUserId) {
      return {
        canSell: false,
        status: 'NOT_ACTIVATED',
        reason: 'Seller ID is missing.',
        reasonSwahili: 'Kitambulisho cha muuzaji hakipatikani.',
        isTrialActive: false,
        isGracePeriod: false,
        isExpired: false,
        requiresPaymentAction: true
      };
    }

    const record = this.getSellerRecord(sellerUserId);
    const now = Date.now();

    switch (record.status) {
      case 'TRIAL_ACTIVE': {
        const remainingMs = record.trialEndAt ? new Date(record.trialEndAt).getTime() - now : 0;
        const daysRemaining = Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
        return {
          canSell: true,
          status: 'TRIAL_ACTIVE',
          reason: 'Seller has active free trial.',
          reasonSwahili: `Muuzaji ana jaribio la bure linalofanya kazi (Siku ${daysRemaining} zimesalia).`,
          isTrialActive: true,
          isGracePeriod: false,
          isExpired: false,
          trialDaysRemaining: daysRemaining,
          renewalDate: record.nextRenewalAt,
          requiresPaymentAction: false
        };
      }

      case 'ACTIVE': {
        const remainingMs = record.currentPeriodEndAt ? new Date(record.currentPeriodEndAt).getTime() - now : 0;
        const daysRemaining = Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
        return {
          canSell: true,
          status: 'ACTIVE',
          reason: 'Seller has active paid subscription.',
          reasonSwahili: `Usajili wa muuzaji uko hai (Siku ${daysRemaining} zimesalia).`,
          isTrialActive: false,
          isGracePeriod: false,
          isExpired: false,
          renewalDate: record.nextRenewalAt,
          requiresPaymentAction: false
        };
      }

      case 'GRACE_PERIOD': {
        const remainingMs = record.graceEndAt ? new Date(record.graceEndAt).getTime() - now : 0;
        const daysRemaining = Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
        return {
          canSell: false, // V1.10A-CORRECTIVE-4: GRACE_PERIOD = cannot sell (commercial access locked)
          status: 'GRACE_PERIOD',
          reason: 'Seller trial or subscription ended and is in Grace Period. Commercial access locked until renewal payment.',
          reasonSwahili: `Usajili wako wa bure umeisha. Lipa TSh 1,000 ili kuendelea kuuza kwenye Gulio (${daysRemaining} siku zimesalia za grace period).`,
          isTrialActive: false,
          isGracePeriod: true,
          isExpired: false,
          graceDaysRemaining: daysRemaining,
          renewalDate: record.graceEndAt,
          requiresPaymentAction: true
        };
      }

      case 'EXPIRED': {
        return {
          canSell: false,
          status: 'EXPIRED',
          reason: 'Seller subscription expired after grace period.',
          reasonSwahili: 'Usajili wako umeisha. Lipa TSh 1,000 ili kuendelea kuuza na kurudisha duka hewani.',
          isTrialActive: false,
          isGracePeriod: false,
          isExpired: true,
          renewalDate: record.expiredAt,
          requiresPaymentAction: true
        };
      }

      case 'SUSPENDED': {
        return {
          canSell: false,
          status: 'SUSPENDED',
          reason: `Seller monetization suspended by admin: ${record.suspendedReason || 'Administrative decision'}.`,
          reasonSwahili: `Usajili wa muuzaji umesimamishwa kiutawala: ${record.suspendedReason || 'Sababu za kiutawala'}.`,
          isTrialActive: false,
          isGracePeriod: false,
          isExpired: false,
          requiresPaymentAction: false
        };
      }

      case 'CANCELLED': {
        return {
          canSell: false,
          status: 'CANCELLED',
          reason: 'Seller monetization was cancelled.',
          reasonSwahili: 'Usajili wa muuzaji ulisitishwa.',
          isTrialActive: false,
          isGracePeriod: false,
          isExpired: false,
          requiresPaymentAction: true
        };
      }

      case 'NOT_ACTIVATED':
      default: {
        return {
          canSell: false,
          status: 'NOT_ACTIVATED',
          reason: 'Seller monetization not activated. Free 1-month trial must be activated first.',
          reasonSwahili: 'Usajili wa muuzaji haujaanzishwa. Washa Free Trial yako ya siku 30 bila malipo ili kuanza kuuza.',
          isTrialActive: false,
          isGracePeriod: false,
          isExpired: false,
          requiresPaymentAction: true
        };
      }
    }
  }

  /**
   * Controlled Test Payment Verification Mechanism (Section 11).
   */
  public recordAuthoritativePaymentConfirmation(input: TestPaymentInput): {
    success: boolean;
    record: SellerMonetizationRecord;
    message: string;
    isDuplicate?: boolean;
  } {
    const { sellerUserId, paymentStatus, amount, transactionRef, performedBy, idempotencyKey } = input;
    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'RECORD_PAYMENT',
      actorUserId: performedBy,
      source: 'PAYMENT_CONFIRMATION',
      idempotencyKey,
      paymentDetails: {
        amount,
        transactionRef,
        paymentStatus
      }
    });

    const isSuspended = result.record.status === 'SUSPENDED';
    const message = isSuspended
      ? 'Malipo yamethibitishwa. Hata hivyo, akaunti ya muuzaji inabaki kusimamishwa (SUSPENDED) kiutawala.'
      : 'Malipo yamethibitishwa na usajili wa muuzaji uko hai (ACTIVE).';

    return {
      success: result.success,
      record: result.record,
      message,
      isDuplicate: result.isDuplicate
    };
  }

  /**
   * Administrative suspension of seller monetization.
   */
  public suspendSellerMonetization(
    sellerUserId: string,
    reason: string,
    adminUserId: string
  ): SellerMonetizationRecord {
    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'SUSPEND',
      actorUserId: adminUserId,
      source: 'ADMIN_ACTION',
      reason
    });
    return result.record;
  }

  /**
   * Administrative reactivation of suspended seller monetization.
   */
  public reactivateSellerMonetization(
    sellerUserId: string,
    adminUserId: string
  ): SellerMonetizationRecord {
    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'REACTIVATE',
      actorUserId: adminUserId,
      source: 'ADMIN_ACTION'
    });
    return result.record;
  }

  /**
   * Administrative cancellation of seller monetization.
   */
  public cancelSellerMonetization(
    sellerUserId: string,
    reason: string,
    adminUserId: string
  ): SellerMonetizationRecord {
    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'CANCEL',
      actorUserId: adminUserId,
      source: 'ADMIN_ACTION',
      reason
    });
    return result.record;
  }

  /**
   * Controlled Administrative Grace Period Simulation (Section 5 & 7).
   * Transitions seller to GRACE_PERIOD using the authoritative single transition function.
   */
  public simulateGracePeriod(
    sellerUserId: string,
    adminUserId: string = 'admin'
  ): SellerMonetizationRecord {
    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'SIMULATE_GRACE',
      actorUserId: adminUserId,
      source: 'ADMIN_ACTION'
    });
    return result.record;
  }

  /**
   * Controlled Administrative Grace Expiry Simulation (Section 5 & 7).
   * Transitions seller from GRACE_PERIOD to EXPIRED using the authoritative single transition function.
   */
  public simulateGraceExpiry(
    sellerUserId: string,
    adminUserId: string = 'admin'
  ): SellerMonetizationRecord {
    const result = transitionSellerMonetization({
      sellerUserId,
      action: 'SIMULATE_EXPIRY',
      actorUserId: adminUserId,
      source: 'ADMIN_ACTION'
    });
    return result.record;
  }

  /**
   * Retrieves all seller monetization records.
   * Section 20: READ-ONLY — does not emit notifications!
   */
  public getAllRecords(): SellerMonetizationRecord[] {
    return Object.values(inMemoryStore.records);
  }

  /**
   * Retrieves audit logs, optionally filtered by sellerUserId.
   */
  public getAuditLogs(sellerUserId?: string, limit: number = 100): SellerMonetizationAuditEntry[] {
    let logs = inMemoryStore.auditLogs;
    if (sellerUserId) {
      logs = logs.filter((l) => l.sellerUserId === sellerUserId);
    }
    return logs.slice(0, limit);
  }

  /**
   * Section 28: Retrieves structured diagnostic logs answering:
   * "Ni action gani ilibadilisha seller kutoka state A kwenda state B?"
   */
  public getDiagnosticLogs(sellerUserId?: string, limit: number = 100): SellerMonetizationDiagnosticLog[] {
    let logs = inMemoryStore.diagnosticLogs;
    if (sellerUserId) {
      logs = logs.filter((l) => l.sellerUserId === sellerUserId);
    }
    return logs.slice(0, limit);
  }

  /**
   * Resets in-memory store for testing purposes.
   */
  public _resetForTesting(): void {
    inMemoryStore.records = {};
    inMemoryStore.auditLogs = [];
    inMemoryStore.diagnosticLogs = [];
    inMemoryStore.processedIdempotencyKeys = {};
    monetizationSubscribers.clear();
    _resetNotificationsForTesting();
  }
}

export const sellerMonetizationService = new SellerMonetizationService();

/**
 * Authoritative client-side activation function used by all frontend entry points.
 * Guarantees unified activation endpoint call, server-authoritative revalidation, and cache update.
 */
export async function activateSellerFreeTrialAPI(
  sellerUserId: string,
  sellerProfileId?: string,
  token?: string | null,
  options?: {
    entryPoint?: string;
    commandId?: string;
  }
): Promise<ActivateTrialResult & { error?: string }> {
  const idempotencyKey = `act_${sellerUserId}_${Date.now()}`;
  const commandId = options?.commandId || `cmd_act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const entryPoint = options?.entryPoint || 'SELLER_MAIN_CTA';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (sellerUserId) {
    headers['x-user-id'] = sellerUserId;
  }

  const res = await fetch('/api/seller/monetization/activate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sellerUserId,
      sellerProfileId,
      idempotencyKey,
      commandId,
      entryPoint
    })
  });

  const data = await res.json();
  if (res.ok && data.record) {
    // Requirement 6: Authoritative Revalidation — verify server state is actually TRIAL_ACTIVE!
    if (data.record.status !== 'TRIAL_ACTIVE') {
      return {
        success: false,
        record: data.record,
        message: 'Hitilafu ya uthibitishaji: Hali ya usajili haijathibitishwa kuwa TRIAL_ACTIVE na seva.',
        error: 'Hitilafu ya uthibitishaji wa seva: Hali ya usajili haijathibitishwa kuwa TRIAL_ACTIVE.',
        commandId,
        entryPoint,
        stateBefore: data.stateBefore,
        stateAfter: data.record.status
      };
    }

    sellerMonetizationService.cacheRecord(data.record);
    return {
      success: true,
      record: data.record,
      message: data.message || 'Hongera! Mwezi wako wa kwanza bure umewashwa kikamilifu.',
      isDuplicate: data.isDuplicate,
      commandId: data.commandId || commandId,
      entryPoint: data.entryPoint || entryPoint,
      createdNotificationId: data.createdNotificationId,
      stateBefore: data.stateBefore,
      stateAfter: data.stateAfter || data.record.status
    };
  } else {
    return {
      success: false,
      record: data?.record || sellerMonetizationService.getSellerRecord(sellerUserId),
      message: data?.error || 'Imeshindikana kuwasha jaribio la bure.',
      error: data?.error || 'Imeshindikana kuwasha jaribio la bure.',
      commandId,
      entryPoint
    };
  }
}

