import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SellerMonetizationRecord,
  SellerMonetizationStatus,
  SellerSellingEligibility
} from '../types/sellerMonetization';
import {
  sellerMonetizationService,
  subscribeToSellerMonetization
} from '../services/sellerMonetizationService';

export interface UseSellerMonetizationResult {
  record: SellerMonetizationRecord | null;
  status: SellerMonetizationStatus;
  eligibility: SellerSellingEligibility;
  isLocked: boolean;
  isTrialActive: boolean;
  loading: boolean;
  revalidate: () => Promise<SellerMonetizationRecord | null>;
  setAuthoritativeRecord: (newRecord: SellerMonetizationRecord) => void;
}

/**
 * Canonical React hook providing a single authoritative seller monetization state
 * synchronized across all seller UI entry points and components in real time.
 */
export function useSellerMonetization(
  sellerUserId?: string,
  sellerProfileId?: string
): UseSellerMonetizationResult {
  const [record, setRecord] = useState<SellerMonetizationRecord | null>(() => {
    if (!sellerUserId) return null;
    return sellerMonetizationService.getSellerRecord(sellerUserId, sellerProfileId);
  });
  const [loading, setLoading] = useState<boolean>(!record);

  // Authoritative revalidation helper
  const revalidate = useCallback(async (): Promise<SellerMonetizationRecord | null> => {
    if (!sellerUserId) return null;
    try {
      const updated = await sellerMonetizationService.fetchAuthoritativeRecord(sellerUserId);
      if (updated) {
        setRecord(updated);
        setLoading(false);
        return updated;
      }
    } catch {}
    const local = sellerMonetizationService.getSellerRecord(sellerUserId, sellerProfileId);
    setRecord(local);
    setLoading(false);
    return local;
  }, [sellerUserId, sellerProfileId]);

  // Direct manual setter that immediately broadcasts to all consumers
  const setAuthoritativeRecord = useCallback((newRecord: SellerMonetizationRecord) => {
    if (!newRecord?.sellerUserId) return;
    sellerMonetizationService.cacheRecord(newRecord);
    setRecord(newRecord);
  }, []);

  useEffect(() => {
    if (!sellerUserId) {
      setRecord(null);
      setLoading(false);
      return;
    }

    // Sync initial state
    const current = sellerMonetizationService.getSellerRecord(sellerUserId, sellerProfileId);
    if (current) {
      setRecord(current);
    }

    // Subscribe to unified authoritative monetization state
    const unsubscribe = subscribeToSellerMonetization(sellerUserId, (updated) => {
      setRecord(updated);
      setLoading(false);
    });

    // Revalidate in background from authoritative server endpoint
    sellerMonetizationService.fetchAuthoritativeRecord(sellerUserId).then((fetched) => {
      if (fetched) {
        setRecord(fetched);
        setLoading(false);
      }
    }).catch(() => {});

    return () => {
      unsubscribe();
    };
  }, [sellerUserId, sellerProfileId]);

  const currentRecord = record || (sellerUserId ? sellerMonetizationService.getSellerRecord(sellerUserId, sellerProfileId) : null);
  const status: SellerMonetizationStatus = currentRecord?.status || 'NOT_ACTIVATED';
  const eligibility = sellerMonetizationService.canSellerSellOnMarketplace(sellerUserId || '');
  const isLocked = status !== 'TRIAL_ACTIVE' && status !== 'ACTIVE';
  const isTrialActive = status === 'TRIAL_ACTIVE';

  return {
    record: currentRecord,
    status,
    eligibility,
    isLocked,
    isTrialActive,
    loading,
    revalidate,
    setAuthoritativeRecord
  };
}
