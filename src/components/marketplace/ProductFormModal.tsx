import React, { useState, useRef } from 'react';
import { MarketplaceProduct, ProductStatus, ShopCatalogue, ProductImage, ProductVideo } from '../../types/marketplace';
import {
  MARKETPLACE_CATEGORIES,
  TANZANIA_REGIONS,
  PRODUCT_UNITS
} from '../../data/marketplaceData';
import {
  getActiveRootCategories,
  getSubcategoriesForParent,
  getLocalCachedCategories,
  fetchGovernedCategories,
  validateProductCategoryAssignment
} from '../../services/marketplaceCategoryService';
import { GovernedCategory } from '../../types/marketplaceCategory';
import {
  compressImage,
  uploadProductVideo,
  deleteMediaFile,
  validateProductVideoFile,
  VideoUploadProgress,
  VideoUploadStage,
  formatFileSize
} from '../../services/mediaService';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { UploadTask } from 'firebase/storage';
import { ProductVideoPlayer } from './ProductVideoPlayer';
import {
  validatePriceValue,
  validateStockValue,
  checkDraftPriceStockConflicts
} from '../../services/productPriceStockService';
import { checkDraftLocationDeliveryConflicts } from '../../services/productLocationDeliveryService';
import { validateMarketplaceListing } from '../../services/marketplaceListingValidationService';
import {
  X,
  Check,
  AlertCircle,
  Save,
  Plus,
  Layers,
  Image as ImageIcon,
  UploadCloud,
  Trash2,
  Star,
  StarOff,
  Loader2,
  Video as VideoIcon,
  Play,
  Film,
  RefreshCw,
  Eye,
  AlertTriangle,
  Info,
  Terminal,
  Ban,
  Activity,
  MapPin,
  Truck,
  Compass,
  ShieldCheck,
  Sparkles,
  Wand2
} from 'lucide-react';
import {
  requestAiListingClassification
} from '../../services/marketplaceAiClassificationService';
import { AiClassificationResult } from '../../types/marketplaceAiClassification';

interface ProductFormModalProps {
  initialProduct?: MarketplaceProduct | null;
  catalogues?: ShopCatalogue[];
  onCreateCatalogue?: () => void;
  onClose: () => void;
  onSave: (productData: {
    title: string;
    description: string;
    category: string;
    subcategory?: string;
    categoryId?: string;
    subcategoryId?: string;
    price: number;
    currency: 'TZS' | 'Tsh';
    unit: string;
    quantityAvailable: number;
    location: string;
    region?: string;
    district?: string;
    area?: string;
    productLocation?: string;
    deliveryAvailable?: boolean;
    deliveryFee?: number | null;
    deliveryFeeType?: 'FREE' | 'FIXED' | 'NEGOTIABLE' | 'NOT_PROVIDED';
    deliveryAreas?: string[];
    deliveryTimeEstimate?: string | null;
    pickupAvailable?: boolean;
    pickupAddress?: string;
    status: ProductStatus;
    sellerPhone?: string;
    sellerBusinessName?: string;
    catalogueId?: string | null;
    catalogueName?: string;
    images?: ProductImage[];
    imageUrl?: string;
    video?: ProductVideo | null;
  }) => Promise<void>;
  defaultSellerName?: string;
  defaultPhone?: string;
  defaultLocation?: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  initialProduct,
  catalogues = [],
  onCreateCatalogue,
  onClose,
  onSave,
  defaultSellerName = '',
  defaultPhone = '',
  defaultLocation = 'Dar es Salaam'
}) => {
  const { currentUser } = useAuth();
  const user = currentUser;
  const isEditing = Boolean(initialProduct);

  const [title, setTitle] = useState(initialProduct?.title || '');
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string>(
    initialProduct?.catalogueId || ''
  );

  // V1.7A: Governed Category State
  const [governedCategories, setGovernedCategories] = useState<GovernedCategory[]>(() =>
    getLocalCachedCategories()
  );

  React.useEffect(() => {
    fetchGovernedCategories().then((res) => {
      if (res && res.length > 0) {
        setGovernedCategories(res);
      }
    });
  }, []);

  const activeRoots = React.useMemo(() => {
    return getActiveRootCategories(governedCategories);
  }, [governedCategories]);

  const [categoryId, setCategoryId] = useState<string>(() => {
    if (initialProduct?.categoryId) return initialProduct.categoryId;
    if (initialProduct?.category) {
      const match = governedCategories.find(
        (c) =>
          c.name.toLowerCase() === initialProduct.category.toLowerCase() ||
          c.slug.toLowerCase() === initialProduct.category.toLowerCase()
      );
      if (match) return match.categoryId;
    }
    return 'cat_dawa_za_mifugo';
  });

  const availableSubcategories = React.useMemo(() => {
    return getSubcategoriesForParent(categoryId, governedCategories, true);
  }, [categoryId, governedCategories]);

  const [subcategoryId, setSubcategoryId] = useState<string>(() => {
    if (initialProduct?.subcategoryId) return initialProduct.subcategoryId;
    if (initialProduct?.subcategory) {
      const match = availableSubcategories.find(
        (s) =>
          s.name.toLowerCase() === initialProduct.subcategory?.toLowerCase() ||
          s.slug.toLowerCase() === initialProduct.subcategory?.toLowerCase()
      );
      if (match) return match.categoryId;
    }
    return '';
  });

  const [category, setCategory] = useState(
    initialProduct?.category || MARKETPLACE_CATEGORIES[0].name
  );
  const [subcategory, setSubcategory] = useState(initialProduct?.subcategory || '');
  const [price, setPrice] = useState<string>(
    initialProduct?.price !== undefined ? String(initialProduct.price) : ''
  );
  const [unit, setUnit] = useState(initialProduct?.unit || PRODUCT_UNITS[0]);
  const [customUnit, setCustomUnit] = useState('');
  const [quantityAvailable, setQuantityAvailable] = useState<string>(
    initialProduct?.quantityAvailable !== undefined ? String(initialProduct.quantityAvailable) : '1'
  );
  const [location, setLocation] = useState(
    initialProduct?.location || defaultLocation || 'Dar es Salaam'
  );
  const [region, setRegion] = useState<string>(
    initialProduct?.region || initialProduct?.location || defaultLocation || 'Dar es Salaam'
  );
  const [district, setDistrict] = useState<string>(initialProduct?.district || '');
  const [area, setArea] = useState<string>(initialProduct?.area || '');

  // V1.6E: Delivery & Pickup state
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean>(
    initialProduct?.deliveryAvailable ?? false
  );
  const [pickupAvailable, setPickupAvailable] = useState<boolean>(
    initialProduct?.pickupAvailable ?? true
  );
  const [deliveryFeeType, setDeliveryFeeType] = useState<'FREE' | 'FIXED' | 'NEGOTIABLE' | 'NOT_PROVIDED'>(
    initialProduct?.deliveryFeeType ||
    (initialProduct?.deliveryFee !== undefined && initialProduct.deliveryFee !== null
      ? (initialProduct.deliveryFee === 0 ? 'FREE' : 'FIXED')
      : 'NOT_PROVIDED')
  );
  const [deliveryFee, setDeliveryFee] = useState<string>(
    initialProduct?.deliveryFee !== undefined && initialProduct.deliveryFee !== null
      ? String(initialProduct.deliveryFee)
      : ''
  );
  const [deliveryAreas, setDeliveryAreas] = useState<string>(
    initialProduct?.deliveryAreas ? initialProduct.deliveryAreas.join(', ') : ''
  );
  const [deliveryTimeEstimate, setDeliveryTimeEstimate] = useState<string>(
    initialProduct?.deliveryTimeEstimate || ''
  );
  const [pickupAddress, setPickupAddress] = useState<string>(
    initialProduct?.pickupAddress || ''
  );

  const [description, setDescription] = useState(initialProduct?.description || '');
  const [status, setStatus] = useState<ProductStatus>(initialProduct?.status || 'active');
  const [sellerPhone, setSellerPhone] = useState(
    initialProduct?.sellerPhone || defaultPhone || ''
  );
  const [sellerBusinessName, setSellerBusinessName] = useState(
    initialProduct?.sellerBusinessName || defaultSellerName || ''
  );

  // V1.7C: AI Assisted Classification State
  const [aiClassification, setAiClassification] = useState<AiClassificationResult | null>(null);
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [aiClassificationError, setAiClassificationError] = useState<string | null>(null);
  const [aiDismissed, setAiDismissed] = useState(false);

  const handleRequestAiClassification = async () => {
    if (!title.trim() || title.trim().length < 3) {
      setAiClassificationError('Tafadhali andika kwanza jina la bidhaa (angalau herufi 3) kabla ya kuomba msaada wa AI.');
      return;
    }

    setAiClassificationError(null);
    setIsAiClassifying(true);
    setAiDismissed(false);

    try {
      const result = await requestAiListingClassification({
        title: title.trim(),
        description: description.trim() || undefined,
        sellerSelectedCategoryId: categoryId,
        sellerSelectedSubcategoryId: subcategoryId || undefined,
        sellerSelectedCategoryName: category,
        imageUrl: images[0]?.url || undefined,
      });

      setAiClassification(result);
    } catch (err: any) {
      setAiClassificationError('Imeshindikana kupata pendekezo la AI kwa sasa. Unaweza kuendelea kuchagua kundi mwenyewe.');
    } finally {
      setIsAiClassifying(false);
    }
  };

  const handleApplyAiSuggestion = (targetCategoryId: string, targetSubcategoryId?: string | null) => {
    const matchedCat = governedCategories.find((c) => c.categoryId === targetCategoryId);
    if (matchedCat) {
      setCategoryId(matchedCat.categoryId);
      setCategory(matchedCat.name);

      if (targetSubcategoryId) {
        const subs = getSubcategoriesForParent(matchedCat.categoryId, governedCategories, true);
        const matchedSub = subs.find((s) => s.categoryId === targetSubcategoryId);
        if (matchedSub) {
          setSubcategoryId(matchedSub.categoryId);
          setSubcategory(matchedSub.name);
        } else {
          setSubcategoryId('');
          setSubcategory('');
        }
      } else {
        setSubcategoryId('');
        setSubcategory('');
      }
    }
    setAiDismissed(true);
  };

  // V1.6D: Live Price & Stock Conflict Check
  const liveConflicts = React.useMemo(() => {
    const numP = Number(price);
    const numQ = Number(quantityAvailable);
    if (!description.trim()) return [];
    return checkDraftPriceStockConflicts(
      description,
      !isNaN(numP) && numP > 0 ? numP : undefined,
      !isNaN(numQ) && numQ >= 0 ? numQ : undefined,
      status === 'sold_out'
    );
  }, [description, price, quantityAvailable, status]);

  // V1.6E: Live Location & Delivery Conflict Check
  const liveLocationDeliveryConflicts = React.useMemo(() => {
    if (!description.trim()) return [];
    const parsedFee = deliveryFeeType === 'FIXED' ? (Number(deliveryFee) || null) : (deliveryFeeType === 'FREE' ? 0 : null);
    const areasList = deliveryAreas.split(',').map((s) => s.trim()).filter(Boolean);
    return checkDraftLocationDeliveryConflicts(
      description,
      {
        region,
        district,
        area
      },
      {
        deliveryAvailable,
        pickupAvailable,
        deliveryFeeType,
        deliveryFee: parsedFee,
        deliveryAreas: areasList
      }
    );
  }, [description, region, district, area, deliveryAvailable, pickupAvailable, deliveryFeeType, deliveryFee, deliveryAreas]);

  // Product Images
  const [images, setImages] = useState<ProductImage[]>(() => {
    if (initialProduct?.images && initialProduct.images.length > 0) {
      return initialProduct.images;
    }
    if (initialProduct?.imageUrl) {
      return [
        {
          id: 'img_initial',
          url: initialProduct.imageUrl,
          thumbnailUrl: initialProduct.imageUrl,
          isPrimary: true,
          uploadedAt: initialProduct.createdAt
        }
      ];
    }
    return [];
  });

  // Product Explanation Video
  const [video, setVideo] = useState<ProductVideo | null>(
    initialProduct?.video || null
  );
  const [videoTitle, setVideoTitle] = useState(
    initialProduct?.video?.title || ''
  );
  const [videoDescription, setVideoDescription] = useState(
    initialProduct?.video?.description || ''
  );
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<VideoUploadProgress | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoErrorCode, setVideoErrorCode] = useState<string | null>(null);
  const [videoErrorDetails, setVideoErrorDetails] = useState<string | null>(null);
  const [videoErrorStage, setVideoErrorStage] = useState<VideoUploadStage | null>(null);
  const [showDiagnosticPanel, setShowDiagnosticPanel] = useState(true);
  const [showDeleteVideoConfirm, setShowDeleteVideoConfirm] = useState(false);
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const currentUploadTaskRef = useRef<UploadTask | null>(null);
  const cancelFnRef = useRef<(() => void) | null>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // V1.7A: Selected category objects from authoritative taxonomy
  const selectedGovernedCat = governedCategories.find((c) => c.categoryId === categoryId);
  const selectedGovernedSub = subcategoryId
    ? governedCategories.find((s) => s.categoryId === subcategoryId)
    : null;

  // V1.7B: Live Authoritative Listing Validation
  const liveListingValidation = React.useMemo(() => {
    const finalLocation = region.trim() || location.trim();
    const candidateProduct: Partial<MarketplaceProduct> = {
      productId: initialProduct?.productId || 'temp-id',
      sellerId: user?.uid || 'temp-seller',
      shopId: user?.uid || 'temp-seller',
      title: title.trim(),
      categoryId: selectedGovernedCat?.categoryId || categoryId,
      category: selectedGovernedCat?.name || category,
      subcategoryId: selectedGovernedSub?.categoryId || subcategoryId,
      subcategory: selectedGovernedSub?.name || subcategory,
      price: Number(price),
      quantityAvailable: Number(quantityAvailable),
      unit: unit === 'nyingine' ? customUnit.trim() : unit,
      location: finalLocation,
      region: region.trim() || undefined,
      district: district.trim() || undefined,
      area: area.trim() || undefined,
      deliveryAvailable,
      deliveryFeeType,
      deliveryFee: deliveryFeeType === 'FIXED' ? (Number(deliveryFee) || null) : (deliveryFeeType === 'FREE' ? 0 : null),
      pickupAvailable,
      pickupAddress: pickupAddress.trim() || undefined,
      description: description.trim(),
      images,
      video: video || undefined,
      status
    };

    return validateMarketplaceListing({
      product: candidateProduct,
      authenticatedUserId: user?.uid,
      targetStatus: status,
      isNewListing: !initialProduct
    });
  }, [
    initialProduct,
    user?.uid,
    title,
    selectedGovernedCat,
    categoryId,
    category,
    selectedGovernedSub,
    subcategoryId,
    subcategory,
    price,
    quantityAvailable,
    unit,
    customUnit,
    region,
    location,
    district,
    area,
    deliveryAvailable,
    deliveryFeeType,
    deliveryFee,
    pickupAvailable,
    pickupAddress,
    description,
    images,
    video,
    status
  ]);

  const handleProcessFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    if (images.length + files.length > 6) {
      setErrorMsg('Unaweza kuweka picha zisizozidi 6 kwa tangazo moja.');
      return;
    }

    setIsUploadingImage(true);
    setErrorMsg(null);

    const newImages: ProductImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        continue;
      }

      try {
        const { dataUrl } = await compressImage(file, 1200, 1200, 0.85);
        let finalUrl = dataUrl;
        try {
          const resp = await fetch('/api/marketplace/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.url) finalUrl = data.url;
          }
        } catch {
          // If server upload fails, dataUrl remains as fallback
        }

        const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const isFirst = images.length === 0 && newImages.length === 0;

        newImages.push({
          id: imageId,
          url: finalUrl,
          thumbnailUrl: finalUrl,
          isPrimary: isFirst,
          uploadedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error processing image:', err);
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => {
        const updated = [...prev, ...newImages];
        // Ensure at least one image is marked primary
        const hasPrimary = updated.some((img) => img.isPrimary);
        if (!hasPrimary && updated.length > 0) {
          updated[0].isPrimary = true;
        }
        return updated;
      });
    }

    setIsUploadingImage(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFiles(e.dataTransfer.files);
    }
  };

  const handleSetPrimary = (id: string) => {
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        isPrimary: img.id === id
      }))
    );
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const remaining = prev.filter((img) => img.id !== id);
      if (remaining.length > 0 && !remaining.some((img) => img.isPrimary)) {
        remaining[0].isPrimary = true;
      }
      return remaining;
    });
  };

  const handleCancelVideoUpload = () => {
    if (cancelFnRef.current) {
      try {
        cancelFnRef.current();
      } catch {}
      cancelFnRef.current = null;
    }
    if (currentUploadTaskRef.current) {
      try {
        currentUploadTaskRef.current.cancel();
      } catch {}
      currentUploadTaskRef.current = null;
    }
    setIsUploadingVideo(false);
    setVideoError('Upakiaji wa video umesitishwa na muuzaji.');
    setVideoErrorCode('storage/canceled');
    setVideoErrorStage('CANCELLED');
    if (videoUploadProgress) {
      setVideoUploadProgress({
        ...videoUploadProgress,
        stage: 'CANCELLED',
        errorMessage: 'Upakiaji umesitishwa.'
      });
    }
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous error/diagnostics
    setVideoError(null);
    setVideoErrorCode(null);
    setVideoErrorDetails(null);
    setVideoErrorStage(null);

    // Initial file validation
    const validationErr = validateProductVideoFile(file);
    if (validationErr) {
      const isSize = file.size > 50 * 1024 * 1024;
      setVideoError(validationErr);
      setVideoErrorCode(isSize ? 'storage/quota-exceeded' : 'storage/invalid-format');
      setVideoErrorDetails(`Faili: ${file.name} (${formatFileSize(file.size)}), Aina: ${file.type || 'Haijulikani'}`);
      setVideoErrorStage('VALIDATING');
      setVideoUploadProgress({
        stage: 'FAILED',
        progressPercent: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        fileName: file.name,
        fileSizeMb: (file.size / (1024 * 1024)).toFixed(1),
        fileType: file.type || 'video/mp4',
        errorMessage: validationErr,
        errorCode: isSize ? 'storage/quota-exceeded' : 'storage/invalid-format',
        errorStage: 'VALIDATING'
      });
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    const sellerUid = currentUser?.uid || auth.currentUser?.uid || initialProduct?.sellerId;
    if (!sellerUid || sellerUid === 'seller_temp' || sellerUid === 'null') {
      const authMsg = 'Hujaingia kwenye mfumo. Tafadhali ingia kwanza kwenye akaunti ya muuzaji ili uweze kupakia video.';
      setVideoError(authMsg);
      setVideoErrorCode('auth/not-authenticated');
      setVideoErrorDetails('Hakuna authenticated user UID aliyepatikana.');
      setVideoErrorStage('INITIALIZING_STORAGE');
      setVideoUploadProgress({
        stage: 'FAILED',
        progressPercent: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        fileName: file.name,
        fileSizeMb: (file.size / (1024 * 1024)).toFixed(1),
        fileType: file.type || 'video/mp4',
        errorMessage: authMsg,
        errorCode: 'auth/not-authenticated',
        errorStage: 'INITIALIZING_STORAGE'
      });
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    const productId = initialProduct?.productId || `prod_tmp_${Date.now()}`;

    try {
      setIsUploadingVideo(true);
      setVideoUploadProgress({
        stage: 'FILE_SELECTED',
        progressPercent: 5,
        bytesTransferred: 0,
        totalBytes: file.size,
        fileName: file.name,
        fileSizeMb: (file.size / (1024 * 1024)).toFixed(1),
        fileType: file.type || 'video/mp4'
      });

      const uploadedVideo = await uploadProductVideo(
        sellerUid,
        productId,
        file,
        {
          title: videoTitle.trim() || undefined,
          description: videoDescription.trim() || undefined,
        },
        {
          onProgress: (progress) => {
            setVideoUploadProgress(progress);
          },
          onTaskCreated: (task) => {
            currentUploadTaskRef.current = task;
          },
          onCancelHandler: (cancelFn) => {
            cancelFnRef.current = cancelFn;
          }
        }
      );

      // Safe replace: Clean up old storage file only after new video uploaded successfully
      if (video?.storagePath && video.storagePath !== uploadedVideo.storagePath) {
        deleteMediaFile(video.storagePath).catch(() => {});
      }

      setVideo(uploadedVideo);
    } catch (err: any) {
      console.error('Hitilafu ya kupakia video:', err);
      const code = err?.code || (err?.failedStage === 'UPLOADING' ? 'storage/unknown' : 'storage/upload-error');
      const details = err?.originalMessage || err?.message || 'Unknown upload exception';
      const stage = err?.failedStage || 'UPLOADING';

      setVideoError(err?.message || 'Imeshindikana kupakia video. Tafadhali angalia mtandao wako.');
      setVideoErrorCode(code);
      setVideoErrorDetails(details);
      setVideoErrorStage(stage);
    } finally {
      setIsUploadingVideo(false);
      currentUploadTaskRef.current = null;
      cancelFnRef.current = null;
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleDeleteVideoConfirm = () => {
    if (video?.storagePath) {
      deleteMediaFile(video.storagePath).catch(() => {});
    }
    setVideo(null);
    setVideoTitle('');
    setVideoDescription('');
    setShowDeleteVideoConfirm(false);
    setVideoError(null);
    setVideoErrorCode(null);
    setVideoErrorDetails(null);
    setVideoErrorStage(null);
    setVideoUploadProgress(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (!title.trim() || title.trim().length < 3) {
      setErrorMsg('Tafadhali weka jina la bidhaa (angalau herufi 3).');
      return;
    }

    // V1.6D: Authoritative Price & Stock validation
    const priceValidation = validatePriceValue(price);
    if (!priceValidation.isValid) {
      setErrorMsg(priceValidation.error || 'Bei ya bidhaa si sahihi.');
      return;
    }

    const stockValidation = validateStockValue(quantityAvailable, status);
    if (!stockValidation.isValid) {
      setErrorMsg(stockValidation.error || 'Idadi ya bidhaa inayopatikana si sahihi.');
      return;
    }

    const numPrice = priceValidation.cleanPrice!;
    const numQty = stockValidation.cleanQuantity!;

    const finalUnit = unit === 'nyingine' ? (customUnit.trim() || 'kizio') : unit;
    if (!finalUnit) {
      setErrorMsg('Tafadhali weka kipimo cha bidhaa.');
      return;
    }

    if (!description.trim() || description.trim().length < 8) {
      setErrorMsg('Tafadhali weka maelezo ya kina ya bidhaa (angalau herufi 8).');
      return;
    }

    const finalLocation = region.trim() || location.trim() || 'Dar es Salaam';
    if (!finalLocation) {
      setErrorMsg('Tafadhali weka eneo/mkoa wa bidhaa.');
      return;
    }

    const structuredProductLocation = [area.trim(), district.trim(), region.trim()].filter(Boolean).join(', ') || finalLocation;
    const areasList = deliveryAreas.split(',').map((s) => s.trim()).filter(Boolean);
    const parsedDeliveryFee = deliveryFeeType === 'FIXED' ? (Number(deliveryFee) || null) : (deliveryFeeType === 'FREE' ? 0 : null);

    const chosenCatalogue = catalogues.find((c) => c.catalogueId === selectedCatalogueId);
    const primaryImg = images.find((img) => img.isPrimary) || images[0];

    const finalVideo: ProductVideo | undefined = video
      ? {
          ...video,
          title: videoTitle.trim() || undefined,
          description: videoDescription.trim() || undefined,
          updatedAt: new Date().toISOString()
        }
      : undefined;

    // V1.7B: Authoritative Active Eligibility Check
    if (status === 'active' && !liveListingValidation.isEligibleForActive) {
      setErrorMsg(
        `Tangazo haliwezi kuwa ACTIVE kwa sababu halijakidhi vigezo vya sokoni:\n` +
          liveListingValidation.errors.map((e) => `• ${e.message}`).join('\n')
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const finalCatName = selectedGovernedCat?.name || category.trim() || 'Dawa za Mifugo';
      const finalSubName = selectedGovernedSub?.name || subcategory.trim() || undefined;

      await onSave({
        title: title.trim(),
        description: description.trim(),
        category: finalCatName,
        subcategory: finalSubName,
        categoryId: selectedGovernedCat?.categoryId || categoryId,
        subcategoryId: selectedGovernedSub?.categoryId || (subcategoryId || undefined),
        price: numPrice,
        currency: 'Tsh',
        unit: finalUnit,
        quantityAvailable: numQty,
        location: finalLocation,
        region: region.trim() || undefined,
        district: district.trim() || undefined,
        area: area.trim() || undefined,
        productLocation: structuredProductLocation,
        deliveryAvailable,
        deliveryFee: parsedDeliveryFee,
        deliveryFeeType,
        deliveryAreas: areasList.length > 0 ? areasList : undefined,
        deliveryTimeEstimate: deliveryTimeEstimate.trim() || null,
        pickupAvailable,
        pickupAddress: pickupAddress.trim() || undefined,
        status,
        sellerPhone: sellerPhone.trim() || defaultPhone,
        sellerBusinessName: sellerBusinessName.trim() || defaultSellerName,
        catalogueId: selectedCatalogueId || null,
        catalogueName: chosenCatalogue?.name || undefined,
        images,
        imageUrl: primaryImg?.url || '',
        video: finalVideo || null
      });
      onClose();
    } catch (err: any) {
      console.error('Hitilafu ya kuhifadhi bidhaa:', err);
      setErrorMsg(err?.message || 'Hitilafu imetokea wakati wa kuhifadhi bidhaa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-900 to-amber-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
              {isEditing ? 'Hariri Tangazo la Bidhaa' : 'Weka Tangazo Jipya la Bidhaa'}
            </h3>
            <p className="text-xs text-amber-200/90 pt-0.5">
              Jaza taarifa sahihi za bidhaa kwa ajili ya wanunuzi nchini Tanzania
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-amber-200 hover:text-white bg-amber-800/80 hover:bg-amber-800 rounded-full transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Product Image Media Management Section */}
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-amber-700" />
                    <span>Picha za Bidhaa (Product Media)</span>
                  </label>
                  <p className="text-[11px] text-stone-500">
                    Weka picha halisi kuongeza uaminifu kwa wanunuzi (Hadi picha 6)
                  </p>
                </div>
                <span className="text-[11px] font-bold text-stone-600 bg-stone-200 px-2 py-0.5 rounded-md">
                  {images.length}/6
                </span>
              </div>

              {/* Upload Dropzone */}
              {images.length < 6 && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    isDragging
                      ? 'border-amber-600 bg-amber-50'
                      : 'border-stone-300 hover:border-amber-500 bg-white hover:bg-amber-50/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {isUploadingImage ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                      <span>Inachakata picha...</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-stone-800">
                          Bofya au vuta picha hapa (Drag & Drop)
                        </p>
                        <p className="text-[10.5px] text-stone-500 pt-0.5">
                          Inakubali JPEG, PNG, WEBP
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Images Preview Grid */}
              {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                  {images.map((img, index) => (
                    <div
                      key={img.id || index}
                      className={`relative group rounded-xl overflow-hidden border aspect-square bg-stone-100 flex items-center justify-center ${
                        img.isPrimary ? 'ring-2 ring-amber-600 border-amber-600' : 'border-stone-200'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt="Product preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />

                      {/* Primary badge */}
                      {img.isPrimary && (
                        <span className="absolute top-1.5 left-1.5 bg-amber-600 text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span>Kuu</span>
                        </span>
                      )}

                      {/* Hover action overlay */}
                      <div className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                        {!img.isPrimary && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetPrimary(img.id);
                            }}
                            title="Weka kama Picha Kuu"
                            className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(img.id);
                          }}
                          title="Ondoa Picha"
                          className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video Management Section (Optional Product Explanation Video) */}
            <div className="p-3.5 bg-stone-900 text-stone-100 rounded-2xl border border-stone-800 space-y-3">
              {/* Hidden Video Input */}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg,video/3gpp"
                onChange={handleVideoSelect}
                className="hidden"
              />

              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <span className="p-2 bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-400 shrink-0">
                    <VideoIcon className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                      <span>Video ya Maelezo ya Bidhaa</span>
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                        Hiari (Max 1)
                      </span>
                    </h4>
                    <p className="text-[11px] text-stone-400 pt-0.5">
                      Weka video fupi ikielezea ubora, matumizi au uthibitisho wa bidhaa hii.
                    </p>
                  </div>
                </div>

                {!video && !isUploadingVideo && (
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ongeza Video</span>
                  </button>
                )}
              </div>

              {/* Uploading Status & Live Diagnostic Panel */}
              {isUploadingVideo && videoUploadProgress && (
                <div className="p-3.5 bg-stone-950/90 rounded-xl border border-amber-500/50 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                      <span>
                        {videoUploadProgress.stage === 'VALIDATING' && 'Inathibitisha faili la video...'}
                        {videoUploadProgress.stage === 'INITIALIZING_STORAGE' && 'Inaanzisha muunganisho wa Firebase Storage...'}
                        {videoUploadProgress.stage === 'UPLOADING' && `Inapakia kwenye Firebase Storage (${videoUploadProgress.progressPercent}%)...`}
                        {videoUploadProgress.stage === 'OBTAINING_URL' && 'Inapata kiungo cha video (Download URL)...'}
                        {videoUploadProgress.stage === 'GENERATING_POSTER' && 'Inatengeneza picha ya kwanza ya video...'}
                        {videoUploadProgress.stage === 'COMPLETED' && 'Upakiaji umekamilika kikamilifu!'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelVideoUpload}
                      className="py-1 px-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-rose-800 transition-colors cursor-pointer"
                    >
                      <Ban className="w-3 h-3" />
                      <span>Sitisha (Cancel)</span>
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-stone-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-amber-500 h-full transition-all duration-200 rounded-full"
                        style={{ width: `${Math.max(5, videoUploadProgress.progressPercent)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] text-stone-400 font-mono">
                      <span>{videoUploadProgress.fileName} ({videoUploadProgress.fileSizeMb} MB)</span>
                      <span>
                        {formatFileSize(videoUploadProgress.bytesTransferred)} / {formatFileSize(videoUploadProgress.totalBytes)} ({videoUploadProgress.progressPercent}%)
                      </span>
                    </div>
                  </div>

                  {/* Diagnostic details */}
                  <div className="p-2 bg-stone-900 rounded-lg border border-stone-800 text-[11px] font-mono text-stone-400 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Stage: <strong className="text-stone-200">{videoUploadProgress.stage}</strong></span>
                    </div>
                    <span>Type: <strong className="text-stone-200">{videoUploadProgress.fileType}</strong></span>
                  </div>
                </div>
              )}

              {/* Video Error Message & Diagnostic Box */}
              {videoError && !isUploadingVideo && (
                <div className="p-3.5 bg-rose-950/70 border border-rose-800/80 text-rose-200 rounded-xl space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-xs font-bold text-white">Imeshindikana Kupakia Video</h5>
                        <p className="text-xs text-rose-200 mt-0.5 leading-relaxed">{videoError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoError(null);
                        setVideoErrorCode(null);
                        setVideoErrorDetails(null);
                        setVideoErrorStage(null);
                      }}
                      className="text-stone-400 hover:text-white text-xs underline cursor-pointer shrink-0"
                    >
                      Funga
                    </button>
                  </div>

                  {/* Technical Diagnostic Details Panel */}
                  <div className="p-2.5 bg-black/50 rounded-lg border border-rose-900/60 font-mono text-[11px] text-rose-300/90 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                      <Terminal className="w-3.5 h-3.5 shrink-0" />
                      <span>Uchunguzi wa Kiufundi (Diagnostics):</span>
                    </div>
                    {videoErrorStage && (
                      <p>Failed Stage: <span className="text-white font-semibold">{videoErrorStage}</span></p>
                    )}
                    {videoErrorCode && (
                      <p>Error Code: <span className="text-amber-300 font-semibold">{videoErrorCode}</span></p>
                    )}
                    {videoErrorDetails && (
                      <p className="break-all opacity-80">Details: {videoErrorDetails}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="py-1 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Jaribu Tena (Chagua Video)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Video Exists State */}
              {video && !isUploadingVideo && (
                <div className="space-y-3 bg-stone-950 p-3 rounded-xl border border-stone-800">
                  {/* Video Player Preview with Self-Healing Cloud & IndexedDB Cache */}
                  <ProductVideoPlayer
                    video={video}
                    productTitle={title || 'Hakiki Video'}
                  />

                  {/* Video Meta Fields */}
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-stone-300 mb-1">
                        Kichwa / Jina la Video (Hiari)
                      </label>
                      <input
                        type="text"
                        value={videoTitle}
                        onChange={(e) => setVideoTitle(e.target.value)}
                        placeholder="mfano: Jinsi ya kumpa ng'ombe chakula hiki"
                        className="w-full px-3 py-1.5 bg-stone-900 border border-stone-700 rounded-lg text-xs text-white placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-stone-300 mb-1">
                        Maelezo ya Ziada ya Video (Hiari)
                      </label>
                      <input
                        type="text"
                        value={videoDescription}
                        onChange={(e) => setVideoDescription(e.target.value)}
                        placeholder="mfano: Video hii inaonyesha ubora na matokeo baada ya wiki mbili"
                        className="w-full px-3 py-1.5 bg-stone-900 border border-stone-700 rounded-lg text-xs text-white placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Video Action Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-800">
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>Video imepakiwa kikamilifu</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        className="py-1 px-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 border border-stone-700 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Badilisha Video</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDeleteVideoConfirm(true)}
                        className="py-1 px-2.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-rose-100 rounded-lg text-xs font-semibold flex items-center gap-1 border border-rose-900/60 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Futa Video</span>
                      </button>
                    </div>
                  </div>

                  {/* Delete Confirmation Warning */}
                  {showDeleteVideoConfirm && (
                    <div className="p-3 bg-rose-950/80 rounded-xl border border-rose-800 space-y-2 animate-in fade-in">
                      <p className="text-xs font-semibold text-rose-200">
                        Una uhakika unataka kufuta video hii kwenye tangazo lako?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDeleteVideoConfirm}
                          className="py-1 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Ndiyo, Futa
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteVideoConfirm(false)}
                          className="py-1 px-3 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          Ghairi
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No Video Placeholder Help */}
              {!video && !isUploadingVideo && (
                <div
                  onClick={() => videoInputRef.current?.click()}
                  className="p-3 border border-dashed border-stone-700 hover:border-amber-600 rounded-xl text-center cursor-pointer transition-colors bg-stone-950/40"
                >
                  <p className="text-xs text-stone-400">
                    Bofya hapa au kitufe cha juu kuweka video ya maelezo (MP4, WebM, Isizidi 50MB)
                  </p>
                </div>
              )}
            </div>

            {/* Catalogue Section (Digital Shop grouping) */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-800" />
                  <span>Weka kwenye Catalogue ya Duka Lako</span>
                </label>

                {onCreateCatalogue && (
                  <button
                    type="button"
                    onClick={onCreateCatalogue}
                    className="text-xs font-bold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Tengeneza Catalogue Mpya</span>
                  </button>
                )}
              </div>

              <select
                value={selectedCatalogueId}
                onChange={(e) => setSelectedCatalogueId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs sm:text-sm text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[44px]"
              >
                <option value="">-- (Bila Catalogue / Bidhaa ya Jumla) --</option>
                {catalogues.map((cat) => (
                  <option key={cat.catalogueId} value={cat.catalogueId}>
                    {cat.icon || '📁'} {cat.name}
                  </option>
                ))}
              </select>

              {catalogues.length === 0 && (
                <p className="text-[11px] text-amber-800 pt-0.5">
                  Hauna catalogue bado kwenye duka lako. Unaweza kuendelea bila catalogue, au bonyeza <strong>"+ Tengeneza Catalogue Mpya"</strong> hapo juu.
                </p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Jina la Bidhaa / Tangazo *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mfano: Vifaranga vya Sasso (Siku 1) au Ng'ombe wa Maziwa"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            {/* V1.7C: AI Assisted Classification Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Kundi la Bidhaa (Category Governance)</span>
                </div>
                <button
                  type="button"
                  onClick={handleRequestAiClassification}
                  disabled={isAiClassifying || !title.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Pata pendekezo la kundi rasmi kulingana na jina na maelezo"
                >
                  {isAiClassifying ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-amber-700" />
                      <span>Inachanganua...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3 h-3 text-amber-700" />
                      <span>Pendekeza Kundi kwa AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* AI Classification Error */}
              {aiClassificationError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
                  <span>{aiClassificationError}</span>
                  <button
                    type="button"
                    onClick={() => setAiClassificationError(null)}
                    className="text-rose-500 hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* AI Suggestion Card */}
              {aiClassification && !aiDismissed && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-2.5 transition-all ${
                    aiClassification.classificationStatus === 'MISMATCH_REVIEW'
                      ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                      : aiClassification.classificationStatus === 'NO_MATCH'
                      ? 'bg-stone-50 border-stone-300 text-stone-800'
                      : aiClassification.classificationStatus === 'AMBIGUOUS'
                      ? 'bg-sky-50 border-sky-300 text-sky-950'
                      : 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b pb-2 border-current/15">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-[12px]">Pendekezo la AI la Kundi la Bidhaa</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Status Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          aiClassification.classificationStatus === 'SUGGESTED'
                            ? 'bg-emerald-200 text-emerald-900'
                            : aiClassification.classificationStatus === 'MISMATCH_REVIEW'
                            ? 'bg-amber-200 text-amber-900'
                            : aiClassification.classificationStatus === 'AMBIGUOUS'
                            ? 'bg-sky-200 text-sky-900'
                            : 'bg-stone-200 text-stone-800'
                        }`}
                      >
                        {aiClassification.classificationStatus === 'SUGGESTED' && 'Kundi Limetambuliwa'}
                        {aiClassification.classificationStatus === 'MISMATCH_REVIEW' && 'Uwezekano wa Kundi Tofauti'}
                        {aiClassification.classificationStatus === 'AMBIGUOUS' && 'Chaguo Zaidi ya Moja'}
                        {aiClassification.classificationStatus === 'NO_MATCH' && 'Hakuna Kundi Lililolingana'}
                        {aiClassification.classificationStatus === 'NEEDS_REVIEW' && 'Inahitaji Uhakiki'}
                        {aiClassification.classificationStatus === 'ERROR' && 'Hitilafu ya AI'}
                      </span>

                      {/* Confidence Badge */}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                        Uwezekano: {aiClassification.confidenceLevel}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation Body */}
                  {aiClassification.suggestedCategoryId ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-stone-600">Kundi Kuu:</span>
                        <strong className="text-stone-900 font-bold bg-white/80 px-2 py-0.5 rounded border border-current/20">
                          {aiClassification.suggestedCategoryName}
                        </strong>
                        {aiClassification.suggestedSubcategoryName && (
                          <>
                            <span className="font-semibold text-stone-600">Kundi Dogo:</span>
                            <strong className="text-stone-900 font-bold bg-white/80 px-2 py-0.5 rounded border border-current/20">
                              {aiClassification.suggestedSubcategoryName}
                            </strong>
                          </>
                        )}
                      </div>

                      {aiClassification.reason && (
                        <p className="text-[11.5px] leading-relaxed text-stone-700">
                          <span className="font-semibold">Sababu:</span> {aiClassification.reason}
                        </p>
                      )}

                      {aiClassification.matchedSignals && aiClassification.matchedSignals.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[10.5px] text-stone-600">
                          <span>Alama zilizotumika:</span>
                          {aiClassification.matchedSignals.map((sig, sIdx) => (
                            <span key={sIdx} className="bg-white px-1.5 py-0.5 rounded border border-stone-200">
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Seller Mismatch Caution Notice */}
                      {aiClassification.isMismatchWithSellerCategory && (
                        <div className="p-2 bg-amber-100/90 border border-amber-300 rounded-lg text-amber-950 text-[11px] space-y-0.5">
                          <div className="font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>Mazingatio ya Kundi Tofauti:</span>
                          </div>
                          <p>
                            Ulichochagua sasa ni: <strong>{aiClassification.sellerSelectedCategoryName || category}</strong>, lakini AI imebaini inaweza kuwa: <strong>{aiClassification.suggestedCategoryName}</strong>. Huu ni msaada tu; una hiari ya kubaki na chaguo lako au kubadili.
                          </p>
                        </div>
                      )}

                      {/* Alternatives if available */}
                      {aiClassification.alternativeSuggestions && aiClassification.alternativeSuggestions.length > 0 && (
                        <div className="pt-1 space-y-1">
                          <span className="text-[10.5px] font-semibold text-stone-600">Makundi Mbadala Yaliyopo:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {aiClassification.alternativeSuggestions.map((alt) => (
                              <button
                                key={alt.categoryId}
                                type="button"
                                onClick={() => handleApplyAiSuggestion(alt.categoryId, alt.subcategoryId)}
                                className="px-2 py-1 bg-white hover:bg-stone-100 text-stone-800 text-[11px] font-medium rounded border border-stone-300 transition-colors cursor-pointer"
                              >
                                Tumia: {alt.categoryName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Confirmation Buttons */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleApplyAiSuggestion(aiClassification.suggestedCategoryId!, aiClassification.suggestedSubcategoryId)}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Tumia Kundi Hili</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiDismissed(true)}
                          className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          Kataa / Weka Langu
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11.5px] leading-relaxed text-stone-700">
                        {aiClassification.reason || 'AI haikupata kundi linalolingana vizuri kwenye makundi rasmi ya sokoni. Tafadhali endelea kuchagua kundi kwa mkono mwenyewe.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setAiDismissed(true)}
                        className="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold text-[11px] rounded-lg transition-colors cursor-pointer"
                      >
                        Sawa, Nitaendelea
                      </button>
                    </div>
                  )}

                  <p className="text-[10px] text-stone-500 italic pt-1 border-t border-current/10">
                    * Uainishaji huu ni msaada tu (Assistive Only). Hauruhusu kuanzisha makundi mapya wala kuidhinisha uhalali wa tangazo kuwa hai.
                  </p>
                </div>
              )}
            </div>

            {/* Category & Subcategory (Authoritative Governed Taxonomy) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1 flex items-center justify-between">
                  <span>Kundi Kuu la Bidhaa *</span>
                  <span className="text-[10px] text-amber-700 font-normal">Kundi Rasmi</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    const newCatId = e.target.value;
                    setCategoryId(newCatId);
                    setSubcategoryId('');
                    const found = governedCategories.find((c) => c.categoryId === newCatId);
                    if (found) setCategory(found.name);
                  }}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                >
                  {activeRoots.map((cat) => (
                    <option key={cat.categoryId} value={cat.categoryId}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-stone-500 pt-1">
                  Kategoria zinasimamiwa na sera za soko (Admin-governed).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Kundi Dogo (Subcategory)
                </label>
                <select
                  value={subcategoryId}
                  onChange={(e) => {
                    const newSubId = e.target.value;
                    setSubcategoryId(newSubId);
                    const found = availableSubcategories.find((s) => s.categoryId === newSubId);
                    setSubcategory(found?.name || '');
                  }}
                  disabled={availableSubcategories.length === 0}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px] disabled:opacity-50"
                >
                  <option value="">-- Chagua Kundi Dogo (Hiari) --</option>
                  {availableSubcategories.map((sub) => (
                    <option key={sub.categoryId} value={sub.categoryId}>
                      {sub.name}
                    </option>
                  ))}
                </select>
                {availableSubcategories.length === 0 && (
                  <p className="text-[10px] text-stone-400 pt-1">
                    Hakuna kundi dogo la lazima kwa kundi hili.
                  </p>
                )}
              </div>
            </div>

            {/* Price & Unit & Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Bei (Tsh) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-500">
                    Tsh
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="15000"
                    className="w-full pl-11 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Kipimo cha Bei *
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                >
                  {PRODUCT_UNITS.map((u, idx) => (
                    <option key={idx} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Idadi Iliyopo *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={quantityAvailable}
                  onChange={(e) => setQuantityAvailable(e.target.value)}
                  placeholder="10"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>
            </div>

            {/* V1.6D: Live Conflict Warnings & Traceability Notice */}
            {liveConflicts.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Onyo la Ukinzani wa Maelezo na Bei/Mzigo:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-amber-900/90 pl-1 space-y-0.5">
                  {liveConflicts.map((conf, idx) => (
                    <li key={idx}>{conf}</li>
                  ))}
                </ul>
                <p className="text-[10.5px] text-amber-800 italic">
                  Tafadhali hakikisha maelezo uliyoyaandika yanakubaliana na bei na idadi uliyojaza kwenye visanduku hivi ili kuepuka kuwachanganya wanunuzi.
                </p>
              </div>
            )}

            <div className="text-[11px] text-stone-500 bg-stone-50 p-2.5 rounded-xl border border-stone-200/80 leading-relaxed flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-stone-600 mt-0.5 shrink-0" />
              <span>
                <strong>Uthibitisho wa Bei & Mzigo:</strong> Mfumo unarekodi tarehe na saa rasmi ya mwisho unaposasisha bei au idadi ya bidhaa hii ili wanunuzi waone taarifa zenye uhakika.
              </span>
            </div>

            {unit === 'nyingine' && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Weka Kipimo Chako *
                </label>
                <input
                  type="text"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  placeholder="Mfano: ndoo 10L, pipa, kitalu"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>
            )}

            {/* V1.6E: Authoritative Location Section */}
            <div className="p-3.5 bg-stone-50/90 border border-stone-200/90 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-700" />
                  <span>Mahali & Eneo Rasmi la Mzigo (Authoritative Location) *</span>
                </label>
                <span className="text-[10px] text-stone-500 font-medium">
                  Viwango Halisi
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Mkoa *
                  </label>
                  <select
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setLocation(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                  >
                    {TANZANIA_REGIONS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Wilaya
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Mf. Kinondoni au Bagamoyo"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Eneo / Mtaa / Kijiji
                  </label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="Mf. Mwenge / Shambani"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 min-h-[40px]"
                  />
                </div>
              </div>

              <p className="text-[10.5px] text-stone-500 leading-snug">
                Taarifa hii inatumika kueleza eneo halisi la mzigo kwa wanunuzi. Mfumo haurudishi matokeo bandia ya umbali bila data rasmi za kijiografia.
              </p>
            </div>

            {/* V1.6E: Authoritative Delivery & Logistics Section */}
            <div className="p-3.5 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-emerald-700" />
                  <span>Mipangilio ya Usafirishaji & Kuchukua Mzigo</span>
                </label>
                <span className="text-[10px] text-emerald-800 font-semibold">
                  Delivery Trust
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="modalDeliveryAvailableCheck"
                    checked={deliveryAvailable}
                    onChange={(e) => setDeliveryAvailable(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="modalDeliveryAvailableCheck" className="text-xs font-bold text-stone-800 cursor-pointer">
                    Usafirishaji Unapatikana (Delivery Available)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="modalPickupAvailableCheck"
                    checked={pickupAvailable}
                    onChange={(e) => setPickupAvailable(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="modalPickupAvailableCheck" className="text-xs font-bold text-stone-800 cursor-pointer">
                    Mteja Anaweza Kuchukua Mwenyewe (Pickup Available)
                  </label>
                </div>
              </div>

              {deliveryAvailable && (
                <div className="pt-2 border-t border-emerald-200/60 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Gharama ya Usafirishaji
                      </label>
                      <select
                        value={deliveryFeeType}
                        onChange={(e: any) => setDeliveryFeeType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
                      >
                        <option value="NOT_PROVIDED">Haijaainishwa (Wanunuzi watawasiliana nawe)</option>
                        <option value="FREE">Bure (Bila Malipo ya Usafirishaji)</option>
                        <option value="FIXED">Gharama Maalum (Weka kiasi TZS)</option>
                        <option value="NEGOTIABLE">Maelewano ya Bei (Negotiable)</option>
                      </select>
                    </div>

                    {deliveryFeeType === 'FIXED' && (
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          Kiasi cha Usafirishaji (Tsh)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={deliveryFee}
                          onChange={(e) => setDeliveryFee(e.target.value)}
                          placeholder="Mf. 5000"
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Maeneo Yanayofikishwa (Tenganisha kwa mkato)
                      </label>
                      <input
                        type="text"
                        value={deliveryAreas}
                        onChange={(e) => setDeliveryAreas(e.target.value)}
                        placeholder="Mf. Dar es Salaam, Kibaha, Morogoro"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Makadirio ya Muda wa Kufikisha
                      </label>
                      <input
                        type="text"
                        value={deliveryTimeEstimate}
                        onChange={(e) => setDeliveryTimeEstimate(e.target.value)}
                        placeholder="Mf. Siku 1 - 2 au Saa 24"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {pickupAvailable && (
                <div className="pt-2 border-t border-emerald-200/60">
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Anwani au Eneo la Kuchukulia Mzigo (Pickup Address)
                  </label>
                  <input
                    type="text"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Mf. Dukani Mwenge karibu na kituo cha mwendokasi"
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[40px]"
                  />
                </div>
              )}
            </div>

            {/* V1.6E: Live Location & Delivery Conflict Warnings */}
            {liveLocationDeliveryConflicts.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Onyo la Ukinzani wa Maelezo na Eneo/Usafirishaji:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-amber-900/90 pl-1 space-y-0.5">
                  {liveLocationDeliveryConflicts.map((conf, idx) => (
                    <li key={idx}>{conf}</li>
                  ))}
                </ul>
                <p className="text-[10.5px] text-amber-800 italic">
                  Kumbuka: Data zilizojazwa kwenye visanduku hivi (structured data) zitachukua kipaumbele dhidi ya maandishi ya maelezo.
                </p>
              </div>
            )}

            {/* Status & Contact Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Hali ya Tangazo *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProductStatus)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                >
                  <option value="active">Inapatikana (Active)</option>
                  <option value="sold_out">Imeuzwa Yote (Sold Out)</option>
                  <option value="inactive">Imezimwa (Inactive)</option>
                  <option value="draft">Rasimu (Draft)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Namba ya Simu ya Mawasiliano (WhatsApp/Simu)
                </label>
                <input
                  type="tel"
                  value={sellerPhone}
                  onChange={(e) => setSellerPhone(e.target.value)}
                  placeholder="Mfano: 0712 345 678"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Jina la Duka / Shamba / Muuzaji
              </label>
              <input
                type="text"
                value={sellerBusinessName}
                onChange={(e) => setSellerBusinessName(e.target.value)}
                placeholder="Mfano: Shamba la Mifugo"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            {/* Detailed Description */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Maelezo ya Kina ya Bidhaa *
              </label>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Fafanua afya ya mifugo, umri, chanjo zilizotolewa, uzito, masharti ya usafirishaji, au kiwango cha chini cha oda..."
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>

            {/* V1.7B: Live Authoritative Listing Validation Feedback Card */}
            <div
              className={`p-3.5 rounded-xl border transition-colors ${
                status === 'active'
                  ? liveListingValidation.isEligibleForActive
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50/80 border-rose-300 text-rose-950'
                  : 'bg-amber-50/80 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck
                    className={`w-4 h-4 ${
                      status === 'active'
                        ? liveListingValidation.isEligibleForActive
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                        : 'text-amber-700'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Ukaguzi wa Vigezo vya Tangazo (V1.7B)
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    status === 'active'
                      ? liveListingValidation.isEligibleForActive
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {status === 'active'
                    ? liveListingValidation.isEligibleForActive
                      ? 'Liko Tayari (VALID)'
                      : 'Halijakamilika (INVALID)'
                    : `Hali: ${status.toUpperCase()} (${liveListingValidation.validationStatus})`}
                </span>
              </div>

              {status === 'active' && liveListingValidation.isEligibleForActive && (
                <p className="text-xs text-emerald-800 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Tangazo limekamilika na litachapishwa mara moja sokoni kama ACTIVE.
                </p>
              )}

              {status === 'active' && !liveListingValidation.isEligibleForActive && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-rose-900">
                    Vitu vinavyozuia tangazo kuwa ACTIVE:
                  </p>
                  <ul className="text-xs space-y-0.5 text-rose-800 list-disc list-inside">
                    {liveListingValidation.errors.map((err, idx) => (
                      <li key={idx}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {status !== 'active' && (
                <div className="space-y-1">
                  <p className="text-xs text-amber-900">
                    Tangazo litahifadhiwa kama <span className="font-bold">{status === 'draft' ? 'Rasimu' : status}</span>. Huwezi kuliona sokoni kwa wanunuzi mpaka ukamilishe vigezo vya kuwa ACTIVE.
                  </p>
                  {liveListingValidation.errors.length > 0 && (
                    <p className="text-[11px] text-amber-800">
                      Ili kuliwasha baadaye, unahitaji kukamilisha: {liveListingValidation.errors.map((e) => e.checkType).join(', ')}.
                    </p>
                  )}
                </div>
              )}

              {liveListingValidation.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-stone-200/60 text-[11px] text-stone-600 space-y-0.5">
                  <span className="font-semibold block text-stone-700">Ushauri wa uboreshaji (Hiari):</span>
                  {liveListingValidation.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <span className="text-amber-600">•</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2.5 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Ghairi
            </button>

            <button
              type="submit"
              disabled={isSubmitting || (status === 'active' && !liveListingValidation.isEligibleForActive)}
              title={
                status === 'active' && !liveListingValidation.isEligibleForActive
                  ? 'Kamilisha vigezo vinavyozuia tangazo kuwa amilifu hapo juu.'
                  : undefined
              }
              className="py-2.5 px-6 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Inahifadhi...'
                  : status === 'active' && !liveListingValidation.isEligibleForActive
                  ? 'Kamilisha Vigezo Kwanza'
                  : isEditing
                  ? 'Sasisha Tangazo'
                  : 'Chapisha Tangazo'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
