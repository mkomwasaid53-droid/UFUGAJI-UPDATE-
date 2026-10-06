import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  MarketplaceProduct,
  SellerProfile,
  ProductStatus,
  DigitalShop,
  ShopCatalogue
} from '../types/marketplace';
import {
  MARKETPLACE_CATEGORIES,
  TANZANIA_REGIONS
} from '../data/marketplaceData';
import {
  fetchMarketplaceProducts,
  fetchSellerProfile,
  saveSellerProfile,
  createMarketplaceProduct,
  updateMarketplaceProduct,
  deleteMarketplaceProduct,
  fetchDigitalShop,
  saveDigitalShop,
  togglePublishShop,
  fetchShopCatalogues,
  createShopCatalogue,
  updateShopCatalogue,
  deleteShopCatalogue,
  reorderShopCatalogues,
  moveProductCatalogue,
  formatTshPrice,
  fetchAllPublishedShops,
  scoreProductRelevance
} from '../services/marketplaceService';
import { ProductCard } from '../components/marketplace/ProductCard';
import { ProductDetailModal } from '../components/marketplace/ProductDetailModal';
import { ProductFormModal } from '../components/marketplace/ProductFormModal';
import { SellerProfileModal } from '../components/marketplace/SellerProfileModal';
import { ShopEditModal } from '../components/marketplace/ShopEditModal';
import { CatalogueModal } from '../components/marketplace/CatalogueModal';
import { SellerShopView } from '../components/marketplace/SellerShopView';
import { BuyerShopView } from '../components/marketplace/BuyerShopView';
import { ShopDiscoveryView } from '../components/marketplace/ShopDiscoveryView';
import { VisualMarketplaceSearchModal } from '../components/marketplace/VisualMarketplaceSearchModal';
import { SellerVerificationModal } from '../components/marketplace/SellerVerificationModal';
import { FreeTrialActivationModal } from '../components/marketplace/FreeTrialActivationModal';
import { MarketplaceInboxView } from '../components/marketplace/MarketplaceInboxView';
import { marketplaceInboxService } from '../services/marketplaceInboxService';
import { SellerVerification } from '../types/sellerVerification';
import { sellerVerificationService } from '../services/sellerVerificationService';
import {
  fetchGovernedCategories,
  getLocalCachedCategories,
  getActiveRootCategories
} from '../services/marketplaceCategoryService';
import {
  canSellerSellOnMarketplace,
  isShopMarketplaceEligible
} from '../services/marketplaceGovernanceEnforcement';
import { sellerMonetizationService } from '../services/sellerMonetizationService';
import { useSellerMonetization } from '../hooks/useSellerMonetization';
import { GovernedCategory } from '../types/marketplaceCategory';
import {
  Search,
  Plus,
  Filter,
  Store,
  MapPin,
  RefreshCw,
  Tag,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  SlidersHorizontal,
  X,
  UserCheck,
  CheckCircle2,
  Layers,
  ArrowLeft,
  Eye,
  Building2,
  Camera,
  Shield,
  ShieldCheck,
  Clock,
  MessageSquare
} from 'lucide-react';

export const Market: React.FC = () => {
  const { user, profile, isAdmin, sellerProfile: authSellerProfile, hasSellerCapability, saveSellerProfileState } = useAuth();

  // V1.10A-CORRECTIVE-7: Single Shared Authoritative Monetization State
  const {
    isLocked: isSellerMonetizationLocked,
    status: sellerMonetizationStatus,
    revalidate: revalidateSellerMonetization,
    setAuthoritativeRecord: setAuthoritativeSellerMonetization
  } = useSellerMonetization(user?.uid, undefined);

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(authSellerProfile);
  const [myShop, setMyShop] = useState<DigitalShop | null>(null);
  const [myCatalogues, setMyCatalogues] = useState<ShopCatalogue[]>([]);
  const [publishedShops, setPublishedShops] = useState<DigitalShop[]>([]);
  const [allCataloguesMap, setAllCataloguesMap] = useState<Record<string, ShopCatalogue[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Main Page View Mode: 'marketplace' | 'my_shop' | 'buyer_shop' | 'inbox'
  const [currentView, setCurrentView] = useState<'marketplace' | 'my_shop' | 'buyer_shop' | 'inbox'>('marketplace');
  const [inboxConversationId, setInboxConversationId] = useState<string | null>(null);
  const [inboxUnreadCount, setInboxUnreadCount] = useState<number>(0);

  // Sub-tab when on marketplace: 'products' | 'shops'
  const [activeMarketTab, setActiveMarketTab] = useState<'products' | 'shops'>('products');

  // Specific seller's shop being viewed by a buyer
  const [viewingSellerShop, setViewingSellerShop] = useState<{
    shop: DigitalShop;
    catalogues: ShopCatalogue[];
    verification?: SellerVerification | null;
  } | null>(null);
  const [sellerVerificationsMap, setSellerVerificationsMap] = useState<Record<string, SellerVerification>>({});
  const [buyerShopInitialCatalogueId, setBuyerShopInitialCatalogueId] = useState<string | null>(null);
  const [buyerShopHighlightProductId, setBuyerShopHighlightProductId] = useState<string | null>(null);
  const [isLoadingShop, setIsLoadingShop] = useState(false);

  // Search & Filter States for Global Marketplace
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'relevance'>('newest');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isVisualSearchModalOpen, setIsVisualSearchModalOpen] = useState(false);

  // V1.7A: Governed Categories State
  const [governedCategories, setGovernedCategories] = useState<GovernedCategory[]>(() =>
    getLocalCachedCategories()
  );

  const activeMarketCategories = useMemo(() => {
    return getActiveRootCategories(governedCategories);
  }, [governedCategories]);

  // Modal States
  const [viewingProduct, setViewingProduct] = useState<MarketplaceProduct | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketplaceProduct | null>(null);
  const [isSellerModalOpen, setIsSellerModalOpen] = useState(false);
  const [isShopEditModalOpen, setIsShopEditModalOpen] = useState(false);
  const [isCatalogueModalOpen, setIsCatalogueModalOpen] = useState(false);
  const [editingCatalogue, setEditingCatalogue] = useState<ShopCatalogue | null>(null);
  const [productToDelete, setProductToDelete] = useState<MarketplaceProduct | null>(null);

  // Authoritative Seller Verification State (V1.6A Marketplace Trust)
  const [sellerVerification, setSellerVerification] = useState<SellerVerification | null>(null);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isLoadingVerification, setIsLoadingVerification] = useState(false);
  const [isMarketFreeTrialModalOpen, setIsMarketFreeTrialModalOpen] = useState(false);

  // Feedback notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Sync auth seller profile
  useEffect(() => {
    if (authSellerProfile) {
      setSellerProfile(authSellerProfile);
    }
  }, [authSellerProfile]);

  // Synchronize URL search params (e.g. ?tab=inbox or ?conv=xyz)
  useEffect(() => {
    const tab = searchParams.get('tab');
    const conv = searchParams.get('conv');
    if (tab === 'inbox' || conv) {
      setCurrentView('inbox');
      if (conv) setInboxConversationId(conv);
    }
  }, [searchParams]);

  // Load and periodically refresh inbox unread count for current user
  useEffect(() => {
    if (!user?.uid) {
      setInboxUnreadCount(0);
      return;
    }
    const loadUnread = async () => {
      try {
        const convs = await marketplaceInboxService.getConversationsForUser(user.uid);
        const total = convs.reduce((sum, c) => {
          const unread = c.buyerUserId === user.uid ? c.buyerUnreadCount : c.sellerUnreadCount;
          return sum + (unread || 0);
        }, 0);
        setInboxUnreadCount(total);
      } catch {
        // Ignore background polling errors
      }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  // PRIMARY INQUIRY ACTION: Authenticated Marketplace Conversation Handler (V1.11B)
  const handleStartConversation = async (product: MarketplaceProduct) => {
    if (!user?.uid) {
      showNotification('warning', 'Hujaingia kwenye mfumo. Tafadhali ingia ili uweze kuwasiliana na muuzaji.');
      navigate('/login');
      return;
    }

    if (user.uid === product.sellerId) {
      showNotification('info', 'Huwezi kuanzisha mazungumzo na wewe mwenyewe (Hili ni tangazo lako).');
      return;
    }

    try {
      const { conversation } = await marketplaceInboxService.getOrCreateConversation(
        {
          buyerUserId: user.uid,
          sellerUserId: product.sellerId,
          shopId: product.shopId || product.sellerId,
          productId: product.productId,
          listingId: product.productId,
          productTitleSnapshot: product.title,
          listingTitleSnapshot: product.title,
          categoryId: product.category,
          priceSnapshot: product.price,
          currencySnapshot: product.currency || 'Tsh',
          imageUrlSnapshot: product.imageUrl,
          sellerNameSnapshot: product.sellerBusinessName || product.sellerName || 'Muuzaji',
          buyerNameSnapshot: profile?.displayName || user.displayName || 'Mnunuzi',
        },
        user.uid,
        product
      );

      setViewingProduct(null);
      setInboxConversationId(conversation.conversationId);
      setCurrentView('inbox');
    } catch (err: any) {
      showNotification('error', err.message || 'Hitilafu ya kuanzisha mawasiliano na muuzaji.');
    }
  };

  // Load products, shop & catalogues
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [prods, cats] = await Promise.all([
        fetchMarketplaceProducts(),
        fetchGovernedCategories().catch(() => getLocalCachedCategories()),
      ]);
      setProducts(prods);
      if (cats && cats.length > 0) {
        setGovernedCategories(cats);
      }

      const shops = await fetchAllPublishedShops(prods);
      setPublishedShops(shops);

      // Pre-fetch catalogues and authoritative verifications for known shops
      const catMap: Record<string, ShopCatalogue[]> = {};
      const verifMap: Record<string, SellerVerification> = {};

      await Promise.all(
        shops.map(async (s) => {
          try {
            const [cats, v] = await Promise.all([
              fetchShopCatalogues(s.sellerId).catch(() => []),
              sellerVerificationService.getSellerVerification(s.sellerId).catch(() => null),
            ]);
            catMap[s.sellerId] = cats;
            if (v) verifMap[s.sellerId] = v;
          } catch (e) {
            // ignore individual load failure
          }
        })
      );
      setAllCataloguesMap(catMap);
      setSellerVerificationsMap(verifMap);

      if (user?.uid) {
        const sProf = await fetchSellerProfile(user.uid);
        if (sProf) {
          setSellerProfile(sProf);
        }

        // Fetch Digital Shop
        const shop = await fetchDigitalShop(user.uid);
        if (shop) {
          setMyShop(shop);
        } else if (sProf) {
          // If seller exists but no shop document yet, default fallback
          setMyShop({
            shopId: user.uid,
            sellerId: user.uid,
            shopName: sProf.businessName || `${sProf.displayName} Farm`,
            description: sProf.description || 'Karibu kwenye duka letu la mifugo na pembejeo.',
            location: sProf.location || 'Dar es Salaam',
            region: sProf.region || sProf.location || 'Dar es Salaam',
            phone: sProf.phone || '',
            whatsapp: sProf.phone || '',
            isPublished: false,
            createdAt: sProf.createdAt,
            updatedAt: sProf.updatedAt,
          });
        }

        // Fetch Catalogues
        const cats = await fetchShopCatalogues(user.uid);
        setMyCatalogues(cats);

        // Fetch Authoritative Seller Verification (V1.6A)
        try {
          setIsLoadingVerification(true);
          const verif = await sellerVerificationService.getSellerVerification(user.uid);
          setSellerVerification(verif);
        } catch (verr) {
          console.error('Hitilafu ya kupata hali ya uhakiki wa muuzaji:', verr);
        } finally {
          setIsLoadingVerification(false);
        }
      }
    } catch (err) {
      console.error('Hitilafu ya kupakia soko:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  // Deep linking via URL on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const shopParam = params.get('shop');
      const catParam = params.get('catalogue');
      const prodParam = params.get('product') || params.get('highlight');

      if (tabParam === 'shops') {
        setActiveMarketTab('shops');
      } else if (tabParam === 'my_shop') {
        setCurrentView('my_shop');
      }

      if (shopParam) {
        handleOpenBuyerShop(shopParam, catParam, prodParam);
      } else if (prodParam && products.length > 0) {
        const p = products.find((x) => x.productId === prodParam);
        if (p) setViewingProduct(p);
      }
    } catch (e) {
      // ignore URL query parse errors
    }
  }, [products.length]);

  // Filtered and sorted products for Global Marketplace
  const filteredProducts = useMemo(() => {
    const numMin = minPrice ? parseFloat(minPrice) : null;
    const numMax = maxPrice ? parseFloat(maxPrice) : null;

    const filtered = products.filter((prod) => {
      // Search term filter
      if (searchTerm.trim()) {
        const score = scoreProductRelevance(prod, searchTerm);
        if (score <= 0) return false;
      }

      // Category filter (Matches authoritative categoryId, category name, or slug)
      if (selectedCategory !== 'all') {
        const matchesCategory =
          prod.categoryId === selectedCategory ||
          prod.category === selectedCategory;
        if (!matchesCategory) return false;
      }

      // Region filter
      if (selectedRegion !== 'all') {
        if (prod.location !== selectedRegion && prod.region !== selectedRegion) return false;
      }

      // In stock filter
      if (inStockOnly) {
        if (prod.status !== 'active' || prod.quantityAvailable <= 0) return false;
      }

      // Min price filter
      if (numMin !== null && !isNaN(numMin) && prod.price < numMin) {
        return false;
      }

      // Max price filter
      if (numMax !== null && !isNaN(numMax) && prod.price > numMax) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (searchTerm.trim() && sortBy === 'relevance') {
        return scoreProductRelevance(b, searchTerm) - scoreProductRelevance(a, searchTerm);
      }
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'price_asc') {
        return a.price - b.price;
      }
      if (sortBy === 'price_desc') {
        return b.price - a.price;
      }
      return 0;
    });
  }, [products, searchTerm, selectedCategory, selectedRegion, inStockOnly, minPrice, maxPrice, sortBy]);

  // Category counts for badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      if (p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
      if (p.categoryId) {
        counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  // Count user products
  const myProductsCount = useMemo(() => {
    if (!user?.uid) return 0;
    return products.filter((p) => p.sellerId === user.uid).length;
  }, [products, user?.uid]);

  // Open a specific seller's Digital Shop for buyers (with optional deep-linked catalogue/product)
  const handleOpenBuyerShop = async (
    sellerId: string,
    initialCatalogueId?: string | null,
    highlightProductId?: string | null
  ) => {
    if (!sellerId) return;

    setBuyerShopInitialCatalogueId(initialCatalogueId || null);
    setBuyerShopHighlightProductId(highlightProductId || null);

    // If it is my own shop, switch to my_shop or buyer preview
    if (user?.uid && sellerId === user.uid && myShop) {
      setViewingSellerShop({
        shop: myShop,
        catalogues: myCatalogues,
        verification: sellerVerification,
      });
      setCurrentView('buyer_shop');
      return;
    }

    try {
      setIsLoadingShop(true);
      const [shopData, cataloguesData, verifData] = await Promise.all([
        fetchDigitalShop(sellerId),
        fetchShopCatalogues(sellerId),
        sellerVerificationsMap[sellerId]
          ? Promise.resolve(sellerVerificationsMap[sellerId])
          : sellerVerificationService.getSellerVerification(sellerId).catch(() => null),
      ]);

      const targetShop = shopData || {
        shopId: sellerId,
        sellerId: sellerId,
        shopName: products.find((p) => p.sellerId === sellerId)?.sellerBusinessName || 'Duka la Mfugaji',
        description: 'Duka la bidhaa za mifugo na kilimo.',
        location: 'Tanzania',
        region: 'Tanzania',
        phone: '',
        whatsapp: '',
        isPublished: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // V1.10A-CORRECTIVE-4: Public shop eligibility gating for buyers
      if (user?.uid !== sellerId && !isAdmin) {
        if (!isShopMarketplaceEligible(targetShop)) {
          showNotification('warning', 'Duka hili halipatikani hewani kwa sasa kwa mujibu wa vigezo vya usajili wa muuzaji.');
          return;
        }
      }

      if (verifData) {
        setSellerVerificationsMap((prev) => ({ ...prev, [sellerId]: verifData }));
      }

      setViewingSellerShop({
        shop: targetShop,
        catalogues: cataloguesData,
        verification: verifData,
      });
      setCurrentView('buyer_shop');
    } catch (err: any) {
      console.error('Hitilafu ya kufungua duka:', err);
      showNotification('error', 'Haikuweza kupakia taarifa za duka hili.');
    } finally {
      setIsLoadingShop(false);
    }
  };

  // Handle create/update product
  const handleSaveProduct = async (productData: any) => {
    if (!user?.uid) {
      showNotification('error', 'Tafadhali ingia kwenye akaunti ili kuweka tangazo.');
      return;
    }

    try {
      if (editingProduct) {
        const updated = await updateMarketplaceProduct(
          user.uid,
          editingProduct.productId,
          {
            ...productData,
            shopId: user.uid,
          },
          isAdmin
        );
        setProducts((prev) =>
          prev.map((p) => (p.productId === updated.productId ? updated : p))
        );
        showNotification('success', 'Tangazo la bidhaa limesasishwa kikamilifu.');
      } else {
        const created = await createMarketplaceProduct(user.uid, {
          ...productData,
          shopId: user.uid,
          sellerName: myShop?.shopName || sellerProfile?.displayName || profile?.displayName || user.displayName || 'Mfugaji',
          sellerBusinessName: myShop?.shopName || sellerProfile?.businessName || `${profile?.displayName || 'Mfugaji'} Farm`,
          sellerPhone: myShop?.phone || sellerProfile?.phone || profile?.phone || productData.sellerPhone || '',
          sellerLocation: myShop?.location || sellerProfile?.location || profile?.region || productData.location || 'Dar es Salaam',
          sellerVerificationStatus: sellerProfile?.verificationStatus || 'unverified',
        });
        setProducts((prev) => [created, ...prev]);
        showNotification('success', 'Tangazo lako la bidhaa limeongezwa kwenye duka na sokoni.');
      }
    } catch (err: any) {
      console.error('Hitilafu:', err);
      showNotification('error', err?.message || 'Hitilafu imetokea wakati wa kuhifadhi.');
      throw err;
    }
  };

  // Handle move product to different catalogue
  const handleMoveProductCatalogue = async (productId: string, targetCatalogueId: string | null) => {
    if (!user?.uid) return;
    try {
      const updated = await moveProductCatalogue(user.uid, productId, targetCatalogueId);
      setProducts((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
      showNotification('success', 'Bidhaa imehamishwa kwenye catalogue uliyochagua.');
    } catch (err: any) {
      console.error('Hitilafu ya kuhamisha catalogue:', err);
      showNotification('error', 'Haikuweza kuhamisha bidhaa.');
    }
  };

  // Toggle active/inactive listing status
  const handleToggleStatus = async (product: MarketplaceProduct) => {
    if (!user?.uid) return;
    const newStatus: ProductStatus = product.status === 'active' ? 'inactive' : 'active';
    try {
      const updated = await updateMarketplaceProduct(
        user.uid,
        product.productId,
        { status: newStatus },
        isAdmin
      );
      setProducts((prev) =>
        prev.map((p) => (p.productId === updated.productId ? updated : p))
      );
      showNotification(
        'success',
        newStatus === 'active'
          ? `Tangazo la "${product.title}" limewashwa sokoni.`
          : `Tangazo la "${product.title}" limezimwa (haliwezi kuonekana na wanunuzi).`
      );
    } catch (err: any) {
      console.error('Hitilafu ya kubadili hali:', err);
      showNotification('error', err?.message || 'Haikuweza kubadili hali ya tangazo.');
    }
  };

  // Handle delete product
  const handleDeleteConfirm = async () => {
    if (!productToDelete || !user?.uid) return;

    try {
      await deleteMarketplaceProduct(user.uid, productToDelete.productId, isAdmin);
      setProducts((prev) => prev.filter((p) => p.productId !== productToDelete.productId));
      setProductToDelete(null);
      showNotification('success', 'Tangazo limefutwa kikamilifu.');
    } catch (err: any) {
      console.error('Hitilafu ya kufuta:', err);
      showNotification('error', err?.message || 'Haikuweza kufuta tangazo.');
    }
  };

  // Handle save seller profile
  const handleSaveSellerProfile = async (profileData: Partial<SellerProfile>) => {
    if (!user?.uid) {
      showNotification('error', 'Tafadhali ingia kwenye mfumo kwanza.');
      return;
    }

    try {
      const saved = await saveSellerProfileState(profileData);
      setSellerProfile(saved);

      // Also ensure digital shop is initialized
      const shopObj = await saveDigitalShop(user.uid, {
        shopName: saved.businessName || `${saved.displayName} Farm`,
        description: saved.bio || 'Karibu kwenye duka letu la mifugo na pembejeo.',
        location: saved.location || 'Dar es Salaam',
        region: saved.location || 'Dar es Salaam',
        phone: saved.phone || '',
        whatsapp: saved.whatsapp || saved.phone || '',
        isPublished: false,
      });
      setMyShop(shopObj);

      showNotification('success', 'Duka lako la Kidijitali limetengenezwa! Washa Free Trial ili kuanza kuuza.');
      setCurrentView('my_shop');
    } catch (err: any) {
      console.error('Hitilafu ya wasifu:', err);
      showNotification('error', err?.message || 'Hitilafu ya kuhifadhi wasifu.');
      throw err;
    }
  };

  // Handle save digital shop details
  const handleSaveShopDetails = async (shopData: Partial<DigitalShop>) => {
    if (!user?.uid) return;
    try {
      const saved = await saveDigitalShop(user.uid, shopData);
      setMyShop(saved);
      showNotification('success', 'Taarifa za duka zimehifadhiwa kikamilifu.');
    } catch (err: any) {
      console.error('Hitilafu ya duka:', err);
      showNotification('error', err?.message || 'Haikuweza kuhifadhi taarifa za duka.');
      throw err;
    }
  };

  // Toggle Publish / Unpublish Shop
  const handleTogglePublishShop = async () => {
    if (!user?.uid || !myShop) return;
    try {
      const nextState = !myShop.isPublished;
      const updated = await togglePublishShop(user.uid, nextState);
      setMyShop(updated);
      showNotification(
        'success',
        nextState
          ? 'Duka lako sasa linapatikana hewani kwa wanunuzi wote!'
          : 'Duka lako limefichwa (Draft). Wanunuzi hawataliona.'
      );
    } catch (err: any) {
      console.error('Hitilafu ya publish:', err);
      showNotification('error', 'Haikuweza kubadilisha hali ya duka.');
    }
  };

  // Catalogue CRUD
  const handleSaveCatalogue = async (catData: {
    name: string;
    description?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }) => {
    if (!user?.uid) return;
    try {
      if (editingCatalogue) {
        const updated = await updateShopCatalogue(user.uid, editingCatalogue.catalogueId, catData);
        setMyCatalogues((prev) =>
          prev.map((c) => (c.catalogueId === updated.catalogueId ? updated : c))
        );
        showNotification('success', 'Catalogue imesasishwa kikamilifu.');
      } else {
        const created = await createShopCatalogue(user.uid, catData);
        setMyCatalogues((prev) => [...prev, created].sort((a, b) => a.displayOrder - b.displayOrder));
        showNotification('success', 'Catalogue mpya imetengenezwa!');
      }
    } catch (err: any) {
      console.error('Hitilafu ya catalogue:', err);
      showNotification('error', err?.message || 'Haikuweza kuhifadhi catalogue.');
      throw err;
    }
  };

  const handleDeleteCatalogue = async (catalogueId: string) => {
    if (!user?.uid) return;
    try {
      await deleteShopCatalogue(user.uid, catalogueId);
      setMyCatalogues((prev) => prev.filter((c) => c.catalogueId !== catalogueId));
      // Update local products that were in this catalogue
      setProducts((prev) =>
        prev.map((p) => (p.catalogueId === catalogueId ? { ...p, catalogueId: undefined, catalogueName: undefined } : p))
      );
      showNotification('success', 'Catalogue imefutwa. Bidhaa zilizomo zimerudi kwenye jumla.');
    } catch (err: any) {
      console.error('Hitilafu ya kufuta catalogue:', err);
      showNotification('error', 'Haikuweza kufuta catalogue.');
    }
  };

  const handleReorderCatalogues = async (orderedIds: string[]) => {
    if (!user?.uid) return;
    try {
      const reordered = await reorderShopCatalogues(user.uid, orderedIds);
      setMyCatalogues(reordered);
    } catch (err: any) {
      console.error('Hitilafu ya kupanga catalogues:', err);
      showNotification('error', 'Haikuweza kubadili mpangilio.');
    }
  };

  const handleToggleCatalogueActive = async (catalogue: ShopCatalogue) => {
    if (!user?.uid) return;
    try {
      const updated = await updateShopCatalogue(user.uid, catalogue.catalogueId, {
        isActive: !catalogue.isActive,
      });
      setMyCatalogues((prev) =>
        prev.map((c) => (c.catalogueId === updated.catalogueId ? updated : c))
      );
      showNotification(
        'success',
        updated.isActive
          ? `Catalogue ya "${catalogue.name}" sasa inaonekana dukan.`
          : `Catalogue ya "${catalogue.name}" imefichwa kwa wateja.`
      );
    } catch (err: any) {
      console.error('Hitilafu:', err);
    }
  };

  // Primary Seller Action in Banner
  const handlePrimarySellerAction = () => {
    if (!user) {
      showNotification('error', 'Tafadhali ingia kwenye akaunti yako ili kuanza kuuza au kuweka tangazo.');
      return;
    }

    if (hasSellerCapability) {
      setCurrentView('my_shop');
    } else {
      setIsSellerModalOpen(true);
    }
  };

  return (
    <div id="marketplace-page" className="flex-1 p-3 sm:p-4 space-y-4 max-w-7xl mx-auto w-full">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 p-3.5 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-semibold animate-in slide-in-from-top-3 ${
            notification.type === 'success'
              ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
              : notification.type === 'warning'
              ? 'bg-amber-900 text-amber-100 border-amber-700'
              : notification.type === 'info'
              ? 'bg-sky-900 text-sky-100 border-sky-700'
              : 'bg-rose-900 text-rose-100 border-rose-700'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          ) : notification.type === 'warning' ? (
            <AlertCircle className="w-4 h-4 text-amber-300" />
          ) : notification.type === 'info' ? (
            <Sparkles className="w-4 h-4 text-sky-300" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-300" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: SPECIFIC SELLER DIGITAL SHOP (Buyer Shop View) */}
      {/* ========================================================================= */}
      {currentView === 'buyer_shop' && viewingSellerShop && (
        <BuyerShopView
          shop={viewingSellerShop.shop}
          catalogues={viewingSellerShop.catalogues}
          products={products.filter((p) => p.sellerId === viewingSellerShop.shop.sellerId)}
          authoritativeVerification={
            viewingSellerShop.verification ||
            sellerVerificationsMap[viewingSellerShop.shop.sellerId] ||
            (user?.uid === viewingSellerShop.shop.sellerId ? sellerVerification : null)
          }
          initialCatalogueId={buyerShopInitialCatalogueId}
          highlightProductId={buyerShopHighlightProductId}
          isOwner={user?.uid === viewingSellerShop.shop.sellerId}
          onBackToMarket={() => {
            setBuyerShopInitialCatalogueId(null);
            setBuyerShopHighlightProductId(null);
            setCurrentView('marketplace');
          }}
          onViewProductDetails={(p) => setViewingProduct(p)}
          onEditProduct={(p) => {
            setEditingProduct(p);
            setIsFormModalOpen(true);
          }}
          onDeleteProduct={(p) => setProductToDelete(p)}
          onToggleProductStatus={handleToggleStatus}
          onContactSeller={handleStartConversation}
          onEditShop={() => setIsShopEditModalOpen(true)}
        />
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: SELLER'S OWN DIGITAL SHOP MANAGEMENT (Duka Langu) */}
      {/* ========================================================================= */}
      {currentView === 'my_shop' && myShop && (
        <div className="space-y-4">
          {/* Back to Marketplace Ribbon */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentView('marketplace')}
              className="py-2 px-3.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-800 text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[40px]"
            >
              <ArrowLeft className="w-4 h-4 text-stone-600" />
              <span>Rudi Kwenye Soko Kuu (Gulio)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewingSellerShop({
                  shop: myShop,
                  catalogues: myCatalogues,
                });
                setCurrentView('buyer_shop');
              }}
              className="py-2 px-3.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <Eye className="w-4 h-4 text-amber-800" />
              <span>Tazama Duka Lako Kama Mnunuzi</span>
            </button>
          </div>

          <SellerShopView
            shop={myShop}
            catalogues={myCatalogues}
            products={products}
            verificationStatus={
              (sellerVerification?.status === 'VERIFIED' || sellerVerification?.status === 'APPROVED' || sellerVerification?.hasActiveBadge || sellerVerification?.badgeStatus === 'ACTIVE')
                ? 'verified'
                : (sellerProfile?.verificationStatus || 'unverified')
            }
            sellerVerification={sellerVerification}
            onApplyVerification={() => setIsVerificationModalOpen(true)}
            isLoadingVerification={isLoadingVerification}
            onEditShop={() => setIsShopEditModalOpen(true)}
            onCreateCatalogue={() => {
              setEditingCatalogue(null);
              setIsCatalogueModalOpen(true);
            }}
            onEditCatalogue={(cat) => {
              setEditingCatalogue(cat);
              setIsCatalogueModalOpen(true);
            }}
            onDeleteCatalogue={handleDeleteCatalogue}
            onReorderCatalogues={handleReorderCatalogues}
            onToggleCatalogueActive={handleToggleCatalogueActive}
            onCreateProduct={() => {
              setEditingProduct(null);
              setIsFormModalOpen(true);
            }}
            onViewProductDetails={(p) => setViewingProduct(p)}
            onEditProduct={(p) => {
              setEditingProduct(p);
              setIsFormModalOpen(true);
            }}
            onDeleteProduct={(p) => setProductToDelete(p)}
            onToggleProductStatus={handleToggleStatus}
            onPreviewAsBuyer={() => {
              setViewingSellerShop({
                shop: myShop,
                catalogues: myCatalogues,
              });
              setCurrentView('buyer_shop');
            }}
            onTogglePublishShop={handleTogglePublishShop}
            onMoveProductCatalogue={handleMoveProductCatalogue}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: MARKETPLACE INBOX (Ujumbe wa Gulio - V1.11B) */}
      {/* ========================================================================= */}
      {currentView === 'inbox' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setInboxConversationId(null);
                setCurrentView('marketplace');
              }}
              className="py-2 px-3.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-800 text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[40px]"
            >
              <ArrowLeft className="w-4 h-4 text-stone-600" />
              <span>Rudi Kwenye Soko Kuu (Gulio)</span>
            </button>
          </div>

          <MarketplaceInboxView
            currentUserId={user?.uid || ''}
            isSeller={hasSellerCapability}
            initialConversationId={inboxConversationId}
            onViewProduct={(productId) => {
              const found = products.find((p) => p.productId === productId);
              if (found) {
                setViewingProduct(found);
              }
            }}
            onBackToMarket={() => {
              setInboxConversationId(null);
              setCurrentView('marketplace');
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: GLOBAL MARKETPLACE (Gulio Kuu) */}
      {/* ========================================================================= */}
      {currentView === 'marketplace' && (
        <div className="space-y-4">
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-amber-950 via-stone-900 to-amber-900 text-white rounded-3xl p-4 sm:p-6 shadow-md space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between gap-2 flex-wrap relative z-10">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Phase 1: Discovery & Navigation
                </span>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-amber-200 border border-white/10">
                  Mifugo & Pembejeo
                </span>
              </div>

              <button
                type="button"
                onClick={loadData}
                title="Sasisha Orodha ya Sokoni"
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-1 relative z-10">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Gulio la Mifugo & Pembejeo Tanzania
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
                Gundua bidhaa na maduka rasmi ya kidijitali (Digital Shops) ya wafugaji kote Tanzania. Vinjari catalogues na wasiliana na wauzaji moja kwa moja.
              </p>
            </div>

            {/* Action Buttons in Banner */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5 relative z-10">
              {hasSellerCapability ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentView('my_shop')}
                    className="py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[44px]"
                  >
                    <Store className="w-4 h-4" />
                    <span>Fungua Duka Langu ({myShop?.shopName || 'Digital Shop'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isSellerMonetizationLocked) {
                        if (sellerMonetizationStatus === 'NOT_ACTIVATED') {
                          setIsMarketFreeTrialModalOpen(true);
                          return;
                        } else {
                          setCurrentView('my_shop');
                          showNotification('warning', 'Usajili wako umeisha. Lipa TSh 1,000 ili kuendelea kuuza.');
                          return;
                        }
                      }
                      setEditingProduct(null);
                      setIsFormModalOpen(true);
                    }}
                    className="py-2.5 px-4 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
                  >
                    <Plus className="w-4 h-4 text-amber-300" />
                    <span>+ Weka Tangazo la Bidhaa</span>
                  </button>

                  {/* Verification Status Badge in Banner */}
                  {(sellerVerification?.status === 'VERIFIED' || sellerVerification?.status === 'APPROVED' || sellerVerification?.hasActiveBadge || sellerVerification?.badgeStatus === 'ACTIVE') ? (
                    <button
                      type="button"
                      onClick={() => setIsVerificationModalOpen(true)}
                      className="py-2.5 px-3.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-400/50 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer min-h-[44px]"
                      title="Umehakikiwa Kikamilifu - Bonyeza kutazama beji na maelezo"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Umehakikiwa Kikamilifu (Beji Hai)</span>
                    </button>
                  ) : (sellerVerification?.status === 'PENDING_VERIFICATION' || sellerVerification?.status === 'UNDER_REVIEW' || sellerVerification?.status === 'PAYMENT_CONFIRMED' || sellerVerification?.status === 'SUBMITTED') ? (
                    <button
                      type="button"
                      onClick={() => setIsVerificationModalOpen(true)}
                      className="py-2.5 px-3.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-400/50 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span>Uhakiki Unasubiri Ukaguzi</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsVerificationModalOpen(true)}
                      className="py-2.5 px-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-amber-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <Shield className="w-4 h-4 text-amber-300" />
                      <span>Pata Beji ya Uhakiki</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setCurrentView('inbox')}
                    className="py-2.5 px-3.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-400/50 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Ujumbe {inboxUnreadCount > 0 ? `(${inboxUnreadCount} mpya)` : 'wa Gulio'}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handlePrimarySellerAction}
                    className="py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[44px]"
                  >
                    <Store className="w-4 h-4 text-amber-200" />
                    <span>Fungua Duka Lako la Kidijitali (Bure)</span>
                  </button>

                  {user && (
                    <button
                      type="button"
                      onClick={() => setCurrentView('inbox')}
                      className="py-2.5 px-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-300" />
                      <span>Ujumbe {inboxUnreadCount > 0 ? `(${inboxUnreadCount} mpya)` : 'wa Gulio'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Top Bar Switcher (Bidhaa vs Maduka vs Duka Langu) */}
          <div className="flex items-center justify-between border-b border-stone-200 gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveMarketTab('products')}
                className={`pb-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeMarketTab === 'products'
                    ? 'border-amber-800 text-amber-900'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Bidhaa Zote (Gulio)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700">
                  {products.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMarketTab('shops')}
                className={`pb-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeMarketTab === 'shops'
                    ? 'border-amber-800 text-amber-900'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Maduka ya Mifugo (Shops)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-bold">
                  {publishedShops.length}
                </span>
              </button>

              {hasSellerCapability && (
                <button
                  type="button"
                  onClick={() => setCurrentView('my_shop')}
                  className="pb-3 px-3.5 text-xs font-bold border-b-2 border-transparent text-stone-500 hover:text-stone-800 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Store className="w-3.5 h-3.5 text-amber-700" />
                  <span>🏪 Duka Langu ({myProductsCount})</span>
                </button>
              )}

              {user && (
                <button
                  type="button"
                  onClick={() => setCurrentView('inbox')}
                  className={`pb-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    currentView === 'inbox'
                      ? 'border-emerald-700 text-emerald-900 font-extrabold'
                      : 'border-transparent text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Ujumbe (Inbox)</span>
                  {inboxUnreadCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-700 text-white font-bold animate-pulse">
                      {inboxUnreadCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {activeMarketTab === 'products' && (
              <span className="text-[11px] text-stone-500 font-medium hidden sm:inline-block shrink-0">
                Bidhaa {filteredProducts.length} zimepatikana
              </span>
            )}
          </div>

          {/* ===================================================================== */}
          {/* TAB 1: SHOP DISCOVERY (Maduka ya Mifugo) */}
          {/* ===================================================================== */}
          {activeMarketTab === 'shops' && (
            <ShopDiscoveryView
              shops={publishedShops}
              cataloguesMap={allCataloguesMap}
              products={products}
              authoritativeVerificationsMap={sellerVerificationsMap}
              onOpenShop={(sellerId, catalogueId, productId) =>
                handleOpenBuyerShop(sellerId, catalogueId, productId)
              }
              onGoToProducts={() => setActiveMarketTab('products')}
            />
          )}

          {/* ===================================================================== */}
          {/* TAB 2: PRODUCT DISCOVERY (Bidhaa Zote) */}
          {/* ===================================================================== */}
          {activeMarketTab === 'products' && (
            <>
              {/* Search & Filter Controls */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tafuta bidhaa, shamba/duka, kategoria, eneo au catalogue..."
                      className="w-full pl-9 pr-8 py-2.5 bg-white border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[44px]"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsVisualSearchModalOpen(true)}
                    className="px-3.5 py-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer min-h-[44px] bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100/80 shadow-2xs"
                    title="Tafuta bidhaa kwa picha au video"
                  >
                    <Camera className="w-4 h-4 text-emerald-700" />
                    <span className="hidden sm:inline">Tafuta kwa Picha</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsFilterModalOpen(true)}
                    className={`px-3.5 py-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                      selectedRegion !== 'all' || inStockOnly || sortBy !== 'newest' || minPrice || maxPrice
                        ? 'bg-amber-900 text-white border-amber-950'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="hidden sm:inline">Chuja & Panga</span>
                  </button>
                </div>

                {/* Category Horizontal Scroll with Count Badges */}
                <div className="flex overflow-x-auto pb-1 gap-1.5 no-scrollbar items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      selectedCategory === 'all'
                        ? 'bg-amber-900 text-white shadow-xs'
                        : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <span>Kategoria Zote</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        selectedCategory === 'all'
                          ? 'bg-amber-800 text-amber-100'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {categoryCounts.all || 0}
                    </span>
                  </button>

                  {activeMarketCategories.map((cat) => {
                    const count = (categoryCounts[cat.categoryId] || 0) || (categoryCounts[cat.name] || 0);
                    const isSelected = selectedCategory === cat.categoryId || selectedCategory === cat.name;

                    return (
                      <button
                        key={cat.categoryId}
                        type="button"
                        onClick={() => setSelectedCategory(isSelected ? 'all' : cat.categoryId)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                          isSelected
                            ? 'bg-amber-900 text-white shadow-xs'
                            : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <span>{cat.name}</span>
                        {count > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSelected
                                ? 'bg-amber-800 text-amber-100'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Active Filters Display */}
                {(selectedCategory !== 'all' || selectedRegion !== 'all' || inStockOnly || searchTerm || minPrice || maxPrice) && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                    <span className="text-stone-500 text-[11px] font-semibold">Vichujio vilivyotumika:</span>

                    {searchTerm && (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-lg font-medium">
                        "{searchTerm}"
                        <button
                          type="button"
                          onClick={() => setSearchTerm('')}
                          className="hover:text-amber-950"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {selectedCategory !== 'all' && (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-lg font-medium">
                        {selectedCategory}
                        <button
                          type="button"
                          onClick={() => setSelectedCategory('all')}
                          className="hover:text-amber-950"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {selectedRegion !== 'all' && (
                      <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-800 border border-stone-300 px-2 py-0.5 rounded-lg font-medium">
                        Mkoa: {selectedRegion}
                        <button
                          type="button"
                          onClick={() => setSelectedRegion('all')}
                          className="hover:text-stone-950"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {inStockOnly && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg font-medium">
                        Zilizopo Pekee
                        <button
                          type="button"
                          onClick={() => setInStockOnly(false)}
                          className="hover:text-emerald-950"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {(minPrice || maxPrice) && (
                      <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-800 border border-stone-300 px-2 py-0.5 rounded-lg font-medium">
                        Bei: {minPrice ? formatTshPrice(parseFloat(minPrice)) : '0'} - {maxPrice ? formatTshPrice(parseFloat(maxPrice)) : '∞'}
                        <button
                          type="button"
                          onClick={() => { setMinPrice(''); setMaxPrice(''); }}
                          className="hover:text-stone-950"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setSelectedRegion('all');
                        setInStockOnly(false);
                        setSearchTerm('');
                        setMinPrice('');
                        setMaxPrice('');
                      }}
                      className="text-[11px] text-amber-800 font-bold hover:underline ml-1 cursor-pointer"
                    >
                      Futa Zote
                    </button>
                  </div>
                )}
              </div>

              {/* Product List Grid */}
              {isLoading ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-amber-800 animate-spin mx-auto" />
                  <p className="text-xs text-stone-500 font-medium">Inapakia bidhaa za sokoni...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-3xl p-8 sm:p-12 text-center space-y-3">
                  <div className="w-14 h-14 bg-amber-50 text-amber-900 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                    <Store className="w-7 h-7" />
                  </div>
                  <div className="space-y-1 max-w-sm mx-auto">
                    <h3 className="text-sm font-bold text-stone-900">
                      {products.length === 0 ? 'Bado Hakuna Bidhaa Sokoni' : 'Hakuna Bidhaa Zilizopatikana'}
                    </h3>
                    <p className="text-xs text-stone-500 leading-relaxed">
                      {products.length === 0
                        ? 'Soko hili limeandaliwa kwa ajili ya wauzaji halisi pekee. Matangazo mapya ya mifugo na vifaa yataonekana hapa.'
                        : 'Hakuna bidhaa inayolingana na vigezo ulivyoweka. Jaribu kubadilisha kategoria, mkoa au neno la utafutaji.'}
                    </p>
                  </div>

                  <div className="pt-2 flex justify-center gap-2 flex-wrap">
                    {hasSellerCapability && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(null);
                          setIsFormModalOpen(true);
                        }}
                        className="py-2 px-4 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        Weka Tangazo la Kwanza
                      </button>
                    )}
                    {products.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setSelectedCategory('all');
                          setSelectedRegion('all');
                          setInStockOnly(false);
                          setMinPrice('');
                          setMaxPrice('');
                        }}
                        className="py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        Onyesha Bidhaa Zote
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredProducts.map((prod) => (
                    <ProductCard
                      key={prod.productId}
                      product={prod}
                      isOwner={user?.uid === prod.sellerId || isAdmin}
                      onViewDetails={(p) => setViewingProduct(p)}
                      onOpenShop={(sellerId) => handleOpenBuyerShop(sellerId)}
                      onOpenShopCatalogue={(sellerId, catalogueId) =>
                        handleOpenBuyerShop(sellerId, catalogueId, prod.productId)
                      }
                      onToggleStatus={handleToggleStatus}
                      onEdit={(p) => {
                        setEditingProduct(p);
                        setIsFormModalOpen(true);
                      }}
                      onDelete={(p) => setProductToDelete(p)}
                      onContact={handleStartConversation}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Safety Notice Footer */}
          <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 text-amber-950 text-xs flex items-start space-x-3">
            <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-bold">Usalama wa Soko la UFUGAJI UPDATE:</p>
              <p className="text-[11.5px] text-amber-900/90 leading-relaxed">
                Wasiliana na muuzaji moja kwa moja. Hakikisha unakagua mifugo, afya na ubora wa chakula au vifaa kabla ya kulipa. Usitume pesa mapema kwa muuzaji usiyemfahamu.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* Filter Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-amber-800" />
                <span>Chuja na Panga Orodha</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Region */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Mkoa / Eneo
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                >
                  <option value="all">Mikoa Yote ya Tanzania</option>
                  {TANZANIA_REGIONS.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Range Filter */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Bei ya Chini (TSh)
                  </label>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Mf. 5,000"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Bei ya Juu (TSh)
                  </label>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Mf. 100,000"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
              </div>

              {/* Sorting */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Panga Kwa (Sort By)
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600"
                >
                  {searchTerm && (
                    <option value="relevance">Inayofaa Zaidi (Most Relevant Search)</option>
                  )}
                  <option value="newest">Zilizowekwa Hivi Karibuni (Newest)</option>
                  <option value="price_asc">Bei: Ndogo kuelekea Kubwa</option>
                  <option value="price_desc">Bei: Kubwa kuelekea Ndogo</option>
                </select>
              </div>

              {/* In stock checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-700 focus:ring-amber-600"
                  />
                  <span className="font-semibold text-stone-700">
                    Onyesha bidhaa zilizopo ghalani pekee (In Stock)
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedRegion('all');
                  setSortBy('newest');
                  setInStockOnly(false);
                  setMinPrice('');
                  setMaxPrice('');
                }}
                className="py-2 px-3 text-stone-600 text-xs font-semibold hover:bg-stone-100 rounded-xl"
              >
                Rejesha Awali
              </button>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="py-2 px-5 bg-amber-900 hover:bg-amber-800 text-white text-xs font-bold rounded-xl"
              >
                Tumia Vichujio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-stone-900">
              Unathibitisha Kufuta Tangazo?
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Je, una uhakika unataka kufuta tangazo la{' '}
              <strong>"{productToDelete.title}"</strong>? Hatua hii haiwezi kurudishwa.
            </p>
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="py-2 px-3.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl"
              >
                Ghairi
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="py-2 px-4 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl"
              >
                Futa Tangazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {viewingProduct && (
        <ProductDetailModal
          product={viewingProduct}
          onClose={() => setViewingProduct(null)}
          isOwner={user?.uid === viewingProduct.sellerId || isAdmin}
          onContactSeller={handleStartConversation}
          onOpenShop={(sellerId) => {
            setViewingProduct(null);
            handleOpenBuyerShop(sellerId);
          }}
          onOpenShopCatalogue={(sellerId, catalogueId) => {
            setViewingProduct(null);
            handleOpenBuyerShop(sellerId, catalogueId, viewingProduct.productId);
          }}
          onEdit={(p) => {
            setViewingProduct(null);
            setEditingProduct(p);
            setIsFormModalOpen(true);
          }}
          onProductUpdated={(updated) => {
            setProducts((prev) => prev.map((item) => item.productId === updated.productId ? updated : item));
            setViewingProduct(updated);
            showNotification('success', 'Taarifa za bei/mzigo zimesasishwa kikamilifu kwenye soko!');
          }}
        />
      )}

      {/* Product Form Modal (Create or Edit) */}
      {isFormModalOpen && (
        <ProductFormModal
          initialProduct={editingProduct}
          catalogues={myCatalogues}
          onCreateCatalogue={() => {
            setEditingCatalogue(null);
            setIsCatalogueModalOpen(true);
          }}
          onClose={() => {
            setIsFormModalOpen(false);
            setEditingProduct(null);
          }}
          onSave={handleSaveProduct}
          defaultSellerName={myShop?.shopName || sellerProfile?.businessName || profile?.displayName || user?.displayName || ''}
          defaultPhone={myShop?.phone || sellerProfile?.phone || profile?.phone || ''}
          defaultLocation={myShop?.location || sellerProfile?.location || profile?.region || 'Dar es Salaam'}
        />
      )}

      {/* Seller Profile Modal (Join as Seller / Capability Setup) */}
      {isSellerModalOpen && (
        <SellerProfileModal
          initialProfile={sellerProfile}
          defaultDisplayName={profile?.displayName || user?.displayName || 'Mfugaji'}
          defaultPhone={profile?.phone || ''}
          defaultLocation={profile?.region || 'Dar es Salaam'}
          onClose={() => setIsSellerModalOpen(false)}
          onSave={handleSaveSellerProfile}
        />
      )}

      {/* Shop Edit Modal (Manage Digital Shop Settings) */}
      {isShopEditModalOpen && myShop && (
        <ShopEditModal
          initialShop={myShop}
          onClose={() => setIsShopEditModalOpen(false)}
          onSave={handleSaveShopDetails}
        />
      )}

      {/* Catalogue Create/Edit Modal */}
      {isCatalogueModalOpen && (
        <CatalogueModal
          initialCatalogue={editingCatalogue}
          suggestedOrder={myCatalogues.length + 1}
          onClose={() => {
            setIsCatalogueModalOpen(false);
            setEditingCatalogue(null);
          }}
          onSave={handleSaveCatalogue}
        />
      )}

      {/* Seller Verification Modal (V1.6A Marketplace Trust) */}
      {isVerificationModalOpen && user?.uid && (
        <SellerVerificationModal
          isOpen={isVerificationModalOpen}
          onClose={() => setIsVerificationModalOpen(false)}
          sellerId={user.uid}
          initialData={
            sellerVerification || {
              businessName: myShop?.shopName || sellerProfile?.businessName || '',
              displayName: sellerProfile?.displayName || profile?.displayName || user?.displayName || '',
              phone: myShop?.phone || sellerProfile?.phone || profile?.phone || '',
              location: myShop?.location || sellerProfile?.location || profile?.region || 'Dar es Salaam',
              district: myShop?.district || sellerProfile?.district || ''
            }
          }
          onSuccess={(updated) => {
            setSellerVerification(updated);
            showNotification(
              'success',
              'Ombi lako la uhakiki wa muuzaji limewasilishwa kikamilifu na linasubiri ukaguzi wa wasimamizi!'
            );
          }}
        />
      )}

      {/* Visual Marketplace Product Search Modal (V1.3E) */}
      <VisualMarketplaceSearchModal
        isOpen={isVisualSearchModalOpen}
        onClose={() => setIsVisualSearchModalOpen(false)}
        allProducts={products}
        onOpenProduct={(productId) => {
          setIsVisualSearchModalOpen(false);
          const found = products.find((p) => p.productId === productId);
          if (found) setViewingProduct(found);
        }}
        onOpenShop={(sellerId, catalogueId) => {
          setIsVisualSearchModalOpen(false);
          handleOpenBuyerShop(sellerId, catalogueId);
        }}
      />

      {/* V1.10A-CORRECTIVE-5: Unified Free Trial Activation Modal for Market Top Banner */}
      <FreeTrialActivationModal
        isOpen={isMarketFreeTrialModalOpen}
        sellerUserId={user?.uid || ''}
        sellerProfileId={myShop?.shopId}
        originAction="CREATE_LISTING"
        onClose={() => setIsMarketFreeTrialModalOpen(false)}
        onSuccess={(updatedRecord) => {
          setAuthoritativeSellerMonetization(updatedRecord);
          revalidateSellerMonetization().catch(() => {});
          setIsMarketFreeTrialModalOpen(false);
          // Requirement 4 & 13: Automatically continue to Weka Tangazo
          setEditingProduct(null);
          setIsFormModalOpen(true);
          showNotification('success', 'Hongera! Free Trial imewashwa. Sasa unaweza kuweka tangazo lako.');
        }}
      />
    </div>
  );
};
