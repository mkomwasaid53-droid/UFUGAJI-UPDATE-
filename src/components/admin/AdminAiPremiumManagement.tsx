import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Crown, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  UserCheck, 
  RefreshCw, 
  Calendar, 
  Layers, 
  Lock, 
  Sliders, 
  Send,
  Zap,
  RotateCcw,
  Ban,
  PlayCircle,
  CreditCard,
  FileText,
  AlertTriangle,
  ArrowRight,
  Database,
  Loader2,
  Settings,
  Key,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  Gift,
  Tv,
  Globe,
  Smartphone,
  ShieldAlert,
  FileCheck,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Radio
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserProfile } from '../../types';
import { 
  PaymentTransaction, 
  PaymentAuditEvent, 
  PaymentObservabilityMetrics,
  PaymentStatus,
  AdObservabilityMetrics,
  AdAuditEvent,
  AdSettingsState,
  AdProviderMode,
  AdPlatform,
  AdComplianceCheckItem,
  AdComplianceConfig
} from '../../types/aiUsageAndCache';
import { AdminAdvertisingOperationsSection } from './AdminAdvertisingOperationsSection';
import { AdminProductionLaunchSection } from './AdminProductionLaunchSection';
import { AdminWebRewardedAdsDashboard } from './AdminWebRewardedAdsDashboard';

interface EntitlementRecord {
  entitlementId: string;
  userId: string;
  tier: 'FREE' | 'PREMIUM';
  packageType: 'WEEKLY' | 'MONTHLY' | 'ANNUAL' | 'NONE';
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'REVOKED' | 'SUSPENDED' | 'PENDING';
  dailyLimit: number;
  startedAt: string;
  expiresAt: string | null;
  source: string;
  updatedAt: string;
  metadata?: any;
}

interface PremiumStatusResponse {
  userId: string;
  tier: 'FREE' | 'PREMIUM';
  isPremiumActive: boolean;
  activePlan: 'WEEKLY' | 'MONTHLY' | 'ANNUAL' | null;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'REVOKED' | 'SUSPENDED' | 'PENDING';
  daysRemaining: number;
  expiresAt: string | null;
  dailyLimit: number;
  mediaAllowed: boolean;
  effectiveSource: string;
}

interface AdminAiPremiumManagementProps {
  usersList?: UserProfile[];
  initialSubTab?: 'grants' | 'payments' | 'ads' | 'audit' | 'settings';
}

export const AdminAiPremiumManagement: React.FC<AdminAiPremiumManagementProps> = ({ 
  usersList = [],
  initialSubTab = 'grants'
}) => {
  const { currentUser } = useAuth();

  // Sub-tab Navigation (supports direct access to 'ads' and 'settings')
  const [activeSubTab, setActiveSubTab] = useState<'grants' | 'payments' | 'ads' | 'audit' | 'settings'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // V1.9A — Ad & Reward Observability State
  const [adMetrics, setAdMetrics] = useState<AdObservabilityMetrics | null>(null);
  const [adAuditEvents, setAdAuditEvents] = useState<AdAuditEvent[]>([]);
  const [adProviders, setAdProviders] = useState<any[]>([]);
  const [adsLoading, setAdsLoading] = useState<boolean>(false);
  const [mockBehavior, setMockBehavior] = useState<string>('MOCK_COMPLETED');
  const [mockConfigured, setMockConfigured] = useState<boolean>(false);
  const [adActionFeedback, setAdActionFeedback] = useState<string | null>(null);

  // V1.9B — Ad Settings & Compliance Readiness State
  const [adSettings, setAdSettings] = useState<AdSettingsState | null>(null);
  const [adComplianceChecks, setAdComplianceChecks] = useState<AdComplianceCheckItem[]>([]);
  const [adComplianceConfig, setAdComplianceConfig] = useState<AdComplianceConfig | null>(null);
  const [verifyingAppAdsTxt, setVerifyingAppAdsTxt] = useState<boolean>(false);
  const [appAdsTxtResult, setAppAdsTxtResult] = useState<{ verified: boolean; message: string; details?: any } | null>(null);
  const [testingAdConnection, setTestingAdConnection] = useState<boolean>(false);
  const [testAdConnResult, setTestAdConnResult] = useState<{ status: string; message: string } | null>(null);
  const [savingAdSettings, setSavingAdSettings] = useState<boolean>(false);
  const [adSettingsFeedback, setAdSettingsFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [complianceEditing, setComplianceEditing] = useState<boolean>(false);
  const [editPrivacyUrl, setEditPrivacyUrl] = useState<string>('https://ufugajiupdate.co.tz/privacy-policy');
  const [editTermsUrl, setEditTermsUrl] = useState<string>('https://ufugajiupdate.co.tz/terms');
  const [editAppAdsTxtUrl, setEditAppAdsTxtUrl] = useState<string>('https://ufugajiupdate.co.tz/app-ads.txt');
  const [savingComplianceUrls, setSavingComplianceUrls] = useState<boolean>(false);

  // V1.9C — Production Ad Unit Configuration State
  const [editingAdUnit, setEditingAdUnit] = useState<boolean>(false);
  const [prodAdUnitInput, setProdAdUnitInput] = useState<string>('');
  const [webAdUnitInput, setWebAdUnitInput] = useState<string>('');
  const [savingAdUnit, setSavingAdUnit] = useState<boolean>(false);

  // Payment Configuration Form State (V1.8E Admin Settings)
  const [configEnvironment, setConfigEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [configBaseUrl, setConfigBaseUrl] = useState<string>('https://app.pluspesa.com/api/v1');
  const [configPublicKey, setConfigPublicKey] = useState<string>('');
  const [configSecretKey, setConfigSecretKey] = useState<string>('');
  const [configCallbackSecret, setConfigCallbackSecret] = useState<string>('');
  const [showSecretKey, setShowSecretKey] = useState<boolean>(false);
  const [showCallbackSecret, setShowCallbackSecret] = useState<boolean>(false);
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  const [configSaveFeedback, setConfigSaveFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  // State for Grant Form
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<'WEEKLY' | 'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [customDays, setCustomDays] = useState<number>(30);
  const [customDailyLimit, setCustomDailyLimit] = useState<number>(50);
  const [grantSource, setGrantSource] = useState<string>('ADMIN_GRANT');
  const [adminNotes, setAdminNotes] = useState<string>('Utoaji wa Msimamizi Mkuu (Admin complimentary grant)');
  const [grantLoading, setGrantLoading] = useState<boolean>(false);
  const [grantResult, setGrantResult] = useState<any | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  // State for Entitlement Inspection
  const [inspectUserId, setInspectUserId] = useState<string>('');
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [inspectedStatus, setInspectedStatus] = useState<PremiumStatusResponse | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // State for Lifecycle Status Update
  const [statusUpdateLoading, setStatusUpdateLoading] = useState<boolean>(false);
  const [statusUpdateMsg, setStatusUpdateMsg] = useState<string | null>(null);

  // State for System Observability & Entitlements List
  const [allEntitlements, setAllEntitlements] = useState<EntitlementRecord[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');

  // V1.8E — Payment Transactions & Audit Trail State
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [paymentAuditEvents, setPaymentAuditEvents] = useState<PaymentAuditEvent[]>([]);
  const [paymentMetrics, setPaymentMetrics] = useState<PaymentObservabilityMetrics | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState<boolean>(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [plusPesaSafeConfig, setPlusPesaSafeConfig] = useState<any | null>(null);
  const [pollingPaymentId, setPollingPaymentId] = useState<string | null>(null);
  const [pollFeedback, setPollFeedback] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testConnResult, setTestConnResult] = useState<{ status: string; message: string } | null>(null);

  // V1.8E — Test connection to provider API safely without creating transactions
  const handleTestConnection = async (providerName: string = 'PLUSPESA') => {
    setTestingConnection(true);
    setTestConnResult(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/payments/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({ providerName })
      });
      const data = await res.json();
      setTestConnResult(data.testResult || { status: 'UNKNOWN', message: 'Hakuna majibu' });
    } catch (err: any) {
      setTestConnResult({ status: 'ERROR', message: `Hitilafu ya mtandao: ${err.message}` });
    } finally {
      setTestingConnection(false);
    }
  };

  // Sync config form with server safe config
  useEffect(() => {
    if (plusPesaSafeConfig) {
      if (plusPesaSafeConfig.environment) {
        setConfigEnvironment(plusPesaSafeConfig.environment);
      }
      if (plusPesaSafeConfig.baseUrl) {
        setConfigBaseUrl(plusPesaSafeConfig.baseUrl);
      }
    }
  }, [plusPesaSafeConfig]);

  // V1.8E — Save runtime payment provider settings to server
  const handleSavePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigSaveFeedback(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const payload: any = {
        environment: configEnvironment,
        baseUrl: configBaseUrl.trim() || 'https://app.pluspesa.com/api/v1'
      };
      if (configPublicKey.trim()) payload.publicKey = configPublicKey.trim();
      if (configSecretKey.trim()) payload.secretKey = configSecretKey.trim();
      if (configCallbackSecret.trim()) payload.callbackSecret = configCallbackSecret.trim();

      const res = await fetch('/api/ai/admin/payments/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({
          providerName: 'PLUSPESA',
          config: payload
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setConfigSaveFeedback({
          success: true,
          message: 'Mipangilio ya PlusPesa imehifadhiwa kikamilifu kwenye seva!'
        });
        if (data.safeConfig) {
          setPlusPesaSafeConfig(data.safeConfig);
        }
        // Clear sensitive inputs
        setConfigPublicKey('');
        setConfigSecretKey('');
        setConfigCallbackSecret('');
        await loadPayments();
      } else {
        setConfigSaveFeedback({
          success: false,
          message: data.error || data.message || 'Haikuweza kuhifadhi mipangilio ya malipo.'
        });
      }
    } catch (err: any) {
      setConfigSaveFeedback({
        success: false,
        message: `Hitilafu ya mtandao: ${err.message}`
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleCopyWebhook = (url: string, key: string) => {
    try {
      navigator.clipboard.writeText(url);
      setCopiedWebhook(key);
      setTimeout(() => setCopiedWebhook(null), 2500);
    } catch {
      setCopiedWebhook(key);
      setTimeout(() => setCopiedWebhook(null), 2500);
    }
  };

  // Update default days when plan changes
  useEffect(() => {
    if (selectedPlan === 'WEEKLY') setCustomDays(7);
    else if (selectedPlan === 'MONTHLY') setCustomDays(30);
    else if (selectedPlan === 'ANNUAL') setCustomDays(365);
  }, [selectedPlan]);

  // Load live entitlements & metrics
  const loadEntitlements = async () => {
    setListLoading(true);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/entitlements', {
        headers: {
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAllEntitlements(data.entitlements || []);
        setMetrics(data.metrics || null);
      }
    } catch (err) {
      console.error('Error fetching admin entitlements:', err);
    } finally {
      setListLoading(false);
    }
  };

  // V1.8E — Load payments, audit events & safe provider status
  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/payments', {
        headers: {
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentTransactions(data.transactions || []);
        setPaymentAuditEvents(data.auditEvents || []);
        setPaymentMetrics(data.metrics || null);
        if (data.providerConfig?.plusPesa) {
          setPlusPesaSafeConfig(data.providerConfig.plusPesa);
        }
      }
    } catch (err) {
      console.error('Error fetching admin payments:', err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // V1.9A & V1.9B — Load advertising & reward metrics, audit trail, providers & compliance readiness
  const loadAdData = async () => {
    setAdsLoading(true);
    setAdActionFeedback(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const headers = {
        'Authorization': idToken ? `Bearer ${idToken}` : '',
        'x-user-id': currentUser?.uid || 'admin_user',
        'x-user-role': 'admin',
        'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
        'x-admin-secret': 'ufugaji-admin-secret-test'
      };

      const [metricsRes, eventsRes, providersRes, settingsRes, complianceRes] = await Promise.all([
        fetch('/api/ai/admin/ads/metrics', { headers }),
        fetch('/api/ai/admin/ads/events?limit=50', { headers }),
        fetch('/api/ai/admin/ads/providers', { headers }),
        fetch('/api/ai/admin/ads/settings', { headers }),
        fetch('/api/ai/admin/ads/compliance', { headers })
      ]);

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setAdMetrics(metricsData.metrics || null);
      }
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setAdAuditEvents(eventsData.events || []);
      }
      if (providersRes.ok) {
        const providersData = await providersRes.json();
        setAdProviders(providersData.providers || []);
        const mockP = (providersData.providers || []).find((p: any) => p.providerName === 'MOCK_REWARDED_AD');
        if (mockP) {
          setMockConfigured(Boolean(mockP.isConfigured));
          if (mockP.safeConfig?.currentBehavior) {
            setMockBehavior(mockP.safeConfig.currentBehavior);
          }
        }
      }
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setAdSettings(settingsData.settings || null);
      }
      if (complianceRes.ok) {
        const compData = await complianceRes.json();
        setAdComplianceChecks(compData.checks || []);
        setAdComplianceConfig(compData.config || null);
        if (compData.config) {
          setEditPrivacyUrl(compData.config.privacyPolicyUrl || 'https://ufugajiupdate.co.tz/privacy-policy');
          setEditTermsUrl(compData.config.termsUrl || 'https://ufugajiupdate.co.tz/terms');
          setEditAppAdsTxtUrl(compData.config.appAdsTxtUrl || 'https://ufugajiupdate.co.tz/app-ads.txt');
        }
      }
    } catch (err) {
      console.error('Error loading ad data:', err);
    } finally {
      setAdsLoading(false);
    }
  };

  // V1.9B — Save Ad Settings (Provider, Platform, Mode, Production toggle)
  const handleSaveAdSettings = async (updates: Partial<AdSettingsState>) => {
    setSavingAdSettings(true);
    setAdSettingsFeedback(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/ads/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (res.ok) {
        setAdSettings(data.settings);
        setAdSettingsFeedback({
          success: true,
          message: 'Mipangilio ya matangazo imesasishwa kikamilifu.'
        });
        loadAdData();
      } else {
        setAdSettingsFeedback({
          success: false,
          message: data.error || 'Hitilafu ya kusasisha mipangilio ya matangazo.'
        });
      }
    } catch (err: any) {
      setAdSettingsFeedback({
        success: false,
        message: `Hitilafu ya mtandao: ${err.message}`
      });
    } finally {
      setSavingAdSettings(false);
    }
  };

  // V1.9B — Verify app-ads.txt deterministically
  const handleVerifyAppAdsTxt = async () => {
    setVerifyingAppAdsTxt(true);
    setAppAdsTxtResult(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/ads/verify-app-ads-txt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        }
      });
      const data = await res.json();
      setAppAdsTxtResult({
        verified: data.verified,
        message: data.message || (data.verified ? 'app-ads.txt imethibitishwa kikamilifu!' : 'app-ads.txt haikuthibitishwa.'),
        details: data
      });
      loadAdData();
    } catch (err: any) {
      setAppAdsTxtResult({
        verified: false,
        message: `Hitilafu ya mtandao: ${err.message}`
      });
    } finally {
      setVerifyingAppAdsTxt(false);
    }
  };

  // V1.9B — Safe Test Ad Provider Connection Probe
  const handleTestAdConnection = async () => {
    setTestingAdConnection(true);
    setTestAdConnResult(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/ads/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({
          providerName: adSettings?.providerName || 'ADMOB'
        })
      });
      const data = await res.json();
      setTestAdConnResult(data.testResult || { status: 'UNKNOWN', message: 'Hakuna majibu' });
    } catch (err: any) {
      setTestAdConnResult({
        status: 'ERROR',
        message: `Hitilafu ya mtandao: ${err.message}`
      });
    } finally {
      setTestingAdConnection(false);
    }
  };

  // V1.9B — Update Compliance URLs
  const handleSaveComplianceUrls = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingComplianceUrls(true);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/ads/compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({
          privacyPolicyUrl: editPrivacyUrl,
          termsUrl: editTermsUrl,
          appAdsTxtUrl: editAppAdsTxtUrl
        })
      });
      if (res.ok) {
        setComplianceEditing(false);
        loadAdData();
      }
    } catch (err) {
      console.error('Error saving compliance urls:', err);
    } finally {
      setSavingComplianceUrls(false);
    }
  };

  // V1.9C — Configure Production Ad Unit IDs (Masked on Display)
  const handleSaveAdUnits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAdUnit(true);
    try {
      await handleSaveAdSettings({
        productionRewardedAdUnitId: prodAdUnitInput.trim() || undefined,
        webRewardedAdUnitId: webAdUnitInput.trim() || undefined
      } as any);
      setEditingAdUnit(false);
      setProdAdUnitInput('');
      setWebAdUnitInput('');
    } finally {
      setSavingAdUnit(false);
    }
  };

  // V1.9A — Configure Mock Provider Behavior & Active State
  const handleSaveMockConfig = async (newBehavior: string, newConfigured: boolean) => {
    setAdsLoading(true);
    setAdActionFeedback(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/ads/mock-behavior', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({
          behavior: newBehavior,
          isConfigured: newConfigured
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMockBehavior(newBehavior);
        setMockConfigured(newConfigured);
        setAdActionFeedback(`Utekelezaji umefanikiwa: ${data.message || 'Mipangilio ya tangazo imesasishwa.'}`);
        loadAdData();
      } else {
        setAdActionFeedback(`Hitilafu: ${data.error || 'Imeshindikana kusasisha mipangilio ya tangazo.'}`);
      }
    } catch (err: any) {
      setAdActionFeedback(`Hitilafu ya mtandao: ${err.message}`);
    } finally {
      setAdsLoading(false);
    }
  };

  // V1.8E — Polling fallback inspection for PENDING/PROCESSING transactions
  const handlePollPayment = async (paymentId: string) => {
    setPollingPaymentId(paymentId);
    setPollFeedback(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch(`/api/ai/payment/poll/${encodeURIComponent(paymentId)}`, {
        method: 'POST',
        headers: {
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        }
      });
      const data = await res.json();
      if (res.ok) {
        setPollFeedback(`Hali ya muamala ${paymentId}: ${data.transaction?.status} ${data.entitlementActivated ? '(Premium Imewashwa!)' : ''}`);
        loadPayments();
        loadEntitlements();
      } else {
        setPollFeedback(`Hitilafu wakati wa kuulizia PlusPesa: ${data.error || 'Haijulikani'}`);
      }
    } catch (err: any) {
      setPollFeedback(`Hitilafu ya mtandao: ${err.message}`);
    } finally {
      setPollingPaymentId(null);
    }
  };

  useEffect(() => {
    loadEntitlements();
    loadPayments();
  }, [currentUser]);

  // Handle Authoritative Grant
  const handleGrantPremium = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId.trim()) {
      setGrantError('Tafadhali chagua au weka Kitambulisho cha Mtumiaji (User ID).');
      return;
    }

    setGrantLoading(true);
    setGrantError(null);
    setGrantResult(null);

    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/grant-premium', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({
          userId: targetUserId.trim(),
          planType: selectedPlan,
          durationDays: Number(customDays) || 30,
          dailyLimit: Number(customDailyLimit) || 50,
          notes: `${grantSource}: ${adminNotes}`
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Hitilafu wakati wa kuwasha Premium.');
      }

      setGrantResult(data);
      // Auto-inspect the granted user
      setInspectUserId(targetUserId.trim());
      handleInspectUser(targetUserId.trim());
      // Refresh list
      loadEntitlements();
      loadPayments();
    } catch (err: any) {
      setGrantError(err.message || 'Hitilafu ya mtandao au mamlaka ya msimamizi.');
    } finally {
      setGrantLoading(false);
    }
  };

  // Inspect User Realtime Entitlement
  const handleInspectUser = async (uidToInspect?: string) => {
    const uid = uidToInspect || inspectUserId;
    if (!uid.trim()) return;

    setInspectLoading(true);
    setInspectError(null);
    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch(`/api/ai/premium-status/${encodeURIComponent(uid.trim())}`, {
        headers: {
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Mtumiaji hakupatikana.');
      }
      setInspectedStatus(data);
    } catch (err: any) {
      setInspectError(err.message || 'Haikuweza kupata taarifa za mtumiaji.');
      setInspectedStatus(null);
    } finally {
      setInspectLoading(false);
    }
  };

  // Lifecycle Status Update (Suspend, Reinstate, Revoke)
  const handleUpdateStatus = async (status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED') => {
    if (!inspectedStatus?.userId) return;

    setStatusUpdateLoading(true);
    setStatusUpdateMsg(null);

    try {
      const idToken = currentUser ? await currentUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/ai/admin/entitlement/status-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken ? `Bearer ${idToken}` : '',
          'x-user-id': currentUser?.uid || 'admin_user',
          'x-user-role': 'admin',
          'x-user-email': currentUser?.email || 'mkomwasaid53@gmail.com',
          'x-admin-secret': 'ufugaji-admin-secret-test'
        },
        body: JSON.stringify({
          userId: inspectedStatus.userId,
          status,
          reason: `Hatua ya Msimamizi Mkuu: ${status}`
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Hitilafu ya kubadili hali ya kifurushi.');
      }

      setStatusUpdateMsg(`Hali imebadilishwa kuwa ${status} kikamilifu.`);
      handleInspectUser(inspectedStatus.userId);
      loadEntitlements();
    } catch (err: any) {
      setStatusUpdateMsg(`Hitilafu: ${err.message}`);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  // Filtered registered users for quick selector
  const filteredUsers = usersList.filter(u => {
    const q = userSearchTerm.toLowerCase();
    return (
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.phoneNumber && u.phoneNumber.toLowerCase().includes(q)) ||
      (u.uid && u.uid.toLowerCase().includes(q))
    );
  });

  // Filtered payment transactions
  const filteredPayments = paymentTransactions.filter(p => {
    if (paymentStatusFilter === 'ALL') return true;
    return p.status === paymentStatusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 text-white rounded-2xl p-5 border border-amber-500/30 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Crown className="w-5 h-5 text-amber-400" />
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-white">
                Mamlaka ya Usimamizi wa Vifurushi vya AI & Malipo (V1.8D)
              </h3>
            </div>
            <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
              Usimamizi wa kiserikali wa haki za Premium, ukaguzi wa miamala ya malipo (Provider-Neutral Integration), na rekodi za uthibitishaji (Audit Trail) bila kuweka siri kwenye mtandao.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" /> Msimamizi Amethibitishwa
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('settings');
            loadPayments();
          }}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'settings'
              ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-400'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Mipangilio ya Malipo (Payment Settings)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('grants')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'grants'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
          }`}
        >
          <Crown className="w-3.5 h-3.5" />
          <span>Utoaji wa Msimamizi & Tathmini</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('payments');
            loadPayments();
          }}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'payments'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Miamala ya Malipo ({paymentTransactions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('ads');
            loadAdData();
          }}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'ads'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
          }`}
        >
          <Gift className="w-3.5 h-3.5" />
          <span>Matangazo & Utayari (V1.9D)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('audit');
            loadPayments();
          }}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'audit'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Kumbukumbu za Uthibitishaji (Audit Trail)</span>
        </button>
      </div>

      {/* SUB-TAB 0: PAYMENT GATEWAY SETTINGS & PLUSPESA CONFIGURATION */}
      {activeSubTab === 'settings' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                    <Settings className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-bold text-stone-900">
                    Mipangilio ya Lango la Malipo (Payment Gateway Settings)
                  </h3>
                </div>
                <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                  Sanidi uunganisho wa <strong>PlusPesa Collections</strong> ili kupokea malipo ya simu (M-Pesa, Tigo Pesa, Airtel Money, Halopesa) kwa ununuzi wa vifurushi vya AI Premium. Mabadiliko yanahifadhiwa kwa usalama kwenye seva bila kuweka wazi siri.
                </p>
              </div>

              {/* Status Pill */}
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  plusPesaSafeConfig?.isConfigured
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${plusPesaSafeConfig?.isConfigured ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`} />
                  <span>
                    {plusPesaSafeConfig?.isConfigured ? 'PLUSPESA: IMESANIDIWA & TAYARI' : 'PLUSPESA: INASUBIRI FUNGUO'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback Alerts */}
          {configSaveFeedback && (
            <div className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
              configSaveFeedback.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              {configSaveFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-bold">{configSaveFeedback.success ? 'Imefanikiwa: ' : 'Hitilafu: '}</span>
                <span>{configSaveFeedback.message}</span>
              </div>
            </div>
          )}

          {/* Test Connection Banner if run */}
          {testConnResult && (
            <div className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
              testConnResult.status === 'CONNECTED'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : testConnResult.status === 'CONFIGURATION_ERROR'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <Shield className={`w-4 h-4 shrink-0 mt-0.5 ${
                testConnResult.status === 'CONNECTED' ? 'text-emerald-600' : 'text-amber-600'
              }`} />
              <div className="space-y-0.5">
                <p className="font-bold">
                  Matokeo ya Upimaji wa Muunganisho (Status: {testConnResult.status}):
                </p>
                <p>{testConnResult.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Section */}
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-stone-900">
                    Funguo za API na Usanidi wa Seva
                  </h4>
                </div>
                <span className="text-[11px] font-semibold text-stone-500">
                  Mtoa Huduma: PlusPesa
                </span>
              </div>

              <form onSubmit={handleSavePaymentConfig} className="space-y-4">
                {/* Environment selector */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Mazingira ya Malipo (Payment Environment)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setConfigEnvironment('sandbox')}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        configEnvironment === 'sandbox'
                          ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500'
                          : 'border-stone-200 hover:border-stone-300 bg-stone-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-stone-900">Sandbox (Majaribio)</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Test</span>
                      </div>
                      <p className="text-[11px] text-stone-500">
                        Inatumika kufanya majaribio bila kutoza pesa halisi kutoka kwa akaunti ya mtumiaji.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfigEnvironment('production')}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        configEnvironment === 'production'
                          ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                          : 'border-stone-200 hover:border-stone-300 bg-stone-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-stone-900">Production (Mubashara)</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Live</span>
                      </div>
                      <p className="text-[11px] text-stone-500">
                        Inatumia mitandao halisi ya simu (M-Pesa, Tigo, n.k.) na hutoza fedha halisi za TZS.
                      </p>
                    </button>
                  </div>
                </div>

                {/* API Base URL */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    API Base URL (Kituo cha API cha PlusPesa)
                  </label>
                  <input
                    type="text"
                    value={configBaseUrl}
                    onChange={(e) => setConfigBaseUrl(e.target.value)}
                    placeholder="https://app.pluspesa.com/api/v1"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50 font-mono"
                  />
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    Kwa kawaida ni: <code className="text-stone-600">https://app.pluspesa.com/api/v1</code>
                  </span>
                </div>

                {/* X-Public-Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-stone-700">
                      PlusPesa Public Key (<code className="text-amber-700 font-mono">X-Public-Key</code>)
                    </label>
                    {plusPesaSafeConfig?.hasPublicKey && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                        Ya sasa: {plusPesaSafeConfig.maskedPublicKey}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={configPublicKey}
                    onChange={(e) => setConfigPublicKey(e.target.value)}
                    placeholder={plusPesaSafeConfig?.hasPublicKey ? 'Acha tupu kubaki na ufunguo wa sasa, au weka ufunguo mpya...' : 'Weka PlusPesa Public Key hapa...'}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50 font-mono"
                  />
                </div>

                {/* X-Secret-Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-stone-700">
                      PlusPesa Secret Key (<code className="text-amber-700 font-mono">X-Secret-Key</code>)
                    </label>
                    {plusPesaSafeConfig?.hasSecretKey && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                        Ya sasa: {plusPesaSafeConfig.maskedSecretKey}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      value={configSecretKey}
                      onChange={(e) => setConfigSecretKey(e.target.value)}
                      placeholder={plusPesaSafeConfig?.hasSecretKey ? 'Acha tupu kubaki na siri ya sasa, au weka mpya...' : 'Weka PlusPesa Secret Key hapa...'}
                      className="w-full pl-3 pr-10 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Webhook HMAC Secret */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-stone-700">
                      Callback / Webhook HMAC Secret
                    </label>
                    {plusPesaSafeConfig?.hasCallbackSecret ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                        Ya sasa: {plusPesaSafeConfig.maskedCallbackSecret}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 font-semibold">
                        Haijawekwa (Haipendekezwi)
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showCallbackSecret ? 'text' : 'password'}
                      value={configCallbackSecret}
                      onChange={(e) => setConfigCallbackSecret(e.target.value)}
                      placeholder={plusPesaSafeConfig?.hasCallbackSecret ? 'Acha tupu kubaki na siri ya sasa, au weka mpya...' : 'Weka Webhook Secret ya HMAC-SHA256...'}
                      className="w-full pl-3 pr-10 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCallbackSecret(!showCallbackSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      {showCallbackSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-stone-500 mt-1 block">
                    Inatumika kuhalalisha na kuthibitisha saini ya kielektroniki (<code className="text-stone-700 font-mono">x-pluspesa-signature</code>) ili kuzuia mashambulizi ya wizi.
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="submit"
                    disabled={configSaving}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{configSaving ? 'Inahifadhi...' : 'Hifadhi Mipangilio ya Malipo'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestConnection('PLUSPESA')}
                    disabled={testingConnection}
                    className="w-full sm:w-auto px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {testingConnection ? <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> : <RefreshCw className="w-4 h-4" />}
                    <span>{testingConnection ? 'Inapima Muunganisho...' : 'Pima Muunganisho (Bila Kutoza)'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Sidebar / Info Column */}
            <div className="lg:col-span-5 space-y-5">
              {/* Webhook Endpoints Box */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-stone-900">
                    Anwani za Webhook (Callback URLs)
                  </h4>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Bandika anwani hii kwenye akaunti yako ya PlusPesa (Dashboard → Settings → Webhooks) ili seva yetu ipokee taarifa za papo hapo mtumiaji anapokamilisha malipo kwenye simu yake:
                </p>

                {/* Primary Webhook URL */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-stone-700">Anwani Kuu ya Webhook:</span>
                  <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl p-2 font-mono text-[11px] text-stone-800 break-all">
                    <span className="flex-1">{typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/pluspesa` : '/api/webhooks/pluspesa'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyWebhook(typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/pluspesa` : '/api/webhooks/pluspesa', 'primary')}
                      className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 text-[10px] font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      {copiedWebhook === 'primary' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Imenakiliwa!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Nakili</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Alternate Webhook URL */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-bold text-stone-700">Anwani Mbadala ya Mtoa Huduma:</span>
                  <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl p-2 font-mono text-[11px] text-stone-800 break-all">
                    <span className="flex-1">{typeof window !== 'undefined' ? `${window.location.origin}/api/ai/payment/webhook/PLUSPESA` : '/api/ai/payment/webhook/PLUSPESA'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyWebhook(typeof window !== 'undefined' ? `${window.location.origin}/api/ai/payment/webhook/PLUSPESA` : '/api/ai/payment/webhook/PLUSPESA', 'provider')}
                      className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 text-[10px] font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      {copiedWebhook === 'provider' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Imenakiliwa!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Nakili</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                    Uthibitishaji wa Saini ya HMAC:
                  </p>
                  <p>
                    Seva inakagua kichwa cha <code className="font-mono bg-amber-100 px-1 rounded">x-pluspesa-signature</code> kwa kutumia Callback Secret iliyowekwa hapa ili kuzuia malipo feki.
                  </p>
                </div>
              </div>

              {/* Indicative Pricing Card */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                  <Crown className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-stone-900">
                    Vifurushi vya AI Premium & Bei Zinazosimamiwa
                  </h4>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-xs">
                    <div>
                      <span className="font-bold text-stone-900 block">Kifurushi cha Wiki (Weekly)</span>
                      <span className="text-[10px] text-stone-500">Siku 7 • Maswali 50/siku • Picha/Sauti</span>
                    </div>
                    <span className="font-mono font-bold text-amber-700">TZS 3,000</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 border border-amber-200 text-xs">
                    <div>
                      <span className="font-bold text-stone-900 block">Kifurushi cha Mwezi (Monthly)</span>
                      <span className="text-[10px] text-stone-500">Siku 30 • Maswali 50/siku • Picha/Sauti</span>
                    </div>
                    <span className="font-mono font-bold text-amber-700">TZS 10,000</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-xs">
                    <div>
                      <span className="font-bold text-stone-900 block">Kifurushi cha Mwaka (Annual)</span>
                      <span className="text-[10px] text-stone-500">Siku 365 • Maswali 50/siku • Picha/Sauti</span>
                    </div>
                    <span className="font-mono font-bold text-amber-700">TZS 100,000</span>
                  </div>
                </div>
                <p className="text-[10px] text-stone-400">
                  * Uanzishaji wa vifurushi hufanywa na seva pekee mara baada ya muamala kuthibitishwa (Server-Authoritative).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: GRANTS & ENTITLEMENT INSPECTOR (V1.8C) */}
      {activeSubTab === 'grants' && (
        <div className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500">Premium Walio Hai</span>
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {metrics?.statusActiveCount ?? allEntitlements.filter(e => e.status === 'ACTIVE' && e.tier === 'PREMIUM').length}
              </p>
              <span className="text-[10px] text-emerald-700 font-medium">Uwezo kamili wa AI & Media</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500">Vifurushi Vilivyokwisha</span>
                <Clock className="w-4 h-4 text-stone-400" />
              </div>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {metrics?.statusExpiredCount ?? allEntitlements.filter(e => e.status === 'EXPIRED').length}
              </p>
              <span className="text-[10px] text-stone-500 font-medium">Wamerudi kiwango cha bure</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500">Utoaji wa Msimamizi</span>
                <Crown className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {allEntitlements.filter(e => e.source === 'ADMIN_GRANT' || e.source === 'MANUAL_PAYMENT').length}
              </p>
              <span className="text-[10px] text-purple-700 font-medium">Admin & Complimentary grants</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500">Dhamira za Malipo</span>
                <Zap className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-black text-stone-900 mt-1">
                {paymentMetrics?.paymentCreationCount ?? metrics?.paymentIntentsCreated ?? 0}
              </p>
              <span className="text-[10px] text-blue-700 font-medium">Wateja walioanzisha malipo</span>
            </div>
          </div>

          {/* Main Two Columns: Form & Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Authoritative Grant Form (7 cols) */}
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-amber-100 text-amber-800">
                    <Crown className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-extrabold text-stone-900">
                      Washa Kifurushi Moja kwa Moja (Authoritative Grant)
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      Uanzishaji wa mamlaka ya msimamizi unavuka hatua zote za malipo na kumwezesha mtumiaji papo hapo.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleGrantPremium} className="space-y-3.5 text-xs">
                {/* Target User ID */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Kitambulisho cha Mtumiaji (User ID / UID) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      placeholder="Weka UID (mfano: farmer_xyz123 au chagua hapo chini)"
                      className="flex-1 px-3 py-2 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-amber-500/30 font-mono"
                      required
                    />
                    {targetUserId && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectUserId(targetUserId);
                          handleInspectUser(targetUserId);
                        }}
                        className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Search className="w-3 h-3" />
                        <span>Angalia Hali</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Plan Selection Cards */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1.5">
                    Chagua Aina ya Kifurushi
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <div
                      onClick={() => setSelectedPlan('WEEKLY')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedPlan === 'WEEKLY'
                          ? 'border-amber-500 bg-amber-50/50 shadow-xs ring-1 ring-amber-400'
                          : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">Wiki Moja</span>
                        {selectedPlan === 'WEEKLY' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="text-sm font-extrabold text-stone-900 mt-1">TSh 3,000</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">Siku 7 | 50 queries/siku</p>
                    </div>

                    <div
                      onClick={() => setSelectedPlan('MONTHLY')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedPlan === 'MONTHLY'
                          ? 'border-amber-500 bg-amber-50/50 shadow-xs ring-1 ring-amber-400'
                          : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">Mwezi Mmoja</span>
                        {selectedPlan === 'MONTHLY' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="text-sm font-extrabold text-stone-900 mt-1">TSh 10,000</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">Siku 30 | Maarufu zaidi</p>
                    </div>

                    <div
                      onClick={() => setSelectedPlan('ANNUAL')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedPlan === 'ANNUAL'
                          ? 'border-amber-500 bg-amber-50/50 shadow-xs ring-1 ring-amber-400'
                          : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">Mwaka Mmoja</span>
                        {selectedPlan === 'ANNUAL' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="text-sm font-extrabold text-stone-900 mt-1">TSh 90,000</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">Siku 365 | Thamani kubwa</p>
                    </div>
                  </div>
                </div>

                {/* Custom Overrides */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Muda wa Kifurushi (Siku)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="730"
                      value={customDays}
                      onChange={(e) => setCustomDays(parseInt(e.target.value) || 30)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Kikomo cha Maswali kwa Siku
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="500"
                      value={customDailyLimit}
                      onChange={(e) => setCustomDailyLimit(parseInt(e.target.value) || 50)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                    />
                  </div>
                </div>

                {/* Grant Source & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Sababu / Chanzo cha Utoaji
                    </label>
                    <select
                      value={grantSource}
                      onChange={(e) => setGrantSource(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white"
                    >
                      <option value="ADMIN_GRANT">Msaada wa Msimamizi (Complimentary Trial)</option>
                      <option value="MANUAL_PAYMENT">Malipo ya Mkono (M-Pesa / Benki)</option>
                      <option value="PROMOTION">Ofa Maalum / Kampeni ya Mfugaji</option>
                      <option value="INTERNAL_TESTING">Majaribio ya Ndani ya Mfumo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Maelezo ya Kumbukumbu (Audit Notes)
                    </label>
                    <input
                      type="text"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Mfano: Malipo yamehakikiwa kupitia M-Pesa ref #123"
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                    />
                  </div>
                </div>

                {grantError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{grantError}</span>
                  </div>
                )}

                {grantResult && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Kifurushi cha Premium Kimewashwa Kikamilifu!</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div>
                        <span className="text-stone-500">Mtumiaji:</span> <span className="font-mono font-semibold">{grantResult.userId}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">Kifurushi:</span> <span className="font-bold text-amber-800">{grantResult.entitlement?.packageType}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">Mwisho wa Kifurushi:</span> <span className="font-semibold">{new Date(grantResult.entitlement?.expiresAt).toLocaleDateString('sw-TZ')}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">Kikomo:</span> <span className="font-semibold">{grantResult.entitlement?.dailyLimit} queries/siku</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={grantLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {grantLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Crown className="w-4 h-4" />
                    )}
                    <span>Washa Premium Rasmi (Authoritative Grant)</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Entitlement Inspector & Lifecycle Controls (5 cols) */}
            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-teal-100 text-teal-800">
                      <Search className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-extrabold text-stone-900">
                        Tathmini & Dhibiti Mtumiaji
                      </h4>
                      <p className="text-[11px] text-stone-500">
                        Kagua hali halisi ya haki (real-time entitlement) na rekodi ya matumizi.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inspectUserId}
                    onChange={(e) => setInspectUserId(e.target.value)}
                    placeholder="Weka User ID hapa kukagua..."
                    className="flex-1 px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={inspectLoading || !inspectUserId.trim()}
                    onClick={() => handleInspectUser()}
                    className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {inspectLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Kagua</span>
                  </button>
                </div>

                {inspectError && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
                    <span>{inspectError}</span>
                  </div>
                )}

                {inspectedStatus ? (
                  <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-stone-500 font-medium">Hali ya Sasa:</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          inspectedStatus.tier === 'PREMIUM'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-stone-200 text-stone-700'
                        }`}>
                          {inspectedStatus.tier}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inspectedStatus.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inspectedStatus.status === 'SUSPENDED'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {inspectedStatus.status}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-[11px] border-y border-stone-200/70 py-2.5">
                      <div className="flex justify-between">
                        <span className="text-stone-500">Mtumiaji:</span>
                        <span className="font-mono font-semibold text-stone-900">{inspectedStatus.userId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Kifurushi:</span>
                        <span className="font-bold text-stone-800">{inspectedStatus.activePlan || 'Hakuna (BURE)'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Siku Zilizobaki:</span>
                        <span className="font-bold text-emerald-800">{inspectedStatus.daysRemaining} siku</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Kikomo kwa Siku:</span>
                        <span className="font-semibold text-stone-800">{inspectedStatus.dailyLimit} maswali/siku</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Media Access:</span>
                        <span className={`font-semibold ${inspectedStatus.mediaAllowed ? 'text-emerald-700' : 'text-stone-500'}`}>
                          {inspectedStatus.mediaAllowed ? 'Inaruhusiwa (YES)' : 'Imezuiliwa (NO)'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block">
                        Hatua za Usimamizi wa Maisha:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          disabled={statusUpdateLoading || inspectedStatus.status === 'ACTIVE'}
                          onClick={() => handleUpdateStatus('ACTIVE')}
                          className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                        >
                          <PlayCircle className="w-3 h-3" />
                          <span>Washa</span>
                        </button>
                        <button
                          type="button"
                          disabled={statusUpdateLoading || inspectedStatus.status === 'SUSPENDED'}
                          onClick={() => handleUpdateStatus('SUSPENDED')}
                          className="py-1.5 px-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Simamisha</span>
                        </button>
                        <button
                          type="button"
                          disabled={statusUpdateLoading || inspectedStatus.status === 'REVOKED'}
                          onClick={() => handleUpdateStatus('REVOKED')}
                          className="py-1.5 px-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                        >
                          <Ban className="w-3 h-3" />
                          <span>Batilisha</span>
                        </button>
                      </div>

                      {statusUpdateMsg && (
                        <p className="text-[10px] font-semibold text-emerald-700 pt-1 text-center">
                          {statusUpdateMsg}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-stone-300 text-center text-stone-400 text-xs space-y-1">
                    <Shield className="w-6 h-6 mx-auto text-stone-300" />
                    <p>Weka User ID hapo juu au bofya "Chagua" kwenye orodha ya watumiaji ili kutathmini haki zake.</p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 mt-4">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Ulinzi wa Mfumo:</strong> Watumiaji hawawezi kujipa Premium upande wa simu/browser bila uthibitisho wa kiserikali unaotolewa hapa.
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Section: Registered Users Quick Selector Table */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h4 className="text-sm font-extrabold text-stone-900">
                  Orodha ya Watumiaji Waliosajiliwa (Firestore Database)
                </h4>
                <p className="text-[11px] text-stone-500">
                  Chagua mtumiaji yeyote hapa ili kuingiza UID yake moja kwa moja kwenye fomu ya kuwasha Premium.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="Tafuta kwa jina au simu..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <button
                  onClick={loadEntitlements}
                  className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
                  title="Pakia upya"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] font-bold text-stone-500 bg-stone-50/50">
                    <th className="py-2.5 px-3">Mtumiaji / Jina</th>
                    <th className="py-2.5 px-3">Mawasiliano</th>
                    <th className="py-2.5 px-3">Cheo</th>
                    <th className="py-2.5 px-3">UID</th>
                    <th className="py-2.5 px-3 text-right">Hatua</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-stone-900">
                          {u.displayName || 'Mtumiaji Bila Jina'}
                        </td>
                        <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">
                          {u.phoneNumber || u.email || '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : u.role === 'doctor'
                              ? 'bg-teal-100 text-teal-800'
                              : u.role === 'seller'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-stone-100 text-stone-700'
                          }`}>
                            {u.role || 'user'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-stone-500 font-mono text-[10px]">
                          {u.uid.slice(0, 16)}...
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetUserId(u.uid);
                              setInspectUserId(u.uid);
                              handleInspectUser(u.uid);
                            }}
                            className="py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Crown className="w-3 h-3 text-amber-600" />
                            <span>Chagua & Kagua</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-stone-400 text-xs">
                        {usersList.length === 0 ? 'Hakuna watumiaji waliopakiwa bado.' : 'Hakuna mtumiaji anayelingana na utafutaji.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PAYMENT TRANSACTIONS (V1.8D) */}
      {activeSubTab === 'payments' && (
        <div className="space-y-6">
          {/* Payment Metrics Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Zilizoanzishwa</span>
              <p className="text-2xl font-black text-stone-900 mt-1">{paymentMetrics?.paymentCreationCount ?? 0}</p>
              <span className="text-[10px] text-stone-500 font-medium">Miamala yote</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Inasubiri (Pending)</span>
              <p className="text-2xl font-black text-amber-700 mt-1">{paymentMetrics?.paymentPendingCount ?? 0}</p>
              <span className="text-[10px] text-amber-700 font-medium">Bila uanzishaji wa AI</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Zilizofanikiwa (Success)</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">{paymentMetrics?.paymentSuccessCount ?? 0}</p>
              <span className="text-[10px] text-emerald-700 font-medium">Zilizothibitishwa rasmi</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Zilizoanguka / Futa</span>
              <p className="text-2xl font-black text-red-700 mt-1">
                {(paymentMetrics?.paymentFailureCount ?? 0) + (paymentMetrics?.paymentCancelledCount ?? 0) + (paymentMetrics?.paymentExpiredCount ?? 0)}
              </p>
              <span className="text-[10px] text-red-700 font-medium">Failed / Cancelled</span>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">AI Premium Activated</span>
              <p className="text-2xl font-black text-purple-700 mt-1">{paymentMetrics?.premiumActivationsFromPayment ?? 0}</p>
              <span className="text-[10px] text-purple-700 font-medium">Kutoka kwa malipo</span>
            </div>
          </div>

          {/* Providers Status Card */}
          <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-700" />
                <h4 className="text-sm font-extrabold text-stone-900">
                  Hali ya Watoa Huduma ya Malipo (Payment Providers Status)
                </h4>
              </div>
              <span className="text-[11px] text-stone-500">
                Ufugaji Payment Provider Layer (V1.8E PlusPesa Real Integration)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-amber-200/70 bg-amber-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${plusPesaSafeConfig?.isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                    PlusPesa Collections API (Real)
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    plusPesaSafeConfig?.isConfigured
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {plusPesaSafeConfig?.isConfigured ? 'CONFIGURED & READY' : 'AWAITING CREDENTIALS'}
                  </span>
                </div>
                <div className="text-[11px] text-stone-600 space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="font-sans text-stone-500">Mazingira (Env):</span>
                    <span className="font-bold uppercase text-stone-800">{plusPesaSafeConfig?.environment || 'sandbox'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-stone-500">Public Key (X-Public-Key):</span>
                    <span className={plusPesaSafeConfig?.hasPublicKey ? 'text-emerald-700 font-bold' : 'text-stone-400'}>
                      {plusPesaSafeConfig?.hasPublicKey ? '✓ Imewekwa' : '✗ Haipo'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-stone-500">Secret Key (X-Secret-Key):</span>
                    <span className={plusPesaSafeConfig?.hasSecretKey ? 'text-emerald-700 font-bold' : 'text-stone-400'}>
                      {plusPesaSafeConfig?.hasSecretKey ? '✓ Imewekwa (Seva)' : '✗ Haipo'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-stone-500">HMAC Callback Secret:</span>
                    <span className={plusPesaSafeConfig?.hasCallbackSecret ? 'text-emerald-700 font-bold' : 'text-stone-400'}>
                      {plusPesaSafeConfig?.hasCallbackSecret ? '✓ Imewekwa (SHA-256)' : '✗ Haipo'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={testingConnection}
                    onClick={() => handleTestConnection('PLUSPESA')}
                    className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingConnection ? 'animate-spin' : ''}`} />
                    <span>{testingConnection ? 'Inapima...' : 'Pima Muunganisho (Bila Kutoza)'}</span>
                  </button>

                  {testConnResult && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      testConnResult.status === 'CONNECTED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : testConnResult.status === 'CONFIGURATION_ERROR'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {testConnResult.status}: {testConnResult.message}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200/70 bg-emerald-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Mock Payment Provider
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ACTIVE (DEV/TEST)
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Mtoa huduma wa majaribio aliyewekwa kwa ajili ya kuthibitisha majaribio ya kidhibitisho (SUCCESS, PENDING, FAILED, CANCELLED, Duplicate Callbacks) bila kuathiri miamala ya kweli.
                </p>
                <div className="text-[11px] text-stone-600 font-mono flex justify-between pt-1">
                  <span className="font-sans text-stone-500">Uthibitishaji:</span>
                  <span className="text-emerald-700 font-bold">100% Deterministic</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback message for polling action */}
          {pollFeedback && (
            <div className="p-3 bg-sky-50 rounded-xl border border-sky-200 text-xs text-sky-900 flex items-center justify-between">
              <span>{pollFeedback}</span>
              <button
                type="button"
                onClick={() => setPollFeedback(null)}
                className="text-sky-600 hover:text-sky-900 text-xs font-bold"
              >
                Funga
              </button>
            </div>
          )}

          {/* Transactions Table */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h4 className="text-sm font-extrabold text-stone-900">
                  Rekodi za Miamala ya Malipo (Payment Transactions)
                </h4>
                <p className="text-[11px] text-stone-500">
                  Miamala yote inasimamiwa na mamlaka ya seva. Mteja hawezi kubadilisha hali ya malipo kuwa SUCCESS mwenyewe.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-stone-300 text-xs bg-white"
                >
                  <option value="ALL">Hali Zote (All Statuses)</option>
                  <option value="PENDING">PENDING Pekee</option>
                  <option value="PROCESSING">PROCESSING Pekee</option>
                  <option value="SUCCESS">SUCCESS Pekee</option>
                  <option value="FAILED">FAILED Pekee</option>
                  <option value="CANCELLED">CANCELLED Pekee</option>
                  <option value="EXPIRED">EXPIRED Pekee</option>
                </select>

                <button
                  type="button"
                  onClick={loadPayments}
                  className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
                  title="Pakia upya"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${paymentsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] font-bold text-stone-500 bg-stone-50/50">
                    <th className="py-2.5 px-3">Payment ID / External ID</th>
                    <th className="py-2.5 px-3">Mkulima / Simu</th>
                    <th className="py-2.5 px-3">Kifurushi & Kiasi</th>
                    <th className="py-2.5 px-3">Mtoa Huduma</th>
                    <th className="py-2.5 px-3">Hali (Status)</th>
                    <th className="py-2.5 px-3">PlusPesa Ref / UUID</th>
                    <th className="py-2.5 px-3">AI Entitlement</th>
                    <th className="py-2.5 px-3 text-right">Hatua / Tarehe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                  {filteredPayments.length > 0 ? (
                    filteredPayments.map((p) => (
                      <tr key={p.paymentId} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-stone-900 block">{p.paymentId}</span>
                          <span className="text-[10px] text-stone-500 font-mono block">{p.externalId || '—'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-stone-600 font-sans">
                          <span className="font-mono text-stone-800 block text-xs">{p.userId}</span>
                          {p.customerPhone && (
                            <span className="text-[10px] text-emerald-700 font-mono block">{p.customerPhone}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="font-bold text-stone-900">{p.planType}</span>
                          <span className="text-stone-500 block text-[10px]">TSh {Number(p.amount ?? 0).toLocaleString()}</span>
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-800">
                            {p.provider}
                          </span>
                          {(p as any).providerNetwork && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              {(p as any).providerNetwork}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.status === 'SUCCESS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : p.status === 'PROCESSING'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-stone-600 text-[10px] font-mono">
                          <span className="block font-semibold text-stone-800">{p.providerTransactionReference || '—'}</span>
                          {p.providerUuid && (
                            <span className="block text-stone-400 text-[9px] truncate max-w-[120px]">{p.providerUuid}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          {p.entitlementId ? (
                            <span className="text-[10px] text-purple-700 font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3 text-purple-600 shrink-0" />
                              {p.entitlementId.slice(0, 14)}...
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[10px] italic">Bado (Hakuna)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans text-stone-500 text-[10px]">
                          <div>{new Date(p.createdAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}</div>
                          {(p.status === 'PENDING' || p.status === 'PROCESSING') && (
                            <button
                              type="button"
                              disabled={pollingPaymentId === p.paymentId}
                              onClick={() => handlePollPayment(p.paymentId)}
                              className="mt-1 px-2 py-0.5 rounded-md bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[9px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {pollingPaymentId === p.paymentId ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                              <span>Hakiki</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-stone-400 font-sans text-xs">
                        {paymentTransactions.length === 0 ? 'Hakuna miamala ya malipo iliyorekodiwa bado.' : 'Hakuna miamala inayolingana na hali uliyochagua.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: MATANGAZO — WEB REWARDED ADS (V1.9F-CORRECTIVE) */}
      {activeSubTab === 'ads' && (
        <AdminWebRewardedAdsDashboard currentUser={currentUser} onRefresh={loadAdData} />
      )}

      {/* SUB-TAB 3: PAYMENT AUDIT TRAIL (V1.8D) */}
      {activeSubTab === 'audit' && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-stone-900">
                Kumbukumbu za Uthibitishaji wa Malipo (Payment Audit Trail)
              </h4>
              <p className="text-[11px] text-stone-500">
                Matukio yote ya uanzishaji, uthibitisho, makosa ya saini, na marudio ya callback (Idempotency) yanasajiliwa hapa.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPayments}
              className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer self-start sm:self-auto"
              title="Pakia upya"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${paymentsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2">
            {paymentAuditEvents.length > 0 ? (
              paymentAuditEvents.map((e) => (
                <div key={e.eventId} className="p-3 rounded-xl border border-stone-100 bg-stone-50/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.eventType === 'PREMIUM_ACTIVATED_FROM_PAYMENT' || e.eventType === 'PAYMENT_SUCCESS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : e.eventType === 'PAYMENT_WEBHOOK_RECEIVED'
                          ? 'bg-sky-100 text-sky-800'
                          : e.eventType === 'PAYMENT_DUPLICATE_CALLBACK'
                          ? 'bg-blue-100 text-blue-800'
                          : e.eventType === 'PAYMENT_WEBHOOK_SIGNATURE_FAILED' || e.eventType === 'PAYMENT_VALIDATION_FAILED' || e.eventType === 'PAYMENT_VERIFICATION_FAILED' || e.eventType === 'PAYMENT_FAILED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-stone-200 text-stone-700'
                      }`}>
                        {e.eventType}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-stone-900">{e.paymentId}</span>
                      <span className="text-stone-400 font-mono text-[10px]">({e.provider})</span>
                    </div>

                    <p className="text-[11px] text-stone-600 font-sans">
                      Mtumiaji: <span className="font-mono font-semibold">{e.userId}</span>
                      {e.providerReference && (
                        <span> | Ref ya Nje: <span className="font-mono font-semibold">{e.providerReference}</span></span>
                      )}
                      {e.safeMetadata && Object.keys(e.safeMetadata).length > 0 && (
                        <span className="text-stone-500 block text-[10px] mt-0.5">
                          Taarifa: {JSON.stringify(e.safeMetadata)}
                        </span>
                      )}
                    </p>
                  </div>

                  <span className="text-[10px] text-stone-400 font-mono shrink-0">
                    {new Date(e.timestamp).toLocaleTimeString('sw-TZ')} ({new Date(e.timestamp).toLocaleDateString('sw-TZ')})
                  </span>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-stone-400 text-xs">
                Hakuna kumbukumbu za ukaguzi zilizosajiliwa bado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
