import { EventType, LivestockEvent, LivestockRecord } from '../types';

export const POSITIVE_EVENT_TYPES: EventType[] = ['addition', 'birth', 'purchase'];
export const NEGATIVE_EVENT_TYPES: EventType[] = ['sale', 'death', 'mortality'];
export const NEUTRAL_EVENT_TYPES: EventType[] = [
  'vaccination',
  'treatment',
  'feed',
  'observation',
  'other'
];

export interface LivestockBalanceSummary {
  baseQuantity: number;
  totalAdditions: number;
  totalReductions: number;
  currentQuantity: number;
}

/**
 * Check if an event type increases population
 */
export function isPositiveEventType(type: EventType): boolean {
  return POSITIVE_EVENT_TYPES.includes(type);
}

/**
 * Check if an event type reduces population
 */
export function isNegativeEventType(type: EventType): boolean {
  return NEGATIVE_EVENT_TYPES.includes(type);
}

/**
 * Check if an event type is neutral (does not change population)
 */
export function isNeutralEventType(type: EventType): boolean {
  return NEUTRAL_EVENT_TYPES.includes(type);
}

/**
 * Get numerical delta for a single event (+X, -X, or 0)
 */
export function getEventDelta(type: EventType, quantity: number | null | undefined): number {
  if (quantity === null || quantity === undefined || isNaN(quantity) || quantity <= 0) {
    return 0;
  }
  if (isPositiveEventType(type)) {
    return Math.round(quantity);
  }
  if (isNegativeEventType(type)) {
    return -Math.round(quantity);
  }
  return 0;
}

/**
 * Sort events chronologically (ascending by eventDate, then createdAt)
 */
export function sortEventsChronologicallyAsc(events: LivestockEvent[]): LivestockEvent[] {
  return [...events].sort((a, b) => {
    const dateA = a.eventDate || '';
    const dateB = b.eventDate || '';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdA.localeCompare(createdB);
  });
}

/**
 * Sort events chronologically (descending - newest first)
 */
export function sortEventsChronologicallyDesc(events: LivestockEvent[]): LivestockEvent[] {
  return [...events].sort((a, b) => {
    const dateA = a.eventDate || '';
    const dateB = b.eventDate || '';
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdB.localeCompare(createdA);
  });
}

/**
 * Calculate total balance from base quantity and list of events
 */
export function calculateLivestockBalance(
  baseQuantity: number,
  events: LivestockEvent[] = []
): LivestockBalanceSummary {
  const safeBase = typeof baseQuantity === 'number' && !isNaN(baseQuantity) && baseQuantity >= 0
    ? Math.round(baseQuantity)
    : 0;

  let totalAdditions = 0;
  let totalReductions = 0;

  for (const evt of events) {
    const qty = typeof evt.quantity === 'number' && !isNaN(evt.quantity) ? Math.round(evt.quantity) : 0;
    if (qty > 0) {
      if (isPositiveEventType(evt.eventType)) {
        totalAdditions += qty;
      } else if (isNegativeEventType(evt.eventType)) {
        totalReductions += qty;
      }
    }
  }

  const currentQuantity = Math.max(0, safeBase + totalAdditions - totalReductions);

  return {
    baseQuantity: safeBase,
    totalAdditions,
    totalReductions,
    currentQuantity
  };
}

/**
 * Validate running balance for a proposed add / edit operation.
 * Prevents running balance from dropping below zero at any point in history.
 */
export function validateEventBalanceTimeline(
  baseQuantity: number,
  currentEvents: LivestockEvent[],
  proposedEvent: LivestockEvent,
  isEditing: boolean = false
): { valid: boolean; errorMessage?: string; problematicDate?: string; resultingBalance?: number } {
  const safeBase = typeof baseQuantity === 'number' && !isNaN(baseQuantity) && baseQuantity >= 0
    ? Math.round(baseQuantity)
    : 0;

  // Combine events replacing edited one or adding new one
  let merged: LivestockEvent[];
  if (isEditing) {
    merged = currentEvents.map((e) => (e.eventId === proposedEvent.eventId ? proposedEvent : e));
    // If not found in currentEvents (e.g. edge case), append it
    if (!merged.some((e) => e.eventId === proposedEvent.eventId)) {
      merged.push(proposedEvent);
    }
  } else {
    merged = [...currentEvents, proposedEvent];
  }

  // Sort ascending: eventDate ascending, then createdAt ascending
  const sorted = sortEventsChronologicallyAsc(merged);

  let runningBalance = safeBase;

  for (const evt of sorted) {
    const delta = getEventDelta(evt.eventType, evt.quantity);
    runningBalance += delta;

    if (runningBalance < 0) {
      const typeLabel = evt.eventType === 'sale'
        ? 'Mauzo'
        : evt.eventType === 'death' || evt.eventType === 'mortality'
        ? 'Vifo'
        : 'Upungufu';

      return {
        valid: false,
        problematicDate: evt.eventDate,
        resultingBalance: runningBalance,
        errorMessage: `Kiasi kilichowekwa hakiruhusiwi: Kinazidi idadi ya mifugo iliyopo (${runningBalance + Math.abs(delta)}) kufikia tarehe ${evt.eventDate}. Idadi ya mifugo haiwezi kuwa hasi (${runningBalance}).`
      };
    }
  }

  return {
    valid: true,
    resultingBalance: runningBalance
  };
}

/**
 * Validate timeline after deleting an event to ensure subsequent reduction events don't drop balance below 0.
 */
export function validateTimelineAfterDeletion(
  baseQuantity: number,
  currentEvents: LivestockEvent[],
  eventIdToDelete: string
): { valid: boolean; errorMessage?: string } {
  const remaining = currentEvents.filter((e) => e.eventId !== eventIdToDelete);
  const sorted = sortEventsChronologicallyAsc(remaining);
  let runningBalance = Math.max(0, baseQuantity);

  for (const evt of sorted) {
    const delta = getEventDelta(evt.eventType, evt.quantity);
    runningBalance += delta;

    if (runningBalance < 0) {
      return {
        valid: false,
        errorMessage: `Huwezi kufuta tukio hili kwa sababu linahitajika kuzuia idadi ya mifugo kuwa hasi (${runningBalance}) kwenye matukio ya baadaye ya tarehe ${evt.eventDate}.`
      };
    }
  }

  return { valid: true };
}
