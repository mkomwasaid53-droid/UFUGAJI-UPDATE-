/// <reference types="node" />
/**
 * V1.8D — Mock Payment Provider Adapter (Development & Test Only)
 *
 * Provides deterministic simulation of:
 * - SUCCESS
 * - FAILED
 * - PENDING
 * - CANCELLED
 * - EXPIRED
 * - Duplicate callback
 * - Invalid callback
 *
 * STRICT BOUNDARY:
 * This provider is isolated for development and automated tests.
 * It is never confused with real PlusPesa provider confirmation.
 */

import type { Buffer } from 'node:buffer';
import {
  PaymentProvider,
  CreatePaymentRequestParams,
  CreatePaymentRequestResult,
  ProviderPaymentStatusResult,
  VerifyCallbackResult
} from './paymentProviderInterface';
import { PaymentStatus } from '../../types/aiUsageAndCache';

export class MockPaymentProvider implements PaymentProvider {
  public readonly providerName = 'MOCK_PROVIDER';
  public readonly isConfigured = true;

  // Configurable outcome for deterministic test assertions
  private nextStatus: PaymentStatus = 'PENDING';
  private shouldFailVerification = false;
  private recordedTransactions: Map<string, { status: PaymentStatus; amount: number; currency: string }> = new Map();

  /**
   * Set deterministic outcome for subsequent requests.
   */
  public setNextStatus(status: PaymentStatus): void {
    this.nextStatus = status;
  }

  /**
   * Set whether subsequent callback verifications should fail validation.
   */
  public setVerificationFailure(shouldFail: boolean): void {
    this.shouldFailVerification = shouldFail;
  }

  /**
   * Resets mock state.
   */
  public reset(): void {
    this.nextStatus = 'PENDING';
    this.shouldFailVerification = false;
    this.recordedTransactions.clear();
  }

  public async createPaymentRequest(
    params: CreatePaymentRequestParams
  ): Promise<CreatePaymentRequestResult> {
    const mockRef = `mock_tx_${params.paymentId}_${Date.now()}`;
    const initialStatus = this.nextStatus;

    this.recordedTransactions.set(mockRef, {
      status: initialStatus,
      amount: params.amount,
      currency: params.currency
    });

    return {
      success: true,
      providerReference: mockRef,
      providerStatus: initialStatus,
      normalizedStatus: initialStatus,
      checkoutUrl: `https://test-payment.ufugaji.local/checkout/${mockRef}`,
      paymentInstructions: `Lipa TSh ${params.amount.toLocaleString()} kwenda namba ya kampuni 998877 kwa kumbukumbu: ${params.paymentId}`,
      rawProviderResponse: {
        mock: true,
        reference: mockRef,
        status: initialStatus,
        createdAt: new Date().toISOString()
      }
    };
  }

  public async getPaymentStatus(
    providerReference: string
  ): Promise<ProviderPaymentStatusResult> {
    const tx = this.recordedTransactions.get(providerReference);
    if (!tx) {
      return {
        success: false,
        providerReference,
        providerStatus: 'NOT_FOUND',
        normalizedStatus: 'UNKNOWN',
        errorMessage: 'Mock transaction not found'
      };
    }

    const effectiveStatus = (this.nextStatus && this.nextStatus !== 'PENDING') ? this.nextStatus : tx.status;

    return {
      success: true,
      providerReference,
      providerStatus: effectiveStatus,
      normalizedStatus: effectiveStatus,
      amount: tx.amount,
      currency: tx.currency,
      rawProviderResponse: {
        mock: true,
        status: effectiveStatus
      }
    };
  }

  public setTransactionStatus(providerReference: string, status: PaymentStatus): void {
    const tx = this.recordedTransactions.get(providerReference);
    if (tx) {
      tx.status = status;
    } else {
      this.recordedTransactions.set(providerReference, {
        status,
        amount: 1000,
        currency: 'TZS'
      });
    }
  }


  public async verifyPaymentCallback(
    payload: any,
    _headers?: Record<string, string | string[] | undefined>,
    _rawBody?: Buffer | string
  ): Promise<VerifyCallbackResult> {
    if (this.shouldFailVerification) {
      return {
        isValid: false,
        providerReference: payload?.providerReference || null,
        internalPaymentId: payload?.paymentId || null,
        providerStatus: 'SIGNATURE_VERIFICATION_FAILED',
        normalizedStatus: 'FAILED',
        errorMessage: 'Mock signature verification rejected callback'
      };
    }

    if (!payload || typeof payload !== 'object') {
      return {
        isValid: false,
        providerReference: null,
        internalPaymentId: null,
        providerStatus: 'INVALID_PAYLOAD',
        normalizedStatus: 'FAILED',
        errorMessage: 'Missing payload object'
      };
    }

    const effectivePayload = (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object')
      ? payload.data
      : payload;

    const providerReference = this.extractProviderReference(effectivePayload);
    const internalPaymentId = effectivePayload.paymentId || effectivePayload.internalPaymentId || null;
    const externalId = effectivePayload.external_id || effectivePayload.externalId || null;
    const rawStatus = String(effectivePayload.status || 'PENDING');
    const normalizedStatus = this.normalizeProviderStatus(rawStatus);

    return {
      isValid: Boolean(providerReference || internalPaymentId || externalId),
      providerReference,
      internalPaymentId,
      externalId,
      providerStatus: rawStatus,
      normalizedStatus,
      amount: typeof effectivePayload.amount === 'number' ? effectivePayload.amount : (effectivePayload.amount ? Number(effectivePayload.amount) : undefined),
      currency: effectivePayload.currency || 'TZS',
      rawPayload: payload
    };
  }


  public normalizeProviderStatus(providerStatus: string): PaymentStatus {
    const s = String(providerStatus).toUpperCase().trim();
    if (s === 'SUCCESS' || s === 'PAID') return 'SUCCESS';
    if (s === 'PROCESSING') return 'PROCESSING';
    if (s === 'FAILED') return 'FAILED';
    if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
    if (s === 'EXPIRED') return 'EXPIRED';
    if (s === 'PENDING') return 'PENDING';
    return 'UNKNOWN';
  }

  public extractProviderReference(payload: any): string | null {
    if (!payload || typeof payload !== 'object') return null;
    return payload.providerReference || payload.reference || payload.id || null;
  }

  public validateProviderResponse(response: any): boolean {
    return Boolean(response && typeof response === 'object' && response.mock === true);
  }
}
