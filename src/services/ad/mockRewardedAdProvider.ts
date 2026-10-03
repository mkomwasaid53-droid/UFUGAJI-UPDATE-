/**
 * V1.9A — Mock Rewarded Ad Provider
 *
 * Dedicated test provider for development and automated verification.
 * Does NOT generate real advertising revenue or connect to external ad networks.
 * Allows reproducible simulation of all edge cases:
 * - MOCK_COMPLETED
 * - MOCK_FAILED
 * - MOCK_DUPLICATE
 * - MOCK_INVALID_TOKEN
 * - MOCK_EXPIRED
 */

import {
  AdProvider,
  MockAdBehavior,
  StartRewardedAdParams,
  StartRewardedAdResult,
  VerifyRewardParams,
  VerifyRewardResult
} from './adProviderInterface';
import { AdPlatform } from '../../types/aiUsageAndCache';

export class MockRewardedAdProvider implements AdProvider {
  public readonly providerName: string = 'MOCK_REWARDED_AD';
  public isConfigured: boolean = false;
  public readonly supportedPlatforms: AdPlatform[] = ['WEB', 'ANDROID'];
  private currentBehavior: MockAdBehavior = 'MOCK_COMPLETED';
  private sessionCounter: number = 0;

  constructor(initialBehavior: MockAdBehavior = 'MOCK_COMPLETED', configured: boolean = false) {
    this.currentBehavior = initialBehavior;
    this.isConfigured = configured;
  }

  public supportsPlatform(_platform: AdPlatform): boolean {
    return true; // Mock supports both WEB and ANDROID
  }

  public setBehavior(behavior: MockAdBehavior, configured: boolean = true): void {
    this.currentBehavior = behavior;
    this.isConfigured = configured;
  }

  public getBehavior(): MockAdBehavior {
    return this.currentBehavior;
  }

  public async startRewardedAd(params: StartRewardedAdParams): Promise<StartRewardedAdResult> {
    this.sessionCounter++;
    const now = Date.now();

    const mockDiag = {
      provider: 'MOCK',
      environment: 'TEST',
      mode: 'SIMULATION',
      adUnitPath: 'MOCK_REWARDED',
      mock: true
    };

    if (this.currentBehavior === 'MOCK_FAILED') {
      return {
        success: false,
        providerSessionId: '',
        providerRewardId: '',
        rewardToken: '',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: true,
        errorMessage: 'MOCK_FAILED: Tangazo lilikatizwa kabla ya kukamilika (Simulated ad failure).',
        diagnostic: mockDiag
      };
    }

    if (this.currentBehavior === 'MOCK_DUPLICATE') {
      const fixedRewardId = 'mock_duplicate_provider_reward_ref_999';
      return {
        success: true,
        providerSessionId: `mock_sess_dup_${this.sessionCounter}`,
        providerRewardId: fixedRewardId,
        rewardToken: `MOCK_TOKEN:${params.userId}:${fixedRewardId}:${now}:VALID_SIG`,
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: true,
        diagnostic: mockDiag
      };
    }

    if (this.currentBehavior === 'MOCK_INVALID_TOKEN') {
      const rewardId = `mock_rew_${now}_${this.sessionCounter}`;
      return {
        success: true,
        providerSessionId: `mock_sess_inv_${this.sessionCounter}`,
        providerRewardId: rewardId,
        rewardToken: 'INVALID_MOCK_TOKEN_CORRUPT_CHECKSUM',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: true,
        diagnostic: mockDiag
      };
    }

    if (this.currentBehavior === 'MOCK_EXPIRED') {
      const rewardId = `mock_rew_exp_${now}_${this.sessionCounter}`;
      const expiredTimestamp = now - 2 * 60 * 60 * 1000; // 2 hours ago
      return {
        success: true,
        providerSessionId: `mock_sess_exp_${this.sessionCounter}`,
        providerRewardId: rewardId,
        rewardToken: `MOCK_TOKEN:${params.userId}:${rewardId}:${expiredTimestamp}:EXPIRED_SIG`,
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: true,
        diagnostic: mockDiag
      };
    }

    // Default: MOCK_COMPLETED
    const rewardId = `mock_rew_ok_${now}_${this.sessionCounter}_${Math.random().toString(36).substring(2, 7)}`;
    const token = `MOCK_TOKEN:${params.userId}:${rewardId}:${now}:VALID_SIG`;

    return {
      success: true,
      providerSessionId: `mock_sess_${now}_${this.sessionCounter}`,
      providerRewardId: rewardId,
      rewardToken: token,
      adProvider: this.providerName,
      adType: 'REWARDED_AD',
      mockMode: true,
      diagnostic: mockDiag
    };
  }

  public async verifyReward(params: VerifyRewardParams): Promise<VerifyRewardResult> {
    const { userId, rewardToken, providerRewardId } = params;

    // Check behavior-specific immediate verification outcomes
    if (this.currentBehavior === 'MOCK_FAILED') {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: `mock_tx_failed_${Date.now()}`,
        errorMessage: 'MOCK_FAILED: Uthibitisho wa mtoa tangazo umeshindikana (Mock provider verification rejected).'
      };
    }

    if (!rewardToken || !rewardToken.startsWith('MOCK_TOKEN:')) {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: `mock_tx_inv_${Date.now()}`,
        errorMessage: 'Token ya uthibitisho si sahihi (Invalid token format or tampered).'
      };
    }

    const parts = rewardToken.split(':');
    // Format: MOCK_TOKEN:userId:providerRewardId:timestamp:signature
    if (parts.length < 5) {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: `mock_tx_inv_${Date.now()}`,
        errorMessage: 'Muundo wa token ya tangazo si sahihi (Corrupt token structure).'
      };
    }

    const tokenUserId = parts[1];
    const tokenRewardId = parts[2];
    const tokenTimestamp = parseInt(parts[3], 10);
    const signature = parts[4];

    // User ownership verification
    if (tokenUserId !== userId) {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: `mock_tx_mismatch_${Date.now()}`,
        errorMessage: 'Utambulisho wa mtumiaji haulingani na token ya tangazo (User mismatch).'
      };
    }

    // Token reward ID match
    if (providerRewardId && tokenRewardId !== providerRewardId) {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: `mock_tx_mismatch_${Date.now()}`,
        errorMessage: 'Kitambulisho cha zawadi hakilingani (Reward ID mismatch).'
      };
    }

    // Expiry check (15 minutes expiry window)
    const MAX_TOKEN_AGE_MS = 15 * 60 * 1000;
    if (isNaN(tokenTimestamp) || Date.now() - tokenTimestamp > MAX_TOKEN_AGE_MS || signature === 'EXPIRED_SIG') {
      return {
        isValid: false,
        isExpired: true,
        providerRewardId,
        providerTransactionId: `mock_tx_expired_${Date.now()}`,
        errorMessage: 'Muda wa kutumia zawadi hii umekwisha (Expired reward proof).'
      };
    }

    if (signature !== 'VALID_SIG') {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: `mock_tx_badsig_${Date.now()}`,
        errorMessage: 'Sahihi ya token ya tangazo si sahihi (Invalid signature).'
      };
    }

    return {
      isValid: true,
      providerRewardId: tokenRewardId,
      providerTransactionId: `mock_tx_ok_${Date.now()}`,
      rawProviderResponse: {
        verifiedAt: new Date().toISOString(),
        behavior: this.currentBehavior,
        mock: true
      }
    };
  }

  public getSafeConfig(): Record<string, any> {
    return {
      providerName: this.providerName,
      isConfigured: this.isConfigured,
      currentBehavior: this.currentBehavior,
      isMock: true
    };
  }

  public updateConfig(newConfig: Record<string, any>): void {
    if (typeof newConfig.isConfigured === 'boolean') {
      this.isConfigured = newConfig.isConfigured;
    }
    if (newConfig.behavior) {
      this.currentBehavior = newConfig.behavior;
    }
  }

  public async testConnection(): Promise<{
    status: 'CONNECTED' | 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
    message: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'Mock Ad Provider haijawezeshwa (Configured is false).'
      };
    }
    return {
      status: 'CONNECTED',
      message: `Mock Ad Provider ipo tayari. Tabia ya sasa: ${this.currentBehavior}`,
      details: { behavior: this.currentBehavior }
    };
  }
}

// Singleton exported instance
export const mockRewardedAdProvider = new MockRewardedAdProvider('MOCK_COMPLETED', true);

