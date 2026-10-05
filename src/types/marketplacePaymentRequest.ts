/**
 * Marketplace Payment Request Types (V1.11C)
 *
 * Governed commercial payment requests created by Verified Sellers
 * inside Marketplace Inbox conversations, connecting:
 * Buyer <-> Seller <-> Shop <-> Product/Listing <-> Conversation
 */

export type MarketplacePaymentRequestStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface MarketplacePaymentRequestConfig {
  minAmount: number;
  maxAmount: number;
  defaultCurrency: 'TZS';
  defaultExpiryHours: number;
  paymentPrefix: string;
}

export const MARKETPLACE_PAYMENT_CONFIG: MarketplacePaymentRequestConfig = {
  minAmount: 500, // 500 TZS minimum
  maxAmount: 50_000_000, // 50,000,000 TZS safety cap
  defaultCurrency: 'TZS',
  defaultExpiryHours: 72, // 3 days expiry
  paymentPrefix: 'UFUGAJI_MARKETPLACE_PAYMENT_'
};

export interface MarketplacePaymentRequest {
  paymentRequestId: string;
  conversationId: string;
  buyerUserId: string;
  sellerUserId: string;
  shopId: string;
  productId: string;
  listingId: string;

  // Authoritative commercial fields
  amount: number;
  currency: 'TZS';
  description?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;

  // Display snapshots (for immutability and historical record)
  productTitleSnapshot: string;
  listingTitleSnapshot: string;
  sellerNameSnapshot: string;
  buyerNameSnapshot: string;
  productImageUrlSnapshot?: string;

  // Lifecycle
  status: MarketplacePaymentRequestStatus;

  // Provider tracking & references
  paymentReference?: string | null;
  externalPaymentId?: string;
  paidAt?: string | null;
  failureReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  expiresAt: string;

  createdAt: string;
  updatedAt: string;
}

export type PaymentRequestAuditEventType =
  | 'PAYMENT_REQUEST_CREATED'
  | 'PAYMENT_REQUEST_SUBMITTED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_RETRY';

export interface MarketplacePaymentRequestAudit {
  auditId: string;
  paymentRequestId: string;
  conversationId: string;
  eventType: PaymentRequestAuditEventType;
  actorUserId: string;
  actorRole: 'BUYER' | 'SELLER' | 'SYSTEM' | 'ADMIN';
  previousStatus?: MarketplacePaymentRequestStatus;
  newStatus: MarketplacePaymentRequestStatus;
  amount: number;
  currency: 'TZS';
  providerReference?: string | null;
  externalId?: string | null;
  timestamp: string;
  notes?: string;
}

export interface CreatePaymentRequestInput {
  conversationId: string;
  quantity: number;
  unitPrice: number;
  description?: string;
}

export interface InitiateMarketplacePaymentInput {
  paymentRequestId: string;
  buyerPhone: string;
  providerNetwork?: string; // Mpesa | Tigo | Airtel | Halopesa | Azampesa
}

export interface InitiateMarketplacePaymentResult {
  success: boolean;
  status: MarketplacePaymentRequestStatus;
  paymentRequestId: string;
  externalId: string;
  providerReference: string | null;
  checkoutUrl?: string | null;
  instructions: string;
  errorMessage?: string | null;
}
