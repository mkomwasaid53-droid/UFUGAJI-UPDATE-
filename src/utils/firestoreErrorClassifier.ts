/**
 * Unified Firestore Error Classifier
 * Distinguishes precise error categories to prevent misleading "Missing or insufficient permissions"
 * messages when operations actually fail due to network drops, timeouts, auth timing, or missing indexes.
 */

export type FirestoreErrorCode =
  | 'FIRESTORE_PERMISSION_DENIED'
  | 'FIRESTORE_AUTH_NOT_READY'
  | 'FIRESTORE_NETWORK_ERROR'
  | 'FIRESTORE_TIMEOUT'
  | 'FIRESTORE_INDEX_ERROR'
  | 'FIRESTORE_NOT_FOUND'
  | 'FIRESTORE_UNKNOWN_ERROR';

export interface ClassifiedFirestoreError {
  code: FirestoreErrorCode;
  message: string;
  originalError: any;
  userFriendlyMessage: string;
}

export function classifyFirestoreError(err: any): ClassifiedFirestoreError {
  if (!err) {
    return {
      code: 'FIRESTORE_UNKNOWN_ERROR',
      message: 'Hitilafu isiyojulikana imetokea.',
      originalError: err,
      userFriendlyMessage: 'Kuna hitilafu imetokea, tafadhali jaribu tena.',
    };
  }

  const rawCode = String(err?.code || '').toLowerCase();
  const rawMessage = String(err?.message || err || '').toLowerCase();

  // 1. Auth not ready
  if (
    rawCode === 'unauthenticated' ||
    rawMessage.includes('auth not ready') ||
    rawMessage.includes('unauthenticated') ||
    rawMessage.includes('no authenticated user') ||
    rawMessage.includes('auth.currentuser is null')
  ) {
    return {
      code: 'FIRESTORE_AUTH_NOT_READY',
      message: err.message || 'Mtumiaji hajakamilisha uthibitisho wa kuingia.',
      originalError: err,
      userFriendlyMessage: 'Kipindi chako kinatayarishwa, tafadhali subiri kidogo.',
    };
  }

  // 2. Index error (requires composite index)
  if (
    rawMessage.includes('requires an index') ||
    rawMessage.includes('query requires an index') ||
    (rawCode === 'failed-precondition' && rawMessage.includes('index'))
  ) {
    return {
      code: 'FIRESTORE_INDEX_ERROR',
      message: err.message || 'Hoji hii inahitaji kielezo cha Firestore (composite index).',
      originalError: err,
      userFriendlyMessage: 'Mfumo unasasisha vielezo vya data, tafadhali jaribu tena baadae kidogo.',
    };
  }

  // 3. Timeout error
  if (
    rawCode === 'deadline-exceeded' ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('timed out') ||
    rawMessage.includes('deadline exceeded')
  ) {
    return {
      code: 'FIRESTORE_TIMEOUT',
      message: err.message || 'Ombi limechukua muda mrefu zaidi ya ilivyotarajiwa (Timeout).',
      originalError: err,
      userFriendlyMessage: 'Muda wa kusubiri data umepita. Tafadhali hakikisha mtandao wako uko imara.',
    };
  }

  // 4. Permission denied
  if (
    rawCode === 'permission-denied' ||
    rawMessage.includes('permission-denied') ||
    rawMessage.includes('missing or insufficient permissions') ||
    rawMessage.includes('insufficient permissions')
  ) {
    return {
      code: 'FIRESTORE_PERMISSION_DENIED',
      message: err.message || 'Huna ruhusa ya kufanya kitendo hiki (Permission Denied).',
      originalError: err,
      userFriendlyMessage: 'Huna mamlaka ya kutekeleza kitendo hiki au rekodi hii haikuhusu.',
    };
  }

  // 5. Not found
  if (
    rawCode === 'not-found' ||
    rawMessage.includes('not-found') ||
    rawMessage.includes('document not found') ||
    rawMessage.includes('no such document')
  ) {
    return {
      code: 'FIRESTORE_NOT_FOUND',
      message: err.message || 'Waraka au rekodi haikupatikana.',
      originalError: err,
      userFriendlyMessage: 'Taarifa unayotafuta haipatikani kwa sasa.',
    };
  }

  // 6. Network / Offline / Transport error
  if (
    rawCode === 'unavailable' ||
    rawCode === 'network-request-failed' ||
    rawCode === 'cancelled' ||
    rawMessage.includes('network') ||
    rawMessage.includes('offline') ||
    rawMessage.includes('unavailable') ||
    rawMessage.includes('failed to get document because the client is offline') ||
    rawMessage.includes('transport') ||
    rawMessage.includes('websocket')
  ) {
    return {
      code: 'FIRESTORE_NETWORK_ERROR',
      message: err.message || 'Hitilafu ya muunganisho wa mtandao au seva haipatikani.',
      originalError: err,
      userFriendlyMessage: 'Uunganisho wa mtandao umekatika au hauko thabiti. Tunatumia data ya akiba.',
    };
  }

  // 7. Unknown fallback
  return {
    code: 'FIRESTORE_UNKNOWN_ERROR',
    message: err.message || String(err),
    originalError: err,
    userFriendlyMessage: 'Kuna hitilafu imetokea wakati wa kupata taarifa.',
  };
}
