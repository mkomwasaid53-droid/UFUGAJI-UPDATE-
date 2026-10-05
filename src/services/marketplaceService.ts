import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { classifyFirestoreError } from '../utils/firestoreErrorClassifier';
import {
  MarketplaceProduct,
  ProductImage,
  ProductVideo,
  SellerProfile,
  ProductStatus,
  DigitalShop,
  ShopCatalogue,
  ProductOwnershipValidation
} from '../types/marketplace';
import {
  INITIAL_SAMPLE_PRODUCTS,
  INITIAL_SAMPLE_SHOPS,
  INITIAL_SAMPLE_CATALOGUES
} from '../data/marketplaceData';
import { sellerVerificationService } from './sellerVerificationService';
import {
  validateProductOwnership,
  assertAuthorizedProductOperation,
  sanitizeProductDescription
} from './productOwnershipService';
import {
  validatePriceValue,
  validateStockValue
} from './productPriceStockService';
import {
  validateProductCategoryAssignment
} from './marketplaceCategoryService';
import {
  validateMarketplaceListing,
  assertListingEligibleForActive
} from './marketplaceListingValidationService';
import {
  assertSellerNotRestricted,
  checkSellerRestriction
} from './sellerGovernanceService';
import {
  syncAuthoritativeModerationState,
  isProductMarketplaceEligible,
  filterMarketplaceEligibleProducts,
  assertListingCanBeActivated,
  isShopMarketplaceEligible,
  canSellerSellOnMarketplace
} from './marketplaceGovernanceEnforcement';

const LOCAL_PRODUCTS_CACHE_KEY = 'ufugaji_marketplace_products_cache';
const LOCAL_SELLER_PROFILES_KEY = 'ufugaji_seller_profiles_cache';
const LOCAL_DIGITAL_SHOPS_KEY = 'ufugaji_digital_shops_cache';
const LOCAL_CATALOGUES_KEY = 'ufugaji_shop_catalogues_cache';

// Helper to get local cached products (always synced with authoritative moderation state)
export function getLocalCachedProducts(): MarketplaceProduct[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_PRODUCTS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Strictly filter out any legacy demo or test listings
        const realProducts = parsed
          .filter((p: MarketplaceProduct) =>
            p &&
            !p.isTestDemo &&
            !p.productId?.startsWith('demo-') &&
            !p.sellerId?.startsWith('demo-seller-')
          )
          .map(syncAuthoritativeModerationState);

        if (realProducts.length !== parsed.length) {
          saveProductsToLocalCache(realProducts);
        }
        return realProducts;
      }
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya bidhaa za soko:', err);
  }
  return [];
}


// Helper to save products to local cache with automatic quota overflow protection
export function saveProductsToLocalCache(products: MarketplaceProduct[]): void {
  try {
    localStorage.setItem(LOCAL_PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi akiba ya bidhaa (Quota overflow protection iko kazini):', err);
    try {
      // If quota exceeded, sanitize images that are huge base64 strings to save space
      const sanitized = products.map((p) => {
        const hasBase64 = (p.imageUrl && p.imageUrl.startsWith('data:image/')) ||
          (p.images && p.images.some((img) => img.url && img.url.startsWith('data:image/')));
        if (!hasBase64) return p;
        return {
          ...p,
          imageUrl: p.imageUrl && p.imageUrl.startsWith('data:image/') ? '' : p.imageUrl,
          images: (p.images || []).map((img) => ({
            ...img,
            url: img.url.startsWith('data:image/') ? '' : img.url,
            thumbnailUrl: img.thumbnailUrl && img.thumbnailUrl.startsWith('data:image/') ? '' : img.thumbnailUrl,
          })),
        };
      });
      localStorage.setItem(LOCAL_PRODUCTS_CACHE_KEY, JSON.stringify(sanitized));
    } catch (innerErr) {
      console.warn('Haikuweza kuhifadhi hata baada ya kusafisha picha:', innerErr);
    }
  }
}

// Sanitize product object so undefined keys are never passed to Firestore
export function cleanProductForFirestore(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

// Fetch products from:
// 1. Persistent server API (/api/marketplace/products)
// 2. Firestore database (collection 'marketplaceProducts')
// 3. Local cached products (localStorage)
// 4. Initial sample products (INITIAL_SAMPLE_PRODUCTS)
// All unique products are merged, synced with authoritative governance records,
// deduplicated by productId, and sorted newest first.
// By default, filters out any REJECTED, HIDDEN, SUSPENDED, UNDER_REVIEW,
// or restricted listings so buyers/public never see forbidden listings.
export async function fetchMarketplaceProducts(options?: {
  includeNonEligible?: boolean;
}): Promise<MarketplaceProduct[]> {
  const localList = getLocalCachedProducts();
  const remoteProducts: MarketplaceProduct[] = [];
  const serverProducts: MarketplaceProduct[] = [];

  // 1. Fetch from Server Persistence API (fast & guaranteed across reloads)
  try {
    const res = await fetch('/api/marketplace/products');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        serverProducts.push(...data);
      }
    }
  } catch (err) {
    console.warn('Server marketplace products fetch notice:', err);
  }

  // 2. Fetch from Firestore (relying on native Firestore offline-first sync without artificial race timeout)
  try {
    const productsRef = collection(db, 'marketplaceProducts');
    const snapshot = await getDocs(productsRef);
    if (!snapshot.empty) {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as MarketplaceProduct;
        remoteProducts.push({
          ...data,
          productId: docSnap.id || data.productId,
        });
      });
    }
  } catch (err) {
    const classified = classifyFirestoreError(err);
    console.warn(`[${classified.code}] Firestore marketplace fetch notice (using cache/server fallback):`, classified.message);
  }

  // 3. Intelligently merge all sources to guarantee no published ad is ever lost
  const productMap = new Map<string, MarketplaceProduct>();

  const isRealProduct = (p: MarketplaceProduct) =>
    Boolean(
      p &&
      p.productId &&
      !p.isTestDemo &&
      !p.productId.startsWith('demo-') &&
      !p.sellerId?.startsWith('demo-seller-')
    );

  // Add local products
  for (const p of localList) {
    if (isRealProduct(p)) productMap.set(p.productId, p);
  }

  // Add server-persisted products
  for (const p of serverProducts) {
    if (isRealProduct(p)) productMap.set(p.productId, p);
  }

  // Add remote Firestore products
  for (const p of remoteProducts) {
    if (isRealProduct(p)) productMap.set(p.productId, p);
  }

  // Sync each merged product with authoritative moderation and seller governance state
  const combined = Array.from(productMap.values()).map(syncAuthoritativeModerationState);
  // Sort newest first
  combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  saveProductsToLocalCache(combined);

  // If caller specifically requests unfiltered (e.g. Admin Moderation Queue or Seller Shop Management)
  if (options?.includeNonEligible) {
    return combined;
  }

  // For public Marketplace browsing, search, and AI discovery: strictly eligible products only
  return filterMarketplaceEligibleProducts(combined);
}

// Fetch a single product by ID (always synced with authoritative moderation state)
export async function fetchProductById(productId: string): Promise<MarketplaceProduct | null> {
  // First check local list
  const localList = getLocalCachedProducts();
  let product = localList.find((p) => p.productId === productId) || null;

  try {
    const productRef = doc(db, 'marketplaceProducts', productId);
    const snap = await getDoc(productRef);
    if (snap.exists()) {
      const data = snap.data() as MarketplaceProduct;
      product = {
        ...data,
        productId: snap.id,
      };
    }
  } catch (err) {
    console.warn('Hitilafu ya kupata bidhaa kutoka Firestore:', err);
  }

  if (!product) return null;
  return syncAuthoritativeModerationState(product);
}

// Fetch seller profile for a specific user UID
export async function fetchSellerProfile(uid: string): Promise<SellerProfile | null> {
  if (!uid) return null;

  // Check local cache
  try {
    const raw = localStorage.getItem(`${LOCAL_SELLER_PROFILES_KEY}_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.uid === uid) {
        return parsed;
      }
    }
  } catch {}

  try {
    const profileRef = doc(db, 'users', uid, 'sellerProfile', 'profile');
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const data = snap.data() as SellerProfile;
      try {
        localStorage.setItem(`${LOCAL_SELLER_PROFILES_KEY}_${uid}`, JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Hitilafu ya kupata wasifu wa muuzaji kutoka Firestore:', err);
  }

  return null;
}

// Save or create seller profile (Preserves the farmer identity and /users/{uid} profile intact)
export async function saveSellerProfile(
  uid: string,
  profileData: Partial<SellerProfile>
): Promise<SellerProfile> {
  if (!uid) throw new Error('Hujaingia kwenye mfumo');

  const now = new Date().toISOString();
  const existing = await fetchSellerProfile(uid);

  const merged: SellerProfile = {
    uid,
    businessName: profileData.businessName?.trim() || existing?.businessName || 'Biashara ya Mifugo',
    displayName: profileData.displayName?.trim() || existing?.displayName || 'Muuzaji',
    phone: profileData.phone?.trim() || existing?.phone || '',
    location: profileData.location?.trim() || existing?.location || 'Dar es Salaam',
    region: profileData.region || profileData.location || existing?.region || 'Dar es Salaam',
    district: profileData.district || existing?.district || '',
    description: profileData.description?.trim() || existing?.description || '',
    verificationStatus: existing?.verificationStatus || 'unverified',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    const profileRef = doc(db, 'users', uid, 'sellerProfile', 'profile');
    await setDoc(profileRef, merged, { merge: true });
  } catch (err) {
    console.warn('Haikuweza kuhifadhi kwenye Firestore mara moja, imehifadhiwa ndani ya kifaa:', err);
  }

  // Update local cache
  try {
    localStorage.setItem(`${LOCAL_SELLER_PROFILES_KEY}_${uid}`, JSON.stringify(merged));
  } catch {}

  return merged;
}

// ==========================================
// DIGITAL SHOP (DUKA LA KIDIJITALI) SERVICES
// ==========================================

// Fetch digital shop for a given seller UID
export async function fetchDigitalShop(sellerId: string): Promise<DigitalShop | null> {
  if (!sellerId || sellerId.startsWith('demo-seller-')) return null;

  // Check local cache first
  try {
    const raw = localStorage.getItem(`${LOCAL_DIGITAL_SHOPS_KEY}_${sellerId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as DigitalShop;
      if (parsed && parsed.sellerId === sellerId && !parsed.sellerId.startsWith('demo-seller-')) {
        return parsed;
      }
    }
  } catch {}

  // Fetch from Firestore: /users/{sellerId}/sellerProfile/shop
  try {
    const shopRef = doc(db, 'users', sellerId, 'sellerProfile', 'shop');
    const snap = await getDoc(shopRef);
    if (snap.exists()) {
      const data = snap.data() as DigitalShop;
      const resolvedShop: DigitalShop = {
        ...data,
        shopId: data.shopId || sellerId,
        sellerId,
      };
      try {
        localStorage.setItem(`${LOCAL_DIGITAL_SHOPS_KEY}_${sellerId}`, JSON.stringify(resolvedShop));
      } catch {}
      return resolvedShop;
    }
  } catch (err) {
    console.warn('Hitilafu ya kupata duka la muuzaji kutoka Firestore:', err);
  }

  // If no explicit shop document exists yet, check if sellerProfile exists and synthesize default shop for backward compatibility
  const sellerProf = await fetchSellerProfile(sellerId);
  if (sellerProf) {
    const now = new Date().toISOString();
    const synthesizedShop: DigitalShop = {
      shopId: sellerId,
      sellerId,
      shopName: sellerProf.businessName || 'Duka la Mifugo',
      description: sellerProf.description || 'Karibu kwenye duka letu la mifugo na pembejeo bora.',
      location: sellerProf.location || 'Tanzania',
      region: sellerProf.region || sellerProf.location || 'Dar es Salaam',
      district: sellerProf.district || '',
      phone: sellerProf.phone || '',
      whatsapp: sellerProf.phone || '',
      isPublished: true,
      createdAt: sellerProf.createdAt || now,
      updatedAt: now,
    };
    return synthesizedShop;
  }

  return null;
}

// Save or create Digital Shop for authenticated seller
export async function saveDigitalShop(
  sellerId: string,
  shopData: Partial<DigitalShop>
): Promise<DigitalShop> {
  if (!sellerId) throw new Error('Hujaingia kwenye mfumo kama muuzaji.');

  const now = new Date().toISOString();
  const existing = await fetchDigitalShop(sellerId);
  const sellerProf = await fetchSellerProfile(sellerId);

  const shopName = shopData.shopName?.trim() || existing?.shopName || sellerProf?.businessName || 'Duka Langu la Mifugo';
  const location = shopData.location?.trim() || existing?.location || sellerProf?.location || 'Dar es Salaam';
  const phone = shopData.phone?.trim() || existing?.phone || sellerProf?.phone || '';
  const whatsapp = shopData.whatsapp?.trim() || existing?.whatsapp || phone;
  const description = shopData.description !== undefined ? shopData.description.trim() : (existing?.description || '');
  const isPublished = shopData.isPublished !== undefined ? shopData.isPublished : (existing?.isPublished ?? true);

  const mergedShop: DigitalShop = {
    shopId: sellerId,
    sellerId,
    shopName,
    description,
    location,
    region: shopData.region || location,
    district: shopData.district || existing?.district || '',
    phone,
    whatsapp,
    isPublished,
    coverImage: shopData.coverImage || existing?.coverImage,
    logoImage: shopData.logoImage || existing?.logoImage,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    const shopRef = doc(db, 'users', sellerId, 'sellerProfile', 'shop');
    await setDoc(shopRef, mergedShop, { merge: true });
  } catch (err) {
    console.warn('Haikuweza kuhifadhi duka kwenye Firestore mara moja, imehifadhiwa ndani ya kifaa:', err);
  }

  // Update local cache
  try {
    localStorage.setItem(`${LOCAL_DIGITAL_SHOPS_KEY}_${sellerId}`, JSON.stringify(mergedShop));
  } catch {}

  return mergedShop;
}

// Toggle shop publish status
export async function toggleShopPublishStatus(
  sellerId: string,
  isPublished: boolean
): Promise<DigitalShop> {
  if (isPublished) {
    const monetization = canSellerSellOnMarketplace(sellerId);
    if (!monetization.canSell) {
      throw new Error(`Huwezi kuweka duka hewani: ${monetization.reasonSwahili}`);
    }
  }
  return await saveDigitalShop(sellerId, { isPublished });
}

export const togglePublishShop = toggleShopPublishStatus;

// ==========================================
// CATALOGUE / SECTION SERVICES
// ==========================================

// Fetch all catalogues for a seller's shop
export async function fetchShopCatalogues(sellerId: string): Promise<ShopCatalogue[]> {
  if (!sellerId || sellerId.startsWith('demo-seller-')) return [];

  // Check local cache
  try {
    const raw = localStorage.getItem(`${LOCAL_CATALOGUES_KEY}_${sellerId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      }
    }
  } catch {}

  // Fetch from Firestore: /users/{sellerId}/sellerProfile/shop/catalogues
  try {
    const cataloguesRef = collection(db, 'users', sellerId, 'sellerProfile', 'shop', 'catalogues');
    const snap = await getDocs(cataloguesRef);

    if (!snap.empty) {
      const list: ShopCatalogue[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as ShopCatalogue;
        list.push({
          ...data,
          catalogueId: docSnap.id || data.catalogueId,
          sellerId,
        });
      });

      list.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

      try {
        localStorage.setItem(`${LOCAL_CATALOGUES_KEY}_${sellerId}`, JSON.stringify(list));
      } catch {}

      return list;
    }
  } catch (err) {
    console.warn('Hitilafu ya kupata catalogues kutoka Firestore:', err);
  }

  return [];
}

// Create new catalogue in seller's shop
export async function createShopCatalogue(
  sellerId: string,
  data: {
    name: string;
    description?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }
): Promise<ShopCatalogue> {
  if (!sellerId) throw new Error('Hujaingia kwenye mfumo kama muuzaji.');
  const monetization = canSellerSellOnMarketplace(sellerId);
  if (!monetization.canSell) {
    throw new Error(`Huwezi kuunda catalogue: ${monetization.reasonSwahili}`);
  }
  if (!data.name || data.name.trim().length < 2) {
    throw new Error('Tafadhali weka jina sahihi la Catalogue (angalau herufi 2).');
  }

  const existing = await fetchShopCatalogues(sellerId);
  const now = new Date().toISOString();
  const catalogueId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nextOrder = data.displayOrder !== undefined ? data.displayOrder : (existing.length + 1);

  const newCatalogue: ShopCatalogue = {
    catalogueId,
    shopId: sellerId,
    sellerId,
    name: data.name.trim(),
    description: data.description?.trim() || '',
    icon: data.icon?.trim() || '🐣',
    displayOrder: nextOrder,
    isActive: data.isActive !== undefined ? data.isActive : true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = doc(db, 'users', sellerId, 'sellerProfile', 'shop', 'catalogues', catalogueId);
    await setDoc(docRef, newCatalogue);
  } catch (err) {
    console.warn('Haikuweza kuhifadhi catalogue kwenye Firestore mara moja:', err);
  }

  const updatedList = [...existing, newCatalogue].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  try {
    localStorage.setItem(`${LOCAL_CATALOGUES_KEY}_${sellerId}`, JSON.stringify(updatedList));
  } catch {}

  return newCatalogue;
}

// Update an existing catalogue
export async function updateShopCatalogue(
  sellerId: string,
  catalogueId: string,
  updates: Partial<ShopCatalogue>
): Promise<ShopCatalogue> {
  if (!sellerId) throw new Error('Hujaingia kwenye mfumo.');
  const monetization = canSellerSellOnMarketplace(sellerId);
  if (!monetization.canSell) {
    throw new Error(`Huwezi kubadilisha catalogue: ${monetization.reasonSwahili}`);
  }

  const existing = await fetchShopCatalogues(sellerId);
  const target = existing.find((c) => c.catalogueId === catalogueId);

  if (!target) {
    throw new Error('Catalogue haikupatikana.');
  }

  const now = new Date().toISOString();
  const updatedCatalogue: ShopCatalogue = {
    ...target,
    ...updates,
    catalogueId,
    sellerId,
    shopId: sellerId,
    updatedAt: now,
  };

  try {
    const docRef = doc(db, 'users', sellerId, 'sellerProfile', 'shop', 'catalogues', catalogueId);
    await setDoc(docRef, updatedCatalogue, { merge: true });
  } catch (err) {
    console.warn('Haikuweza kusasisha catalogue kwenye Firestore moja kwa moja:', err);
  }

  const updatedList = existing.map((c) => (c.catalogueId === catalogueId ? updatedCatalogue : c))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  try {
    localStorage.setItem(`${LOCAL_CATALOGUES_KEY}_${sellerId}`, JSON.stringify(updatedList));
  } catch {}

  return updatedCatalogue;
}

// Delete catalogue without deleting its products
export async function deleteShopCatalogue(
  sellerId: string,
  catalogueId: string
): Promise<void> {
  if (!sellerId) throw new Error('Hujaingia kwenye mfumo.');
  const monetization = canSellerSellOnMarketplace(sellerId);
  if (!monetization.canSell) {
    throw new Error(`Huwezi kufuta catalogue: ${monetization.reasonSwahili}`);
  }

  try {
    const docRef = doc(db, 'users', sellerId, 'sellerProfile', 'shop', 'catalogues', catalogueId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Haikuweza kufuta catalogue kwenye Firestore moja kwa moja:', err);
  }

  // Update catalogue list in cache
  const existing = await fetchShopCatalogues(sellerId);
  const updatedList = existing.filter((c) => c.catalogueId !== catalogueId);
  try {
    localStorage.setItem(`${LOCAL_CATALOGUES_KEY}_${sellerId}`, JSON.stringify(updatedList));
  } catch {}

  // Safe product dissociation: Unset catalogueId for any products that were in this catalogue
  const allProducts = getLocalCachedProducts();
  let modified = false;
  const updatedProducts = allProducts.map((p) => {
    if (p.sellerId === sellerId && p.catalogueId === catalogueId) {
      modified = true;
      return {
        ...p,
        catalogueId: null,
        catalogueName: undefined,
        updatedAt: new Date().toISOString(),
      };
    }
    return p;
  });

  if (modified) {
    saveProductsToLocalCache(updatedProducts);
  }
}

// Reorder catalogues
export async function reorderShopCatalogues(
  sellerId: string,
  orderedCatalogueIds: string[]
): Promise<void> {
  if (!sellerId) return;
  const monetization = canSellerSellOnMarketplace(sellerId);
  if (!monetization.canSell) {
    throw new Error(`Huwezi kupanga upya catalogues: ${monetization.reasonSwahili}`);
  }

  const existing = await fetchShopCatalogues(sellerId);
  const updatedList = existing.map((cat) => {
    const newIdx = orderedCatalogueIds.indexOf(cat.catalogueId);
    if (newIdx !== -1) {
      return { ...cat, displayOrder: newIdx + 1, updatedAt: new Date().toISOString() };
    }
    return cat;
  }).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  try {
    localStorage.setItem(`${LOCAL_CATALOGUES_KEY}_${sellerId}`, JSON.stringify(updatedList));
  } catch {}

  // Sync to Firestore in background
  for (const cat of updatedList) {
    try {
      const docRef = doc(db, 'users', sellerId, 'sellerProfile', 'shop', 'catalogues', cat.catalogueId);
      await setDoc(docRef, { displayOrder: cat.displayOrder, updatedAt: cat.updatedAt }, { merge: true });
    } catch {}
  }
}

// Move product between catalogues
export async function moveProductCatalogue(
  sellerId: string,
  productId: string,
  targetCatalogueId: string | null,
  targetCatalogueName?: string
): Promise<MarketplaceProduct> {
  const monetization = canSellerSellOnMarketplace(sellerId);
  if (!monetization.canSell) {
    throw new Error(`Huwezi kuhamisha bidhaa kwenye catalogue: ${monetization.reasonSwahili}`);
  }

  return await updateMarketplaceProduct(
    sellerId,
    productId,
    {
      catalogueId: targetCatalogueId,
      catalogueName: targetCatalogueName,
    }
  );
}

// ==========================================
// PRODUCT CRUD (WITH AUTHORITATIVE OWNERSHIP)
// ==========================================

// Create new product (Enforces sellerId == current authenticated user UID)
export async function createMarketplaceProduct(
  sellerId: string,
  productData: {
    title: string;
    description: string;
    category: string;
    subcategory?: string;
    categoryId?: string;
    subcategoryId?: string;
    price: number;
    currency?: 'TZS' | 'Tsh';
    unit: string;
    quantityAvailable: number;
    location: string;
    region?: string;
    district?: string;
    imageUrl?: string;
    images?: ProductImage[];
    video?: ProductVideo;
    status?: ProductStatus;
    sellerName: string;
    sellerBusinessName?: string;
    sellerPhone: string;
    sellerLocation?: string;
    sellerVerificationStatus?: 'unverified' | 'pending' | 'verified';
    shopId?: string | null;
    catalogueId?: string | null;
    catalogueName?: string;
    livestockLink?: { category?: string; type?: string };
  }
): Promise<MarketplaceProduct> {
  if (!sellerId || !sellerId.trim()) {
    throw new Error('Lazima uwe umeingia kwenye mfumo kama muuzaji ili kuweka tangazo.');
  }

  const cleanSellerId = sellerId.trim();

  // V1.6C: Enforce authorization and block arbitrary sellerId or shopId assignment
  assertAuthorizedProductOperation(
    cleanSellerId,
    {
      sellerId: cleanSellerId,
      shopId: productData.shopId ? productData.shopId.trim() : cleanSellerId
    },
    'create'
  );

  // V1.7E: Enforce Seller Restrictions on Listing Creation & Selling
  assertSellerNotRestricted(cleanSellerId, 'LISTING_CREATION');
  assertSellerNotRestricted(cleanSellerId, 'MARKETPLACE_SELLING');

  // V1.10A-CORRECTIVE-4: Authoritative Seller Commercial Access Gating
  const monetization = canSellerSellOnMarketplace(cleanSellerId);
  if (!monetization.canSell) {
    throw new Error(`Uwezo wa kuweka bidhaa sokoni umezuiwa: ${monetization.reasonSwahili}`);
  }

  // Check if review is required before product can be published active
  const reviewCheck = checkSellerRestriction(cleanSellerId, 'PRODUCT_REVIEW');
  if (reviewCheck.isRestricted && (productData.status === 'active' || !productData.status)) {
    productData.status = 'draft';
  }

  // Validations
  if (!productData.title || productData.title.trim().length < 3) {
    throw new Error('Tafadhali weka jina kamili la bidhaa (angalau herufi 3).');
  }

  // V1.7A: Authoritative Governed Category Validation
  const targetCategoryInput = productData.categoryId || productData.category;
  const targetSubcategoryInput = productData.subcategoryId || productData.subcategory;
  const categoryValidation = validateProductCategoryAssignment(
    targetCategoryInput,
    targetSubcategoryInput,
    true
  );

  if (!categoryValidation.isValid || !categoryValidation.category) {
    throw new Error(categoryValidation.error || 'Tafadhali chagua kundi la bidhaa lililoidhinishwa.');
  }

  const authoritativeCategoryId = categoryValidation.category.categoryId;
  const authoritativeCategoryName = categoryValidation.category.name;
  const authoritativeSubcategoryId = categoryValidation.subcategory?.categoryId;
  const authoritativeSubcategoryName = categoryValidation.subcategory?.name || productData.subcategory?.trim() || '';

  // V1.6D: Authoritative Price & Stock Trust validation
  const priceValidation = validatePriceValue(productData.price);
  if (!priceValidation.isValid || priceValidation.cleanPrice === null) {
    throw new Error(priceValidation.error || 'Bei ya bidhaa lazima iwe nambari zaidi ya 0 (Tsh).');
  }

  const stockValidation = validateStockValue(productData.quantityAvailable, productData.status);
  if (!stockValidation.isValid || stockValidation.cleanQuantity === null) {
    throw new Error(stockValidation.error || 'Idadi ya bidhaa inayopatikana haiwezi kuwa hasi.');
  }

  if (!productData.unit || productData.unit.trim() === '') {
    throw new Error('Tafadhali weka kipimo cha bidhaa (mfano: kuku, mfuko 50kg, trei).');
  }
  if (!productData.location || productData.location.trim() === '') {
    throw new Error('Tafadhali weka eneo/mkoa ambapo bidhaa inapatikana.');
  }

  // V1.6C: Sanitize seller description, neutralize prompt injections & flag unverified claims
  const { sanitizedDescription } = sanitizeProductDescription(productData.description);

  const now = new Date().toISOString();
  const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Determine primary imageUrl from images if available
  let primaryImageUrl = productData.imageUrl || '';
  if (productData.images && productData.images.length > 0) {
    const primary = productData.images.find((img) => img.isPrimary) || productData.images[0];
    primaryImageUrl = primary?.url || primaryImageUrl;
  }

  // Authoritative verification lookup - missing trust data never defaults to verified
  let authoritativeStatus: 'unverified' | 'pending' | 'verified' = 'unverified';
  try {
    const verif = await sellerVerificationService.getSellerVerification(cleanSellerId);
    if (verif?.status === 'VERIFIED') {
      authoritativeStatus = 'verified';
    } else if (verif?.status === 'PENDING_VERIFICATION' || verif?.status === 'UNDER_REVIEW') {
      authoritativeStatus = 'pending';
    }
  } catch {
    authoritativeStatus = 'unverified';
  }

  const newProduct: MarketplaceProduct = {
    productId,
    sellerId: cleanSellerId,
    shopId: cleanSellerId, // Strictly bound to authenticated seller's shop
    catalogueId: productData.catalogueId || null,
    catalogueName: productData.catalogueName,
    sellerName: productData.sellerName || 'Muuzaji',
    sellerBusinessName: productData.sellerBusinessName || '',
    sellerPhone: productData.sellerPhone || '',
    sellerLocation: productData.sellerLocation || productData.location,
    sellerVerificationStatus: authoritativeStatus,
    title: productData.title.trim(),
    description: sanitizedDescription,
    category: authoritativeCategoryName,
    subcategory: authoritativeSubcategoryName,
    categoryId: authoritativeCategoryId,
    subcategoryId: authoritativeSubcategoryId,
    price: priceValidation.cleanPrice,
    currency: 'Tsh',
    unit: productData.unit.trim(),
    quantityAvailable: stockValidation.cleanQuantity,
    priceUpdatedAt: now,
    stockUpdatedAt: now,
    priceStatus: 'PROVIDED',
    stockStatus: stockValidation.status,
    location: productData.location.trim(),
    region: productData.region || productData.location.trim(),
    district: productData.district || '',
    area: (productData as any).area || '',
    productLocation: (productData as any).productLocation || productData.location.trim(),
    productLocationType: 'PRODUCT_LOCATION',
    productLocationUpdatedAt: now,
    deliveryAvailable: (productData as any).deliveryAvailable ?? false,
    deliveryType: (productData as any).deliveryType,
    deliveryAreas: (productData as any).deliveryAreas || [],
    deliveryAreaLevel: (productData as any).deliveryAreaLevel,
    pickupAvailable: (productData as any).pickupAvailable ?? false,
    pickupAddress: (productData as any).pickupAddress || '',
    deliveryFee: (productData as any).deliveryFee !== undefined ? (productData as any).deliveryFee : null,
    deliveryFeeType: (productData as any).deliveryFeeType || 'NOT_PROVIDED',
    deliveryTimeEstimate: (productData as any).deliveryTimeEstimate || null,
    deliveryUpdatedAt: now,
    imageUrl: primaryImageUrl,
    images: productData.images || (primaryImageUrl ? [{ id: 'primary-img', url: primaryImageUrl, isPrimary: true, uploadedAt: now }] : []),
    video: productData.video || undefined,
    status: productData.status || 'active',
    createdAt: now,
    updatedAt: now,
    isTestDemo: false,
    livestockLink: productData.livestockLink,
  };

  // V1.7B: Deterministic Marketplace Listing Validation
  const validationResult = validateMarketplaceListing({
    product: newProduct,
    authenticatedUserId: cleanSellerId,
    targetStatus: newProduct.status,
    isNewListing: true
  });

  if (newProduct.status === 'active' && !validationResult.isEligibleForActive) {
    const errorDetails = validationResult.errors.map((e) => `• ${e.message}`).join('\n');
    throw new Error(
      `Tangazo haliwezi kuwa ACTIVE kwa sababu halijakidhi vigezo vya sokoni:\n${errorDetails}`
    );
  }

  // Attach authoritative validation metadata
  newProduct.validationStatus = validationResult.validationStatus;
  newProduct.validationVersion = validationResult.validationVersion;
  newProduct.validatedAt = validationResult.validatedAt;
  newProduct.validatedBy = validationResult.validatedBy;
  newProduct.validationErrors = validationResult.errors;
  newProduct.validationWarnings = validationResult.warnings;

  // 1. Persist to Server Storage immediately (converts large base64 to disk files and stores in data/marketplace_products.json)
  try {
    const resp = await fetch('/api/marketplace/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct),
    });
    if (resp.ok) {
      const serverSaved = await resp.json();
      if (serverSaved && serverSaved.imageUrl) {
        newProduct.imageUrl = serverSaved.imageUrl;
      }
      if (serverSaved && Array.isArray(serverSaved.images)) {
        newProduct.images = serverSaved.images;
      }
    }
  } catch (serverErr) {
    console.warn('Haikuweza kuhifadhi kwenye seva moja kwa moja:', serverErr);
  }

  // 2. Persist to Firestore with sanitized payload (no undefined values)
  try {
    const productRef = doc(db, 'marketplaceProducts', productId);
    const cleaned = cleanProductForFirestore(newProduct);
    await setDoc(productRef, cleaned);
  } catch (err) {
    console.warn('Haikuweza kuhifadhi kwenye Firestore moja kwa moja, imehifadhiwa ndani ya seva na kifaa:', err);
  }

  // 3. Update local cache safely
  const existingList = getLocalCachedProducts();
  const updatedList = [newProduct, ...existingList.filter((p) => p.productId !== productId)];
  saveProductsToLocalCache(updatedList);

  return newProduct;
}

// Update product (Validates ownership or admin, protects immutable fields)
export async function updateMarketplaceProduct(
  sellerId: string,
  productId: string,
  updates: Partial<MarketplaceProduct>,
  isAdmin: boolean = false
): Promise<MarketplaceProduct> {
  if (!sellerId || !sellerId.trim()) throw new Error('Hujaingia kwenye mfumo.');

  const cleanSellerId = sellerId.trim();
  const existingList = getLocalCachedProducts();
  const targetProduct = existingList.find((p) => p.productId === productId);

  if (!targetProduct) {
    throw new Error('Bidhaa haikupatikana.');
  }

  // V1.6C: Enforce ownership & immutability checks via productOwnershipService
  assertAuthorizedProductOperation(
    cleanSellerId,
    {
      sellerId: updates.sellerId || targetProduct.sellerId,
      shopId: updates.shopId || targetProduct.shopId,
      productId: updates.productId || targetProduct.productId,
      createdAt: updates.createdAt || targetProduct.createdAt
    },
    'update',
    targetProduct,
    isAdmin
  );

  // V1.7E & V1.7G: Enforce Seller Restrictions and Governance Enforcement on Listing Modification
  if (!isAdmin) {
    assertSellerNotRestricted(cleanSellerId, 'LISTING_EDITING');
    if (updates.status === 'active') {
      assertListingCanBeActivated(targetProduct, cleanSellerId, isAdmin);
      assertSellerNotRestricted(cleanSellerId, 'MARKETPLACE_SELLING');
      const monetization = canSellerSellOnMarketplace(cleanSellerId);
      if (!monetization.canSell) {
        throw new Error(`Huwezi kuweka tangazo kuwa ACTIVE: ${monetization.reasonSwahili}`);
      }
      const reviewCheck = checkSellerRestriction(cleanSellerId, 'PRODUCT_REVIEW');
      if (reviewCheck.isRestricted) {
        throw new Error(
          'Huwezi kuweka tangazo kuwa ACTIVE moja kwa moja; ukaguzi wa msimamizi (Admin Moderation) unahitajika kwanza.'
        );
      }
    }
    // Block non-admins from modifying moderation fields
    delete (updates as any).moderationStatus;
    delete (updates as any).moderatedAt;
    delete (updates as any).moderatedBy;
    delete (updates as any).moderationId;
    delete (updates as any).moderationReasonCode;
    delete (updates as any).moderationPublicReason;
    delete (updates as any).moderationCorrectionNote;
  }

  const now = new Date().toISOString();

  // V1.6D: Authoritative Price validation & timestamp tracking
  let validatedPrice = targetProduct.price;
  let priceUpdatedAt = targetProduct.priceUpdatedAt;
  let priceStatus = targetProduct.priceStatus;

  if (updates.price !== undefined) {
    const priceCheck = validatePriceValue(updates.price);
    if (!priceCheck.isValid || priceCheck.cleanPrice === null) {
      throw new Error(priceCheck.error || 'Bei ya bidhaa si sahihi.');
    }
    validatedPrice = priceCheck.cleanPrice;
    priceUpdatedAt = now;
    priceStatus = 'PROVIDED';
  }

  // V1.6D: Authoritative Stock validation & timestamp tracking
  let validatedQuantity = targetProduct.quantityAvailable;
  let stockUpdatedAt = targetProduct.stockUpdatedAt;
  let stockStatus = targetProduct.stockStatus;

  if (updates.quantityAvailable !== undefined) {
    const stockCheck = validateStockValue(
      updates.quantityAvailable,
      updates.status || targetProduct.status
    );
    if (!stockCheck.isValid || stockCheck.cleanQuantity === null) {
      throw new Error(stockCheck.error || 'Idadi inayopatikana haiwezi kuwa hasi.');
    }
    validatedQuantity = stockCheck.cleanQuantity;
    stockUpdatedAt = now;
    stockStatus = stockCheck.status;
  } else if (updates.status !== undefined && updates.status !== targetProduct.status) {
    if (updates.status === 'sold_out') {
      stockStatus = 'OUT_OF_STOCK';
      stockUpdatedAt = now;
    }
  }

  // Sanitize description if updated
  let cleanDesc = updates.description !== undefined ? updates.description : targetProduct.description;
  if (updates.description !== undefined) {
    cleanDesc = sanitizeProductDescription(updates.description).sanitizedDescription;
  }

  let primaryImageUrl = updates.imageUrl !== undefined ? updates.imageUrl : targetProduct.imageUrl;
  if (updates.images && updates.images.length > 0) {
    const primary = updates.images.find((img) => img.isPrimary) || updates.images[0];
    if (primary?.url) {
      primaryImageUrl = primary.url;
    }
  }

  let deliveryUpdatedAt = targetProduct.deliveryUpdatedAt;
  if (
    updates.deliveryAvailable !== undefined ||
    updates.deliveryType !== undefined ||
    updates.deliveryAreas !== undefined ||
    updates.deliveryFee !== undefined ||
    updates.deliveryFeeType !== undefined ||
    updates.deliveryTimeEstimate !== undefined ||
    updates.pickupAvailable !== undefined ||
    updates.pickupAddress !== undefined
  ) {
    deliveryUpdatedAt = now;
  }

  let productLocationUpdatedAt = targetProduct.productLocationUpdatedAt;
  if (
    updates.productLocation !== undefined ||
    updates.location !== undefined ||
    updates.region !== undefined ||
    updates.district !== undefined ||
    updates.area !== undefined
  ) {
    productLocationUpdatedAt = now;
  }

  // V1.7A: Authoritative Category Validation on Update
  let authoritativeCategoryId = targetProduct.categoryId;
  let authoritativeCategoryName = targetProduct.category;
  let authoritativeSubcategoryId = targetProduct.subcategoryId;
  let authoritativeSubcategoryName = targetProduct.subcategory;

  if (
    updates.categoryId !== undefined ||
    updates.category !== undefined ||
    updates.subcategoryId !== undefined ||
    updates.subcategory !== undefined
  ) {
    const targetCat = updates.categoryId !== undefined ? updates.categoryId : (updates.category !== undefined ? updates.category : targetProduct.categoryId || targetProduct.category);
    const targetSub = updates.subcategoryId !== undefined ? updates.subcategoryId : (updates.subcategory !== undefined ? updates.subcategory : targetProduct.subcategoryId || targetProduct.subcategory);

    const categoryCheck = validateProductCategoryAssignment(
      targetCat,
      targetSub,
      true
    );

    if (!categoryCheck.isValid || !categoryCheck.category) {
      throw new Error(categoryCheck.error || 'Category haipo kwenye Marketplace.');
    }

    authoritativeCategoryId = categoryCheck.category.categoryId;
    authoritativeCategoryName = categoryCheck.category.name;
    authoritativeSubcategoryId = categoryCheck.subcategory?.categoryId;
    authoritativeSubcategoryName = categoryCheck.subcategory?.name || '';
  }

  const updatedProduct: MarketplaceProduct = {
    ...targetProduct,
    ...updates,
    category: authoritativeCategoryName,
    subcategory: authoritativeSubcategoryName,
    categoryId: authoritativeCategoryId,
    subcategoryId: authoritativeSubcategoryId,
    price: validatedPrice,
    priceUpdatedAt,
    priceStatus,
    quantityAvailable: validatedQuantity,
    stockUpdatedAt,
    stockStatus,
    deliveryUpdatedAt,
    productLocationUpdatedAt,
    description: cleanDesc,
    imageUrl: primaryImageUrl,
    productId: targetProduct.productId, // Strictly immutable
    sellerId: targetProduct.sellerId, // Strictly immutable: cannot hijack sellerId
    shopId: targetProduct.sellerId, // Strictly immutable: bound to seller shop
    createdAt: targetProduct.createdAt, // Strictly immutable
    sellerVerificationStatus: isAdmin
      ? (updates.sellerVerificationStatus || targetProduct.sellerVerificationStatus)
      : targetProduct.sellerVerificationStatus, // Non-admin cannot self-escalate verification
    moderationStatus: isAdmin
      ? (updates.moderationStatus || targetProduct.moderationStatus)
      : targetProduct.moderationStatus,
    moderationReasonCode: isAdmin
      ? (updates.moderationReasonCode !== undefined ? updates.moderationReasonCode : targetProduct.moderationReasonCode)
      : targetProduct.moderationReasonCode,
    moderationPublicReason: isAdmin
      ? (updates.moderationPublicReason !== undefined ? updates.moderationPublicReason : targetProduct.moderationPublicReason)
      : targetProduct.moderationPublicReason,
    moderationCorrectionNote: isAdmin
      ? (updates.moderationCorrectionNote !== undefined ? updates.moderationCorrectionNote : targetProduct.moderationCorrectionNote)
      : targetProduct.moderationCorrectionNote,
    moderationId: isAdmin
      ? (updates.moderationId || targetProduct.moderationId)
      : targetProduct.moderationId,
    moderatedAt: isAdmin
      ? (updates.moderatedAt || targetProduct.moderatedAt)
      : targetProduct.moderatedAt,
    moderatedBy: isAdmin
      ? (updates.moderatedBy || targetProduct.moderatedBy)
      : targetProduct.moderatedBy,
    updatedAt: now,
  };

  // V1.7B: Deterministic Marketplace Listing Validation on Update
  const validationResult = validateMarketplaceListing({
    product: updatedProduct,
    authenticatedUserId: cleanSellerId,
    targetStatus: updatedProduct.status,
    isNewListing: false,
    isAdmin
  });

  if (updatedProduct.status === 'active' && !validationResult.isEligibleForActive) {
    const errorDetails = validationResult.errors.map((e) => `• ${e.message}`).join('\n');
    throw new Error(
      `Tangazo haliwezi kuwa ACTIVE kwa sababu halijakidhi vigezo vya sokoni:\n${errorDetails}`
    );
  }

  // Attach authoritative validation metadata
  updatedProduct.validationStatus = validationResult.validationStatus;
  updatedProduct.validationVersion = validationResult.validationVersion;
  updatedProduct.validatedAt = validationResult.validatedAt;
  updatedProduct.validatedBy = validationResult.validatedBy;
  updatedProduct.validationErrors = validationResult.errors;
  updatedProduct.validationWarnings = validationResult.warnings;

  // 1. Update on Server Storage
  try {
    await fetch('/api/marketplace/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProduct),
    });
  } catch (serverErr) {
    console.warn('Haikuweza kusasisha kwenye seva moja kwa moja:', serverErr);
  }

  // 2. Update in Firestore with cleaned payload
  try {
    const productRef = doc(db, 'marketplaceProducts', productId);
    const cleaned = cleanProductForFirestore(updatedProduct);
    await setDoc(productRef, cleaned, { merge: true });
  } catch (err) {
    console.warn('Haikuweza kusasisha kwenye Firestore moja kwa moja:', err);
  }

  // 3. Update local cache
  const updatedList = existingList.map((p) => (p.productId === productId ? updatedProduct : p));
  saveProductsToLocalCache(updatedList);

  return updatedProduct;
}

// V1.6D: Isolated, atomic seller price update helper
export async function updateProductPrice(
  sellerId: string,
  productId: string,
  newPrice: number
): Promise<MarketplaceProduct> {
  return await updateMarketplaceProduct(sellerId, productId, { price: newPrice });
}

// V1.6D: Isolated, atomic seller stock update helper
export async function updateProductStock(
  sellerId: string,
  productId: string,
  newQuantity: number
): Promise<MarketplaceProduct> {
  return await updateMarketplaceProduct(sellerId, productId, { quantityAvailable: newQuantity });
}

// V1.6E: Isolated, atomic seller delivery update helper
export async function updateProductDelivery(
  sellerId: string,
  productId: string,
  deliveryUpdates: {
    deliveryAvailable?: boolean;
    deliveryType?: any;
    deliveryAreas?: string[];
    deliveryAreaLevel?: any;
    pickupAvailable?: boolean;
    pickupAddress?: string;
    deliveryFee?: number | null;
    deliveryFeeType?: any;
    deliveryTimeEstimate?: string | null;
  }
): Promise<MarketplaceProduct> {
  return await updateMarketplaceProduct(sellerId, productId, deliveryUpdates);
}

// V1.6E: Isolated, atomic seller location update helper
export async function updateProductLocation(
  sellerId: string,
  productId: string,
  locationUpdates: {
    productLocation?: string;
    location?: string;
    region?: string;
    district?: string;
    area?: string;
  }
): Promise<MarketplaceProduct> {
  return await updateMarketplaceProduct(sellerId, productId, locationUpdates);
}

// Delete product (Validates ownership or admin)
export async function deleteMarketplaceProduct(
  sellerId: string,
  productId: string,
  isAdmin: boolean = false
): Promise<void> {
  if (!sellerId || !sellerId.trim()) throw new Error('Hujaingia kwenye mfumo.');

  const cleanSellerId = sellerId.trim();
  const existingList = getLocalCachedProducts();
  const targetProduct = existingList.find((p) => p.productId === productId);

  if (!targetProduct) {
    throw new Error('Bidhaa haikupatikana.');
  }

  // V1.6C: Authoritative deletion gate
  assertAuthorizedProductOperation(
    cleanSellerId,
    { sellerId: targetProduct.sellerId, productId },
    'delete',
    targetProduct,
    isAdmin
  );

  // 1. Delete from Server Storage
  try {
    await fetch(`/api/marketplace/products/${productId}`, {
      method: 'DELETE',
    });
  } catch (serverErr) {
    console.warn('Haikuweza kufuta kwenye seva moja kwa moja:', serverErr);
  }

  // 2. Delete from Firestore
  try {
    const productRef = doc(db, 'marketplaceProducts', productId);
    await deleteDoc(productRef);
  } catch (err) {
    console.warn('Haikuweza kufuta kwenye Firestore moja kwa moja:', err);
  }

  // 3. Update local cache
  const updatedList = existingList.filter((p) => p.productId !== productId);
  saveProductsToLocalCache(updatedList);
}

// Fetch all published digital shops for shop discovery
export async function fetchAllPublishedShops(
  currentProducts?: MarketplaceProduct[]
): Promise<DigitalShop[]> {
  const shopMap: Map<string, DigitalShop> = new Map();

  // 1. Scan locally cached shops (clearing and ignoring any legacy demo shops)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_DIGITAL_SHOPS_KEY)) {
        if (key.includes('demo-seller-')) {
          keysToRemove.push(key);
          continue;
        }
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as DigitalShop;
          if (parsed && parsed.sellerId) {
            if (parsed.sellerId.startsWith('demo-seller-') || parsed.shopId?.startsWith('demo-seller-')) {
              keysToRemove.push(key);
              continue;
            }
            if (parsed.isPublished) {
              shopMap.set(parsed.sellerId, parsed);
            } else {
              shopMap.delete(parsed.sellerId); // Explicitly remove if unpublished
            }
          }
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}

  // 2. Synthesize published shops from existing active real products if not yet present
  const prods = currentProducts || getLocalCachedProducts();
  prods.forEach((prod) => {
    if (
      prod.sellerId &&
      !prod.sellerId.startsWith('demo-seller-') &&
      !prod.isTestDemo &&
      !prod.productId?.startsWith('demo-') &&
      !shopMap.has(prod.sellerId)
    ) {
      // Create a default published shop object for discovery
      const synthesized: DigitalShop = {
        shopId: prod.shopId || prod.sellerId,
        sellerId: prod.sellerId,
        shopName: prod.sellerBusinessName || prod.sellerName || 'Duka la Mifugo',
        description: `Duka la ${prod.sellerBusinessName || prod.sellerName} linalouza ${prod.category.toLowerCase()} na bidhaa za mifugo.`,
        location: prod.location || prod.region || 'Tanzania',
        region: prod.region || prod.location || 'Tanzania',
        district: prod.district || '',
        phone: prod.sellerPhone || '',
        whatsapp: prod.sellerPhone || '',
        isPublished: true,
        createdAt: prod.createdAt,
        updatedAt: prod.updatedAt,
      };
      shopMap.set(prod.sellerId, synthesized);
    }
  });

  // Return list of published shops, strictly enforcing authoritative public shop eligibility (Section 7)
  return Array.from(shopMap.values()).filter((s) => isShopMarketplaceEligible(s));
}

// Search relevance scoring algorithm for products (Authoritative Governance: Ineligible products always score 0)
export function scoreProductRelevance(product: MarketplaceProduct, rawQuery: string): number {
  if (!rawQuery || !rawQuery.trim()) return 0;
  if (!isProductMarketplaceEligible(product)) return 0;
  const q = rawQuery.trim().toLowerCase();
  let score = 0;

  const title = (product.title || '').toLowerCase();
  const cat = (product.category || '').toLowerCase();
  const subcat = (product.subcategory || '').toLowerCase();
  const catalogue = (product.catalogueName || '').toLowerCase();
  const seller = (product.sellerBusinessName || product.sellerName || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const loc = (product.location || '').toLowerCase();
  const region = (product.region || '').toLowerCase();
  const district = (product.district || '').toLowerCase();

  // 1. Exact product-name match
  if (title === q) {
    score += 1000;
  } else if (title.startsWith(q)) {
    score += 500;
  } else if (title.includes(q)) {
    score += 250;
  } else {
    // Check individual word matches in title
    const words = q.split(/\s+/).filter(Boolean);
    const titleWords = title.split(/\s+/);
    let allWordsMatch = true;
    for (const w of words) {
      if (!title.includes(w)) {
        allWordsMatch = false;
        break;
      }
    }
    if (allWordsMatch && words.length > 1) {
      score += 200;
    }
  }

  // 2. Subcategory match
  if (subcat) {
    if (subcat === q) score += 200;
    else if (subcat.startsWith(q)) score += 150;
    else if (subcat.includes(q)) score += 100;
  }

  // 3. Category match
  if (cat) {
    if (cat === q) score += 180;
    else if (cat.startsWith(q)) score += 120;
    else if (cat.includes(q)) score += 80;
  }

  // 4. Catalogue match
  if (catalogue) {
    if (catalogue === q) score += 150;
    else if (catalogue.includes(q)) score += 80;
  }

  // 5. Seller / shop-name match
  if (seller) {
    if (seller === q) score += 120;
    else if (seller.startsWith(q)) score += 90;
    else if (seller.includes(q)) score += 60;
  }

  // 6. Description match
  if (desc.includes(q)) {
    score += 40;
  }

  // 7. Location match (Mkoa / Wilaya)
  if (region === q || loc === q || district === q) {
    score += 50;
  } else if (region.includes(q) || loc.includes(q) || district.includes(q)) {
    score += 25;
  }

  return score;
}

// Search relevance scoring algorithm for digital shops
export function scoreShopRelevance(
  shop: DigitalShop,
  rawQuery: string,
  shopProducts: MarketplaceProduct[] = [],
  shopCatalogues: ShopCatalogue[] = []
): number {
  if (!rawQuery || !rawQuery.trim()) return 0;
  const q = rawQuery.trim().toLowerCase();
  let score = 0;

  const name = (shop.shopName || '').toLowerCase();
  const desc = (shop.description || '').toLowerCase();
  const loc = (shop.location || '').toLowerCase();
  const region = (shop.region || '').toLowerCase();
  const district = (shop.district || '').toLowerCase();

  // 1. Exact shop name
  if (name === q) {
    score += 1000;
  } else if (name.startsWith(q)) {
    score += 500;
  } else if (name.includes(q)) {
    score += 300;
  }

  // 2. Location / Region / District
  if (region === q || loc === q || district === q) {
    score += 200;
  } else if (region.includes(q) || loc.includes(q) || district.includes(q)) {
    score += 120;
  }

  // 3. Description match
  if (desc.includes(q)) {
    score += 60;
  }

  // 4. Products sold by this shop match
  const matchingProds = shopProducts.filter(
    (p) =>
      p.sellerId === shop.sellerId &&
      (p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.subcategory?.toLowerCase().includes(q))
  );
  if (matchingProds.length > 0) {
    score += Math.min(150, matchingProds.length * 30);
  }

  // 5. Catalogues match
  const matchingCats = shopCatalogues.filter(
    (c) => c.sellerId === shop.sellerId && c.name.toLowerCase().includes(q)
  );
  if (matchingCats.length > 0) {
    score += Math.min(100, matchingCats.length * 25);
  }

  return score;
}

// Helper to format currency in Swahili & Tsh
export function formatTshPrice(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return 'Tsh 0';
  return `Tsh ${Math.round(amount).toLocaleString('en-US')}`;
}

