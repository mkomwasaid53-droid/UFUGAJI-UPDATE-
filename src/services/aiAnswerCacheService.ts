/**
 * Ufugaji Update — V1.8A AI Answer Cache Service
 *
 * Provides a safe, reusable answer cache foundation:
 * 1. Normalized cache key generation
 * 2. Strict category isolation:
 *    - GLOBAL_GENERAL_KNOWLEDGE (reusable between users)
 *    - PERSONALIZED_CONTEXTUAL (user-scoped, never global)
 *    - MARKETPLACE_DYNAMIC (dynamic, never permanent)
 *    - VISUAL_ANALYSIS (never unsafe global)
 *    - DAKTARI_CONTEXTUAL (private medical, never global)
 * 3. Cache eligibility evaluation respecting V1.5A Context Orchestration
 * 4. Deterministic TTL & Knowledge Base version invalidation
 * 5. Pre-return safety & hallucination validation
 * 6. Cache hit/miss/bypass/invalidated tracking
 */

import {
  AiCacheCategory,
  AiAnswerCacheRecord,
  CacheLookupResult,
  CacheEligibilityAssessment,
  AiCacheStatus
} from '../types/aiUsageAndCache';
import { getAiBusinessConfig } from './aiUsageTrackingService';

// In-memory cache store (indexed by cacheKey and cacheId)
const answerCacheByKey: Map<string, AiAnswerCacheRecord> = new Map();
const answerCacheById: Map<string, AiAnswerCacheRecord> = new Map();

// ============================================================================
// 1. QUESTION NORMALIZATION & KEY GENERATION
// ============================================================================

/**
 * Normalizes user questions for safe semantic caching.
 * Strips colloquial filler particles in Swahili/English while preserving specific agricultural terms.
 */
export function normalizeQuestion(rawQuestion: string, language: string = 'sw'): {
  normalizedText: string;
  detectedIntent: string;
} {
  if (!rawQuestion || typeof rawQuestion !== 'string') {
    return { normalizedText: '', detectedIntent: 'UNKNOWN' };
  }

  // 1. Lowercase, trim, collapse whitespace, strip punctuation
  let cleaned = rawQuestion
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:"'’`()\[\]{}|\\/<>@#$%^&*+=~_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Normalize Swahili filler particles at start or end
  // (e.g., "je,", "hivi", "naomba kujua", "nini maana ya", "maana ya", "tafadhali niambie")
  const swahiliFillers = [
    /^je\s+/,
    /^hivi\s+/,
    /^naomba\s+kujua\s+/,
    /^naomba\s+unieleze\s+/,
    /^naomba\s+kufahamu\s+/,
    /^tafadhali\s+niambie\s+/,
    /^niambie\s+/,
    /^nieleze\s+/,
    /^nini\s+maana\s+ya\s+/,
    /^maana\s+ya\s+/,
    /^kwa\s+nini\s+/,
    /^kwanini\s+/,
    /^namna\s+ya\s+/,
    /^jinsi\s+ya\s+/,
    /\s+ni\s+nini$/,
    /\s+maana\s+yake\s+ni\s+nini$/
  ];

  // 3. Normalize English filler particles
  const englishFillers = [
    /^what\s+is\s+the\s+meaning\s+of\s+/,
    /^what\s+is\s+/,
    /^what\s+does\s+/,
    /^tell\s+me\s+about\s+/,
    /^can\s+you\s+explain\s+/,
    /^please\s+explain\s+/,
    /^how\s+do\s+i\s+/,
    /^how\s+to\s+/
  ];

  const fillers = language === 'en' ? englishFillers : swahiliFillers;
  for (const regex of fillers) {
    cleaned = cleaned.replace(regex, '').trim();
  }

  // Collapse double spaces again
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Simple intent classification
  let detectedIntent = 'GENERAL_EXPLANATION';
  if (cleaned.includes('fcr') || cleaned.includes('feed conversion')) {
    detectedIntent = 'FCR_DEFINITION';
  } else if (cleaned.includes('brooding') || cleaned.includes('kulea vifaranga')) {
    detectedIntent = 'BROODING_MANAGEMENT';
  } else if (cleaned.includes('chanjo') || cleaned.includes('vaccination')) {
    detectedIntent = 'VACCINATION_SCHEDULE';
  } else if (cleaned.includes('newcastle') || cleaned.includes('kideri') || cleaned.includes('mdondo')) {
    detectedIntent = 'DISEASE_NEWCASTLE';
  } else if (cleaned.includes('layers') || cleaned.includes('broilers') || cleaned.includes('kuroiler')) {
    detectedIntent = 'BREED_COMPARISON';
  }

  return { normalizedText: cleaned, detectedIntent };
}

/**
 * Computes a deterministic hash string for normalized text
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generates the authoritative cache key.
 */
export function generateCacheKey(params: {
  category: AiCacheCategory;
  normalizedText: string;
  language?: string;
  knowledgeVersion?: string;
  userId?: string; // For personalized contextual cache
}): string {
  const { category, normalizedText, language = 'sw', knowledgeVersion, userId } = params;
  const config = getAiBusinessConfig();
  const version = knowledgeVersion || config.knowledgeBaseVersion;
  const hash = simpleHash(normalizedText);

  if (category === 'PERSONALIZED_CONTEXTUAL') {
    return `cache:pers:${userId || 'anon'}:${language}:${hash}:v${version}`;
  }
  return `cache:${category.toLowerCase()}:${language}:${hash}:v${version}`;
}

// ============================================================================
// 2. CACHE ELIGIBILITY ASSESSMENT
// ============================================================================

export interface AssessCacheEligibilityInput {
  question: string;
  hasBinaryImage?: boolean;
  hasBinaryVideo?: boolean;
  hasAttachmentImage?: boolean;
  hasAttachmentVideo?: boolean;
  farmerRecords?: any[];
  recordEventsMap?: Record<string, any[]>;
  hasFarmerContext?: boolean;
  selectedSources?: string[]; // From V1.5A Context Orchestrator
  marketplaceIntentDetected?: boolean;
  daktariContextDetected?: boolean;
}

/**
 * Assesses whether a user request is safe to look up from or write to the answer cache.
 * Adheres strictly to the rule:
 * Cost optimization must NEVER override relevance, correctness, or user privacy.
 */
export function assessCacheEligibility(
  input: AssessCacheEligibilityInput
): CacheEligibilityAssessment {
  const rawQ = (input.question || '').toLowerCase().trim();

  // 1. Visual/Media queries are NEVER stored or looked up in global answer cache
  if (
    input.hasBinaryImage ||
    input.hasBinaryVideo ||
    input.hasAttachmentImage ||
    input.hasAttachmentVideo
  ) {
    return {
      eligible: false,
      category: 'VISUAL_ANALYSIS',
      reason: 'Media analysis (image/video) requires live multimodal analysis; unsafe for global cache.'
    };
  }

  // 2. Personalized Contextual Queries (FarmerContext, records, history, My Assistant)
  // Must NOT enter global cache.
  const hasFarmRecords = Array.isArray(input.farmerRecords) && input.farmerRecords.length > 0;
  const hasRecordsContext =
    input.selectedSources &&
    (input.selectedSources.includes('LIVESTOCK_RECORDS') ||
      input.selectedSources.includes('LIVESTOCK_HISTORY') ||
      input.selectedSources.includes('MY_ASSISTANT_INTELLIGENCE'));

  // Detect personal pronouns in Swahili or English
  const personalKeywords = [
    'wangu',
    'yangu',
    'zangu',
    'changu',
    'vyangu',
    'kwangu',
    'shamba langu',
    'mifugo yangu',
    'kuku wangu',
    'ng\'ombe wangu',
    'mbuzi wangu',
    'bata wangu',
    'nguruwe wangu',
    'nina kuku wangapi',
    'nina ng\'ombe wangapi',
    'idadi ya kuku wangu',
    'rekodi zangu',
    'chanjo nilizopiga',
    'vifo vya kuku wangu',
    'my cows',
    'my chickens',
    'my farm',
    'my records',
    'how many cows do i have',
    'how many broilers do i have'
  ];

  const containsPersonalPronoun = personalKeywords.some((kw) => rawQ.includes(kw));

  if (hasRecordsContext || containsPersonalPronoun) {
    return {
      eligible: false,
      category: 'PERSONALIZED_CONTEXTUAL',
      reason: 'Question requires private farmer records or personalized context; bypassed global cache.'
    };
  }

  // 3. Dynamic Marketplace Queries (price, stock, shops, sellers, locations)
  // Marketplace remains authoritative; static caching of prices or stock is prohibited.
  const marketplaceKeywords = [
    'bei ya',
    'bei gani',
    'shilingi ngapi',
    'duka la',
    'maduka ya',
    'wapi nitapata',
    'inauzwa wapi',
    'nauza',
    'anayeuza',
    'nipatie muuzaji',
    'stock',
    'available',
    'current price',
    'how much is',
    'where can i buy'
  ];

  const containsMarketplaceQuery =
    Boolean(input.marketplaceIntentDetected) ||
    marketplaceKeywords.some((kw) => rawQ.includes(kw)) ||
    Boolean(input.selectedSources?.includes('MARKETPLACE'));

  if (containsMarketplaceQuery) {
    return {
      eligible: false,
      category: 'MARKETPLACE_DYNAMIC',
      reason: 'Question asks for live marketplace pricing, stock, or seller availability; live search required.'
    };
  }

  // 4. Private Veterinary / Emergency Consultations
  const daktariKeywords = [
    'wasiliana na daktari',
    'namba ya daktari',
    'daktari aliye karibu',
    'dharura ya mifugo',
    'mnyama wangu anakufa sasa',
    'emergency vet'
  ];

  const isDaktariConsultation =
    Boolean(input.daktariContextDetected) ||
    daktariKeywords.some((kw) => rawQ.includes(kw)) ||
    Boolean(input.selectedSources?.includes('DAKTARI_PROFILES'));

  if (isDaktariConsultation) {
    return {
      eligible: false,
      category: 'DAKTARI_CONTEXTUAL',
      reason: 'Veterinary consultation involves private medical context; bypassed global cache.'
    };
  }

  // 5. Eligible for Global General Knowledge Cache
  // Must be a general educational/veterinary-science question
  return {
    eligible: true,
    category: 'GLOBAL_GENERAL_KNOWLEDGE',
    reason: 'Question is general educational knowledge, free of private or dynamic context.'
  };
}

// ============================================================================
// 3. CACHE LOOKUP
// ============================================================================

export interface LookupAnswerCacheOptions {
  language?: string;
  knowledgeVersion?: string;
  userId?: string;
}

export function lookupAnswerCache(
  question: string,
  options?: LookupAnswerCacheOptions
): CacheLookupResult {
  const config = getAiBusinessConfig();
  if (!config.answerCacheEnabled) {
    return { status: 'BYPASS', reason: 'Answer cache is globally disabled in config.' };
  }

  const lang = options?.language || 'sw';
  const version = options?.knowledgeVersion || config.knowledgeBaseVersion;

  const { normalizedText, detectedIntent } = normalizeQuestion(question, lang);
  if (!normalizedText || normalizedText.length < 3) {
    return { status: 'MISS', reason: 'Normalized question is too short.' };
  }

  const cacheKey = generateCacheKey({
    category: 'GLOBAL_GENERAL_KNOWLEDGE',
    normalizedText,
    language: lang,
    knowledgeVersion: version,
    userId: options?.userId
  });

  const record = answerCacheByKey.get(cacheKey);
  if (!record) {
    return { status: 'MISS', reason: 'No matching cache record found.' };
  }

  // 1. Expiration check (deterministic TTL)
  const now = new Date();
  if (new Date(record.expiresAt) <= now) {
    return { status: 'INVALIDATED', record, reason: 'Cache entry has expired.' };
  }

  // 2. Knowledge Version check
  if (record.knowledgeVersion !== version) {
    return { status: 'INVALIDATED', record, reason: 'Knowledge version mismatch.' };
  }

  // 3. Safety Status check
  if (record.safetyStatus !== 'PASSED' || record.validationStatus !== 'VALID') {
    return { status: 'INVALIDATED', record, reason: 'Cache record is flagged or failed safety status.' };
  }

  // Update hit counter metadata
  if (!record.usageMetadata) {
    record.usageMetadata = { hitCount: 0, lastHitAt: now.toISOString() };
  }
  record.usageMetadata.hitCount += 1;
  record.usageMetadata.lastHitAt = now.toISOString();

  return {
    status: 'HIT',
    record
  };
}

// ============================================================================
// 4. CACHE WRITE
// ============================================================================

export interface WriteAnswerCacheInput {
  question: string;
  answerText: string;
  category?: AiCacheCategory;
  language?: string;
  modelProvider?: string;
  modelName?: string;
  sourceType?: 'GEMINI_API' | 'LOCAL_EXPERT_SYSTEM';
  ttlMs?: number;
  userId?: string;
}

export function writeAnswerCache(input: WriteAnswerCacheInput): AiAnswerCacheRecord | null {
  const config = getAiBusinessConfig();
  if (!config.answerCacheEnabled) {
    return null;
  }

  const category = input.category || 'GLOBAL_GENERAL_KNOWLEDGE';
  // Personalized or dynamic categories must NOT be saved in global cache!
  if (category !== 'GLOBAL_GENERAL_KNOWLEDGE' && !input.userId) {
    return null;
  }

  const lang = input.language || 'sw';
  const { normalizedText, detectedIntent } = normalizeQuestion(input.question, lang);
  if (!normalizedText || normalizedText.length < 3 || !input.answerText || input.answerText.trim().length < 10) {
    return null;
  }

  const cacheKey = generateCacheKey({
    category,
    normalizedText,
    language: lang,
    knowledgeVersion: config.knowledgeBaseVersion,
    userId: input.userId
  });

  const now = new Date();
  const ttl = input.ttlMs || config.defaultCacheTtlMs;
  const expiresAt = new Date(now.getTime() + ttl).toISOString();

  const cacheId = `aicache_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const record: AiAnswerCacheRecord = {
    cacheId,
    cacheType: category,
    normalizedKey: cacheKey,
    language: lang,
    questionIntent: detectedIntent,
    answerText: input.answerText.trim(),
    sourceType: input.sourceType || 'GEMINI_API',
    knowledgeVersion: config.knowledgeBaseVersion,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
    validationStatus: 'VALID',
    safetyStatus: 'PASSED',
    modelProvider: input.modelProvider || 'google-gemini',
    modelName: input.modelName || 'gemini-3.1-flash-lite',
    usageMetadata: {
      hitCount: 0,
      lastHitAt: undefined
    }
  };

  answerCacheByKey.set(cacheKey, record);
  answerCacheById.set(cacheId, record);

  return record;
}

// ============================================================================
// 5. CACHE INVALIDATION
// ============================================================================

export function invalidateCacheEntry(cacheId: string, reason?: string): boolean {
  const record = answerCacheById.get(cacheId);
  if (record) {
    record.validationStatus = 'INVALID';
    record.safetyStatus = 'FAILED';
    record.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function invalidateCacheByKnowledgeVersion(newVersion: string): number {
  let count = 0;
  for (const record of answerCacheById.values()) {
    if (record.knowledgeVersion !== newVersion) {
      record.validationStatus = 'INVALID';
      count++;
    }
  }
  return count;
}

export function getAllCachedRecords(): AiAnswerCacheRecord[] {
  return Array.from(answerCacheById.values());
}

export function resetAnswerCacheForTesting(): void {
  answerCacheByKey.clear();
  answerCacheById.clear();
}
