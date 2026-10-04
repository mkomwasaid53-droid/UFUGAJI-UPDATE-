/// <reference types="node" />
/**
 * V1.8E — PlusPesa Payment Provider Adapter
 *
 * Real integration adapter adhering strictly to official PlusPesa Collections API documentation:
 * - Base URL: https://app.pluspesa.com/api/v1 (or configurable via PLUS_PESA_BASE_URL)
 * - Authentication: X-Public-Key and X-Secret-Key headers
 * - Collections: POST /collections
 * - Webhook: POST /api/ai/payment/webhook/pluspesa
 * - Signature Verification: HMAC-SHA256(rawRequestBody, PLUS_PESA_CALLBACK_SECRET) via X-PlusPesa-Signature
 * - Status Inquiry Fallback: GET /collections/{reference}/status
 *
 * SECURITY & GOVERNANCE:
 * - Secrets remain strictly server-side (process.env); never exposed to React or API responses.
 * - Create collection responses are acknowledgements (PROCESSING) and NEVER activate Premium.
 * - Idempotent, server-authoritative entitlement activation happens upon verified SUCCESS only.
 */

function getNodeCrypto(): any {
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('crypto');
    } catch {
      return null;
    }
  }
  return null;
}

function getNodeBuffer(): any {
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('node:buffer')?.Buffer || (globalThis as any).Buffer;
    } catch {
      return (globalThis as any).Buffer;
    }
  }
  return (globalThis as any).Buffer;
}
import {
  PaymentProvider,
  CreatePaymentRequestParams,
  CreatePaymentRequestResult,
  ProviderPaymentStatusResult,
  VerifyCallbackResult
} from './paymentProviderInterface';
import { PaymentStatus } from '../../types/aiUsageAndCache';

export interface PlusPesaConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl: string;
  environment: 'sandbox' | 'production' | string;
  callbackSecret?: string;
  callbackUrl?: string;
  timeoutMs: number;
}

export class PlusPesaPaymentProvider implements PaymentProvider {
  public readonly providerName = 'PLUSPESA';
  private config: PlusPesaConfig;

  constructor(customConfig?: Partial<PlusPesaConfig>) {
    const isNode = typeof process !== 'undefined';
    const env = isNode ? process.env : {};

    this.config = {
      publicKey: customConfig?.publicKey ?? env.PLUS_PESA_PUBLIC_KEY,
      secretKey: customConfig?.secretKey ?? env.PLUS_PESA_SECRET_KEY,
      baseUrl: (customConfig?.baseUrl ?? env.PLUS_PESA_BASE_URL ?? 'https://app.pluspesa.com/api/v1').replace(/\/+$/, ''),
      environment: customConfig?.environment ?? env.PLUS_PESA_ENVIRONMENT ?? 'sandbox',
      callbackSecret: customConfig?.callbackSecret ?? env.PLUS_PESA_CALLBACK_SECRET,
      callbackUrl: customConfig?.callbackUrl ?? env.PLUS_PESA_CALLBACK_URL ?? (env.APP_URL ? `${env.APP_URL.replace(/\/+$/, '')}/api/ai/payment/webhook/pluspesa` : undefined),
      timeoutMs: customConfig?.timeoutMs ?? 15000
    };
  }

  /**
   * Safe server-side check whether PlusPesa two-key authentication is provisioned.
   */
  public get isConfigured(): boolean {
    return Boolean(
      this.config.publicKey &&
      this.config.publicKey.trim().length > 0 &&
      this.config.secretKey &&
      this.config.secretKey.trim().length > 0
    );
  }

  /**
   * Safe getter for callback secret status (boolean only; never returns secret string).
   */
  public get hasCallbackSecret(): boolean {
    return Boolean(this.config.callbackSecret && this.config.callbackSecret.trim().length > 0);
  }

  /**
   * Updates provider configuration dynamically at runtime (via Admin settings panel).
   * Never stores or logs secrets insecurely.
   */
  public updateConfig(newConfig: Partial<PlusPesaConfig>): void {
    if (newConfig.publicKey !== undefined) this.config.publicKey = newConfig.publicKey.trim();
    if (newConfig.secretKey !== undefined) this.config.secretKey = newConfig.secretKey.trim();
    if (newConfig.baseUrl !== undefined) this.config.baseUrl = newConfig.baseUrl.trim().replace(/\/+$/, '');
    if (newConfig.environment !== undefined) this.config.environment = newConfig.environment.trim();
    if (newConfig.callbackSecret !== undefined) this.config.callbackSecret = newConfig.callbackSecret.trim();
    if (newConfig.callbackUrl !== undefined) this.config.callbackUrl = newConfig.callbackUrl.trim();
    if (newConfig.timeoutMs !== undefined) this.config.timeoutMs = newConfig.timeoutMs;
  }

  /**
   * Safe configuration snapshot for diagnostic and admin inspection.
   * Strips all secret values completely; provides masked representations for UI.
   */
  public getSafeConfig() {
    const mask = (val?: string) => {
      if (!val || val.trim().length === 0) return '';
      if (val.length <= 8) return '****';
      return `${val.substring(0, 4)}****${val.substring(val.length - 4)}`;
    };

    return {
      providerName: this.providerName,
      isConfigured: this.isConfigured,
      environment: this.config.environment,
      baseUrl: this.config.baseUrl,
      hasPublicKey: Boolean(this.config.publicKey && this.config.publicKey.length > 0),
      maskedPublicKey: mask(this.config.publicKey),
      hasSecretKey: Boolean(this.config.secretKey && this.config.secretKey.length > 0),
      maskedSecretKey: mask(this.config.secretKey),
      hasCallbackSecret: this.hasCallbackSecret,
      maskedCallbackSecret: mask(this.config.callbackSecret),
      callbackUrl: this.config.callbackUrl || '/api/webhooks/pluspesa',
      callbackUrlConfigured: Boolean(this.config.callbackUrl),
      hasWarning: !this.hasCallbackSecret,
      warningMessage: !this.hasCallbackSecret
        ? 'Ilani: HMAC Callback Secret haijawekwa — ukaguzi wa sahihi ya webhook hautafanyika (Warning: Webhook signature verification will be skipped without callback secret).'
        : null
    };
  }

  /**
   * Safe non-payment test connection check.
   * Tests configuration validity and API reachability without creating any customer collections.
   */
  public async testConnection(): Promise<{
    status: 'CONNECTED' | 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
    message: string;
    details?: any;
  }> {
    if (!this.config.publicKey || this.config.publicKey.trim().length === 0) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'Public Key haijawekwa (X-Public-Key is required).'
      };
    }
    if (!this.config.secretKey || this.config.secretKey.trim().length === 0) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'Secret Key haijawekwa (X-Secret-Key is required).'
      };
    }
    if (!this.config.baseUrl || !/^https?:\/\//i.test(this.config.baseUrl)) {
      return {
        status: 'CONFIGURATION_ERROR',
        message: 'Base URL si sahihi. Lazima ianze na https:// au http://.'
      };
    }

    const testEndpoint = `${this.config.baseUrl}/collections/test-connectivity-probe/status`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: {
          'X-Public-Key': this.config.publicKey,
          'X-Secret-Key': this.config.secretKey
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (response.status === 401 || response.status === 403) {
        return {
          status: 'AUTHENTICATION_ERROR',
          message: `Funguo za PlusPesa hazikukubaliwa (HTTP ${response.status} Unauthorized/Forbidden). Hakikisha Public Key na Secret Key ni sahihi.`
        };
      }

      if (response.status >= 500) {
        return {
          status: 'PROVIDER_ERROR',
          message: `Seva ya PlusPesa imerudisha hitilafu ya ndani (HTTP ${response.status}).`
        };
      }

      return {
        status: 'CONNECTED',
        message: 'Muunganisho na PlusPesa umefanikiwa kikamilifu (Connected to PlusPesa API).',
        details: {
          baseUrl: this.config.baseUrl,
          environment: this.config.environment,
          hasCallbackSecret: this.hasCallbackSecret
        }
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      return {
        status: 'NETWORK_ERROR',
        message: isAbort
          ? 'Muda wa kuunganisha na PlusPesa umekwisha (Network Timeout).'
          : `Hitilafu ya mtandao: ${err.message}`
      };
    }
  }

  /**
   * 1. CREATE COLLECTION:
   * Dispatches POST https://app.pluspesa.com/api/v1/collections
   * Sends only documented fields:
   * - account_number (customer phone)
   * - amount (integer)
   * - currency ("TZS")
   * - external_id (internal unique externalId e.g. UFU-PAY-...)
   * - customer_name (optional)
   * - customer_email (optional)
   * - callback_url (public HTTPS webhook URL)
   */
  public async createPaymentRequest(
    params: CreatePaymentRequestParams
  ): Promise<CreatePaymentRequestResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        providerReference: null,
        providerStatus: 'UNCONFIGURED',
        normalizedStatus: 'FAILED',
        errorMessage: 'Mtoa huduma wa PlusPesa hajasanidiwa kwenye seva (PlusPesa credentials missing on server). Weka PLUS_PESA_PUBLIC_KEY na PLUS_PESA_SECRET_KEY.',
        rawProviderResponse: {
          configured: false,
          environment: this.config.environment
        }
      };
    }

    const callbackUrl = params.callbackUrl || this.config.callbackUrl;

    // Documented request payload only — no invented fields
    const requestPayload: Record<string, any> = {
      account_number: params.customerPhone,
      amount: Math.round(params.amount),
      currency: params.currency || 'TZS',
      provider: params.providerNetwork || 'Mpesa',
      external_id: params.externalId
    };

    if (params.customerName) {
      requestPayload.customer_name = params.customerName;
    }
    if (params.customerEmail) {
      requestPayload.customer_email = params.customerEmail;
    }
    if (callbackUrl) {
      requestPayload.callback_url = callbackUrl;
    }

    const endpoint = `${this.config.baseUrl}/collections`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-Public-Key': this.config.publicKey!,
          'X-Secret-Key': this.config.secretKey!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });

      clearTimeout(timer);

      let responseJson: any = null;
      try {
        responseJson = await response.json();
      } catch (parseErr) {
        return {
          success: false,
          providerReference: null,
          providerStatus: 'NETWORK_PARSE_ERROR',
          normalizedStatus: 'FAILED',
          errorMessage: `Hitilafu ya majibu kutoka PlusPesa (Status ${response.status})`
        };
      }

      // Documented PlusPesa response structure:
      // {
      //   "success": true,
      //   "message": "...",
      //   "data": {
      //     "uuid": "...",
      //     "reference": "...",
      //     "status": "processing",
      //     "amount": 10000,
      //     "currency": "TZS",
      //     "provider": "Tigo",
      //     "external_id": "..."
      //   }
      // }
      if (!response.ok || !responseJson.success) {
        const errorMsg = responseJson?.message || `PlusPesa request failed (HTTP ${response.status})`;
        return {
          success: false,
          providerReference: responseJson?.data?.reference || null,
          providerUuid: responseJson?.data?.uuid || null,
          externalId: responseJson?.data?.external_id || params.externalId,
          providerStatus: responseJson?.data?.status || 'FAILED',
          normalizedStatus: 'FAILED',
          errorMessage: errorMsg,
          rawProviderResponse: responseJson
        };
      }

      const data = responseJson.data || {};
      const providerRef = data.reference || null;
      const providerUuid = data.uuid || null;
      const rawStatus = data.status || 'processing';
      const normalizedStatus = this.normalizeProviderStatus(rawStatus);

      return {
        success: true,
        providerReference: providerRef,
        providerUuid,
        externalId: data.external_id || params.externalId,
        providerStatus: rawStatus,
        // Documented acknowledgement status is normally 'processing'
        // CRITICAL BOUNDARY: NEVER activate Premium at this stage
        normalizedStatus: normalizedStatus === 'SUCCESS' ? 'PROCESSING' : normalizedStatus,
        paymentInstructions: 'Omba la malipo limetumwa kwenye simu yako. Ingiza PIN kukamilisha malipo.',
        rawProviderResponse: {
          uuid: data.uuid,
          reference: data.reference,
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          provider: data.provider,
          external_id: data.external_id
        }
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      return {
        success: false,
        providerReference: null,
        providerStatus: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        normalizedStatus: 'FAILED',
        errorMessage: isAbort 
          ? 'Muda wa kuunganisha na PlusPesa umekwisha (Payment gateway timeout).' 
          : `Hitilafu ya mtandao wakati wa kuwasiliana na PlusPesa: ${err.message}`
      };
    }
  }

  /**
   * 2. STATUS POLLING FALLBACK:
   * Dispatches GET https://app.pluspesa.com/api/v1/collections/{reference}/status
   * Headers:
   * - X-Public-Key
   * - X-Secret-Key
   * Response:
   * {
   *   "success": true,
   *   "message": "...",
   *   "data": {
   *     "uuid": "...",
   *     "reference": "...",
   *     "status": "success", // or "processing", "failed" (lowercase)
   *     "amount": 10000,
   *     "currency": "TZS",
   *     "provider": "Tigo",
   *     "external_id": "..."
   *   }
   * }
   */
  public async getPaymentStatus(
    providerReference: string
  ): Promise<ProviderPaymentStatusResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        providerReference,
        providerStatus: 'UNCONFIGURED',
        normalizedStatus: 'UNKNOWN',
        errorMessage: 'PlusPesa credentials not configured on server.'
      };
    }

    if (!providerReference || typeof providerReference !== 'string') {
      return {
        success: false,
        providerReference: '',
        providerStatus: 'INVALID_REFERENCE',
        normalizedStatus: 'UNKNOWN',
        errorMessage: 'Kumbukumbu ya malipo ya PlusPesa (reference) inahitajika.'
      };
    }

    const endpoint = `${this.config.baseUrl}/collections/${encodeURIComponent(providerReference)}/status`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'X-Public-Key': this.config.publicKey!,
          'X-Secret-Key': this.config.secretKey!
        },
        signal: controller.signal
      });

      clearTimeout(timer);

      let responseJson: any = null;
      try {
        responseJson = await response.json();
      } catch (parseErr) {
        return {
          success: false,
          providerReference,
          providerStatus: 'NETWORK_PARSE_ERROR',
          normalizedStatus: 'UNKNOWN',
          errorMessage: `Majibu ya PlusPesa status hayakuwa JSON sahihi (Status ${response.status})`
        };
      }

      if (!response.ok || !responseJson.success) {
        return {
          success: false,
          providerReference,
          providerStatus: responseJson?.data?.status || 'QUERY_FAILED',
          normalizedStatus: 'UNKNOWN',
          errorMessage: responseJson?.message || `Hitilafu ya kuulizia hali ya malipo (HTTP ${response.status})`,
          rawProviderResponse: responseJson
        };
      }

      const data = responseJson.data || {};
      const rawStatus = data.status || 'unknown';
      const normalizedStatus = this.normalizeProviderStatus(rawStatus);

      return {
        success: true,
        providerReference: data.reference || providerReference,
        providerUuid: data.uuid || null,
        externalId: data.external_id || null,
        providerStatus: rawStatus,
        normalizedStatus,
        amount: typeof data.amount === 'number' ? data.amount : undefined,
        currency: data.currency || 'TZS',
        rawProviderResponse: {
          uuid: data.uuid,
          reference: data.reference,
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          provider: data.provider,
          external_id: data.external_id
        }
      };
    } catch (err: any) {
      return {
        success: false,
        providerReference,
        providerStatus: 'ERROR',
        normalizedStatus: 'UNKNOWN',
        errorMessage: `Hitilafu ya kuulizia PlusPesa: ${err.message}`
      };
    }
  }

  /**
   * 3. AUTHORITATIVE WEBHOOK VERIFICATION:
   * Handles incoming webhook POST /api/ai/payment/webhook/pluspesa
   *
   * Verifies:
   * - HMAC-SHA256(rawRequestBody, PLUS_PESA_CALLBACK_SECRET) against X-PlusPesa-Signature
   * - Documented payload fields: uuid, reference, external_id, status, amount, currency, provider
   */
  public async verifyPaymentCallback(
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    rawBody?: any
  ): Promise<VerifyCallbackResult> {
    // A. Payload format check
    if (!payload || typeof payload !== 'object') {
      return {
        isValid: false,
        providerReference: null,
        internalPaymentId: null,
        providerStatus: 'INVALID_PAYLOAD',
        normalizedStatus: 'FAILED',
        errorMessage: 'Taarifa za webhook hazipo au si sahihi (Invalid or missing payload).'
      };
    }

    // B. Cryptographic Signature Verification (When callback secret is configured)
    if (this.hasCallbackSecret) {
      const signatureHeader = this.findHeaderValue(headers, 'x-pluspesa-signature');
      if (!signatureHeader) {
        return {
          isValid: false,
          providerReference: this.extractProviderReference(payload),
          internalPaymentId: null,
          externalId: payload.external_id || null,
          providerStatus: 'MISSING_SIGNATURE',
          normalizedStatus: 'FAILED',
          errorMessage: 'Webhook ya PlusPesa haina kichwa cha sahihi (Missing X-PlusPesa-Signature header).'
        };
      }

      if (!rawBody) {
        return {
          isValid: false,
          providerReference: this.extractProviderReference(payload),
          internalPaymentId: null,
          externalId: payload.external_id || null,
          providerStatus: 'MISSING_RAW_BODY',
          normalizedStatus: 'FAILED',
          errorMessage: 'Mwili ghafi wa ombi (raw body) haukuhifadhiwa kwa ukaguzi wa sahihi.'
        };
      }

      const nodeCrypto = getNodeCrypto();
      const nodeBuffer = getNodeBuffer();
      if (!nodeCrypto || !nodeBuffer) {
        return {
          isValid: false,
          providerReference: this.extractProviderReference(payload),
          internalPaymentId: null,
          externalId: payload.external_id || null,
          providerStatus: 'ENVIRONMENT_UNSUPPORTED',
          normalizedStatus: 'FAILED',
          errorMessage: 'Mazingira ya crypto hayapo kwa ajili ya ukaguzi wa webhook.'
        };
      }

      const secret = this.config.callbackSecret!;
      const hmac = nodeCrypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const computedDigest = hmac.digest('hex');
      const receivedSignature = String(signatureHeader).trim();

      // Constant-time comparison to prevent timing attacks
      const isSignatureValid = 
        computedDigest.length === receivedSignature.length &&
        nodeCrypto.timingSafeEqual(nodeBuffer.from(computedDigest, 'utf8'), nodeBuffer.from(receivedSignature, 'utf8'));

      if (!isSignatureValid) {
        return {
          isValid: false,
          providerReference: this.extractProviderReference(payload),
          internalPaymentId: null,
          externalId: payload.external_id || null,
          providerStatus: 'SIGNATURE_MISMATCH',
          normalizedStatus: 'FAILED',
          errorMessage: 'Sahihi ya webhook ya PlusPesa haikulingana (X-PlusPesa-Signature mismatch).'
        };
      }
    }

    // C. Documented Field Validation (supports flat and nested data structures)
    const effectivePayload = (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object')
      ? payload.data
      : payload;

    const externalId = typeof effectivePayload.external_id === 'string' ? effectivePayload.external_id.trim() : null;
    const providerReference = typeof effectivePayload.reference === 'string' ? effectivePayload.reference.trim() : null;
    const rawStatus = typeof effectivePayload.status === 'string' ? effectivePayload.status.trim() : 'UNKNOWN';
    const amount = typeof effectivePayload.amount === 'number' ? effectivePayload.amount : Number(effectivePayload.amount);
    const currency = typeof effectivePayload.currency === 'string' ? effectivePayload.currency.trim().toUpperCase() : 'TZS';
    const providerUuid = typeof effectivePayload.uuid === 'string' ? effectivePayload.uuid.trim() : null;

    if (!externalId) {
      return {
        isValid: false,
        providerReference,
        internalPaymentId: null,
        externalId: null,
        providerStatus: rawStatus,
        normalizedStatus: 'FAILED',
        errorMessage: 'Kipengele cha external_id hakikupatikana kwenye webhook.'
      };
    }

    if (!providerReference) {
      return {
        isValid: false,
        providerReference: null,
        internalPaymentId: null,
        externalId,
        providerStatus: rawStatus,
        normalizedStatus: 'FAILED',
        errorMessage: 'Kipengele cha reference hakikupatikana kwenye webhook.'
      };
    }

    if (isNaN(amount) || amount <= 0) {
      return {
        isValid: false,
        providerReference,
        internalPaymentId: null,
        externalId,
        providerStatus: rawStatus,
        normalizedStatus: 'FAILED',
        errorMessage: 'Kiasi cha malipo kwenye webhook si sahihi (Invalid amount).'
      };
    }

    const normalizedStatus = this.normalizeProviderStatus(rawStatus);

    return {
      isValid: true,
      providerReference,
      providerUuid: providerUuid || null,
      externalId,
      internalPaymentId: null, // Will be resolved by external_id in PaymentService
      providerStatus: rawStatus,
      normalizedStatus,
      amount,
      currency,
      failureReason: normalizedStatus === 'FAILED' ? (effectivePayload.message || 'PlusPesa payment failed') : undefined,
      rawPayload: {
        uuid: effectivePayload.uuid,
        reference: effectivePayload.reference,
        external_id: effectivePayload.external_id,
        status: effectivePayload.status,
        amount: effectivePayload.amount,
        currency: effectivePayload.currency,
        provider: effectivePayload.provider
      }
    };
  }

  /**
   * Helper to look up headers case-insensitively.
   */
  private findHeaderValue(
    headers?: Record<string, string | string[] | undefined>,
    targetHeader: string = 'x-pluspesa-signature'
  ): string | null {
    if (!headers) return null;
    const lowerTarget = targetHeader.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lowerTarget) {
        const val = headers[key];
        if (Array.isArray(val)) return val[0] || null;
        return typeof val === 'string' ? val : null;
      }
    }
    return null;
  }

  /**
   * Normalized status mapping according to PlusPesa docs:
   * Webhook uppercase: SUCCESS, FAILED
   * Polling lowercase: processing, success, failed
   */
  public normalizeProviderStatus(providerStatus: string): PaymentStatus {
    if (!providerStatus) return 'UNKNOWN';
    const normalized = String(providerStatus).toUpperCase().trim();

    switch (normalized) {
      case 'SUCCESS':
      case 'COMPLETED':
      case 'PAID':
        return 'SUCCESS';
      case 'PROCESSING':
      case 'IN_PROGRESS':
        return 'PROCESSING';
      case 'FAILED':
      case 'DECLINED':
      case 'REJECTED':
        return 'FAILED';
      case 'CANCELLED':
      case 'CANCELED':
        return 'CANCELLED';
      case 'EXPIRED':
      case 'TIMED_OUT':
      case 'TIMEOUT':
        return 'EXPIRED';
      case 'PENDING':
      case 'SUBMITTED':
      case 'INITIATED':
        return 'PENDING';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Extracts external provider reference.
   */
  public extractProviderReference(payload: any): string | null {
    if (!payload || typeof payload !== 'object') return null;
    return (
      payload.reference ||
      payload.providerReference ||
      payload.transactionReference ||
      payload.uuid ||
      null
    );
  }

  /**
   * Validates structural integrity of PlusPesa responses.
   */
  public validateProviderResponse(response: any): boolean {
    return Boolean(
      response &&
      typeof response === 'object' &&
      typeof response.success === 'boolean'
    );
  }
}
