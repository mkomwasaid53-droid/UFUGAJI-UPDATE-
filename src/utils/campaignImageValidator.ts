/**
 * Ufugaji Update — Corporate Campaign Management V1.0
 * Secure Banner Creative Validator & Storage Path Utilities
 *
 * Enforces:
 * 1. Strict Magic Bytes content inspection (JPEG, PNG, WebP only).
 * 2. Strict rejection of SVG, HTML, scripts, and executable binaries.
 * 3. File size enforcement (<= 5MB).
 * 4. Path traversal prevention and safe server-controlled object names.
 * 5. Dedicated Storage scoping: campaigns/{campaignId}/{uniqueFileName} or campaigns/drafts/{tempId}/{uniqueFileName}.
 */

import crypto from 'crypto';

export const MAX_CAMPAIGN_BANNER_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_CAMPAIGN_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageMagicValidationResult {
  isValid: boolean;
  format?: 'jpeg' | 'png' | 'webp';
  error?: string;
  code?: string;
}

/**
 * Validates a campaign ID strictly against whitelist regex to prevent path traversal.
 */
export function validateCampaignIdForPath(candidateId: string): boolean {
  if (!candidateId || typeof candidateId !== 'string') return false;
  const trimmed = candidateId.trim();
  // Strictly alphanumeric, underscores, hyphens, starting with cmp_
  return /^cmp_[a-zA-Z0-9_\-]+$/.test(trimmed);
}

/**
 * Inspects buffer magic bytes and leading content to verify true image format
 * and block dangerous disguised payloads (SVG, HTML, PHP/scripts, executables).
 */
export function detectAndValidateImageMagicBytes(buffer: Buffer | Uint8Array): ImageMagicValidationResult {
  if (!buffer || buffer.length < 12) {
    return {
      isValid: false,
      error: 'Faili halina maudhui ya kutosha ya picha halisi.',
      code: 'INVALID_IMAGE_CONTENT'
    };
  }

  // 1. Check for malicious SVG, XML, HTML, or scripts disguised as images
  const sampleLength = Math.min(buffer.length, 2048);
  const headStr = Buffer.from(buffer.buffer, buffer.byteOffset, sampleLength).toString('utf8').toLowerCase();

  if (
    headStr.includes('<svg') ||
    headStr.includes('<?xml') ||
    headStr.includes('xmlns=') ||
    headStr.includes('<html') ||
    headStr.includes('<!doctype') ||
    headStr.includes('<script') ||
    headStr.includes('<?php')
  ) {
    return {
      isValid: false,
      error: 'Faili za picha za SVG, HTML au XML haziruhusiwi kwa sababu za kiusalama. Tumia JPG, PNG, au WebP pekee.',
      code: 'UNSAFE_FILE_CONTENT'
    };
  }

  // 2. Reject executable signatures: MZ (Windows PE), ELF (Linux), Mach-O, ZIP/JAR
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      isValid: false,
      error: 'Faili za programu (executable MZ) haziruhusiwi.',
      code: 'UNSAFE_FILE_CONTENT'
    };
  }
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return {
      isValid: false,
      error: 'Faili za programu (executable ELF) haziruhusiwi.',
      code: 'UNSAFE_FILE_CONTENT'
    };
  }
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return {
      isValid: false,
      error: 'Faili za kumbukumbu (ZIP/Archive) haziruhusiwi kama picha.',
      code: 'UNSAFE_FILE_CONTENT'
    };
  }
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    // Shell shebang '#!'
    return {
      isValid: false,
      error: 'Hati za mifumo (scripts) haziruhusiwi.',
      code: 'UNSAFE_FILE_CONTENT'
    };
  }

  // 3. JPEG: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, format: 'jpeg' };
  }

  // 4. PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, format: 'png' };
  }

  // 5. WebP: 'RIFF' (0x52, 0x49, 0x46, 0x46) and 'WEBP' (0x57, 0x45, 0x42, 0x50) at offset 8..11
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { isValid: true, format: 'webp' };
  }

  return {
    isValid: false,
    error: 'Muundo wa maudhui ya faili haukutambuliwa kama picha halisi ya JPEG, PNG, au WebP.',
    code: 'INVALID_IMAGE_SIGNATURE'
  };
}

/**
 * Generates a safe, server-controlled Storage object path and filename.
 * Prevents path traversal and creative overwrite.
 */
export function generateSafeCampaignStoragePath(
  campaignId?: string | null,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg'
): {
  storagePath: string;
  uniqueFileName: string;
  scopedFolder: string;
  tempUploadId?: string;
} {
  const ext = format === 'jpeg' ? 'jpg' : format;
  const uniqueFileName = `banner_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;

  if (campaignId && validateCampaignIdForPath(campaignId)) {
    const safeCampaignId = campaignId.trim();
    return {
      storagePath: `campaigns/${safeCampaignId}/${uniqueFileName}`,
      uniqueFileName,
      scopedFolder: safeCampaignId
    };
  }

  // Temporary upload for draft creation before campaignId exists
  const tempUploadId = `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    storagePath: `campaigns/drafts/${tempUploadId}/${uniqueFileName}`,
    uniqueFileName,
    scopedFolder: `drafts/${tempUploadId}`,
    tempUploadId
  };
}
