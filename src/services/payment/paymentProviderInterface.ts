/// <reference types="node" />
/**
 * V1.8D — Payment Provider Abstraction Layer
 *
 * Provider-neutral interface and data contracts for integrating payment gateways.
 * Decouples the application, AI Assistant, and Entitlement engine from provider-specific logic.
 */

import type { Buffer } from 'node:buffer';
import { PaymentStatus } from '../../types/aiUsageAndCache';

export interface CreatePaymentRequestParams {
  paymentId: string;
  externalId: string; // Unique internal externalId (e.g. UFU-PAY-...)
  paymentIntentId: string;
  userId: string;
  customerName?: string;
  planId: string;
  amount: number;
  currency: string;
  customerPhone?: string;
  providerNetwork?: string; // Mpesa | Tigo | Airtel | Halopesa | Azampesa
  customerEmail?: string;
  description: string;
  callbackUrl?: string;
  returnUrl?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentRequestResult {
  success: boolean;
  providerReference: string | null;
  providerUuid?: string | null;
  externalId?: string | null;
  providerStatus: string;
  normalizedStatus: PaymentStatus;
  checkoutUrl?: string | null;
  paymentInstructions?: string | null;
  rawProviderResponse?: Record<string, any>;
  errorMessage?: string | null;
}

export interface ProviderPaymentStatusResult {
  success: boolean;
  providerReference: string;
  providerUuid?: string | null;
  externalId?: string | null;
  providerStatus: string;
  normalizedStatus: PaymentStatus;
  amount?: number;
  currency?: string;
  rawProviderResponse?: Record<string, any>;
  errorMessage?: string | null;
}

export interface VerifyCallbackResult {
  isValid: boolean;
  isDuplicate?: boolean;
  providerReference: string | null;
  providerUuid?: string | null;
  externalId?: string | null;
  internalPaymentId: string | null;
  providerStatus: string;
  normalizedStatus: PaymentStatus;
  amount?: number;
  currency?: string;
  failureReason?: string | null;
  rawPayload?: Record<string, any>;
  errorMessage?: string | null;
}

/**
 * Core interface required for all payment providers.
 */
export interface PaymentProvider {
  readonly providerName: string;
  readonly isConfigured: boolean;

  /**
   * Initiates a payment request with the external provider.
   */
  createPaymentRequest(
    params: CreatePaymentRequestParams
  ): Promise<CreatePaymentRequestResult>;

  /**
   * Fetches the current payment status directly from the external provider.
   */
  getPaymentStatus(
    providerReference: string
  ): Promise<ProviderPaymentStatusResult>;

  /**
   * Validates and verifies an incoming HTTP callback / webhook from the provider.
   */
  verifyPaymentCallback(
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    rawBody?: Buffer | string
  ): Promise<VerifyCallbackResult>;

  /**
   * Maps provider-specific status strings to our neutral PaymentStatus enum.
   */
  normalizeProviderStatus(providerStatus: string): PaymentStatus;

  /**
   * Extracts the external provider transaction reference from a payload or response.
   */
  extractProviderReference(payload: any): string | null;

  /**
   * Validates if a raw response from the provider is structurally sound and uncorrupted.
   */
  validateProviderResponse(response: any): boolean;

  /**
   * Safe configuration snapshot without secrets.
   */
  getSafeConfig?(): Record<string, any>;

  /**
   * Updates provider configuration at runtime (Admin panel).
   */
  updateConfig?(newConfig: Record<string, any>): void;

  /**
   * Safe non-payment test connection check.
   */
  testConnection?(): Promise<{
    status: 'CONNECTED' | 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
    message: string;
    details?: any;
  }>;
}
