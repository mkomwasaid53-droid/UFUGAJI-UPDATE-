/**
 * Ufugaji Update — Ad Placement Foundation V1.0
 * Campaign-Source Boundary Interface & Default Provider
 *
 * Establishes a clean, strict boundary between placement rendering and future
 * corporate campaign selection.
 *
 * Rules:
 * - Does NOT hardcode real company advertisements or URLs.
 * - Does NOT invent fake advertisers, campaign budgets, or click quotas.
 * - Does NOT promote arbitrary marketplace seller listings automatically.
 * - Does NOT use advertisement existence to alter product ranking.
 * - Defaults to NO_ACTIVE_CAMPAIGN, collapsing placements cleanly.
 */

import {
  CampaignCreative,
  CampaignSelectionRequest,
  CampaignSelectionResult
} from '../../types/adPlacementTypes';
import { adPlacementRegistry } from './adPlacementRegistry';

export interface ICampaignSourceService {
  selectCampaign(request: CampaignSelectionRequest): Promise<CampaignSelectionResult>;
}

class DefaultCampaignSourceService implements ICampaignSourceService {
  private testProvider: ((request: CampaignSelectionRequest) => Promise<CampaignSelectionResult> | CampaignSelectionResult) | null = null;

  /**
   * Evaluates campaign availability for the requested placement slot.
   * In V1.0 foundation phase, returns empty campaign state unless a test
   * provider is explicitly injected during unit testing.
   */
  public async selectCampaign(request: CampaignSelectionRequest): Promise<CampaignSelectionResult> {
    const placement = adPlacementRegistry.getPlacement(request.placementId);

    // 1. Placement existence and enabled state check
    if (!placement) {
      return {
        hasCampaign: false,
        reason: 'NO_ACTIVE_CAMPAIGN'
      };
    }

    if (!placement.isEnabled) {
      return {
        hasCampaign: false,
        reason: 'PLACEMENT_DISABLED'
      };
    }

    // 2. Allow isolated test harness override if registered
    if (this.testProvider) {
      try {
        const result = await this.testProvider(request);
        return result;
      } catch (err) {
        console.warn('[CampaignSource] Error in test campaign provider:', err);
        return {
          hasCampaign: false,
          reason: 'ERROR'
        };
      }
    }

    // 3. V1.0 Foundation default: Clean boundary with no active corporate campaigns yet
    return {
      hasCampaign: false,
      reason: 'NO_ACTIVE_CAMPAIGN',
      campaign: null
    };
  }

  /**
   * For automated testing and local test harness ONLY.
   */
  public registerTestProvider(
    provider: (request: CampaignSelectionRequest) => Promise<CampaignSelectionResult> | CampaignSelectionResult
  ): void {
    this.testProvider = provider;
  }

  /**
   * Clears any test harness override.
   */
  public clearTestProvider(): void {
    this.testProvider = null;
  }
}

export const campaignSourceService = new DefaultCampaignSourceService();
