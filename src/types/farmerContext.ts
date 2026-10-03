import { EventType, UserProfile, FarmerEventStatistics } from '../types';
import { FarmerLivestockIntelligence, LivestockIntelligenceSnapshot } from './livestockIntelligence';

export interface FarmerProfileContext {
  displayName: string;
  phone?: string;
  location: string;
  mainLivestock: string[];
  livestockTypes: string[];
  role: string;
}

export type GroupStatusInsight =
  | 'Imeongezeka'
  | 'Imepungua'
  | 'Hakuna mabadiliko ya idadi'
  | 'Hakuna matukio bado';

export interface LivestockGroupContext {
  recordId: string;
  recordName: string;
  livestockCategory: string;
  livestockType: string;
  startingQuantity: number;
  totalAdditions: number;
  totalReductions: number;
  currentQuantity: number;
  netChange: number;
  eventCount: number;
  lastEventDate: string | null;
  lastEventType: EventType | null;
  balanceStatus: 'valid' | 'invalid';
  statusInsight: GroupStatusInsight;
}

export interface RecentFarmerEvent {
  eventId: string;
  recordId: string;
  recordName: string;
  livestockType: string;
  eventType: EventType;
  eventDate: string;
  quantity: number | null;
  title: string;
  notes: string;
  createdAt: string;
}

export interface FarmerLevelLivestockContext {
  totalGroups: number;
  totalStartingQuantity: number;
  totalAdditions: number;
  totalReductions: number;
  totalCurrentQuantity: number;
  totalNetChange: number;
  lastActivityDate: string | null;
  lastActivityType: EventType | null;
  lastActivityRecordId: string | null;
  overallBalanceStatus: 'valid' | 'invalid';
  groups: LivestockGroupContext[];
}

export type FarmerContextStatus = 'ready' | 'empty' | 'error';

export interface FarmerContext {
  uid: string;
  status: FarmerContextStatus;
  errorMessage?: string;
  profile: FarmerProfileContext;
  livestock: FarmerLevelLivestockContext;
  eventSummary: FarmerEventStatistics;
  recentEvents: RecentFarmerEvent[];
  intelligence?: FarmerLivestockIntelligence;
  intelligenceSnapshot?: LivestockIntelligenceSnapshot;
  trendsSnapshot?: import('./livestockIntelligence').LivestockTrendsSnapshot;
  movementSnapshot?: import('./livestockIntelligence').LivestockMovementSnapshot;
  healthSnapshot?: import('./livestockIntelligence').HealthActivityHistorySnapshot;
  activitySummarySnapshot?: import('./livestockIntelligence').ActivitySummarySnapshot;
  observationsSnapshot?: import('./livestockIntelligence').ImportantObservationsSnapshot;
  generatedAt: string;
}
