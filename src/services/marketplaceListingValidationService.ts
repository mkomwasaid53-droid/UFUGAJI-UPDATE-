/**
 * V1.7B — Governed Marketplace Listing Validation Service
 * Phase 6: Marketplace Governance
 *
 * Core Principles:
 * 1. Every Marketplace listing must pass deterministic validation before it can become publicly ACTIVE.
 * 2. Conceptual flow:
 *    SELLER -> SELLER IDENTITY -> DIGITAL SHOP -> PRODUCT -> GOVERNED CATEGORY -> LISTING VALIDATION -> TRUST DATA CHECK -> MARKETPLACE ACTIVE LISTING
 * 3. Authoritative validation relies on:
 *    - Authenticated Firebase user
 *    - Authoritative Seller identity
 *    - Digital Shop ownership (shop.sellerId === authenticated user)
 *    - Product ownership (product.sellerId === shopId === authenticated user)
 *    - Governed Category from V1.7A (valid categoryId, ACTIVE status, livestock/agriculture domain)
 *    - V1.6 Trust data (Price, Stock, Location, Delivery)
 * 4. Deterministic results: VALID, INCOMPLETE, INVALID, BLOCKED, UNAVAILABLE.
 * 5. Prompt injection, seller text claims, AI claims, and images/videos CANNOT override validation.
 * 6. V1.7C AI Assisted Classification is NOT implemented here.
 */

import { MarketplaceProduct, ProductStatus } from '../types/marketplace';
import {
  ListingValidationResult,
  ListingValidationStatus,
  ListingValidationCheck,
  ListingValidationError,
  ListingValidationWarning,
  ListingValidationCheckType,
  CheckStatus
} from '../types/marketplaceListingValidation';
import { GovernedCategory } from '../types/marketplaceCategory';
import {
  getLocalCachedCategories,
  findCategoryById,
  validateProductCategoryAssignment
} from './marketplaceCategoryService';
import { sanitizeProductDescription } from './productOwnershipService';
import { validatePriceValue, validateStockValue } from './productPriceStockService';

export const VALIDATION_VERSION = 'V1.7B';

// Allowed livestock & agriculture root categories and keywords
const ALLOWED_MARKETPLACE_DOMAINS = [
  'mifugo',
  'poultry',
  'kuku',
  'ngombe',
  'mbuzi',
  'kondoo',
  'nguruwe',
  'sungura',
  'dawa',
  'veterinary',
  'chakula',
  'feed',
  'vifaranga',
  'mayai',
  'vifaa',
  'mashine',
  'pembejeo',
  'kilimo',
  'mbegu',
  'chanjo',
  'madini',
  'usafi'
];

export interface ValidateListingOptions {
  product: Partial<MarketplaceProduct>;
  authenticatedUserId?: string | null;
  targetStatus?: ProductStatus;
  isNewListing?: boolean;
  governedCategories?: GovernedCategory[];
  isAdmin?: boolean;
}

/**
 * Validates a Marketplace product listing deterministically.
 */
export function validateMarketplaceListing(
  options: ValidateListingOptions
): ListingValidationResult {
  const {
    product,
    authenticatedUserId,
    targetStatus = product?.status || 'draft',
    isNewListing = false,
    governedCategories = getLocalCachedCategories(),
    isAdmin = false
  } = options;

  const checks: ListingValidationCheck[] = [];
  const errors: ListingValidationError[] = [];
  const warnings: ListingValidationWarning[] = [];

  const addCheck = (
    checkType: ListingValidationCheckType,
    status: CheckStatus,
    message: string,
    code?: string,
    details?: string
  ) => {
    checks.push({ checkType, status, message, code, details });
    if (status === 'FAILED' && code) {
      errors.push({ checkType, code, message });
    } else if (status === 'WARNING' && code) {
      warnings.push({ checkType, code, message });
    }
  };

  const cleanProductId = (product?.productId || '').trim();
  const cleanSellerId = (product?.sellerId || '').trim();
  const cleanShopId = (product?.shopId || '').trim();
  const isActiveTarget = targetStatus === 'active';

  // ---------------------------------------------------------------------------
  // 1. SELLER IDENTITY CHECK
  // ---------------------------------------------------------------------------
  if (!authenticatedUserId || !authenticatedUserId.trim()) {
    addCheck(
      'SELLER_IDENTITY',
      'FAILED',
      'Muuzaji hajatambuliwa. Lazima uingie kwenye akaunti yako kwanza.',
      'SELLER_NOT_FOUND'
    );
  } else {
    const cleanAuthUid = authenticatedUserId.trim();
    if (cleanSellerId && cleanSellerId !== cleanAuthUid && !isAdmin) {
      addCheck(
        'SELLER_IDENTITY',
        'FAILED',
        'Kitambulisho cha muuzaji hakilingani na akaunti yako iliyoingia.',
        'SELLER_IDENTITY_INVALID'
      );
    } else {
      addCheck(
        'SELLER_IDENTITY',
        'PASSED',
        'Utambulisho wa muuzaji umethibitishwa kikamilifu.'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. SHOP OWNERSHIP CHECK
  // ---------------------------------------------------------------------------
  if (cleanSellerId) {
    if (cleanShopId && cleanShopId !== cleanSellerId && !isAdmin) {
      addCheck(
        'SHOP_OWNERSHIP',
        'FAILED',
        'Duka la bidhaa halilingani na umiliki halisi wa muuzaji.',
        'SHOP_OWNERSHIP_INVALID'
      );
    } else if (!cleanShopId && isActiveTarget) {
      addCheck(
        'SHOP_OWNERSHIP',
        'FAILED',
        'Tangazo halijaunganishwa na duka lililoidhinishwa la muuzaji.',
        'SHOP_NOT_FOUND'
      );
    } else {
      addCheck(
        'SHOP_OWNERSHIP',
        'PASSED',
        'Umiliki wa duka la kidijitali umethibitishwa.'
      );
    }
  } else {
    addCheck(
      'SHOP_OWNERSHIP',
      'FAILED',
      'Umiliki wa duka hauwezi kuthibitishwa bila kitambulisho cha muuzaji.',
      'SHOP_OWNERSHIP_INVALID'
    );
  }

  // ---------------------------------------------------------------------------
  // 3. PRODUCT OWNERSHIP CHECK
  // ---------------------------------------------------------------------------
  if (!cleanProductId && isActiveTarget) {
    addCheck(
      'PRODUCT_OWNERSHIP',
      'FAILED',
      'Bidhaa haina kitambulisho halali (Product ID).',
      'PRODUCT_OWNERSHIP_INVALID'
    );
  } else if (cleanSellerId && authenticatedUserId && cleanSellerId !== authenticatedUserId.trim() && !isAdmin) {
    addCheck(
      'PRODUCT_OWNERSHIP',
      'FAILED',
      'Huwezi kubadilisha au kuwasha bidhaa ya muuzaji mwingine.',
      'PRODUCT_OWNERSHIP_INVALID'
    );
  } else {
    addCheck(
      'PRODUCT_OWNERSHIP',
      'PASSED',
      'Umiliki wa bidhaa umethibitishwa kwenye mlolongo wa muuzaji.'
    );
  }

  // ---------------------------------------------------------------------------
  // 4. CATEGORY & CATEGORY_STATUS CHECK (V1.7A INTEGRATION)
  // ---------------------------------------------------------------------------
  const rawCategoryId = (product?.categoryId || '').trim();
  const rawSubcategoryId = (product?.subcategoryId || '').trim();
  const rawCategoryName = (product?.category || '').trim();

  // Rule: categoryName alone is NOT authoritative. categoryId is mandatory for ACTIVE listings.
  if (!rawCategoryId) {
    if (isActiveTarget) {
      addCheck(
        'CATEGORY',
        'FAILED',
        'Chagua kundi lililoidhinishwa (Category ID) la sokoni. Jina la maandishi pekee halikubaliki.',
        'CATEGORY_REQUIRED'
      );
    } else {
      addCheck(
        'CATEGORY',
        'WARNING',
        'Kundi lililoidhinishwa la bidhaa (Category) halijachaguliwa bado.',
        'CATEGORY_REQUIRED'
      );
    }
  } else {
    const categoryAssignment = validateProductCategoryAssignment(
      rawCategoryId,
      rawSubcategoryId,
      isNewListing,
      governedCategories
    );

    if (!categoryAssignment.isValid) {
      let errCode: string = categoryAssignment.errorCode || 'CATEGORY_NOT_FOUND';
      if (errCode === 'INVALID_HIERARCHY_RELATION') {
        errCode = 'SUBCATEGORY_PARENT_MISMATCH';
      }
      addCheck(
        'CATEGORY',
        'FAILED',
        categoryAssignment.error || 'Category haipo kwenye mfumo wa Marketplace.',
        errCode
      );
    } else {
      const matchedCategory = categoryAssignment.category;
      if (!matchedCategory) {
        addCheck(
          'CATEGORY',
          'FAILED',
          'Kundi la bidhaa halikupatikana kwenye mfumo uliosimamiwa.',
          'CATEGORY_NOT_FOUND'
        );
      } else {
        // Status check
        if (matchedCategory.status !== 'ACTIVE' && isActiveTarget) {
          addCheck(
            'CATEGORY_STATUS',
            'FAILED',
            `Kundi "${matchedCategory.name}" limesitishwa na haliruhusiwi kwa matangazo mapya au amilifu.`,
            'CATEGORY_INACTIVE'
          );
        } else {
          addCheck(
            'CATEGORY',
            'PASSED',
            `Kundi lililoidhinishwa: ${matchedCategory.name} (${matchedCategory.categoryId})`
          );
          addCheck(
            'CATEGORY_STATUS',
            'PASSED',
            'Hali ya kundi la bidhaa ni amilifu (ACTIVE).'
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. MARKETPLACE ELIGIBILITY (LIVESTOCK & AGRICULTURE DOMAIN)
  // ---------------------------------------------------------------------------
  if (rawCategoryId) {
    const matchedCategory = findCategoryById(rawCategoryId, governedCategories);
    if (matchedCategory) {
      // Governed categories are guaranteed livestock/agriculture.
      const domainSlug = (matchedCategory.slug || '').toLowerCase();
      const domainName = (matchedCategory.name || '').toLowerCase();
      const isEligibleDomain = ALLOWED_MARKETPLACE_DOMAINS.some(
        (kw) => domainSlug.includes(kw) || domainName.includes(kw)
      ) || matchedCategory.categoryType === 'ROOT' || !!matchedCategory.parentCategoryId;

      if (!isEligibleDomain) {
        addCheck(
          'MARKETPLACE_ELIGIBILITY',
          'FAILED',
          'Kundi hili haliruhusiwi kwenye Marketplace ya Mifugo na Kilimo.',
          'MARKETPLACE_CATEGORY_NOT_ALLOWED'
        );
      } else {
        addCheck(
          'MARKETPLACE_ELIGIBILITY',
          'PASSED',
          'Bidhaa ipo ndani ya wigo wa Mifugo na Kilimo (Livestock & Agriculture).'
        );
      }
    } else {
      addCheck(
        'MARKETPLACE_ELIGIBILITY',
        'FAILED',
        'Category haijatambuliwa katika orodha ya sokoni.',
        'MARKETPLACE_CATEGORY_NOT_ALLOWED'
      );
    }
  } else {
    if (isActiveTarget) {
      addCheck(
        'MARKETPLACE_ELIGIBILITY',
        'FAILED',
        'Uhalali wa bidhaa sokoni hauwezi kuthibitishwa bila kundi halali.',
        'MARKETPLACE_CATEGORY_NOT_ALLOWED'
      );
    } else {
      addCheck(
        'MARKETPLACE_ELIGIBILITY',
        'WARNING',
        'Kundi la bidhaa halijachaguliwa kuthibitisha uhalali wa sokoni.',
        'MARKETPLACE_CATEGORY_NOT_ALLOWED'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 6. PRODUCT NAME (TITLE) VALIDATION
  // ---------------------------------------------------------------------------
  const rawTitle = (product?.title || '').trim();
  if (!rawTitle) {
    addCheck(
      'PRODUCT_NAME',
      'FAILED',
      'Jina la bidhaa linahitajika na haliwezi kuwa tupu.',
      'PRODUCT_NAME_REQUIRED'
    );
  } else if (rawTitle.length < 3) {
    addCheck(
      'PRODUCT_NAME',
      'FAILED',
      'Jina la bidhaa ni fupi mno (angalau herufi 3 zinahitajika).',
      'PRODUCT_NAME_TOO_SHORT'
    );
  } else if (rawTitle.length > 150) {
    addCheck(
      'PRODUCT_NAME',
      'FAILED',
      'Jina la bidhaa ni refu kupita kiasi (zisizidi herufi 150).',
      'PRODUCT_NAME_INVALID'
    );
  } else if (/<script|javascript:|on\w+=/i.test(rawTitle)) {
    addCheck(
      'PRODUCT_NAME',
      'FAILED',
      'Jina la bidhaa lina herufi au misimbo isiyo salama.',
      'PRODUCT_NAME_INVALID'
    );
  } else {
    addCheck(
      'PRODUCT_NAME',
      'PASSED',
      'Jina la bidhaa ni sahihi na linakubalika.'
    );
  }

  // ---------------------------------------------------------------------------
  // 7. DESCRIPTION VALIDATION
  // ---------------------------------------------------------------------------
  const rawDescription = (product?.description || '').trim();
  if (rawDescription) {
    if (rawDescription.length > 3000) {
      addCheck(
        'DESCRIPTION',
        'FAILED',
        'Maelezo ya bidhaa ni marefu mno (yasizidi herufi 3,000).',
        'DESCRIPTION_INVALID'
      );
    } else {
      const sanitized = sanitizeProductDescription(rawDescription);
      if (sanitized.hasUnverifiedAuthorityClaims || sanitized.hasPromptInjection) {
        addCheck(
          'DESCRIPTION',
          'WARNING',
          'Maelezo yana kauli zinazofanana na majaribio ya kubadili uthibitisho wa mfumo (yamesafishwa kuzuia athari).',
          'DESCRIPTION_CONTAINS_UNTRUSTED_CLAIMS'
        );
      } else {
        addCheck(
          'DESCRIPTION',
          'PASSED',
          'Maelezo ya bidhaa yameidhinishwa na kusafishwa.'
        );
      }
    }
  } else {
    // Description is optional according to marketplace model
    addCheck(
      'DESCRIPTION',
      'WARNING',
      'Maelezo ya ziada ya bidhaa hayajawekwa (inashauriwa kueleza sifa za bidhaa).',
      'DESCRIPTION_EMPTY'
    );
  }

  // ---------------------------------------------------------------------------
  // 8. PRICE VALIDATION (V1.6D INTEGRATION)
  // ---------------------------------------------------------------------------
  const rawPrice = product?.price;
  const priceValidation = validatePriceValue(rawPrice);

  if (rawPrice === undefined || rawPrice === null || (typeof rawPrice === 'string' && (rawPrice as string).trim() === '') || Number.isNaN(rawPrice)) {
    if (isActiveTarget) {
      addCheck(
        'PRICE',
        'FAILED',
        'Bei ya bidhaa inahitajika kwa tangazo kuwa amilifu (ACTIVE).',
        'PRICE_REQUIRED'
      );
    } else {
      addCheck(
        'PRICE',
        'WARNING',
        'Bei ya bidhaa haijawekwa kwenye rasimu hii.',
        'PRICE_REQUIRED'
      );
    }
  } else if (!priceValidation.isValid) {
    const isNegative = typeof rawPrice === 'number' && rawPrice < 0;
    addCheck(
      'PRICE',
      'FAILED',
      priceValidation.error || 'Bei ya bidhaa si sahihi (lazima iwe namba na isiwe hasi au sifuri).',
      isNegative ? 'PRICE_NEGATIVE' : 'PRICE_INVALID'
    );
  } else {
    const currency = product?.currency;
    if (currency && currency !== 'TZS' && currency !== 'Tsh') {
      addCheck(
        'PRICE',
        'FAILED',
        'Sarafu inayoruhusiwa ni TZS (Shilingi ya Kitanzania) pekee.',
        'PRICE_INVALID'
      );
    } else {
      addCheck(
        'PRICE',
        'PASSED',
        `Bei halali: Tsh ${priceValidation.cleanPrice?.toLocaleString()}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 9. STOCK VALIDATION (V1.6D INTEGRATION)
  // ---------------------------------------------------------------------------
  const rawStock = product?.quantityAvailable;
  const stockValidation = validateStockValue(rawStock, product?.status);

  if (rawStock === undefined || rawStock === null || (typeof rawStock === 'string' && (rawStock as string).trim() === '') || Number.isNaN(rawStock)) {
    if (isActiveTarget) {
      addCheck(
        'STOCK',
        'FAILED',
        'Idadi ya bidhaa inayopatikana inahitajika.',
        'STOCK_REQUIRED'
      );
    } else {
      addCheck(
        'STOCK',
        'WARNING',
        'Idadi inayopatikana haijawekwa.',
        'STOCK_REQUIRED'
      );
    }
  } else if (!stockValidation.isValid) {
    const isNeg = typeof rawStock === 'number' && rawStock < 0;
    addCheck(
      'STOCK',
      'FAILED',
      stockValidation.error || 'Idadi ya bidhaa inayopatikana si sahihi (lazima iwe namba na isiwe hasi).',
      isNeg ? 'STOCK_NEGATIVE' : 'STOCK_INVALID'
    );
  } else {
    const rawUnit = (product?.unit || '').trim();
    if (!rawUnit && isActiveTarget) {
      addCheck(
        'STOCK',
        'FAILED',
        'Kipimo cha bidhaa (k.m. kuku, trei, mfuko, lita) kinahitajika.',
        'STOCK_INVALID'
      );
    } else {
      addCheck(
        'STOCK',
        'PASSED',
        `Idadi halali: ${stockValidation.cleanQuantity} ${rawUnit || ''}`
      );
    }

    // Check for conflict between free text and structured stock
    const combinedText = `${product?.title || ''} ${product?.description || ''}`.toLowerCase();
    const soldOutKeywords = ['imeisha', 'zimeisha', 'sold out', 'zimeuzwa', 'sina tena', 'hakuna tena'];
    const hasSoldOutText = soldOutKeywords.some((kw) => combinedText.includes(kw));
    if (hasSoldOutText && stockValidation.isValid && (stockValidation.cleanQuantity || 0) > 0) {
      addCheck(
        'STOCK',
        'WARNING',
        'Maelezo ya bidhaa yanadokeza kuwa bidhaa imeisha lakini idadi rasmi iliyowekwa ni zaidi ya sifuri. Idadi rasmi ya mfumo inachukua kipaumbele.',
        'STOCK_TEXT_CONFLICT'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 10. LOCATION VALIDATION (V1.6E INTEGRATION)
  // ---------------------------------------------------------------------------
  const rawLocation = (product?.location || product?.region || product?.productLocation || '').trim();
  if (!rawLocation) {
    if (isActiveTarget) {
      addCheck(
        'LOCATION',
        'FAILED',
        'Mahali bidhaa ilipo (Location/Mkoa) panahitajika ili wanunuzi waone umbali.',
        'LOCATION_REQUIRED'
      );
    } else {
      addCheck(
        'LOCATION',
        'WARNING',
        'Mahali bidhaa ilipo hapajawekwa.',
        'LOCATION_REQUIRED'
      );
    }
  } else {
    addCheck(
      'LOCATION',
      'PASSED',
      `Eneo la bidhaa limeidhinishwa: ${rawLocation}`
    );

    // Free text conflict check
    const descText = (product?.description || '').toLowerCase();
    if (descText) {
      const knownRegions = [
        'arusha', 'daresalaam', 'dar es salaam', 'dodoma', 'mwanza', 'mbeya', 'morogoro', 'tanga', 'kilimanjaro', 'moshi', 'kigoma', 'tabora', 'iringa'
      ];
      const locLower = rawLocation.toLowerCase();
      const conflictRegion = knownRegions.find(
        (r) => descText.includes(r) && !locLower.includes(r)
      );
      if (conflictRegion) {
        addCheck(
          'LOCATION',
          'WARNING',
          `Maelezo yanataja eneo tofauti (${conflictRegion}) na eneo rasmi lililochaguliwa (${rawLocation}). Eneo rasmi linachukua kipaumbele.`,
          'LOCATION_TEXT_CONFLICT'
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 11. DELIVERY & PICKUP VALIDATION (V1.6E INTEGRATION)
  // ---------------------------------------------------------------------------
  if (product?.deliveryFee !== undefined && product?.deliveryFee !== null && String(product.deliveryFee).trim() !== '') {
    const feeNum = Number(product.deliveryFee);
    if (isNaN(feeNum) || feeNum < 0) {
      addCheck(
        'DELIVERY',
        'FAILED',
        'Gharama ya usafirishaji haiwezi kuwa hasi au isiyo nambari.',
        'DELIVERY_FEE_NEGATIVE'
      );
    } else {
      addCheck(
        'DELIVERY',
        'PASSED',
        `Gharama ya usafirishaji imeidhinishwa: Tsh ${feeNum.toLocaleString()}`
      );
    }
  }

  if (product?.deliveryAvailable) {
    const areas = Array.isArray(product.deliveryAreas) ? product.deliveryAreas : [];
    if (!product.deliveryFeeType && areas.length === 0) {
      addCheck(
        'DELIVERY',
        'WARNING',
        'Huduma ya usafirishaji imewashwa lakini maeneo au nauli haijawekwa bayana.',
        'DELIVERY_AREAS_RECOMMENDED'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 12. MEDIA (IMAGES & VIDEO) VALIDATION
  // ---------------------------------------------------------------------------
  let hasBadMediaUrl = false;
  if (product?.imageUrl && typeof product.imageUrl === 'string') {
    if (product.imageUrl.startsWith('javascript:') || product.imageUrl.includes('<script')) {
      addCheck(
        'MEDIA',
        'FAILED',
        'URL ya picha ina msimbo usio salama (javascript/script).',
        'MEDIA_INVALID_IMAGE_URL'
      );
      hasBadMediaUrl = true;
    }
  }

  if (Array.isArray(product?.images)) {
    for (const img of product.images) {
      if (img && img.url && (img.url.startsWith('javascript:') || img.url.includes('<script'))) {
        addCheck(
          'MEDIA',
          'FAILED',
          'URL ya picha ina msimbo usio salama.',
          'MEDIA_INVALID_IMAGE_URL'
        );
        hasBadMediaUrl = true;
        break;
      }
    }
  }

  const imageCount = (Array.isArray(product?.images) ? product.images.length : 0) + (product?.imageUrl ? 1 : 0);
  const hasVideo = !!(product?.video && product.video.url);

  if (imageCount === 0 && !hasVideo) {
    addCheck(
      'MEDIA',
      'WARNING',
      'Tangazo halina picha wala video. Inashauriwa kuweka angalau picha 1 ili kuvutia wanunuzi.',
      'MEDIA_NO_IMAGES'
    );
  } else if (!hasBadMediaUrl) {
    addCheck(
      'MEDIA',
      'PASSED',
      `Vyombo vya habari vimehakikiwa (${imageCount} picha${hasVideo ? ', video 1' : ''}).`
    );
  }

  // ---------------------------------------------------------------------------
  // 13. PRODUCT STATUS & FINAL EVALUATION
  // ---------------------------------------------------------------------------
  const blockingErrors = errors.filter(
    (e) =>
      e.code === 'CATEGORY_REQUIRED' ||
      e.code === 'CATEGORY_NOT_FOUND' ||
      e.code === 'CATEGORY_INACTIVE' ||
      e.code === 'SUBCATEGORY_NOT_FOUND' ||
      e.code === 'SUBCATEGORY_PARENT_MISMATCH' ||
      e.code === 'INVALID_HIERARCHY_RELATION' ||
      e.code === 'SELLER_NOT_FOUND' ||
      e.code === 'SHOP_NOT_FOUND' ||
      e.code === 'SHOP_OWNERSHIP_INVALID' ||
      e.code === 'PRODUCT_OWNERSHIP_INVALID' ||
      e.code === 'PRODUCT_NAME_REQUIRED' ||
      e.code === 'PRODUCT_NAME_TOO_SHORT' ||
      e.code === 'PRODUCT_NAME_INVALID' ||
      e.code === 'PRICE_REQUIRED' ||
      e.code === 'PRICE_NEGATIVE' ||
      e.code === 'PRICE_INVALID' ||
      e.code === 'STOCK_REQUIRED' ||
      e.code === 'STOCK_NEGATIVE' ||
      e.code === 'STOCK_INVALID' ||
      e.code === 'LOCATION_REQUIRED' ||
      e.code === 'LOCATION_INVALID' ||
      e.code === 'MARKETPLACE_CATEGORY_NOT_ALLOWED' ||
      e.code === 'DESCRIPTION_INVALID' ||
      e.code === 'DELIVERY_FEE_NEGATIVE' ||
      e.code === 'DELIVERY_DATA_INVALID' ||
      e.code === 'MEDIA_INVALID_IMAGE_URL'
  );

  let validationStatus: ListingValidationStatus = 'VALID';
  let isEligibleForActive = false;
  let summaryMessage = 'Tangazo limekidhi vigezo vyote vya Marketplace.';

  if (blockingErrors.length > 0) {
    const hasOwnershipOrBlocked = blockingErrors.some(
      (e) =>
        e.code === 'SELLER_IDENTITY_INVALID' ||
        e.code === 'SHOP_OWNERSHIP_INVALID' ||
        e.code === 'PRODUCT_OWNERSHIP_INVALID' ||
        e.code === 'MARKETPLACE_CATEGORY_NOT_ALLOWED'
    );

    if (hasOwnershipOrBlocked) {
      validationStatus = 'BLOCKED';
      summaryMessage = 'Tangazo limezuiwa kutokana na kutokidhi sheria za umiliki au sera za sokoni.';
    } else {
      const hasMissingRequired = blockingErrors.some(
        (e) =>
          e.code === 'CATEGORY_REQUIRED' ||
          e.code === 'PRODUCT_NAME_REQUIRED' ||
          e.code === 'PRICE_REQUIRED' ||
          e.code === 'STOCK_REQUIRED' ||
          e.code === 'LOCATION_REQUIRED'
      );
      validationStatus = hasMissingRequired ? 'INCOMPLETE' : 'INVALID';
      summaryMessage = 'Tangazo bado halijakidhi masharti ya kuchapishwa sokoni. Tafadhali rekebisha vipengele vilivyooneshwa.';
    }
    isEligibleForActive = false;

    addCheck(
      'LISTING_STATUS',
      'FAILED',
      `Tangazo haliwezi kuwa ACTIVE: Kuna hitilafu ${blockingErrors.length} zinazozuia uchapishaji.`,
      'LISTING_CANNOT_BE_ACTIVE'
    );
  } else {
    validationStatus = 'VALID';
    isEligibleForActive = true;
    addCheck(
      'LISTING_STATUS',
      'PASSED',
      'Tangazo liko tayari kuchapishwa sokoni (ACTIVE).'
    );
  }

  const nowIso = new Date().toISOString();

  return {
    listingId: cleanProductId || `listing_${Date.now()}`,
    productId: cleanProductId,
    sellerId: cleanSellerId,
    shopId: cleanShopId || null,
    validationStatus,
    isEligibleForActive,
    validatedAt: nowIso,
    validatedBy: isAdmin ? 'admin_governance' : 'system_validator',
    validationVersion: VALIDATION_VERSION,
    errors,
    warnings,
    checks,
    summaryMessage
  };
}

/**
 * Asserts that a product is fully valid before allowing ACTIVE status.
 * Throws a formatted Error with Swahili message if invalid.
 */
export function assertListingEligibleForActive(
  options: ValidateListingOptions
): ListingValidationResult {
  const result = validateMarketplaceListing({
    ...options,
    targetStatus: 'active'
  });

  if (!result.isEligibleForActive) {
    const errorDetails = result.errors.map((e) => `• ${e.message}`).join('\n');
    throw new Error(
      `Tangazo haliwezi kuwa ACTIVE kwa sababu halijakidhi vigezo:\n${errorDetails}`
    );
  }

  return result;
}

/**
 * Determines whether a status transition is permitted deterministically.
 * Supports both options object or positional arguments.
 */
export function canTransitionToStatus(
  currentStatusOrOptions:
    | ProductStatus
    | {
        product: Partial<MarketplaceProduct>;
        fromStatus?: ProductStatus;
        toStatus?: ProductStatus;
        authenticatedUserId?: string | null;
        governedCategories?: GovernedCategory[];
        isAdmin?: boolean;
      },
  targetStatusArg?: ProductStatus,
  productArg?: Partial<MarketplaceProduct>,
  authenticatedUserIdArg?: string | null,
  governedCategoriesArg?: GovernedCategory[],
  isAdminArg?: boolean
): {
  allowed: boolean;
  reason?: string;
  blockingErrors: ListingValidationError[];
  validationResult: ListingValidationResult;
} {
  let product: Partial<MarketplaceProduct>;
  let targetStatus: ProductStatus;
  let authenticatedUserId: string | null | undefined;
  let governedCategories: GovernedCategory[] | undefined;
  let isAdmin: boolean | undefined;

  if (typeof currentStatusOrOptions === 'object' && currentStatusOrOptions !== null) {
    product = currentStatusOrOptions.product;
    targetStatus = currentStatusOrOptions.toStatus || 'active';
    authenticatedUserId = currentStatusOrOptions.authenticatedUserId;
    governedCategories = currentStatusOrOptions.governedCategories;
    isAdmin = currentStatusOrOptions.isAdmin;
  } else {
    targetStatus = targetStatusArg || 'active';
    product = productArg || {};
    authenticatedUserId = authenticatedUserIdArg;
    governedCategories = governedCategoriesArg;
    isAdmin = isAdminArg;
  }

  const validation = validateMarketplaceListing({
    product,
    authenticatedUserId,
    targetStatus,
    governedCategories,
    isAdmin
  });

  if (targetStatus === 'active') {
    if (!validation.isEligibleForActive) {
      return {
        allowed: false,
        reason: validation.summaryMessage,
        blockingErrors: validation.errors,
        validationResult: validation
      };
    }
  }

  return {
    allowed: true,
    blockingErrors: [],
    validationResult: validation
  };
}
