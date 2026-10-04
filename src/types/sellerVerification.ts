/**
 * V1.11A — SELLER VERIFICATION & TRUST DOMAIN TYPES
 *
 * Core Principle:
 * "Verification fee is a processing/application fee.
 * Payment is NOT automatic purchase of trust."
 *
 * Strictly separates:
 * 1. User Identity (Auth UID)
 * 2. Seller Profile (Descriptive data)
 * 3. Digital Shop (Storefront navigation)
 * 4. Seller Monetization (Subscription status — V1.10A/B)
 * 5. Seller Verification (Authoritative trust & verification domain — V1.11A)
 */

export type SellerVerificationStatus =
  | 'NOT_APPLIED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'VERIFIED'
  | 'PENDING_VERIFICATION'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVERIFICATION_REQUIRED';

export type SellerVerificationBadgeStatus =
  | 'INACTIVE'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED';

export type SellerVerificationType =
  | 'INDIVIDUAL'    // Mfugaji Binafsi
  | 'FARM'          // Shamba la Mifugo
  | 'BUSINESS'      // Kampuni / Biashara
  | 'COOPERATIVE'   // Chama cha Ushirika (AMCOS/Kikundi)
  | 'AGROVET'       // Duka la Pembejeo na Vifaa vya Mifugo
  | 'BREEDER';      // Mzalishaji wa Mbegu / Vifaranga

export interface VerificationDocumentReference {
  documentId: string;
  documentType: 'NIDA' | 'TIN' | 'BUSINESS_LICENSE' | 'LOCAL_GOV_LETTER' | 'FARM_PERMIT' | 'OTHER';
  title: string;
  referenceNumber?: string;
  issuedBy?: string;
  issuedDate?: string;
  documentUrl?: string; // Secure reference, NEVER exposed publicly
  notes?: string;
  verified?: boolean;
}

export interface SellerVerificationApplication {
  verificationId?: string;
  sellerUserId?: string;
  sellerId: string; // Compatibility alias for sellerUserId
  shopId?: string;
  applicationNumber?: string; // e.g. VER-2026-XXXX
  status: SellerVerificationStatus;
  verificationType: SellerVerificationType;

  // Structured application details
  legalName?: string;
  displayName: string;
  businessName: string;
  phone: string;
  email?: string;
  region?: string;
  location?: string; // Compatibility alias for region
  district?: string;
  area?: string;
  nationalId?: string;       // NIDA number/reference
  tinNumber?: string;        // Tax ID reference
  permitReference?: string;  // Local government / license reference
  applicationNotes?: string;
  documentNotes?: string;    // Compatibility field
  notes?: string;            // Compatibility field
  documents?: VerificationDocumentReference[];

  // Governed Processing Fee & Payment
  processingFeeAmount?: number;
  processingFeeCurrency?: 'TZS';
  processingPaymentStatus?: 'NOT_PAID' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  paymentIntentId?: string;
  paymentTransactionRef?: string;
  paymentConfirmedAt?: string;

  // Review & Decision (Server authoritative)
  reviewedAt?: string;
  reviewedBy?: string;        // Admin UID
  reviewDecisionNotes?: string; // Internal admin-only notes
  safeRejectionReason?: string; // Safe, seller-facing explanation
  correctionNotes?: string;     // Notes requesting corrections
  suspensionReason?: string;
  reverificationNotes?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  expiresAt?: string;
  reverificationRequiredAt?: string;
  currentReviewVersion?: number;

  // Separate Authoritative Badge State
  badgeStatus?: SellerVerificationBadgeStatus;
  hasActiveBadge?: boolean;
  badgeEligible?: boolean; // Compatibility field
  publicBadgeText?: string; // Compatibility field
  badgeActivatedAt?: string | null;
  badgeDeactivatedAt?: string | null;
  badgeDeactivationReason?: string;

  // Metadata
  createdAt?: string;
  updatedAt: string;
}

/**
 * Backward compatibility alias for SellerVerificationApplication
 */
export type SellerVerification = SellerVerificationApplication;

export interface SellerVerificationApplicationInput {
  verificationType: SellerVerificationType;
  legalName?: string;
  displayName?: string;
  businessName: string;
  phone: string;
  email?: string;
  region?: string;
  location?: string;
  district?: string;
  area?: string;
  nationalId?: string;
  tinNumber?: string;
  permitReference?: string;
  applicationNotes?: string;
  documentNotes?: string;
  notes?: string;
  documents?: Omit<VerificationDocumentReference, 'documentId' | 'verified'>[];
}

export type VerificationAuditAction =
  | 'VERIFICATION_APPLICATION_CREATED'
  | 'VERIFICATION_APPLICATION_SUBMITTED'
  | 'VERIFICATION_PAYMENT_INITIATED'
  | 'VERIFICATION_PAYMENT_CONFIRMED'
  | 'VERIFICATION_PAYMENT_FAILED'
  | 'VERIFICATION_REVIEW_STARTED'
  | 'VERIFICATION_CORRECTION_REQUESTED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_SUSPENDED'
  | 'VERIFICATION_REVERIFICATION_REQUIRED'
  | 'VERIFICATION_BADGE_ACTIVATED'
  | 'VERIFICATION_BADGE_DEACTIVATED';

export interface SellerVerificationAuditEvent {
  eventId: string;
  verificationId: string;
  sellerUserId: string;
  actorUserId: string;
  actorRole: 'SELLER' | 'ADMIN' | 'SYSTEM' | 'PAYMENT_WEBHOOK';
  action: VerificationAuditAction;
  previousStatus?: SellerVerificationStatus;
  newStatus?: SellerVerificationStatus;
  previousBadgeStatus?: SellerVerificationBadgeStatus;
  newBadgeStatus?: SellerVerificationBadgeStatus;
  reason?: string;
  notes?: string;
  correlationId?: string;
  timestamp: string;
}

export interface PublicSellerVerificationBadge {
  sellerUserId: string;
  isVerified: boolean;
  badgeStatus: SellerVerificationBadgeStatus;
  badgeLabel: string;
  shortLabel: string;
  badgeActivatedAt?: string | null;
  verificationType?: SellerVerificationType;
  verificationVersion?: number;
  notice: string; // Explains: "Seller has completed Ufugaji Update's verification process according to applicable verification requirements."
}

export const VERIFICATION_FEE_CONFIG = {
  amount: 5000,
  currency: 'TZS' as const,
  purpose: 'VERIFICATION_PROCESSING_FEE' as const,
  label: 'Ada ya Kuchakata Maombi ya Uhakiki (Processing Fee)',
  disclaimer: 'Lipa ada ya processing hakumaanishi verification imekubaliwa. Malipo haya ni ya ukaguzi na uchakataji wa taarifa zako na hayaleti beji ya moja kwa moja bila uhakiki wa kiutawala.'
} as const;

export interface VerificationBadgeDisplay {
  isVerified: boolean;
  status: SellerVerificationStatus;
  badgeStatus: SellerVerificationBadgeStatus;
  badgeLabel: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  description: string;
}

/**
 * Maps verification application status & badge state to human-readable presentation
 */
export function getSellerVerificationDisplay(
  status?: SellerVerificationStatus | null,
  badgeStatus?: SellerVerificationBadgeStatus | null
): VerificationBadgeDisplay {
  const isBadgeActive = badgeStatus === 'ACTIVE';

  if (isBadgeActive) {
    return {
      isVerified: true,
      status: status || 'APPROVED',
      badgeStatus: 'ACTIVE',
      badgeLabel: 'Muuzaji Aliyethibitishwa (Verified Seller)',
      shortLabel: 'Verified',
      colorClass: 'text-emerald-900',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-300',
      description: 'Muuzaji huyu amekamilisha taratibu rasmi za uhakiki wa Ufugaji Update.'
    };
  }

  switch (status) {
    case 'APPROVED':
      return {
        isVerified: false,
        status: 'APPROVED',
        badgeStatus: badgeStatus || 'INACTIVE',
        badgeLabel: 'Imekubaliwa (Inasubiri Beji)',
        shortLabel: 'Imekubaliwa',
        colorClass: 'text-emerald-800',
        bgClass: 'bg-emerald-50/70',
        borderClass: 'border-emerald-200',
        description: 'Maombi yameidhinishwa. Beji itawashwa kiutawala.'
      };
    case 'UNDER_REVIEW':
      return {
        isVerified: false,
        status: 'UNDER_REVIEW',
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Inakaguliwa na Wasimamizi (Under Review)',
        shortLabel: 'Inakaguliwa',
        colorClass: 'text-blue-800',
        bgClass: 'bg-blue-50',
        borderClass: 'border-blue-300',
        description: 'Taarifa na nyaraka zako zinahakikiwa na timu ya usimamizi.'
      };
    case 'PAYMENT_CONFIRMED':
      return {
        isVerified: false,
        status: 'PAYMENT_CONFIRMED',
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Ada Imepokelewa (Inasubiri Review)',
        shortLabel: 'Ada Imelipwa',
        colorClass: 'text-indigo-800',
        bgClass: 'bg-indigo-50',
        borderClass: 'border-indigo-300',
        description: 'Malipo ya ada ya uchakataji yamekamilika. Maombi yanapangwa kukaguliwa.'
      };
    case 'PAYMENT_PENDING':
    case 'PAYMENT_REQUIRED':
      return {
        isVerified: false,
        status: status,
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Inasubiri Malipo ya Ada (TSh 5,000)',
        shortLabel: 'Lipa Ada',
        colorClass: 'text-amber-800',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-300',
        description: 'Tafadhali kamilisha ada ya uchakataji ili maombi yatumwe kukaguliwa.'
      };
    case 'SUBMITTED':
      return {
        isVerified: false,
        status: 'SUBMITTED',
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Maombi Yametumwa',
        shortLabel: 'Yametumwa',
        colorClass: 'text-amber-800',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
        description: 'Maombi yako yamewasilishwa.'
      };
    case 'REJECTED':
      return {
        isVerified: false,
        status: 'REJECTED',
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Uhakiki Bado (Haijakubaliwa)',
        shortLabel: 'Haijakubaliwa',
        colorClass: 'text-rose-800',
        bgClass: 'bg-rose-50',
        borderClass: 'border-rose-300',
        description: 'Maombi hayakukidhi vigezo vya uhakiki. Unaweza kurekebisha na kuomba tena.'
      };
    case 'SUSPENDED':
      return {
        isVerified: false,
        status: 'SUSPENDED',
        badgeStatus: 'SUSPENDED',
        badgeLabel: 'Uhakiki Umesitishwa (Suspended)',
        shortLabel: 'Umesitishwa',
        colorClass: 'text-stone-800',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-400',
        description: 'Uhakiki wa muuzaji umesimamishwa kiutawala.'
      };
    case 'EXPIRED':
      return {
        isVerified: false,
        status: 'EXPIRED',
        badgeStatus: 'EXPIRED',
        badgeLabel: 'Uhakiki Umeisha Muda (Expired)',
        shortLabel: 'Umeisha Muda',
        colorClass: 'text-stone-700',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-300',
        description: 'Muda wa uhakiki umekwisha. Unahitajika kufanya uhakiki upya.'
      };
    case 'REVERIFICATION_REQUIRED':
      return {
        isVerified: isBadgeActive,
        status: 'REVERIFICATION_REQUIRED',
        badgeStatus: badgeStatus || 'INACTIVE',
        badgeLabel: 'Uhakiki Upya Unahitajika (Re-verification)',
        shortLabel: 'Uhakiki Upya',
        colorClass: 'text-amber-900',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-400',
        description: 'Tafadhali sasisha nyaraka au taarifa zako ili kudumisha hadhi ya uhakiki.'
      };
    case 'DRAFT':
      return {
        isVerified: false,
        status: 'DRAFT',
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Rasimu ya Maombi (Draft)',
        shortLabel: 'Rasimu',
        colorClass: 'text-stone-600',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-300',
        description: 'Maombi hayajakamilika au yamerejeshwa kwa marekebisho.'
      };
    case 'NOT_APPLIED':
    default:
      return {
        isVerified: false,
        status: 'NOT_APPLIED',
        badgeStatus: 'INACTIVE',
        badgeLabel: 'Hajahakikiwa (Not Verified)',
        shortLabel: 'Haijahakikiwa',
        colorClass: 'text-stone-600',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-200',
        description: 'Muuzaji hajaomba uhakiki rasmi wa jukwaa.'
      };
  }
}

export const VERIFICATION_TYPES_CONFIG: {
  type: SellerVerificationType;
  labelSwahili: string;
  description: string;
  recommendedDocs: string;
}[] = [
  {
    type: 'INDIVIDUAL',
    labelSwahili: 'Mfugaji Binafsi',
    description: 'Mfugaji anayeuza mifugo au mazao ya shamba lake mwenyewe.',
    recommendedDocs: 'NIDA au Barua ya Utambulisho ya Serikali ya Mtaa/Kijiji'
  },
  {
    type: 'FARM',
    labelSwahili: 'Shamba la Mifugo / Kibiashara',
    description: 'Shamba lililosajiliwa lenye shughuli za uzalishaji wa mifugo au kuku.',
    recommendedDocs: 'NIDA/TIN na Barua/Mkataba wa Eneo la Shamba'
  },
  {
    type: 'BUSINESS',
    labelSwahili: 'Kampuni / Biashara ya Mifugo',
    description: 'Biashara iliyosajiliwa BRELA au yenye Leseni ya Biashara ya Kilimo/Mifugo.',
    recommendedDocs: 'Leseni ya Biashara, Cheti cha BRELA na TIN'
  },
  {
    type: 'COOPERATIVE',
    labelSwahili: 'Chama cha Ushirika (AMCOS / Kikundi)',
    description: 'Kikundi cha wafugaji au ushirika uliosajiliwa kisheria.',
    recommendedDocs: 'Cheti cha Usajili wa Kikundi/Ushirika na Orodha ya Viongozi'
  },
  {
    type: 'AGROVET',
    labelSwahili: 'Duka la Pembejeo & Vifaa (Agrovet)',
    description: 'Wauzaji wa dawa, chanjo, vyakula, na vifaa vya mifugo.',
    recommendedDocs: 'Leseni ya TFDA/TMDA/TPRI na Cheti cha Taaluma'
  },
  {
    type: 'BREEDER',
    labelSwahili: 'Mzalishaji wa Mbegu / Vifaranga (Breeder)',
    description: 'Wazalishaji maalum wa mbegu za mifugo, mitamba, vifaranga, na madume.',
    recommendedDocs: 'Cheti cha Uthibitisho wa Uzalishaji na Vibali vya Mifugo'
  }
];
