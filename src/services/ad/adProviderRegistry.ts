/**
 * V1.9A — Ad Provider Registry
 *
 * Central registry managing provider implementations without hardcoding to a single vendor.
 * Decouples advertising integrations from Free AI quota, Premium entitlement, and AI request gate.
 */

import { AdProvider, AdProviderMode, AdPlatform } from './adProviderInterface';
import { MockRewardedAdProvider } from './mockRewardedAdProvider';
import { AdMobRewardedAdProvider } from './adMobRewardedAdProvider';
import { googleAdManagerWebRewardedProvider } from './googleAdManagerWebRewardedProvider';

export class AdProviderRegistry {
  private static instance: AdProviderRegistry | null = null;
  private providers: Map<string, AdProvider> = new Map();
  private activeProviderName: string = 'GOOGLE_AD_MANAGER_WEB';
  private webRewardedProvider: 'GAM_WEB' | 'MOCK' = 'GAM_WEB';
  private webRewardedEnvironment: 'TEST' | 'PRODUCTION' = 'TEST';
  private activeMode: AdProviderMode = 'TEST';
  private activePlatform: AdPlatform = 'WEB';
  private productionEnabled: boolean = false;

  private constructor() {
    // 1. Register the standard mock provider
    const mockProvider = new MockRewardedAdProvider('MOCK_COMPLETED', true);
    this.registerProvider(mockProvider);

    // 2. Register AdMob adapter (isolated mobile platform only)
    const adMobProvider = new AdMobRewardedAdProvider({
      mode: 'MOCK',
      platform: 'ANDROID',
      isConfigured: true,
      productionEnabled: false
    });
    this.registerProvider(adMobProvider);

    // 3. Register Google Ad Manager Web Rewarded provider (web platform)
    this.registerProvider(googleAdManagerWebRewardedProvider);
  }

  public static getInstance(): AdProviderRegistry {
    if (!AdProviderRegistry.instance) {
      AdProviderRegistry.instance = new AdProviderRegistry();
    }
    return AdProviderRegistry.instance;
  }

  public registerProvider(provider: AdProvider): void {
    const key = provider.providerName.toUpperCase();
    this.providers.set(key, provider);
    if (key === 'ADMOB') {
      this.providers.set('GOOGLE_ADMOB', provider);
    }
    if (key === 'GOOGLE_AD_MANAGER_WEB') {
      this.providers.set('GAM_WEB', provider);
      this.providers.set('GOOGLE_AD_MANAGER', provider);
    }
    if (key === 'MOCK_REWARDED_AD') {
      this.providers.set('MOCK', provider);
    }
  }

  public getProvider(name?: string): AdProvider | null {
    if (!name) {
      return this.getActiveProvider();
    }
    return this.providers.get(name.toUpperCase()) || null;
  }

  /**
   * Authoritative Web Provider Resolution.
   * Strictly returns the selected provider without silent fallback to Mock.
   */
  public getActiveProvider(): AdProvider | null {
    if (this.activeProviderName && this.providers.has(this.activeProviderName)) {
      if (this.activeProviderName === 'GOOGLE_AD_MANAGER_WEB' || this.activeProviderName === 'MOCK_REWARDED_AD') {
        if (this.webRewardedProvider === 'GAM_WEB') {
          return this.providers.get('GOOGLE_AD_MANAGER_WEB') || null;
        }
        return this.providers.get('MOCK_REWARDED_AD') || null;
      }
      return this.providers.get(this.activeProviderName) || null;
    }
    if (this.webRewardedProvider === 'GAM_WEB') {
      return this.providers.get('GOOGLE_AD_MANAGER_WEB') || null;
    }
    return this.providers.get('MOCK_REWARDED_AD') || null;
  }

  public getActiveProviderName(): string {
    return this.activeProviderName;
  }

  public getWebRewardedProvider(): 'GAM_WEB' | 'MOCK' {
    return this.webRewardedProvider;
  }

  public setWebRewardedProvider(provider: 'GAM_WEB' | 'MOCK'): void {
    if (provider === 'MOCK' && this.webRewardedEnvironment === 'PRODUCTION') {
      throw new Error('MOCK simulator haiwezi kutumika katika mazingira ya uzalishaji (PRODUCTION).');
    }
    this.webRewardedProvider = provider;
    if (provider === 'GAM_WEB') {
      this.activeProviderName = 'GOOGLE_AD_MANAGER_WEB';
      googleAdManagerWebRewardedProvider.setEnvironment(this.webRewardedEnvironment);
      googleAdManagerWebRewardedProvider.setMode(this.webRewardedEnvironment);
    } else {
      this.activeProviderName = 'MOCK_REWARDED_AD';
      this.activeMode = 'MOCK';
    }
  }

  public getWebRewardedEnvironment(): 'TEST' | 'PRODUCTION' {
    return this.webRewardedEnvironment;
  }

  public setWebRewardedEnvironment(env: 'TEST' | 'PRODUCTION'): void {
    if (this.webRewardedProvider === 'MOCK' && env === 'PRODUCTION') {
      throw new Error('MOCK simulator haiwezi kutumika katika PRODUCTION. Chagua Google Ad Manager Web kwanza.');
    }
    this.webRewardedEnvironment = env;
    this.activeMode = env;
    googleAdManagerWebRewardedProvider.setEnvironment(env);
    googleAdManagerWebRewardedProvider.setMode(env);
  }

  public getActiveMode(): AdProviderMode {
    return this.activeMode;
  }

  public getActivePlatform(): AdPlatform {
    return this.activePlatform;
  }

  public isProductionEnabled(): boolean {
    return this.productionEnabled;
  }

  public setActiveProvider(name: string): void {
    const key = name.toUpperCase();
    if (key === 'GOOGLE_AD_MANAGER_WEB' || key === 'GAM_WEB' || key === 'GOOGLE_AD_MANAGER') {
      this.setWebRewardedProvider('GAM_WEB');
      this.activeProviderName = 'GOOGLE_AD_MANAGER_WEB';
    } else if (key === 'MOCK_REWARDED_AD' || key === 'MOCK') {
      this.setWebRewardedProvider('MOCK');
      this.activeProviderName = 'MOCK_REWARDED_AD';
    } else if (this.providers.has(key)) {
      this.activeProviderName = key;
    } else {
      throw new Error(`Mtoa tangazo hajapatikana: ${name}`);
    }
  }

  public setActiveMode(mode: AdProviderMode): void {
    this.activeMode = mode;
    if (mode === 'PRODUCTION' || mode === 'TEST') {
      this.webRewardedEnvironment = mode;
    }
    // Propagate mode to providers if supported
    for (const p of this.providers.values()) {
      if (typeof (p as any).setMode === 'function') {
        (p as any).setMode(mode);
      }
    }
  }

  public setActivePlatform(platform: AdPlatform): void {
    this.activePlatform = platform;
    for (const p of this.providers.values()) {
      if (typeof (p as any).setPlatform === 'function') {
        (p as any).setPlatform(platform);
      }
    }
  }

  public setProductionEnabled(enabled: boolean): void {
    this.productionEnabled = enabled;
    for (const p of this.providers.values()) {
      if (typeof (p as any).setProductionEnabled === 'function') {
        (p as any).setProductionEnabled(enabled);
      }
    }
  }

  public hasConfiguredProvider(): boolean {
    const prov = this.getActiveProvider();
    return Boolean(prov && prov.isConfigured);
  }

  public getAllProviders(): AdProvider[] {
    return Array.from(this.providers.values());
  }

  public resetForTesting(): void {
    this.providers.clear();
    const mockProvider = new MockRewardedAdProvider('MOCK_COMPLETED', true);
    this.registerProvider(mockProvider);
    const adMobProvider = new AdMobRewardedAdProvider({
      mode: 'MOCK',
      platform: 'ANDROID',
      isConfigured: true,
      productionEnabled: false
    });
    this.registerProvider(adMobProvider);
    this.registerProvider(googleAdManagerWebRewardedProvider);
    this.webRewardedProvider = 'GAM_WEB';
    this.webRewardedEnvironment = 'TEST';
    this.activeProviderName = 'GOOGLE_AD_MANAGER_WEB';
    this.activeMode = 'TEST';
    this.activePlatform = 'WEB';
    this.productionEnabled = false;
  }
}

export const adProviderRegistry = AdProviderRegistry.getInstance();
