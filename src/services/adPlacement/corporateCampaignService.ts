/**
 * Ufugaji Update — Corporate Campaign Management V1.0
 * Phase 1: Campaign Service & Durable Store
 *
 * Provides authoritative campaign validation, ID generation,
 * draft lifecycle management, and durable persistence.
 */

import {
  CorporateCampaign,
  CorporateCampaignStatus,
  CreateCampaignDraftInput,
  UpdateCampaignDraftInput,
  CampaignValidationResult
} from '../../types/corporateCampaign';
import { isValidPlacementId, VALID_PLACEMENT_IDS } from './adPlacementRegistry';
import { PlacementId } from '../../types/adPlacementTypes';

export const CORPORATE_CAMPAIGNS_STORAGE_FILE = 'data/corporate_campaigns.json';

// Node.js file system references for local durable storage
let fsModule: any = null;
let pathModule: any = null;

const isNodeEnv = typeof window === 'undefined';
if (isNodeEnv) {
  try {
    const nodeReq = (globalThis as any).require;
    if (typeof nodeReq === 'function') {
      fsModule = nodeReq('fs');
      pathModule = nodeReq('path');
    }
  } catch {}
}

export function initCorporateCampaignStorage(customFs?: any, customPath?: any): void {
  if (customFs && customPath) {
    fsModule = customFs;
    pathModule = customPath;
  }
  corporateCampaignService.loadFromDisk();
}

/**
 * Validates and sanitizes destination URLs for corporate ad banners.
 * Strictly prevents open-redirect vulnerabilities and hazardous schemes.
 */
export function validateSafeCampaignDestinationUrl(rawUrl: string): {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL ya kuelekeza inahitajika (Destination URL is required).' };
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
    return {
      isValid: false,
      error: 'Itifaki ya URL hii hairuhusiwi kwa sababu za kiusalama (Dangerous protocol blocked).'
    };
  }

  // 2. Protocol-relative URLs (//evil.com) are blocked
  if (trimmed.startsWith('//')) {
    return { isValid: false, error: 'URL zenye // bila itifaki haziruhusiwi.' };
  }

  // 3. Allow internal relative paths (/gulio, /marketplace, /daktari)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (/^\/[a-zA-Z0-9_\-\/\?=&%#]*$/.test(trimmed)) {
      return { isValid: true, sanitizedUrl: trimmed };
    }
    return { isValid: false, error: 'Muundo wa njia ya ndani una herufi zisizoruhusiwa.' };
  }

  // 4. Validate HTTPS/HTTP external URLs
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { isValid: false, error: 'URL lazima iwe ya mfumo wa https:// au njia ya ndani ya app.' };
    }

    // Do not allow localhost or local IP addresses in external URLs unless in testing
    if (parsed.hostname.toLowerCase() === 'localhost' || parsed.hostname === '127.0.0.1') {
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
        return { isValid: false, error: 'Anwani ya localhost hairuhusiwi katika uzalishaji.' };
      }
    }

    return { isValid: true, sanitizedUrl: trimmed };
  } catch {
    return { isValid: false, error: 'Muundo wa URL si sahihi (Invalid URL format).' };
  }
}

/**
 * Validates a campaign draft input payload against schema rules.
 */
export function validateCampaignDraftInput(input: Partial<CreateCampaignDraftInput>): CampaignValidationResult {
  const errors: Record<string, string> = {};

  if (!input || typeof input !== 'object') {
    return { isValid: false, errors: { payload: 'Payload ya kampeni si sahihi.' } };
  }

  // Advertiser Name
  if (!input.advertiserName || typeof input.advertiserName !== 'string' || input.advertiserName.trim().length < 2) {
    errors.advertiserName = 'Jina la kampuni au mtangazaji linahitajika (angalau herufi 2).';
  } else if (input.advertiserName.trim().length > 100) {
    errors.advertiserName = 'Jina la kampuni lisizidi herufi 100.';
  }

  // Internal Campaign Name
  if (!input.campaignName || typeof input.campaignName !== 'string' || input.campaignName.trim().length < 2) {
    errors.campaignName = 'Jina la ndani la kampeni linahitajika (angalau herufi 2).';
  } else if (input.campaignName.trim().length > 150) {
    errors.campaignName = 'Jina la kampeni lisizidi herufi 150.';
  }

  // Placement ID
  if (!input.placementId || !isValidPlacementId(input.placementId)) {
    errors.placementId = `Nafasi ya tangazo si sahihi. Lazima iwe miongoni mwa: ${VALID_PLACEMENT_IDS.join(', ')}`;
  }

  // Image URL / Storage Path
  if (!input.imageUrl || typeof input.imageUrl !== 'string' || input.imageUrl.trim().length === 0) {
    errors.imageUrl = 'Picha ya bango la tangazo inahitajika.';
  } else {
    const trimmedImg = input.imageUrl.trim();
    const isSafeImg =
      trimmedImg.startsWith('https://') ||
      trimmedImg.startsWith('http://') ||
      trimmedImg.startsWith('/uploads/') ||
      trimmedImg.startsWith('/api/admin/corporate-campaigns/preview-image') ||
      trimmedImg.startsWith('/api/corporate-campaigns/delivery/') ||
      trimmedImg.startsWith('gs://');
    if (!isSafeImg) {
      errors.imageUrl = 'Picha inapaswa kuanza na https:// au kupakiwa kupitia hifadhi rasmi ya seva.';
    }
  }

  // Destination URL
  if (!input.destinationUrl || typeof input.destinationUrl !== 'string') {
    errors.destinationUrl = 'URL ya kuelekeza inahitajika.';
  } else {
    const destValidation = validateSafeCampaignDestinationUrl(input.destinationUrl);
    if (!destValidation.isValid) {
      errors.destinationUrl = destValidation.error || 'URL ya kuelekeza si sahihi.';
    }
  }

  // Dates (optional)
  if (input.startDate) {
    const startParsed = Date.parse(input.startDate);
    if (isNaN(startParsed)) {
      errors.startDate = 'Tarehe ya kuanza si sahihi.';
    }
  }

  if (input.endDate) {
    const endParsed = Date.parse(input.endDate);
    if (isNaN(endParsed)) {
      errors.endDate = 'Tarehe ya mwisho si sahihi.';
    }
  }

  if (input.startDate && input.endDate) {
    const startParsed = Date.parse(input.startDate);
    const endParsed = Date.parse(input.endDate);
    if (!isNaN(startParsed) && !isNaN(endParsed) && startParsed > endParsed) {
      errors.endDate = 'Tarehe ya mwisho haiwezi kuwa kabla ya tarehe ya kuanza.';
    }
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    sanitized: isValid
      ? {
          advertiserName: input.advertiserName!.trim(),
          campaignName: input.campaignName!.trim(),
          placementId: input.placementId as PlacementId,
          imageUrl: input.imageUrl!.trim(),
          storagePath: input.storagePath ? input.storagePath.trim() : undefined,
          destinationUrl: input.destinationUrl!.trim(),
          startDate: input.startDate || null,
          endDate: input.endDate || null,
          internalNotes: input.internalNotes ? input.internalNotes.trim() : null
        }
      : undefined
  };
}

export class CorporateCampaignService {
  private campaigns: Map<string, CorporateCampaign> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (isNodeEnv) {
      this.loadFromDisk();
    }
  }

  public generateCampaignId(): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `cmp_${timestamp}_${randomSuffix}`;
  }

  public loadFromDisk(): boolean {
    if (!fsModule || !pathModule) return false;
    try {
      const fullPath = pathModule.resolve(process.cwd(), CORPORATE_CAMPAIGNS_STORAGE_FILE);
      if (fsModule.existsSync(fullPath)) {
        const raw = fsModule.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.campaigns.clear();
          data.forEach((c: CorporateCampaign) => {
            if (c && c.campaignId) {
              this.campaigns.set(c.campaignId, { ...c });
            }
          });
          return true;
        }
      }
    } catch (err) {
      console.warn('[CorporateCampaignService] Hitilafu ya kusoma corporate_campaigns kutoka disk:', err);
    }
    return false;
  }

  public saveToDisk(): boolean {
    if (!fsModule || !pathModule) return false;
    try {
      const fullPath = pathModule.resolve(process.cwd(), CORPORATE_CAMPAIGNS_STORAGE_FILE);
      const dir = pathModule.dirname(fullPath);
      if (!fsModule.existsSync(dir)) {
        fsModule.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.campaigns.values());
      fsModule.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('[CorporateCampaignService] Hitilafu ya kuandika corporate_campaigns kwenye disk:', err);
      throw err;
    }
  }

  public getAllCampaigns(): CorporateCampaign[] {
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getCampaignById(campaignId: string): CorporateCampaign | null {
    const found = this.campaigns.get(campaignId);
    return found ? { ...found } : null;
  }

  public cacheCampaign(campaign: CorporateCampaign): void {
    if (campaign && campaign.campaignId) {
      this.campaigns.set(campaign.campaignId, { ...campaign });
    }
  }

  public createDraft(input: CreateCampaignDraftInput, actor: string): CorporateCampaign {
    const validation = validateCampaignDraftInput(input);
    if (!validation.isValid || !validation.sanitized) {
      const firstError = Object.values(validation.errors)[0] || 'Taarifa za kampeni si sahihi.';
      throw new Error(firstError);
    }

    const campaignId = this.generateCampaignId();
    const now = new Date().toISOString();

    const campaign: CorporateCampaign = {
      campaignId,
      advertiserName: validation.sanitized.advertiserName!,
      campaignName: validation.sanitized.campaignName!,
      placementId: validation.sanitized.placementId!,
      imageUrl: validation.sanitized.imageUrl!,
      storagePath: validation.sanitized.storagePath,
      destinationUrl: validation.sanitized.destinationUrl!,
      status: 'DRAFT', // Strictly DRAFT in Phase 1
      startDate: validation.sanitized.startDate || null,
      endDate: validation.sanitized.endDate || null,
      internalNotes: validation.sanitized.internalNotes || null,
      version: 'V1.0',
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now
    };

    this.campaigns.set(campaignId, campaign);
    if (isNodeEnv || (fsModule && pathModule)) {
      this.saveToDisk();
    }
    return { ...campaign };
  }

  public updateDraft(
    campaignId: string,
    updates: UpdateCampaignDraftInput,
    actor: string
  ): CorporateCampaign {
    const existing = this.campaigns.get(campaignId);
    if (!existing) {
      throw new Error(`Kampeni "${campaignId}" haijapatikana.`);
    }

    // Phase 1 security rule: Disallow setting status to APPROVED or activating public delivery
    if (updates.status && updates.status !== 'DRAFT' && updates.status !== 'ARCHIVED') {
      throw new Error('Katika Awamu ya 1, hali ya kampeni inaweza kuwa Rasimu (DRAFT) au Imehifadhiwa (ARCHIVED) pekee.');
    }

    const mergedInput: Partial<CreateCampaignDraftInput> = {
      advertiserName: updates.advertiserName !== undefined ? updates.advertiserName : existing.advertiserName,
      campaignName: updates.campaignName !== undefined ? updates.campaignName : existing.campaignName,
      placementId: updates.placementId !== undefined ? updates.placementId : existing.placementId,
      imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : existing.imageUrl,
      storagePath: updates.storagePath !== undefined ? updates.storagePath : existing.storagePath,
      destinationUrl: updates.destinationUrl !== undefined ? updates.destinationUrl : existing.destinationUrl,
      startDate: updates.startDate !== undefined ? updates.startDate : existing.startDate,
      endDate: updates.endDate !== undefined ? updates.endDate : existing.endDate,
      internalNotes: updates.internalNotes !== undefined ? updates.internalNotes : existing.internalNotes
    };

    const validation = validateCampaignDraftInput(mergedInput);
    if (!validation.isValid || !validation.sanitized) {
      const firstError = Object.values(validation.errors)[0] || 'Taarifa za marekebisho si sahihi.';
      throw new Error(firstError);
    }

    const now = new Date().toISOString();
    const updated: CorporateCampaign = {
      ...existing,
      ...validation.sanitized,
      status: (updates.status as CorporateCampaignStatus) || existing.status,
      updatedBy: actor,
      updatedAt: now
    };

    this.campaigns.set(campaignId, updated);
    if (isNodeEnv || (fsModule && pathModule)) {
      this.saveToDisk();
    }
    return { ...updated };
  }

  public archiveCampaign(campaignId: string, actor: string): CorporateCampaign {
    const existing = this.campaigns.get(campaignId);
    if (!existing) {
      throw new Error(`Kampeni "${campaignId}" haijapatikana.`);
    }

    const now = new Date().toISOString();
    const archived: CorporateCampaign = {
      ...existing,
      status: 'ARCHIVED',
      updatedBy: actor,
      updatedAt: now
    };

    this.campaigns.set(campaignId, archived);
    if (isNodeEnv || (fsModule && pathModule)) {
      this.saveToDisk();
    }
    return { ...archived };
  }

  public resetForTesting(): void {
    this.campaigns.clear();
    if (isNodeEnv || (fsModule && pathModule)) {
      try {
        const fullPath = pathModule.resolve(process.cwd(), CORPORATE_CAMPAIGNS_STORAGE_FILE);
        if (fsModule.existsSync(fullPath)) {
          fsModule.unlinkSync(fullPath);
        }
      } catch {}
    }
  }
}

export const corporateCampaignService = new CorporateCampaignService();
