/**
 * Ufugaji Update — Ad Placement Foundation V1.0
 * Typed contracts for corporate banner placements, responsive presentation rules,
 * campaign-source boundaries, and visibility-based tracking.
 */

export type PlacementId =
  | 'GULIO_TOP_BANNER'
  | 'MARKETPLACE_TOP_BANNER'
  | string;

export interface BannerDimensionRule {
  width: number;
  height: number;
  maxWidth?: string;
  maxHeight?: string;
  aspectRatio?: string;
}

export type PlacementFallbackBehavior = 'collapse' | 'custom';

export interface AdPlacementConfig {
  placementId: PlacementId;
  displayName: string;
  locationDescription: string;
  isEnabled: boolean;
  responsiveRules: {
    mobile: BannerDimensionRule;
    desktop: BannerDimensionRule;
  };
  maxDimensions: {
    maxWidth: number;
    maxHeight: number;
  };
  fallbackBehavior: PlacementFallbackBehavior;
  targetPage: 'gulio' | 'marketplace' | 'all';
  allowedCreativeTypes: Array<'banner_image' | 'html_banner'>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignCreative {
  creativeId: string;
  campaignId: string;
  advertiserName: string;
  headline?: string;
  imageUrl: string;
  altText: string;
  destinationUrl: string;
  dimensions: {
    width: number;
    height: number;
  };
  disclosureText: string; // e.g., 'Tangazo'
  isPromotional: boolean;
}

export interface CampaignSelectionRequest {
  placementId: PlacementId;
  viewport: 'mobile' | 'desktop';
  pageContext?: string;
}

export type CampaignRejectionReason =
  | 'NO_ACTIVE_CAMPAIGN'
  | 'PLACEMENT_DISABLED'
  | 'EXPIRED'
  | 'TARGETING_MISMATCH'
  | 'CREATIVE_UNAVAILABLE'
  | 'ERROR';

export interface CampaignSelectionResult {
  hasCampaign: boolean;
  campaign?: CampaignCreative | null;
  reason?: CampaignRejectionReason;
}

export interface AdImpressionEvent {
  eventId: string;
  placementId: PlacementId;
  campaignId: string;
  creativeId: string;
  timestamp: string;
  viewport: 'mobile' | 'desktop';
  durationMs?: number;
  visiblePercentage?: number;
}

export interface AdClickEvent {
  eventId: string;
  placementId: PlacementId;
  campaignId: string;
  creativeId: string;
  destinationUrl: string;
  timestamp: string;
}
