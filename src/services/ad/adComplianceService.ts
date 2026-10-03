/**
 * V1.9B — Ad Compliance & Governance Service
 *
 * Manages advertising compliance, readiness checks, store metadata,
 * app-ads.txt verification, privacy policy linkages, and the production safety gate.
 *
 * NOTE: Tracks internal readiness only. Never claims Google approval.
 */

import fs from 'fs';
import path from 'path';
import {
  AdComplianceConfig,
  AdComplianceCheckItem,
  ComplianceCheckName,
  ComplianceCheckStatus,
  AppAdsTxtStatus,
  StorePublicationStatus,
  UserConsentStatus,
  AdPlatform,
  AdProviderMode,
  AdProductionSafetyGateResult,
  AdFailureState
} from '../../types/aiUsageAndCache';

const DATA_DIR = path.join(process.cwd(), 'data');
const COMPLIANCE_CONFIG_FILE = path.join(DATA_DIR, 'ad_compliance_config.json');

export const DEFAULT_COMPLIANCE_CONFIG: AdComplianceConfig = {
  privacyPolicyUrl: 'https://ufugajiupdate.co.tz/privacy',
  termsUrl: 'https://ufugajiupdate.co.tz/terms',
  contactPageUrl: 'https://ufugajiupdate.co.tz/contact',
  developerWebsiteUrl: 'https://ufugajiupdate.co.tz',
  appAdsTxtUrl: 'https://ufugajiupdate.co.tz/app-ads.txt',
  appAdsTxtStatus: 'PENDING',
  lastAppAdsTxtVerification: null,
  android: {
    packageName: 'com.ufugajiupdate.app',
    playStoreUrl: '',
    publicationStatus: 'NOT_PUBLISHED'
  },
  web: {
    productionUrl: 'https://ufugajiupdate.co.tz',
    publicationStatus: 'TESTING'
  },
  consentRequired: true,
  defaultConsentStatus: 'UNKNOWN'
};

export class AdComplianceService {
  private static instance: AdComplianceService | null = null;
  private config: AdComplianceConfig;
  private userConsentMap: Map<string, UserConsentStatus> = new Map();

  private constructor() {
    this.config = this.loadConfigFromDisk();
  }

  public static getInstance(): AdComplianceService {
    if (!AdComplianceService.instance) {
      AdComplianceService.instance = new AdComplianceService();
    }
    return AdComplianceService.instance;
  }

  private loadConfigFromDisk(): AdComplianceConfig {
    try {
      if (fs.existsSync(COMPLIANCE_CONFIG_FILE)) {
        const raw = fs.readFileSync(COMPLIANCE_CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_COMPLIANCE_CONFIG,
          ...parsed,
          android: { ...DEFAULT_COMPLIANCE_CONFIG.android, ...(parsed.android || {}) },
          web: { ...DEFAULT_COMPLIANCE_CONFIG.web, ...(parsed.web || {}) }
        };
      }
    } catch (err) {
      console.warn('[AdComplianceService] Could not read compliance config from disk, using defaults:', err);
    }
    return { ...DEFAULT_COMPLIANCE_CONFIG };
  }

  private saveConfigToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(COMPLIANCE_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AdComplianceService] Failed to save compliance config to disk:', err);
    }
  }

  public getConfig(): AdComplianceConfig {
    return {
      ...this.config,
      android: { ...this.config.android },
      web: { ...this.config.web }
    };
  }

  public updateConfig(newConfig: Partial<AdComplianceConfig>): AdComplianceConfig {
    if (newConfig.privacyPolicyUrl !== undefined) {
      this.config.privacyPolicyUrl = String(newConfig.privacyPolicyUrl).trim();
    }
    if (newConfig.termsUrl !== undefined) {
      this.config.termsUrl = String(newConfig.termsUrl).trim();
    }
    if (newConfig.contactPageUrl !== undefined) {
      this.config.contactPageUrl = String(newConfig.contactPageUrl).trim();
    }
    if (newConfig.developerWebsiteUrl !== undefined) {
      this.config.developerWebsiteUrl = String(newConfig.developerWebsiteUrl).trim();
    }
    if (newConfig.appAdsTxtUrl !== undefined) {
      this.config.appAdsTxtUrl = String(newConfig.appAdsTxtUrl).trim();
    }
    if (newConfig.appAdsTxtStatus !== undefined) {
      this.config.appAdsTxtStatus = newConfig.appAdsTxtStatus;
    }
    if (newConfig.android) {
      this.config.android = {
        ...this.config.android,
        ...newConfig.android
      };
    }
    if (newConfig.web) {
      this.config.web = {
        ...this.config.web,
        ...newConfig.web
      };
    }
    if (typeof newConfig.consentRequired === 'boolean') {
      this.config.consentRequired = newConfig.consentRequired;
    }
    if (newConfig.defaultConsentStatus) {
      this.config.defaultConsentStatus = newConfig.defaultConsentStatus;
    }

    this.saveConfigToDisk();
    return this.getConfig();
  }

  /**
   * Deterministic verification of app-ads.txt
   * Verifies developerWebsiteUrl and appAdsTxtUrl. Only marks READY if url is set
   * and formatted correctly, or can simulate/probe actual lines.
   */
  public verifyAppAdsTxt(contentSample?: string): {
    status: AppAdsTxtStatus;
    message: string;
    verifiedAt: string;
  } {
    const now = new Date().toISOString();
    if (!this.config.developerWebsiteUrl || !this.config.appAdsTxtUrl) {
      this.config.appAdsTxtStatus = 'NOT_CONFIGURED';
      this.config.lastAppAdsTxtVerification = now;
      this.saveConfigToDisk();
      return {
        status: 'NOT_CONFIGURED',
        message: 'Tovuti ya msanidi au kiungo cha app-ads.txt hakijawekwa.',
        verifiedAt: now
      };
    }

    // Must be valid HTTP/HTTPS URL
    try {
      new URL(this.config.appAdsTxtUrl);
      new URL(this.config.developerWebsiteUrl);
    } catch {
      this.config.appAdsTxtStatus = 'PENDING';
      this.config.lastAppAdsTxtVerification = now;
      this.saveConfigToDisk();
      return {
        status: 'PENDING',
        message: 'Muundo wa URL ya app-ads.txt si sahihi.',
        verifiedAt: now
      };
    }

    // If explicit content or test validation provided, verify Google AdMob or authorized entry
    if (contentSample && (contentSample.includes('google.com') || contentSample.includes('pub-'))) {
      this.config.appAdsTxtStatus = 'READY';
      this.config.lastAppAdsTxtVerification = now;
      this.saveConfigToDisk();
      return {
        status: 'READY',
        message: 'Faili la app-ads.txt limethibitishwa kikamilifu na lina rekodi sahihi.',
        verifiedAt: now
      };
    }

    // Default to PENDING awaiting DNS / crawler indexing
    this.config.appAdsTxtStatus = 'PENDING';
    this.config.lastAppAdsTxtVerification = now;
    this.saveConfigToDisk();
    return {
      status: 'PENDING',
      message: 'Kiungo kipo lakini uthibitisho kamili wa rekodi za tangazo ungali unasubiri (Pending verification).',
      verifiedAt: now
    };
  }

  /**
   * Evaluates all 11 compliance readiness checks deterministically.
   */
  public evaluateComplianceChecks(context: {
    providerConfigured: boolean;
    testAdConfigured: boolean;
    productionAdConfigured: boolean;
    productionEnabled: boolean;
    platform: AdPlatform;
  }): AdComplianceCheckItem[] {
    const checks: AdComplianceCheckItem[] = [
      {
        id: 'PRIVACY_POLICY_URL',
        label: 'Sera ya Faragha (Privacy Policy URL)',
        status: this.config.privacyPolicyUrl && this.config.privacyPolicyUrl.startsWith('http')
          ? 'READY'
          : 'MISSING',
        description: 'Kiungo cha sera ya faragha kinachoeleza matumizi ya AI, data ya mifugo, na matangazo.',
        value: this.config.privacyPolicyUrl,
        linkUrl: this.config.privacyPolicyUrl,
        requiredForProduction: true
      },
      {
        id: 'TERMS_URL',
        label: 'Vigezo na Masharti (Terms of Service URL)',
        status: this.config.termsUrl && this.config.termsUrl.startsWith('http')
          ? 'READY'
          : 'MISSING',
        description: 'Vigezo vya matumizi ya jukwaa la Ufugaji Update.',
        value: this.config.termsUrl,
        linkUrl: this.config.termsUrl,
        requiredForProduction: true
      },
      {
        id: 'CONTACT_PAGE_URL',
        label: 'Mawasiliano na Msaada (Contact / Support URL)',
        status: this.config.contactPageUrl && this.config.contactPageUrl.startsWith('http')
          ? 'READY'
          : 'MISSING',
        description: 'Ukurasa rasmi wa mawasiliano kwa wakulima na wafugaji.',
        value: this.config.contactPageUrl,
        linkUrl: this.config.contactPageUrl,
        requiredForProduction: true
      },
      {
        id: 'DEVELOPER_WEBSITE',
        label: 'Tovuti Rasmi ya Msanidi (Developer Website)',
        status: this.config.developerWebsiteUrl && this.config.developerWebsiteUrl.startsWith('http')
          ? 'READY'
          : 'MISSING',
        description: 'Kikoa kikuu kinachomiliki programu kwenye Play Store na Web.',
        value: this.config.developerWebsiteUrl,
        linkUrl: this.config.developerWebsiteUrl,
        requiredForProduction: true
      },
      {
        id: 'APP_STORE_LISTING',
        label: 'Hali ya Usajili wa Duka (Store Listing Status)',
        status: context.platform === 'ANDROID'
          ? (this.config.android.publicationStatus === 'PUBLISHED' ? 'READY' : this.config.android.publicationStatus === 'TESTING' ? 'PENDING' : 'MISSING')
          : (this.config.web.publicationStatus === 'PUBLISHED' || this.config.web.publicationStatus === 'TESTING' ? 'READY' : 'PENDING'),
        description: context.platform === 'ANDROID'
          ? `Play Store: ${this.config.android.publicationStatus} (${this.config.android.packageName || 'Not set'})`
          : `Web App: ${this.config.web.publicationStatus} (${this.config.web.productionUrl})`,
        value: context.platform === 'ANDROID' ? this.config.android.publicationStatus : this.config.web.publicationStatus,
        linkUrl: context.platform === 'ANDROID' ? this.config.android.playStoreUrl : this.config.web.productionUrl,
        requiredForProduction: true
      },
      {
        id: 'APP_ADS_TXT_STATUS',
        label: 'Uthibitisho wa app-ads.txt',
        status: this.config.appAdsTxtStatus === 'READY'
          ? 'READY'
          : this.config.appAdsTxtStatus === 'PENDING'
          ? 'PENDING'
          : 'MISSING',
        description: 'Uthibitisho wa faili la app-ads.txt kuzuia udanganyifu wa matangazo.',
        value: this.config.appAdsTxtStatus,
        linkUrl: this.config.appAdsTxtUrl,
        requiredForProduction: true
      },
      {
        id: 'AD_PROVIDER_CONFIGURATION',
        label: 'Usanidi wa Mtoa Tangazo (Provider Config)',
        status: context.providerConfigured ? 'READY' : 'MISSING',
        description: 'Mtoa tangazo amesajiliwa na kuwezeshwa kwenye seva.',
        value: context.providerConfigured ? 'Configured' : 'Unconfigured',
        requiredForProduction: true
      },
      {
        id: 'TEST_AD_CONFIGURATION',
        label: 'Usanidi wa Tangazo la Jaribio (Test Ad Config)',
        status: context.testAdConfigured ? 'READY' : 'MISSING',
        description: 'Vitambulisho vya matangazo ya majaribio yapo tayari.',
        value: context.testAdConfigured ? 'Ready' : 'Not configured',
        requiredForProduction: false
      },
      {
        id: 'PRODUCTION_AD_CONFIGURATION',
        label: 'Usanidi wa Tangazo Halisi (Production Ad Config)',
        status: context.productionAdConfigured ? 'READY' : 'MISSING',
        description: 'Vitambulisho halisi vya matangazo vimesajiliwa salama kwenye seva.',
        value: context.productionAdConfigured ? 'Configured' : 'Not configured',
        requiredForProduction: true
      },
      {
        id: 'CONSENT_CONFIGURATION',
        label: 'Usanidi wa Idhini ya Mtumiaji (User Consent)',
        status: this.config.consentRequired
          ? (this.config.defaultConsentStatus === 'GRANTED' ? 'READY' : 'PENDING')
          : 'READY',
        description: 'Mfumo wa kuomba idhini ya mtumiaji bila kutumia data binafsi nyeti.',
        value: this.config.consentRequired ? `Required (Default: ${this.config.defaultConsentStatus})` : 'Not Required (Non-personalized)',
        requiredForProduction: true
      },
      {
        id: 'PRODUCTION_AD_ENABLEMENT',
        label: 'Kuwashwa kwa Matangazo Halisi na Admin',
        status: context.productionEnabled ? 'READY' : 'MISSING',
        description: 'Msimamizi amewasha rasmi matangazo halisi (Production Switch).',
        value: context.productionEnabled ? 'ON' : 'OFF',
        requiredForProduction: true
      }
    ];

    return checks;
  }

  /**
   * Production Ad Safety Gate
   *
   * Production ads may only become eligible if all 7 conditions pass:
   * 1. provider is explicitly configured
   * 2. platform configuration exists
   * 3. production ad unit is configured
   * 4. required compliance configuration exists
   * 5. production advertising has been explicitly enabled by Admin
   * 6. application environment is production
   * 7. provider integration is available
   */
  public evaluateProductionSafetyGate(params: {
    providerConfigured: boolean;
    providerIntegrationAvailable: boolean;
    platform: AdPlatform;
    platformConfigured: boolean;
    platformCompatible?: boolean;
    productionAdUnitConfigured: boolean;
    productionEnabledByAdmin: boolean;
    isProductionEnv?: boolean;
    consentStatus?: UserConsentStatus;
  }): AdProductionSafetyGateResult {
    const failingConditions: string[] = [];
    let primaryErrorCode: AdFailureState = 'AD_PRODUCTION_NOT_READY';

    // Platform compatibility check (e.g. Web + Android-only AdMob)
    if (params.platformCompatible === false) {
      failingConditions.push(`Jukwaa la ${params.platform} haliendani na mtoa tangazo huyu`);
      primaryErrorCode = 'AD_PLATFORM_MISMATCH';
    }

    // Consent check
    if (params.consentStatus === 'DENIED') {
      failingConditions.push('Mtumiaji amekataa idhini ya matangazo (Consent Denied)');
      primaryErrorCode = 'AD_CONSENT_DENIED';
    } else if (params.consentStatus === 'REQUIRED' || params.consentStatus === 'UNKNOWN') {
      failingConditions.push('Idhini ya mtumiaji inahitajika kabla ya tangazo la uzalishaji (Consent Required)');
      primaryErrorCode = 'AD_CONSENT_REQUIRED';
    }

    // 1. Provider is explicitly configured
    if (!params.providerConfigured) {
      failingConditions.push('Mtoa huduma wa tangazo hajawezeshwa (Provider not configured)');
      if (primaryErrorCode === 'AD_PRODUCTION_NOT_READY') {
        primaryErrorCode = 'AD_PROVIDER_NOT_CONFIGURED';
      }
    }

    // 2. Platform configuration exists
    if (!params.platformConfigured) {
      failingConditions.push(`Usanidi wa jukwaa la ${params.platform} haupo`);
      if (primaryErrorCode === 'AD_PRODUCTION_NOT_READY') {
        primaryErrorCode = 'AD_PLATFORM_MISMATCH';
      }
    }

    // 3. Production ad unit is configured
    if (!params.productionAdUnitConfigured) {
      failingConditions.push('Kitambulisho cha tangazo halisi (Production Ad Unit ID) hakijawekwa');
      primaryErrorCode = 'AD_PRODUCTION_NOT_READY';
    }

    // 4. Required compliance configuration exists
    if (!this.config.privacyPolicyUrl || !this.config.privacyPolicyUrl.startsWith('http')) {
      failingConditions.push('Sera ya faragha (Privacy Policy URL) inakosekana');
      primaryErrorCode = 'AD_PRODUCTION_NOT_READY';
    }
    if (!this.config.termsUrl || !this.config.termsUrl.startsWith('http')) {
      failingConditions.push('Vigezo vya matumizi (Terms URL) vinakosekana');
      primaryErrorCode = 'AD_PRODUCTION_NOT_READY';
    }
    if (!this.config.developerWebsiteUrl || !this.config.developerWebsiteUrl.startsWith('http')) {
      failingConditions.push('Tovuti rasmi ya msanidi inakosekana');
      primaryErrorCode = 'AD_PRODUCTION_NOT_READY';
    }
    if (this.config.appAdsTxtStatus !== 'READY') {
      failingConditions.push('Faili la app-ads.txt halijathibitishwa rasmi (Status is not READY)');
      primaryErrorCode = 'AD_PRODUCTION_NOT_READY';
    }

    // 5. Production advertising has been explicitly enabled by Admin
    if (!params.productionEnabledByAdmin) {
      failingConditions.push('Matangazo halisi hayajawezeshwa na msimamizi (Admin productionEnabled is OFF)');
      if (primaryErrorCode === 'AD_PRODUCTION_NOT_READY' && failingConditions.length === 1) {
        primaryErrorCode = 'AD_PRODUCTION_DISABLED';
      }
    }

    // 6. Application environment is production
    const isProd = params.isProductionEnv !== undefined
      ? params.isProductionEnv
      : process.env.NODE_ENV === 'production';
    if (!isProd) {
      failingConditions.push('Mazingira ya programu si ya uzalishaji (NODE_ENV is not production)');
    }

    // 7. Provider integration is available
    if (!params.providerIntegrationAvailable) {
      failingConditions.push('Muunganisho wa mfumo wa mtoa tangazo haupatikani');
      if (primaryErrorCode === 'AD_PRODUCTION_NOT_READY') {
        primaryErrorCode = 'AD_PROVIDER_UNAVAILABLE';
      }
    }

    if (failingConditions.length > 0) {
      return {
        eligible: false,
        errorCode: primaryErrorCode,
        reason: `${primaryErrorCode}: ${failingConditions.join('; ')}`,
        failingConditions
      };
    }

    return {
      eligible: true
    };
  }

  // ============================================================================
  // USER CONSENT MANAGEMENT
  // ============================================================================

  public getUserConsent(userId: string): UserConsentStatus {
    if (!this.config.consentRequired) {
      return 'GRANTED';
    }
    const userConsent = this.userConsentMap.get(userId);
    if (userConsent) {
      return userConsent;
    }
    return this.config.defaultConsentStatus || 'UNKNOWN';
  }

  public setUserConsent(userId: string, consent: UserConsentStatus): void {
    this.userConsentMap.set(userId, consent);
  }

  public resetConsentForTesting(): void {
    this.userConsentMap.clear();
  }
}

export const adComplianceService = AdComplianceService.getInstance();
