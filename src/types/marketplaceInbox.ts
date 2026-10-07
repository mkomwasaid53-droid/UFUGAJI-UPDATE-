/**
 * Marketplace Inbox Data Models (V1.11B)
 * Governed communication connecting Buyer <-> Seller <-> Product/Listing
 */

export type ConversationStatus = 'ACTIVE' | 'CLOSED' | 'BLOCKED';

export type MessageSenderRole = 'BUYER' | 'SELLER';

export type MessageType = 'TEXT';

export interface MarketplaceConversation {
  conversationId: string;
  buyerUserId: string;
  sellerUserId: string;
  shopId: string;
  productId: string;
  listingId: string;
  productTitleSnapshot: string;
  listingTitleSnapshot: string;
  categoryId: string;
  status: ConversationStatus;
  lastMessage: string;
  lastMessageAt: string;
  buyerUnreadCount: number;
  sellerUnreadCount: number;
  priceSnapshot?: number;
  currencySnapshot?: string;
  imageUrlSnapshot?: string;
  sellerNameSnapshot?: string;
  buyerNameSnapshot?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceMessage {
  messageId: string;
  conversationId: string;
  senderUserId: string;
  senderRole: MessageSenderRole;
  text: string;
  messageType: MessageType;
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
}

export interface CreateConversationInput {
  buyerUserId: string;
  sellerUserId: string;
  shopId: string;
  productId: string;
  listingId: string;
  productTitleSnapshot?: string;
  listingTitleSnapshot?: string;
  categoryId?: string;
  priceSnapshot?: number;
  currencySnapshot?: string;
  imageUrlSnapshot?: string;
  sellerNameSnapshot?: string;
  buyerNameSnapshot?: string;
  initialMessageText?: string;
}

export interface SendMessageInput {
  conversationId: string;
  senderUserId: string;
  text: string;
  messageType?: MessageType;
}

