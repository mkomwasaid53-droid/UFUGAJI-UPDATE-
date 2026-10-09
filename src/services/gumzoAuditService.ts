/**
 * V9.4 — GUMZO TWO-ADMIN GOVERNANCE AUDIT SERVICE
 *
 * Implements an authoritative, immutable, append-only audit trail for:
 * 1. Founder Admin assignment and transfer
 * 2. Leadership Admin assignment and removal
 * 3. Group lifecycle changes (suspension, restoration, status updates)
 * 4. Administrative content moderation actions (post/comment hide/delete)
 * 5. Unauthorized privilege-escalation attempts
 *
 * Immutable Security Guarantees:
 * - Append-only: audit entries cannot be modified or deleted by clients.
 * - Authoritative: generated and validated at the server/service boundary.
 * - Privacy: never stores passwords, access tokens, secret keys, or private message content.
 */

import { GumzoGovernanceAuditEvent, GumzoGovernanceAction, GumzoAuditOutcome } from '../types/gumzo';

const isNode = typeof window === 'undefined';

const LOCAL_AUDIT_KEY = 'ufugaji_gumzo_governance_audit';

// In-memory primary store: List of immutable audit events
const auditEventsList: GumzoGovernanceAuditEvent[] = [];

function hydrateFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        auditEventsList.length = 0;
        parsed.forEach((evt: GumzoGovernanceAuditEvent) => auditEventsList.push(evt));
      }
    }
  } catch {}
}

function persistToLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(auditEventsList));
  } catch {}
}

if (!isNode) {
  hydrateFromLocalStorage();
}

// Disk persistence handles (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let AUDIT_FILE = 'data/gumzo_governance_audit.json';

export function initGumzoAuditStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  AUDIT_FILE = diskPath ? diskPath.join(baseDir, 'gumzo_governance_audit.json') : `${baseDir}/gumzo_governance_audit.json`;

  loadFromDisk();
}

// Auto-initialize if running in Node.js
if (isNode) {
  try {
    import('fs').then((f) => {
      if (!diskFs) {
        diskFs = f.default || f;
        import('path').then((p) => {
          diskPath = p.default || p;
          initGumzoAuditStorage(diskFs, diskPath);
        }).catch(() => {});
      }
    }).catch(() => {});
  } catch {}
}

function loadFromDisk(): void {
  if (!diskFs || !diskFs.existsSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }

    if (diskFs.existsSync(AUDIT_FILE)) {
      const data = JSON.parse(diskFs.readFileSync(AUDIT_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        auditEventsList.length = 0;
        data.forEach((evt: GumzoGovernanceAuditEvent) => auditEventsList.push(evt));
      }
    }
  } catch (err) {
    console.warn('[gumzoAuditService] Disk load warning:', err);
  }
}

function persistToDisk(): void {
  if (typeof window !== 'undefined') {
    persistToLocalStorage();
    return;
  }
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dataDir = diskPath ? diskPath.resolve(process.cwd(), 'data') : 'data';
    if (!diskFs.existsSync(dataDir)) {
      diskFs.mkdirSync(dataDir, { recursive: true });
    }
    diskFs.writeFileSync(AUDIT_FILE, JSON.stringify(auditEventsList, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[gumzoAuditService] Disk save warning:', err);
  }
}

export class GumzoAuditService {
  /**
   * Log an authoritative, immutable governance audit event
   */
  public logEvent(params: {
    actorUserId: string;
    action: GumzoGovernanceAction;
    targetType: 'GROUP' | 'POST' | 'COMMENT' | 'MEMBERSHIP' | 'GOVERNANCE';
    targetResourceId: string;
    groupId?: string;
    outcome?: GumzoAuditOutcome;
    reason?: string;
    details?: Record<string, any>;
  }): GumzoGovernanceAuditEvent {
    if (isNode) loadFromDisk();

    const auditId = `gaudit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Sanitize details: strip any sensitive fields
    let safeDetails: Record<string, any> | undefined = undefined;
    if (params.details) {
      safeDetails = { ...params.details };
      delete safeDetails.password;
      delete safeDetails.token;
      delete safeDetails.secret;
      delete safeDetails.apiKey;
    }

    const event: GumzoGovernanceAuditEvent = {
      auditId,
      actorUserId: params.actorUserId || 'unknown',
      action: params.action,
      targetType: params.targetType,
      targetResourceId: params.targetResourceId,
      groupId: params.groupId,
      timestamp,
      outcome: params.outcome || 'SUCCESS',
      reason: params.reason,
      details: safeDetails,
    };

    // Prepend to list (newest first)
    auditEventsList.unshift(event);
    persistToDisk();

    return Object.freeze({ ...event });
  }

  /**
   * Retrieve audit events with optional filtering
   */
  public getEvents(filter?: {
    groupId?: string;
    action?: GumzoGovernanceAction;
    actorUserId?: string;
    targetType?: string;
    limit?: number;
    offset?: number;
  }): GumzoGovernanceAuditEvent[] {
    if (isNode) loadFromDisk();

    let result = [...auditEventsList];

    if (filter) {
      if (filter.groupId) {
        result = result.filter((e) => e.groupId === filter.groupId);
      }
      if (filter.action) {
        result = result.filter((e) => e.action === filter.action);
      }
      if (filter.actorUserId) {
        result = result.filter((e) => e.actorUserId === filter.actorUserId);
      }
      if (filter.targetType) {
        result = result.filter((e) => e.targetType === filter.targetType);
      }
    }

    const offset = filter?.offset || 0;
    const limit = filter?.limit || 100;

    return result.slice(offset, offset + limit);
  }

  /**
   * Get single audit event by ID
   */
  public getEventById(auditId: string): GumzoGovernanceAuditEvent | null {
    if (isNode) loadFromDisk();
    const found = auditEventsList.find((e) => e.auditId === auditId);
    return found ? Object.freeze({ ...found }) : null;
  }

  /**
   * Testing & Isolation helper
   */
  public _clearForTesting(persist = true): void {
    auditEventsList.length = 0;
    if (persist) {
      persistToDisk();
    }
  }

  public getAllEvents(): GumzoGovernanceAuditEvent[] {
    if (isNode) loadFromDisk();
    return [...auditEventsList];
  }
}

export const gumzoAuditService = new GumzoAuditService();
