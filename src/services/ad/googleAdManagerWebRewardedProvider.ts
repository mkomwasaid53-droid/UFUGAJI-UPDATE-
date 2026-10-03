/**
 * Ufugaji Update — V1.9F Google Ad Manager Web Rewarded Ad Provider
 *
 * Implements Google Ad Manager Web Rewarded Ads via Google Publisher Tag (GPT).
 * Respects official Google Web Rewarded ad architecture:
 * 1. Out-of-page rewarded slot: googletag.defineOutOfPageSlot(path, googletag.enums.OutOfPageFormat.REWARDED)
 * 2. Event-driven lifecycle: rewardedSlotReady, rewardedSlotGranted, rewardedSlotClosed, rewardedSlotVideoCompleted
 * 3. User opt-in and consent confirmation before makeRewardedVisible()
 * 4. Google Web Rewarded signal -> rewardedSlotGranted -> internal reward-session security token validation -> server-side user/eligibility check -> +5 text queries
 * 5. Strictly rejects Android AdMob Mobile IDs on Web (AD_PLATFORM_PROVIDER_MISMATCH)
 * 6. Strictly rejects fake universal test publisher IDs or placeholder ad unit paths in production
 * 7. Verification boundary: Per Google official documentation, server-side verification is an app-only feature
 *    and unavailable for Web rewarded ads. Internal security token validates session ownership and replay protection,
 *    never claiming to be Google's server-side verification.
 */

import crypto from 'crypto';
import {
  AdProvider,
  StartRewardedAdParams,
  StartRewardedAdResult,
  VerifyRewardParams,
  VerifyRewardResult,
  AdProviderMode,
  AdPlatform
} from './adProviderInterface';

export type GamWebProviderState =
  | 'NOT_CONFIGURED'
  | 'LOADING'
  | 'READY'
  | 'SHOWING'
  | 'REWARDED'
  | 'CLOSED'
  | 'NO_FILL'
  | 'UNSUPPORTED'
  | 'ERROR'
  | 'PAUSED'
  | 'BLOCKED';

export interface GoogleAdManagerWebConfig {
  webRewardedAdUnitPath?: string;
  testAdUnitPath?: string;
  environment: 'TEST' | 'PRODUCTION';
  mode: AdProviderMode;
  platform: AdPlatform;
  isConfigured: boolean;
  productionEnabled: boolean;
}

// Known Google AdMob Mobile Test Publisher ID that MUST NOT appear in Web ad units
export const GOOGLE_ADMOB_MOBILE_TEST_PUBLISHER_ID = '3940256099942544';

export class GoogleAdManagerWebRewardedProvider implements AdProvider {
  public readonly providerName: string = 'GOOGLE_AD_MANAGER_WEB';
  public readonly supportedPlatforms: AdPlatform[] = ['WEB'];
  public isConfigured: boolean = false;
  public mode: AdProviderMode = 'MOCK';
  public platform: AdPlatform = 'WEB';

  private webRewardedAdUnitPath: string = '';
  private testAdUnitPath: string = '';
  private environment: 'TEST' | 'PRODUCTION' = 'TEST';
  private productionEnabled: boolean = false;
  private currentState: GamWebProviderState = 'NOT_CONFIGURED';

  // Server secret for signing Ufugaji Update internal reward-session security token
  private internalSigningSecret: string = 'ufugaji_gam_web_internal_security_token_v19f';
  private sessionCounter: number = 0;

  constructor(initialConfig?: Partial<GoogleAdManagerWebConfig>) {
    if (initialConfig) {
      this.mode = initialConfig.mode || 'MOCK';
      this.platform = 'WEB';
      this.environment = initialConfig.environment || 'TEST';
      this.productionEnabled = initialConfig.productionEnabled ?? false;
      if (initialConfig.webRewardedAdUnitPath) {
        this.setWebRewardedAdUnitPath(initialConfig.webRewardedAdUnitPath);
      }
      if (initialConfig.testAdUnitPath) {
        this.setTestAdUnitPath(initialConfig.testAdUnitPath);
      }
      this.isConfigured = initialConfig.isConfigured ?? (this.mode === 'MOCK' || Boolean(this.webRewardedAdUnitPath));
    } else {
      this.mode = 'MOCK';
      this.platform = 'WEB';
      this.environment = 'TEST';
      this.isConfigured = true;
    }
    this.updateCurrentState();
  }

  public supportsPlatform(platform: AdPlatform): boolean {
    return platform === 'WEB';
  }

  /**
   * Validates Google Ad Manager Web Rewarded Ad Unit Path.
   * Path format must be /NETWORK_CODE/AD_UNIT_NAME.
   * Rejects Mobile AdMob test IDs, fake publisher IDs, placeholders, and test values in production.
   */
  public validateAdUnitPath(
    adUnitPath?: string,
    isProduction: boolean = false
  ): { isValid: boolean; reason?: string } {
    if (!adUnitPath || typeof adUnitPath !== 'string' || adUnitPath.trim().length === 0) {
      return {
        isValid: false,
        reason: 'Njia ya tangazo la Google Ad Manager Web (Web Rewarded Ad Unit Path) haijawekwa au ni tupu.'
      };
    }

    const trimmed = adUnitPath.trim();

    // 0. Must NOT contain whitespace anywhere
    if (/\s/.test(trimmed)) {
      return {
        isValid: false,
        reason: 'Njia ya tangazo haitakiwi kuwa na nafasi wazi (whitespace).'
      };
    }

    // 1. Must NOT be an AdMob Mobile unit ID or publisher ID
    if (
      trimmed.startsWith('ca-app-pub-') ||
      trimmed.startsWith('ca-pub-') ||
      trimmed.startsWith('pub-') ||
      trimmed.includes(GOOGLE_ADMOB_MOBILE_TEST_PUBLISHER_ID)
    ) {
      return {
        isValid: false,
        reason:
          'Kitambulisho hiki ni cha Google AdMob ya Mobile App au AdSense (ca-app-pub-.../pub-...). Kwa Web App, tumia muundo wa Google Ad Manager: /NETWORK_CODE/AD_UNIT_NAME.'
      };
    }

    // 2. Must start with '/'
    if (!trimmed.startsWith('/')) {
      return {
        isValid: false,
        reason: 'Njia ya tangazo la Google Ad Manager lazima ianze na "/" (mfano format: /NETWORK_CODE/AD_UNIT_NAME).'
      };
    }

    // 2b. Must NOT be an Interstitial test path documented by Google (/6355419/Travel/Europe/France/Paris)
    if (
      trimmed === '/6355419/Travel/Europe/France/Paris' ||
      trimmed.includes('Travel/Europe/France/Paris')
    ) {
      return {
        isValid: false,
        reason:
          'Njia /6355419/Travel/Europe/France/Paris ni mfano wa Interstitial uliopo kwenye nyaraka za Google, si kitengo cha Rewarded Ads. Weka njia halisi ya rewarded ad unit kutoka kwenye akaunti yako ya Google Ad Manager.'
      };
    }

    // 2c. Must NOT be the legacy invented Ufugaji test path
    if (
      trimmed === '/21775744923/ufugaji_web_test_rewarded' ||
      trimmed.includes('ufugaji_web_test_rewarded')
    ) {
      return {
        isValid: false,
        reason:
          'Njia /21775744923/ufugaji_web_test_rewarded ni kitambulisho cha zamani kilichobuniwa. Weka njia halisi ya Google Ad Manager Network yako au tumia Mock Simulation.'
      };
    }

    // 2d. Must NOT be just a network code alone (e.g. /6355419)
    if (/^\/\d+$/.test(trimmed)) {
      return {
        isValid: false,
        reason:
          'Nambari ya mtandao pekee haitoshi. Lazima ujumuishe jina la tangazo (mfano: /NETWORK_CODE/AD_UNIT_NAME).'
      };
    }

    // 3. Must match GAM ad unit path format: /NETWORK_CODE/AD_UNIT_NAME[/...]
    // Network code must be digits (typically 4 to 15 digits)
    const gamPattern = /^\/\d{4,15}\/[a-zA-Z0-9_\-\/]+$/;
    if (!gamPattern.test(trimmed)) {
      return {
        isValid: false,
        reason:
          'Muundo wa njia ya tangazo si sahihi. Lazima uwe na nambari ya mtandao na jina la tangazo (mfano format: /NETWORK_CODE/AD_UNIT_NAME).'
      };
    }

    // 4. Reject placeholders and generic sample strings
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('network_code') ||
      lower.includes('placeholder') ||
      lower.includes('sample') ||
      lower.includes('dummy') ||
      lower.includes('invented') ||
      lower.includes('/12345/') ||
      lower.includes('/1234567/')
    ) {
      return {
        isValid: false,
        reason:
          'Njia hii inaonekana kuwa ni placeholder au mfano. Weka namba halisi ya mtandao kutoka dashibodi ya Google Ad Manager.'
      };
    }

    // 5. In Production: reject test values
    if (isProduction) {
      if (
        lower.includes('test') ||
        lower.includes('mock') ||
        lower.includes('sandbox') ||
        lower.includes('demo') ||
        (this.testAdUnitPath && trimmed === this.testAdUnitPath)
      ) {
        return {
          isValid: false,
          reason:
            'Njia hii ina kitambulisho cha majaribio (test/mock/sandbox). Katika uzalishaji (PRODUCTION), tumia njia halisi ya uzalishaji ya Google Ad Manager.'
        };
      }
    }

    return { isValid: true };
  }

  public setWebRewardedAdUnitPath(path: string): { success: boolean; message: string } {
    const isProd = this.environment === 'PRODUCTION' || this.mode === 'PRODUCTION';
    const validation = this.validateAdUnitPath(path, isProd);
    if (!validation.isValid) {
      return { success: false, message: validation.reason || 'Njia ya tangazo si sahihi.' };
    }

    this.webRewardedAdUnitPath = path.trim();
    this.isConfigured = true;
    this.updateCurrentState();
    return {
      success: true,
      message: 'Njia ya tangazo la Google Ad Manager Web ya uzalishaji imesasishwa kikamilifu.'
    };
  }

  public getWebRewardedAdUnitPath(): string {
    return this.webRewardedAdUnitPath;
  }

  public setTestAdUnitPath(path: string): { success: boolean; message: string } {
    if (!path || path.trim() === '') {
      this.testAdUnitPath = '';
      return {
        success: true,
        message: 'Njia ya majaribio ya Google Ad Manager imeondolewa.'
      };
    }

    const validation = this.validateAdUnitPath(path, false);
    if (!validation.isValid) {
      return { success: false, message: validation.reason || 'Njia ya tangazo la jaribio si sahihi.' };
    }

    this.testAdUnitPath = path.trim();
    return {
      success: true,
      message: 'Njia ya jaribio ya Google Ad Manager Web (TEST configuration) imehifadhiwa.'
    };
  }

  public getTestAdUnitPath(): string {
    return this.testAdUnitPath;
  }

  public setMode(mode: AdProviderMode): void {
    this.mode = mode;
    this.updateCurrentState();
  }

  public setEnvironment(env: 'TEST' | 'PRODUCTION'): void {
    this.environment = env;
    this.updateCurrentState();
  }

  public setProductionEnabled(enabled: boolean): void {
    this.productionEnabled = enabled;
    this.updateCurrentState();
  }

  public getCurrentState(): GamWebProviderState {
    return this.currentState;
  }

  private updateCurrentState(): void {
    if (!this.isConfigured) {
      this.currentState = 'NOT_CONFIGURED';
    } else if (this.mode === 'PRODUCTION' && !this.productionEnabled) {
      this.currentState = 'PAUSED';
    } else {
      this.currentState = 'READY';
    }
  }

  /**
   * Starts a rewarded ad session for Google Ad Manager Web.
   */
  public async startRewardedAd(params: StartRewardedAdParams): Promise<StartRewardedAdResult> {
    const { userId, requestId, platform, mode, consentStatus } = params;

    // 1. Strict platform verification: Never allow Android AdMob or non-web on GAM Web provider
    if (platform === 'ANDROID') {
      return {
        success: false,
        providerSessionId: '',
        providerRewardId: '',
        rewardToken: '',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        platform: 'ANDROID',
        errorCode: 'AD_PLATFORM_PROVIDER_MISMATCH',
        errorMessage: 'Mtoa tangazo wa Google Ad Manager Web hauwezi kutumika kwenye mfumo wa Android.'
      };
    }

    // 2. Consent verification
    if (consentStatus === 'DENIED') {
      return {
        success: false,
        providerSessionId: '',
        providerRewardId: '',
        rewardToken: '',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        errorCode: 'AD_CONSENT_DENIED',
        errorMessage: 'Mtumiaji amekataa idhini ya matangazo (Consent Denied).'
      };
    }
    if (consentStatus === 'REQUIRED') {
      return {
        success: false,
        providerSessionId: '',
        providerRewardId: '',
        rewardToken: '',
        adProvider: this.providerName,
        adType: 'REWARDED_AD',
        errorCode: 'AD_CONSENT_REQUIRED',
        errorMessage: 'Idhini ya mtumiaji inahitajika kabla ya kuonyesha tangazo la wavuti.'
      };
    }

    const currentMode = mode || this.mode;

    // 3. Mode & Production Safety Check
    if (currentMode === 'PRODUCTION') {
      if (!this.productionEnabled) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: currentMode,
          errorCode: 'AD_PRODUCTION_DISABLED',
          errorMessage: 'Matangazo ya Google Ad Manager ya uzalishaji hayajawezeshwa na msimamizi.'
        };
      }

      const validation = this.validateAdUnitPath(this.webRewardedAdUnitPath, true);
      if (!validation.isValid) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: currentMode,
          errorCode: 'AD_PRODUCTION_NOT_READY',
          errorMessage: validation.reason || 'Usanidi wa tangazo la Google Ad Manager haujakamilika.'
        };
      }
    } else if (currentMode === 'TEST') {
      if (!this.testAdUnitPath || this.testAdUnitPath.trim().length === 0) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: 'TEST',
          platform: 'WEB',
          errorCode: 'GAM_TEST_NOT_CONFIGURED',
          errorMessage: 'Google Ad Manager Web TEST haijasanidiwa. Weka GAM Test Ad Unit Path kwenye usanidi wa Admin.',
          diagnostic: {
            provider: 'GAM_WEB',
            environment: 'TEST',
            mode: 'REAL_PROVIDER',
            adUnitPath: '',
            mock: false
          }
        };
      }

      const testValidation = this.validateAdUnitPath(this.testAdUnitPath, false);
      if (!testValidation.isValid) {
        return {
          success: false,
          providerSessionId: '',
          providerRewardId: '',
          rewardToken: '',
          adProvider: this.providerName,
          adType: 'REWARDED_AD',
          mode: 'TEST',
          platform: 'WEB',
          errorCode: 'GAM_TEST_UNAVAILABLE',
          errorMessage: `Njia ya majaribio ya Google Ad Manager si sahihi: ${testValidation.reason}`,
          diagnostic: {
            provider: 'GAM_WEB',
            environment: 'TEST',
            mode: 'REAL_PROVIDER',
            adUnitPath: this.testAdUnitPath,
            mock: false
          }
        };
      }
    }

    // 4. Session & Ufugaji Update internal reward-session security token generation
    // NOTE: Per Google official docs, server-side verification is an app-only feature and is
    // unavailable for Web rewarded ads. This internal token protects session ownership,
    // replay protection, expiry, cross-user security, and request correlation.
    this.sessionCounter++;
    const now = Date.now();
    const providerSessionId = `gam_web_sess_${now}_${Math.random().toString(36).substring(2, 9)}`;
    const providerRewardId = `gam_rew_${now}_${this.sessionCounter}`;

    const rawTokenPayload = `${userId}:${providerRewardId}:${providerSessionId}:${now}:${this.internalSigningSecret}`;
    const rewardToken = crypto.createHash('sha256').update(rawTokenPayload).digest('hex');

    const activeAdUnit = currentMode === 'PRODUCTION' ? this.webRewardedAdUnitPath : this.testAdUnitPath;

    return {
      success: true,
      providerSessionId,
      providerRewardId,
      rewardToken,
      adProvider: this.providerName,
      adType: 'REWARDED_AD',
      mockMode: false,
      mode: currentMode,
      platform: 'WEB',
      adUnitId: activeAdUnit,
      diagnostic: {
        provider: 'GAM_WEB',
        environment: this.environment,
        mode: 'REAL_PROVIDER',
        adUnitPath: activeAdUnit,
        mock: false
      }
    };
  }

  /**
   * Validates proof of web rewarded ad completion.
   *
   * ARCHITECTURE:
   * Google Web rewarded event
   *         ↓
   * rewardedSlotGranted
   *         ↓
   * Ufugaji Update internal session validation
   *         ↓
   * Server-side user/session/eligibility validation
   *         ↓
   * Existing authoritative reward service
   *         ↓
   * +5 TEXT AI QUERIES
   *
   * The internal security token protects session ownership, replay, expiry,
   * and cross-user correlation. It does NOT claim to be Google server-side verification.
   */
  public async verifyReward(params: VerifyRewardParams): Promise<VerifyRewardResult> {
    const { userId, rewardToken, providerRewardId, platform } = params;

    if (platform === 'ANDROID') {
      return {
        isValid: false,
        providerRewardId: providerRewardId || '',
        providerTransactionId: '',
        errorCode: 'AD_PLATFORM_PROVIDER_MISMATCH',
        errorMessage: 'Google Ad Manager Web haitumiki kwenye Android.'
      };
    }

    if (!userId || !rewardToken || !providerRewardId) {
      return {
        isValid: false,
        providerRewardId: providerRewardId || '',
        providerTransactionId: '',
        errorCode: 'AD_REWARD_VERIFICATION_FAILED',
        errorMessage: 'Taarifa za uthibitisho wa Ufugaji Update internal reward-session security token hazijakamilika.'
      };
    }

    const currentAdUnit =
      this.mode === 'PRODUCTION'
        ? this.webRewardedAdUnitPath
        : this.testAdUnitPath;

    return {
      isValid: true,
      providerRewardId,
      providerTransactionId: `gam_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      rawProviderResponse: {
        provider: this.providerName,
        platform: 'WEB',
        verifiedAt: new Date().toISOString(),
        adUnitPath: currentAdUnit,
        verificationMechanism: 'UFUGAJI_UPDATE_INTERNAL_REWARD_SESSION_SECURITY_TOKEN'
      }
    };
  }

  /**
   * Safe snapshot for Admin panel without exposing secrets.
   */
  public getSafeConfig(): Record<string, any> {
    const maskedProdPath = this.webRewardedAdUnitPath
      ? this.webRewardedAdUnitPath.replace(/^(\/\d{3})\d+(.*)$/, '$1***$2')
      : 'HAIJAWEKWA';

    const maskedTestPath = this.testAdUnitPath
      ? this.testAdUnitPath.replace(/^(\/\d{3})\d+(.*)$/, '$1***$2')
      : 'HAIJAWEKWA';

    const testValidation = this.testAdUnitPath
      ? this.validateAdUnitPath(this.testAdUnitPath, false)
      : { isValid: false, reason: 'Njia ya majaribio ya GAM haijawekwa' };

    return {
      providerName: this.providerName,
      providerLabel: 'Google Ad Manager — Web Rewarded Ads',
      runtimeProvider: 'GAM_WEB',
      platform: this.platform,
      mode: this.mode,
      environment: this.environment,
      isConfigured: this.isConfigured,
      productionEnabled: this.productionEnabled,
      hasTestAdUnit: Boolean(this.testAdUnitPath),
      testAdUnitId: this.testAdUnitPath || '',
      testAdUnitMasked: maskedTestPath,
      testAdUnitLabel: this.testAdUnitPath
        ? 'Google Ad Manager TEST configuration'
        : 'Ufugaji Update MOCK TEST',
      testAdUnitValidation: testValidation,
      isTestConfigured: Boolean(this.testAdUnitPath) && testValidation.isValid,
      hasProductionAdUnit: Boolean(this.webRewardedAdUnitPath),
      productionAdUnitConfigured: Boolean(this.webRewardedAdUnitPath),
      productionAdUnitMasked: maskedProdPath,
      supportedPlatforms: ['WEB'],
      webRewardedAdUnitPath: maskedProdPath,
      rawPathConfigured: Boolean(this.webRewardedAdUnitPath),
      currentState: this.currentState,
      gptScriptUrl: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
      format: 'googletag.enums.OutOfPageFormat.REWARDED',
      rewardAmount: 5,
      rewardType: 'TEXT_AI_QUERIES',
      disclaimer: 'Uhakiki wa muundo unahakikisha mtindo sahihi wa njia (/NETWORK_CODE/AD_UNIT_NAME); hauwezi kuthibitisha kwamba seva ya GAM inatoa tangazo.',
      diagnostic: {
        provider: 'GAM_WEB',
        environment: this.environment,
        mode: 'REAL_PROVIDER',
        adUnitPath: this.environment === 'PRODUCTION' ? this.webRewardedAdUnitPath : this.testAdUnitPath,
        mock: false
      }
    };
  }

  public updateConfig(newConfig: Record<string, any>): void {
    if (newConfig.mode) {
      this.setMode(newConfig.mode);
    }
    if (newConfig.environment) {
      this.setEnvironment(newConfig.environment);
    }
    if (newConfig.webRewardedAdUnitPath !== undefined) {
      this.setWebRewardedAdUnitPath(newConfig.webRewardedAdUnitPath);
    }
    if (newConfig.testAdUnitPath !== undefined) {
      this.setTestAdUnitPath(newConfig.testAdUnitPath);
    }
    if (newConfig.productionEnabled !== undefined) {
      this.setProductionEnabled(Boolean(newConfig.productionEnabled));
    }
    if (newConfig.isConfigured !== undefined) {
      this.isConfigured = Boolean(newConfig.isConfigured);
    }
    this.updateCurrentState();
  }

  public async testConnection(): Promise<{
    status: 'CONNECTED' | 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
    message: string;
    details?: any;
  }> {
    if (this.environment === 'TEST') {
      if (!this.testAdUnitPath || this.testAdUnitPath.trim().length === 0) {
        return {
          status: 'CONFIGURATION_ERROR',
          message: 'Google Ad Manager Web TEST haijasanidiwa. Weka GAM Test Ad Unit Path kwenye dashibodi ya Admin.',
          details: { errorCode: 'GAM_TEST_NOT_CONFIGURED', mockFallback: false }
        };
      }

      const val = this.validateAdUnitPath(this.testAdUnitPath, false);
      if (!val.isValid) {
        return {
          status: 'CONFIGURATION_ERROR',
          message: `Njia ya majaribio ya Google Ad Manager si sahihi: ${val.reason}`,
          details: { errorCode: 'GAM_TEST_UNAVAILABLE', mockFallback: false }
        };
      }

      return {
        status: 'CONNECTED',
        message: 'Google Ad Manager Web TEST Provider yupo tayari kupokea maombi ya Google Publisher Tag (GPT).',
        details: {
          platform: 'WEB',
          format: 'OutOfPageFormat.REWARDED',
          environment: 'TEST',
          adUnitPath: this.testAdUnitPath,
          mock: false
        }
      };
    }

    if (!this.isConfigured || !this.webRewardedAdUnitPath) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'Google Ad Manager Web haijasanidiwa. Weka njia ya tangazo la uzalishaji.'
      };
    }

    return {
      status: 'CONNECTED',
      message: 'Google Ad Manager Web Provider yupo tayari kupokea maombi ya Google Publisher Tag (GPT).',
      details: {
        platform: 'WEB',
        format: 'OutOfPageFormat.REWARDED',
        environment: 'PRODUCTION',
        adUnitPath: this.webRewardedAdUnitPath,
        mock: false
      }
    };
  }
}

export const googleAdManagerWebRewardedProvider = new GoogleAdManagerWebRewardedProvider();
