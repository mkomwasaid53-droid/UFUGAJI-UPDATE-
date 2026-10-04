/**
 * Ufugaji Platform Notification Service (V1.7H)
 * Authoritative notification foundation supporting Marketplace Governance,
 * Admin Moderation Inbox, Seller Governance, and platform-wide events.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit as firestoreLimit,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { classifyFirestoreError } from '../utils/firestoreErrorClassifier';
import {
  AppNotification,
  CreateNotificationInput,
  NotificationPriority,
  NotificationCategory
} from '../types/notification';

const NOTIFICATIONS_COLLECTION = 'userNotifications';
const ADMIN_GROUP_RECIPIENT = 'ADMIN_GROUP';

const isNode = typeof window === 'undefined' || !window.location || !window.location.origin;

// In-Memory cache map for Node.js / test environments where localStorage is absent
const inMemoryNodeNotifications = new Map<string, AppNotification[]>();

interface NotificationSubscriber {
  userId: string;
  isAdmin: boolean;
  callback: (notifications: AppNotification[]) => void;
}

const activeSubscribers = new Set<NotificationSubscriber>();

function notifySubscribers(userId: string) {
  for (const sub of activeSubscribers) {
    if (sub.userId === userId || (sub.isAdmin && userId === ADMIN_GROUP_RECIPIENT)) {
      const userList = getLocalCachedNotifications(sub.userId);
      const adminList = sub.isAdmin ? getLocalCachedNotifications(ADMIN_GROUP_RECIPIENT) : [];
      const combinedMap = new Map<string, AppNotification>();
      for (const n of [...userList, ...adminList]) {
        if (n && n.notificationId) combinedMap.set(n.notificationId, n);
      }
      let combined = Array.from(combinedMap.values());
      combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      try {
        sub.callback(combined);
      } catch (err) {
        console.warn('Hitilafu kwenye callback ya arifa:', err);
      }
    }
  }
}

// Helper to get local cached notifications for a specific user
export function getLocalCachedNotifications(userId: string): AppNotification[] {
  if (!userId) return [];
  if (typeof localStorage === 'undefined') {
    return inMemoryNodeNotifications.get(userId) || [];
  }
  try {
    const raw = localStorage.getItem(`ufugaji_notifications_cache_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`Hitilafu ya kusoma arifa za mtumiaji ${userId}:`, err);
  }
  return inMemoryNodeNotifications.get(userId) || [];
}

// Helper to save notifications to local cache
export function saveNotificationsToCache(userId: string, notifications: AppNotification[]): void {
  if (!userId) return;
  const slice = notifications.slice(0, 100);
  inMemoryNodeNotifications.set(userId, slice);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`ufugaji_notifications_cache_${userId}`, JSON.stringify(slice));
    } catch (err) {
      console.warn(`Hitilafu ya kuhifadhi arifa za mtumiaji ${userId}:`, err);
    }
  }
  notifySubscribers(userId);
}

/**
 * Resets notifications store for testing purposes.
 */
export function _resetNotificationsForTesting(): void {
  inMemoryNodeNotifications.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ufugaji_notifications_cache_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
}

/**
 * Creates an authoritative notification in the system.
 * Enforces deduplication on recurring events (e.g. deduplicationKey, moderationId, or warningId).
 */
export async function createAuthoritativeNotification(
  input: CreateNotificationInput
): Promise<AppNotification> {
  const now = new Date().toISOString();
  const recipient = input.recipientUserId || 'SYSTEM';

  const rawKey = input.deduplicationKey || input.metadata?.deduplicationKey;
  let notificationId = input.notificationId;
  if (!notificationId && rawKey) {
    const cleanKey = String(rawKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    notificationId = cleanKey.startsWith('notif_') ? cleanKey.slice(0, 100) : `notif_${cleanKey}`.slice(0, 100);
  }
  if (!notificationId) {
    notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // 1. Deduplication check against local/in-memory cache
  const cached = getLocalCachedNotifications(recipient);
  const existingDup = cached.find((n) => {
    // Exact notificationId match
    if (n.notificationId === notificationId) return true;

    // Explicit deterministic deduplication identity (e.g. sellerUserId_transitionType_timestamp)
    if (input.deduplicationKey && n.deduplicationKey === input.deduplicationKey) return true;
    if (input.deduplicationKey && n.metadata?.deduplicationKey === input.deduplicationKey) return true;

    if (n.type !== input.type) return false;

    // Check metadata deduplicationKey if input has metadata.deduplicationKey
    if (input.metadata?.deduplicationKey && n.metadata?.deduplicationKey === input.metadata.deduplicationKey) return true;

    // Entity-based deduplication
    if (input.relatedModerationId && n.relatedModerationId === input.relatedModerationId) return true;
    if (input.relatedWarningId && n.relatedWarningId === input.relatedWarningId) return true;
    if (input.relatedRestrictionId && n.relatedRestrictionId === input.relatedRestrictionId) return true;
    if (input.relatedAppealId && n.relatedAppealId === input.relatedAppealId) return true;
    if (input.relatedReportId && n.relatedReportId === input.relatedReportId) return true;
    return false;
  });

  if (existingDup) {
    return existingDup;
  }

  const notification: AppNotification = {
    notificationId,
    recipientUserId: recipient,
    type: input.type,
    category: input.category,
    title: input.title.trim(),
    message: input.message.trim(),
    read: false,
    readAt: null,
    priority: input.priority || 'NORMAL',
    targetType: input.targetType,
    targetId: input.targetId,
    relatedProductId: input.relatedProductId,
    relatedListingId: input.relatedListingId,
    relatedShopId: input.relatedShopId,
    relatedSellerId: input.relatedSellerId,
    relatedReportId: input.relatedReportId,
    relatedModerationId: input.relatedModerationId,
    relatedWarningId: input.relatedWarningId,
    relatedRestrictionId: input.relatedRestrictionId,
    relatedAppealId: input.relatedAppealId,
    actionUrl: input.actionUrl,
    createdAt: now,
    expiresAt: input.expiresAt,
    deduplicationKey: input.deduplicationKey,
    metadata: {
      ...input.metadata,
      deduplicationKey: input.deduplicationKey || input.metadata?.deduplicationKey
    }
  };

  // 2. Save to local/in-memory cache immediately
  const updated = [notification, ...cached.filter((n) => n.notificationId !== notificationId)];
  saveNotificationsToCache(recipient, updated);

  // 3. Persist to Firestore idempotently in both Node and Browser (Section 19)
  if (db) {
    try {
      const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
      await setDoc(notifRef, notification, { merge: true });
    } catch (err) {
      // Graceful fallback to local cache if network or unauthenticated in testing
      console.warn('[notificationService] Firestore persistence notice (cached locally):', err);
    }
  }

  return notification;
}

/**
 * Fetches notifications for an authenticated user.
 * Cross-user isolation: Regular users only see their own notifications.
 * Admins also see 'ADMIN_GROUP' broadcast notifications.
 */
export async function fetchUserNotifications(
  userId: string,
  isAdmin: boolean = false,
  options?: { unreadOnly?: boolean; limitCount?: number }
): Promise<AppNotification[]> {
  if (!userId) return [];

  const localList = getLocalCachedNotifications(userId);
  const localAdminList = isAdmin ? getLocalCachedNotifications(ADMIN_GROUP_RECIPIENT) : [];

  const notifMap = new Map<string, AppNotification>();
  for (const n of [...localList, ...localAdminList]) {
    if (n && n.notificationId) notifMap.set(n.notificationId, n);
  }

  const maxItems = options?.limitCount || 50;

  if (!isNode) {
    const activeAuthUser = auth.currentUser;
    // Guard: Only query Firestore if authenticated user session is active and matches requested userId
    if (!activeAuthUser || activeAuthUser.uid !== userId) {
      // Return cached/local results immediately without throwing unauthenticated Firestore queries
      let cachedResults = Array.from(notifMap.values());
      cachedResults = cachedResults.filter((n) => {
        if (n.recipientUserId === userId) return true;
        if (isAdmin && n.recipientUserId === ADMIN_GROUP_RECIPIENT) return true;
        return false;
      });
      cachedResults.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      if (options?.unreadOnly) {
        cachedResults = cachedResults.filter((n) => !n.read);
      }
      return cachedResults.slice(0, maxItems);
    }

    try {
      // Ensure token is current
      await activeAuthUser.getIdToken();
      const colRef = collection(db, NOTIFICATIONS_COLLECTION);
    
      // Query for user's direct notifications (recipient-based isolation)
      const userQ = query(
        colRef,
        where('recipientUserId', '==', userId),
        firestoreLimit(maxItems)
      );
      const snap = await getDocs(userQ);
      snap.docs.forEach((d) => {
        const data = d.data() as AppNotification;
        notifMap.set(data.notificationId || d.id, { ...data, notificationId: d.id });
      });

      // If admin, execute separate explicitly authorized admin query for ADMIN_GROUP
      if (isAdmin) {
        try {
          const adminQ = query(
            colRef,
            where('recipientUserId', '==', ADMIN_GROUP_RECIPIENT),
            firestoreLimit(maxItems)
          );
          const adminSnap = await getDocs(adminQ);
          adminSnap.docs.forEach((d) => {
            const data = d.data() as AppNotification;
            notifMap.set(data.notificationId || d.id, { ...data, notificationId: d.id });
          });
        } catch (adminErr) {
          const classifiedAdmin = classifyFirestoreError(adminErr);
          console.debug(`[${classifiedAdmin.code}] Arifa za utawala (ADMIN_GROUP):`, classifiedAdmin.message);
        }
      }
    } catch (err) {
      const classified = classifyFirestoreError(err);
      console.debug(`[${classified.code}] Arifa za mtumiaji:`, classified.message);
    }
  }

  let results = Array.from(notifMap.values());

  // Filter cross-user isolation: only include recipientUserId === userId OR (isAdmin && recipientUserId === 'ADMIN_GROUP')
  results = results.filter((n) => {
    if (n.recipientUserId === userId) return true;
    if (isAdmin && n.recipientUserId === ADMIN_GROUP_RECIPIENT) return true;
    return false;
  });

  // Sort newest first
  results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // Cache back
  const userResults = results.filter((n) => n.recipientUserId === userId);
  saveNotificationsToCache(userId, userResults);
  if (isAdmin) {
    const adminResults = results.filter((n) => n.recipientUserId === ADMIN_GROUP_RECIPIENT);
    saveNotificationsToCache(ADMIN_GROUP_RECIPIENT, adminResults);
  }

  if (options?.unreadOnly) {
    results = results.filter((n) => !n.read);
  }

  return results.slice(0, maxItems);
}

/**
 * Calculates unread count quickly for badge displays
 */
export function calculateUnreadCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}

/**
 * Marks a specific notification as read.
 * Enforces ownership check.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
  isAdmin: boolean = false
): Promise<boolean> {
  if (!userId || !notificationId) return false;

  const now = new Date().toISOString();

  // 1. Update local cache
  const updateCache = (key: string) => {
    const cached = getLocalCachedNotifications(key);
    let found = false;
    const updated = cached.map((n) => {
      if (n.notificationId === notificationId) {
        // Enforce ownership
        if (n.recipientUserId !== userId && !(isAdmin && n.recipientUserId === ADMIN_GROUP_RECIPIENT)) {
          return n;
        }
        found = true;
        return { ...n, read: true, readAt: now };
      }
      return n;
    });
    if (found) {
      saveNotificationsToCache(key, updated);
    }
    return found;
  };

  const foundInUser = updateCache(userId);
  const foundInAdmin = isAdmin ? updateCache(ADMIN_GROUP_RECIPIENT) : false;

  // 2. Update Firestore
  if (!isNode) {
    const activeAuthUser = auth.currentUser;
    if (activeAuthUser) {
      try {
        await activeAuthUser.getIdToken();
        const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
        await updateDoc(notifRef, {
          read: true,
          readAt: now
        });
        return true;
      } catch (err) {
        const classified = classifyFirestoreError(err);
        console.warn(`[${classified.code}] Kusasisha arifa kama imesomwa:`, classified.message);
        return foundInUser || foundInAdmin;
      }
    }
  }

  return foundInUser || foundInAdmin;
}

/**
 * Marks all notifications for a user as read.
 */
export async function markAllNotificationsAsRead(
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  if (!userId) return;

  const now = new Date().toISOString();

  // Local update
  const userCached = getLocalCachedNotifications(userId);
  const updatedUser = userCached.map((n) => ({ ...n, read: true, readAt: n.readAt || now }));
  saveNotificationsToCache(userId, updatedUser);

  if (isAdmin) {
    const adminCached = getLocalCachedNotifications(ADMIN_GROUP_RECIPIENT);
    const updatedAdmin = adminCached.map((n) => ({ ...n, read: true, readAt: n.readAt || now }));
    saveNotificationsToCache(ADMIN_GROUP_RECIPIENT, updatedAdmin);
  }

  // Firestore update for unread items
  if (!isNode) {
    const unreadItems = [...userCached, ...(isAdmin ? getLocalCachedNotifications(ADMIN_GROUP_RECIPIENT) : [])].filter(
      (n) => !n.read
    );

    for (const item of unreadItems) {
      try {
        const ref = doc(db, NOTIFICATIONS_COLLECTION, item.notificationId);
        await updateDoc(ref, { read: true, readAt: now });
      } catch {
        // Ignore individual sync failure
      }
    }
  }
}

/**
 * Single controlled listener for user notifications (V1.10A-Corrective-2 Section 10 & 11).
 * - waits for auth readiness (guards on userId);
 * - uses recipientUserId;
 * - cleans up on logout/unmount;
 * - does not duplicate listeners;
 * - does not trigger lifecycle mutations;
 * - does not create notifications.
 */
export function subscribeToUserNotifications(
  userId: string,
  isAdmin: boolean,
  callback: (notifications: AppNotification[]) => void
): () => void {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const subscriber: NotificationSubscriber = {
    userId,
    isAdmin,
    callback
  };

  activeSubscribers.add(subscriber);

  // 1. Immediately emit current cached state
  const initialUserList = getLocalCachedNotifications(userId);
  const initialAdminList = isAdmin ? getLocalCachedNotifications(ADMIN_GROUP_RECIPIENT) : [];
  const map = new Map<string, AppNotification>();
  for (const n of [...initialUserList, ...initialAdminList]) {
    if (n && n.notificationId) map.set(n.notificationId, n);
  }
  let initialList = Array.from(map.values());
  initialList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  try {
    callback(initialList);
  } catch (err) {
    console.warn('Hitilafu ya kutoa arifa za mwanzo:', err);
  }

  // 2. Attach Firestore listener if in browser and authenticated
  const unsubs: Unsubscribe[] = [];

  if (!isNode) {
    const activeAuthUser = auth.currentUser;
    if (activeAuthUser && activeAuthUser.uid === userId) {
      try {
        const colRef = collection(db, NOTIFICATIONS_COLLECTION);
        const userQ = query(
          colRef,
          where('recipientUserId', '==', userId),
          firestoreLimit(50)
        );

        const unsubUser = onSnapshot(
          userQ,
          (snapshot) => {
            const incoming: AppNotification[] = [];
            snapshot.forEach((d) => {
              incoming.push({ ...(d.data() as AppNotification), notificationId: d.id });
            });
            // Merge into cache and notify
            const currentCache = getLocalCachedNotifications(userId);
            const m = new Map<string, AppNotification>();
            for (const n of currentCache) {
              if (n && n.notificationId) m.set(n.notificationId, n);
            }
            for (const n of incoming) {
              if (n && n.notificationId) m.set(n.notificationId, n);
            }
            const merged = Array.from(m.values()).sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            saveNotificationsToCache(userId, merged);
          },
          (err) => {
            const classified = classifyFirestoreError(err);
            console.debug(`[${classified.code}] Snapshot listener ya arifa:`, classified.message);
          }
        );
        unsubs.push(unsubUser);

        if (isAdmin) {
          const adminQ = query(
            colRef,
            where('recipientUserId', '==', ADMIN_GROUP_RECIPIENT),
            firestoreLimit(50)
          );
          const unsubAdmin = onSnapshot(
            adminQ,
            (snapshot) => {
              const incoming: AppNotification[] = [];
              snapshot.forEach((d) => {
                incoming.push({ ...(d.data() as AppNotification), notificationId: d.id });
              });
              const currentCache = getLocalCachedNotifications(ADMIN_GROUP_RECIPIENT);
              const m = new Map<string, AppNotification>();
              for (const n of currentCache) {
                if (n && n.notificationId) m.set(n.notificationId, n);
              }
              for (const n of incoming) {
                if (n && n.notificationId) m.set(n.notificationId, n);
              }
              const merged = Array.from(m.values()).sort(
                (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              );
              saveNotificationsToCache(ADMIN_GROUP_RECIPIENT, merged);
            },
            (err) => {
              const classified = classifyFirestoreError(err);
              console.debug(`[${classified.code}] Snapshot admin listener:`, classified.message);
            }
          );
          unsubs.push(unsubAdmin);
        }
      } catch (err) {
        console.warn('Hitilafu ya kuanzisha Firestore snapshot listener:', err);
      }
    }
  }

  // 3. Clean up on unmount or user change
  return () => {
    activeSubscribers.delete(subscriber);
    for (const unsub of unsubs) {
      try {
        unsub();
      } catch {}
    }
  };
}

// ============================================================================
// AUTHORITATIVE GOVERNANCE EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatches a notification to the seller when a moderation action is taken.
 */
export async function dispatchModerationNotification(params: {
  sellerId: string;
  productId: string;
  productTitle: string;
  action: 'APPROVE' | 'REJECT' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'REQUEST_CORRECTION' | 'UNDER_REVIEW';
  moderationId: string;
  reasonCode?: string;
  publicReason?: string;
  correctionNote?: string;
}): Promise<AppNotification | null> {
  if (!params.sellerId) return null;

  let type: AppNotification['type'] = 'LISTING_UNDER_REVIEW';
  let title = 'Taarifa Kuhusu Tangazo Lako';
  let priority: NotificationPriority = 'NORMAL';
  let message = `Tangazo lako "${params.productTitle}" limekamilisha ukaguzi wa kiutawala.`;

  switch (params.action) {
    case 'REJECT':
      type = 'LISTING_REJECTED';
      title = 'Tangazo Lako Limekataliwa';
      priority = 'HIGH';
      message = `Tangazo lako "${params.productTitle}" limekataliwa baada ya ukaguzi wa kiutawala. Sababu: ${
        params.publicReason || 'Halikidhi vigezo vya ubora na usalama wa soko.'
      } Unaweza kurekebisha au kuwasilisha rufaa (appeal) endapo unaona uamuzi huu haukuwa sahihi.`;
      break;

    case 'HIDE':
      type = 'LISTING_HIDDEN';
      title = 'Tangazo Lako Limefichwa Sokoni';
      priority = 'NORMAL';
      message = `Tangazo lako "${params.productTitle}" limefichwa kwa muda ili kuzuia kuonekana hadharani. Sababu: ${
        params.publicReason || 'Ukaguzi wa ndani wa kiutawala.'
      }`;
      break;

    case 'SUSPEND':
      type = 'LISTING_SUSPENDED';
      title = 'Tangazo Lako Limesimamishwa';
      priority = 'HIGH';
      message = `Tangazo lako "${params.productTitle}" limesimamishwa kutokana na changamoto za kiutawala au usalama. Sababu: ${
        params.publicReason || 'Ukiukwaji wa miongozo ya soko.'
      } Unaweza kuwasilisha rufaa iwapo una ufafanuzi zaidi.`;
      break;

    case 'RESTORE':
      type = 'LISTING_RESTORED';
      title = 'Tangazo Lako Limerudishwa Sokoni';
      priority = 'NORMAL';
      message = `Tangazo lako "${params.productTitle}" limerudishwa na lipo hewani kwa wanunuzi baada ya ukaguzi kukamilika.`;
      break;

    case 'REQUEST_CORRECTION':
      type = 'CORRECTION_REQUESTED';
      title = 'Marekebisho Yanahitajika Kwenye Tangazo Lako';
      priority = 'HIGH';
      message = `Tafadhali fanya marekebisho kwenye tangazo "${params.productTitle}". Maelekezo: ${
        params.correctionNote || params.publicReason || 'Boresha maelezo au bei ili yakidhi vigezo.'
      }`;
      break;

    case 'UNDER_REVIEW':
      type = 'LISTING_UNDER_REVIEW';
      title = 'Tangazo Lako Linakaguliwa';
      priority = 'LOW';
      message = `Tangazo lako "${params.productTitle}" linapitiwa na jopo la wasimamizi wa jukwaa.`;
      break;

    case 'APPROVE':
      type = 'LISTING_RESTORED';
      title = 'Tangazo Lako Limeidhinishwa';
      priority = 'NORMAL';
      message = `Tangazo lako "${params.productTitle}" limekaguliwa na kuidhinishwa kuonekana sokoni kikamilifu.`;
      break;
  }

  return createAuthoritativeNotification({
    recipientUserId: params.sellerId,
    type,
    category: 'GOVERNANCE',
    title,
    message,
    priority,
    targetType: 'LISTING',
    targetId: params.productId,
    relatedProductId: params.productId,
    relatedListingId: params.productId,
    relatedSellerId: params.sellerId,
    relatedModerationId: params.moderationId,
    actionUrl: `/market?product=${params.productId}`
  });
}

/**
 * Dispatches a warning notification to a seller.
 */
export async function dispatchWarningNotification(params: {
  sellerId: string;
  warningId: string;
  severity: string;
  publicReason: string;
  correctionInstructions?: string;
}): Promise<AppNotification | null> {
  if (!params.sellerId) return null;

  const priority: NotificationPriority =
    params.severity === 'CRITICAL' || params.severity === 'SEVERE' ? 'URGENT' : 'HIGH';

  const message = `Akaunti yako imepewa onyo rasmi la kiutawala (${params.severity}). Sababu: ${params.publicReason}. ${
    params.correctionInstructions ? `Maelekezo: ${params.correctionInstructions}. ` : ''
  }Una haki ya kuwasilisha rufaa ikiwa unapinga onyo hili.`;

  return createAuthoritativeNotification({
    recipientUserId: params.sellerId,
    type: 'SELLER_WARNING_ISSUED',
    category: 'SELLER',
    title: `Onyo Rasmi la Kiutawala (${params.severity})`,
    message,
    priority,
    targetType: 'WARNING',
    targetId: params.warningId,
    relatedSellerId: params.sellerId,
    relatedWarningId: params.warningId,
    actionUrl: '/market'
  });
}

/**
 * Dispatches a restriction notification to a seller.
 */
export async function dispatchRestrictionNotification(params: {
  sellerId: string;
  restrictionId: string;
  restrictionType: string;
  reason: string;
  expiresAt?: string;
}): Promise<AppNotification | null> {
  if (!params.sellerId) return null;

  const expiryText = params.expiresAt
    ? `Kizuizi hiki kitadumu hadi ${new Date(params.expiresAt).toLocaleDateString('sw-TZ')}.`
    : 'Kizuizi hiki ni cha kudumu hadi utatuzi utakapofanyika.';

  const message = `Akaunti yako imewekewa kizuizi cha ${params.restrictionType}. Sababu: ${params.reason}. ${expiryText} Una haki ya kuwasilisha rufaa (appeal) kupitia jukwaa.`;

  return createAuthoritativeNotification({
    recipientUserId: params.sellerId,
    type: 'SELLER_RESTRICTION_APPLIED',
    category: 'SELLER',
    title: `Kizuizi Kimewekwa Kwenye Akaunti Yako (${params.restrictionType})`,
    message,
    priority: 'URGENT',
    targetType: 'RESTRICTION',
    targetId: params.restrictionId,
    relatedSellerId: params.sellerId,
    relatedRestrictionId: params.restrictionId,
    expiresAt: params.expiresAt,
    actionUrl: '/market'
  });
}

/**
 * Dispatches a notification when a restriction is lifted/revoked.
 */
export async function dispatchRestrictionRevokedNotification(params: {
  sellerId: string;
  restrictionId: string;
  revocationReason: string;
}): Promise<AppNotification | null> {
  if (!params.sellerId) return null;

  return createAuthoritativeNotification({
    recipientUserId: params.sellerId,
    type: 'SELLER_RESTRICTION_REVOKED',
    category: 'SELLER',
    title: 'Kizuizi cha Akaunti Kimeondolewa',
    message: `Kizuizi cha akaunti yako kimeondolewa rasmi na msimamizi. Ufafanuzi: ${params.revocationReason}. Sasa unaweza kuendelea na shughuli zako za kawaida sokoni.`,
    priority: 'NORMAL',
    targetType: 'RESTRICTION',
    targetId: params.restrictionId,
    relatedSellerId: params.sellerId,
    relatedRestrictionId: params.restrictionId,
    actionUrl: '/market'
  });
}

/**
 * Dispatches an administrative notification when a buyer/user files a report.
 */
export async function dispatchReportAdminNotification(params: {
  reportId: string;
  targetType: string;
  targetId: string;
  targetTitle?: string;
  reasonCategory: string;
}): Promise<AppNotification | null> {
  return createAuthoritativeNotification({
    recipientUserId: ADMIN_GROUP_RECIPIENT,
    type: 'REPORT_RECEIVED',
    category: 'GOVERNANCE',
    title: `Ripoti Mpya: ${params.reasonCategory}`,
    message: `Kuna ripoti mpya inayohitaji ukaguzi wa msimamizi kuhusu ${params.targetType} "${params.targetTitle || params.targetId}".`,
    priority: 'HIGH',
    targetType: 'REPORT',
    targetId: params.reportId,
    relatedReportId: params.reportId,
    actionUrl: '/admin'
  });
}

/**
 * Dispatches an administrative notification when a seller submits an appeal.
 */
export async function dispatchAppealAdminNotification(params: {
  appealId: string;
  sellerId: string;
  sellerName: string;
  targetType: string;
  targetId: string;
}): Promise<AppNotification | null> {
  return createAuthoritativeNotification({
    recipientUserId: ADMIN_GROUP_RECIPIENT,
    type: 'APPEAL_SUBMITTED',
    category: 'GOVERNANCE',
    title: `Rufaa Mpya Imewasilishwa: ${params.sellerName}`,
    message: `Muuzaji ${params.sellerName} amewasilisha rufaa dhidi ya ${params.targetType} (Kitambulisho: ${params.targetId}). Inahitaji ukaguzi na uamuzi.`,
    priority: 'HIGH',
    targetType: 'APPEAL',
    targetId: params.appealId,
    relatedAppealId: params.appealId,
    relatedSellerId: params.sellerId,
    actionUrl: '/admin'
  });
}

/**
 * Dispatches a notification to the seller when an admin makes an appeal decision.
 */
export async function dispatchAppealDecisionNotification(params: {
  sellerId: string;
  appealId: string;
  status: 'ACCEPTED' | 'REJECTED';
  adminDecisionSummary: string;
  targetType: string;
}): Promise<AppNotification | null> {
  if (!params.sellerId) return null;

  const isAccepted = params.status === 'ACCEPTED';
  const title = isAccepted ? 'Rufaa Yako Imekubaliwa' : 'Rufaa Yako Imekataliwa';
  const priority: NotificationPriority = isAccepted ? 'NORMAL' : 'HIGH';

  const message = isAccepted
    ? `Rufaa yako kuhusu ${params.targetType} imekubaliwa na msimamizi. Ufafanuzi: ${params.adminDecisionSummary}. Mabadiliko ya kiutawala yametekelezwa.`
    : `Rufaa yako kuhusu ${params.targetType} imekataliwa baada ya ukaguzi kamili. Uamuzi wa msimamizi: ${params.adminDecisionSummary}.`;

  return createAuthoritativeNotification({
    recipientUserId: params.sellerId,
    type: 'APPEAL_DECISION_MADE',
    category: 'GOVERNANCE',
    title,
    message,
    priority,
    targetType: 'APPEAL',
    targetId: params.appealId,
    relatedAppealId: params.appealId,
    relatedSellerId: params.sellerId,
    actionUrl: '/market'
  });
}

export const emitAppNotification = createAuthoritativeNotification;
