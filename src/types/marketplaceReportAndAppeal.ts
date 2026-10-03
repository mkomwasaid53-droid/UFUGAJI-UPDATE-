/**
 * Ufugaji Update - Phase 6: Marketplace Governance
 * V1.7F: Reporting & Appeals Types
 *
 * Core Principles:
 * 1. REPORT IS EVIDENCE / INPUT FOR REVIEW; REPORT IS NOT PROOF OF WRONGDOING.
 *    - Never automatically suspend seller, reject product, or change trust signals because of a report.
 * 2. APPEAL IS A REQUEST FOR RECONSIDERATION; APPEAL IS NOT AUTOMATIC REVERSAL.
 *    - Accepting an appeal only changes the specific governance decision within authorized scope.
 * 3. AI MUST NEVER AUTOMATICALLY DECIDE A REPORT OR APPEAL.
 *    - All governance decisions require human administrator authorization.
 * 4. STRICT SEPARATION OF REPUTATION, TRUST & GOVERNANCE:
 *    - No numerical fraud scores, no seller risk scores, no AI punishment scores.
 *    - Reports count must NOT automatically become a reputation score.
 * 5. REPORTER PRIVACY:
 *    - Reporter private information (phone, consultations, location) is never leaked to sellers or public.
 * 6. AUDIT TRAIL IS APPEND-ONLY AND IMMUTABLE.
 */

// ==========================================
// 1. REPORT TARGETS & REASON CODES
// ==========================================

export type ReportTargetType = 'PRODUCT' | 'LISTING' | 'SELLER' | 'SHOP' | 'REVIEW';

export type ReportReasonCode =
  | 'SPAM'
  | 'MISLEADING_INFORMATION'
  | 'WRONG_CATEGORY'
  | 'WRONG_PRODUCT'
  | 'MISLEADING_PRICE'
  | 'MISLEADING_STOCK'
  | 'MISLEADING_LOCATION'
  | 'MISLEADING_DELIVERY'
  | 'DUPLICATE_LISTING'
  | 'INAPPROPRIATE_CONTENT'
  | 'NON_MARKETPLACE_CONTENT'
  | 'SUSPECTED_IMPERSONATION'
  | 'PRIVACY_VIOLATION'
  | 'HARASSMENT'
  | 'ABUSIVE_CONTENT'
  | 'SUSPECTED_FRAUD'
  | 'OTHER';

export type ReportStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'UNAVAILABLE';

export type ReportResolutionCode =
  | 'NO_ACTION_REQUIRED'
  | 'LISTING_MODERATED'
  | 'SELLER_WARNED'
  | 'SELLER_RESTRICTED'
  | 'DISMISSED_INVALID'
  | 'DISMISSED_DUPLICATE'
  | 'DISMISSED_INSUFFICIENT_EVIDENCE'
  | 'OTHER';

export const REPORT_REASON_METADATA: Record<
  ReportReasonCode,
  { sw: string; en: string; description: string }
> = {
  SPAM: {
    sw: 'Barua taka au Ujumbe Unaorudiarudia (Spam)',
    en: 'Spam or repetitive content',
    description: 'Matangazo ya biashara zisizohusika, viungo bandia, au ujumbe unaojirudiarudia bila mpangilio.'
  },
  MISLEADING_INFORMATION: {
    sw: 'Taarifa Zinazopotosha (Misleading Information)',
    en: 'Misleading information',
    description: 'Picha, maelezo au sifa za bidhaa zisizolingana na uhalisia.'
  },
  WRONG_CATEGORY: {
    sw: 'Kundi Lisilo Sahihi la Bidhaa (Wrong Category)',
    en: 'Wrong product category',
    description: 'Tangazo limewekwa katika kundi lisilolingana na aina halisi ya bidhaa au mifugo.'
  },
  WRONG_PRODUCT: {
    sw: 'Bidhaa Tofauti na Ilivyotangazwa (Wrong Product)',
    en: 'Product differs from description',
    description: 'Bidhaa inayouzwa ni tofauti kabisa na picha au kichwa cha tangazo.'
  },
  MISLEADING_PRICE: {
    sw: 'Bei Isiyo Sahihi au Yenye Utata (Misleading Price)',
    en: 'Misleading price',
    description: 'Bei ya uongo au masharti ya bei yaliyofichwa.'
  },
  MISLEADING_STOCK: {
    sw: 'Idadi ya Bidhaa Isiyo ya Kweli (Misleading Stock)',
    en: 'Misleading stock availability',
    description: 'Kudai kuwa na idadi kubwa ya mifugo au bidhaa ambazo hazipo.'
  },
  MISLEADING_LOCATION: {
    sw: 'Eneo Lisilo la Kweli (Misleading Location)',
    en: 'Misleading location',
    description: 'Kutaja mkoa au wilaya isiyo sahihi ili kuvutia wanunuzi kimakosa.'
  },
  MISLEADING_DELIVERY: {
    sw: 'Taarifa Isiyo ya Kweli ya Usafirishaji (Misleading Delivery)',
    en: 'Misleading delivery details',
    description: 'Madai ya uongo kuhusu upatikanaji wa usafiri au gharama.'
  },
  DUPLICATE_LISTING: {
    sw: 'Tangazo la Marudio (Duplicate Listing)',
    en: 'Duplicate listing',
    description: 'Tangazo limewekwa mara mbili au zaidi na muuzaji yuleyule.'
  },
  INAPPROPRIATE_CONTENT: {
    sw: 'Maudhui Yasiyofaa Sokoni (Inappropriate Content)',
    en: 'Inappropriate content',
    description: 'Maudhui yasiyo na staha au yenye picha zisizofaa.'
  },
  NON_MARKETPLACE_CONTENT: {
    sw: 'Maudhui Yasiyohusu Mifugo/Kilimo (Non-Marketplace Content)',
    en: 'Non-marketplace content',
    description: 'Maudhui yasiyohusiana kabisa na sekta ya mifugo, kilimo au pembejeo.'
  },
  SUSPECTED_IMPERSONATION: {
    sw: 'Shaka ya Kujifanya Mtu Mwingine (Suspected Impersonation)',
    en: 'Suspected impersonation',
    description: 'Kujifanya kuwa mmiliki wa duka lingine, daktari au afisa bila idhini.'
  },
  PRIVACY_VIOLATION: {
    sw: 'Ukiukwaji wa Faragha (Privacy Violation)',
    en: 'Privacy violation',
    description: 'Kuvujisha namba binafsi, maeneo binafsi au nyaraka bila ridhaa.'
  },
  HARASSMENT: {
    sw: 'Usumbufu au Vitisho (Harassment)',
    en: 'Harassment',
    description: 'Lugha ya vitisho au usumbufu unaolenga kumdhalilisha mtumiaji mwingine.'
  },
  ABUSIVE_CONTENT: {
    sw: 'Lugha Chafu au Kashfa (Abusive Content)',
    en: 'Abusive content',
    description: 'Matusi, ubaguzi au kashfa zisizofaa kwenye jukwaa.'
  },
  SUSPECTED_FRAUD: {
    sw: 'Shaka ya Udanganyifu au Utapeli (Suspected Fraud)',
    en: 'Suspected fraud',
    description: 'Shaka ya miamala isiyo salama au maombi ya malipo ya utapeli (Ombi la uchunguzi, si uthibitisho).'
  },
  OTHER: {
    sw: 'Sababu Nyingine ya Kikanuni (Other)',
    en: 'Other regulatory reason',
    description: 'Suala jingine linalokiuka miongozo na usalama wa soko.'
  }
};

// ==========================================
// 2. STRUCTURED REPORT MODEL
// ==========================================

export interface MarketplaceReportRecord {
  reportId: string;
  reporterUserId: string;          // Authenticated Firebase user identity (strictly checked)
  targetType: ReportTargetType;
  targetId: string;                // Authoritative ID
  productId?: string | null;
  listingId?: string | null;
  sellerId?: string | null;
  shopId?: string | null;
  reviewId?: string | null;
  reasonCode: ReportReasonCode;
  reasonText: string;              // Untrusted reporter context (sanitized)
  status: ReportStatus;
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
  reviewedAt?: string | null;      // ISO 8601
  reviewedBy?: string | null;      // Admin user UID
  reviewedByName?: string | null;
  moderatorNotes?: string | null;  // Strictly private internal notes (stripped for non-admins)
  resolutionCode?: ReportResolutionCode | null;
  resolutionText?: string | null;  // Safe public explanation
  relatedModerationId?: string | null;
  relatedWarningId?: string | null;
  relatedRestrictionId?: string | null;
}

// ==========================================
// 3. APPEALS: TARGETS, REASONS & MODEL
// ==========================================

export type AppealTargetType =
  | 'MODERATION_DECISION'
  | 'SELLER_WARNING'
  | 'SELLER_RESTRICTION';

export type AppealReasonCode =
  | 'DECISION_INCORRECT'
  | 'INFORMATION_MISUNDERSTOOD'
  | 'LISTING_CORRECTED'
  | 'MISSING_CONTEXT'
  | 'DUPLICATE_ACTION'
  | 'TECHNICAL_ERROR'
  | 'NEW_INFORMATION'
  | 'OTHER';

export type AppealStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'PARTIALLY_ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'UNAVAILABLE';

export type AppealDecisionCode =
  | 'UPHOLD_DECISION'
  | 'REVERSE_DECISION'
  | 'PARTIALLY_REVERSE'
  | 'REQUEST_CORRECTION'
  | 'NO_ACTION';

export const APPEAL_REASON_METADATA: Record<
  AppealReasonCode,
  { sw: string; en: string; description: string }
> = {
  DECISION_INCORRECT: {
    sw: 'Uamuzi Haukuwa Sahihi (Decision Incorrect)',
    en: 'Decision incorrect based on policy',
    description: 'Tangazo au mwenendo unakidhi kikamilifu miongozo ya sokoni.'
  },
  INFORMATION_MISUNDERSTOOD: {
    sw: 'Taarifa Zilitafsiriwa Vibaya (Information Misunderstood)',
    en: 'Information misunderstood',
    description: 'Maelezo ya tangazo au bidhaa yalitafsiriwa kimakosa wakati wa ukaguzi.'
  },
  LISTING_CORRECTED: {
    sw: 'Marekebisho Yamefanyika (Listing Corrected)',
    en: 'Listing corrected by seller',
    description: 'Kasoro zilizoelezwa zimerekebishwa (k.m. kundi sahihi, picha halisi au bei).'
  },
  MISSING_CONTEXT: {
    sw: 'Kukosekana kwa Muktadha Kamili (Missing Context)',
    en: 'Missing context provided',
    description: 'Kuna taarifa muhimu za ziada ambazo hazikuwepo wakati uamuzi ulipofanyika.'
  },
  DUPLICATE_ACTION: {
    sw: 'Hatua ya Marudio (Duplicate Action)',
    en: 'Duplicate action taken',
    description: 'Hatua hii imejirudia kwa suala lilelile ambalo tayari lilitatuliwa.'
  },
  TECHNICAL_ERROR: {
    sw: 'Hitilafu ya Kiufundi (Technical Error)',
    en: 'Technical error in system',
    description: 'Mifumo ya kiufundi ilisababisha taarifa kuonekana kimakosa.'
  },
  NEW_INFORMATION: {
    sw: 'Taarifa Mpya za Ziada (New Information)',
    en: 'New verified information available',
    description: 'Kuna nyaraka au uthibitisho mpya unaobainisha uhalali wa tangazo/duka.'
  },
  OTHER: {
    sw: 'Sababu Nyingine ya Kimsingi (Other)',
    en: 'Other justifiable reason',
    description: 'Maelezo mengine ya kimsingi yanayoonyesha uhalali wa kutathmini upya.'
  }
};

export interface MarketplaceAppealRecord {
  appealId: string;
  appellantUserId: string;         // Authenticated seller user ID
  sellerId: string;                // Authoritative seller identity
  shopId?: string | null;
  targetType: AppealTargetType;
  targetId: string;                // moderationId, warningId, or restrictionId
  relatedModerationId?: string | null;
  relatedWarningId?: string | null;
  relatedRestrictionId?: string | null;
  productId?: string | null;
  listingId?: string | null;
  reasonCode: AppealReasonCode;
  reasonText: string;              // Appellant explanation (treated as untrusted input)
  status: AppealStatus;
  submittedAt: string;             // ISO 8601
  updatedAt: string;               // ISO 8601
  reviewedAt?: string | null;      // ISO 8601
  reviewedBy?: string | null;      // Admin user UID
  reviewedByName?: string | null;
  decisionCode?: AppealDecisionCode | null;
  decisionText?: string | null;    // Safe user-facing Swahili explanation
  moderatorNotes?: string | null;  // Private internal admin notes (stripped for non-admins)
  createdAt: string;
}

// ==========================================
// 4. IMMUTABLE AUDIT TRAIL MODEL
// ==========================================

export type GovernanceReportAppealAuditAction =
  | 'REPORT_CREATED'
  | 'REPORT_REVIEW_STARTED'
  | 'REPORT_RESOLVED'
  | 'REPORT_DISMISSED'
  | 'APPEAL_CREATED'
  | 'APPEAL_REVIEW_STARTED'
  | 'APPEAL_ACCEPTED'
  | 'APPEAL_PARTIALLY_ACCEPTED'
  | 'APPEAL_REJECTED'
  | 'APPEAL_WITHDRAWN';

export interface MarketplaceReportAppealAuditEntry {
  auditId: string;
  action: GovernanceReportAppealAuditAction;
  targetType: 'REPORT' | 'APPEAL';
  targetId: string;                // reportId or appealId
  reporterUserId?: string | null;
  appellantUserId?: string | null;
  sellerId?: string | null;
  productId?: string | null;
  performedBy: string;             // User UID
  performedByName: string;
  performedAt: string;             // ISO 8601
  previousState?: any;
  newState?: any;
  reasonCode?: string | null;
  reasonText?: string | null;
  internalNote?: string | null;
  relatedGovernanceRecordId?: string | null;
}

// ==========================================
// 5. INPUT TYPES FOR SERVICE CALLS
// ==========================================

export interface SubmitReportInput {
  targetType: ReportTargetType;
  targetId: string;
  productId?: string | null;
  listingId?: string | null;
  sellerId?: string | null;
  shopId?: string | null;
  reviewId?: string | null;
  reasonCode: ReportReasonCode;
  reasonText: string;
}

export interface ReviewReportInput {
  status: 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolutionCode?: ReportResolutionCode | null;
  resolutionText?: string | null;
  moderatorNotes?: string | null;
  relatedModerationId?: string | null;
  relatedWarningId?: string | null;
  relatedRestrictionId?: string | null;
}

export interface SubmitAppealInput {
  targetType: AppealTargetType;
  targetId: string;
  sellerId: string;
  shopId?: string | null;
  productId?: string | null;
  listingId?: string | null;
  relatedModerationId?: string | null;
  relatedWarningId?: string | null;
  relatedRestrictionId?: string | null;
  reasonCode: AppealReasonCode;
  reasonText: string;
}

export interface ReviewAppealInput {
  decisionCode: AppealDecisionCode;
  decisionText: string;
  moderatorNotes?: string | null;
  executeStateUpdate?: boolean; // If true, auto-applies reverse actions to warning/restriction/moderation
}
