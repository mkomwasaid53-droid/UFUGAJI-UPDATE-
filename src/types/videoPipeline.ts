/**
 * ============================================================================
 * V1.2 VIDEO FOUNDATION — FROZEN AFTER V1.2E
 * PROJECT: UFUGAJI UPDATE
 * ============================================================================
 * 
 * Defines the diagnostic boundaries, stages, limits, error categorization,
 * and transport contracts for Ufugaji Update AI Video Processing.
 * 
 * ARCHITECTURAL INVARIANTS (FROZEN FOUNDATION):
 * 1. Raw video data is transported strictly as binary multipart/form-data.
 * 2. NO BASE64 video anywhere (neither in React state, Firestore, localStorage,
 *    sessionStorage, query strings, nor logs).
 * 3. Raw video data is strictly temporary state and NEVER persisted
 *    (neither in Firestore, permanent disk, nor Cloud Storage).
 * 4. Temporary server files are stored with randomized names in os.tmpdir() and
 *    guaranteed deleted in finally block after processing, failure, or timeout.
 * 5. Gemini video understanding belongs strictly to V1.2C/V1.2E with prompt injection
 *    defense, temporal awareness, observation/inference separation, and veterinary safety.
 * 6. Mutual exclusion: at most ONE media attachment (1 image OR 1 video) per message.
 * 7. FarmerContext and Marketplace remain strictly read-only and decoupled from video input.
 * 8. This video foundation is FROZEN after V1.2E and should not be casually altered.
 */

export const VIDEO_FOUNDATION_STATUS = 'V1.2_VIDEO_FOUNDATION_FROZEN_AFTER_V1.2E' as const;

export const VIDEO_PIPELINE_STAGES = {
  VIDEO_INPUT: 'VIDEO_INPUT',
  VIDEO_VALIDATION_CLIENT: 'VIDEO_VALIDATION_CLIENT',
  VIDEO_PREVIEW: 'VIDEO_PREVIEW',
  VIDEO_ATTACHMENT: 'VIDEO_ATTACHMENT',
  VIDEO_PROCESSING_PREPARE: 'VIDEO_PROCESSING_PREPARE',
  VIDEO_TRANSPORT: 'VIDEO_TRANSPORT',
  VIDEO_VALIDATION_SERVER: 'VIDEO_VALIDATION_SERVER',
  VIDEO_METADATA_VALIDATION: 'VIDEO_METADATA_VALIDATION',
  VIDEO_TEMPORARY_PROCESSING: 'VIDEO_TEMPORARY_PROCESSING',
  VIDEO_READY_FOR_MODEL: 'VIDEO_READY_FOR_MODEL',
  VIDEO_MODEL_PREPARATION: 'VIDEO_MODEL_PREPARATION',
  GEMINI_VIDEO_UPLOAD: 'GEMINI_VIDEO_UPLOAD',
  GEMINI_VIDEO_UPLOAD_OR_INPUT: 'GEMINI_VIDEO_UPLOAD_OR_INPUT',
  GEMINI_VIDEO_UNDERSTANDING: 'GEMINI_VIDEO_UNDERSTANDING',
  AI_RESPONSE_VALIDATION: 'AI_RESPONSE_VALIDATION',
  VIDEO_CONVERSATION_INTEGRATION: 'VIDEO_CONVERSATION_INTEGRATION',
  VIDEO_RENDERING: 'VIDEO_RENDERING',
  VIDEO_PERSISTENCE_METADATA: 'VIDEO_PERSISTENCE_METADATA',
  VIDEO_CLEANUP: 'VIDEO_CLEANUP',
  VIDEO_STATE: 'VIDEO_STATE',
} as const;

export type VideoPipelineStage = typeof VIDEO_PIPELINE_STAGES[keyof typeof VIDEO_PIPELINE_STAGES];

/**
 * Configurable, centralized limits for video processing (V1.2B / V1.2C)
 */
export const VIDEO_PROCESSING_LIMITS = {
  MAX_VIDEO_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_VIDEO_DURATION: 180, // 180 seconds (3 minutes)
  MAX_VIDEO_WIDTH: 1920,
  MAX_VIDEO_HEIGHT: 1080,
  MAX_VIDEO_PIXELS: 1920 * 1080, // 2,073,600 px
  PROCESSING_TIMEOUT_MS: 75000, // 75 seconds transport, Gemini upload & multimodal reasoning timeout
  MAX_CONCURRENT_VIDEO_PROCESSING: 5, // Server-level concurrency ceiling
} as const;

/**
 * Supported video MIME types across client and server
 */
export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
] as const;

/**
 * Standardized internal video error categories for diagnostics and logging.
 * End users are shown gentle, non-technical Swahili guidance.
 */
export const VIDEO_ERROR_CATEGORIES = {
  INVALID_VIDEO: 'INVALID_VIDEO',
  VIDEO_TOO_LARGE: 'VIDEO_TOO_LARGE',
  VIDEO_TOO_LONG: 'VIDEO_TOO_LONG',
  VIDEO_DECODE_FAILED: 'VIDEO_DECODE_FAILED',
  VIDEO_EMPTY_FILE: 'VIDEO_EMPTY_FILE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  VIDEO_MUTUAL_EXCLUSION: 'VIDEO_MUTUAL_EXCLUSION',
  VIDEO_STATE_FAILED: 'VIDEO_STATE_FAILED',
  VIDEO_PROCESSING_FAILED: 'VIDEO_PROCESSING_FAILED',
  VIDEO_TRANSPORT_FAILED: 'VIDEO_TRANSPORT_FAILED',
  VIDEO_SERVER_VALIDATION_FAILED: 'VIDEO_SERVER_VALIDATION_FAILED',
  VIDEO_SIZE_LIMIT_EXCEEDED: 'VIDEO_SIZE_LIMIT_EXCEEDED',
  VIDEO_TYPE_REJECTED: 'VIDEO_TYPE_REJECTED',
  VIDEO_CONTENT_INVALID: 'VIDEO_CONTENT_INVALID',
  VIDEO_METADATA_INVALID: 'VIDEO_METADATA_INVALID',
  VIDEO_DURATION_LIMIT_EXCEEDED: 'VIDEO_DURATION_LIMIT_EXCEEDED',
  VIDEO_DIMENSION_LIMIT_EXCEEDED: 'VIDEO_DIMENSION_LIMIT_EXCEEDED',
  VIDEO_TIMEOUT: 'VIDEO_TIMEOUT',
  VIDEO_ABORTED: 'VIDEO_ABORTED',
  VIDEO_CLEANUP_FAILED: 'VIDEO_CLEANUP_FAILED',
  VIDEO_CONCURRENCY_LIMIT: 'VIDEO_CONCURRENCY_LIMIT',
  // V1.2C AI Video Understanding error categories
  VIDEO_MODEL_UNSUPPORTED: 'VIDEO_MODEL_UNSUPPORTED',
  VIDEO_MODEL_INPUT_FAILED: 'VIDEO_MODEL_INPUT_FAILED',
  VIDEO_MODEL_UPLOAD_FAILED: 'VIDEO_MODEL_UPLOAD_FAILED',
  VIDEO_MODEL_PROCESSING_FAILED: 'VIDEO_MODEL_PROCESSING_FAILED',
  VIDEO_MODEL_TIMEOUT: 'VIDEO_MODEL_TIMEOUT',
  VIDEO_MODEL_RESPONSE_FAILED: 'VIDEO_MODEL_RESPONSE_FAILED',
  VIDEO_RESPONSE_INVALID: 'VIDEO_RESPONSE_INVALID',
} as const;

export type VideoErrorCategory = typeof VIDEO_ERROR_CATEGORIES[keyof typeof VIDEO_ERROR_CATEGORIES];

/**
 * Video processing lifecycle state machine
 */
export type VideoProcessingLifecycle =
  | 'IDLE'
  | 'SELECTED'
  | 'CLIENT_VALIDATING'
  | 'CLIENT_VALID'
  | 'PREPARING'
  | 'TRANSPORTING'
  | 'SERVER_VALIDATING'
  | 'READY_FOR_MODEL'
  | 'CLEANUP'
  | 'ERROR';

/**
 * Video input lifecycle state machine for V1.2A/V1.2B backward compatibility
 */
export type VideoInputState =
  | 'NO_VIDEO'
  | 'VIDEO_SELECTING'
  | 'VIDEO_VALIDATING'
  | 'VIDEO_READY'
  | 'VIDEO_ERROR';

/**
 * First-class AI Video Attachment model.
 * localPreviewUrl is strictly temporary client-side memory (blob: URL) and
 * MUST NEVER be persisted to Firestore.
 */
export interface AiVideoAttachment {
  id: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  sizeBytes?: number;
  duration?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  localPreviewUrl?: string;
  videoAvailableForModel?: boolean;
}

/**
 * Safe video metadata structure allowed in persistent Firestore documents.
 * Explicitly excludes localPreviewUrl, blobs, buffers, and raw bytes.
 */
export interface PersistedVideoMetadata {
  id?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  sizeBytes?: number;
  duration?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  videoAvailableForModel?: boolean;
}

/**
 * Clean descriptor produced by V1.2B for future V1.2C consumption.
 */
export interface VideoProcessingResult {
  status: 'READY_FOR_MODEL';
  stage: 'VIDEO_READY_FOR_MODEL';
  validated: boolean;
  mimeType: string;
  fileSize: number;
  duration?: number;
  width?: number;
  height?: number;
  temporaryReference?: string;
  serverProcessingTimeMs?: number;
  serverValidationDetails?: {
    signatureVerified: boolean;
    format: string;
  };
}

/**
 * Friendly Swahili error message mapping for end users
 */
export function mapVideoErrorToSwahili(category?: string | null, fallbackMessage?: string): string {
  switch (category) {
    case 'VIDEO_TRANSPORT_FAILED':
      return 'Video haikutumwa vizuri kutokana na hitilafu ya mtandao. Tafadhali jaribu tena.';
    case 'VIDEO_TIMEOUT':
      return 'Video imechukua muda mrefu sana kuchakatwa. Tafadhali jaribu video fupi au ujaribu tena.';
    case 'VIDEO_SERVER_VALIDATION_FAILED':
    case 'VIDEO_CONTENT_INVALID':
      return 'Video hii haijaweza kuthibitishwa na mfumo. Tafadhali chagua video nyingine.';
    case 'VIDEO_SIZE_LIMIT_EXCEEDED':
    case 'VIDEO_TOO_LARGE':
      return 'Ukubwa wa video umezidi kiwango kinachoruhusiwa (upeo ni MB 50). Tafadhali chagua video ndogo zaidi.';
    case 'VIDEO_DURATION_LIMIT_EXCEEDED':
    case 'VIDEO_TOO_LONG':
      return 'Urefu wa video umezidi kiwango cha dakika 3 (sekunde 180). Tafadhali chagua video fupi.';
    case 'VIDEO_DIMENSION_LIMIT_EXCEEDED':
      return 'Vipimo vya video vimezidi kiwango (upeo 1920x1080). Tafadhali chagua video yenye ubora wa kawaida.';
    case 'UNSUPPORTED_TYPE':
    case 'VIDEO_TYPE_REJECTED':
      return 'Aina hii ya video haiwezi kutumika kwa sasa. Tafadhali tumia MP4, WebM, MOV au 3GP.';
    case 'VIDEO_EMPTY_FILE':
      return 'Faili la video halina data yoyote (0-byte payload). Tafadhali chagua video iliyokamilika.';
    case 'VIDEO_CONCURRENCY_LIMIT':
      return 'Mfumo unashughulikia video nyingi kwa sasa. Tafadhali jaribu tena baada ya muda mfupi.';
    case 'VIDEO_MUTUAL_EXCLUSION':
      return 'Hairuhusiwi kutuma picha na video kwa wakati mmoja.';
    case 'VIDEO_ABORTED':
      return 'Usafirishaji wa video umesitishwa.';
    case 'VIDEO_MODEL_UNSUPPORTED':
      return 'Muundo wa video hii hauwezi kuchakatwa na modeli ya AI kwa sasa. Tafadhali tumia muundo wa kawaida kama MP4.';
    case 'VIDEO_MODEL_UPLOAD_FAILED':
      return 'Imeshindikana kupakia video kwenye huduma ya uchambuzi wa AI. Tafadhali hakiki mtandao wako kisha ujaribu tena.';
    case 'VIDEO_MODEL_PROCESSING_FAILED':
      return 'Hitilafu imetokea wakati AI ikitayarisha video kwa uchambuzi. Tafadhali jaribu tena baada ya muda mfupi.';
    case 'VIDEO_MODEL_TIMEOUT':
      return 'Uchambuzi wa video umechukua muda mrefu kuliko kawaida. Tafadhali jaribu kutuma video fupi zaidi.';
    case 'VIDEO_MODEL_RESPONSE_FAILED':
    case 'VIDEO_RESPONSE_INVALID':
      return 'Huduma ya AI haikuweza kutoa jibu kamili kwa video hii. Tafadhali bonyeza kitufe cha kujaribu tena hapo chini.';
    default:
      return fallbackMessage || 'Hitilafu imetokea wakati wa kuchakata video. Tafadhali jaribu tena.';
  }
}

