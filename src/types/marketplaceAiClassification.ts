/**
 * V1.7C — AI Assisted Marketplace Classification Models
 * Phase 6: Marketplace Governance
 *
 * Core Architecture:
 * AI SUGGESTS
 *   -> GOVERNED CATEGORY SYSTEM VALIDATES
 *   -> LISTING VALIDATION VALIDATES
 *   -> HUMAN/SELLER CONFIRMS WHEN REQUIRED
 *   -> ONLY VALID STRUCTURED DATA CAN BECOME AUTHORITATIVE
 *
 * Invariants:
 * 1. AI is ASSISTIVE ONLY. Never authoritative.
 * 2. AI must NOT create categories, category IDs, or activate listings.
 * 3. AI must select ONLY from active, governed, marketplace-eligible categories.
 * 4. Confidence is an AI guidance signal, NOT a trust/verification score.
 * 5. Media/Images are evidence for classification only, never establishing ownership or authenticity.
 */

export type AiClassificationStatus =
  | 'SUGGESTED'        // Successfully matched to an active governed category
  | 'NO_MATCH'         // No suitable active governed category found
  | 'AMBIGUOUS'        // Multiple plausible governed categories detected
  | 'NEEDS_REVIEW'     // Evidence is weak or flagged for human review
  | 'MISMATCH_REVIEW'  // AI suggestion differs from seller's manually selected category
  | 'ERROR';           // Malformed output, invalid ID, or service error

export type AiClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AiAlternativeSuggestion {
  categoryId: string;
  categoryName: string;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  reason?: string;
  confidence?: AiClassificationConfidence;
}

export interface AiClassificationResult {
  classificationStatus: AiClassificationStatus;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedSubcategoryId: string | null;
  suggestedSubcategoryName: string | null;
  suggestedParentCategoryId: string | null;
  suggestedLivestockType: string | null;
  suggestedProductType: string | null;
  confidenceLevel: AiClassificationConfidence;
  reason: string;
  matchedSignals: string[];
  extractedKeywords: string[];
  alternativeSuggestions: AiAlternativeSuggestion[];
  isMismatchWithSellerCategory: boolean;
  sellerSelectedCategoryId?: string | null;
  sellerSelectedCategoryName?: string | null;
  classificationVersion: string;
  classifiedAt: string;
  rawAiExplanation?: string;
  isDeterministicFallback?: boolean;
}

export interface AiClassificationRequestInput {
  title: string;
  description?: string;
  sellerSelectedCategoryId?: string | null;
  sellerSelectedSubcategoryId?: string | null;
  sellerSelectedCategoryName?: string | null;
  livestockType?: string | null;
  productType?: string | null;
  imageUrl?: string | null;
}
