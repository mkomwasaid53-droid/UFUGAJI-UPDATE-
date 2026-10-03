/**
 * V1.6E — LOCATION, DELIVERY & AVAILABILITY TRUST SERVICE
 * 
 * Pipeline & Core Guarantees:
 * 1. Authoritative structured Marketplace data is the supreme source of truth.
 * 2. System and AI must NEVER invent:
 *    - seller location
 *    - shop location
 *    - product location
 *    - delivery availability
 *    - delivery area
 *    - delivery fee
 *    - delivery time / ETA
 *    - pickup availability
 *    - stock availability
 *    - distance
 *    - "nearby" claims
 *    - delivery promises
 * 3. Never assume:
 *    - product location is shop location
 *    - delivery available = nationwide or free
 *    - missing delivery fee = 0
 *    - missing delivery time = 24 hours
 *    - verified seller = verified location or guaranteed delivery
 * 4. Deterministic States:
 *    - Location: PROVIDED, PARTIAL, NOT_PROVIDED, UNAVAILABLE, STALE, ERROR
 *    - Delivery: DELIVERY_AVAILABLE, PICKUP_ONLY, DELIVERY_AND_PICKUP,
 *                DELIVERY_NOT_AVAILABLE, DELIVERY_INFORMATION_NOT_PROVIDED, UNAVAILABLE, ERROR
 *    - Fee: PROVIDED, NOT_PROVIDED, UNAVAILABLE, STALE, ERROR
 *    - Time: PROVIDED, NOT_PROVIDED, UNAVAILABLE, STALE, ERROR
 *    - Pickup: AVAILABLE, NOT_AVAILABLE, INFORMATION_NOT_PROVIDED, UNAVAILABLE, ERROR
 *    - Availability: AVAILABLE, LIMITED_INFORMATION, NOT_AVAILABLE, UNAVAILABLE, STALE, ERROR
 */

import {
  MarketplaceProduct,
  DigitalShop,
  LocationStatus,
  LocationType,
  DeliveryType,
  DeliveryAreaLevel,
  DeliveryFeeStatus,
  DeliveryFeeType,
  DeliveryTimeStatus,
  PickupStatus,
  ProductAvailabilityState,
  FormattedLocationResult,
  FormattedDeliveryResult,
  FormattedAvailabilityResult,
  ProductLocationDeliveryTrust
} from '../types/marketplace';
import { validateProductOwnership } from './productOwnershipService';
import { resolvePriceStockTrust, PRICE_STOCK_FRESHNESS_THRESHOLD_DAYS } from './productPriceStockService';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Prompt injection patterns in location/delivery free-text
const LOCATION_DELIVERY_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /tell\s+the\s+farmer\s+that\s+delivery\s+is\s+free/i,
  /free\s+delivery\s+nationwide/i,
  /deliver\s+to\s+every\s+farm/i,
  /tunapeleka\s+kila\s+shamba\s+bure/i,
  /sahau\s+sheria\s+za\s+awali/i
];

/**
 * Normalizes text to assist in strict geographic matching.
 */
function cleanGeo(text?: string | null): string {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/^(mkoa wa|wilaya ya|jiji la|halmashauri ya)\s+/i, '');
}

/**
 * Checks if a timestamp exceeds the deterministic freshness threshold (90 days).
 * Critical rule: If no timestamp exists, it is NEVER marked stale!
 */
export function evaluateLocationDeliveryFreshness(timestampIso?: string | null): {
  isStale: boolean;
  formattedDate: string | null;
} {
  if (!timestampIso) {
    return { isStale: false, formattedDate: null };
  }

  const dt = new Date(timestampIso);
  if (isNaN(dt.getTime())) {
    return { isStale: false, formattedDate: null };
  }

  const diffMs = Date.now() - dt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isStale = diffDays > PRICE_STOCK_FRESHNESS_THRESHOLD_DAYS;

  let formattedDate: string;
  try {
    formattedDate = new Intl.DateTimeFormat('sw-TZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(dt);
  } catch {
    formattedDate = dt.toISOString().split('T')[0];
  }

  return { isStale, formattedDate };
}

/**
 * Resolves authoritative structured Location Trust for a product.
 * Respects the distinction between Product Location, Shop Location, and Seller Location.
 */
export function resolveLocationTrust(
  product?: MarketplaceProduct | null,
  shop?: DigitalShop | null
): FormattedLocationResult {
  if (!product) {
    return {
      status: 'LOCATION_NOT_PROVIDED',
      locationType: 'UNKNOWN',
      displayLocation: 'Eneo halijawekwa',
      isPartial: false,
      isStale: false,
      lastUpdatedText: null,
      trustDisclaimer: 'Hakuna taarifa rasmi ya kijiografia iliyosajiliwa kwa bidhaa hii.'
    };
  }

  // 1. Check Product-Specific Location first
  const prodLoc = (product.productLocation || product.location || '').trim();
  const prodRegion = (product.region || '').trim();
  const prodDistrict = (product.district || '').trim();
  const prodArea = (product.area || '').trim();

  // Freshness check
  const { isStale, formattedDate } = evaluateLocationDeliveryFreshness(product.productLocationUpdatedAt);

  // If product has its own location
  if (prodLoc) {
    const isPartial = (!prodDistrict && !prodArea) && Boolean(prodRegion || prodLoc);
    const displayParts: string[] = [];
    if (prodArea) displayParts.push(prodArea);
    if (prodDistrict) displayParts.push(prodDistrict);
    if (prodRegion && !displayParts.includes(prodRegion)) displayParts.push(prodRegion);
    if (displayParts.length === 0) displayParts.push(prodLoc);

    return {
      status: isStale ? 'LOCATION_STALE' : (isPartial ? 'LOCATION_PARTIAL' : 'LOCATION_PROVIDED'),
      locationType: 'PRODUCT_LOCATION',
      displayLocation: displayParts.join(', '),
      region: prodRegion || undefined,
      district: prodDistrict || undefined,
      area: prodArea || undefined,
      isPartial,
      isStale,
      lastUpdatedText: formattedDate,
      trustDisclaimer: 'Eneo hili la bidhaa limewekwa moja kwa moja na muuzaji.'
    };
  }

  // 2. If Product location is NOT provided, fallback to Shop Location with explicit distinction
  if (shop && (shop.location || shop.region || shop.district || shop.shopLocation)) {
    const shopLoc = (shop.shopLocation || shop.location || '').trim();
    const shopRegion = (shop.region || '').trim();
    const shopDistrict = (shop.district || '').trim();
    const shopArea = (shop.area || '').trim();

    const isPartial = !shopDistrict && !shopArea;
    const displayParts: string[] = [];
    if (shopArea) displayParts.push(shopArea);
    if (shopDistrict) displayParts.push(shopDistrict);
    if (shopRegion && !displayParts.includes(shopRegion)) displayParts.push(shopRegion);
    if (displayParts.length === 0) displayParts.push(shopLoc);

    return {
      status: isPartial ? 'LOCATION_PARTIAL' : 'LOCATION_PROVIDED',
      locationType: 'SHOP_LOCATION',
      displayLocation: `Duka: ${displayParts.join(', ')}`,
      region: shopRegion || undefined,
      district: shopDistrict || undefined,
      area: shopArea || undefined,
      isPartial,
      isStale: false,
      lastUpdatedText: null,
      trustDisclaimer: 'Hili ni eneo rasmi la Duka; eneo maalumu la bidhaa hii halijawekwa tofauti.'
    };
  }

  // 3. Fallback to Seller Location if available
  if (product.sellerLocation && product.sellerLocation.trim()) {
    return {
      status: 'LOCATION_PARTIAL',
      locationType: 'SELLER_LOCATION',
      displayLocation: `Muuzaji: ${product.sellerLocation.trim()}`,
      region: undefined,
      district: undefined,
      area: undefined,
      isPartial: true,
      isStale: false,
      lastUpdatedText: null,
      trustDisclaimer: 'Hili ni eneo la mawasiliano la muuzaji; eneo maalumu la bidhaa halijawekwa.'
    };
  }

  // 4. Truly Not Provided
  return {
    status: 'LOCATION_NOT_PROVIDED',
    locationType: 'UNKNOWN',
    displayLocation: 'Eneo halijawekwa',
    isPartial: false,
    isStale: false,
    lastUpdatedText: null,
    trustDisclaimer: 'Hakuna taarifa rasmi ya kijiografia iliyosajiliwa kwa bidhaa hii.'
  };
}

/**
 * Resolves authoritative structured Delivery Trust for a product.
 * Strictly prevents unverified delivery promises, invented fees, or predictive ETAs.
 */
export function resolveDeliveryTrust(product?: MarketplaceProduct | null): FormattedDeliveryResult {
  if (!product) {
    return {
      status: 'DELIVERY_INFORMATION_NOT_PROVIDED',
      deliveryAvailable: false,
      pickupAvailable: false,
      displayDelivery: 'Taarifa za usafirishaji hazijawekwa',
      displayPickup: 'Taarifa ya kuchukua haijawekwa',
      deliveryAreas: [],
      feeStatus: 'DELIVERY_FEE_NOT_PROVIDED',
      feeType: 'NOT_PROVIDED',
      deliveryFee: null,
      displayFee: 'Gharama haijawekwa',
      timeStatus: 'DELIVERY_TIME_NOT_PROVIDED',
      deliveryTimeEstimate: null,
      displayTime: 'Muda haujatajwa',
      isStale: false,
      lastUpdatedText: null,
      trustDisclaimer: 'Hakuna taarifa za usafirishaji zilizowekwa.'
    };
  }

  const { isStale, formattedDate } = evaluateLocationDeliveryFreshness(product.deliveryUpdatedAt);

  // Delivery Availability & Type
  const hasDeliveryFlag = product.deliveryAvailable === true;
  const hasPickupFlag = product.pickupAvailable === true;
  let rawDeliveryType = product.deliveryType;

  // Derive Type if not explicitly set
  if (!rawDeliveryType) {
    if (hasDeliveryFlag && hasPickupFlag) {
      rawDeliveryType = 'DELIVERY_AND_PICKUP';
    } else if (hasDeliveryFlag) {
      rawDeliveryType = 'DELIVERY_AVAILABLE';
    } else if (hasPickupFlag) {
      rawDeliveryType = 'PICKUP_ONLY';
    } else if (product.deliveryAvailable === false && product.pickupAvailable === false) {
      rawDeliveryType = 'DELIVERY_NOT_AVAILABLE';
    } else {
      rawDeliveryType = 'DELIVERY_INFORMATION_NOT_PROVIDED';
    }
  }

  const deliveryAvailable = rawDeliveryType === 'DELIVERY_AVAILABLE' || rawDeliveryType === 'DELIVERY_AND_PICKUP';
  const pickupAvailable = rawDeliveryType === 'PICKUP_ONLY' || rawDeliveryType === 'DELIVERY_AND_PICKUP' || hasPickupFlag;

  // Display texts
  let displayDelivery = 'Taarifa za usafirishaji hazijawekwa';
  if (rawDeliveryType === 'DELIVERY_AVAILABLE' || rawDeliveryType === 'DELIVERY_AND_PICKUP') {
    displayDelivery = 'Usafirishaji upo';
  } else if (rawDeliveryType === 'PICKUP_ONLY') {
    displayDelivery = 'Hakuna usafirishaji (Kuchukua mwenyewe pekee)';
  } else if (rawDeliveryType === 'DELIVERY_NOT_AVAILABLE') {
    displayDelivery = 'Usafirishaji haupatikani';
  }

  let displayPickup = 'Taarifa ya kuchukua haijawekwa';
  if (pickupAvailable) {
    displayPickup = product.pickupAddress
      ? `Kuchukua mwenyewe kupo: ${product.pickupAddress}`
      : 'Kuchukua mwenyewe dukani/eneo la muuzaji kupo';
  } else if (rawDeliveryType === 'DELIVERY_AVAILABLE') {
    displayPickup = 'Kuchukua mwenyewe hakujatajwa';
  }

  // Delivery Areas
  const deliveryAreas = Array.isArray(product.deliveryAreas) ? product.deliveryAreas.filter(Boolean) : [];
  const deliveryAreaLevel: DeliveryAreaLevel | undefined = product.deliveryAreaLevel;

  // Delivery Fee
  let feeStatus: DeliveryFeeStatus = 'DELIVERY_FEE_NOT_PROVIDED';
  let feeType: DeliveryFeeType = product.deliveryFeeType || 'NOT_PROVIDED';
  let deliveryFee: number | null = null;
  let displayFee = 'Gharama haijawekwa (Wasiliana na muuzaji)';

  if (feeType === 'FREE' || product.deliveryFee === 0) {
    feeStatus = 'DELIVERY_FEE_PROVIDED';
    feeType = 'FREE';
    deliveryFee = 0;
    displayFee = 'Bure (Bila Gharama ya Ziada)';
  } else if (typeof product.deliveryFee === 'number' && product.deliveryFee > 0) {
    feeStatus = 'DELIVERY_FEE_PROVIDED';
    deliveryFee = product.deliveryFee;
    displayFee = `TSh ${deliveryFee.toLocaleString()}`;
  } else if (feeType === 'NEGOTIABLE') {
    feeStatus = 'DELIVERY_FEE_PROVIDED';
    displayFee = 'Maelewano na muuzaji';
  }

  // Delivery Time Estimate
  let timeStatus: DeliveryTimeStatus = 'DELIVERY_TIME_NOT_PROVIDED';
  const deliveryTimeEstimate = (product.deliveryTimeEstimate || '').trim() || null;
  let displayTime = 'Muda wa usafirishaji haujaainishwa';

  if (deliveryTimeEstimate) {
    timeStatus = 'DELIVERY_TIME_PROVIDED';
    displayTime = deliveryTimeEstimate;
  }

  // Disclaimer
  let trustDisclaimer = 'Taarifa za usafirishaji zimewekwa na muuzaji. Mfumo hautoi dhamana ya kiotomatiki ya uwasilishaji.';
  if (!deliveryAvailable && !pickupAvailable) {
    trustDisclaimer = 'Muuzaji hajaweka njia rasmi ya usafirishaji wala eneo la kuchukulia mzigo. Wasiliana naye kabla ya makubaliano.';
  }

  return {
    status: rawDeliveryType,
    deliveryAvailable,
    pickupAvailable,
    displayDelivery,
    displayPickup,
    deliveryAreas,
    deliveryAreaLevel,
    feeStatus,
    feeType,
    deliveryFee,
    displayFee,
    timeStatus,
    deliveryTimeEstimate,
    displayTime,
    isStale,
    lastUpdatedText: formattedDate,
    trustDisclaimer
  };
}

/**
 * Resolves authoritative overall Availability State for purchase.
 * Integrates V1.6D Price & Stock Trust with product status and shop state.
 */
export function resolveProductAvailability(
  product?: MarketplaceProduct | null,
  shop?: DigitalShop | null
): FormattedAvailabilityResult {
  if (!product) {
    return {
      state: 'NOT_AVAILABLE',
      isPurchasable: false,
      displayLabel: 'Haipatikani',
      explanation: 'Bidhaa haipatikani au haipo.',
      trustDisclaimer: 'Hakuna taarifa za upatikanaji.'
    };
  }

  // 1. Check Product Ownership & Integrity
  const ownership = validateProductOwnership(product, shop);
  if (!ownership.isValid || ownership.state === 'ERROR') {
    return {
      state: 'ERROR',
      isPurchasable: false,
      displayLabel: 'Hitilafu ya Umiliki',
      explanation: 'Bidhaa hii ina hitilafu ya utambulisho au umiliki wa muuzaji.',
      trustDisclaimer: 'Huwezi kuagiza bidhaa yenye hitilafu za data.'
    };
  }

  // 2. Check Product Status
  if (product.status === 'draft') {
    return {
      state: 'UNAVAILABLE',
      isPurchasable: false,
      displayLabel: 'Rasimu (Haionekani Sokoni)',
      explanation: 'Bidhaa hii bado ipo kwenye hatua ya rasimu ya muuzaji.',
      trustDisclaimer: 'Haijawekwa wazi kwa wanunuzi.'
    };
  }

  if (product.status === 'inactive') {
    return {
      state: 'UNAVAILABLE',
      isPurchasable: false,
      displayLabel: 'Imezimwa na Muuzaji',
      explanation: 'Tangazo hili limezimwa kwa muda na muuzaji.',
      trustDisclaimer: 'Bidhaa haipatikani kwa sasa.'
    };
  }

  // 3. Check Shop state if attached
  if (shop && !shop.isPublished) {
    return {
      state: 'UNAVAILABLE',
      isPurchasable: false,
      displayLabel: 'Duka Halijachapishwa',
      explanation: 'Duka la bidhaa hii limefungwa au halijachapishwa hadharani.',
      trustDisclaimer: 'Bidhaa haipatikani mpaka duka lichapishwe.'
    };
  }

  // 4. Integrate V1.6D Price & Stock Trust
  const priceStock = resolvePriceStockTrust(product);

  if (priceStock.stock.isOutOfStock || product.status === 'sold_out') {
    return {
      state: 'NOT_AVAILABLE',
      isPurchasable: false,
      displayLabel: 'Imeisha (Sold Out)',
      explanation: 'Idadi ya bidhaa hii imeisha kulingana na data rasmi ya muuzaji.',
      trustDisclaimer: 'Hisa haipatikani kwa ununuzi.'
    };
  }

  if (priceStock.stock.status === 'NOT_PROVIDED') {
    return {
      state: 'LIMITED_INFORMATION',
      isPurchasable: true,
      displayLabel: 'Inapatikana (Idadi Haijawekwa)',
      explanation: 'Tangazo lipo hewani lakini muuzaji hajaweka idadi kamili ya mzigo uliopo.',
      trustDisclaimer: 'Inashauriwa kuthibitisha idadi ya mzigo na muuzaji kabla ya safari.'
    };
  }

  if (priceStock.stock.isStale || priceStock.price.isStale) {
    return {
      state: 'STALE',
      isPurchasable: true,
      displayLabel: 'Inapatikana (Taarifa za Zamani)',
      explanation: 'Bei au idadi ya bidhaa hii haijasasishwa kwa zaidi ya siku 90.',
      trustDisclaimer: 'Muulize muuzaji ili kuthibitisha bei na upatikanaji wa sasa.'
    };
  }

  // Normal, healthy availability
  return {
    state: 'AVAILABLE',
    isPurchasable: true,
    displayLabel: 'Inapatikana Sokoni',
    explanation: 'Bidhaa ipo sokoni na idadi yake imerekodiwa kikamilifu.',
    trustDisclaimer: 'Inapatikana kulingana na rekodi ya muuzaji.'
  };
}

/**
 * Detects conflicts between seller free text (descriptions) and structured location/delivery fields.
 * Principle: Authoritative structured data ALWAYS overrides free text!
 */
export function detectLocationDeliveryConflicts(
  product?: MarketplaceProduct | null,
  locationResult?: FormattedLocationResult | null,
  deliveryResult?: FormattedDeliveryResult | null
): {
  hasLocationConflict: boolean;
  hasDeliveryConflict: boolean;
  conflicts: string[];
  structuredWinsNotice?: string;
} {
  if (!product || !locationResult || !deliveryResult) {
    return {
      hasLocationConflict: false,
      hasDeliveryConflict: false,
      conflicts: []
    };
  }

  const desc = product.description || '';
  const conflicts: string[] = [];
  let hasLocationConflict = false;
  let hasDeliveryConflict = false;

  // 1. Neutralize Prompt Injections
  for (const pattern of LOCATION_DELIVERY_INJECTION_PATTERNS) {
    if (pattern.test(desc)) {
      conflicts.push('Maelezo yana kauli ya kujaribu kulazimisha mfumo kutoa ahadi za uongo.');
      break;
    }
  }

  // 2. Delivery Free-text claims vs structured reality
  const claimsNationwide = /\b(tanzania\s+nzima|nchi\s+nzima|popote\s+ulipo|kila\s+mkoa)\b/i.test(desc);
  const claimsDeliveryFree = /\b(delivery\s+ya\s+bure|bure\s+kabisa\s+usafirishaji|free\s+delivery)\b/i.test(desc);
  const claimsDeliveryAnywhere = /\b(tunakuletea\s+popote|tunaleta\s+popote|tunafikisha\s+popote)\b/i.test(desc);

  if (claimsNationwide && Array.isArray(deliveryResult.deliveryAreas) && deliveryResult.deliveryAreas.length > 0 && !deliveryResult.deliveryAreas.includes('Tanzania Nzima')) {
    hasDeliveryConflict = true;
    conflicts.push(
      `Maelezo yanasema usafirishaji ni "nchi nzima", lakini maeneo yaliyosajiliwa rasmi ni [${deliveryResult.deliveryAreas.join(', ')}]. Maeneo rasmi ndiyo yanayotumika.`
    );
  }

  if (claimsDeliveryFree && deliveryResult.feeType !== 'FREE' && deliveryResult.deliveryFee !== 0) {
    hasDeliveryConflict = true;
    conflicts.push(
      'Maelezo yanadai usafirishaji ni wa bure, lakini kisanduku cha mfumo hakijaweka usafirishaji wa bure. Bei ya mfumo ina kipaumbele.'
    );
  }

  if (claimsDeliveryAnywhere && !deliveryResult.deliveryAvailable) {
    hasDeliveryConflict = true;
    conflicts.push(
      'Maelezo yanadai kuleta mzigo popote, lakini muuzaji hajawezesha huduma rasmi ya usafirishaji (Delivery Available) kwenye mfumo.'
    );
  }

  // 3. Location claims
  const claimsNearbyAnywhere = /\b(tupo\s+karibu\s+na\s+wewe|tupo\s+kila\s+mahali|popote\s+ulipo\s+tupo)\b/i.test(desc);
  if (claimsNearbyAnywhere && locationResult.status !== 'LOCATION_NOT_PROVIDED') {
    hasLocationConflict = true;
    conflicts.push(
      `Maelezo yanadai muuzaji yupo "kila mahali", lakini eneo rasmi lililosajiliwa ni ${locationResult.displayLocation}.`
    );
  }

  const structuredWinsNotice = conflicts.length > 0
    ? `Mfumo unazingatia data rasmi zilizosajiliwa ([${locationResult.displayLocation}], Usafirishaji: ${deliveryResult.displayDelivery}) na hauzingatii ahadi za maneno yasiyothibitishwa.`
    : undefined;

  return {
    hasLocationConflict,
    hasDeliveryConflict,
    conflicts,
    structuredWinsNotice
  };
}

/**
 * Live validation helper for modal creation/editing forms before saving.
 */
export function checkDraftLocationDeliveryConflicts(
  description: string,
  locationData: {
    region?: string;
    district?: string;
    area?: string;
  },
  deliveryData: {
    deliveryAvailable?: boolean;
    pickupAvailable?: boolean;
    deliveryFeeType?: DeliveryFeeType;
    deliveryFee?: number | null;
    deliveryAreas?: string[];
  }
): string[] {
  const dummyProduct: any = {
    productId: 'draft',
    sellerId: 'draft',
    title: 'draft',
    description,
    price: 1000,
    unit: 'kizio',
    category: 'Vifaa',
    status: 'active',
    location: locationData.region || 'Tanzania',
    region: locationData.region,
    district: locationData.district,
    area: locationData.area,
    deliveryAvailable: deliveryData.deliveryAvailable,
    pickupAvailable: deliveryData.pickupAvailable,
    deliveryFeeType: deliveryData.deliveryFeeType,
    deliveryFee: deliveryData.deliveryFee,
    deliveryAreas: deliveryData.deliveryAreas,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const loc = resolveLocationTrust(dummyProduct);
  const del = resolveDeliveryTrust(dummyProduct);
  return detectLocationDeliveryConflicts(dummyProduct, loc, del).conflicts;
}

/**
 * Resolves complete Location, Delivery & Availability Trust bundle for a product.
 */
export function resolveLocationDeliveryTrust(
  product?: MarketplaceProduct | null,
  shop?: DigitalShop | null
): ProductLocationDeliveryTrust {
  const location = resolveLocationTrust(product, shop);
  const delivery = resolveDeliveryTrust(product);
  const availability = resolveProductAvailability(product, shop);
  const conflictReport = detectLocationDeliveryConflicts(product, location, delivery);

  const trustNotice = 'Taarifa za eneo na usafirishaji zinasomwa kutoka vyanzo rasmi vya data vya Gulio. ' +
    'Mfumo haubuni umbali wala kutoa ahadi za usafirishaji ambazo hazijasajiliwa na muuzaji.';

  return {
    location,
    delivery,
    availability,
    hasDescriptionLocationConflict: conflictReport.hasLocationConflict,
    hasDescriptionDeliveryConflict: conflictReport.hasDeliveryConflict,
    conflicts: conflictReport.conflicts,
    structuredWinsNotice: conflictReport.structuredWinsNotice,
    trustNotice
  };
}

/**
 * Strict Location Match Evaluation (Zero-Hallucination, Zero-Nearby-Guesswork).
 * 
 * Rules:
 * - If user provides only "Morogoro" and seller is "Morogoro", says "Muuzaji yupo mkoa wa Morogoro".
 * - Never calculates kilometers, never invents travel time, never says "yupo karibu nawe".
 */
export function evaluateLocationMatch(
  productLocation: string | undefined,
  userLocationQuery: string | undefined
): {
  isCompatible: boolean;
  matchLevel: 'REGION' | 'DISTRICT' | 'NONE';
  factualExplanation: string;
} {
  const pLoc = cleanGeo(productLocation);
  const uLoc = cleanGeo(userLocationQuery);

  if (!uLoc || !pLoc) {
    return {
      isCompatible: false,
      matchLevel: 'NONE',
      factualExplanation: 'Eneo halijaainishwa kikamilifu kwa ulinganishi.'
    };
  }

  // Exact district or region string matching
  if (pLoc.includes(uLoc) || uLoc.includes(pLoc)) {
    return {
      isCompatible: true,
      matchLevel: 'REGION',
      factualExplanation: `Muuzaji ameorodheshwa katika eneo la ${productLocation}.`
    };
  }

  return {
    isCompatible: false,
    matchLevel: 'NONE',
    factualExplanation: `Eneo la bidhaa (${productLocation}) linatofautiana na eneo lililotafutwa (${userLocationQuery}).`
  };
}

/**
 * Validates delivery input fields before saving.
 */
export function validateDeliveryInput(params: {
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  deliveryAreas?: string[];
  deliveryFee?: number | null;
  deliveryFeeType?: DeliveryFeeType;
  deliveryTimeEstimate?: string | null;
}): { isValid: boolean; error?: string } {
  if (params.deliveryFee !== undefined && params.deliveryFee !== null) {
    if (isNaN(Number(params.deliveryFee)) || Number(params.deliveryFee) < 0) {
      return {
        isValid: false,
        error: 'Gharama ya usafirishaji (Delivery Fee) haiwezi kuwa namba hasi.'
      };
    }
  }

  if (params.deliveryAvailable && params.deliveryAreas && params.deliveryAreas.length > 0) {
    const invalid = params.deliveryAreas.some((a) => !a || !a.trim());
    if (invalid) {
      return {
        isValid: false,
        error: 'Kuna eneo la usafirishaji lenye jina tupu.'
      };
    }
  }

  return { isValid: true };
}

/**
 * Updates Product Delivery & Location settings in Firestore with ownership validation.
 */
export async function updateProductLocationAndDelivery(
  product: MarketplaceProduct,
  updates: {
    productLocation?: string;
    region?: string;
    district?: string;
    area?: string;
    deliveryAvailable?: boolean;
    deliveryType?: DeliveryType;
    deliveryAreas?: string[];
    deliveryAreaLevel?: DeliveryAreaLevel;
    pickupAvailable?: boolean;
    pickupAddress?: string;
    deliveryFee?: number | null;
    deliveryFeeType?: DeliveryFeeType;
    deliveryTimeEstimate?: string | null;
  }
): Promise<MarketplaceProduct> {
  const ownership = validateProductOwnership(product);
  if (!ownership.isValid) {
    throw new Error('Huna ruhusa ya kurekebisha bidhaa hii.');
  }

  const validation = validateDeliveryInput({
    deliveryAvailable: updates.deliveryAvailable ?? product.deliveryAvailable ?? false,
    pickupAvailable: updates.pickupAvailable ?? product.pickupAvailable ?? false,
    deliveryAreas: updates.deliveryAreas,
    deliveryFee: updates.deliveryFee,
    deliveryFeeType: updates.deliveryFeeType,
    deliveryTimeEstimate: updates.deliveryTimeEstimate
  });

  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const now = new Date().toISOString();
  const payload: any = {
    ...updates,
    deliveryUpdatedAt: now,
    productLocationUpdatedAt: now,
    updatedAt: now
  };

  // If region or district provided, keep location in sync
  if (updates.region || updates.district || updates.area) {
    const parts = [updates.area, updates.district, updates.region].filter(Boolean);
    if (parts.length > 0) {
      payload.location = parts.join(', ');
      payload.productLocation = parts.join(', ');
      payload.productLocationType = 'PRODUCT_LOCATION';
    }
  }

  const docRef = doc(db, 'marketplaceProducts', product.productId);
  await updateDoc(docRef, payload);

  return {
    ...product,
    ...payload
  };
}
