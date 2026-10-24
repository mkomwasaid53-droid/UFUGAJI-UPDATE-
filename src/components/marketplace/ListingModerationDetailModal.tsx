/**
 * V1.7D — Listing Moderation Detail Modal
 * Phase 6: Marketplace Governance & Hotfix: Complete Admin Listing Preview
 *
 * Displays all structured information, actual listing media, and signals:
 * 1. Maudhui Halisi ya Tangazo (Actual Images, Video Player, Full Description, Price, Stock, Location, Delivery)
 * 2. Authoritative Marketplace / Governance Data
 * 3. Deterministic Listing Validation Results (V1.7B)
 * 4. Trust Signals & Seller Verification (V1.6A–H & V1.0)
 * 5. Screening Freshness & Content Fingerprint Integrity
 * 6. User-Generated Reports & Reviews (Claims/Allegations, NOT proof)
 * 7. AI Classification Suggestion (Guidance only)
 * 8. Moderation Audit History & Private Internal Notes
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ModerationQueueItem,
  MODERATION_REASON_LABELS
} from '../../types/marketplaceModeration';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  MapPin,
  Truck,
  DollarSign,
  Package,
  Layers,
  FileText,
  User,
  Store,
  ExternalLink,
  Info,
  Flag,
  MessageSquare,
  History,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Video as VideoIcon,
  Tag,
  Calendar,
  AlertCircle,
  Eye,
  Camera,
  RefreshCw
} from 'lucide-react';
import { ProductVideoPlayer } from './ProductVideoPlayer';
import { formatTshPrice } from '../../services/marketplaceService';
import { isScreeningResultUpToDate } from '../../services/marketplaceAiScreeningService';
import { getSellerTrustStatus } from '../../services/sellerTrustService';

interface ListingModerationDetailModalProps {
  item: ModerationQueueItem;
  onClose: () => void;
  onActionClick: (actionType: 'APPROVE' | 'REJECT' | 'CORRECTION' | 'HIDE' | 'SUSPEND' | 'RESTORE' | 'ESCALATE') => void;
}

export const ListingModerationDetailModal: React.FC<ListingModerationDetailModalProps> = ({
  item,
  onClose,
  onActionClick
}) => {
  const {
    product,
    moderationRecord,
    validationResult,
    priority,
    priorityReasons,
    reportCount,
    reports,
    publishedReviews,
    aiClassification,
    ownershipValidation,
    priceStockTrust,
    locationDeliveryTrust
  } = item;

  // Media & Interaction States
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isRescreening, setIsRescreening] = useState(false);
  const [rescreenNotice, setRescreenNotice] = useState<string | null>(null);

  const handleRescreenListing = async () => {
    if (!product?.productId || isRescreening) return;
    setIsRescreening(true);
    setRescreenNotice(null);
    try {
      const resp = await fetch('/api/marketplace/rescreen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-is-admin': 'true'
        },
        body: JSON.stringify({ productId: product.productId })
      });
      const data = await resp.json();
      if (resp.ok) {
        setRescreenNotice('Ukaguzi wa AI umeanza upya kwenye foleni salama ya nyuma.');
      } else {
        setRescreenNotice(`Hitilafu: ${data.error || 'Haikuweza kuanza ukaguzi'}`);
      }
    } catch (err: any) {
      setRescreenNotice(`Hitilafu: ${err?.message || 'Hitilafu ya mtandao'}`);
    } finally {
      setIsRescreening(false);
    }
  };

  // Publication Diagnosis & Reconciliation V2.2 States
  const [publicationDiagnosis, setPublicationDiagnosis] = useState<any>(null);
  const [isLoadingDiagnosis, setIsLoadingDiagnosis] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const fetchPublicationDiagnosis = async () => {
    if (!product?.productId) return;
    setIsLoadingDiagnosis(true);
    try {
      const resp = await fetch(`/api/marketplace/admin/products/${product.productId}/publication-diagnosis`, {
        headers: { 'x-is-admin': 'true' }
      });
      if (resp.ok) {
        const data = await resp.json();
        setPublicationDiagnosis(data);
      }
    } catch (err) {
      console.error('Failed to load publication diagnosis:', err);
    } finally {
      setIsLoadingDiagnosis(false);
    }
  };

  useEffect(() => {
    fetchPublicationDiagnosis();
  }, [product?.productId]);

  const handleReconcilePublication = async () => {
    if (!product?.productId || isReconciling) return;
    setIsReconciling(true);
    setReconcileFeedback(null);
    try {
      const resp = await fetch(`/api/marketplace/admin/products/${product.productId}/reconcile-publication`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-is-admin': 'true'
        },
        body: JSON.stringify({
          adminDisplayName: 'Msimamizi wa Mfumo'
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        setReconcileFeedback({
          type: data.reconciliation?.isNowPublic ? 'success' : 'info',
          message: data.message || `Upatanisho umekamilika: ${data.reconciliation?.reason || ''}`
        });
        // Refresh diagnosis to display updated state immediately
        await fetchPublicationDiagnosis();
      } else {
        setReconcileFeedback({
          type: 'error',
          message: data.error || 'Hitilafu ya upatanisho wa tangazo'
        });
      }
    } catch (err: any) {
      setReconcileFeedback({
        type: 'error',
        message: err?.message || 'Hitilafu ya mtandao wakati wa upatanisho'
      });
    } finally {
      setIsReconciling(false);
    }
  };

  // Normalize all available images from product model
  const allImages = useMemo(() => {
    const list: Array<{ url: string; id?: string; isPrimary?: boolean; caption?: string }> = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
      product.images.forEach((img: any, idx: number) => {
        if (img && typeof img.url === 'string' && img.url.trim().length > 0) {
          list.push({
            url: img.url.trim(),
            id: img.id || `img_${idx}`,
            isPrimary: Boolean(img.isPrimary || idx === 0),
            caption: img.caption
          });
        }
      });
    } else if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim().length > 0) {
      list.push({
        url: product.imageUrl.trim(),
        id: 'img_primary',
        isPrimary: true
      });
    }
    return list;
  }, [product.images, product.imageUrl]);

  const activeImage = allImages[activeImageIndex] || allImages[0];

  // Video evaluation
  const hasVideo = Boolean(product.video && product.video.url && product.video.url.trim().length > 0);

  // AI Screening & Freshness evaluation
  const activeScreening = item.aiScreening || product.aiScreening;
  const isScreeningFresh = useMemo(() => {
    if (!activeScreening) return null;
    return isScreeningResultUpToDate(product, activeScreening);
  }, [product, activeScreening]);

  // Seller Trust Status
  const sellerTrust = useMemo(() => {
    return getSellerTrustStatus(product.sellerId);
  }, [product.sellerId]);

  const isBlockedOrRejected =
    moderationRecord.status === 'REJECTED' ||
    activeScreening?.status === 'BLOCK' ||
    product.moderationStatus === 'REJECTED';
  const isApproved =
    !isBlockedOrRejected &&
    (moderationRecord.status === 'APPROVED' || product.moderationStatus === 'APPROVED');
  const isSuspendedOrHidden =
    moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN';

  const isStale = isScreeningFresh === false;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800/80 flex items-center justify-center border border-emerald-600/40">
              <Shield className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-white truncate max-w-md">
                  Ukaguzi wa Tangazo: {product.title}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-stone-800 text-stone-300 border border-stone-700">
                  {product.productId}
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                Uchunguzi wa vigezo vya kisheria, umiliki, maudhui halisi, picha/video, na ripoti za watumiaji
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            title="Funga ukaguzi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-stone-800">
          {/* Priority & Status Banner */}
          <div className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 bg-stone-50 border-stone-200">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-stone-600">Hali ya Ukaguzi:</span>
              <span
                className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  isBlockedOrRejected
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : isApproved
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : moderationRecord.status === 'SUSPENDED' || moderationRecord.status === 'HIDDEN'
                    ? 'bg-stone-200 text-stone-800 border border-stone-400'
                    : moderationRecord.status === 'UNDER_REVIEW'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}
              >
                {isBlockedOrRejected ? 'REJECTED / BLOCKED' : isApproved ? 'APPROVED' : moderationRecord.status}
              </span>

              <span className="font-semibold text-stone-600 ml-2">Kipaumbele:</span>
              <span
                className={`px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  priority === 'CRITICAL'
                    ? 'bg-rose-600 text-white'
                    : priority === 'HIGH'
                    ? 'bg-amber-600 text-white'
                    : priority === 'NORMAL'
                    ? 'bg-blue-600 text-white'
                    : 'bg-stone-400 text-white'
                }`}
              >
                {priority}
              </span>

              <span className="font-semibold text-stone-600 ml-2">Uaminifu wa Muuzaji:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  sellerTrust === 'TRUSTED_SELLER'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : sellerTrust === 'RESTRICTED_SELLER'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-stone-100 text-stone-700 border border-stone-300'
                }`}
              >
                {sellerTrust}
              </span>

              {isScreeningFresh !== null && (
                <>
                  <span className="font-semibold text-stone-600 ml-2">Freshness ya AI:</span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-medium text-[11px] ${
                      isScreeningFresh
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                    }`}
                  >
                    {isScreeningFresh ? '✓ Fingerprint Fresh' : '⚠ Stale Fingerprint (Maudhui Yamebadilika)'}
                  </span>
                </>
              )}
            </div>

            {priorityReasons.length > 0 && (
              <div className="w-full text-xs text-stone-600 pt-1 border-t border-stone-200/80">
                <span className="font-semibold text-stone-700">Sababu za kipaumbele:</span>{' '}
                {priorityReasons.join(' • ')}
              </div>
            )}
          </div>

          {/* Stale Fingerprint Warning Banner */}
          {isStale && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-amber-900">
                  Tahadhari: Maudhui Halisi ya Tangazo Yamebadilika (Fingerprint Mismatch)
                </span>
                <p className="text-amber-800 leading-relaxed">
                  Muuzaji alifanya mabadiliko ya maelezo, kundi, bei au picha baada ya ukaguzi wa awali wa AI.
                  Kabla ya kuidhinisha, kagua maudhui ya sasa hapa chini kwa umakini ili kuzuia kutoa idhini kwa maudhui yaliyobadilika bila uhakiki.
                </p>
              </div>
            </div>
          )}

          {/* =================================================================== */}
          {/* SECTION: MAUDHUI HALISI YA TANGAZO (REQUIRED ADMIN PREVIEW)         */}
          {/* =================================================================== */}
          <div className="p-4 sm:p-5 rounded-2xl border-2 border-stone-300 bg-white space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-300">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-stone-900">
                    Maudhui Halisi ya Tangazo
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Picha halisi, video, maelezo kamili ya muuzaji, bei, akiba na maeneo ya usafirishaji
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 font-medium border border-stone-200">
                  {allImages.length} {allImages.length === 1 ? 'Picha' : 'Picha'}
                </span>
                {hasVideo && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-medium border border-amber-200 flex items-center gap-1">
                    <VideoIcon className="w-3.5 h-3.5 text-amber-600" /> Ina Video
                  </span>
                )}
              </div>
            </div>

            {/* Visual Media Row: Image Gallery and Optional Video */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Image Gallery Column (lg: 7 cols or full) */}
              <div className={`${hasVideo ? 'lg:col-span-7' : 'lg:col-span-8'} space-y-2.5`}>
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-stone-500" />
                    Picha za Tangazo ({allImages.length})
                  </span>
                  {allImages.length > 0 && (
                    <span className="text-[11px] font-mono text-stone-500">
                      Picha {activeImageIndex + 1} ya {allImages.length}
                    </span>
                  )}
                </div>

                {allImages.length > 0 ? (
                  <div className="space-y-2">
                    {/* Main Image Stage */}
                    <div className="relative w-full h-64 sm:h-80 bg-stone-950 rounded-xl overflow-hidden border border-stone-200 flex items-center justify-center group">
                      {activeImage?.url && !imageErrorMap[activeImage.id || activeImage.url] ? (
                        <img
                          src={activeImage.url}
                          alt={product.title || 'Picha ya tangazo'}
                          className="w-full h-full object-contain cursor-pointer transition-transform duration-200"
                          onClick={() => setIsLightboxOpen(true)}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setImageErrorMap((prev) => ({
                              ...prev,
                              [activeImage.id || activeImage.url]: true
                            }))
                          }
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-stone-400 space-y-2 p-4 text-center">
                          <AlertCircle className="w-10 h-10 text-amber-500" />
                          <span className="text-xs font-semibold text-stone-200">
                            Picha Haipatikani au Haiwezi Kufunguka
                          </span>
                          <span className="text-[10px] text-stone-400 max-w-xs">
                            Faili limeondolewa au URL iliyorekodiwa haipatikani kwenye hifadhi
                          </span>
                        </div>
                      )}

                      {/* Lightbox / Maximize Button */}
                      {activeImage?.url && !imageErrorMap[activeImage.id || activeImage.url] && (
                        <button
                          type="button"
                          onClick={() => setIsLightboxOpen(true)}
                          className="absolute bottom-3 right-3 px-2.5 py-1.5 bg-stone-900/85 hover:bg-stone-900 text-white rounded-lg text-xs flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer border border-stone-700"
                          title="Fungua picha kubwa (Full Resolution)"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-medium hidden sm:inline">Panua Picha</span>
                        </button>
                      )}

                      {/* Previous / Next Navigation Arrows */}
                      {allImages.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
                            }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-stone-900/70 hover:bg-stone-900 text-white backdrop-blur-xs transition-colors cursor-pointer"
                            title="Picha iliyotangulia"
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
                            title="Picha inayofuata"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Thumbnail Strip */}
                    {allImages.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
                        {allImages.map((img, idx) => {
                          const isFailed = imageErrorMap[img.id || img.url];
                          return (
                            <button
                              key={img.id || idx}
                              type="button"
                              onClick={() => setActiveImageIndex(idx)}
                              className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all cursor-pointer bg-stone-100 ${
                                activeImageIndex === idx
                                  ? 'border-emerald-600 ring-2 ring-emerald-600/30 scale-105'
                                  : 'border-stone-200 opacity-75 hover:opacity-100'
                              }`}
                              title={`Tazama picha ${idx + 1}`}
                            >
                              {!isFailed ? (
                                <img
                                  src={img.url}
                                  alt={`Thumbnail ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setImageErrorMap((prev) => ({
                                      ...prev,
                                      [img.id || img.url]: true
                                    }))
                                  }
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-stone-200 text-stone-500">
                                  <AlertCircle className="w-4 h-4 text-amber-600" />
                                </div>
                              )}
                              <span className="absolute bottom-0 right-0 bg-stone-900/80 text-white font-mono text-[9px] px-1 rounded-tl">
                                {idx + 1}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-44 bg-stone-100 rounded-xl border border-stone-200 flex flex-col items-center justify-center text-stone-500 space-y-1.5 p-4 text-center">
                    <Package className="w-8 h-8 text-stone-400" />
                    <span className="text-xs font-semibold text-stone-700">Tangazo hili halina picha zilizopakiwa</span>
                    <span className="text-[11px] text-stone-400">Muuzaji hakuambatanisha picha yoyote wakati wa usajili.</span>
                  </div>
                )}
              </div>

              {/* Video Player Column (if present) */}
              {hasVideo && product.video && (
                <div className="lg:col-span-5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span className="font-semibold flex items-center gap-1.5 text-stone-900">
                      <VideoIcon className="w-3.5 h-3.5 text-amber-600" />
                      Video ya Tangazo
                    </span>
                    {product.video.durationSeconds && product.video.durationSeconds > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 border border-stone-200">
                        {Math.floor(product.video.durationSeconds / 60)}:
                        {(product.video.durationSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>

                  <div className="bg-stone-900 rounded-xl p-3 border border-stone-800 space-y-2 text-white">
                    <ProductVideoPlayer
                      video={product.video}
                      productTitle={product.title}
                    />

                    {product.video.title && (
                      <p className="text-xs font-semibold text-amber-300 truncate">
                        {product.video.title}
                      </p>
                    )}

                    {product.video.description && (
                      <p className="text-[11px] text-stone-300 bg-stone-800/60 p-2 rounded-lg border border-stone-700/60 leading-relaxed">
                        {product.video.description}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Complete Listing Attributes Grid */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-stone-200 pb-3">
                {/* Title & Category */}
                <div className="md:col-span-2 space-y-1">
                  <span className="text-stone-500 font-medium">Jina Kamili la Tangazo:</span>
                  <p className="text-sm font-bold text-stone-900 leading-snug">
                    {product.title}
                  </p>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[11px] border border-amber-300">
                      {product.category}
                    </span>
                    {product.subcategory && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-medium text-[11px] border border-blue-300">
                        {product.subcategory}
                      </span>
                    )}
                    {product.catalogueName && (
                      <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-800 font-mono text-[10px]">
                        Katalogi: {product.catalogueName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price & Stock */}
                <div className="space-y-1">
                  <span className="text-stone-500 font-medium">Bei & Akiba (Stock):</span>
                  <p className="text-base font-bold text-emerald-800">
                    {formatTshPrice(product.price)}
                    {product.unit ? <span className="text-xs font-normal text-stone-600"> / {product.unit}</span> : ''}
                  </p>
                  <p className="text-xs text-stone-700">
                    <strong className="text-stone-900">Upatikanaji:</strong>{' '}
                    {product.quantityAvailable !== undefined && product.quantityAvailable !== null
                      ? `${product.quantityAvailable} ${product.unit || 'vitengo'}`
                      : 'Haijabainishwa'}
                  </p>
                </div>
              </div>

              {/* Full Description (Never silently truncated) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-stone-600 font-bold flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-stone-500" />
                    Maelezo Kamili ya Tangazo (Seller Description):
                  </span>
                  {product.description && product.description.length > 250 && (
                    <button
                      type="button"
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className="text-emerald-700 hover:text-emerald-900 font-semibold text-[11px] cursor-pointer"
                    >
                      {isDescriptionExpanded ? 'Funga maelezo' : 'Soma yote'}
                    </button>
                  )}
                </div>

                <div
                  className={`bg-white p-3 rounded-xl border border-stone-200 text-xs text-stone-800 leading-relaxed whitespace-pre-wrap break-words ${
                    !isDescriptionExpanded && product.description && product.description.length > 250
                      ? 'max-h-36 overflow-y-auto'
                      : ''
                  }`}
                >
                  {product.description ? product.description : <span className="italic text-stone-400">Hakuna maelezo yaliyowekwa na muuzaji.</span>}
                </div>
              </div>

              {/* Location & Delivery Specifics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-stone-200">
                <div>
                  <span className="text-stone-500 block text-[11px]">Eneo la Bidhaa:</span>
                  <p className="font-semibold text-stone-900">
                    {product.location || [product.area, product.district, product.region].filter(Boolean).join(', ') || 'Haijatajwa'}
                  </p>
                </div>

                <div>
                  <span className="text-stone-500 block text-[11px]">Usafirishaji (Delivery):</span>
                  <p className="font-semibold text-stone-900">
                    {product.deliveryAvailable ? '✓ Unapatikana' : '✗ Haukubaliwi'}
                  </p>
                  {product.deliveryAvailable && (
                    <span className="text-[10px] text-stone-600 block">
                      Gharama: {product.deliveryFee !== undefined && product.deliveryFee !== null ? `${formatTshPrice(product.deliveryFee)}` : (product.deliveryFeeType || 'Haikutajwa')}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-stone-500 block text-[11px]">Uchukuaji (Pickup):</span>
                  <p className="font-semibold text-stone-900">
                    {product.pickupAvailable ? '✓ Unaruhusiwa' : '✗ Hauruhusiwi'}
                  </p>
                  {product.pickupAddress && (
                    <span className="text-[10px] text-stone-600 block truncate" title={product.pickupAddress}>
                      Anwani: {product.pickupAddress}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-stone-500 block text-[11px]">Muda wa Kusajili / Kusasisha:</span>
                  <p className="font-mono text-stone-700 text-[11px]">
                    Iliundwa: {new Date(product.createdAt).toLocaleDateString('sw-TZ')}
                  </p>
                  {product.updatedAt && product.updatedAt !== product.createdAt && (
                    <p className="font-mono text-stone-500 text-[10px]">
                      Imesasishwa: {new Date(product.updatedAt).toLocaleDateString('sw-TZ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Source Authority Hierarchy Notice */}
          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 text-[11px] text-blue-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Misingi ya Mamlaka ya Taarifa (Source Authority):</span>
              <p className="text-blue-800 mt-0.5 leading-relaxed">
                1. Data Rasmi ya Soko &nbsp;→&nbsp; 2. Matokeo ya Ukaguzi wa Vigezo &nbsp;→&nbsp; 3. Ishara za Uaminifu &nbsp;→&nbsp; 4. Ripoti/Maoni ya Watumiaji &nbsp;→&nbsp; 5. Maelezo ya Muuzaji &nbsp;→&nbsp; 6. Mapendekezo ya AI.
                <br />
                <span className="text-[10px] text-blue-700 font-medium">
                  Kumbuka: Ripoti si ushahidi kamili wa kosa, na maoni ya watumiaji hayathibitishi utambulisho wa muuzaji.
                </span>
              </p>
            </div>
          </div>

          {/* Two-Column Structured Inspection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. SELLER IDENTITY & OWNERSHIP (V1.6A, V1.6C & V1.0) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-700" /> Umiliki & Utambulisho wa Muuzaji
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-medium border border-blue-200">
                  V1.6A / V1.0 Trust
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-stone-500">Muuzaji (Seller):</span>
                  <p className="font-semibold text-stone-900">
                    {product.sellerName} {product.sellerBusinessName ? `(${product.sellerBusinessName})` : ''}
                  </p>
                  <p className="text-[11px] font-mono text-stone-400">UID: {product.sellerId}</p>
                </div>
                <div>
                  <span className="text-stone-500">Nambari ya Simu:</span>
                  <p className="font-mono text-stone-800">{product.sellerPhone || 'Haijawekwa'}</p>
                </div>
                <div>
                  <span className="text-stone-500">Hali ya Uhakiki wa Muuzaji (Verification Status):</span>
                  <div className="mt-0.5">
                    {product.sellerVerificationStatus === 'verified' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Muuzaji Aliyethibitishwa (Verified)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium text-[11px]">
                        <Shield className="w-3.5 h-3.5 text-stone-500" /> Hajathibitishwa (Unverified)
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1">
                    *Kumbuka: Ukaguzi wa tangazo haubadili cheo hiki cha muuzaji.
                  </p>
                </div>
                <div className="pt-1 border-t border-stone-100">
                  <span className="text-stone-500">Uthibitisho wa Umiliki (Ownership Integrity):</span>
                  <p className={`text-xs font-semibold ${ownershipValidation.isValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {ownershipValidation.isValid ? '✓ Umiliki Umelingana (Valid Ownership)' : `✗ Utata wa Umiliki: ${ownershipValidation.errorReason || 'Inconsistent'}`}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. PRICE & STOCK TRUST (V1.6D) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-700" /> Bei & Upatikanaji wa Akiba (Stock)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
                  V1.6D Trust
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-stone-500">Bei Rasmi:</span>
                  <p className="text-base font-bold text-emerald-800">
                    {priceStockTrust.price.displayPrice}
                  </p>
                  <span className="text-[10px] text-stone-400">
                    Hali: {priceStockTrust.price.status}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500">Idadi ya Bidhaa (Stock):</span>
                  <p className="text-base font-bold text-stone-900">
                    {priceStockTrust.stock.displayStock}
                  </p>
                  <span className="text-[10px] text-stone-400">
                    Hali: {priceStockTrust.stock.status}
                  </span>
                </div>
              </div>
              {priceStockTrust.hasDescriptionPriceConflict && (
                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Kuna mgongano kati ya bei ya tangazo na tarakimu iliyo kwenye maelezo.</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. DETERMINISTIC LISTING VALIDATION RESULTS (V1.7B) */}
          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" /> Matokeo ya Ukaguzi wa Vigezo (V1.7B Validation Gate)
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  validationResult.isEligibleForActive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {validationResult.isEligibleForActive ? '✓ Ina Sifa ya Kuwa Active' : '✗ Haina Sifa ya Kuwa Active'}
              </span>
            </div>

            {validationResult.errors.length > 0 ? (
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 space-y-1.5">
                <p className="text-xs font-bold text-rose-900 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5 text-rose-700" /> Hitilafu Zinazozuia Tangazo:
                </p>
                <ul className="list-disc list-inside text-xs text-rose-800 space-y-0.5">
                  {validationResult.errors.map((err, i) => (
                    <li key={i}>
                      <strong className="font-mono text-[11px]">{err.checkType}:</strong> {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Tangazo hili limekidhi vigezo vyote 15 vya kisheria vya mfumo.
              </p>
            )}

            {validationResult.warnings.length > 0 && (
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-0.5">
                <span className="font-bold">Tahadhari Zisizozuia (Warnings):</span>
                {validationResult.warnings.map((w, i) => (
                  <p key={i}>• {w.message}</p>
                ))}
              </div>
            )}
          </div>

          {/* 4. AI MULTIMODAL CONTENT SCREENING & RESILIENCE AUDIT */}
          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-700" /> Ukaguzi wa Kiusalama wa AI (Multimodal Screening & Resilience Gate)
              </span>
              <div className="flex items-center gap-2">
                {product.screeningJobStatus === 'SCREENING_PENDING' || product.screeningJobStatus === 'SCREENING_PROCESSING' ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin text-sky-600" /> Inakaguliwa (SCREENING_PENDING)
                  </span>
                ) : product.screeningJobStatus === 'EXHAUSTED_DEADLINE' ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-700" /> Muda Umekwisha (EXHAUSTED_DEADLINE)
                  </span>
                ) : activeScreening ? (
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                      activeScreening.status === 'PASS'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : activeScreening.status === 'BLOCK'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : activeScreening.evaluationSource === 'INFRASTRUCTURE_FALLBACK' ||
                          activeScreening.failureReason === 'MODEL_UNAVAILABLE_503'
                        ? 'bg-purple-100 text-purple-900 border border-purple-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {activeScreening.status === 'BLOCK'
                      ? '⛔ Imezuiwa (BLOCK)'
                      : activeScreening.evaluationSource === 'INFRASTRUCTURE_FALLBACK' ||
                        activeScreening.failureReason === 'MODEL_UNAVAILABLE_503'
                      ? '⚠ Model 503 / Haipatikani (Inasubiri)'
                      : activeScreening.status === 'REVIEW_REQUIRED'
                      ? '🔍 Inahitaji Ukaguzi (REVIEW_REQUIRED)'
                      : '✓ Imefaulu (PASS)'}
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-stone-200 text-stone-700">
                    Haijakaguliwa bado
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleRescreenListing}
                  disabled={isRescreening}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-800 text-white hover:bg-stone-700 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Anzisha upya uchunguzi wa AI kwa maudhui ya sasa ya tangazo"
                >
                  <RefreshCw className={`w-3 h-3 ${isRescreening ? 'animate-spin' : ''}`} />
                  <span>{isRescreening ? 'Inatuma...' : 'Kagua Upya (Rescreen)'}</span>
                </button>
              </div>
            </div>

            {rescreenNotice && (
              <div className="p-2.5 bg-sky-50 rounded-lg border border-sky-200 text-sky-900 text-xs flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>{rescreenNotice}</span>
              </div>
            )}

            {activeScreening ? (
              <div className="space-y-3 text-xs">
                {/* 3 Distinct Pillars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1">
                    <span className="text-[11px] text-stone-500 font-medium">Chanzo cha Uamuzi (Source):</span>
                    <p className="font-bold text-stone-800">
                      {activeScreening.evaluationSource === 'MODEL'
                        ? '✓ Model Screening (AI Multimodal)'
                        : activeScreening.evaluationSource === 'INFRASTRUCTURE_FALLBACK'
                        ? '⚠ Miundombinu / 503 Fallback'
                        : activeScreening.evaluationSource === 'DETERMINISTIC_RULES'
                        ? '🛡 Sheria za Kiusalama (Rules)'
                        : activeScreening.evaluationSource === 'SAFETY_FILTER'
                        ? '⛔ Kichujio cha Usalama (Safety Filter)'
                        : 'Mfumo wa Ukaguzi'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1">
                    <span className="text-[11px] text-stone-500 font-medium">Kiwango cha Uhakika (Confidence):</span>
                    <p className="font-bold text-stone-800">
                      {activeScreening.confidence || 'MEDIUM'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1">
                    <span className="text-[11px] text-stone-500 font-medium">Majaribio ya Bounded Retry:</span>
                    <p className="font-bold text-stone-800">
                      {activeScreening.retryAttempts ? `${activeScreening.retryAttempts} jaribio/majaribio` : '1 jaribio'}
                    </p>
                  </div>
                </div>

                {/* Specific Infrastructure Diagnostic if Model was unavailable */}
                {(activeScreening.evaluationSource === 'INFRASTRUCTURE_FALLBACK' || activeScreening.failureReason) && (
                  <div className="p-3 bg-purple-50/80 rounded-lg border border-purple-200 text-purple-950 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-[11px]">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-purple-700" />
                        Hitilafu ya Miundombinu: {activeScreening.failureReason || 'MODEL_UNAVAILABLE'}
                      </span>
                      {activeScreening.isRetryable && (
                        <span className="bg-purple-200/80 px-2 py-0.5 rounded text-[10px] uppercase font-mono">
                          Inaweza Kurudiwa (isRetryable: true)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-purple-900 leading-relaxed">
                      Model ya Gemini ilikuwa haipatikani kwa muda (kwa mfano HTTP 503 kutokana na wingi wa maombi au timeout).
                      Bounded retry ilijaribu tena lakini muda ulimalizika. Tangazo linashikiliwa kwa usalama chini ya sera ya Fail-Closed.
                    </p>
                  </div>
                )}

                {/* Categories */}
                {activeScreening.categories && activeScreening.categories.length > 0 && (
                  <div>
                    <span className="text-stone-500 font-medium">Kategoria za Kiusalama Zilizotambuliwa:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {activeScreening.categories.map((cat, i) => (
                        <span
                          key={i}
                          className={`px-2 py-0.5 rounded-md font-mono text-[10.5px] font-semibold border ${
                            cat === 'SEXUAL_OR_EXPLICIT_CONTENT' || cat === 'WEAPONS_OR_DANGEROUS_GOODS'
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : cat === 'POTENTIALLY_LEGITIMATE_VETERINARY_CONTENT'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-stone-100 text-stone-800 border-stone-300'
                          }`}
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Explanation */}
                <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1">
                  <span className="text-stone-500 font-medium">Ufafanuzi wa Kiusalama:</span>
                  <p className="font-semibold text-stone-900 text-[11px]">
                    {activeScreening.explanationSwahili || activeScreening.explanation}
                  </p>
                  {activeScreening.explanation &&
                    activeScreening.explanation !== activeScreening.explanationSwahili && (
                      <p className="text-stone-600 text-[10.5px] italic">
                        "{activeScreening.explanation}"
                      </p>
                    )}
                </div>

                {/* Audit Details */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] text-stone-400 font-mono pt-1 border-t border-stone-200/80">
                  <span>Model: {activeScreening.model}</span>
                  <span>Sera: {activeScreening.policyVersion}</span>
                  <span>Muda: {new Date(activeScreening.timestamp).toLocaleTimeString('sw-TZ')}</span>
                  {activeScreening.latencyMs !== undefined && (
                    <span>Muda wa Ukaguzi: {activeScreening.latencyMs}ms</span>
                  )}
                  {activeScreening.contentFingerprint && (
                    <span title={activeScreening.contentFingerprint}>
                      Fingerprint: {activeScreening.contentFingerprint.substring(0, 16)}...
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-500 py-2">Hakuna rekodi ya ukaguzi wa kiusalama wa AI kwa bidhaa hii.</p>
            )}
          </div>

          {/* 5. AI ASSISTED CLASSIFICATION (V1.7C) — CLEARLY LABELED AS ADVISORY */}
          <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" /> Pendekezo la Uainishaji wa AI (V1.7C Guidance Only)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                Mwongozo wa Ziada — Si Uamuzi wa Mwisho
              </span>
            </div>

            {aiClassification ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-stone-500">Hali ya Pendekezo la AI:</span>
                    <p className="font-bold text-stone-900 uppercase">{aiClassification.classificationStatus}</p>
                  </div>
                  <div>
                    <span className="text-stone-500">Kiwango cha Uhakika (AI Confidence):</span>
                    <p className="font-bold text-stone-900">{aiClassification.confidenceLevel}</p>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-white border border-amber-200/60 text-xs">
                  <span className="text-stone-500">Kundi lililopendekezwa:</span>
                  <p className="font-bold text-emerald-800">
                    {aiClassification.suggestedCategoryName || 'Hakuna linalolingana moja kwa moja'}
                  </p>
                  <p className="text-stone-600 mt-1 text-[11px] leading-relaxed">
                    <strong>Ufafanuzi wa AI:</strong> {aiClassification.reason}
                  </p>
                </div>

                {aiClassification.isMismatchWithSellerCategory && (
                  <div className="p-2 bg-amber-100/70 border border-amber-300 rounded text-[11px] text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Tahadhari: Kundi alilochagua muuzaji linatofautiana na pendekezo la kiotomatiki la mfumo. Msimamizi anapaswa kukagua kabla ya kuamua.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-stone-500">Hakuna uchambuzi wa AI uliorekodiwa kwa tangazo hili.</p>
            )}
          </div>

          {/* 6. REPORTS & REVIEWS (V1.6F) — CLEARLY LABELED AS ALLEGATIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reports */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <Flag className="w-4 h-4 text-rose-600" /> Ripoti za Watumiaji ({reportCount})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-medium">
                  Madai / Allegations
                </span>
              </div>

              {reports.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {reports.map((rep, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-800 text-[11px]">{rep.reason}</span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {new Date(rep.createdAt).toLocaleDateString('sw-TZ')}
                        </span>
                      </div>
                      <p className="text-stone-700 text-[11px] italic">"{rep.description}"</p>
                    </div>
                  ))}
                  <p className="text-[10px] text-stone-400 italic">
                    *Msimamizi anakumbushwa: Ripoti moja au zaidi si uthibitisho wa kosa; fanya maamuzi kulingana na ushahidi halisi.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-stone-500 py-3 text-center">Hakuna ripoti yoyote iliyotumwa dhidi ya tangazo hili.</p>
              )}
            </div>

            {/* Reviews */}
            <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-stone-700" /> Maoni ya Wanunuzi ({publishedReviews.length})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 font-medium">
                  Uzoefu Binafsi
                </span>
              </div>

              {publishedReviews.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {publishedReviews.map((rev, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800">{rev.authorDisplayName}</span>
                        <span className="text-amber-600 font-bold text-[11px]">★ {rev.rating}/5</span>
                      </div>
                      <p className="text-stone-700 text-[11px]">{rev.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500 py-3 text-center">Hakuna maoni yaliyochapishwa bado.</p>
              )}
            </div>
          </div>

          {/* 7. MODERATION HISTORY & PRIVATE INTERNAL NOTES */}
          {moderationRecord.lastAction && (
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <History className="w-4 h-4 text-stone-600" /> Rekodi ya Ukaguzi Uliopita
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-stone-500">Hatua ya Mwisho:</span>
                  <p className="font-semibold text-stone-800">{moderationRecord.lastAction}</p>
                </div>
                <div>
                  <span className="text-stone-500">Mkaguzi (Moderator):</span>
                  <p className="font-semibold text-stone-800">
                    {moderationRecord.reviewedByDisplayName || 'Msimamizi wa Mfumo'}
                  </p>
                </div>
              </div>

              {moderationRecord.publicExplanation && (
                <div className="text-xs">
                  <span className="text-stone-500 font-medium">Sababu Iliyoonekana kwa Mtumiaji:</span>
                  <p className="bg-white p-2 rounded border border-stone-200 text-stone-800 mt-0.5">
                    {moderationRecord.publicExplanation}
                  </p>
                </div>
              )}

              {moderationRecord.internalNote && (
                <div className="text-xs">
                  <span className="text-stone-500 font-medium">Kumbukumbu ya Ndani (Private Internal Note):</span>
                  <p className="bg-amber-50/60 p-2 rounded border border-amber-200 text-amber-900 mt-0.5 italic">
                    {moderationRecord.internalNote}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 8. PUBLICATION DIAGNOSIS & RECONCILIATION V2.2 */}
          <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/30 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-emerald-200/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-700 text-white">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                    Uchunguzi wa Uchapishaji (Publication Diagnosis V2.2)
                  </h4>
                  <p className="text-[11px] text-stone-600">
                    Uthibitisho wa mamlaka ya tangazo, vigezo vya kuonekana hadharani na upatanisho salama
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isLoadingDiagnosis ? (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-600 font-medium flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-stone-500" /> Inachunguza...
                  </span>
                ) : publicationDiagnosis ? (
                  <span
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1.5 ${
                      publicationDiagnosis.publicEligibility?.isEligible
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                  >
                    {publicationDiagnosis.publicEligibility?.isEligible ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Inaonekana Sokoni (Publicly Visible)
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        Haionekani Sokoni (Hidden / Unpublished)
                      </>
                    )}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={fetchPublicationDiagnosis}
                  disabled={isLoadingDiagnosis}
                  className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-colors cursor-pointer"
                  title="Sasisha uchunguzi wa chapisho"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDiagnosis ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Reconciliation Feedback Alert */}
            {reconcileFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  reconcileFeedback.type === 'success'
                    ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                    : reconcileFeedback.type === 'error'
                    ? 'bg-rose-100 text-rose-950 border-rose-300'
                    : 'bg-blue-100 text-blue-900 border-blue-300'
                }`}
              >
                {reconcileFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : reconcileFeedback.type === 'error' ? (
                  <XCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold">
                    {reconcileFeedback.type === 'success'
                      ? 'Upatanisho Umekamilika Salama'
                      : reconcileFeedback.type === 'error'
                      ? 'Hitilafu ya Upatanisho'
                      : 'Taarifa ya Upatanisho'}
                  </span>
                  <p className="mt-0.5">{reconcileFeedback.message}</p>
                </div>
              </div>
            )}

            {/* Publication Diagnosis Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {/* Pillar 1: AI Decision & Freshness */}
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium block text-[11px]">1. AI Screening & Freshness</span>
                <p className="font-bold text-stone-900 flex items-center gap-1.5">
                  {publicationDiagnosis?.aiScreening?.status === 'PASS' ? (
                    <span className="text-emerald-700">✓ PASS (Imeruhusiwa)</span>
                  ) : publicationDiagnosis?.aiScreening?.status === 'BLOCK' ? (
                    <span className="text-rose-700">⛔ BLOCK (Imezuiwa)</span>
                  ) : publicationDiagnosis?.aiScreening?.status === 'REVIEW_REQUIRED' ? (
                    <span className="text-amber-700">🔍 REVIEW_REQUIRED</span>
                  ) : (
                    <span>{publicationDiagnosis?.aiScreening?.status || 'Bado'}</span>
                  )}
                </p>
                <div className="text-[11px] text-stone-600 space-y-0.5 pt-0.5">
                  <p>
                    Fingerprint:{' '}
                    {publicationDiagnosis?.aiScreening?.isFresh ? (
                      <span className="text-emerald-700 font-semibold">✓ Fresh</span>
                    ) : (
                      <span className="text-amber-700 font-bold">⚠ Stale / Mismatch</span>
                    )}
                  </p>
                  <p className="text-stone-500 text-[10px]">
                    Chanzo: {publicationDiagnosis?.aiScreening?.evaluationSource || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Pillar 2: Authoritative Seller Trust */}
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium block text-[11px]">2. Uaminifu wa Muuzaji</span>
                <p className="font-bold text-stone-900">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      publicationDiagnosis?.sellerTrustStatus === 'TRUSTED_SELLER'
                        ? 'bg-emerald-100 text-emerald-800'
                        : publicationDiagnosis?.sellerTrustStatus === 'RESTRICTED_SELLER'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {publicationDiagnosis?.sellerTrustStatus || sellerTrust}
                  </span>
                </p>
                <p className="text-[11px] text-stone-500 pt-0.5">
                  {publicationDiagnosis?.sellerTrustStatus === 'TRUSTED_SELLER'
                    ? 'Inaruhusiwa kuchapishwa moja kwa moja ikipita ukaguzi.'
                    : publicationDiagnosis?.sellerTrustStatus === 'NEW_SELLER'
                    ? 'Muuzaji mpya anahitaji idhini ya msimamizi kabla ya kuwa active.'
                    : 'Muuzaji amezuiwa kuchapisha bidhaa mpya sokoni.'}
                </p>
              </div>

              {/* Pillar 3: Deterministic Validation */}
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium block text-[11px]">3. Vigezo vya Kisheria (Validation)</span>
                <p className="font-bold text-stone-900">
                  {publicationDiagnosis?.validation?.isEligibleForActive ? (
                    <span className="text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Vigezo Vyote Vimepita (Pass)
                    </span>
                  ) : (
                    <span className="text-rose-700 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Hitilafu za Kisheria (Fail)
                    </span>
                  )}
                </p>
                {publicationDiagnosis?.validation?.errorCodes && publicationDiagnosis.validation.errorCodes.length > 0 ? (
                  <p className="text-[10.5px] text-rose-800 font-mono">
                    Msimbo: {publicationDiagnosis.validation.errorCodes.join(', ')}
                  </p>
                ) : (
                  <p className="text-[11px] text-stone-500">Hakuna makosa yaliyopatikana.</p>
                )}
              </div>

              {/* Pillar 4: Commercial Entitlement */}
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium block text-[11px]">4. Haki ya Kibiashara (Entitlement)</span>
                <p className="font-bold text-stone-900">
                  {publicationDiagnosis?.commercialEntitlement?.canSell ? (
                    <span className="text-emerald-700">✓ Inaruhusiwa Kuuza (Active)</span>
                  ) : (
                    <span className="text-rose-700">✗ Imezuiliwa Kibiashara</span>
                  )}
                </p>
                <p className="text-[11px] text-stone-600">
                  {publicationDiagnosis?.commercialEntitlement?.reasonSwahili || 'Akaunti ina uwezo wa kuuza sokoni.'}
                </p>
              </div>

              {/* Pillar 5: Product & Moderation Status */}
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium block text-[11px]">5. Hali ya Tangazo & Mfumo</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-stone-900 font-semibold">
                    status: <strong className="text-emerald-800">{publicationDiagnosis?.status || product.status}</strong>
                  </span>
                  <span className="font-mono text-stone-900 font-semibold">
                    moderation: <strong className="text-blue-800">{publicationDiagnosis?.moderationStatus || product.moderationStatus}</strong>
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Hali halisi iliyopo kwenye rekodi rasmi ya soko.
                </p>
              </div>

              {/* Pillar 6: Public Eligibility Reason */}
              <div className="p-3 rounded-xl bg-white border border-stone-200 space-y-1">
                <span className="text-stone-500 font-medium block text-[11px]">6. Sababu ya Kutokuonekana Sokoni</span>
                {publicationDiagnosis?.publicEligibility?.isEligible ? (
                  <p className="font-semibold text-emerald-800">
                    Tangazo linapatikana hadharani sokoni bila kizuizi chochote.
                  </p>
                ) : (
                  <p className="font-semibold text-rose-800 text-[11.5px] leading-snug">
                    {publicationDiagnosis?.publicEligibility?.reason ||
                      publicationDiagnosis?.publicationResolver?.reasonSwahili ||
                      'Tangazo halijakamilisha vigezo vyote vya kuwa hadharani.'}
                  </p>
                )}
                {publicationDiagnosis?.reconciliationInfo?.lastReconciledAt && (
                  <p className="text-[10px] text-stone-400 font-mono pt-1">
                    Upatanisho wa mwisho: {new Date(publicationDiagnosis.reconciliationInfo.lastReconciledAt).toLocaleTimeString('sw-TZ')}
                  </p>
                )}
              </div>
            </div>

            {/* Reconciliation Action Box */}
            <div className="p-3.5 bg-white rounded-xl border border-emerald-300/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-700" /> Patanisha Hali ya Uchapishaji (Safe Publication Reconciliation)
                </span>
                <p className="text-[11px] text-stone-600 max-w-xl">
                  Inakokotoa upya data rasmi bila kubadili maamuzi ya BLOCK au vikwazo vya msimamizi.
                  Ikiwa muuzaji ni TRUSTED_SELLER, AI imetoa PASS, na vigezo vyote vimepita, tangazo litakuwa active mara moja.
                </p>
              </div>

              <button
                type="button"
                onClick={handleReconcilePublication}
                disabled={isReconciling}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white transition-colors cursor-pointer shadow-xs shrink-0 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                <span>{isReconciling ? 'Inapatanisha...' : 'Patanisha Sasa (Reconcile)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-200 text-stone-800 hover:bg-stone-300 transition-colors cursor-pointer"
            >
              Funga
            </button>
            {isStale && (
              <span className="text-[11px] text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" /> Fingerprint Stale
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isSuspendedOrHidden ? (
              <button
                onClick={() => onActionClick('RESTORE')}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Rejesha Tangazo (Restore)
              </button>
            ) : isApproved ? (
              <>
                <span className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Tangazo Limeidhinishwa (Approved)
                </span>
                <button
                  onClick={() => onActionClick('HIDE')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors cursor-pointer"
                >
                  Ficha (Hide)
                </button>
                <button
                  onClick={() => onActionClick('SUSPEND')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition-colors cursor-pointer"
                >
                  Sitisha (Suspend)
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onActionClick('CORRECTION')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  Omba Marekebisho
                </button>

                <button
                  onClick={() => onActionClick('HIDE')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors cursor-pointer"
                >
                  Ficha (Hide)
                </button>

                <button
                  onClick={() => onActionClick('SUSPEND')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition-colors cursor-pointer"
                >
                  Sitisha (Suspend)
                </button>

                <button
                  onClick={() => onActionClick('REJECT')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl bg-rose-700 text-white hover:bg-rose-800 transition-colors cursor-pointer shadow-xs"
                >
                  Kataa (Reject)
                </button>

                <button
                  onClick={() => onActionClick('APPROVE')}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Idhinisha Tangazo (Approve)
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Enlarged Full-Resolution Image Preview */}
      {isLightboxOpen && activeImage?.url && (
        <div
          className="fixed inset-0 z-70 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl max-h-[92vh] w-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-stone-300 bg-stone-800/80 rounded-full transition-colors cursor-pointer"
              title="Funga picha kubwa"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Image Box */}
            <div className="relative w-full max-h-[82vh] flex items-center justify-center overflow-hidden rounded-2xl bg-black">
              <img
                src={activeImage.url}
                alt={product.title}
                className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl"
                referrerPolicy="no-referrer"
              />

              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white backdrop-blur-xs transition-colors cursor-pointer"
                    title="Picha iliyotangulia"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white backdrop-blur-xs transition-colors cursor-pointer"
                    title="Picha inayofuata"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox Footer Info */}
            <div className="w-full flex items-center justify-between text-white text-xs mt-3 px-2">
              <span className="font-semibold truncate max-w-md">{product.title}</span>
              <span className="font-mono text-stone-400">
                Picha {activeImageIndex + 1} ya {allImages.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
