/**
 * V1.6C — PRODUCT TRUST & OWNERSHIP SERVICE
 * 
 * Pipeline & Core Guarantees:
 * AUTHENTICATED SELLER -> SELLER IDENTITY -> DIGITAL SHOP -> PRODUCT -> MARKETPLACE LISTING
 * 
 * Core Mandates:
 * 1. Product ownership must come strictly from authoritative Marketplace data,
 *    NEVER from AI speculation, user text, images, or guesswork.
 * 2. Prevent:
 *    - Product impersonation
 *    - Arbitrary sellerId assignment
 *    - Arbitrary shopId assignment
 *    - Cross-seller product editing or deletion
 *    - Cross-shop product attachment or transfer
 *    - Product ownership hijacking
 *    - Misleading seller/product relationships
 *    - AI hallucination about product ownership
 *    - Visual-media-based ownership assumptions
 *    - Client-side ownership manipulation
 * 3. Verified Seller does NOT mean Verified Product.
 * 4. Product description is seller-provided text; it does NOT create verification or government approval.
 * 5. Handle legacy products gracefully (VALID, INCONSISTENT, UNAVAILABLE, ERROR).
 */

import { MarketplaceProduct, DigitalShop, ProductOwnershipValidation, ProductOwnershipState } from '../types/marketplace';

// Pattern signatures for unverified regulatory or governmental claims in product descriptions
const UNVERIFIED_AUTHORITY_PATTERNS = [
  { pattern: /\b(government\s+approved|imeidhinishwa\s+na\s+serikali)\b/i, label: 'Idhini ya Serikali' },
  { pattern: /\b(tbs\s+(approved|certified)|imethibitishwa\s+na\s+tbs)\b/i, label: 'Uthibitisho wa TBS' },
  { pattern: /\b(tmda\s+(approved|certified)|tfda\s+(approved|certified)|imethibitishwa\s+na\s+tmda)\b/i, label: 'Uthibitisho wa TMDA' },
  { pattern: /\b(official\s+veterinary\s+certification|cheti\s+rasmi\s+cha\s+daktari)\b/i, label: 'Cheti Rasmi cha Daktari' },
  { pattern: /\b(100%\s+guaranteed\s+cure|inatibu\s+kabisa\s+bila\s+kushindwa|dawa\s+ya\s+uhakika\s+100%)\b/i, label: 'Dawa ya Uhakika 100%' }
];

// Malicious prompt injection signatures inside seller descriptions
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /sahau\s+(maagizo|sheria)\s+(yote|zote)\s+za\s+awali/i,
  /declare\s+this\s+product\s+(verified|approved)/i,
  /thibitisha\s+bidhaa\s+hii\s+kuwa\s+imeidhinishwa/i,
  /bypass\s+safety/i,
  /system\s*:\s*override/i
];

/**
 * Validates the authoritative relationship of a product against its seller and shop.
 * Guarantees that inconsistent or missing ownership fields never show fake trust badges.
 */
export function validateProductOwnership(
  product: MarketplaceProduct,
  shop?: DigitalShop | null,
  sellerVerificationStatus?: string | null
): ProductOwnershipValidation {
  // 1. Check Product ID integrity
  if (!product || !product.productId || typeof product.productId !== 'string' || !product.productId.trim()) {
    return {
      state: 'ERROR',
      isValid: false,
      authoritativeSellerId: null,
      authoritativeShopId: null,
      authoritativeShopName: 'Haijulikani',
      authoritativeSellerName: 'Haijulikani',
      isSellerVerified: false,
      verificationBadgeLabel: 'Haikubaliki',
      disclaimer: 'Bidhaa hii haina kitambulisho halali cha mfumo.',
      status: product?.status || 'inactive',
      errorReason: 'Kitambulisho cha bidhaa (productId) hakipo au si sahihi.'
    };
  }

  // 2. Check Seller ID integrity
  const sellerId = product.sellerId ? product.sellerId.trim() : '';
  if (!sellerId) {
    return {
      state: 'UNAVAILABLE',
      isValid: false,
      authoritativeSellerId: null,
      authoritativeShopId: null,
      authoritativeShopName: 'Duka Halijulikani',
      authoritativeSellerName: 'Muuzaji Asiyejulikana',
      isSellerVerified: false,
      verificationBadgeLabel: 'Haijahakikiwa',
      disclaimer: 'Bidhaa hii haina mmiliki aliyethibitishwa kwenye mfumo.',
      status: product.status || 'inactive',
      errorReason: 'Mmiliki wa bidhaa (sellerId) hayupo kwenye data rasmi.',
      isLegacyProduct: Boolean(product.isTestDemo)
    };
  }

  // 3. Check Shop ID integrity (Shop must strictly belong to the seller)
  const shopId = product.shopId ? product.shopId.trim() : sellerId;
  const isLegacy = !product.shopId || Boolean(product.isTestDemo);

  if (shopId !== sellerId) {
    // Cross-shop mismatch detected
    return {
      state: 'INCONSISTENT',
      isValid: false,
      authoritativeSellerId: sellerId,
      authoritativeShopId: null,
      authoritativeShopName: product.sellerBusinessName || product.sellerName || 'Duka Lisiloendana',
      authoritativeSellerName: product.sellerName || 'Muuzaji',
      isSellerVerified: false, // Suppress verification badge on inconsistent ownership
      verificationBadgeLabel: 'Mwenendo Usioendana',
      disclaimer: 'Uhusiano wa duka na muuzaji wa bidhaa hii una hitilafu. Data za uaminifu zimezuiwa.',
      status: product.status || 'inactive',
      errorReason: `Uhusiano kati ya bidhaa na duka haukubaliani (shopId: ${shopId} != sellerId: ${sellerId}).`
    };
  }

  // 4. If an external Shop record is provided, verify it belongs to this seller
  if (shop && shop.sellerId && shop.sellerId !== sellerId) {
    return {
      state: 'INCONSISTENT',
      isValid: false,
      authoritativeSellerId: sellerId,
      authoritativeShopId: null,
      authoritativeShopName: 'Hitilafu ya Duka',
      authoritativeSellerName: product.sellerName || 'Muuzaji',
      isSellerVerified: false,
      verificationBadgeLabel: 'Mwenendo Usioendana',
      disclaimer: 'Duka hili linamilikiwa na muuzaji tofauti na aliyesajili bidhaa.',
      status: product.status || 'inactive',
      errorReason: 'Duka lililopo halilingani na mmiliki wa bidhaa.'
    };
  }

  // 5. Authoritative Seller Verification derivation
  // Verification belongs ONLY to the seller identity, NOT to the product itself
  const effectiveVerificationStatus = sellerVerificationStatus || product.sellerVerificationStatus;
  const isSellerVerified = effectiveVerificationStatus === 'verified' || effectiveVerificationStatus === 'VERIFIED';

  const authoritativeShopName = (shop && shop.shopName) || product.sellerBusinessName || product.sellerName || 'Duka Rasmi';
  const authoritativeSellerName = product.sellerName || (shop && shop.shopName) || 'Muuzaji';

  return {
    state: 'VALID',
    isValid: true,
    authoritativeSellerId: sellerId,
    authoritativeShopId: shopId,
    authoritativeShopName,
    authoritativeSellerName,
    isSellerVerified,
    verificationBadgeLabel: isSellerVerified ? 'Muuzaji Aliyethibitishwa' : 'Haijahakikiwa',
    disclaimer: 'Uthibitisho unahusu utambulisho wa muuzaji pekee, si idhini au uhalisi wa bidhaa moja kwa moja.',
    status: product.status,
    isLegacyProduct: isLegacy
  };
}

/**
 * Enforces server/service-level authorization before any create, update, or delete operation.
 * Prevents client-side manipulation, cross-seller editing, and arbitrary ID assignment.
 */
export function assertAuthorizedProductOperation(
  userUid: string | null | undefined,
  targetProduct: {
    sellerId: string;
    shopId?: string | null;
    productId?: string;
    createdAt?: string;
  },
  operation: 'create' | 'update' | 'delete',
  existingProduct?: MarketplaceProduct | null,
  isAdmin: boolean = false
): void {
  if (isAdmin) {
    // Administrator permitted for moderation oversight
    return;
  }

  if (!userUid || !userUid.trim()) {
    throw new Error('Lazima uwe umeingia kwenye akaunti kufanya mabadiliko kwenye Gulio.');
  }

  const cleanUid = userUid.trim();

  // CREATE OPERATION
  if (operation === 'create') {
    if (targetProduct.sellerId && targetProduct.sellerId.trim() !== cleanUid) {
      throw new Error('Huruhusiwi kuweka bidhaa kwa jina la muuzaji mwingine (Arbitrary sellerId blocked).');
    }
    if (targetProduct.shopId && targetProduct.shopId.trim() !== cleanUid) {
      throw new Error('Huruhusiwi kuweka bidhaa kwenye duka la muuzaji mwingine (Cross-shop attachment blocked).');
    }
    return;
  }

  // UPDATE OPERATION
  if (operation === 'update') {
    if (!existingProduct) {
      throw new Error('Bidhaa inayotakiwa kurekebishwa haikupatikana.');
    }
    if (existingProduct.sellerId !== cleanUid) {
      throw new Error('Huruhusiwi kubadilisha bidhaa inayomilikiwa na muuzaji mwingine (Cross-seller editing blocked).');
    }
    // Check immutability of core ownership and identity fields
    if (targetProduct.sellerId && targetProduct.sellerId.trim() !== existingProduct.sellerId) {
      throw new Error('Huruhusiwi kubadilisha mmiliki (sellerId) wa bidhaa hii. Uhamisho wa bidhaa hauruhusiwi.');
    }
    if (targetProduct.shopId && targetProduct.shopId.trim() !== existingProduct.sellerId) {
      throw new Error('Huruhusiwi kuhamisha bidhaa kwenda duka lingine (shopId is bound to owner).');
    }
    if (targetProduct.productId && targetProduct.productId.trim() !== existingProduct.productId) {
      throw new Error('Huruhusiwi kubadilisha kitambulisho (productId) cha bidhaa.');
    }
    if (targetProduct.createdAt && targetProduct.createdAt.trim() !== existingProduct.createdAt) {
      throw new Error('Huruhusiwi kubadilisha tarehe ya kuanzishwa (createdAt) kwa bidhaa.');
    }
    return;
  }

  // DELETE OPERATION
  if (operation === 'delete') {
    if (!existingProduct) {
      throw new Error('Bidhaa inayotakiwa kufutwa haikupatikana.');
    }
    if (existingProduct.sellerId !== cleanUid) {
      throw new Error('Huruhusiwi kufuta bidhaa inayomilikiwa na muuzaji mwingine (Cross-seller deletion blocked).');
    }
    return;
  }
}

/**
 * Checks whether the current user is authorized to manage a specific product.
 */
export function canUserManageProduct(
  userUid: string | null | undefined,
  product: MarketplaceProduct,
  isAdmin: boolean = false
): boolean {
  if (isAdmin) return true;
  if (!userUid || !userUid.trim()) return false;
  return product.sellerId === userUid.trim();
}

/**
 * Inspects and sanitizes product descriptions provided by sellers.
 * Treats descriptions as unverified seller marketing content, neutralizes prompt injections,
 * and flags unverified regulatory or governmental claims.
 */
export function sanitizeProductDescription(rawDescription: string): {
  sanitizedDescription: string;
  hasUnverifiedAuthorityClaims: boolean;
  authorityClaimsDetected: string[];
  hasPromptInjection: boolean;
  safetyNote?: string;
} {
  let text = rawDescription || '';
  let hasPromptInjection = false;
  const authorityClaimsDetected: string[] = [];

  // 1. Detect and neutralize prompt injections
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      hasPromptInjection = true;
      text = text.replace(pattern, '[Maagizo yasiyoruhusiwa yamezuiwa]');
    }
  }

  // 2. Detect unverified regulatory / governmental claims
  for (const item of UNVERIFIED_AUTHORITY_PATTERNS) {
    if (item.pattern.test(text)) {
      authorityClaimsDetected.push(item.label);
    }
  }

  const hasUnverifiedAuthorityClaims = authorityClaimsDetected.length > 0;
  const safetyNote = hasUnverifiedAuthorityClaims
    ? `Kumbuka: Maelezo ya bidhaa yametolewa na muuzaji (${authorityClaimsDetected.join(', ')}). Mfumo wa Ufugaji Update haujathibitisha madai haya ya kiserikali au ya kimaabara.`
    : undefined;

  return {
    sanitizedDescription: text.trim(),
    hasUnverifiedAuthorityClaims,
    authorityClaimsDetected,
    hasPromptInjection,
    safetyNote
  };
}
