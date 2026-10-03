/**
 * ============================================================================
 * V1.1 IMAGE FOUNDATION — FROZEN AFTER V1.1.7
 * PROJECT: UFUGAJI UPDATE
 * ============================================================================
 * 
 * This file defines the formal diagnostic boundaries, stages, and error
 * categorization for the Ufugaji Update AI multimodal image pipeline.
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Raw conversation image data is intentionally NOT persisted (neither in
 *    Firestore nor localStorage nor Cloud Storage).
 * 2. Historical image messages must NOT be treated as visually available to Gemini.
 * 3. FarmerContext and Marketplace remain strictly decoupled from image analysis.
 *    - Photographed animals do not automatically create/update livestock records.
 *    - Images never trigger marketplace search unless explicit text commerce intent exists.
 * 
 * PIPELINE STAGES:
 * 1. IMAGE_INPUT: User file selection / drag-and-drop
 * 2. IMAGE_VALIDATION_CLIENT: Client-side MIME, extension, size, dimension & decode checks
 * 3. IMAGE_VALIDATION_SERVER: Server-side multipart & buffer magic-byte validation
 * 4. IMAGE_TRANSPORT: Network transport (multipart/form-data) to /api/ai-assistant
 * 5. GEMINI_MULTIMODAL: Server-side Gemini API multimodal reasoning
 * 6. CONVERSATION_INTEGRATION: Appending to state, ordering, and history normalization
 * 7. IMAGE_RENDERING: Composer preview, lightbox preview, and bubble rendering
 * 8. IMAGE_PERSISTENCE_METADATA: Storing safe metadata only in Firestore/localStorage
 * 9. IMAGE_CLEANUP: Object URL revocation and buffer garbage collection
 * 10. IMAGE_STATE: In-memory composer attachment state management
 */

export const IMAGE_PIPELINE_STAGES = {
  IMAGE_INPUT: 'IMAGE_INPUT',
  IMAGE_VALIDATION_CLIENT: 'IMAGE_VALIDATION_CLIENT',
  IMAGE_VALIDATION_SERVER: 'IMAGE_VALIDATION_SERVER',
  IMAGE_TRANSPORT: 'IMAGE_TRANSPORT',
  GEMINI_MULTIMODAL: 'GEMINI_MULTIMODAL',
  CONVERSATION_INTEGRATION: 'CONVERSATION_INTEGRATION',
  IMAGE_RENDERING: 'IMAGE_RENDERING',
  IMAGE_PERSISTENCE_METADATA: 'IMAGE_PERSISTENCE_METADATA',
  IMAGE_CLEANUP: 'IMAGE_CLEANUP',
  IMAGE_STATE: 'IMAGE_STATE',
} as const;

export type ImagePipelineStage = typeof IMAGE_PIPELINE_STAGES[keyof typeof IMAGE_PIPELINE_STAGES];

/**
 * Standardized internal image error categories.
 * Note: These are internal diagnostic categories for error classification.
 * End users are shown gentle, non-technical Swahili guidance.
 */
export const IMAGE_ERROR_CATEGORIES = {
  INVALID_IMAGE: 'INVALID_IMAGE',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  IMAGE_DIMENSION_INVALID: 'IMAGE_DIMENSION_INVALID',
  IMAGE_REQUEST_FAILED: 'IMAGE_REQUEST_FAILED',
  IMAGE_SERVER_VALIDATION_FAILED: 'IMAGE_SERVER_VALIDATION_FAILED',
  IMAGE_MODEL_FAILED: 'IMAGE_MODEL_FAILED',
  IMAGE_RESPONSE_FAILED: 'IMAGE_RESPONSE_FAILED',
  IMAGE_RENDER_FAILED: 'IMAGE_RENDER_FAILED',
  IMAGE_STATE_FAILED: 'IMAGE_STATE_FAILED',
} as const;

export type ImageErrorCategory = typeof IMAGE_ERROR_CATEGORIES[keyof typeof IMAGE_ERROR_CATEGORIES];

/**
 * Diagnostic tracking event structure (NO raw bytes, base64, or data URLs allowed)
 */
export interface ImageDiagnosticEvent {
  stage: ImagePipelineStage;
  errorCategory?: ImageErrorCategory;
  timestamp: string;
  sanitizedFileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  message?: string;
}
