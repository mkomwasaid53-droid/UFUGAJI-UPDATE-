/**
 * V1.6A — SELLER IDENTITY & VERIFICATION TYPES
 * Phase 5: Marketplace Trust
 *
 * Core Principle: "REGISTERED ≠ VERIFIED"
 *
 * Establishes an authoritative data model separating:
 * 1. User Identity (Auth UID)
 * 2. Seller Profile (Descriptive data)
 * 3. Digital Shop (Storefront navigation)
 * 4. Seller Verification (Authoritative record & verification decisions)
 */

export type SellerVerificationStatus =
  | 'NOT_APPLIED'
  | 'PENDING_VERIFICATION'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'EXPIRED';

export type SellerVerificationType =
  | 'INDIVIDUAL'    // Mfugaji Binafsi
  | 'FARM'          // Shamba la Mifugo
  | 'BUSINESS'      // Kampuni / Biashara
  | 'COOPERATIVE'   // Chama cha Ushirika (AMCOS/Kikundi)
  | 'AGROVET'       // Duka la Pembejeo na Vifaa vya Mifugo
  | 'BREEDER';      // Mzalishaji wa Mbegu / Vifaranga

export interface SellerVerification {
  sellerId: string; // Auth UID
  status: SellerVerificationStatus;
  verificationType: SellerVerificationType;
  businessName: string;
  displayName: string;
  phone: string;
  location: string;
  district?: string;
  
  // Verification evidence / references
  nationalId?: string;       // NIDA / Kitambulisho cha Taifa
  tinNumber?: string;        // Namba ya Utambulisho wa Mlipa Kodi (TIN)
  permitReference?: string;  // Barua ya Serikali ya Mtaa / Kijiji au Leseni
  documentNotes?: string;    // Maelezo ya uthibitisho

  // Lifecycle & audit trail
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;       // Admin UID / identifier
  rejectionReason?: string;
  suspensionReason?: string;
  notes?: string;

  // Authoritative Trust Badge
  badgeEligible: boolean;
  publicBadgeText: string;
  updatedAt: string;
}

export interface SellerVerificationApplicationInput {
  verificationType: SellerVerificationType;
  businessName: string;
  displayName: string;
  phone: string;
  location: string;
  district?: string;
  nationalId?: string;
  tinNumber?: string;
  permitReference?: string;
  documentNotes?: string;
  notes?: string;
}

export interface VerificationBadgeDisplay {
  isVerified: boolean;
  status: SellerVerificationStatus;
  badgeLabel: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

/**
 * Maps verification status to human-readable Swahili presentation
 */
export function getSellerVerificationDisplay(status?: SellerVerificationStatus | null): VerificationBadgeDisplay {
  switch (status) {
    case 'VERIFIED':
      return {
        isVerified: true,
        status: 'VERIFIED',
        badgeLabel: 'Muuzaji Aliyethibitishwa',
        shortLabel: 'Aliyethibitishwa',
        colorClass: 'text-emerald-900',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-300'
      };
    case 'PENDING_VERIFICATION':
      return {
        isVerified: false,
        status: 'PENDING_VERIFICATION',
        badgeLabel: 'Inasubiri Uhakiki',
        shortLabel: 'Inasubiri',
        colorClass: 'text-amber-800',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-300'
      };
    case 'UNDER_REVIEW':
      return {
        isVerified: false,
        status: 'UNDER_REVIEW',
        badgeLabel: 'Inakaguliwa na Wasimamizi',
        shortLabel: 'Inakaguliwa',
        colorClass: 'text-blue-800',
        bgClass: 'bg-blue-50',
        borderClass: 'border-blue-300'
      };
    case 'REJECTED':
      return {
        isVerified: false,
        status: 'REJECTED',
        badgeLabel: 'Uhakiki Bado (Haijakubaliwa)',
        shortLabel: 'Haijakubaliwa',
        colorClass: 'text-rose-800',
        bgClass: 'bg-rose-50',
        borderClass: 'border-rose-300'
      };
    case 'SUSPENDED':
      return {
        isVerified: false,
        status: 'SUSPENDED',
        badgeLabel: 'Uhakiki Umesitishwa',
        shortLabel: 'Umesitishwa',
        colorClass: 'text-stone-800',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-400'
      };
    case 'EXPIRED':
      return {
        isVerified: false,
        status: 'EXPIRED',
        badgeLabel: 'Uhakiki Umeisha Muda',
        shortLabel: 'Umeisha Muda',
        colorClass: 'text-stone-700',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-300'
      };
    case 'NOT_APPLIED':
    default:
      return {
        isVerified: false,
        status: 'NOT_APPLIED',
        badgeLabel: 'Haijahakikiwa',
        shortLabel: 'Haijahakikiwa',
        colorClass: 'text-stone-600',
        bgClass: 'bg-stone-100',
        borderClass: 'border-stone-200'
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
    type: 'AGROVET',
    labelSwahili: 'Duka la Pembejeo & Vifaa (Agrovet)',
    description: 'Wauzaji wa vyakula, madini, chanjo na vifaa vya ufugaji.',
    recommendedDocs: 'Leseni ya Biashara, TIN au Kibali cha TFDA/VETA'
  },
  {
    type: 'BREEDER',
    labelSwahili: 'Mzalishaji wa Vifaranga / Mbegu',
    description: 'Wazalishaji wa vifaranga vya siku moja, mayai ya kutotolesha au mbegu bora.',
    recommendedDocs: 'Kibali cha Uzalishaji au Utambulisho wa Kitalu/Hatchery'
  },
  {
    type: 'COOPERATIVE',
    labelSwahili: 'Chama cha Ushirika / AMCOS',
    description: 'Vikundi vilivyosajiliwa vya wafugaji vinavyouza kwa pamoja.',
    recommendedDocs: 'Hati ya Usajili wa Chama cha Ushirika au Kikundi'
  },
  {
    type: 'BUSINESS',
    labelSwahili: 'Kampuni / Biashara Rasmi',
    description: 'Wafanyabiashara na wasambazaji rasmi wa bidhaa za kilimo na mifugo.',
    recommendedDocs: 'Hati ya BRELA, TIN na Leseni ya Biashara'
  }
];
