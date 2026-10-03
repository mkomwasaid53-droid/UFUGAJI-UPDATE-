export type ProfessionalType =
  | 'Veterinarian' // Daktari wa Mifugo (BVM / DVM)
  | 'Animal Health Professional' // Afisa Afya ya Mifugo (AH)
  | 'Livestock Extension Professional' // Afisa Ugani wa Mifugo (LEA)
  | string;

export type RegistrationStatus =
  | 'not_registered'
  | 'registered'
  | 'submitted'
  | 'active'
  | 'suspended';

export type DoctorVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'needs_correction';

export type VerificationStatus = DoctorVerificationStatus;

export type SubscriptionStatus =
  | 'unpaid'
  | 'free_trial'
  | 'pending'
  | 'paid'
  | 'expired';

export type RegistrationPaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid';

export interface ProfessionalProfile {
  uid: string;
  fullName: string;
  professionalTitle: string; // e.g. "Dkt. Juma Ally", "Afisa Ugani Grace Mwangi"
  professionalType: ProfessionalType;
  phone: string;
  whatsapp: string;
  region: string;
  district: string;
  wardOrArea: string;
  locationDescription?: string;
  livestockSpecialties: string[]; // e.g. ['Kuku', 'Ng\'ombe wa Maziwa', 'Mbuzi']
  services: string[]; // e.g. ['Ziara ya Shamba', 'Ushauri wa Afya', 'Chanjo']
  availability: 'available_today' | 'weekdays' | 'by_appointment' | 'always' | string;
  emergencyAvailable: boolean;
  bio: string;
  profileImage?: string;

  // Registration & Verification (CRITICAL: Registration is NOT Verification)
  registrationStatus: RegistrationStatus;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt?: string | null;
  verifiedAt?: string | null;
  adminVerificationNotes?: string | null;

  // Monetization & Subscription Architecture
  registrationFee: number; // 5000 Tsh
  registrationPaymentStatus: RegistrationPaymentStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  freeTrialStart?: string | null;
  freeTrialEnd?: string | null;
  nextPaymentDue?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalCredentials {
  uid: string;
  professionalRegistrationNumber: string; // e.g. VCT registration number
  professionalQualification: string; // e.g. Degree in Veterinary Medicine, Diploma in Animal Health
  institution: string; // e.g. SUA, LITA Tengeru
  graduationYear: string | number;
  documentUrls?: string[];
  documentNotes?: string;
  submittedAt: string;
  updatedAt: string;
}

export interface DoctorFilterOptions {
  query?: string;
  region?: string;
  district?: string;
  livestockType?: string;
  service?: string;
  emergencyOnly?: boolean;
  verifiedOnly?: boolean;
}
