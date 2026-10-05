import React, { useState } from 'react';
import { MarketplaceProduct } from '../../types/marketplace';
import {
  formatTshPrice,
  updateProductPrice,
  updateProductStock,
  updateProductDelivery,
  updateProductLocation
} from '../../services/marketplaceService';
import {
  validateProductOwnership,
  sanitizeProductDescription
} from '../../services/productOwnershipService';
import { resolvePriceStockTrust } from '../../services/productPriceStockService';
import { resolveLocationDeliveryTrust } from '../../services/productLocationDeliveryService';
import { evaluateProductMarketplaceEligibility } from '../../services/marketplaceGovernanceEnforcement';
import {
  X,
  MapPin,
  Tag,
  Store,
  ShieldCheck,
  ShieldAlert,
  PhoneCall,
  MessageCircle,
  MessageSquare,
  Package,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  Film,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Truck,
  Navigation,
  Edit2,
  Compass,
  Building
} from 'lucide-react';
import { ProductVideoPlayer } from './ProductVideoPlayer';
import { ProductReviewsSection } from './ProductReviewsSection';
import { MarketplaceTrustPanel } from './MarketplaceTrustPanel';
import { resolveProductTrustSignals } from '../../services/marketplaceTrustService';

interface ProductDetailModalProps {
  product: MarketplaceProduct | null;
  onClose: () => void;
  isOwner?: boolean;
  onEdit?: (product: MarketplaceProduct) => void;
  onOpenShop?: (sellerId: string) => void;
  onOpenShopCatalogue?: (sellerId: string, catalogueId?: string | null, productId?: string) => void;
  onProductUpdated?: (updatedProduct: MarketplaceProduct) => void;
  onContactSeller?: (product: MarketplaceProduct) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  isOwner,
  onEdit,
  onOpenShop,
  onOpenShopCatalogue,
  onProductUpdated,
  onContactSeller
}) => {
  const [currentProduct, setCurrentProduct] = useState<MarketplaceProduct | null>(product || null);

  React.useEffect(() => {
    if (product) {
      setCurrentProduct(product);
      setEditPriceVal(String(product.price ?? ''));
      setEditStockVal(String(product.quantityAvailable ?? ''));
      setEditDelivAvailable(Boolean(product.deliveryAvailable));
      setEditPickupAvailable(Boolean(product.pickupAvailable));
      setEditDelivFeeType(product.deliveryFeeType || (product.deliveryFee !== undefined && product.deliveryFee !== null ? (product.deliveryFee === 0 ? 'FREE' : 'FIXED') : 'NOT_PROVIDED'));
      setEditDelivFeeVal(product.deliveryFee !== undefined && product.deliveryFee !== null ? String(product.deliveryFee) : '');
      setEditDelivAreasVal(product.deliveryAreas ? product.deliveryAreas.join(', ') : '');
      setEditDelivTimeEstVal(product.deliveryTimeEstimate || '');
      setEditPickupAddressVal(product.pickupAddress || '');
      setEditRegionVal(product.region || product.location || '');
      setEditDistrictVal(product.district || '');
      setEditAreaVal(product.area || '');
    }
  }, [product]);

  // V1.6G: Authoritative Unified Product Trust Signals derivation
  const trustSignals = React.useMemo(() => {
    return currentProduct ? resolveProductTrustSignals(currentProduct) : null;
  }, [currentProduct]);

  // V1.6D: Authoritative Price & Stock Trust derivation
  const priceStock = React.useMemo(() => {
    return resolvePriceStockTrust(currentProduct);
  }, [currentProduct]);

  // V1.6E: Authoritative Location, Delivery & Availability Trust derivation
  const locDelivery = React.useMemo(() => {
    return resolveLocationDeliveryTrust(currentProduct);
  }, [currentProduct]);

  // Quick Price & Stock Update State for product owners
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  const [editPriceVal, setEditPriceVal] = useState(String(product?.price ?? ''));
  const [editStockVal, setEditStockVal] = useState(String(product?.quantityAvailable ?? ''));
  const [isUpdatingPriceStock, setIsUpdatingPriceStock] = useState(false);
  const [quickUpdateSuccess, setQuickUpdateSuccess] = useState<string | null>(null);
  const [quickUpdateError, setQuickUpdateError] = useState<string | null>(null);

  // V1.6E: Quick Location & Delivery Update State for product owners
  const [showDeliveryUpdate, setShowDeliveryUpdate] = useState(false);
  const [showLocationUpdate, setShowLocationUpdate] = useState(false);
  const [editDelivAvailable, setEditDelivAvailable] = useState(Boolean(product?.deliveryAvailable));
  const [editPickupAvailable, setEditPickupAvailable] = useState(Boolean(product?.pickupAvailable));
  const [editDelivFeeType, setEditDelivFeeType] = useState<string>(
    product?.deliveryFeeType || (product?.deliveryFee !== undefined && product?.deliveryFee !== null ? (product.deliveryFee === 0 ? 'FREE' : 'FIXED') : 'NOT_PROVIDED')
  );
  const [editDelivFeeVal, setEditDelivFeeVal] = useState(
    product?.deliveryFee !== undefined && product?.deliveryFee !== null ? String(product.deliveryFee) : ''
  );
  const [editDelivAreasVal, setEditDelivAreasVal] = useState(
    product?.deliveryAreas ? product.deliveryAreas.join(', ') : ''
  );
  const [editDelivTimeEstVal, setEditDelivTimeEstVal] = useState(product?.deliveryTimeEstimate || '');
  const [editPickupAddressVal, setEditPickupAddressVal] = useState(product?.pickupAddress || '');
  const [editRegionVal, setEditRegionVal] = useState(product?.region || product?.location || '');
  const [editDistrictVal, setEditDistrictVal] = useState(product?.district || '');
  const [editAreaVal, setEditAreaVal] = useState(product?.area || '');
  const [isUpdatingDelivLoc, setIsUpdatingDelivLoc] = useState(false);
  const [delivLocSuccess, setDelivLocSuccess] = useState<string | null>(null);
  const [delivLocError, setDelivLocError] = useState<string | null>(null);

  const handleQuickDeliveryUpdate = async () => {
    if (!currentProduct) return;
    setDelivLocError(null);
    setDelivLocSuccess(null);

    let parsedFee: number | null = null;
    if (editDelivFeeType === 'FREE') {
      parsedFee = 0;
    } else if (editDelivFeeType === 'FIXED') {
      const numF = Number(editDelivFeeVal);
      if (isNaN(numF) || numF < 0) {
        setDelivLocError('Tafadhali weka gharama sahihi ya usafirishaji (Tsh) isiyo hasi.');
        return;
      }
      parsedFee = numF;
    } else {
      parsedFee = null;
    }

    const areasArray = editDelivAreasVal
      ? editDelivAreasVal.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    try {
      setIsUpdatingDelivLoc(true);
      const updated = await updateProductDelivery(currentProduct.sellerId, currentProduct.productId, {
        deliveryAvailable: editDelivAvailable,
        pickupAvailable: editPickupAvailable,
        deliveryFee: parsedFee,
        deliveryFeeType: editDelivFeeType as any,
        deliveryAreas: areasArray,
        deliveryTimeEstimate: editDelivTimeEstVal.trim() || null,
        pickupAddress: editPickupAddressVal.trim() || undefined
      });
      setCurrentProduct(updated);
      setDelivLocSuccess('Mipangilio ya usafirishaji imesasishwa kikamilifu!');
      if (onProductUpdated) onProductUpdated(updated);
    } catch (err: any) {
      setDelivLocError(err?.message || 'Hitilafu ya kusasisha mipangilio ya usafirishaji.');
    } finally {
      setIsUpdatingDelivLoc(false);
    }
  };

  const handleQuickLocationUpdate = async () => {
    if (!currentProduct) return;
    setDelivLocError(null);
    setDelivLocSuccess(null);

    if (!editRegionVal.trim()) {
      setDelivLocError('Tafadhali weka angalau jina la mkoa/eneo.');
      return;
    }

    try {
      setIsUpdatingDelivLoc(true);
      const updated = await updateProductLocation(currentProduct.sellerId, currentProduct.productId, {
        region: editRegionVal.trim(),
        district: editDistrictVal.trim() || undefined,
        area: editAreaVal.trim() || undefined,
        location: editRegionVal.trim(),
        productLocation: [editAreaVal.trim(), editDistrictVal.trim(), editRegionVal.trim()].filter(Boolean).join(', ') || editRegionVal.trim()
      });
      setCurrentProduct(updated);
      setDelivLocSuccess('Eneo la bidhaa limesasishwa kikamilifu!');
      if (onProductUpdated) onProductUpdated(updated);
    } catch (err: any) {
      setDelivLocError(err?.message || 'Hitilafu ya kusasisha eneo la bidhaa.');
    } finally {
      setIsUpdatingDelivLoc(false);
    }
  };

  const handleQuickPriceUpdate = async () => {
    if (!currentProduct) return;
    setQuickUpdateError(null);
    setQuickUpdateSuccess(null);
    const pNum = Number(editPriceVal);
    if (isNaN(pNum) || pNum <= 0) {
      setQuickUpdateError('Tafadhali weka bei sahihi ya nambari zaidi ya 0 (Tsh).');
      return;
    }
    try {
      setIsUpdatingPriceStock(true);
      const updated = await updateProductPrice(currentProduct.sellerId, currentProduct.productId, pNum);
      setCurrentProduct(updated);
      setQuickUpdateSuccess('Bei imesasishwa kikamilifu pamoja na muda mpya wa uthibitisho!');
      if (onProductUpdated) onProductUpdated(updated);
    } catch (err: any) {
      setQuickUpdateError(err?.message || 'Hitilafu ya kusasisha bei.');
    } finally {
      setIsUpdatingPriceStock(false);
    }
  };

  const handleQuickStockUpdate = async () => {
    if (!currentProduct) return;
    setQuickUpdateError(null);
    setQuickUpdateSuccess(null);
    const sNum = Number(editStockVal);
    if (isNaN(sNum) || sNum < 0) {
      setQuickUpdateError('Idadi ya bidhaa inayopatikana haiwezi kuwa hasi.');
      return;
    }
    try {
      setIsUpdatingPriceStock(true);
      const updated = await updateProductStock(currentProduct.sellerId, currentProduct.productId, sNum);
      setCurrentProduct(updated);
      setQuickUpdateSuccess('Idadi imesasishwa kikamilifu pamoja na muda mpya wa uthibitisho!');
      if (onProductUpdated) onProductUpdated(updated);
    } catch (err: any) {
      setQuickUpdateError(err?.message || 'Hitilafu ya kusasisha idadi.');
    } finally {
      setIsUpdatingPriceStock(false);
    }
  };

  // Images list
  const allImages = React.useMemo(() => {
    if (!currentProduct) return [];
    if (currentProduct.images && currentProduct.images.length > 0) {
      return currentProduct.images;
    }
    if (currentProduct.imageUrl) {
      return [
        {
          id: 'primary',
          url: currentProduct.imageUrl,
          isPrimary: true,
          uploadedAt: currentProduct.createdAt
        }
      ];
    }
    return [];
  }, [currentProduct]);

  // V1.6C: Authoritative Product Ownership & Description Sanitization
  const ownership = React.useMemo(() => {
    return currentProduct ? validateProductOwnership(currentProduct) : null;
  }, [currentProduct]);

  const sanitizedDescInfo = React.useMemo(() => {
    return currentProduct ? sanitizeProductDescription(currentProduct.description) : null;
  }, [currentProduct]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);

  if (!product || !currentProduct || !priceStock || !locDelivery) return null;

  // V1.7G: Governance Eligibility Evaluation
  const eligibility = evaluateProductMarketplaceEligibility(currentProduct);

  // If product is ineligible (REJECTED, HIDDEN, SUSPENDED, UNDER_REVIEW, or restricted seller)
  // Non-owners must NEVER see the listing or contact the seller
  if (!eligibility.isEligible && !isOwner) {
    return (
      <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Tangazo Halipatikani kwa Sasa</h3>
          <p className="text-sm text-stone-600 mb-6 leading-relaxed">
            {eligibility.publicUnavailableReason || 'Tangazo hili halipatikani sokoni kwa sasa kutokana na taratibu za kiutawala, ukaguzi au mabadiliko ya mfumo.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
          >
            Funga
          </button>
        </div>
      </div>
    );
  }

  const handleCall = () => {
    if (product.sellerPhone) {
      window.location.href = `tel:${product.sellerPhone}`;
    }
  };

  const handleWhatsApp = () => {
    if (product.sellerPhone) {
      const cleanPhone = product.sellerPhone.replace(/[^0-9]/g, '');
      const formattedPhone = cleanPhone.startsWith('0')
        ? '255' + cleanPhone.substring(1)
        : cleanPhone.startsWith('255')
        ? cleanPhone
        : '255' + cleanPhone;

      const message = encodeURIComponent(
        `Habari ${product.sellerBusinessName || product.sellerName}, nimeona tangazo lako la "${product.title}" kwenye mfumo wa UFUGAJI UPDATE. Je bado linapatikana?`
      );

      window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    }
  };

  const formattedDate = new Date(product.createdAt).toLocaleDateString('sw-TZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const activeImage = allImages[activeImageIndex] || allImages[0];

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                {product.category}
              </span>
              {product.subcategory && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {product.subcategory}
                </span>
              )}
              {product.catalogueName && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-200 border border-stone-600 inline-flex items-center gap-1">
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>Catalogue: {product.catalogueName}</span>
                </span>
              )}
              {product.isTestDemo && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-700 text-stone-300 border border-stone-600">
                  Mfano wa Jaribio / Test Data
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white leading-snug pt-1">
              {product.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white bg-stone-800/80 hover:bg-stone-700 rounded-full transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Owner Governance Notice Banner */}
          {isOwner && eligibility && !eligibility.isEligible && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 mb-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1.5 flex-1">
                  <div className="font-bold uppercase tracking-wider text-[11px] text-amber-900 flex items-center gap-2">
                    <span>Hali ya Kiutawala:</span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-200/90 text-amber-950 font-black">
                      {eligibility.moderationStatus}
                    </span>
                  </div>
                  <p className="font-medium text-stone-800">
                    {eligibility.sellerNotice}
                  </p>
                  {currentProduct.moderationPublicReason && (
                    <p className="text-stone-700 bg-amber-100/60 p-2 rounded-lg border border-amber-200">
                      <strong>Sababu:</strong> {currentProduct.moderationPublicReason}
                    </p>
                  )}
                  {currentProduct.moderationCorrectionNote && (
                    <p className="text-stone-700 bg-amber-100/60 p-2 rounded-lg border border-amber-200">
                      <strong>Maelekezo ya Marekebisho:</strong> {currentProduct.moderationCorrectionNote}
                    </p>
                  )}
                  <p className="text-[11px] font-bold text-amber-900 pt-1 border-t border-amber-200">
                    Kumbuka: Wanunuzi hawawezi kuona wala kuagiza tangazo hili hadi msimamizi atakapoidhinisha kufuata vigezo vya soko.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Image Gallery */}
          {allImages.length > 0 ? (
            <div className="space-y-2">
              <div className="relative w-full h-56 sm:h-72 bg-stone-950 rounded-2xl overflow-hidden border border-stone-200 flex items-center justify-center group">
                <img
                  src={activeImage?.url}
                  alt={product.title}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={() => setIsLightboxOpen(true)}
                  referrerPolicy="no-referrer"
                />

                {/* Lightbox Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="absolute bottom-3 right-3 p-2 bg-stone-900/80 hover:bg-stone-900 text-white rounded-xl text-xs flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer"
                  title="Fungua Picha Kubwa"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span className="text-[11px] font-medium hidden sm:inline">Panua Picha</span>
                </button>

                {/* Previous / Next buttons if multiple */}
                {allImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white backdrop-blur-xs transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white backdrop-blur-xs transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails strip */}
              {allImages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                  {allImages.map((img, idx) => (
                    <button
                      key={img.id || idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                        activeImageIndex === idx
                          ? 'border-amber-600 ring-2 ring-amber-600/30 scale-105'
                          : 'border-stone-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={`Thumbnail ${idx + 1}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-36 bg-stone-100 rounded-2xl border border-stone-200 flex flex-col items-center justify-center text-stone-600 space-y-1">
              <Package className="w-8 h-8 text-stone-500" />
              <span className="text-xs font-semibold">Tangazo hili halina picha zilizopakiwa</span>
            </div>
          )}

          {/* Optional Product Explanation Video Section */}
          {product.video?.url && (
            <div className="bg-stone-900 text-white rounded-2xl p-4 border border-stone-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-600/30 border border-amber-500/40 rounded-lg text-amber-400">
                    <VideoIcon className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <span>Video ya Maelezo ya Bidhaa</span>
                    </h4>
                    <p className="text-[11px] text-stone-400">
                      {product.video.title || 'Tazama video ikionyesha ubora na matumizi ya bidhaa hii'}
                    </p>
                  </div>
                </div>

                {product.video.durationSeconds && product.video.durationSeconds > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 border border-stone-700">
                    {Math.floor(product.video.durationSeconds / 60)}:
                    {(product.video.durationSeconds % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Video Player Box with Self-Healing Cloud & Cache Resolution */}
              <ProductVideoPlayer
                video={product.video}
                productTitle={product.title}
              />

              {/* Optional Video Description */}
              {product.video.description && (
                <p className="text-xs text-stone-300 bg-stone-800/50 p-2.5 rounded-xl border border-stone-800 leading-relaxed">
                  {product.video.description}
                </p>
              )}
            </div>
          )}

          {/* V1.7B: Authoritative Listing Validation Governance (Visible to Seller) */}
          {isOwner && (product.validationStatus || (product.validationErrors && product.validationErrors.length > 0)) && (
            <div className={`p-4 rounded-2xl border ${
              product.validationStatus === 'VALID'
                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                : product.validationStatus === 'INCOMPLETE'
                ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                : product.validationStatus === 'BLOCKED'
                ? 'bg-red-50/70 border-red-300 text-red-950'
                : 'bg-rose-50/70 border-rose-300 text-rose-950'
            } space-y-2.5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${
                    product.validationStatus === 'VALID' ? 'text-emerald-750' : 'text-amber-700'
                  }`} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Ukaguzi wa Tangazo (V1.7B Governance)
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  product.validationStatus === 'VALID'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : product.validationStatus === 'INCOMPLETE'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : product.validationStatus === 'BLOCKED'
                    ? 'bg-red-100 text-red-800 border-red-300'
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}>
                  {product.validationStatus === 'VALID'
                    ? 'Imeidhinishwa (VALID)'
                    : product.validationStatus === 'INCOMPLETE'
                    ? 'Haijakamilika (INCOMPLETE)'
                    : product.validationStatus === 'BLOCKED'
                    ? 'Imezuiliwa (BLOCKED)'
                    : 'Si Sahihi (INVALID)'}
                </span>
              </div>

              {product.validationErrors && product.validationErrors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-rose-800">
                    Vizuizi vya Kuwasha Tangazo (Blocking Errors):
                  </p>
                  <ul className="text-xs space-y-1 text-rose-900 list-disc list-inside">
                    {product.validationErrors.map((err, idx) => (
                      <li key={idx} className="leading-snug">{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {product.validationWarnings && product.validationWarnings.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] font-semibold text-amber-800">
                    Mapendekezo ya Kuboresha (Non-blocking Warnings):
                  </p>
                  <ul className="text-xs space-y-1 text-amber-900 list-disc list-inside">
                    {product.validationWarnings.map((warn, idx) => (
                      <li key={idx} className="leading-snug">{warn.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {product.validatedAt && (
                <p className="text-[10px] text-stone-500 pt-1">
                  Ilithibitishwa: {new Date(product.validatedAt).toLocaleString('sw-TZ')} ({product.validationVersion || 'V1.7B'})
                </p>
              )}
            </div>
          )}

          {/* V1.6D: Price & Stock Trust Architecture */}
          <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-700" />
                <span>Taarifa za Bei na Mzigo (Price & Stock Trust)</span>
              </span>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => setShowQuickUpdate(!showQuickUpdate)}
                  className="text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-100/80 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isUpdatingPriceStock ? 'animate-spin' : ''}`} />
                  <span>{showQuickUpdate ? 'Funga Usasishaji' : 'Sasisha Bei/Mzigo'}</span>
                </button>
              )}
            </div>

            {/* Quick Update Drawer for Owner */}
            {isOwner && showQuickUpdate && (
              <div className="p-3.5 bg-white border border-amber-300 rounded-xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                    <span>Sasisha Bei au Idadi Moja kwa Moja (Authoritative Refresh)</span>
                  </h5>
                  <span className="text-[10px] text-stone-500 font-medium">Rekodi muda halisi</span>
                </div>

                {quickUpdateSuccess && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{quickUpdateSuccess}</span>
                  </div>
                )}

                {quickUpdateError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-lg text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{quickUpdateError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Price Update */}
                  <div className="space-y-1.5 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                    <label className="text-[11px] font-bold text-stone-700 block">
                      Bei Mpya (Tsh / {currentProduct.unit}):
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min="1"
                        step="50"
                        value={editPriceVal}
                        onChange={(e) => setEditPriceVal(e.target.value)}
                        placeholder="Bei mpya"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-600"
                      />
                      <button
                        type="button"
                        disabled={isUpdatingPriceStock}
                        onClick={handleQuickPriceUpdate}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        Hifadhi Bei
                      </button>
                    </div>
                  </div>

                  {/* Stock Update */}
                  <div className="space-y-1.5 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                    <label className="text-[11px] font-bold text-stone-700 block">
                      Idadi Mpya ya Mzigo ({currentProduct.unit}):
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min="0"
                        value={editStockVal}
                        onChange={(e) => setEditStockVal(e.target.value)}
                        placeholder="Idadi iliyopo"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-600"
                      />
                      <button
                        type="button"
                        disabled={isUpdatingPriceStock}
                        onClick={handleQuickStockUpdate}
                        className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        Hifadhi Idadi
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Price & Stock Main Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Price Block */}
              <div className="bg-white border border-stone-200 rounded-xl p-3.5 flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[11px] font-bold text-stone-600">Bei ya Tangazo:</span>
                    <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded font-medium">
                      Iliyoorodheshwa na Muuzaji
                    </span>
                  </div>

                  {priceStock.price.status === 'PROVIDED' ? (
                    <div className="flex items-baseline gap-1.5 pt-0.5">
                      <span className="text-2xl font-black text-emerald-800 tracking-tight">
                        {priceStock.price.displayPrice}
                      </span>
                      <span className="text-xs text-stone-600 font-bold">
                        / {currentProduct.unit}
                      </span>
                    </div>
                  ) : (
                    <div className="py-1">
                      <span className="text-base font-bold text-stone-600 bg-stone-100 px-2.5 py-1 rounded-lg">
                        {priceStock.price.displayPrice}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10.5px]">
                  <span className="text-stone-500 inline-flex items-center gap-1 font-medium">
                    <Clock className="w-3 h-3 text-stone-400" />
                    <span>Ilisasishwa: <strong className="text-stone-800 font-bold">{priceStock.price.lastUpdatedText || 'Haijasasishwa'}</strong></span>
                  </span>

                  {priceStock.price.isStale && (
                    <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300" title="Bei haijasasishwa kwa zaidi ya miezi 3. Ulizia kwa muuzaji.">
                      Bei ya Zamani
                    </span>
                  )}
                </div>
              </div>

              {/* Stock Block */}
              <div className="bg-white border border-stone-200 rounded-xl p-3.5 flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[11px] font-bold text-stone-600">Upatikanaji wa Mzigo:</span>
                    <span
                      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md border ${
                        priceStock.stock.status === 'IN_STOCK'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : priceStock.stock.status === 'OUT_OF_STOCK'
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-stone-100 text-stone-700 border-stone-300'
                      }`}
                    >
                      {priceStock.stock.status === 'IN_STOCK'
                        ? 'Inapatikana'
                        : priceStock.stock.status === 'OUT_OF_STOCK'
                        ? 'Imeisha (0)'
                        : 'Haijawekwa'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 pt-0.5">
                    <span className="text-xl font-black text-stone-900 tracking-tight">
                      {priceStock.stock.status === 'IN_STOCK' ? (
                        <>{priceStock.stock.quantity} <span className="text-xs font-bold text-stone-600">{currentProduct.unit}</span></>
                      ) : (
                        priceStock.stock.displayStock
                      )}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10.5px]">
                  <span className="text-stone-500 inline-flex items-center gap-1 font-medium">
                    <Package className="w-3 h-3 text-stone-400" />
                    <span>Ilisasishwa: <strong className="text-stone-800 font-bold">{priceStock.stock.lastUpdatedText || 'Haijasasishwa'}</strong></span>
                  </span>

                  {priceStock.stock.isStale && (
                    <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      Mzigo wa Zamani
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Information Discrepancy & Conflict Warning */}
            {(priceStock.hasDescriptionPriceConflict || priceStock.hasDescriptionStockConflict) && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Ukinzani wa Taarifa (Listing Discrepancy Detected):</span>
                </div>
                {priceStock.structuredWinsNotice && (
                  <p className="text-[11px] text-amber-900/90 pl-1">
                    {priceStock.structuredWinsNotice}
                  </p>
                )}
                <p className="text-[10px] text-amber-800 pt-0.5 italic">
                  Wanunuzi wanashauriwa kuthibitisha bei na idadi halisi moja kwa moja na muuzaji kabla ya safari au malipo.
                </p>
              </div>
            )}

            {/* Authoritative Disclaimer */}
            <div className="text-[10.5px] text-stone-500 bg-stone-100/80 p-2 rounded-lg border border-stone-200/60 leading-relaxed flex items-start gap-1.5">
              <span className="font-bold text-stone-700 shrink-0">Ilani:</span>
              <span>
                Bei na idadi inayopatikana zimerekodiwa kama zilivyotolewa na muuzaji. Mfumo haujafanya ukaguzi wa kimamlaka au kutabiri bei ya soko.
              </span>
            </div>
          </div>

          {/* V1.6E: Authoritative Availability, Location & Delivery Trust Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-700" />
                <span>Upatikanaji, Mahali & Usafirishaji (Trust & Logistics)</span>
              </h4>

              {isOwner && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationUpdate(!showLocationUpdate);
                      setShowDeliveryUpdate(false);
                    }}
                    className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>{showLocationUpdate ? 'Funga Eneo' : 'Badili Eneo'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeliveryUpdate(!showDeliveryUpdate);
                      setShowLocationUpdate(false);
                    }}
                    className="text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Truck className="w-3 h-3" />
                    <span>{showDeliveryUpdate ? 'Funga Usafirishaji' : 'Badili Usafirishaji'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Availability Trust Banner */}
            <div
              className={`p-3 rounded-2xl border flex items-start justify-between gap-3 text-xs ${
                locDelivery.availability.state === 'AVAILABLE'
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  : locDelivery.availability.state === 'LIMITED_INFORMATION'
                  ? 'bg-sky-50/80 border-sky-200 text-sky-950'
                  : locDelivery.availability.state === 'STALE'
                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                  : 'bg-rose-50/80 border-rose-200 text-rose-950'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-black uppercase tracking-wider text-[10.5px] px-2 py-0.5 rounded-full border ${
                      locDelivery.availability.state === 'AVAILABLE'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                        : locDelivery.availability.state === 'LIMITED_INFORMATION'
                        ? 'bg-sky-100 border-sky-300 text-sky-900'
                        : locDelivery.availability.state === 'STALE'
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-rose-100 border-rose-300 text-rose-900'
                    }`}
                  >
                    {locDelivery.availability.displayLabel}
                  </span>
                  <span className="text-stone-400 text-[10px]">• Upatikanaji Rasmi</span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-stone-700 pt-1">
                  {locDelivery.availability.explanation}
                </p>
              </div>

              <span className="text-[10px] text-stone-500 font-medium shrink-0 pt-0.5">
                Tangazo: {formattedDate}
              </span>
            </div>

            {/* Quick Location Update Panel (Owner Only) */}
            {isOwner && showLocationUpdate && (
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-xs space-y-3">
                <div className="flex items-center justify-between font-bold text-amber-950">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-700" />
                    <span>Sasisha Eneo la Bidhaa Hii (Authoritative Location Update):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLocationUpdate(false)}
                    className="text-amber-800 hover:text-amber-950"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {delivLocSuccess && (
                  <div className="p-2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold">
                    {delivLocSuccess}
                  </div>
                )}
                {delivLocError && (
                  <div className="p-2 bg-rose-100 text-rose-900 border border-rose-300 rounded-lg text-xs font-semibold">
                    {delivLocError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Mkoa *</label>
                    <input
                      type="text"
                      value={editRegionVal}
                      onChange={(e) => setEditRegionVal(e.target.value)}
                      placeholder="Mf. Dar es Salaam"
                      className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Wilaya</label>
                    <input
                      type="text"
                      value={editDistrictVal}
                      onChange={(e) => setEditDistrictVal(e.target.value)}
                      placeholder="Mf. Kinondoni"
                      className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Eneo / Mtaa</label>
                    <input
                      type="text"
                      value={editAreaVal}
                      onChange={(e) => setEditAreaVal(e.target.value)}
                      placeholder="Mf. Mwenge / Shamba namba 4"
                      className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowLocationUpdate(false)}
                    className="px-3 py-1.5 text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-bold"
                  >
                    Ghairi
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingDelivLoc}
                    onClick={handleQuickLocationUpdate}
                    className="px-3.5 py-1.5 text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg text-xs font-bold"
                  >
                    {isUpdatingDelivLoc ? 'Inasasisha...' : 'Hifadhi Eneo Jipya'}
                  </button>
                </div>
              </div>
            )}

            {/* Quick Delivery Update Panel (Owner Only) */}
            {isOwner && showDeliveryUpdate && (
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-300 text-xs space-y-3">
                <div className="flex items-center justify-between font-bold text-emerald-950">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-700" />
                    <span>Sasisha Mipangilio ya Usafirishaji (Delivery Trust Update):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDeliveryUpdate(false)}
                    className="text-emerald-800 hover:text-emerald-950"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {delivLocSuccess && (
                  <div className="p-2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold">
                    {delivLocSuccess}
                  </div>
                )}
                {delivLocError && (
                  <div className="p-2 bg-rose-100 text-rose-900 border border-rose-300 rounded-lg text-xs font-semibold">
                    {delivLocError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="delivAvailableCheck"
                        checked={editDelivAvailable}
                        onChange={(e) => setEditDelivAvailable(e.target.checked)}
                        className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <label htmlFor="delivAvailableCheck" className="text-xs font-bold text-stone-800">
                        Usafirishaji Unapatikana (Delivery Available)
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="pickupAvailableCheck"
                        checked={editPickupAvailable}
                        onChange={(e) => setEditPickupAvailable(e.target.checked)}
                        className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <label htmlFor="pickupAvailableCheck" className="text-xs font-bold text-stone-800">
                        Mteja Anaweza Kuchukua Mwenyewe (Pickup Available)
                      </label>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">Gharama ya Usafirishaji</label>
                      <select
                        value={editDelivFeeType}
                        onChange={(e) => setEditDelivFeeType(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="NOT_PROVIDED">Haijaainishwa (Muulize muuzaji)</option>
                        <option value="FREE">Bila Malipo (Bure / Free Delivery)</option>
                        <option value="FIXED">Gharama Maalum (Weka kiasi TZS)</option>
                        <option value="NEGOTIABLE">Maelewano ya Bei (Negotiable)</option>
                      </select>
                    </div>

                    {editDelivFeeType === 'FIXED' && (
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">Kiasi cha Usafirishaji (Tsh)</label>
                        <input
                          type="number"
                          value={editDelivFeeVal}
                          onChange={(e) => setEditDelivFeeVal(e.target.value)}
                          placeholder="Mf. 5000"
                          min="0"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Maeneo Yanayofikishwa (Tenganisha kwa mkato)
                      </label>
                      <input
                        type="text"
                        value={editDelivAreasVal}
                        onChange={(e) => setEditDelivAreasVal(e.target.value)}
                        placeholder="Mf. Dar es Salaam, Morogoro, Pwani"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Makadirio ya Muda wa Kufikisha
                      </label>
                      <input
                        type="text"
                        value={editDelivTimeEstVal}
                        onChange={(e) => setEditDelivTimeEstVal(e.target.value)}
                        placeholder="Mf. Siku 1 - 2 au Saa 24"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Anwani ya Kuchukulia Mzigo (Pickup Address)
                      </label>
                      <input
                        type="text"
                        value={editPickupAddressVal}
                        onChange={(e) => setEditPickupAddressVal(e.target.value)}
                        placeholder="Mf. Dukani Mwenge au Shambani"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDeliveryUpdate(false)}
                    className="px-3 py-1.5 text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-bold"
                  >
                    Ghairi
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingDelivLoc}
                    onClick={handleQuickDeliveryUpdate}
                    className="px-3.5 py-1.5 text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg text-xs font-bold"
                  >
                    {isUpdatingDelivLoc ? 'Inasasisha...' : 'Hifadhi Mipangilio'}
                  </button>
                </div>
              </div>
            )}

            {/* Location & Delivery Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Card 1: Structured Location Card */}
              <div className="p-3.5 bg-stone-50/90 rounded-2xl border border-stone-200/80 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5 font-medium text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>
                        {locDelivery.location.locationType === 'PRODUCT_LOCATION'
                          ? 'Eneo Maalumu la Bidhaa'
                          : locDelivery.location.locationType === 'SHOP_LOCATION'
                          ? 'Eneo la Duka Kuu'
                          : locDelivery.location.locationType === 'SELLER_LOCATION'
                          ? 'Eneo la Muuzaji'
                          : 'Eneo la Bidhaa'}
                      </span>
                    </span>

                    <span
                      className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded border ${
                        locDelivery.location.status === 'LOCATION_PROVIDED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : locDelivery.location.status === 'LOCATION_PARTIAL'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-stone-100 text-stone-600 border-stone-300'
                      }`}
                    >
                      {locDelivery.location.status === 'LOCATION_PROVIDED'
                        ? 'Lipo Kamili'
                        : locDelivery.location.status === 'LOCATION_PARTIAL'
                        ? 'Kipande (Partial)'
                        : locDelivery.location.status === 'LOCATION_STALE'
                        ? 'La Zamani'
                        : 'Halijawekwa'}
                    </span>
                  </div>

                  <p className="font-bold text-stone-900 text-sm leading-snug">
                    {locDelivery.location.displayLocation}
                  </p>

                  {(locDelivery.location.district || locDelivery.location.area) && (
                    <div className="text-[11px] text-stone-600 space-y-0.5 pt-0.5">
                      {locDelivery.location.district && (
                        <p><span className="text-stone-400">Wilaya:</span> <strong>{locDelivery.location.district}</strong></p>
                      )}
                      {locDelivery.location.area && (
                        <p><span className="text-stone-400">Eneo / Mtaa:</span> <strong>{locDelivery.location.area}</strong></p>
                      )}
                    </div>
                  )}

                  {locDelivery.location.locationType === 'SHOP_LOCATION' && (
                    <p className="text-[10.5px] text-stone-500 bg-stone-100/90 p-2 rounded-lg leading-relaxed">
                      Taarifa ya eneo hili inatoka kwenye wasifu wa duka kuu la muuzaji, si eneo la pekee la shamba/mzigo huu.
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
                  <span>Ilisasishwa: <strong className="text-stone-700">{locDelivery.location.lastUpdatedText || 'Haijasasishwa'}</strong></span>
                  <span title="Mfumo hauhalali umbali bila viwianishi rasmi">Bila makadirio bandia</span>
                </div>
              </div>

              {/* Card 2: Delivery & Pickup Logistics Card */}
              <div className="p-3.5 bg-stone-50/90 rounded-2xl border border-stone-200/80 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 flex items-center gap-1.5 font-medium text-[11px]">
                      <Truck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>Usafirishaji & Kuchukua</span>
                    </span>

                    <span
                      className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded border ${
                        locDelivery.delivery.status === 'DELIVERY_AND_PICKUP' || locDelivery.delivery.status === 'DELIVERY_AVAILABLE'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : locDelivery.delivery.status === 'PICKUP_ONLY'
                          ? 'bg-sky-50 text-sky-800 border-sky-300'
                          : 'bg-stone-100 text-stone-600 border-stone-300'
                      }`}
                    >
                      {locDelivery.delivery.status === 'DELIVERY_AND_PICKUP'
                        ? 'Delivery & Kuchukua'
                        : locDelivery.delivery.status === 'DELIVERY_AVAILABLE'
                        ? 'Delivery Ipo'
                        : locDelivery.delivery.status === 'PICKUP_ONLY'
                        ? 'Kuchukua Pekee'
                        : locDelivery.delivery.status === 'DELIVERY_NOT_AVAILABLE'
                        ? 'Hakuna Delivery'
                        : 'Haijawekwa'}
                    </span>
                  </div>

                  {/* Coverage Areas */}
                  <div className="pt-1 text-[11px] space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-stone-500">Maeneo ya Usafirishaji:</span>
                      <span className="font-bold text-stone-900 text-right">
                        {locDelivery.delivery.deliveryAreas && locDelivery.delivery.deliveryAreas.length > 0
                          ? locDelivery.delivery.deliveryAreas.join(', ')
                          : locDelivery.delivery.deliveryAreaLevel
                          ? `Kiwango cha ${locDelivery.delivery.deliveryAreaLevel}`
                          : 'Hakuna maeneo maalum yaliyotajwa'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-stone-500">Gharama ya Usafirishaji:</span>
                      <span className="font-bold text-stone-900">
                        {locDelivery.delivery.displayFee}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-stone-500">Makadirio ya Muda:</span>
                      <span className="font-bold text-stone-900">
                        {locDelivery.delivery.displayTime}
                      </span>
                    </div>

                    {(currentProduct.pickupAddress || (locDelivery.delivery.pickupAvailable && locDelivery.delivery.displayPickup)) && (
                      <div className="flex items-start justify-between gap-2 pt-0.5">
                        <span className="text-stone-500">Eneo la Kuchukulia:</span>
                        <span className="font-bold text-stone-900 text-right">
                          {currentProduct.pickupAddress || locDelivery.delivery.displayPickup}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
                  <span>Ilisasishwa: <strong className="text-stone-700">{locDelivery.delivery.lastUpdatedText || 'Haijasasishwa'}</strong></span>
                  <span>Makubaliano na muuzaji</span>
                </div>
              </div>
            </div>

            {/* Information Discrepancy & Conflict Warning between description and structured data */}
            {locDelivery.conflicts.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Ukinzani wa Taarifa za Usafirishaji / Eneo (Listing Discrepancy Detected):</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-amber-900/90 pl-1 space-y-0.5">
                  {locDelivery.conflicts.map((conflict, idx) => (
                    <li key={idx}>{conflict}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-800 pt-0.5 italic">
                  {locDelivery.structuredWinsNotice} Wanunuzi wanashauriwa kuwasiliana na muuzaji moja kwa moja.
                </p>
              </div>
            )}

            {/* Authoritative Disclaimer */}
            <div className="text-[10.5px] text-stone-500 bg-stone-100/80 p-2 rounded-lg border border-stone-200/60 leading-relaxed flex items-start gap-1.5">
              <span className="font-bold text-stone-700 shrink-0">Ilani ya Usafirishaji:</span>
              <span>
                {locDelivery.delivery.trustDisclaimer} Mfumo haujatabiri njia ya usafiri wala kuhakikisha uwasilishaji kwa niaba ya muuzaji.
              </span>
            </div>
          </div>

          {/* Product Description */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Maelezo ya Muuzaji (Product Listing Details)
            </h4>
            <div className="p-4 bg-stone-50/90 rounded-2xl border border-stone-200 text-xs sm:text-sm text-stone-800 leading-relaxed whitespace-pre-line">
              {sanitizedDescInfo?.sanitizedDescription || product.description}
            </div>

            {/* Unverified Regulatory or Government Claim Banner if present */}
            {sanitizedDescInfo?.hasUnverifiedAuthorityClaims && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300/80 text-amber-950 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-bold text-amber-900">Ilani ya Madai ya Muuzaji:</p>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Maelezo ya bidhaa yamejumuisha maneno: <span className="font-semibold">{sanitizedDescInfo.authorityClaimsDetected.join(', ')}</span>. Haya ni madai binafsi ya muuzaji na hayajathibitishwa na ukaguzi wa mamlaka ya serikali au maabara ya mfumo wetu.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Seller & Digital Shop Card */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Taarifa za Muuzaji & Duka la Kidijitali
            </h4>
            <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-200/70 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-sm">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-stone-900">
                      {ownership?.authoritativeShopName || product.sellerBusinessName || product.sellerName}
                    </h5>
                    <p className="text-xs text-stone-500">
                      {ownership?.authoritativeSellerName || product.sellerName} • {product.sellerLocation || product.location}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  {ownership?.state === 'INCONSISTENT' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" /> Mwenendo Usioendana
                    </span>
                  ) : ownership?.state === 'UNAVAILABLE' ? (
                    <span className="text-[10px] font-medium text-stone-600 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded-md">
                      Mmiliki Hayupo
                    </span>
                  ) : ownership?.isSellerVerified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Muuzaji Aliyethibitishwa
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-stone-600 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded-md">
                      Haijahakikiwa
                    </span>
                  )}
                </div>
              </div>

              {/* Explicit Seller Verification vs Product Authenticity Disclaimer (Verified Seller != Verified Product) */}
              {ownership?.isSellerVerified && (
                <div className="p-2.5 bg-white/90 rounded-xl border border-emerald-200 text-[11px] text-emerald-950 flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    <strong>Uthibitisho wa Muuzaji:</strong> Utambulisho wa muuzaji huyu umethibitishwa. Uthibitisho huu haumaanishi kuwa bidhaa yenyewe imethibitishwa au kupimwa kimaabara (Verified Seller ≠ Verified Product).
                  </p>
                </div>
              )}

              {/* Inconsistent Ownership Warning if detected */}
              {ownership?.state === 'INCONSISTENT' && (
                <div className="p-2.5 bg-amber-100/80 rounded-xl border border-amber-300 text-[11px] text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    <strong>Ilani ya Umiliki:</strong> Mfumo umegundua kutokulingana kwa taarifa kati ya duka na muuzaji wa bidhaa hii. Tafadhali thibitisha ana kwa ana kabla ya kufanya muamala wowote.
                  </p>
                </div>
              )}

              {/* View Digital Shop Action */}
              {(onOpenShopCatalogue || onOpenShop) && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenShopCatalogue) {
                      onOpenShopCatalogue(product.sellerId, product.catalogueId, product.productId);
                    } else if (onOpenShop) {
                      onOpenShop(product.sellerId);
                    }
                  }}
                  className="w-full py-2.5 px-3.5 bg-white hover:bg-amber-100/70 border border-amber-300 text-amber-950 font-bold text-xs rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-amber-800" />
                    <span>
                      Fungua Duka la {ownership?.authoritativeShopName || product.sellerBusinessName || product.sellerName}
                      {product.catalogueName ? ` (Sehemu: ${product.catalogueName})` : ' (Catalogues Zote)'}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-700" />
                </button>
              )}
            </div>
          </div>

          {/* V1.6G: Unified Marketplace Trust Panel */}
          {trustSignals && (
            <MarketplaceTrustPanel signals={trustSignals} className="my-2" />
          )}

          {/* V1.6F: Marketplace Reviews, Reputation & Reporting */}
          <ProductReviewsSection
            targetType="PRODUCT"
            targetId={currentProduct.productId}
            sellerId={currentProduct.sellerId}
            shopId={currentProduct.shopId}
            productId={currentProduct.productId}
            targetTitle={currentProduct.title}
            isOwner={isOwner}
          />

          {/* Safety Notice */}
          <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 text-stone-600 text-[11px] flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p>
              <strong>Tahadhari ya Usalama:</strong> UFUGAJI UPDATE inashauri kukagua mifugo au bidhaa ana kwa ana kabla ya kukamilisha malipo. Epuka kutuma pesa kabla ya kupokea huduma.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          {isOwner ? (
            <div className="flex w-full gap-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(product);
                  }}
                  className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                >
                  <span>Hariri Tangazo Hili</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                Funga
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2.5">
              {/* PRIMARY INQUIRY ACTION: Authenticated Marketplace Inbox (Requirement 1 & 14) */}
              <button
                type="button"
                onClick={() => onContactSeller && onContactSeller(product)}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer min-h-[46px]"
              >
                <MessageSquare className="w-4 h-4 text-emerald-200" />
                <span>💬 Wasiliana na Muuzaji</span>
              </button>

              {/* SECONDARY CONTACT OPTIONS */}
              <div className="flex w-full flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleCall}
                  disabled={!product.sellerPhone}
                  className="flex-1 py-2 px-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-stone-600" />
                  <span>Piga Simu ({product.sellerPhone || 'Imehifadhiwa'})</span>
                </button>

                <button
                  type="button"
                  onClick={handleWhatsApp}
                  disabled={!product.sellerPhone}
                  className="flex-1 py-2 px-3 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-teal-700" />
                  <span>WhatsApp (Sekondari)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-60 bg-stone-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 bg-stone-800/80 hover:bg-stone-700 text-white rounded-full transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>

          <img
            src={activeImage?.url}
            alt={product.title}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};

