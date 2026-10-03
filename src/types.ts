import { AiMarketplaceRecommendationResult } from './types/marketplaceRecommendation';
import { AiVideoAttachment } from './types/videoPipeline';
import { AiDoctorAction, AiAction } from './types/aiDoctorAction';
import {
  VisualMarketplaceIntentResult,
  NormalizedVisualMarketplaceQuery,
  StructuredVisualMarketplaceQuery,
  VisualMarketplaceAction
} from './types/visualMarketplace';
import { HistoryQuestionResult } from './types/historyQuestionTypes';

export type UserRole = 'farmer' | 'seller' | 'pro' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  name?: string; // Backwards-compatible alias for displayName
  phone: string;
  location: string;
  region?: string; // Backwards-compatible alias for location
  mainLivestock: string[];
  livestockTypes: string[];
  farmingType?: string; // Backwards-compatible alias for primary livestock
  createdAt: string;
  updatedAt: string;
}

export interface LivestockRecord {
  recordId: string;
  userId?: string;
  livestockCategory: string; // e.g. 'Poultry', 'Cattle', 'Goats', 'Pigs', 'Rabbits', 'Fish', 'Beekeeping', 'Other'
  livestockType: string; // e.g. 'Kuku wa Kienyeji', 'Broiler', 'Layers', 'Sasso', 'Friesian', 'Boer', or custom
  quantity: number; // positive number > 0
  recordName?: string; // optional group / batch name
  dateAdded: string; // ISO or YYYY-MM-DD
  notes?: string; // optional notes
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export type EventType =
  | 'addition'
  | 'birth'
  | 'purchase'
  | 'sale'
  | 'death'
  | 'mortality'
  | 'vaccination'
  | 'treatment'
  | 'feed'
  | 'observation'
  | 'other';

export interface LivestockEvent {
  eventId: string;
  eventType: EventType;
  quantity: number | null;
  eventDate: string; // ISO date YYYY-MM-DD
  title: string;
  notes: string;
  description?: string; // backward compatibility
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface FarmRecord {
  id?: string;
  userId: string;
  category: 'kuku' | 'ngombe' | 'mbuzi' | 'nguruwe' | 'sungura' | 'nyingine';
  title: string;
  count: number;
  notes?: string;
  createdAt: string;
}

export interface MarketItem {
  id?: string;
  userId: string;
  sellerName: string;
  title: string;
  category: string;
  price: number;
  location: string;
  contactPhone: string;
  status: 'active' | 'sold' | 'draft';
  createdAt: string;
}

export interface CommunityPost {
  id?: string;
  userId: string;
  authorName: string;
  topic: string;
  content: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

export interface AiImageAttachment {
  localPreviewUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  imageAvailableForModel?: boolean;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  createdAt?: string;
  personalized?: boolean;
  marketplaceRecommendations?: AiMarketplaceRecommendationResult;
  doctorAction?: AiDoctorAction;
  visualMarketplaceIntent?: VisualMarketplaceIntentResult;
  visualMarketplaceQuery?: NormalizedVisualMarketplaceQuery;
  structuredVisualMarketplaceQuery?: StructuredVisualMarketplaceQuery;
  actions?: AiAction[];
  imageAttachment?: AiImageAttachment;
  videoAttachment?: AiVideoAttachment;
  historyQuestionResult?: import('./types/historyQuestionTypes').HistoryQuestionResult;
  contextBundle?: import('./types/contextOrchestration').AIContextBundle;
  daktariIntelligence?: import('./types/aiDaktariLoop').DaktariAIIntelligenceResult;
}

export interface AiConversation {
  conversationId: string;
  uid?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
  status?: 'active' | 'archived' | 'deleted';
  isCustomTitle?: boolean;
}

export interface AiMessage {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  personalized?: boolean;
  marketplaceRecommendations?: AiMarketplaceRecommendationResult;
  doctorAction?: AiDoctorAction;
  historyQuestionResult?: HistoryQuestionResult;
  contextBundle?: import('./types/contextOrchestration').AIContextBundle;
  visualMarketplaceIntent?: VisualMarketplaceIntentResult;
  visualMarketplaceQuery?: NormalizedVisualMarketplaceQuery;
  structuredVisualMarketplaceQuery?: StructuredVisualMarketplaceQuery;
  actions?: AiAction[];
  imageAttachment?: {
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
    imageAvailableForModel?: boolean;
  };
  videoAttachment?: {
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
  };
}

export interface GroupEventStatistics {
  additionCount: number;
  birthCount: number;
  purchaseCount: number;
  saleCount: number;
  deathCount: number;
  mortalityCount: number;
  vaccinationCount: number;
  treatmentCount: number;
  feedCount: number;
  observationCount: number;
  otherCount: number;

  additionQuantity: number;
  birthQuantity: number;
  purchaseQuantity: number;
  saleQuantity: number;
  deathQuantity: number;
  mortalityQuantity: number;
  vaccinationQuantity: number;
  treatmentQuantity: number;
  feedQuantity: number;
  observationQuantity: number;
  otherQuantity: number;

  totalPositiveEvents: number;
  totalNegativeEvents: number;
  totalNeutralEvents: number;
  totalEvents: number;

  totalPositiveQuantity: number;
  totalNegativeQuantity: number;
}

export interface FarmerEventStatistics extends GroupEventStatistics {}

export interface LivestockGroupSummary {
  recordId: string;
  recordName: string;
  livestockCategory: string;
  livestockType: string;
  startingQuantity: number;
  totalAdditions: number;
  totalReductions: number;
  currentQuantity: number;
  netChange: number;
  balanceStatus: 'valid' | 'invalid';
  eventCount: number;
  lastEventDate: string | null;
  lastEventType: EventType | null;
  lastEventTitle: string | null;
  eventStats: GroupEventStatistics;
}

export interface FarmerLivestockSnapshot {
  uid: string;
  totalGroups: number;
  totalStartingQuantity: number;
  totalAdditions: number;
  totalReductions: number;
  totalCurrentQuantity: number;
  netChange: number;
  lastEventDate: string | null;
  lastEventType: EventType | null;
  lastEventRecordId: string | null;
  lastEventTitle: string | null;
  overallBalanceStatus: 'valid' | 'invalid';
  eventStats: FarmerEventStatistics;
  groupSummaries: LivestockGroupSummary[];
}

export interface Veterinarian {
  id: string;
  name: string;
  title: string;
  qualification: string;
  vctNumber: string; // Veterinary Council of Tanzania registration
  phone: string;
  whatsapp: string;
  email?: string;
  region: string;
  district: string;
  ward: string;
  specialties: string[];
  experienceYears: number;
  rating: number;
  reviewsCount: number;
  isAvailable: boolean;
  availabilityStatus: 'available' | 'emergency_only' | 'busy';
  isEmergencyAvailable: boolean;
  consultationFee: {
    callFee?: string;
    visitFeeEstimate?: string;
  };
  bio: string;
  verified: boolean;
  clinicName?: string;
  avatarUrl?: string;
}

export interface AgrovetShop {
  id: string;
  name: string;
  owner: string;
  region: string;
  district: string;
  location: string;
  phone: string;
  whatsapp: string;
  products: string[];
  isOpen: boolean;
  openingHours: string;
  verified: boolean;
}

export interface FarmVisitBooking {
  id: string;
  userId: string;
  farmerName: string;
  farmerPhone: string;
  vetId: string;
  vetName: string;
  vetPhone: string;
  livestockCategory: string;
  livestockCount: number;
  preferredDate: string;
  preferredTime: string;
  region: string;
  district: string;
  locationAddress: string;
  description: string;
  urgency: 'normal' | 'urgent' | 'emergency';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface EmergencyVetRequest {
  id: string;
  farmerName: string;
  farmerPhone: string;
  region: string;
  district: string;
  livestockType: string;
  affectedCount: number;
  symptoms: string;
  status: 'active' | 'resolved';
  createdAt: string;
}

export * from './types/farmerContext';
export * from './types/livestockIntelligence';
export * from './types/marketplace';
export * from './types/imagePipeline';
export * from './types/videoPipeline';
export * from './types/aiDoctorAction';
export * from './types/visualMarketplace';
export * from './types/historyQuestionTypes';
export type {
  ProfessionalType,
  RegistrationStatus,
  DoctorVerificationStatus,
  SubscriptionStatus,
  RegistrationPaymentStatus,
  ProfessionalProfile,
  ProfessionalCredentials,
  DoctorFilterOptions
} from './types/daktari';
export * from './types/contextOrchestration';

