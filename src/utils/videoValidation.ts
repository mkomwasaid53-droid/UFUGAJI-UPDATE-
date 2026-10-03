/**
 * ============================================================================
 * V1.2A VIDEO INPUT FOUNDATION
 * PROJECT: UFUGAJI UPDATE
 * STAGE: VIDEO_VALIDATION_CLIENT
 * ============================================================================
 * 
 * Implements client-side defensive validation for video attachments:
 * - Basic MIME type and file extension verification
 * - File size boundary checking (0 < size <= 50MB)
 * - Safe browser metadata extraction (duration, width, height)
 * - Duration limit enforcement (<= 180 seconds / 3 minutes)
 * - Filename sanitization
 * - Swahili-first guidance for all error pathways
 * 
 * INVARIANTS:
 * - V1.2A client input limits only (processing constraints established in V1.2B)
 * - Zero raw video bytes, frames, or audio streams are persisted or logged.
 */

import {
  AiVideoAttachment,
  VIDEO_ERROR_CATEGORIES,
  VideoErrorCategory,
  VIDEO_PIPELINE_STAGES,
} from '../types/videoPipeline';

/**
 * V1.2A client input limits (placeholders for foundation)
 */
export const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const VIDEO_MAX_DURATION_SECONDS = 180; // 3 minutes (180 seconds)

export const ALLOWED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.webm',
  '.3gp',
  '.m4v',
  '.ogv',
  '.ogg',
] as const;

export interface ValidatedVideoData {
  valid: true;
  attachment: AiVideoAttachment;
}

export type VideoValidationErrorCategory =
  | 'unsupported_type'
  | 'oversized'
  | 'oversized_duration'
  | 'empty_file'
  | 'corrupted'
  | 'invalid_file_object'
  | 'unknown';

export interface InvalidVideoData {
  valid: false;
  errorSwahili: string;
  errorCategory: VideoValidationErrorCategory;
  diagnosticCategory: VideoErrorCategory;
}

export type VideoValidationResult = ValidatedVideoData | InvalidVideoData;

/**
 * Format bytes into human-readable string (KB, MB)
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration in seconds to mm:ss format
 */
export function formatVideoDuration(seconds?: number): string {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Sanitizes a video filename:
 * - Trims whitespace
 * - Removes path traversal characters (../, ..\, /)
 * - Strips control characters
 * - Restricts length to safe boundary (max 100 chars)
 */
export function sanitizeVideoFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'video_mfugaji.mp4';

  let cleaned = name.replace(/^.*[\\/]/, '');
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F]/g, '');
  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  if (cleaned.length === 0) {
    return 'video_mfugaji.mp4';
  }

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
 * Inspects video metadata safely in the browser using HTML5 Video element
 */
async function extractVideoMetadata(
  objectUrl: string
): Promise<{ duration?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    // Timeout safeguard after 5 seconds to prevent hanging on malformed files
    const timer = setTimeout(() => {
      resolve({});
    }, 5000);

    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const cleanUp = () => {
        clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
      };

      video.onloadedmetadata = () => {
        const duration = isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 10) / 10 : undefined;
        const width = video.videoWidth > 0 ? video.videoWidth : undefined;
        const height = video.videoHeight > 0 ? video.videoHeight : undefined;
        cleanUp();
        resolve({ duration, width, height });
      };

      video.onerror = () => {
        cleanUp();
        resolve({});
      };

      video.src = objectUrl;
    } catch {
      clearTimeout(timer);
      resolve({});
    }
  });
}

/**
 * Validates a video file selected by the user:
 * 1. Checks file presence and instance
 * 2. Checks size > 0 and <= 50MB
 * 3. Checks video MIME type or common video extensions
 * 4. Extracts metadata (duration, dimensions)
 * 5. Enforces duration limit <= 180s
 */
export async function validateVideoFile(file: unknown): Promise<VideoValidationResult> {
  // 1. File object validity
  if (!file || !(file instanceof File)) {
    return {
      valid: false,
      errorSwahili: 'Faili ya video iliyochaguliwa si sahihi. Tafadhali jaribu kuchagua tena.',
      errorCategory: 'invalid_file_object',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.INVALID_VIDEO,
    };
  }

  // 2. Empty file check
  if (file.size === 0) {
    return {
      valid: false,
      errorSwahili: 'Faili ya video haina data au haikuweza kusomeka (Zero-byte file). Tafadhali jaribu video nyingine.',
      errorCategory: 'empty_file',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_EMPTY_FILE,
    };
  }

  // 3. File size limit
  if (file.size > VIDEO_MAX_SIZE_BYTES) {
    const formattedSize = formatBytes(file.size);
    const limitFormatted = formatBytes(VIDEO_MAX_SIZE_BYTES);
    return {
      valid: false,
      errorSwahili: `Ukubwa wa video (${formattedSize}) unazidi ukomo unaoruhusiwa wa ${limitFormatted}. Tafadhali chagua video fupi au ndogo zaidi.`,
      errorCategory: 'oversized',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_TOO_LARGE,
    };
  }

  // 4. MIME type and Extension check
  const rawMime = (file.type || '').toLowerCase().trim();
  const rawName = (file.name || '').toLowerCase().trim();
  const hasVideoMime = rawMime.startsWith('video/');
  const hasAllowedExt = ALLOWED_VIDEO_EXTENSIONS.some((ext) => rawName.endsWith(ext));

  if (!hasVideoMime && !hasAllowedExt) {
    return {
      valid: false,
      errorSwahili: 'Aina hii ya faili haikubaliki kama video. Tafadhali tumia miundo ya kawaida kama MP4, WebM au MOV.',
      errorCategory: 'unsupported_type',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.UNSUPPORTED_TYPE,
    };
  }

  const sanitizedFileName = sanitizeVideoFileName(file.name);
  const normalizedMime = hasVideoMime ? rawMime : 'video/mp4';

  // 5. Create temporary preview URL for browser metadata inspection
  let previewUrl = '';
  try {
    previewUrl = URL.createObjectURL(file);
  } catch (err) {
    return {
      valid: false,
      errorSwahili: 'Kivinjari kimeshindwa kuandaa video hii kwa ukaguzi wa awali. Tafadhali jaribu tena.',
      errorCategory: 'corrupted',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_DECODE_FAILED,
    };
  }

  const { duration, width, height } = await extractVideoMetadata(previewUrl);

  // 6. Enforce duration limit if duration was determinable
  if (duration !== undefined && duration > VIDEO_MAX_DURATION_SECONDS) {
    URL.revokeObjectURL(previewUrl);
    const durMins = (VIDEO_MAX_DURATION_SECONDS / 60).toFixed(0);
    return {
      valid: false,
      errorSwahili: `Muda wa video (${formatVideoDuration(duration)}) unazidi ukomo wa dakika ${durMins} (sekunde ${VIDEO_MAX_DURATION_SECONDS}). Tafadhali chagua au punguza video iwe fupi zaidi.`,
      errorCategory: 'oversized_duration',
      diagnosticCategory: VIDEO_ERROR_CATEGORIES.VIDEO_TOO_LONG,
    };
  }

  const id = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    valid: true,
    attachment: {
      id,
      fileName: sanitizedFileName,
      mimeType: normalizedMime,
      fileSize: file.size,
      duration,
      width,
      height,
      localPreviewUrl: previewUrl,
    },
  };
}
