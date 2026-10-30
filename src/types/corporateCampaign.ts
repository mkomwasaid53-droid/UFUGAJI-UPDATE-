/**
 * Ufugaji Update — Corporate Campaign Management V1.0
 * Phase 1: Campaign Foundation Types & Contracts
 *
 * Strict boundary rules:
 * - Only governs campaign definitions, draft metadata, and placement association.
 * - Does NOT include payment status, paid impression quotas, pricing, or billing.
 * - Draft creation/editing does NOT activate public ad delivery.
 */

import { PlacementId } from './adPlacementTypes';

export type CorporateCampaignStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'ARCHIVED'
  | 'COMPLETED';

export interface CorporateCampaign {
  campaignId: string;
  advertiserName: string;
  campaignName: string;
  placementId: PlacementId;
  imageUrl: string;
  storagePath?: string;
  destinationUrl: string;
  status: CorporateCampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
  internalNotes?: string | null;
  version: 'V1.0';
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignDraftInput {
  advertiserName: string;
  campaignName: string;
  placementId: PlacementId;
  imageUrl: string;
  storagePath?: string;
  destinationUrl: string;
  startDate?: string | null;
  endDate?: string | null;
  internalNotes?: string | null;
}

export interface UpdateCampaignDraftInput {
  advertiserName?: string;
  campaignName?: string;
  placementId?: PlacementId;
  imageUrl?: string;
  storagePath?: string;
  destinationUrl?: string;
  startDate?: string | null;
  endDate?: string | null;
  internalNotes?: string | null;
  status?: CorporateCampaignStatus;
}

export interface CampaignValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  sanitized?: Partial<CorporateCampaign>;
}
