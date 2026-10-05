/**
 * Marketplace Inbox Service (V1.11B)
 * Authoritative, secure, persistent communication connecting:
 * BUYER <-> SELLER <-> PRODUCT/LISTING
 */

import {
  MarketplaceConversation,
  MarketplaceMessage,
  CreateConversationInput,
  SendMessageInput,
  ConversationStatus
} from '../types/marketplaceInbox';
import { MarketplaceProduct } from '../types/marketplace';
import { fetchProductById } from './marketplaceService';
import { sellerMonetizationService } from './sellerMonetizationService';
import { createAuthoritativeNotification } from './notificationService';

const isNode = typeof window === 'undefined' || !window.location || !window.location.origin;

// LocalStorage cache keys for browser environment
const LOCAL_CONVERSATIONS_KEY = 'ufugaji_marketplace_conversations';
const LOCAL_MESSAGES_KEY = 'ufugaji_marketplace_messages';

// Disk persistence file paths (Node.js runtime)
let diskFs: any = null;
let diskPath: any = null;
let CONVERSATIONS_FILE = 'data/marketplace_conversations.json';
let MESSAGES_FILE = 'data/marketplace_messages.json';

// In-memory data stores
const conversationsStore = new Map<string, MarketplaceConversation>();
const messagesStore = new Map<string, MarketplaceMessage[]>(); // conversationId -> messages[]

/**
 * Initialize server / disk storage for persistent Node.js execution and automated tests.
 */
export function initInboxStorage(fsModule?: any, pathModule?: any, customDir?: string): void {
  if (fsModule && pathModule) {
    diskFs = fsModule;
    diskPath = pathModule;
  } else if (isNode) {
    try {
      diskFs = require('fs');
      diskPath = require('path');
    } catch {
      // Ignore if dynamic require fails in bundler
    }
  }

  const baseDir = customDir || (diskPath ? diskPath.join(process.cwd(), 'data') : 'data');
  CONVERSATIONS_FILE = diskPath ? diskPath.join(baseDir, 'marketplace_conversations.json') : `${baseDir}/marketplace_conversations.json`;
  MESSAGES_FILE = diskPath ? diskPath.join(baseDir, 'marketplace_messages.json') : `${baseDir}/marketplace_messages.json`;

  loadInboxFromDisk();
}

// Auto-initialize if in Node
if (isNode) {
  try {
    initInboxStorage();
  } catch {}
}

function loadInboxFromDisk(): void {
  if (!diskFs || !diskFs.existsSync) return;
  try {
    if (diskFs.existsSync(CONVERSATIONS_FILE)) {
      const raw = diskFs.readFileSync(CONVERSATIONS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        conversationsStore.clear();
        for (const item of list) {
          if (item && item.conversationId) {
            conversationsStore.set(item.conversationId, item);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[marketplaceInboxService] Failed reading conversations from disk:', err);
  }

  try {
    if (diskFs.existsSync(MESSAGES_FILE)) {
      const raw = diskFs.readFileSync(MESSAGES_FILE, 'utf-8');
      const mapObj = JSON.parse(raw);
      if (mapObj && typeof mapObj === 'object') {
        messagesStore.clear();
        for (const [convId, msgs] of Object.entries(mapObj)) {
          if (Array.isArray(msgs)) {
            messagesStore.set(convId, msgs);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[marketplaceInboxService] Failed reading messages from disk:', err);
  }
}

function saveInboxToDisk(): void {
  if (!diskFs || !diskFs.writeFileSync) return;
  try {
    const dir = diskPath ? diskPath.dirname(CONVERSATIONS_FILE) : 'data';
    if (!diskFs.existsSync(dir)) {
      diskFs.mkdirSync(dir, { recursive: true });
    }
    const convList = Array.from(conversationsStore.values());
    diskFs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(convList, null, 2), 'utf-8');

    const msgObj: Record<string, MarketplaceMessage[]> = {};
    for (const [convId, msgs] of messagesStore.entries()) {
      msgObj[convId] = msgs;
    }
    diskFs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgObj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[marketplaceInboxService] Failed writing inbox to disk:', err);
  }
}

function getBrowserConversations(): MarketplaceConversation[] {
  if (typeof localStorage === 'undefined') return Array.from(conversationsStore.values());
  try {
    const raw = localStorage.getItem(LOCAL_CONVERSATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveBrowserConversations(list: MarketplaceConversation[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(list));
  } catch {}
}

function getBrowserMessages(conversationId: string): MarketplaceMessage[] {
  if (typeof localStorage === 'undefined') return messagesStore.get(conversationId) || [];
  try {
    const raw = localStorage.getItem(`${LOCAL_MESSAGES_KEY}_${conversationId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveBrowserMessages(conversationId: string, msgs: MarketplaceMessage[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_MESSAGES_KEY}_${conversationId}`, JSON.stringify(msgs));
  } catch {}
}

export class MarketplaceInboxService {
  /**
   * Reset all in-memory and disk/local cache for clean testing.
   */
  public _resetInboxForTesting(): void {
    conversationsStore.clear();
    messagesStore.clear();
    if (diskFs && diskFs.existsSync) {
      try {
        if (diskFs.existsSync(CONVERSATIONS_FILE)) diskFs.unlinkSync(CONVERSATIONS_FILE);
        if (diskFs.existsSync(MESSAGES_FILE)) diskFs.unlinkSync(MESSAGES_FILE);
      } catch {}
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(LOCAL_CONVERSATIONS_KEY);
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LOCAL_MESSAGES_KEY)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
  }

  /**
   * 1. GET OR CREATE CONVERSATION (Idempotent, Governed)
   * Connects: BUYER <-> SELLER <-> PRODUCT/LISTING
   */
  public async getOrCreateConversation(
    input: CreateConversationInput,
    callerUserId: string,
    injectedProduct?: MarketplaceProduct
  ): Promise<{ conversation: MarketplaceConversation; isNew: boolean }> {
    if (!callerUserId || callerUserId.trim() === '') {
      throw new Error('Hujaingia kwenye mfumo. Tafadhali ingia ili uweze kuwasiliana na muuzaji.');
    }

    if (callerUserId !== input.buyerUserId) {
      throw new Error('Huruhusiwi kuanzisha mazungumzo kwa niaba ya mtumiaji mwingine.');
    }

    if (input.buyerUserId === input.sellerUserId) {
      throw new Error('Huwezi kuanzisha mazungumzo na wewe mwenyewe (Self-inquiry is not allowed).');
    }

    // 1. Resolve and Validate Product / Listing Governance
    let product: MarketplaceProduct | null = injectedProduct || null;
    if (!product && input.productId) {
      try {
        product = await fetchProductById(input.productId);
      } catch (err) {
        console.warn('Notice fetching product:', err);
      }
    }

    if (product) {
      // Validate Moderation Status: Ineligible listings cannot start new inquiries
      if (['REJECTED', 'HIDDEN', 'SUSPENDED', 'UNDER_REVIEW'].includes(product.moderationStatus || '')) {
        throw new Error(
          `Tangazo hili haliruhusiwi kwa sasa (${product.moderationStatus}). Huwezi kuanzisha mawasiliano mapya.`
        );
      }
      if (product.status === 'draft') {
        throw new Error('Tangazo hili lipo kwenye rasimu (draft) na halijachapishwa kwa umma.');
      }
      // Validate Seller Commercial Access
      if (product.sellerId) {
        const monetization = sellerMonetizationService.canSellerSellOnMarketplace(product.sellerId);
        if (!monetization.canSell) {
          throw new Error(
            `Mawasiliano na muuzaji huyu yamesitishwa kwa muda: ${monetization.reasonSwahili}`
          );
        }
      }
    }

    const listingId = input.listingId || input.productId;

    // 2. Idempotency Check: Existing Active conversation for same (buyerUserId, sellerUserId, listingId)
    // Synchronize stores
    if (isNode) loadInboxFromDisk();

    const allConversations = isNode
      ? Array.from(conversationsStore.values())
      : getBrowserConversations();

    const existing = allConversations.find(
      (c) =>
        c.buyerUserId === input.buyerUserId &&
        c.sellerUserId === input.sellerUserId &&
        (c.listingId === listingId || c.productId === input.productId) &&
        c.status === 'ACTIVE'
    );

    if (existing) {
      // Reuse existing active conversation
      return { conversation: existing, isNew: false };
    }

    // 3. Create New Authoritative Conversation
    const now = new Date().toISOString();
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const newConversation: MarketplaceConversation = {
      conversationId,
      buyerUserId: input.buyerUserId,
      sellerUserId: input.sellerUserId,
      shopId: input.shopId || product?.shopId || input.sellerUserId,
      productId: input.productId,
      listingId,
      productTitleSnapshot:
        input.productTitleSnapshot || product?.title || 'Bidhaa ya Gulio',
      listingTitleSnapshot:
        input.listingTitleSnapshot || product?.title || 'Tangazo la Gulio',
      categoryId: input.categoryId || product?.category || 'Mifugo',
      status: 'ACTIVE',
      lastMessage: input.initialMessageText ? input.initialMessageText.trim().slice(0, 100) : '',
      lastMessageAt: input.initialMessageText ? now : now,
      buyerUnreadCount: 0,
      sellerUnreadCount: input.initialMessageText ? 1 : 0,
      priceSnapshot: input.priceSnapshot ?? product?.price,
      currencySnapshot: input.currencySnapshot || product?.currency || 'Tsh',
      imageUrlSnapshot: input.imageUrlSnapshot || product?.imageUrl || '',
      sellerNameSnapshot:
        input.sellerNameSnapshot || product?.sellerBusinessName || product?.sellerName || 'Muuzaji',
      buyerNameSnapshot: input.buyerNameSnapshot || 'Mnunuzi',
      createdAt: now,
      updatedAt: now,
    };

    // Save conversation
    conversationsStore.set(conversationId, newConversation);
    messagesStore.set(conversationId, []);

    if (isNode) {
      saveInboxToDisk();
    } else {
      const list = getBrowserConversations();
      list.unshift(newConversation);
      saveBrowserConversations(list);
      saveBrowserMessages(conversationId, []);
    }

    // If initial message provided, save initial message
    if (input.initialMessageText && input.initialMessageText.trim()) {
      await this.sendMessage(
        {
          conversationId,
          senderUserId: input.buyerUserId,
          text: input.initialMessageText.trim(),
        },
        callerUserId
      );
    }

    return { conversation: conversationsStore.get(conversationId) || newConversation, isNew: true };
  }

  /**
   * 2. GET CONVERSATION BY ID (Participant Authorized)
   */
  public async getConversationById(
    conversationId: string,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplaceConversation | null> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');
    if (isNode) loadInboxFromDisk();

    const conv = isNode
      ? conversationsStore.get(conversationId)
      : getBrowserConversations().find((c) => c.conversationId === conversationId);

    if (!conv) return null;

    if (!isAdmin && conv.buyerUserId !== callerUserId && conv.sellerUserId !== callerUserId) {
      throw new Error('Huruhusiwi kuona mazungumzo haya (Access Forbidden).');
    }

    return conv;
  }

  /**
   * 3. GET CONVERSATIONS FOR USER (Scoped Query)
   * Scoped to either Buyer or Seller or both.
   */
  public async getConversationsForUser(
    userId: string,
    role?: 'BUYER' | 'SELLER'
  ): Promise<MarketplaceConversation[]> {
    if (!userId) return [];
    if (isNode) loadInboxFromDisk();

    const all = isNode ? Array.from(conversationsStore.values()) : getBrowserConversations();

    const filtered = all.filter((c) => {
      if (role === 'BUYER') return c.buyerUserId === userId;
      if (role === 'SELLER') return c.sellerUserId === userId;
      return c.buyerUserId === userId || c.sellerUserId === userId;
    });

    filtered.sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime());
    return filtered;
  }

  /**
   * 4. GET MESSAGES FOR CONVERSATION (Participant Authorized)
   */
  public async getMessagesForConversation(
    conversationId: string,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplaceMessage[]> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');
    const conv = await this.getConversationById(conversationId, callerUserId, isAdmin);
    if (!conv) throw new Error('Mazungumzo hayajapatikana.');

    if (isNode) loadInboxFromDisk();

    const msgs = isNode
      ? messagesStore.get(conversationId) || []
      : getBrowserMessages(conversationId);

    return [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * 5. SEND MESSAGE (Authoritative Validation & Notification)
   */
  public async sendMessage(
    input: SendMessageInput,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplaceMessage> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');
    if (callerUserId !== input.senderUserId && !isAdmin) {
      throw new Error('Huruhusiwi kutuma ujumbe kwa niaba ya mtumiaji mwingine.');
    }

    if (isNode) loadInboxFromDisk();

    const conv = isNode
      ? conversationsStore.get(input.conversationId)
      : getBrowserConversations().find((c) => c.conversationId === input.conversationId);

    if (!conv) {
      throw new Error('Mazungumzo hayajapatikana.');
    }

    if (!isAdmin && conv.buyerUserId !== callerUserId && conv.sellerUserId !== callerUserId) {
      throw new Error('Huruhusiwi kushiriki kwenye mazungumzo haya.');
    }

    if (conv.status === 'BLOCKED') {
      throw new Error('Mazungumzo haya yamezuiwa (BLOCKED). Huwezi kutuma ujumbe.');
    }

    const cleanText = (input.text || '').trim();
    if (!cleanText) {
      throw new Error('Ujumbe hauwezi kuwa mtupu.');
    }

    if (cleanText.length > 2000) {
      throw new Error('Ujumbe ni mrefu mno. Kiwango cha juu ni herufi 2,000.');
    }

    const senderRole = callerUserId === conv.buyerUserId ? 'BUYER' : 'SELLER';
    const recipientUserId = senderRole === 'BUYER' ? conv.sellerUserId : conv.buyerUserId;

    const now = new Date().toISOString();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const message: MarketplaceMessage = {
      messageId,
      conversationId: input.conversationId,
      senderUserId: callerUserId,
      senderRole,
      text: cleanText,
      messageType: input.messageType || 'TEXT',
      paymentRequestId: input.paymentRequestId,
      paymentRequestSnapshot: input.paymentRequestSnapshot,
      createdAt: now,
      readAt: null,
      deletedAt: null,
    };

    // Update conversation metadata
    conv.lastMessage = cleanText.slice(0, 100);
    conv.lastMessageAt = now;
    conv.updatedAt = now;
    if (senderRole === 'BUYER') {
      conv.sellerUnreadCount = (conv.sellerUnreadCount || 0) + 1;
    } else {
      conv.buyerUnreadCount = (conv.buyerUnreadCount || 0) + 1;
    }

    // Persist message & conversation
    if (isNode) {
      const existingMsgs = messagesStore.get(input.conversationId) || [];
      existingMsgs.push(message);
      messagesStore.set(input.conversationId, existingMsgs);
      conversationsStore.set(input.conversationId, conv);
      saveInboxToDisk();
    } else {
      const browserMsgs = getBrowserMessages(input.conversationId);
      browserMsgs.push(message);
      saveBrowserMessages(input.conversationId, browserMsgs);

      const convs = getBrowserConversations();
      const idx = convs.findIndex((c) => c.conversationId === input.conversationId);
      if (idx >= 0) {
        convs[idx] = conv;
      } else {
        convs.unshift(conv);
      }
      saveBrowserConversations(convs);
    }

    // Dispatch notification to recipient
    try {
      const safePreview = cleanText.length > 60 ? `${cleanText.slice(0, 57)}...` : cleanText;
      const title =
        senderRole === 'BUYER'
          ? `Ujumbe Mpya kutoka kwa Mnunuzi: ${conv.productTitleSnapshot}`
          : `Jibu kutoka kwa Muuzaji: ${conv.productTitleSnapshot}`;

      await createAuthoritativeNotification({
        recipientUserId,
        type: 'MARKETPLACE_MESSAGE_RECEIVED',
        category: 'MARKETPLACE',
        priority: 'NORMAL',
        title,
        message: safePreview,
        targetType: 'CONVERSATION',
        targetId: input.conversationId,
        actionUrl: `/market?tab=inbox&conv=${input.conversationId}`,
        relatedProductId: conv.productId,
        deduplicationKey: `msg_notif_${messageId}`,
        metadata: {
          conversationId: input.conversationId,
          productId: conv.productId,
          listingId: conv.listingId,
          senderRole,
          senderUserId: callerUserId,
        },
      });
    } catch (notifErr) {
      console.warn('[marketplaceInboxService] Notification dispatch notice:', notifErr);
    }

    return message;
  }

  /**
   * 6. MARK CONVERSATION AS READ
   * Clears caller's unread counter and stamps readAt on incoming unread messages.
   */
  public async markConversationAsRead(
    conversationId: string,
    callerUserId: string
  ): Promise<MarketplaceConversation> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');
    if (isNode) loadInboxFromDisk();

    const conv = isNode
      ? conversationsStore.get(conversationId)
      : getBrowserConversations().find((c) => c.conversationId === conversationId);

    if (!conv) throw new Error('Mazungumzo hayajapatikana.');

    if (conv.buyerUserId !== callerUserId && conv.sellerUserId !== callerUserId) {
      throw new Error('Huruhusiwi kubadilisha hali ya mazungumzo haya.');
    }

    const now = new Date().toISOString();
    let updated = false;

    if (callerUserId === conv.buyerUserId && conv.buyerUnreadCount > 0) {
      conv.buyerUnreadCount = 0;
      conv.updatedAt = now;
      updated = true;
    } else if (callerUserId === conv.sellerUserId && conv.sellerUnreadCount > 0) {
      conv.sellerUnreadCount = 0;
      conv.updatedAt = now;
      updated = true;
    }

    // Mark messages sent by the other party as read
    if (isNode) {
      const msgs = messagesStore.get(conversationId) || [];
      for (const m of msgs) {
        if (m.senderUserId !== callerUserId && !m.readAt) {
          m.readAt = now;
          updated = true;
        }
      }
      if (updated) {
        conversationsStore.set(conversationId, conv);
        saveInboxToDisk();
      }
    } else {
      const msgs = getBrowserMessages(conversationId);
      for (const m of msgs) {
        if (m.senderUserId !== callerUserId && !m.readAt) {
          m.readAt = now;
          updated = true;
        }
      }
      if (updated) {
        saveBrowserMessages(conversationId, msgs);
        const convs = getBrowserConversations();
        const idx = convs.findIndex((c) => c.conversationId === conversationId);
        if (idx >= 0) convs[idx] = conv;
        saveBrowserConversations(convs);
      }
    }

    return conv;
  }

  /**
   * 7. UPDATE CONVERSATION STATUS (ACTIVE | CLOSED | BLOCKED)
   */
  public async updateConversationStatus(
    conversationId: string,
    newStatus: ConversationStatus,
    callerUserId: string,
    isAdmin = false
  ): Promise<MarketplaceConversation> {
    if (!callerUserId) throw new Error('Hujaingia kwenye mfumo.');
    if (isNode) loadInboxFromDisk();

    const conv = isNode
      ? conversationsStore.get(conversationId)
      : getBrowserConversations().find((c) => c.conversationId === conversationId);

    if (!conv) throw new Error('Mazungumzo hayajapatikana.');

    if (!isAdmin && conv.buyerUserId !== callerUserId && conv.sellerUserId !== callerUserId) {
      throw new Error('Huruhusiwi kubadilisha hali ya mazungumzo haya.');
    }

    conv.status = newStatus;
    conv.updatedAt = new Date().toISOString();

    if (isNode) {
      conversationsStore.set(conversationId, conv);
      saveInboxToDisk();
    } else {
      const convs = getBrowserConversations();
      const idx = convs.findIndex((c) => c.conversationId === conversationId);
      if (idx >= 0) convs[idx] = conv;
      saveBrowserConversations(convs);
    }

    return conv;
  }
}

export const marketplaceInboxService = new MarketplaceInboxService();
