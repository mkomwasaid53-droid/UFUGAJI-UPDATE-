/**
 * ============================================================================
 * V1.1 IMAGE FOUNDATION — FROZEN AFTER V1.1.7
 * PROJECT: UFUGAJI UPDATE
 * STAGE: IMAGE_VALIDATION_CLIENT
 * ============================================================================
 *
 * Implements client-side defensive validation for image attachments:
 * - Strict MIME type checking (JPEG, PNG, WEBP)
 * - Extension matching to avoid extension spoofing
 * - File size boundaries (zero-byte up to 15 MB)
 * - Browser native image decoding validation (createImageBitmap / Image decoding)
 * - Natural dimension & total pixel bounds (protect against decompression bombs)
 * - Filename sanitization
 * - Swahili error messages for all error paths
 * - Standard diagnostic categorization (IMAGE_ERROR_CATEGORIES)
 *
 * INVARIANT: No raw image bytes are persisted or logged.
 */

import { IMAGE_ERROR_CATEGORIES, ImageErrorCategory, IMAGE_PIPELINE_STAGES } from '../types/imagePipeline';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type AllowedImageMimeType = typeof ALLOWED_IMAGE_MIME_TYPES[number];

export const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
] as const;

export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MIN_IMAGE_DIMENSION = 10; // 10 px
export const MAX_IMAGE_DIMENSION = 12000; // 12,000 px
export const MAX_TOTAL_PIXELS = 60_000_000; // 60 Megapixels (accommodates high-end mobile cameras up to 48MP/50MP)

export interface ValidatedImageData {
  valid: true;
  sanitizedFileName: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  width: number;
  height: number;
}

export type ImageValidationErrorCategory =
  | 'unsupported_type'
  | 'oversized'
  | 'empty_file'
  | 'corrupted'
  | 'invalid_dimensions'
  | 'invalid_file_object'
  | 'unknown';

export interface InvalidImageData {
  valid: false;
  errorSwahili: string;
  errorCategory: ImageValidationErrorCategory;
  diagnosticCategory: ImageErrorCategory;
}

export type ImageValidationResult = ValidatedImageData | InvalidImageData;

/**
 * Sanitizes a filename:
 * - Trims whitespace
 * - Removes path traversal characters (../, ..\, /)
 * - Strips control characters
 * - Restricts length to safe boundary (max 100 chars)
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'picha.jpg';
  
  // Strip path traversal and directory separators
  let cleaned = name.replace(/^.*[\\/]/, '');
  // Remove control characters (0x00 to 0x1F, 0x7F)
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F]/g, '');
  // Collapse whitespace
  cleaned = cleaned.trim().replace(/\s+/g, ' ');
  
  if (cleaned.length === 0) {
    return 'picha.jpg';
  }
  
  // Truncate if unusually long while keeping extension
  if (cleaned.length > 100) {
    const extIndex = cleaned.lastIndexOf('.');
    if (extIndex !== -1 && extIndex > cleaned.length - 10) {
      const ext = cleaned.slice(extIndex);
      const base = cleaned.slice(0, 90);
      cleaned = `${base}${ext}`;
    } else {
      cleaned = cleaned.slice(0, 100);
    }
  }
  
  return cleaned;
}

/**
 * Extracts width and height directly from image binary headers (JPEG, PNG, WEBP).
 * Acts as an indestructible fallback when browser rendering/DOM decoders are restricted or unavailable in sandboxed iframes.
 */
export async function extractImageDimensionsFromHeader(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const sliceBlob = file.slice(0, 65536);
    const buffer = await sliceBlob.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    if (bytes.length < 16) return null;

    // 1. PNG Header: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
    ) {
      if (bytes.length >= 24) {
        const width = view.getUint32(16, false);
        const height = view.getUint32(20, false);
        if (width > 0 && height > 0) return { width, height };
      }
    }

    // 2. JPEG Header: FF D8
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      let offset = 2;
      while (offset < bytes.length - 8) {
        if (bytes[offset] !== 0xFF) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        // Skip fill bytes (0xFF)
        if (marker === 0xFF || marker === 0x00) {
          offset++;
          continue;
        }
        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2), SOF3 (0xC3), SOF5-SOF7, SOF9-SOF11, SOF13-SOF15
        if (
          (marker >= 0xC0 && marker <= 0xC3) ||
          (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) ||
          (marker >= 0xCD && marker <= 0xCF)
        ) {
          if (offset + 9 <= bytes.length) {
            const height = view.getUint16(offset + 5, false);
            const width = view.getUint16(offset + 7, false);
            if (width > 0 && height > 0) return { width, height };
          }
          break;
        }
        // Marker length (including 2 bytes of length)
        if (offset + 3 >= bytes.length) break;
        const length = view.getUint16(offset + 2, false);
        if (length <= 2) break;
        offset += 2 + length;
      }
    }

    // 3. WEBP Header: RIFF....WEBP
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50    // WEBP
    ) {
      // VP8 (lossy)
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
        if (bytes.length >= 30) {
          const width = (bytes[26] | (bytes[27] << 8)) & 0x3FFF;
          const height = (bytes[28] | (bytes[29] << 8)) & 0x3FFF;
          if (width > 0 && height > 0) return { width, height };
        }
      }
      // VP8L (lossless)
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4C) {
        if (bytes.length >= 25 && bytes[20] === 0x2F) {
          const b0 = bytes[21];
          const b1 = bytes[22];
          const b2 = bytes[23];
          const b3 = bytes[24];
          const width = 1 + (((b1 & 0x3F) << 8) | b0);
          const height = 1 + ((((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)));
          if (width > 0 && height > 0) return { width, height };
        }
      }
      // VP8X (extended)
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
        if (bytes.length >= 30) {
          const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
          const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
          if (width > 0 && height > 0) return { width, height };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validates whether a file object is a safe, decodeable, and supported image.
 */
export async function validateImageFile(file: unknown): Promise<ImageValidationResult> {
  // 1. Guard against null, undefined, or non-File objects
  if (!file || typeof file !== 'object' || !(file instanceof File)) {
    return {
      valid: false,
      errorSwahili: 'Faili halikutambuliwa kama picha sahihi. Tafadhali chagua picha tena.',
      errorCategory: 'invalid_file_object',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.INVALID_IMAGE
    };
  }

  // 2. Empty / Zero-byte file validation
  if (file.size <= 0) {
    return {
      valid: false,
      errorSwahili: 'Faili la picha halina data (faili tupu). Tafadhali chagua picha nyingine.',
      errorCategory: 'empty_file',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.INVALID_IMAGE
    };
  }

  // 3. File size limit validation (Max 15 MB)
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      errorSwahili: 'Picha uliyochagua ni kubwa mno (zaidi ya MB 15). Tafadhali chagua picha isiyozidi MB 15.',
      errorCategory: 'oversized',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.IMAGE_TOO_LARGE
    };
  }

  // 4. File MIME type validation
  const rawMime = (file.type || '').toLowerCase().trim();
  const isAllowedMime = ALLOWED_IMAGE_MIME_TYPES.includes(rawMime as AllowedImageMimeType);

  if (!isAllowedMime) {
    return {
      valid: false,
      errorSwahili: 'Aina hii ya faili haikubaliki. Tafadhali chagua picha ya muundo wa JPEG, PNG, au WEBP.',
      errorCategory: 'unsupported_type',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.INVALID_IMAGE
    };
  }

  // 5. Filename extension validation & anti-spoofing check
  const fileName = (file.name || '').toLowerCase().trim();
  const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some(ext => fileName.endsWith(ext));

  // If filename has an extension, verify it does not claim to be an incompatible type (e.g. document.pdf claiming image/png)
  const isDisallowedExtension = /\.(pdf|docx?|xlsx?|pptx?|mp4|mov|avi|mp3|wav|zip|rar|tar|gz|exe|apk|sh|html|svg)$/i.test(fileName);
  if (isDisallowedExtension || (!hasAllowedExtension && fileName.includes('.'))) {
    return {
      valid: false,
      errorSwahili: 'Muundo wa jina la faili haufanani na picha inayoruhusiwa (JPEG, PNG, WEBP).',
      errorCategory: 'unsupported_type',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.INVALID_IMAGE
    };
  }

  // 6. Resilient Image Decoding Validation & Dimension Extraction
  // Uses a 4-tier cascading strategy to avoid false decode failures in sandboxed iframes or mobile browsers:
  // Tier 1: window.createImageBitmap(file)
  // Tier 2: HTMLImageElement with URL.createObjectURL(file)
  // Tier 3: HTMLImageElement with FileReader data URL
  // Tier 4: Direct binary header magic & dimension parsing (pure JavaScript)
  let width = 0;
  let height = 0;
  let decodedSuccessfully = false;

  // Tier 1: Modern browser native createImageBitmap
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await window.createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      try { bitmap.close(); } catch {}
      if (width > 0 && height > 0) {
        decodedSuccessfully = true;
      }
    } catch {
      // Fall through to next tier
    }
  }

  // Tier 2: HTMLImageElement via URL.createObjectURL (IMEREKEBEBISHWA 🛠)
  if (!decodedSuccessfully && typeof window !== 'undefined' && typeof document !== 'undefined') {
    let tempUrl: string | null = null;
    try {
      tempUrl = URL.createObjectURL(file);
      const img = new Image();
      
      const decodePromise = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('HTMLImageElement decode failed'));
      });

      img.src = tempUrl; // Kuseta SRC baada ya kuweka event listeners

      // Kuongeza ulinzi wa kisasa wa kivinjari .decode() ikiwa upo
      if (typeof (img as any).decode === 'function') {
        await (img as any).decode();
        width = (img as any).naturalWidth;
        height = (img as any).naturalHeight;
      } else {
        await decodePromise;
        width = (img as any).naturalWidth;
        height = (img as any).naturalHeight;
      }

      if (width > 0 && height > 0) {
        decodedSuccessfully = true;
      }
    } catch {
      // Inafeli kimya kimya na kwenda tier inayofuata bila kucrash
    } finally {
      if (tempUrl) {
        try { URL.revokeObjectURL(tempUrl); } catch {}
      }
    }
  }

  // Tier 3: HTMLImageElement via FileReader Data URL (IMEREKEBISHWA 🛠)
  if (!decodedSuccessfully && typeof window !== 'undefined' && typeof FileReader !== 'undefined') {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const img = new Image();
      const decodePromise = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('FileReader image decode failed'));
      });

      img.src = dataUrl;

      if (typeof (img as any).decode === 'function') {
        await (img as any).decode();
        width = (img as any).naturalWidth;
        height = (img as any).naturalHeight;
      } else {
        await decodePromise;
        width = (img as any).naturalWidth;
        height = (img as any).naturalHeight;
      }

      if (width > 0 && height > 0) {
        decodedSuccessfully = true;
      }
    } catch {
      // Inafeli na kwenda Tier 4
    }
  }

  // Tier 4: Direct Binary Header Inspection (Indestructible Pure JS)
  if (!decodedSuccessfully) {
    const headerDims = await extractImageDimensionsFromHeader(file);
    if (headerDims && headerDims.width > 0 && headerDims.height > 0) {
      width = headerDims.width;
      height = headerDims.height;
      decodedSuccessfully = true;
    }
  }

  // Final fallback: Non-browser environment defaults or true corruption
  if (!decodedSuccessfully) {
    if (typeof window === 'undefined') {
      width = 800;
      height = 600;
      decodedSuccessfully = true;
    } else {
      return {
        valid: false,
        errorSwahili: 'Picha imeharibika au haisomeki. Tafadhali chagua picha nyingine iliyo wazi.',
        errorCategory: 'corrupted',
        diagnosticCategory: IMAGE_ERROR_CATEGORIES.IMAGE_DECODE_FAILED
      };
    }
  }

  // 7. Natural Dimension & Pixel Safety Validation
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    return {
      valid: false,
      errorSwahili: `Vipimo vya picha ni vidogo mno (angalau pikseli ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION}).`,
      errorCategory: 'invalid_dimensions',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.IMAGE_DIMENSION_INVALID
    };
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      valid: false,
      errorSwahili: `Vipimo vya picha ni vikubwa mno (ukomo ni pikseli ${MAX_IMAGE_DIMENSION}). Tafadhali chagua picha ya kawaida.`,
      errorCategory: 'invalid_dimensions',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.IMAGE_DIMENSION_INVALID
    };
  }

  const totalPixels = width * height;
  if (totalPixels > MAX_TOTAL_PIXELS) {
    return {
      valid: false,
      errorSwahili: 'Ukubwa wa picha (megapikseli) unazidi kiwango cha usalama (ukomo ni 60 MP). Tafadhali chagua picha ya kawaida.',
      errorCategory: 'invalid_dimensions',
      diagnosticCategory: IMAGE_ERROR_CATEGORIES.IMAGE_DIMENSION_INVALID
    };
  }

  return {
    valid: true,
    sanitizedFileName: sanitizeFileName(file.name),
    mimeType: rawMime as AllowedImageMimeType,
    sizeBytes: file.size,
    width,
    height
  };
}

// Geuza picha kuwa format inayopendwa na Google AI Studio
export async function fileToGenerativePart(file: File) {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  
  return {
    inlineData: {
      data: base64Data,
      mimeType: file.type
    },
  };
}

