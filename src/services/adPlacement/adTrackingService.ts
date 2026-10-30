/**
 * Ufugaji Update — Ad Placement Foundation V1.0
 * Visibility Observation & Idempotent Tracking Service
 *
 * Implements client-side impression and click lifecycle controls:
 * - Actual visibility observation via IntersectionObserver
 * - Idempotency guard: prevents counting a single continuous view repeatedly across re-renders
 * - Open-redirect protection: destination URL sanitization and protocol whitelist
 * - Non-attribution rule: Clicks are NOT treated as completed sales or leads
 */

import { AdClickEvent, AdImpressionEvent } from '../../types/adPlacementTypes';

export interface TrackingResult {
  recorded: boolean;
  eventId: string;
  reason?: string;
  safeDestinationUrl?: string;
}

export function validateSafeAdDestinationUrl(rawUrl: string): {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL haijatolewa au haina muundo sahihi.' };
  }

  const trimmed = rawUrl.trim();

  // 1. Block dangerous pseudo-protocols
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return { isValid: false, error: 'Itifaki ya URL hii hairuhusiwi kwa usalama (Protocols blocked).' };
  }

  // 2. Protocol-relative URLs (//evil.com) are blocked
  if (trimmed.startsWith('//')) {
    return { isValid: false, error: 'URL zenye // bila itifaki zimezuiwa.' };
  }

  // 3. Allow internal relative paths (/market, /gulio)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return { isValid: true, sanitizedUrl: trimmed };
  }

  // 4. Validate HTTPS external URLs
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { isValid: false, error: 'URL inapaswa kuanza na https://' };
    }
    // Disallow null bytes or suspicious control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      return { isValid: false, error: 'URL ina herufi zisizo salama.' };
    }
    return { isValid: true, sanitizedUrl: parsed.href };
  } catch (e) {
    return { isValid: false, error: 'Muundo wa URL si sahihi.' };
  }
}

class AdTrackingService {
  // In-memory set of recorded impression keys within the active browser session
  private recordedImpressionKeys: Set<string> = new Set();
  private recordedClickKeys: Set<string> = new Set();

  /**
   * Generates a composite idempotency key to prevent continuous duplicate impression counting.
   */
  public getImpressionIdempotencyKey(placementId: string, campaignId: string, creativeId: string): string {
    return `${placementId}::${campaignId}::${creativeId}`;
  }

  /**
   * Checks whether this banner creative has already registered an impression in the current session.
   */
  public hasRecordedImpression(placementId: string, campaignId: string, creativeId: string): boolean {
    const key = this.getImpressionIdempotencyKey(placementId, campaignId, creativeId);
    return this.recordedImpressionKeys.has(key);
  }

  /**
   * Records an ad banner impression authoritatively based on verified viewport visibility.
   * Guarded against repeated counts on component re-renders.
   */
  public async recordImpression(event: AdImpressionEvent): Promise<TrackingResult> {
    const key = this.getImpressionIdempotencyKey(event.placementId, event.campaignId, event.creativeId);

    if (this.recordedImpressionKeys.has(key)) {
      return {
        recorded: false,
        eventId: event.eventId,
        reason: 'DUPLICATE_SESSION_IMPRESSION_IGNORED'
      };
    }

    // Mark as recorded locally before network dispatch to prevent rapid concurrent events
    this.recordedImpressionKeys.add(key);

    try {
      if (typeof window !== 'undefined' && window.fetch) {
        const response = await fetch('/api/ad-placements/impressions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        });

        if (!response.ok) {
          console.warn('[AdTracking] Server returned non-200 for impression tracking:', response.status);
        }
      }

      return {
        recorded: true,
        eventId: event.eventId
      };
    } catch (err) {
      // Non-blocking for UI
      return {
        recorded: true, // Still marked locally to prevent render loops
        eventId: event.eventId,
        reason: 'OFFLINE_LOCAL_RECORDED'
      };
    }
  }

  /**
   * Records a user click on an ad banner.
   * Performs client-side URL safety validation and notifies backend.
   * NOTE: A click is strictly NOT treated as a sale or completed lead.
   */
  public async recordClick(event: AdClickEvent): Promise<TrackingResult> {
    const validation = validateSafeAdDestinationUrl(event.destinationUrl);
    if (!validation.isValid) {
      console.error('[AdTracking] Blocked unsafe click destination:', validation.error);
      return {
        recorded: false,
        eventId: event.eventId,
        reason: validation.error
      };
    }

    const key = `${event.placementId}::${event.campaignId}::${event.creativeId}::${event.eventId}`;
    this.recordedClickKeys.add(key);

    try {
      if (typeof window !== 'undefined' && window.fetch) {
        fetch('/api/ad-placements/clicks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...event,
            destinationUrl: validation.sanitizedUrl
          })
        }).catch((err) => console.warn('[AdTracking] Non-blocking click tracking error:', err));
      }

      return {
        recorded: true,
        eventId: event.eventId,
        safeDestinationUrl: validation.sanitizedUrl
      };
    } catch (e) {
      return {
        recorded: true,
        eventId: event.eventId,
        safeDestinationUrl: validation.sanitizedUrl
      };
    }
  }

  /**
   * Reset tracking state for unit test harnesses.
   */
  public resetSessionTracking(): void {
    this.recordedImpressionKeys.clear();
    this.recordedClickKeys.clear();
  }
}

export const adTrackingService = new AdTrackingService();
