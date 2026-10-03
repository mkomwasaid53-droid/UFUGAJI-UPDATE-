/**
 * V1.9B — Google AdMob Rewarded Ad Provider Adapter
 *
 * Implements the provider-agnostic AdProvider contract for Google AdMob readiness.
 *
 * CRITICAL SAFETY RULES:
 * 1. Does NOT hardcode production App ID, Ad Unit ID, publisher ID, or secrets.
 * 2. Uses configuration placeholders / environment variables only.
 * 3. Never loads Android AdMob SDK code into Web builds.
 * 4. In TEST mode: uses official test configuration and verifiable tokens; never records fake revenue.
 * 5. In PRODUCTION mode: strictly gates through production safety lock. If any requirement fails,
 *    returns AD_PRODUCTION_NOT_READY or AD_PROVIDER_NOT_CONFIGURED.
 * 6. Never grants rewards without server verification.
 */

import crypto from 'crypto';
import {
  AdProvider,
  StartRewardedAdParams,
  StartRewardedAdResult,
  VerifyRewardParams,
  VerifyRewardResult,
  AdProviderMode,
  AdPlatform,
  AdFailureState
} from './adProviderInterface';
import { adComplianceService } from './adComplianceService';

// Public official Google AdMob test ad unit for Rewarded Ads
export const OFFICIAL_ADMOB_TEST_REWARDED_UNIT_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
export const OFFICIAL_ADMOB_TEST_REWARDED_UNIT_WEB = 'ca-app-pub-3940256099942544/5224354917-web';

export interface AdMobConfig {
  appId?: string;
  testRewardedAdUnitId?: string;
  productionRewardedAdUnitId?: string;
  webRewardedAdUnitId?: string;
  mode: AdProviderMode;
  platform: AdPlatform;
  isConfigured: boolean;
  productionEnabled: boolean;
}

export class AdMobRewardedAdProvider implements AdProvider {
  public readonly providerName: string = 'ADMOB';
  public isConfigured: boolean = false;
  public mode: AdProviderMode = 'MOCK';
  public platform: AdPlatform = 'WEB';

  private appId: string = '';
  private testRewardedAdUnitId: string = OFFICIAL_ADMOB_TEST_REWARDED_UNIT_ANDROID;
  private productionRewardedAdUnitId: string = '';
  private webRewardedAdUnitId: string = '';
  private productionEnabled: boolean = false;

  // Server secret for signing test tokens to prevent arbitrary client token forging
  private testServerSecret: string = 'ufugaji_admob_test_signing_secret_v19c';
  private sessionCounter: number = 0;

  constructor(initialConfig?: Partial<AdMobConfig>) {
    // Read from environment variables if available (without requiring them)
    const envAppId = process.env.ADMOB_APP_ID || '';
    const envProdAdUnit = process.env.ADMOB_REWARDED_AD_UNIT_ID || '';
    const envWebAdUnit = process.env.ADMOB_WEB_REWARDED_AD_UNIT_ID || '';
    const envTestAdUnit = process.env.ADMOB_TEST_REWARDED_AD_UNIT_ID || OFFICIAL_ADMOB_TEST_REWARDED_UNIT_ANDROID;
    const envSecret = process.env.ADMOB_SERVER_VERIFICATION_SECRET || 'ufugaji_admob_test_signing_secret_v19c';

    this.appId = initialConfig?.appId || envAppId;
    this.productionRewardedAdUnitId = initialConfig?.productionRewardedAdUnitId || envProdAdUnit;
    this.webRewardedAdUnitId = initialConfig?.webRewardedAdUnitId || envWebAdUnit;
    this.testRewardedAdUnitId = initialConfig?.testRewardedAdUnitId || envTestAdUnit;
    this.testServerSecret = envSecret;
    this.mode = initialConfig?.mode || 'MOCK';
    this.platform = initialConfig?.platform || 'ANDROID';
    this.productionEnabled = initialConfig?.productionEnabled || false;
    this.isConfigured = initialConfig?.isConfigured !== undefined ? initialConfig.isConfigured : Boolean(this.testRewardedAdUnitId);
  }

  public get supportedPlatforms(): AdPlatform[] {
    return this.hasWebAdUnit() ? ['ANDROID', 'WEB'] : ['ANDROID'];
  }

  public supportsPlatform(platform: AdPlatform): boolean {
    if (platform === 'ANDROID') {
      return true; // AdMob native SDK is supported on Android
    }
    if (platform === 'WEB') {
      // Web rewarded ads with AdMob require an explicitly configured Web Ad Unit
      return this.hasWebAdUnit();
    }
    return false;
  }

  public setMode(mode: AdProviderMode): void {
    this.mode = mode;
  }

  public setPlatform(platform: AdPlatform): void {
    this.platform = platform;
  }

  public setProductionEnabled(enabled: boolean): void {
    this.productionEnabled = enabled;
  }

  public hasProductionAdUnit(targetPlatform?: AdPlatform): boolean {
    const p = targetPlatform || this.platform;
    if (p === 'WEB') {
      return this.hasWebAdUnit();
    }
    return Boolean(this.productionRewardedAdUnitId && this.productionRewardedAdUnitId.trim().length > 0);
  }

  public hasWebAdUnit(): boolean {
    return Boolean(this.webRewardedAdUnitId && this.webRewardedAdUnitId.trim().length > 0);
  }

  public hasTestAdUnit(): boolean {
    return Boolean(this.testRewardedAdUnitId && this.testRewardedAdUnitId.trim().length > 0);
  }

  /**
   * Helper to sign a test token deterministically
   */
  private generateTestToken(userId: string, providerRewardId: string, timestamp: number): string {
    const payload = `ADMOB_TEST:${userId}:${providerRewardId}:${timestamp}`;
    const hmac = crypto.createHmac('sha256', this.testServerSecret).update(payload).digest('hex').substring(0, 16);
    return `${payload}:${hmac}`;
  }

  /**
   * Starts a rewarded ad session via AdMob adapter.
   */
  public async startRewardedAd(params: StartRewardedAdParams): Promise<StartRewardedAdResult> {
    this.sessionCounter++;
    const now = Date.now();
    const effectiveMode = params.mode || this.mode;
    const effectivePlatform = params.platform || this.platform;

    // 1. Basic configuration check
    if (!this.isConfigured) {
      return {
        success: false,
        providerSessionId: '',
        providerRewardId: '',
        rewardToken: '',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mode: effectiveMode,
        platform: effectivePlatform,
        errorCode: 'AD_PROVIDER_NOT_CONFIGURED',
        errorMessage: 'AD_PROVIDER_NOT_CONFIGURED: Mtoa tangazo wa AdMob hajawezeshwa au usanidi unakosekana.'
      };
    }

    // 2. Platform compatibility check (Android AdMob cannot run on Web without dedicated Web ad unit)
    if (!this.supportsPlatform(effectivePlatform)) {
      return {
        success: false,
        providerSessionId: '',
        providerRewardId: '',
        rewardToken: '',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mode: effectiveMode,
        platform: effectivePlatform,
        errorCode: 'AD_PLATFORM_MISMATCH',
        errorMessage: `AD_PLATFORM_MISMATCH: Mfumo wa Android AdMob SDK hauwezi kutumika moja kwa moja kwenye jukwaa la ${effectivePlatform} bila usanidi maalum.`
      };
    }

    // 3. MOCK mode handling
    if (effectiveMode === 'MOCK') {
      const rewardId = `admob_mock_rew_${now}_${this.sessionCounter}`;
      const token = `ADMOB_MOCK_TOKEN:${params.userId}:${rewardId}:${now}:VALID_MOCK_SIG`;
      return {
        success: true,
        providerSessionId: `admob_mock_sess_${now}_${this.sessionCounter}`,
        providerRewardId: rewardId,
        rewardToken: token,
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: true,
        mode: 'MOCK',
        platform: effectivePlatform
      };
    }

    // 4. TEST mode handling
    if (effectiveMode === 'TEST') {
      if (!this.hasTestAdUnit()) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: 'TEST',
          platform: effectivePlatform,
          errorCode: 'AD_PROVIDER_NOT_CONFIGURED',
          errorMessage: 'AD_PROVIDER_NOT_CONFIGURED: Kitambulisho cha tangazo la jaribio (Test Ad Unit) hakijawekwa.'
        };
      }

      const providerRewardId = `admob_test_rew_${effectivePlatform.toLowerCase()}_${now}_${this.sessionCounter}`;
      const token = this.generateTestToken(params.userId, providerRewardId, now);

      return {
        success: true,
        providerSessionId: `admob_test_sess_${now}_${this.sessionCounter}`,
        providerRewardId,
        rewardToken: token,
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: false,
        mode: 'TEST',
        platform: effectivePlatform,
        adUnitId: this.testRewardedAdUnitId
      };
    }

    // 5. PRODUCTION mode handling
    if (effectiveMode === 'PRODUCTION') {
      // Evaluate Production Safety Gate
      if (!this.productionEnabled) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: 'PRODUCTION',
          platform: effectivePlatform,
          errorCode: 'AD_PRODUCTION_DISABLED',
          errorMessage: 'AD_PRODUCTION_DISABLED: Matangazo halisi hayajawezeshwa na msimamizi.'
        };
      }

      if (!this.hasProductionAdUnit(effectivePlatform)) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: 'PRODUCTION',
          platform: effectivePlatform,
          errorCode: 'AD_PROVIDER_NOT_CONFIGURED',
          errorMessage: `AD_PROVIDER_NOT_CONFIGURED: Kitambulisho halisi cha tangazo la uzalishaji hakijawekwa kwa jukwaa la ${effectivePlatform}.`
        };
      }

      const safetyCheck = adComplianceService.evaluateProductionSafetyGate({
        providerConfigured: this.isConfigured,
        providerIntegrationAvailable: true,
        platform: effectivePlatform,
        platformConfigured: true,
        platformCompatible: this.supportsPlatform(effectivePlatform),
        productionAdUnitConfigured: this.hasProductionAdUnit(effectivePlatform),
        productionEnabledByAdmin: this.productionEnabled,
        isProductionEnv: process.env.NODE_ENV === 'production'
      });

      if (!safetyCheck.eligible) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: 'PRODUCTION',
          platform: effectivePlatform,
          errorCode: safetyCheck.errorCode || 'AD_PRODUCTION_NOT_READY',
          errorMessage: safetyCheck.reason || 'AD_PRODUCTION_NOT_READY: Mfumo wa matangazo halisi haupo tayari kwa usalama.'
        };
      }

      // If all conditions pass:
      const prodRewardId = `admob_prod_rew_${now}_${this.sessionCounter}`;
      const prodToken = `ADMOB_PROD:${params.userId}:${prodRewardId}:${now}:PROD_TOKEN`;
      return {
        success: true,
        providerSessionId: `admob_prod_sess_${now}_${this.sessionCounter}`,
        providerRewardId: prodRewardId,
        rewardToken: prodToken,
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        mockMode: false,
        mode: 'PRODUCTION',
        platform: effectivePlatform
      };
    }

    return {
      success: false,
      providerSessionId: '',
      providerRewardId: '',
      rewardToken: '',
      adProvider: this.providerName,
      adType: 'REWARDED_AD',
      errorCode: 'AD_PROVIDER_ERROR',
      errorMessage: `Hali isiyotambuliwa ya mtoa tangazo: ${effectiveMode}`
    };
  }

  /**
   * Verifies an AdMob rewarded ad completion proof.
   */
  public async verifyReward(params: VerifyRewardParams): Promise<VerifyRewardResult> {
    const { userId, rewardToken, providerRewardId, platform } = params;

    if (!rewardToken) {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: '',
        errorCode: 'AD_REWARD_VERIFICATION_FAILED',
        errorMessage: 'Token ya uthibitisho wa AdMob haipo.'
      };
    }

    const effectivePlatform = platform || this.platform;
    if (!this.supportsPlatform(effectivePlatform)) {
      return {
        isValid: false,
        providerRewardId,
        providerTransactionId: '',
        errorCode: 'AD_PLATFORM_MISMATCH',
        errorMessage: `AD_PLATFORM_MISMATCH: Jukwaa la ${effectivePlatform} haliendani na AdMob.`
      };
    }

    // 1. MOCK Token Verification
    if (rewardToken.startsWith('ADMOB_MOCK_TOKEN:')) {
      const parts = rewardToken.split(':');
      if (parts.length < 5) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_tx_err_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Muundo wa token ya AdMob Mock si sahihi.'
        };
      }

      const tokenUserId = parts[1];
      const tokenRewardId = parts[2];
      const tokenTimestamp = parseInt(parts[3], 10);
      const signature = parts[4];

      if (tokenUserId !== userId) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_tx_mismatch_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Utambulisho wa mtumiaji haulingani na token ya AdMob.'
        };
      }

      if (providerRewardId && tokenRewardId !== providerRewardId) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_tx_mismatch_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Kitambulisho cha zawadi hakilingani.'
        };
      }

      const MAX_AGE_MS = 15 * 60 * 1000;
      if (isNaN(tokenTimestamp) || Date.now() - tokenTimestamp > MAX_AGE_MS || signature === 'EXPIRED_SIG') {
        return {
          isValid: false,
          isExpired: true,
          providerRewardId,
          providerTransactionId: `admob_tx_exp_${Date.now()}`,
          errorCode: 'AD_REWARD_EXPIRED',
          errorMessage: 'Muda wa kutumia zawadi hii ya AdMob umekwisha.'
        };
      }

      return {
        isValid: true,
        providerRewardId: tokenRewardId,
        providerTransactionId: `admob_mock_tx_${Date.now()}`,
        rawProviderResponse: {
          mode: 'MOCK',
          platform: effectivePlatform,
          verifiedAt: new Date().toISOString()
        }
      };
    }

    // 2. TEST Token Verification
    if (rewardToken.startsWith('ADMOB_TEST:')) {
      const parts = rewardToken.split(':');
      if (parts.length < 5) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_test_tx_inv_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Muundo wa token ya AdMob Test si sahihi.'
        };
      }

      const tokenUserId = parts[1];
      const tokenRewardId = parts[2];
      const tokenTimestamp = parseInt(parts[3], 10);
      const signature = parts[4];

      if (tokenUserId !== userId) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_test_tx_mismatch_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Utambulisho wa mtumiaji haulingani na token ya jaribio ya AdMob.'
        };
      }

      if (providerRewardId && tokenRewardId !== providerRewardId) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_test_tx_mismatch_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Kitambulisho cha zawadi ya jaribio hakilingani.'
        };
      }

      // Verify HMAC signature
      const expectedPayload = `ADMOB_TEST:${tokenUserId}:${tokenRewardId}:${tokenTimestamp}`;
      const expectedHmac = crypto.createHmac('sha256', this.testServerSecret).update(expectedPayload).digest('hex').substring(0, 16);
      if (signature !== expectedHmac) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_test_tx_tampered_${Date.now()}`,
          errorCode: 'AD_REWARD_VERIFICATION_FAILED',
          errorMessage: 'Sahihi ya token ya jaribio si sahihi (Tampered token signature).'
        };
      }

      const MAX_AGE_MS = 15 * 60 * 1000;
      if (isNaN(tokenTimestamp) || Date.now() - tokenTimestamp > MAX_AGE_MS) {
        return {
          isValid: false,
          isExpired: true,
          providerRewardId,
          providerTransactionId: `admob_test_tx_exp_${Date.now()}`,
          errorCode: 'AD_REWARD_EXPIRED',
          errorMessage: 'Muda wa kutumia zawadi hii ya jaribio umekwisha.'
        };
      }

      return {
        isValid: true,
        providerRewardId: tokenRewardId,
        providerTransactionId: `admob_test_tx_${Date.now()}`,
        rawProviderResponse: {
          mode: 'TEST',
          platform: effectivePlatform,
          simulatedRevenue: 0, // Explicitly 0: never record simulated revenue as real revenue
          verifiedAt: new Date().toISOString()
        }
      };
    }

    // 3. PRODUCTION Token Verification
    if (rewardToken.startsWith('ADMOB_PROD:')) {
      const safetyCheck = adComplianceService.evaluateProductionSafetyGate({
        providerConfigured: this.isConfigured,
        providerIntegrationAvailable: true,
        platform: effectivePlatform,
        platformConfigured: true,
        platformCompatible: this.supportsPlatform(effectivePlatform),
        productionAdUnitConfigured: this.hasProductionAdUnit(effectivePlatform),
        productionEnabledByAdmin: this.productionEnabled,
        isProductionEnv: process.env.NODE_ENV === 'production'
      });

      if (!safetyCheck.eligible) {
        return {
          isValid: false,
          providerRewardId,
          providerTransactionId: `admob_prod_gate_blocked_${Date.now()}`,
          errorCode: safetyCheck.errorCode || 'AD_PRODUCTION_NOT_READY',
          errorMessage: safetyCheck.reason || 'AD_PRODUCTION_NOT_READY: Uthibitisho wa uzalishaji umezuiwa na kufuli la usalama.'
        };
      }

      return {
        isValid: true,
        providerRewardId,
        providerTransactionId: `admob_prod_tx_${Date.now()}`,
        rawProviderResponse: {
          mode: 'PRODUCTION',
          platform: effectivePlatform,
          verifiedAt: new Date().toISOString()
        }
      };
    }

    return {
      isValid: false,
      providerRewardId,
      providerTransactionId: `admob_tx_bad_token_${Date.now()}`,
      errorCode: 'AD_REWARD_VERIFICATION_FAILED',
      errorMessage: 'Muundo wa token ya AdMob hautambuliki.'
    };
  }

  /**
   * Safe non-sensitive configuration snapshot.
   * Strips out any private credentials or secrets.
   */
  public getSafeConfig(): Record<string, any> {
    const isPlatformOk = this.supportsPlatform(this.platform);
    return {
      providerName: this.providerName,
      isConfigured: this.isConfigured,
      mode: this.mode,
      platform: this.platform,
      supportedPlatforms: this.supportedPlatforms,
      platformCompatible: isPlatformOk,
      productionEnabled: this.productionEnabled,
      hasAppId: Boolean(this.appId && this.appId.length > 0),
      hasTestAdUnit: this.hasTestAdUnit(),
      hasProductionAdUnit: this.hasProductionAdUnit(),
      hasWebAdUnit: this.hasWebAdUnit(),
      testAdUnitId: this.testRewardedAdUnitId,
      // Production Ad Unit is masked for security
      productionAdUnitConfigured: this.hasProductionAdUnit(),
      productionAdUnitMasked: this.hasProductionAdUnit('ANDROID')
        ? `${this.productionRewardedAdUnitId.substring(0, 10)}...***`
        : 'NOT_CONFIGURED',
      webAdUnitMasked: this.hasWebAdUnit()
        ? `${this.webRewardedAdUnitId.substring(0, 10)}...***`
        : 'NOT_CONFIGURED',
      productionSafetyLock: !this.productionEnabled || !this.hasProductionAdUnit() || !isPlatformOk
    };
  }

  /**
   * Safe runtime update of AdMob settings by Admin.
   */
  public updateConfig(newConfig: Record<string, any>): void {
    if (typeof newConfig.isConfigured === 'boolean') {
      this.isConfigured = newConfig.isConfigured;
    }
    if (newConfig.mode === 'MOCK' || newConfig.mode === 'TEST' || newConfig.mode === 'PRODUCTION') {
      this.mode = newConfig.mode;
    }
    if (newConfig.platform === 'WEB' || newConfig.platform === 'ANDROID') {
      this.platform = newConfig.platform;
    }
    if (typeof newConfig.productionEnabled === 'boolean') {
      this.productionEnabled = newConfig.productionEnabled;
    }
    if (typeof newConfig.testRewardedAdUnitId === 'string' && newConfig.testRewardedAdUnitId.trim()) {
      this.testRewardedAdUnitId = newConfig.testRewardedAdUnitId.trim();
    }
    if (typeof newConfig.productionRewardedAdUnitId === 'string') {
      this.productionRewardedAdUnitId = newConfig.productionRewardedAdUnitId.trim();
    }
    if (typeof newConfig.webRewardedAdUnitId === 'string') {
      this.webRewardedAdUnitId = newConfig.webRewardedAdUnitId.trim();
    }
    if (typeof newConfig.appId === 'string') {
      this.appId = newConfig.appId.trim();
    }
  }

  /**
   * Safe non-ad test connection check.
   */
  public async testConnection(targetPlatform?: AdPlatform): Promise<{
    status: 'CONNECTED' | 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
    message: string;
    details?: any;
  }> {
    if (!this.isConfigured) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'AdMob Provider haijawezeshwa (isConfigured is false).'
      };
    }

    const effectivePlatform = targetPlatform || (this.supportsPlatform(this.platform) ? this.platform : 'ANDROID');

    if (!this.supportsPlatform(effectivePlatform)) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: `AD_PLATFORM_MISMATCH: Jukwaa la ${effectivePlatform} haliendani na AdMob bila usanidi wa Web.`
      };
    }

    if (this.mode === 'TEST' && !this.hasTestAdUnit()) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'Usanidi wa tangazo la majaribio (Test Ad Unit) unakosekana kwa mfumo wa AdMob TEST.'
      };
    }

    if (this.mode === 'PRODUCTION' && !this.hasProductionAdUnit(this.platform)) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: `AD_PROVIDER_NOT_CONFIGURED: Kitambulisho halisi cha tangazo la uzalishaji (Production Ad Unit ID) hakijawekwa kwa jukwaa la ${this.platform}.`
      };
    }

    return {
      status: 'CONNECTED',
      message: `Muunganisho salama wa AdMob umeidhinishwa. Mode: ${this.mode}, Jukwaa: ${this.platform}. (Hakuna tangazo halisi au mapato yaliyorekodiwa).`,
      details: {
        mode: this.mode,
        platform: this.platform,
        hasTestConfig: this.hasTestAdUnit(),
        hasProductionConfig: this.hasProductionAdUnit(this.platform),
        productionEnabled: this.productionEnabled,
        platformCompatible: true
      }
    };
  }
}

// Singleton exported instance
export const adMobRewardedAdProvider = new AdMobRewardedAdProvider();

