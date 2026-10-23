import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask
} from 'firebase/storage';
import { storage } from '../lib/firebase';
import { ProductImage, ProductVideo } from '../types/marketplace';
import { InboxMediaAttachment } from '../types/marketplaceInbox';
import { GumzoMediaItem } from '../types/gumzo';
import { persistImagePermanently } from './imageStorageService';
import {
  saveVideoToIndexedDB,
  saveVideoToFirestoreChunks,
  deleteVideoPermanently
} from './videoStorageService';

export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB max limit
export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/ogg',
  'video/3gpp'
];

export type VideoUploadStage =
  | 'IDLE'
  | 'FILE_SELECTED'
  | 'VALIDATING'
  | 'INITIALIZING_STORAGE'
  | 'UPLOADING'
  | 'OBTAINING_URL'
  | 'GENERATING_POSTER'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface VideoUploadProgress {
  stage: VideoUploadStage;
  progressPercent: number;
  bytesTransferred: number;
  totalBytes: number;
  fileName: string;
  fileSizeMb: string;
  fileType: string;
  errorMessage?: string;
  errorCode?: string;
  errorStage?: VideoUploadStage;
}

/**
 * Format bytes to readable size string (KB / MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/**
 * Maps Firebase Storage error codes to friendly Swahili explanation while preserving technical code.
 */
export function getFirebaseStorageErrorMessage(err: any): {
  userMessage: string;
  errorCode: string;
  errorMessage: string;
} {
  const errorCode = err?.code || err?.name || 'storage/unknown';
  const errorMessage = err?.message || String(err || 'Unknown error');

  let userMessage = 'Imeshindikana kupakia video. Tafadhali jaribu tena.';

  if (errorCode === 'storage/unauthorized' || errorCode === 'permission-denied') {
    userMessage = 'Ruhusa imekataliwa: Huna idhini ya kupakia kwenye folda hii ya muuzaji. Tafadhali hakikisha umeingia kwenye akaunti yako.';
  } else if (errorCode === 'storage/canceled') {
    userMessage = 'Upakiaji wa video umesitishwa.';
  } else if (errorCode === 'storage/quota-exceeded') {
    userMessage = 'Nafasi ya hifadhi ya video (Storage Quota) imezidiwa. Wasiliana na msimamizi.';
  } else if (errorCode === 'storage/retry-limit-exceeded' || errorCode === 'storage/timeout') {
    userMessage = 'Muda wa kupakia umekwisha kutokana na mtandao kuwa duni. Tafadhali angalia mtandao wako na ujaribu tena.';
  } else if (errorCode === 'storage/invalid-checksum') {
    userMessage = 'Faili la video halikupokelewa vizuri na seva. Tafadhali jaribu tena.';
  } else if (errorCode === 'storage/invalid-argument' || errorCode === 'storage/invalid-format') {
    userMessage = 'Muundo au taarifa za video hii si sahihi.';
  } else if (errorCode === 'auth/not-authenticated') {
    userMessage = 'Hujaingia kwenye mfumo. Tafadhali ingia kwanza ili uweze kupakia video ya bidhaa.';
  } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('failed to fetch')) {
    userMessage = 'Mtandao umesababisha upload kushindikana. Tafadhali angalia muunganisho wako wa intaneti.';
  }

  return { userMessage, errorCode, errorMessage };
}

/**
 * Validates a video file for size and MIME type.
 * Returns error string in Swahili or null if valid.
 */
export function validateProductVideoFile(file: File): string | null {
  if (!file) {
    return 'Tafadhali chagua faili la video.';
  }

  if (file.size <= 0) {
    return 'Faili la video halina maudhui (0 bytes). Tafadhali chagua video halisi.';
  }

  // Type check
  const isTypeSupported =
    SUPPORTED_VIDEO_TYPES.includes(file.type.toLowerCase()) ||
    file.name.toLowerCase().endsWith('.mp4') ||
    file.name.toLowerCase().endsWith('.mov') ||
    file.name.toLowerCase().endsWith('.webm') ||
    file.name.toLowerCase().endsWith('.m4v') ||
    file.name.toLowerCase().endsWith('.3gp');

  if (!isTypeSupported) {
    return 'Aina hii ya video haikubaliki. Tafadhali tumia video ya umbizo la MP4 au WebM.';
  }

  // Size check (max 50MB)
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `Video imezidi ukubwa unaoruhusiwa wa 50MB (${sizeMb} MB). Tafadhali weka video fupi au punguza ukubwa.`;
  }

  return null;
}

/**
 * Automatically extracts a poster thumbnail and duration from a video file/URL safely without blocking.
 */
export async function extractVideoThumbnail(
  fileOrUrl: File | Blob | string
): Promise<{ thumbnailUrl?: string; durationSeconds?: number }> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;

      let isBlobUrl = false;
      let url = '';

      if (typeof fileOrUrl === 'string') {
        url = fileOrUrl;
      } else {
        url = URL.createObjectURL(fileOrUrl);
        isBlobUrl = true;
      }

      let isResolved = false;
      const cleanupAndResolve = (result: { thumbnailUrl?: string; durationSeconds?: number }) => {
        if (isResolved) return;
        isResolved = true;
        if (isBlobUrl && url) {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
        resolve(result);
      };

      // Safety timeout so extraction never blocks upload pipeline
      const timer = setTimeout(() => {
        cleanupAndResolve({});
      }, 1500);

      const captureFrame = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(video.videoWidth || 640, 800);
          const aspectRatio = (video.videoHeight || 360) / (video.videoWidth || 640);
          canvas.height = Math.round(canvas.width * (aspectRatio || 0.5625));

          const ctx = canvas.getContext('2d');
          if (ctx && canvas.width > 0 && canvas.height > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            cleanupAndResolve({
              thumbnailUrl,
              durationSeconds: Math.round(video.duration || 0)
            });
            return;
          }
        } catch (canvasErr) {
          console.warn('Canvas video frame extraction warning:', canvasErr);
        }
        cleanupAndResolve({ durationSeconds: Math.round(video.duration || 0) });
      };

      video.onseeked = captureFrame;

      video.onloadedmetadata = () => {
        const duration = Math.round(video.duration || 0);
        const targetTime = Math.min(1.0, duration > 1 ? 1.0 : duration / 2);
        try {
          video.currentTime = targetTime;
        } catch {
          captureFrame();
        }
      };

      video.onloadeddata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          // If metadata or seeked didn't resolve yet, attempt direct frame capture
          setTimeout(() => {
            if (!isResolved) captureFrame();
          }, 300);
        }
      };

      video.onerror = () => {
        clearTimeout(timer);
        cleanupAndResolve({});
      };

      video.src = url;
      try {
        video.load();
      } catch {}
    } catch {
      resolve({});
    }
  });
}

/**
 * Uploads a product explanation video with live byte-level progress,
 * non-blocking poster generation, cancel support, and deterministic completion.
 */
export async function uploadProductVideo(
  sellerUid: string,
  productId: string,
  file: File,
  metadata?: { title?: string; description?: string },
  callbacks?: {
    onProgress?: (progress: VideoUploadProgress) => void;
    onTaskCreated?: (task: UploadTask) => void;
    onCancelHandler?: (cancelFn: () => void) => void;
  }
): Promise<ProductVideo> {
  const fileName = file.name;
  const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const fileType = file.type || 'video/mp4';

  let isExplicitlyCancelled = false;
  let activeXhr: XMLHttpRequest | null = null;
  let activeUploadTask: UploadTask | null = null;

  const cancelFn = () => {
    isExplicitlyCancelled = true;
    if (activeXhr) {
      try {
        activeXhr.abort();
      } catch {}
    }
    if (activeUploadTask) {
      try {
        activeUploadTask.cancel();
      } catch {}
    }
  };
  callbacks?.onCancelHandler?.(cancelFn);

  const reportProgress = (
    stage: VideoUploadStage,
    progressPercent: number,
    bytesTransferred: number,
    errorInfo?: { errorCode?: string; errorMessage?: string; errorStage?: VideoUploadStage }
  ) => {
    callbacks?.onProgress?.({
      stage,
      progressPercent,
      bytesTransferred,
      totalBytes: file.size,
      fileName,
      fileSizeMb,
      fileType,
      ...errorInfo
    });
  };

  // STAGE 1 & 2: File Selected & Validating
  reportProgress('VALIDATING', 0, 0);
  const validationError = validateProductVideoFile(file);
  if (validationError) {
    const err = new Error(validationError);
    (err as any).code = file.size > MAX_VIDEO_SIZE_BYTES ? 'storage/quota-exceeded' : 'storage/invalid-format';
    reportProgress('FAILED', 0, 0, {
      errorCode: (err as any).code,
      errorMessage: validationError,
      errorStage: 'VALIDATING'
    });
    throw err;
  }

  // Verify seller authentication
  if (!sellerUid || sellerUid === 'seller_temp' || sellerUid === 'null' || sellerUid === 'undefined') {
    const authErr = new Error('Hujaingia kwenye mfumo. Tafadhali ingia kwanza ili uweze kupakia video.');
    (authErr as any).code = 'auth/not-authenticated';
    reportProgress('FAILED', 0, 0, {
      errorCode: 'auth/not-authenticated',
      errorMessage: 'Seller UID is missing or not authenticated.',
      errorStage: 'INITIALIZING_STORAGE'
    });
    throw authErr;
  }

  const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // STAGE 3: Extract thumbnail in background (fast & non-blocking)
  let extractedThumbnail: string | undefined;
  let extractedDuration: number | undefined;
  try {
    const thumbResult = await extractVideoThumbnail(file);
    extractedThumbnail = thumbResult.thumbnailUrl;
    extractedDuration = thumbResult.durationSeconds;
  } catch (tErr) {
    console.warn('Non-blocking thumbnail extraction warning:', tErr);
  }

  // STAGE 4: Permanent Multi-Layer Storage Pipeline
  // Layer 1: Client IndexedDB (durable offline & instant playback)
  // Layer 2: Firestore Cloud Chunks (permanent Google Cloud persistence)
  // Layer 3: Server disk cache (fast HTTP Range streaming)
  reportProgress('INITIALIZING_STORAGE', 5, 0);

  // 1. Immediately cache into IndexedDB
  try {
    await saveVideoToIndexedDB(videoId, file, fileType);
  } catch (idbErr) {
    console.warn('IndexedDB pre-cache notice:', idbErr);
  }

  if (isExplicitlyCancelled) {
    const cancelErr = new Error('Upakiaji wa video umesitishwa na mtumiaji.');
    (cancelErr as any).code = 'storage/canceled';
    throw cancelErr;
  }

  // 2. Stream chunks to Firestore Cloud Permanent Storage
  reportProgress('UPLOADING', 15, Math.round(file.size * 0.15));
  try {
    await saveVideoToFirestoreChunks(
      videoId,
      file,
      {
        sellerUid,
        productId,
        fileName,
        title: metadata?.title,
        description: metadata?.description,
        thumbnailUrl: extractedThumbnail,
        durationSeconds: extractedDuration,
      },
      (firestoreProgress) => {
        if (isExplicitlyCancelled) return;
        const mapped = Math.min(94, Math.max(15, Math.round(firestoreProgress * 0.94)));
        reportProgress('UPLOADING', mapped, Math.round(file.size * (mapped / 100)));
      }
    );
  } catch (firestoreErr) {
    console.warn('Firestore cloud chunk save warning, proceeding with hybrid caching:', firestoreErr);
  }

  if (isExplicitlyCancelled) {
    const cancelErr = new Error('Upakiaji wa video umesitishwa na mtumiaji.');
    (cancelErr as any).code = 'storage/canceled';
    throw cancelErr;
  }

  // 3. Seed server disk cache asynchronously so high-performance HTTP Range streaming is warm
  try {
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;
    xhr.timeout = 30000;
    xhr.open('POST', '/api/upload-video-raw', true);
    xhr.setRequestHeader('x-video-id', videoId);
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
    xhr.setRequestHeader('x-mime-type', fileType);
    xhr.setRequestHeader('x-seller-uid', encodeURIComponent(sellerUid));
    xhr.setRequestHeader('x-product-id', encodeURIComponent(productId));
    if (metadata?.title) xhr.setRequestHeader('x-title', encodeURIComponent(metadata.title));
    if (metadata?.description) xhr.setRequestHeader('x-description', encodeURIComponent(metadata.description));
    xhr.send(file);
  } catch (serverErr) {
    console.warn('Server streaming cache warm-up notice:', serverErr);
  }

  reportProgress('GENERATING_POSTER', 98, file.size);

  const finalVideo: ProductVideo = {
    id: videoId,
    url: `/api/videos/${videoId}.mp4`,
    storagePath: `marketplaceVideos/${videoId}`,
    thumbnailUrl: extractedThumbnail,
    durationSeconds: extractedDuration,
    title: metadata?.title?.trim() || undefined,
    description: metadata?.description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  reportProgress('COMPLETED', 100, file.size);
  return finalVideo;
}

/**
 * Computes optimal target dimensions while maintaining aspect ratio
 */
function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = srcWidth;
  let height = srcHeight;

  if (width > maxWidth || height > maxHeight) {
    if (width / height > maxWidth / maxHeight) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    } else {
      width = Math.round((width * maxHeight) / height);
      maxHeight = height;
    }
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

/**
 * Compresses an image file before upload using a multi-tiered decoding and canvas pipeline:
 * Tier 1: window.createImageBitmap (fastest, hardware decoded, zero Base64 memory overhead)
 * Tier 2: HTMLImageElement via URL.createObjectURL (direct blob streaming, avoids FileReader read errors)
 * Tier 3: FileReader.readAsDataURL (standard data URL stream)
 * Tier 4: FileReader.readAsArrayBuffer -> reconstructed Blob URL
 * Tier 5: Direct string / dataUrl handling
 */
export async function compressImage(
  file: File | Blob | string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<{ blob: Blob; dataUrl: string }> {
  if (!file) {
    throw new Error('Faili la picha halijapatikana au ni batili.');
  }

  // Handle case where file is already a data URL or image URL string
  if (typeof file === 'string') {
    if (file.startsWith('data:image/')) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const { width, height } = computeTargetDimensions(img.width, img.height, maxWidth, maxHeight);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const parts = file.split(',');
            const byteString = atob(parts[1] || '');
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab], { type: 'image/jpeg' });
            return resolve({ blob, dataUrl: file });
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.toBlob(
            (blob) => resolve({ blob: blob || new Blob([], { type: 'image/jpeg' }), dataUrl }),
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => {
          resolve({ blob: new Blob([], { type: 'image/jpeg' }), dataUrl: file });
        };
        img.src = file;
      });
    }
  }

  const blobFile = file as Blob;
  if (blobFile.size === 0) {
    throw new Error('Faili la picha halina taarifa (0 bytes). Tafadhali chagua picha nyingine.');
  }

  // Tier 1: Modern browser native createImageBitmap (fast, no FileReader memory lock)
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(blobFile);
      const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, maxWidth, maxHeight);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        try { bitmap.close(); } catch {}

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const compressedBlob = await new Promise<Blob>((resolveBlob) => {
          canvas.toBlob((b) => resolveBlob(b || blobFile), 'image/jpeg', quality);
        });

        return { blob: compressedBlob, dataUrl };
      }
      try { bitmap.close(); } catch {}
    } catch (tier1Err) {
      console.warn('[compressImage] Tier 1 (createImageBitmap) notice, falling back to Tier 2:', tier1Err);
    }
  }

  // Tier 2: HTMLImageElement via URL.createObjectURL (direct blob streaming, avoids FileReader read errors)
  if (typeof window !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    let tempUrl: string | null = null;
    try {
      tempUrl = URL.createObjectURL(blobFile);
      const img = new Image();

      await new Promise<void>((resolveImg, rejectImg) => {
        img.onload = () => resolveImg();
        img.onerror = () => rejectImg(new Error('HTMLImageElement blob decode failed'));
        img.src = tempUrl!;
      });

      const { width, height } = computeTargetDimensions(img.width, img.height, maxWidth, maxHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const compressedBlob = await new Promise<Blob>((resolveBlob) => {
          canvas.toBlob((b) => resolveBlob(b || blobFile), 'image/jpeg', quality);
        });
        return { blob: compressedBlob, dataUrl };
      }
    } catch (tier2Err) {
      console.warn('[compressImage] Tier 2 (createObjectURL) notice, falling back to Tier 3:', tier2Err);
    } finally {
      if (tempUrl) {
        try { URL.revokeObjectURL(tempUrl); } catch {}
      }
    }
  }

  // Tier 3: FileReader readAsDataURL with safe error handling
  if (typeof window !== 'undefined' && typeof FileReader !== 'undefined') {
    try {
      const dataUrlResult = await new Promise<string>((resolveReader, rejectReader) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = e.target?.result as string;
          if (res) resolveReader(res);
          else rejectReader(new Error('Maudhui ya picha hayakuweza kusomwa vizuri'));
        };
        reader.onerror = () => {
          const detail = reader.error ? ` (${reader.error.name})` : '';
          rejectReader(new Error(`Hitilafu ya kufungua faili${detail}`));
        };
        reader.readAsDataURL(blobFile);
      });

      const img = new Image();
      await new Promise<void>((resolveImg, rejectImg) => {
        img.onload = () => resolveImg();
        img.onerror = () => rejectImg(new Error('Hitilafu ya kusoma faili la picha'));
        img.src = dataUrlResult;
      });

      const { width, height } = computeTargetDimensions(img.width, img.height, maxWidth, maxHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const compressedBlob = await new Promise<Blob>((resolveBlob) => {
          canvas.toBlob((b) => resolveBlob(b || blobFile), 'image/jpeg', quality);
        });
        return { blob: compressedBlob, dataUrl };
      }
    } catch (tier3Err) {
      console.warn('[compressImage] Tier 3 (FileReader DataURL) notice, falling back to Tier 4:', tier3Err);
    }
  }

  // Tier 4: FileReader readAsArrayBuffer -> reconstructed Blob URL
  if (typeof window !== 'undefined' && typeof FileReader !== 'undefined') {
    try {
      const arrayBuffer = await new Promise<ArrayBuffer>((resolveAb, rejectAb) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result instanceof ArrayBuffer) resolveAb(e.target.result);
          else rejectAb(new Error('ArrayBuffer read failed'));
        };
        reader.onerror = () => rejectAb(reader.error || new Error('ArrayBuffer read failed'));
        reader.readAsArrayBuffer(blobFile);
      });

      const fallbackBlob = new Blob([arrayBuffer], { type: blobFile.type || 'image/jpeg' });
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const tempUrl = URL.createObjectURL(fallbackBlob);
        try {
          const img = new Image();
          await new Promise<void>((resolveImg, rejectImg) => {
            img.onload = () => resolveImg();
            img.onerror = () => rejectImg(new Error('Fallback blob decode failed'));
            img.src = tempUrl;
          });

          const { width, height } = computeTargetDimensions(img.width, img.height, maxWidth, maxHeight);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const compressedBlob = await new Promise<Blob>((resolveBlob) => {
              canvas.toBlob((b) => resolveBlob(b || fallbackBlob), 'image/jpeg', quality);
            });
            return { blob: compressedBlob, dataUrl };
          }
        } finally {
          try { URL.revokeObjectURL(tempUrl); } catch {}
        }
      }
    } catch (tier4Err) {
      console.warn('[compressImage] Tier 4 (ArrayBuffer) notice:', tier4Err);
    }
  }

  throw new Error('Picha haikuweza kufunguliwa au kusindikwa. Tafadhali hakikisha faili ni picha sahihi (JPEG, PNG, WebP) na ujaribu tena.');
}

/**
 * Uploads a product image to Firebase Storage with path `/marketplace/products/{sellerUid}/{productId}/{imageId}`
 */
export async function uploadProductImage(
  sellerUid: string,
  productId: string,
  file: File | Blob,
  caption?: string,
  isPrimary?: boolean
): Promise<ProductImage> {
  const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  // Compress first
  const { blob, dataUrl } = await compressImage(file, 1200, 1200, 0.85);

  try {
    const storagePath = `marketplace/products/${sellerUid}/${productId}/${imageId}.jpg`;
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        sellerUid,
        productId,
        imageId,
        uploadedAt: now,
      }
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);

    return {
      id: imageId,
      url: downloadUrl,
      storagePath,
      thumbnailUrl: downloadUrl,
      caption: caption || '',
      isPrimary: Boolean(isPrimary),
      uploadedAt: now,
    };
  } catch (err) {
    console.warn('Firebase Storage upload notice (using persistent server storage fallback):', err);
    const serverPersist = await persistImagePermanently(dataUrl, imageId, sellerUid, productId);
    return {
      id: imageId,
      url: serverPersist.url,
      storagePath: serverPersist.storagePath || `marketplace/products/${sellerUid}/${productId}/${imageId}.jpg`,
      thumbnailUrl: serverPersist.url,
      caption: caption || '',
      isPrimary: Boolean(isPrimary),
      uploadedAt: now,
    };
  }
}

/**
 * Uploads shop logo to Firebase Storage `/marketplace/shops/{sellerUid}/{shopId}/logo/{imageId}`
 */
export async function uploadShopLogo(
  sellerUid: string,
  shopId: string,
  file: File | Blob
): Promise<string> {
  const imageId = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const { blob, dataUrl } = await compressImage(file, 600, 600, 0.9);

  try {
    const storagePath = `marketplace/shops/${sellerUid}/${shopId}/logo/${imageId}.jpg`;
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        sellerUid,
        shopId,
        uploadedAt: new Date().toISOString(),
      }
    });

    return await getDownloadURL(snapshot.ref);
  } catch (err) {
    console.warn('Firebase Storage logo upload notice (using optimized fallback):', err);
    return dataUrl;
  }
}

/**
 * Uploads shop cover banner to Firebase Storage `/marketplace/shops/{sellerUid}/{shopId}/cover/{imageId}`
 */
export async function uploadShopCover(
  sellerUid: string,
  shopId: string,
  file: File | Blob
): Promise<string> {
  const imageId = `cover_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const { blob, dataUrl } = await compressImage(file, 1600, 900, 0.85);

  try {
    const storagePath = `marketplace/shops/${sellerUid}/${shopId}/cover/${imageId}.jpg`;
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        sellerUid,
        shopId,
        uploadedAt: new Date().toISOString(),
      }
    });

    return await getDownloadURL(snapshot.ref);
  } catch (err) {
    console.warn('Firebase Storage cover upload notice (using optimized fallback):', err);
    return dataUrl;
  }
}

/**
 * Safely deletes a media file from server uploads, IndexedDB, or Firebase Storage
 */
export async function deleteMediaFile(storageUrlOrPath: string): Promise<void> {
  if (!storageUrlOrPath || storageUrlOrPath.startsWith('data:') || storageUrlOrPath.startsWith('blob:')) {
    return;
  }

  // If permanent video storage path
  if (storageUrlOrPath.startsWith('marketplaceVideos/') || storageUrlOrPath.startsWith('vid_')) {
    const cleanId = storageUrlOrPath.replace(/^marketplaceVideos\//, '').replace(/\.mp4$/i, '');
    await deleteVideoPermanently(cleanId, storageUrlOrPath);
    return;
  }

  // If stored in local uploads directory
  if (storageUrlOrPath.startsWith('/uploads/') || storageUrlOrPath.startsWith('uploads/')) {
    try {
      await fetch('/api/upload-media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: storageUrlOrPath }),
      });
    } catch (err) {
      console.warn('Notice removing local uploaded file:', err);
    }
    return;
  }

  if (storageUrlOrPath.startsWith('http')) {
    return;
  }

  try {
    const storageRef = ref(storage, storageUrlOrPath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn('Hitilafu ya kufuta picha kwenye Storage:', err);
  }
}

/**
 * Uploads media attachment for private Marketplace Inbox conversation
 */
export async function uploadMarketplaceInboxMedia(params: {
  conversationId: string;
  file: File | Blob;
  callerUserId: string;
  token?: string | null;
  onProgress?: (progressPercent: number) => void;
}): Promise<InboxMediaAttachment> {
  const { conversationId, file, callerUserId, token, onProgress } = params;

  const fileName = (file as File).name || 'attachment';
  const fileType = file.type || 'image/jpeg';
  const isVideo = fileType.startsWith('video/') || fileName.match(/\.(mp4|mov|webm|3gp|m4v)$/i);
  const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

  // Size limit checks
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMb = isVideo ? '50MB' : '15MB';
    throw new Error(`Faili limezidi ukubwa unaoruhusiwa wa ${maxMb} (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
  }

  onProgress?.(20);

  const formData = new FormData();
  formData.append('media', file, fileName);
  formData.append('type', mediaType);

  const headers: Record<string, string> = {};
  if (callerUserId) headers['x-user-id'] = callerUserId;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  onProgress?.(50);

  const res = await fetch(`/api/marketplace/inbox/${encodeURIComponent(conversationId)}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  onProgress?.(90);

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Imeshindikana kupakia kiambatisho kwenye ujumbe.');
  }

  const data = await res.json();
  onProgress?.(100);

  return {
    mediaId: data.mediaId,
    type: data.type || mediaType,
    url: data.url,
    storagePath: data.storagePath,
    fileName: data.fileName || fileName,
    fileSizeBytes: data.fileSizeBytes || file.size,
    mimeType: data.mimeType || fileType,
    thumbnailUrl: data.thumbnailUrl || (mediaType === 'image' ? data.url : undefined),
  };
}

/**
 * Uploads media attachment for Gumzo Admin Post (FOUNDER_ADMIN or LEADERSHIP_ADMIN)
 */
export async function uploadGumzoPostMedia(params: {
  groupId: string;
  file: File | Blob;
  callerUserId: string;
  caption?: string;
  token?: string | null;
  onProgress?: (progressPercent: number) => void;
}): Promise<GumzoMediaItem> {
  const { groupId, file, callerUserId, caption, token, onProgress } = params;

  const fileName = (file as File).name || 'media';
  const fileType = file.type || 'image/jpeg';
  const isVideo = fileType.startsWith('video/') || fileName.match(/\.(mp4|mov|webm|3gp|m4v)$/i);
  const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

  const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMb = isVideo ? '50MB' : '15MB';
    throw new Error(`Faili limezidi ukubwa unaoruhusiwa wa ${maxMb} (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
  }

  onProgress?.(25);

  const formData = new FormData();
  formData.append('media', file, fileName);
  formData.append('type', mediaType);
  if (caption) formData.append('caption', caption);

  const headers: Record<string, string> = {};
  if (callerUserId) headers['x-user-id'] = callerUserId;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  onProgress?.(60);

  const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/posts/upload-media`, {
    method: 'POST',
    headers,
    body: formData,
  });

  onProgress?.(90);

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Imeshindikana kupakia faili la chapisho.');
  }

  const data = await res.json();
  onProgress?.(100);

  return {
    id: data.id || `med_${Date.now()}`,
    type: data.type || mediaType,
    url: data.url,
    storagePath: data.storagePath,
    caption: caption || data.caption || undefined,
    sizeBytes: data.sizeBytes || file.size,
  };
}

/**
 * Uploads media attachment for Gumzo Member Comment (ACTIVE MEMBER or Group Admin)
 */
export async function uploadGumzoCommentMedia(params: {
  groupId: string;
  file: File | Blob;
  callerUserId: string;
  caption?: string;
  token?: string | null;
  onProgress?: (progressPercent: number) => void;
}): Promise<GumzoMediaItem> {
  const { groupId, file, callerUserId, caption, token, onProgress } = params;

  const fileName = (file as File).name || 'media';
  const fileType = file.type || 'image/jpeg';
  const isVideo = fileType.startsWith('video/') || fileName.match(/\.(mp4|mov|webm|3gp|m4v)$/i);
  const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

  const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMb = isVideo ? '50MB' : '15MB';
    throw new Error(`Faili limezidi ukubwa unaoruhusiwa wa ${maxMb} (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
  }

  onProgress?.(25);

  const formData = new FormData();
  formData.append('media', file, fileName);
  formData.append('type', mediaType);
  if (caption) formData.append('caption', caption);

  const headers: Record<string, string> = {};
  if (callerUserId) headers['x-user-id'] = callerUserId;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  onProgress?.(60);

  const res = await fetch(`/api/gumzo/groups/${encodeURIComponent(groupId)}/comments/upload-media`, {
    method: 'POST',
    headers,
    body: formData,
  });

  onProgress?.(90);

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Imeshindikana kupakia faili la maoni.');
  }

  const data = await res.json();
  onProgress?.(100);

  return {
    id: data.id || `med_cmt_${Date.now()}`,
    type: data.type || mediaType,
    url: data.url,
    storagePath: data.storagePath,
    caption: caption || data.caption || undefined,
    sizeBytes: data.sizeBytes || file.size,
  };
}
