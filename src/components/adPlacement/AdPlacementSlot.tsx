/**
 * Ufugaji Update — Ad Placement Foundation V1.0
 * Responsive Advertising Placement Component
 *
 * Adheres to:
 * - Reference sizes: Mobile 320x50, Desktop 728x90
 * - Anti-slop clean typography & metadata rules
 * - Zero layout bloat when empty/disabled (collapses cleanly to null)
 * - Viewport visibility observation via IntersectionObserver with duplicate guard
 * - Safe loading: On configuration-fetch failure, fails closed (no ads shown on unconfirmed cache)
 * - Keyboard accessibility, clear "Tangazo" disclosure, safe URL routing
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PlacementId, CampaignCreative, AdPlacementConfig } from '../../types/adPlacementTypes';
import { adPlacementRegistry } from '../../services/adPlacement/adPlacementRegistry';
import { campaignSourceService } from '../../services/adPlacement/campaignSourceInterface';
import { adTrackingService, validateSafeAdDestinationUrl } from '../../services/adPlacement/adTrackingService';

export interface AdPlacementSlotProps {
  placementId: PlacementId;
  className?: string;
  testCampaignOverride?: CampaignCreative | null;
  onImpressionRecorded?: (campaignId: string) => void;
}

export const AdPlacementSlot: React.FC<AdPlacementSlotProps> = ({
  placementId,
  className = '',
  testCampaignOverride,
  onImpressionRecorded
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Placement Registry State
  const [placementConfig, setPlacementConfig] = useState<AdPlacementConfig | null>(() =>
    adPlacementRegistry.getPlacement(placementId)
  );
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);

  // 2. Campaign State
  const [campaign, setCampaign] = useState<CampaignCreative | null>(testCampaignOverride || null);
  const [isLoading, setIsLoading] = useState<boolean>(!testCampaignOverride);
  const [imageFailed, setImageFailed] = useState<boolean>(false);
  const [isObservedVisible, setIsObservedVisible] = useState<boolean>(false);

  // Keep placement configuration synced with registry changes
  useEffect(() => {
    const unsub = adPlacementRegistry.subscribe(() => {
      setPlacementConfig(adPlacementRegistry.getPlacement(placementId));
    });
    return () => unsub();
  }, [placementId]);

  // Synchronize authoritative state on mount if not in test override
  useEffect(() => {
    if (testCampaignOverride !== undefined) return;

    let isMounted = true;
    if (typeof window !== 'undefined' && window.fetch && !adPlacementRegistry.isSyncedWithServer()) {
      adPlacementRegistry.syncWithServer().then((res) => {
        if (isMounted) {
          if (!res.success) {
            // Configuration fetch failed: fail closed
            setFetchFailed(true);
          } else {
            setFetchFailed(false);
            setPlacementConfig(adPlacementRegistry.getPlacement(placementId));
          }
        }
      }).catch(() => {
        if (isMounted) setFetchFailed(true);
      });
    }

    return () => {
      isMounted = false;
    };
  }, [placementId, testCampaignOverride]);

  // Viewport detection (Mobile vs Desktop)
  const isDesktop = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768;
  }, []);

  // 3. Campaign fetch lifecycle
  useEffect(() => {
    if (testCampaignOverride !== undefined) {
      setCampaign(testCampaignOverride);
      setIsLoading(false);
      return;
    }

    // Fail closed: On configuration-fetch failure, do NOT expose ad based solely on stale local cache
    if (fetchFailed) {
      setCampaign(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchAd = async () => {
      // If placement is not registered or disabled, collapse immediately
      if (!placementConfig || !placementConfig.isEnabled) {
        if (isMounted) {
          setCampaign(null);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setImageFailed(false);

      try {
        const result = await campaignSourceService.selectCampaign({
          placementId,
          viewport: isDesktop ? 'desktop' : 'mobile'
        });

        if (isMounted) {
          if (result.hasCampaign && result.campaign) {
            setCampaign(result.campaign);
          } else {
            setCampaign(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setCampaign(null);
          setIsLoading(false);
        }
      }
    };

    fetchAd();

    return () => {
      isMounted = false;
    };
  }, [placementId, placementConfig?.isEnabled, isDesktop, testCampaignOverride, fetchFailed]);

  // 4. Viewport Visibility Observation (IntersectionObserver)
  useEffect(() => {
    if (!campaign || imageFailed || !containerRef.current) return;

    // Check if an impression was already recorded for this creative in this session
    if (adTrackingService.hasRecordedImpression(placementId, campaign.campaignId, campaign.creativeId)) {
      setIsObservedVisible(true);
      return;
    }

    let observer: IntersectionObserver | null = null;

    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            // Standard visibility threshold: at least 50% visible in active viewport
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              setIsObservedVisible(true);

              // Record impression once with unique event identifier
              const eventId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
              adTrackingService
                .recordImpression({
                  eventId,
                  placementId,
                  campaignId: campaign.campaignId,
                  creativeId: campaign.creativeId,
                  timestamp: new Date().toISOString(),
                  viewport: isDesktop ? 'desktop' : 'mobile',
                  visiblePercentage: Math.round(entry.intersectionRatio * 100)
                })
                .then((res) => {
                  if (res.recorded && onImpressionRecorded) {
                    onImpressionRecorded(campaign.campaignId);
                  }
                });

              // Disconnect immediately after recording to prevent repeated counts
              if (containerRef.current && observer) {
                observer.unobserve(containerRef.current);
              }
            }
          });
        },
        {
          threshold: [0.5]
        }
      );

      observer.observe(containerRef.current);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [campaign?.campaignId, campaign?.creativeId, imageFailed, placementId, isDesktop, onImpressionRecorded]);

  // 5. Handling Click Tracking & Safe Navigation
  const handleAdClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!campaign) return;

    const validation = validateSafeAdDestinationUrl(campaign.destinationUrl);
    if (!validation.isValid) {
      e.preventDefault();
      console.warn('[AdPlacementSlot] Click prevented due to invalid destination URL:', validation.error);
      return;
    }

    const clickEventId = `clk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    adTrackingService.recordClick({
      eventId: clickEventId,
      placementId,
      campaignId: campaign.campaignId,
      creativeId: campaign.creativeId,
      destinationUrl: campaign.destinationUrl,
      timestamp: new Date().toISOString()
    });
  };

  // 6. Non-disruptive collapse rules:
  // If placement disabled, config fetch failed, no campaign, or image failed -> Render nothing (null)
  if (fetchFailed || !placementConfig || !placementConfig.isEnabled) {
    return null;
  }

  if (!isLoading && (!campaign || imageFailed)) {
    return null;
  }

  // Loading state with minimal reservation
  if (isLoading && !campaign) {
    return (
      <div
        className={`w-full flex items-center justify-center mx-auto my-2 overflow-hidden transition-all duration-200 ${className}`}
        style={{
          maxWidth: isDesktop ? '728px' : '320px',
          height: isDesktop ? '90px' : '50px'
        }}
        aria-hidden="true"
      >
        <div className="w-full h-full rounded-xl bg-stone-100/60 animate-pulse border border-stone-200/50 flex items-center justify-center">
          <span className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
            Tangazo
          </span>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  const safeUrl = validateSafeAdDestinationUrl(campaign.destinationUrl).sanitizedUrl || '#';

  return (
    <aside
      ref={containerRef}
      id={`ad-placement-${placementId.toLowerCase()}`}
      role="complementary"
      aria-label={`Tangazo: ${campaign.advertiserName || 'Mshirika'}`}
      className={`w-full flex flex-col items-center justify-center mx-auto my-2.5 px-1 sm:px-0 select-none ${className}`}
    >
      <div
        className="relative w-full rounded-xl overflow-hidden border border-stone-200 bg-stone-50 shadow-2xs group transition-all"
        style={{
          maxWidth: isDesktop ? '728px' : '320px',
          minHeight: isDesktop ? '90px' : '50px'
        }}
      >
        {/* Standard Swahili promotional disclosure */}
        <div className="absolute top-1.5 left-2 z-10 pointer-events-none">
          <span className="text-[9px] uppercase font-semibold tracking-wider text-stone-500/90 bg-stone-100/90 backdrop-blur-xs px-1.5 py-0.5 rounded-sm border border-stone-200/60 shadow-2xs">
            {campaign.disclosureText || 'Tangazo'}
          </span>
        </div>

        {/* Banner Clickable Anchor */}
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleAdClick}
          className="block w-full h-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1 rounded-xl"
          aria-label={`${campaign.disclosureText || 'Tangazo'}: ${campaign.altText || campaign.advertiserName}`}
        >
          <img
            src={campaign.imageUrl}
            alt={campaign.altText || 'Tangazo'}
            onError={() => setImageFailed(true)}
            className="w-full h-auto object-cover rounded-xl transition-opacity duration-300 group-hover:opacity-95"
            style={{
              maxHeight: isDesktop ? '90px' : '50px',
              width: '100%'
            }}
          />
        </a>
      </div>
    </aside>
  );
};
