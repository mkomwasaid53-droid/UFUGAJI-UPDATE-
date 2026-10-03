import fs from 'fs';
import {
  VIDEO_PROCESSING_LIMITS,
  ALLOWED_VIDEO_MIME_TYPES,
  VIDEO_ERROR_CATEGORIES,
  VideoErrorCategory,
} from '../types/videoPipeline';

/**
 * ============================================================================
 * V1.2B — SERVER-SIDE VIDEO VALIDATOR
 * PROJECT: UFUGAJI UPDATE
 * ============================================================================
 * 
 * Server-side independent video binary validator.
 * Enforces magic-byte signature checking, file size verification,
 * metadata range validation, and safe temporary file inspection.
 * 
 * INVARIANTS:
 * - Client validation is NOT trusted.
 * - Entire video is NEVER read into memory; only the initial header bytes (up to 256)
 *   are sampled for format signature validation.
 * - No raw video bytes or base64 data are logged.
 */

export interface ServerVideoValidationSuccess {
  valid: true;
  detectedMime: 'video/mp4' | 'video/webm' | 'video/quicktime' | 'video/3gpp';
  formatName: string;
  fileSize: number;
  serverMetadataVerified: boolean;
}

export interface ServerVideoValidationFailure {
  valid: false;
  error: string;
  diagnosticCategory: VideoErrorCategory;
  stage: 'VIDEO_VALIDATION_SERVER' | 'VIDEO_METADATA_VALIDATION';
}

export type ServerVideoValidationResult =
  | ServerVideoValidationSuccess
  | ServerVideoValidationFailure;

/**
 * Reads up to `maxBytes` from the start of a file without loading the entire file into memory.
 */
function readHeaderBytes(filePath: string, maxBytes = 256): Buffer | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    fs.closeSync(fd);
    if (bytesRead <= 0) return null;
    return buffer.subarray(0, bytesRead);
  } catch (err) {
    console.error('[VideoServerValidator] Failed to read header bytes from temporary file');
    return null;
  }
}

/**
 * Validates the video binary from disk via signature / magic byte inspection.
 */
export function validateVideoFile(
  filePath: string,
  actualSizeBytes: number
): ServerVideoValidationResult {
  // 1. Existence and size verification
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      valid: false,
      error: 'Faili la video halipatikani kwenye seva.',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.INVALID_VIDEO,
      stage: 'VIDEO_VALIDATION_SERVER',
    };
  }

  if (actualSizeBytes <= 0) {
    return {
      valid: false,
      error: 'Faili la video halina data yoyote (Zero-byte payload).',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_EMPTY_FILE,
      stage: 'VIDEO_VALIDATION_SERVER',
    };
  }

  if (actualSizeBytes > VIDEO_PROCESSING_LIMITS.MAX_VIDEO_SIZE) {
    return {
      valid: false,
      error: `Ukubwa wa video umezidi kiwango kinachoruhusiwa (upeo ni MB ${VIDEO_PROCESSING_LIMITS.MAX_VIDEO_SIZE / (1024 * 1024)}).`,
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_SIZE_LIMIT_EXCEEDED,
      stage: 'VIDEO_VALIDATION_SERVER',
    };
  }

  // 2. Read first 256 bytes for magic-byte signature check
  const header = readHeaderBytes(filePath, 256);
  if (!header || header.length < 12) {
    return {
      valid: false,
      error: 'Faili la video ni fupi sana au limeharibika.',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_CONTENT_INVALID,
      stage: 'VIDEO_VALIDATION_SERVER',
    };
  }

  // 3. WebM format detection (EBML header)
  // EBML ID: 0x1A 0x45 0xDF 0xA3
  if (
    header.length >= 4 &&
    header[0] === 0x1A &&
    header[1] === 0x45 &&
    header[2] === 0xDF &&
    header[3] === 0xA3
  ) {
    // Scan up to byte 64 for "webm" DocType
    const headerStr = header.toString('latin1', 4, Math.min(header.length, 64));
    if (headerStr.includes('webm')) {
      return {
        valid: true,
        detectedMime: 'video/webm',
        formatName: 'WebM Video (EBML)',
        fileSize: actualSizeBytes,
        serverMetadataVerified: true,
      };
    }
    // Generic Matroska / WebM
    return {
      valid: true,
      detectedMime: 'video/webm',
      formatName: 'WebM / Matroska Video',
      fileSize: actualSizeBytes,
      serverMetadataVerified: true,
    };
  }

  // 4. ISO Base Media File Format (MP4 / QuickTime / 3GP)
  // Standard ISOBMFF starts with a box: [4-byte size][4-byte type]
  const boxType = header.toString('ascii', 4, 8);

  if (boxType === 'ftyp') {
    // Read major brand from bytes 8..12
    const majorBrand = header.toString('ascii', 8, 12).trim().toLowerCase();
    // Scan compatible brands list up to byte 128
    const compatibleBrands = header.toString('ascii', 16, Math.min(header.length, 128)).toLowerCase();

    // Check for 3GP brands
    if (
      majorBrand.startsWith('3gp') ||
      majorBrand.startsWith('3g2') ||
      majorBrand === 'kddi' ||
      compatibleBrands.includes('3gp')
    ) {
      return {
        valid: true,
        detectedMime: 'video/3gpp',
        formatName: `3GPP Video (${majorBrand})`,
        fileSize: actualSizeBytes,
        serverMetadataVerified: true,
      };
    }

    // Check for QuickTime brand
    if (majorBrand === 'qt  ' || majorBrand === 'qt') {
      return {
        valid: true,
        detectedMime: 'video/quicktime',
        formatName: 'Apple QuickTime Movie',
        fileSize: actualSizeBytes,
        serverMetadataVerified: true,
      };
    }

    // Standard MP4 brands: isom, iso2, mp41, mp42, avc1, m4v, dash, etc.
    const isMp4 =
      majorBrand.includes('iso') ||
      majorBrand.includes('mp4') ||
      majorBrand.includes('avc') ||
      majorBrand.includes('m4v') ||
      compatibleBrands.includes('isom') ||
      compatibleBrands.includes('mp41') ||
      compatibleBrands.includes('mp42');

    if (isMp4) {
      return {
        valid: true,
        detectedMime: 'video/mp4',
        formatName: `MPEG-4 Part 14 (${majorBrand})`,
        fileSize: actualSizeBytes,
        serverMetadataVerified: true,
      };
    }

    // Fallback valid ftyp container: treat as mp4
    return {
      valid: true,
      detectedMime: 'video/mp4',
      formatName: `ISOBMFF Video (${majorBrand})`,
      fileSize: actualSizeBytes,
      serverMetadataVerified: true,
    };
  }

  // QuickTime MOV without ftyp (older format starting with moov, mdat, wide)
  if (['moov', 'mdat', 'wide', 'free', 'skip'].includes(boxType)) {
    return {
      valid: true,
      detectedMime: 'video/quicktime',
      formatName: `QuickTime Container (${boxType})`,
      fileSize: actualSizeBytes,
      serverMetadataVerified: true,
    };
  }

  // Invalid signature / unknown binary format
  return {
    valid: false,
    error: 'Aina ya faili la video haikubaliki au faili limetiwa dosari. Tafadhali tumia MP4, WebM, MOV au 3GP.',
    diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_CONTENT_INVALID,
    stage: 'VIDEO_VALIDATION_SERVER',
  };
}

/**
 * Validates and sanitizes client-provided video metadata parameters.
 * Does not blindly trust client metadata.
 */
export function sanitizeAndValidateVideoMetadata(rawMetadata: any): {
  valid: boolean;
  sanitized?: {
    id?: string;
    fileName: string;
    duration?: number;
    width?: number;
    height?: number;
  };
  error?: string;
  diagnosticCategory?: VideoErrorCategory;
} {
  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return {
      valid: true,
      sanitized: { fileName: 'video_mfugaji.mp4' },
    };
  }

  // Defensive check: Reject raw binary/base64 injected into metadata
  if ('data' in rawMetadata || 'base64' in rawMetadata || 'buffer' in rawMetadata || 'blob' in rawMetadata) {
    return {
      valid: false,
      error: 'Maudhui ghafi ya video (raw bytes/base64) hayaruhusiwi kwenye sehemu ya metadata.',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_METADATA_INVALID,
    };
  }

  // Sanitize file name: remove path traversal, directory separators, and control characters
  let cleanFileName = 'video_mfugaji.mp4';
  if (typeof rawMetadata.fileName === 'string' && rawMetadata.fileName.trim().length > 0) {
    cleanFileName = rawMetadata.fileName
      .replace(/^.*[\\/]/, '') // remove path prefixes
      .replace(/[\u0000-\u001F\u007F]/g, '') // remove control chars
      .trim()
      .slice(0, 100);
    if (!cleanFileName) cleanFileName = 'video_mfugaji.mp4';
  }

  let duration: number | undefined;
  if (rawMetadata.duration !== undefined) {
    if (typeof rawMetadata.duration !== 'number' || !Number.isFinite(rawMetadata.duration) || rawMetadata.duration <= 0) {
      return {
        valid: false,
        error: 'Urefu wa muda wa video si sahihi (Invalid duration).',
        diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_METADATA_INVALID,
      };
    }
    if (rawMetadata.duration > VIDEO_PROCESSING_LIMITS.MAX_VIDEO_DURATION) {
      return {
        valid: false,
        error: `Urefu wa video umezidi kiwango cha dakika ${VIDEO_PROCESSING_LIMITS.MAX_VIDEO_DURATION / 60} (sekunde ${VIDEO_PROCESSING_LIMITS.MAX_VIDEO_DURATION}). Tafadhali chagua video fupi.`,
        diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_DURATION_LIMIT_EXCEEDED,
      };
    }
    duration = Math.round(rawMetadata.duration * 10) / 10;
  }

  let width: number | undefined;
  let height: number | undefined;

  if (rawMetadata.width !== undefined) {
    if (typeof rawMetadata.width !== 'number' || !Number.isFinite(rawMetadata.width) || rawMetadata.width <= 0) {
      return {
        valid: false,
        error: 'Upana wa video si sahihi (Invalid width).',
        diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_METADATA_INVALID,
      };
    }
    if (rawMetadata.width > VIDEO_PROCESSING_LIMITS.MAX_VIDEO_WIDTH) {
      return {
        valid: false,
        error: `Upana wa video umezidi ukomo wa ${VIDEO_PROCESSING_LIMITS.MAX_VIDEO_WIDTH}px.`,
        diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_DIMENSION_LIMIT_EXCEEDED,
      };
    }
    width = Math.round(rawMetadata.width);
  }

  if (rawMetadata.height !== undefined) {
    if (typeof rawMetadata.height !== 'number' || !Number.isFinite(rawMetadata.height) || rawMetadata.height <= 0) {
      return {
        valid: false,
        error: 'Urefu wa vipimo vya video si sahihi (Invalid height).',
        diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_METADATA_INVALID,
      };
    }
    if (rawMetadata.height > VIDEO_PROCESSING_LIMITS.MAX_VIDEO_HEIGHT) {
      return {
        valid: false,
        error: `Urefu wa vipimo vya video umezidi ukomo wa ${VIDEO_PROCESSING_LIMITS.MAX_VIDEO_HEIGHT}px.`,
        diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_DIMENSION_LIMIT_EXCEEDED,
      };
    }
    height = Math.round(rawMetadata.height);
  }

  return {
    valid: true,
    sanitized: {
      id: typeof rawMetadata.id === 'string' ? rawMetadata.id.slice(0, 50) : undefined,
      fileName: cleanFileName,
      duration,
      width,
      height,
    },
  };
}
