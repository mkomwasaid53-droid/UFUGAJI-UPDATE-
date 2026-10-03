/**
 * V1.6D — PRICE & STOCK TRUST SERVICE
 * 
 * Core Mandates:
 * 1. Marketplace must report what the authoritative product data says.
 *    It must not invent, estimate, or guarantee information that the system cannot verify.
 * 2. Distinguish:
 *    - PRICE PROVIDED (valid positive numeric value)
 *    - PRICE NOT PROVIDED (missing / undefined / null)
 *    - PRICE UNAVAILABLE (inaccessible or temporarily withheld)
 *    - PRICE LAST UPDATED (priceUpdatedAt from actual seller update, never fabricated)
 *    - STOCK AVAILABLE (IN_STOCK, quantity > 0)
 *    - STOCK UNAVAILABLE
 *    - STOCK NOT PROVIDED (missing / undefined, NEVER falsely marked OUT_OF_STOCK)
 *    - STOCK LAST UPDATED (stockUpdatedAt from actual seller update, never fabricated)
 *    - OUT OF STOCK (quantity === 0 or status === 'sold_out')
 *    - STALE INFORMATION (freshness evaluated via deterministic threshold)
 *    - ERROR (negative numbers, NaN, Infinity, malformed data)
 * 3. Trust Boundaries:
 *    - Seller-listed price != market price, cheapest price, or verified price.
 *    - Seller-listed stock != physically guaranteed stock.
 *    - Verified Seller != verified price or guaranteed stock.
 * 4. Conflict Resolution:
 *    - Structured authoritative price overrides conflicting description text.
 *    - Structured authoritative stock overrides conflicting description text.
 *    - Visual media (image/video text) does not create authoritative price or stock.
 * 5. Legacy Data:
 *    - Products without timestamps must remain usable without fabricated dates (Freshness: UNKNOWN).
 */

import {
  MarketplaceProduct,
  PriceStatus,
  StockStatus,
  FreshnessState,
  FormattedPriceResult,
  FormattedStockResult,
  ProductPriceStockTrust
} from '../types/marketplace';
import { validateProductOwnership } from './productOwnershipService';

/**
 * Deterministic threshold for price and stock freshness.
 * If a listing has not been updated within 90 days, its freshness is marked STALE.
 */
export const PRICE_STOCK_FRESHNESS_THRESHOLD_DAYS = 90;

export interface PriceValidationResult {
  isValid: boolean;
  status: PriceStatus;
  cleanPrice: number | null;
  error?: string;
}

export interface StockValidationResult {
  isValid: boolean;
  status: StockStatus;
  cleanQuantity: number | null;
  error?: string;
}

export interface FreshnessEvaluation {
  freshness: FreshnessState;
  isStale: boolean;
  daysAgo: number | null;
  formattedDate: string | null;
}

/**
 * Validates a numeric price value strictly.
 * Rejects negative, NaN, Infinity, malformed text, or zero (for commercial products).
 */
export function validatePriceValue(price: unknown): PriceValidationResult {
  if (price === undefined || price === null || price === '') {
    return {
      isValid: false,
      status: 'NOT_PROVIDED',
      cleanPrice: null
    };
  }

  const num = typeof price === 'number' ? price : Number(price);

  if (isNaN(num) || !isFinite(num)) {
    return {
      isValid: false,
      status: 'ERROR',
      cleanPrice: null,
      error: 'Bei ya bidhaa si nambari sahihi.'
    };
  }

  if (num < 0) {
    return {
      isValid: false,
      status: 'ERROR',
      cleanPrice: null,
      error: 'Bei ya bidhaa haiwezi kuwa hasi.'
    };
  }

  if (num === 0) {
    // Missing or invalid commercial price
    return {
      isValid: false,
      status: 'NOT_PROVIDED',
      cleanPrice: null
    };
  }

  return {
    isValid: true,
    status: 'PROVIDED',
    cleanPrice: Math.round(num)
  };
}

/**
 * Validates a stock quantity value strictly.
 * Rejects negative numbers, NaN, Infinity, or malformed values.
 * Distinguishes 0 (OUT_OF_STOCK) from undefined/null (NOT_PROVIDED).
 */
export function validateStockValue(quantity: unknown, productStatus?: string): StockValidationResult {
  if (quantity === undefined || quantity === null || quantity === '') {
    return {
      isValid: false,
      status: 'NOT_PROVIDED',
      cleanQuantity: null
    };
  }

  const num = typeof quantity === 'number' ? quantity : Number(quantity);

  if (isNaN(num) || !isFinite(num)) {
    return {
      isValid: false,
      status: 'ERROR',
      cleanQuantity: null,
      error: 'Idadi ya bidhaa si nambari sahihi.'
    };
  }

  if (num < 0) {
    return {
      isValid: false,
      status: 'ERROR',
      cleanQuantity: null,
      error: 'Idadi ya bidhaa haiwezi kuwa hasi.'
    };
  }

  const intQty = Math.floor(num);

  if (intQty === 0 || productStatus === 'sold_out') {
    return {
      isValid: true,
      status: 'OUT_OF_STOCK',
      cleanQuantity: 0
    };
  }

  return {
    isValid: true,
    status: 'IN_STOCK',
    cleanQuantity: intQty
  };
}

/**
 * Deterministically evaluates timestamp freshness without fabricating dates.
 */
export function evaluateFreshness(
  timestamp?: string | null,
  thresholdDays: number = PRICE_STOCK_FRESHNESS_THRESHOLD_DAYS
): FreshnessEvaluation {
  if (!timestamp || typeof timestamp !== 'string' || !timestamp.trim()) {
    return {
      freshness: 'UNKNOWN',
      isStale: false,
      daysAgo: null,
      formattedDate: null
    };
  }

  const parsedDate = new Date(timestamp);
  if (isNaN(parsedDate.getTime())) {
    return {
      freshness: 'UNKNOWN',
      isStale: false,
      daysAgo: null,
      formattedDate: null
    };
  }

  const diffMs = Date.now() - parsedDate.getTime();
  const daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const isStale = daysAgo > thresholdDays;

  // Format date in Swahili locale (e.g. "12/09/2026")
  const formattedDate = parsedDate.toLocaleDateString('sw-TZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return {
    freshness: isStale ? 'STALE' : 'CURRENT',
    isStale,
    daysAgo,
    formattedDate
  };
}

/**
 * Formats an authoritative price result from product data.
 * Adheres strictly to:
 * - Never display "TSh 0" when missing
 * - Never invent units if unit is missing
 * - Never display "$" for Tanzanian shilling listings
 */
export function formatAuthoritativePrice(product?: MarketplaceProduct | null): FormattedPriceResult {
  if (!product) {
    return {
      status: 'NOT_PROVIDED',
      freshness: 'UNKNOWN',
      displayPrice: 'Bei haijawekwa',
      rawAmount: null,
      currency: 'Tsh',
      unit: null,
      lastUpdatedText: null,
      isStale: false,
      trustDisclaimer: 'Muuzaji hajaweka bei ya bidhaa hii.'
    };
  }

  const priceVal = validatePriceValue(product.price);
  const freshnessEval = evaluateFreshness(product.priceUpdatedAt);

  const currency = product.currency === 'TZS' ? 'TZS' : 'Tsh';
  const cleanUnit = product.unit && product.unit.trim() ? product.unit.trim() : null;

  if (priceVal.status === 'ERROR') {
    return {
      status: 'ERROR',
      freshness: freshnessEval.freshness,
      displayPrice: 'Hitilafu ya bei',
      rawAmount: null,
      currency,
      unit: cleanUnit,
      lastUpdatedText: freshnessEval.formattedDate,
      isStale: freshnessEval.isStale,
      trustDisclaimer: 'Thamani ya bei iliyopo haina usahihi wa mfumo na haiwezi kutumika.'
    };
  }

  if (priceVal.status === 'NOT_PROVIDED' || priceVal.cleanPrice === null) {
    return {
      status: 'NOT_PROVIDED',
      freshness: 'UNKNOWN',
      displayPrice: 'Bei haijawekwa',
      rawAmount: null,
      currency,
      unit: cleanUnit,
      lastUpdatedText: null,
      isStale: false,
      trustDisclaimer: 'Muuzaji hajaweka bei ya bidhaa hii. Wasiliana naye kupitia mfumo kuthibitisha bei.'
    };
  }

  // Valid price provided
  const formattedNumber = priceVal.cleanPrice.toLocaleString('en-US');
  const displayPrice = cleanUnit
    ? `TSh ${formattedNumber} / ${cleanUnit}`
    : `TSh ${formattedNumber}`;

  const status: PriceStatus = freshnessEval.isStale ? 'STALE' : 'PROVIDED';

  return {
    status,
    freshness: freshnessEval.freshness,
    displayPrice,
    rawAmount: priceVal.cleanPrice,
    currency,
    unit: cleanUnit,
    lastUpdatedText: freshnessEval.formattedDate,
    isStale: freshnessEval.isStale,
    trustDisclaimer: 'Bei hii imeorodheshwa na muuzaji; haijathibitishwa na maabara au serikali kama bei rasmi ya jumla.'
  };
}

/**
 * Formats authoritative stock result from product data.
 * Distinguishes IN_STOCK, OUT_OF_STOCK, and NOT_PROVIDED.
 * Never converts missing stock into OUT_OF_STOCK.
 */
export function formatAuthoritativeStock(product?: MarketplaceProduct | null): FormattedStockResult {
  if (!product) {
    return {
      status: 'NOT_PROVIDED',
      freshness: 'UNKNOWN',
      displayStock: 'Taarifa za idadi hazijawekwa',
      quantity: null,
      unit: null,
      lastUpdatedText: null,
      isAvailable: false,
      isOutOfStock: false,
      isStale: false,
      trustDisclaimer: 'Muuzaji hajaweka idadi halisi inayopatikana.'
    };
  }

  const stockVal = validateStockValue(product.quantityAvailable, product.status);
  const freshnessEval = evaluateFreshness(product.stockUpdatedAt);

  const cleanUnit = product.unit && product.unit.trim() ? product.unit.trim() : null;

  if (stockVal.status === 'ERROR') {
    return {
      status: 'ERROR',
      freshness: freshnessEval.freshness,
      displayStock: 'Hitilafu ya taarifa za idadi',
      quantity: null,
      unit: cleanUnit,
      lastUpdatedText: freshnessEval.formattedDate,
      isAvailable: false,
      isOutOfStock: false,
      isStale: freshnessEval.isStale,
      trustDisclaimer: 'Taarifa za idadi zina hitilafu na haziwezi kuaminiwa.'
    };
  }

  if (stockVal.status === 'NOT_PROVIDED' || stockVal.cleanQuantity === null) {
    return {
      status: 'NOT_PROVIDED',
      freshness: 'UNKNOWN',
      displayStock: 'Taarifa za idadi hazijawekwa',
      quantity: null,
      unit: cleanUnit,
      lastUpdatedText: null,
      isAvailable: false,
      isOutOfStock: false,
      isStale: false,
      trustDisclaimer: 'Muuzaji hajaweka idadi halisi inayopatikana. Hii haimaanishi bidhaa imeisha.'
    };
  }

  if (stockVal.status === 'OUT_OF_STOCK') {
    return {
      status: 'OUT_OF_STOCK',
      freshness: freshnessEval.freshness,
      displayStock: 'Imeisha (Out of stock)',
      quantity: 0,
      unit: cleanUnit,
      lastUpdatedText: freshnessEval.formattedDate,
      isAvailable: false,
      isOutOfStock: true,
      isStale: freshnessEval.isStale,
      trustDisclaimer: 'Muuzaji ameorodhesha bidhaa hii kama imeisha kwa sasa.'
    };
  }

  // IN_STOCK
  const displayStock = cleanUnit
    ? `Zilizopo: ${stockVal.cleanQuantity} ${cleanUnit}`
    : `Zilizopo: ${stockVal.cleanQuantity}`;

  const status: StockStatus = freshnessEval.isStale ? 'STALE' : 'IN_STOCK';

  return {
    status,
    freshness: freshnessEval.freshness,
    displayStock,
    quantity: stockVal.cleanQuantity,
    unit: cleanUnit,
    lastUpdatedText: freshnessEval.formattedDate,
    isAvailable: true,
    isOutOfStock: false,
    isStale: freshnessEval.isStale,
    trustDisclaimer: 'Idadi hii imeorodheshwa na muuzaji kama iliyopo; haitoi dhamana ya kimwili ya upatikanaji.'
  };
}

/**
 * Extracts any price mentions found in free text (description, user queries, etc.)
 */
export function extractTextPrices(text?: string): number[] {
  if (!text) return [];
  const prices: number[] = [];
  const regex = /(?:TSh|Tsh|TSH|Sh)\s*([\d,]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const cleaned = match[1].replace(/,/g, '');
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num > 0) {
      prices.push(num);
    }
  }
  return prices;
}

/**
 * Detects conflicts between seller-entered free-text description and structured authoritative fields.
 * Principle: Structured authoritative data ALWAYS wins!
 */
export function detectPriceStockConflicts(
  product?: MarketplaceProduct | null,
  formattedPrice?: FormattedPriceResult,
  formattedStock?: FormattedStockResult
): {
  hasPriceConflict: boolean;
  descriptionPrice?: number;
  hasStockConflict: boolean;
  structuredWinsNotice?: string;
} {
  if (!product) {
    return {
      hasPriceConflict: false,
      hasStockConflict: false
    };
  }

  const desc = product.description || '';
  let hasPriceConflict = false;
  let descriptionPrice: number | undefined;
  let hasStockConflict = false;
  const notices: string[] = [];

  // Check price conflict: Description mentions a price that conflicts with structured price
  if (formattedPrice && formattedPrice.rawAmount !== null) {
    const descPrices = extractTextPrices(desc);
    if (descPrices.length > 0) {
      const conflicting = descPrices.find((p) => Math.abs(p - formattedPrice.rawAmount!) > 5);
      if (conflicting) {
        hasPriceConflict = true;
        descriptionPrice = conflicting;
        notices.push(
          `Maelezo ya muuzaji yanataja TSh ${conflicting.toLocaleString()}, lakini bei rasmi iliyosajiliwa kwenye mfumo ni TSh ${formattedPrice.rawAmount.toLocaleString()}. Bei rasmi ya mfumo ndiyo inayotumika.`
        );
      }
    }
  }

  // Check stock conflict: Description claims "available now" when structured stock is OUT_OF_STOCK
  const claimsAvailableInText = /\b(available\s+now|zipo\s+sasa|inapatikana\s+sasa|zilizopo\s+sasa|wahi\s+zipo|mzigo\s+upo)\b/i.test(desc);
  if (formattedStock && formattedStock.isOutOfStock && claimsAvailableInText) {
    hasStockConflict = true;
    notices.push(
      'Maelezo ya muuzaji yanadai bidhaa ipo, lakini idadi rasmi iliyosajiliwa inaonyesha IMEISHA (0). Taarifa rasmi ya idadi ina kipaumbele.'
    );
  }

  return {
    hasPriceConflict,
    descriptionPrice,
    hasStockConflict,
    structuredWinsNotice: notices.length > 0 ? notices.join(' ') : undefined
  };
}

/**
 * Checks draft form inputs for conflicts between seller description and entered numbers.
 */
export function checkDraftPriceStockConflicts(
  description: string,
  priceAmount?: number | null,
  quantity?: number | null,
  isSoldOut?: boolean
): string[] {
  if (!description) return [];
  const notices: string[] = [];
  if (priceAmount !== undefined && priceAmount !== null && priceAmount > 0) {
    const descPrices = extractTextPrices(description);
    if (descPrices.length > 0) {
      const conflicting = descPrices.find((p) => Math.abs(p - priceAmount) > 5);
      if (conflicting) {
        notices.push(
          `Maelezo yanataja Tsh ${conflicting.toLocaleString()}, lakini kisanduku cha bei kimewekwa Tsh ${priceAmount.toLocaleString()}. Hakikisha zinalingana.`
        );
      }
    }
  }

  const claimsAvailableInText = /\b(available\s+now|zipo\s+sasa|inapatikana\s+sasa|zilizopo\s+sasa|wahi\s+zipo|mzigo\s+upo)\b/i.test(description);
  if ((quantity === 0 || isSoldOut) && claimsAvailableInText) {
    notices.push(
      'Maelezo yanadai bidhaa ipo sasa lakini idadi umeweka 0 (Imeisha).'
    );
  }
  return notices;
}

/**
 * Resolves complete Price and Stock Trust bundle for a product.
 */
export function resolvePriceStockTrust(product?: MarketplaceProduct | null): ProductPriceStockTrust {
  const price = formatAuthoritativePrice(product);
  const stock = formatAuthoritativeStock(product);
  const conflicts = detectPriceStockConflicts(product, price, stock);

  // V1.6C Ownership check for seller verification
  const ownership = product ? validateProductOwnership(product) : { isValid: false, isSellerVerified: false };
  const isSellerVerified = Boolean(ownership.isValid && ownership.isSellerVerified);

  const verificationBoundaryNotice = isSellerVerified
    ? 'Muuzaji huyu amehakikiwa utambulisho wake, lakini uthibitisho wa muuzaji haumaanishi uthibitisho wa bei ya soko wala dhamana ya upatikanaji wa bidhaa.'
    : 'Muuzaji hajaweka uthibitisho rasmi wa utambulisho wake.';

  return {
    price,
    stock,
    hasDescriptionPriceConflict: conflicts.hasPriceConflict,
    descriptionPriceFound: conflicts.descriptionPrice,
    hasDescriptionStockConflict: conflicts.hasStockConflict,
    structuredWinsNotice: conflicts.structuredWinsNotice,
    isSellerVerified,
    verificationBoundaryNotice
  };
}

/**
 * Checks if two products can be legitimately compared in price.
 * Forbids claiming "Product B is cheaper" without identical units and valid numeric prices.
 */
export function canCompareProductPrices(
  p1: MarketplaceProduct,
  p2: MarketplaceProduct
): { canCompare: boolean; reason?: string } {
  const price1 = validatePriceValue(p1.price);
  const price2 = validatePriceValue(p2.price);

  if (!price1.isValid || price1.cleanPrice === null) {
    return { canCompare: false, reason: `Bei ya bidhaa "${p1.title}" haijawekwa au haina usahihi.` };
  }
  if (!price2.isValid || price2.cleanPrice === null) {
    return { canCompare: false, reason: `Bei ya bidhaa "${p2.title}" haijawekwa au haina usahihi.` };
  }

  const u1 = (p1.unit || '').trim().toLowerCase();
  const u2 = (p2.unit || '').trim().toLowerCase();

  if (!u1 || !u2) {
    return { canCompare: false, reason: 'Kipimo cha mojawapo ya bidhaa hakijabainishwa, hivyo haziwezi kulinganishwa moja kwa moja.' };
  }

  if (u1 !== u2) {
    return {
      canCompare: false,
      reason: `Vipimo vinatofautiana ("${p1.unit}" dhidi ya "${p2.unit}"). Haziwezi kulinganishwa bei bila kubadilisha vipimo.`
    };
  }

  return { canCompare: true };
}
