import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db, auth } from '../lib/firebase';
import { classifyFirestoreError } from '../utils/firestoreErrorClassifier';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import {
  Send,
  Bot,
  User,
  Loader2,
  Stethoscope,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  PlusCircle,
  Trash2,
  Pencil,
  Check,
  X,
  MessageSquareOff,
  History,
  AlertCircle,
  Search,
  RefreshCw,
  Image as ImageIcon,
  Film,
  Video,
  Clock,
  Shield,
  CreditCard,
  Smartphone,
  ArrowRight,
  Paperclip,
  MoreVertical
} from 'lucide-react';
import {
  AiChatMessage,
  AiConversation,
  AiMessage,
  AiImageAttachment,
  AiVideoAttachment,
  LivestockRecord,
  LivestockEvent
} from '../types';
import { buildFarmerContext, serializeFarmerContextForAI } from '../utils/farmerContext';
import { generateConversationTitle } from '../utils/conversationTitle';
import { fetchMarketplaceProducts, fetchAllPublishedShops } from '../services/marketplaceService';
import { MarketplaceProduct, DigitalShop } from '../types/marketplace';
import { AiMarketplaceRecommendationResult } from '../types/marketplaceRecommendation';
import { getMarketplaceRecommendations, getVisualMarketplaceRecommendations } from '../services/marketplaceRecommendationService';
import { AiMarketplaceRecommendations } from '../components/ai/AiMarketplaceRecommendations';
import { AiImageAttachmentPreview } from '../components/ai/AiImageAttachmentPreview';
import { AiMessageImageBubble } from '../components/ai/AiMessageImageBubble';
import { AiVideoAttachmentPreview } from '../components/ai/AiVideoAttachmentPreview';
import { AiMessageVideoBubble } from '../components/ai/AiMessageVideoBubble';
import { AiMessageContent } from '../components/ai/AiMessageContent';
import { ProductDetailModal } from '../components/marketplace/ProductDetailModal';
import { AiDoctorActionCta } from '../components/ai/AiDoctorActionCta';
import { AiDoctorAction } from '../types/aiDoctorAction';
import { AiVisualMarketplaceCta } from '../components/ai/AiVisualMarketplaceCta';
import { AiHistoryQuestionProofCard } from '../components/AiHistoryQuestionProofCard';
import { AiContextOrchestrationCard } from '../components/AiContextOrchestrationCard';
import { getHistoryQuestionResult } from '../services/livestockHistoryQuestionService';
import { classifyVisualMarketplaceIntent } from '../services/visualIntentService';
import {
  VisualMarketplaceIntentResult,
  VisualMarketplaceAction,
  VisualConversationHistoryMessage,
  StructuredVisualMarketplaceQuery
} from '../types/visualMarketplace';
import { validateAndSanitizeVisualIntentResult } from '../utils/visualMarketplaceNormalizer';
import { classifyDoctorIntent, validateAndSanitizeDoctorAction } from '../utils/doctorHandoffClassifier';
import { validateImageFile } from '../utils/imageValidation';
import { IMAGE_PIPELINE_STAGES, IMAGE_ERROR_CATEGORIES } from '../types/imagePipeline';
import { validateVideoFile } from '../utils/videoValidation';
import { daktariService } from '../services/daktariService';
import { ProfessionalProfile } from '../types/daktari';
import {
  VideoInputState,
  VIDEO_PIPELINE_STAGES,
  VIDEO_ERROR_CATEGORIES,
  VIDEO_PROCESSING_LIMITS,
  mapVideoErrorToSwahili,
} from '../types/videoPipeline';
import { AiRewardedAdPlayerModal } from '../components/ai/AiRewardedAdPlayerModal';
import { 
  AdPresentationLifecycleState, 
  AdProviderMode, 
  AdPlatform 
} from '../types/aiUsageAndCache';

const DEFAULT_WELCOME_MESSAGE: AiChatMessage = {
  id: 'welcome-1',
  role: 'model',
  text: `Habari ndugu mfugaji! Mimi ni Msaidizi wako wa Kilimo na Ufugaji kutoka **UFUGAJI UPDATE**.\n\nNinaweza kukusaidia kwa kutoa miongozo na elimu kuhusu:\n• Ulishaji na lishe bora ya mifugo (Kuku, Ng'ombe, Mbuzi, Nguruwe)\n• Ujenzi na usafi wa mabanda\n• Ratiba za kawaida za chanjo na kinga\n• Mbinu bora za kuongeza uzalishaji wa mayai na maziwa\n• Ufuatiliaji wa idadi na mabadiliko ya mifugo yako\n\nUna swali gani la kilimo au ufugaji leo?`,
  timestamp: new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }),
  createdAt: new Date().toISOString()
};

// Swahili relative date helper for conversation list
function formatSwahiliDate(isoStr?: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    const timeStr = d.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return `Leo, ${timeStr}`;
    }
    if (isYesterday) {
      return `Jana, ${timeStr}`;
    }

    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
    const month = months[d.getMonth()] || '';
    return `${day} ${month}, ${timeStr}`;
  } catch {
    return '';
  }
}

// Helper to format file size for attachment displays
function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Recursively sanitizes an object before saving to Firestore.
 * Strips all keys whose values are undefined (which crash Firestore setDoc/updateDoc).
 */
function sanitizeFirestoreData<T>(val: T): T {
  if (val === undefined) {
    return null as any;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreData(item)) as any;
  }
  if (val instanceof Date) {
    return val;
  }
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      cleaned[k] = sanitizeFirestoreData(v);
    }
  }
  return cleaned as T;
}

// Helper to determine active UID - strictly isolated per authenticated user
function getResolvedUid(firebaseUid?: string | null): string {
  if (firebaseUid && typeof firebaseUid === 'string' && firebaseUid.trim().length > 0) {
    return firebaseUid.trim();
  }
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  return '';
}

function getPersistentClientId(): string {
  if (typeof window === 'undefined') return 'guest_farmer';
  try {
    let devId = localStorage.getItem('ufugaji_ai_device_id');
    if (!devId || devId.trim().length === 0) {
      devId = 'guest_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('ufugaji_ai_device_id', devId);
    }
    return devId;
  } catch {
    return 'guest_farmer';
  }
}

export const AiAssistant: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialConvParam = searchParams.get('conv') || searchParams.get('c') || '';

  const authUid = currentUser?.uid || auth.currentUser?.uid || null;
  const effectiveUserId = useMemo(() => {
    return authUid || getPersistentClientId();
  }, [authUid]);
  const activeUid = useMemo(() => {
    return authUid || '';
  }, [authUid]);

  // Active conversation ID state — Defaults to null (new conversation) on entry
  // User is not forced into a previous conversation unless an explicit conversation ID is provided in URL params.
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => {
    if (initialConvParam) return initialConvParam;
    return null;
  });

  // Conversations list loaded initially from local cache
  const [conversations, setConversations] = useState<AiConversation[]>(() => {
    if (!authUid) return [];
    try {
      const cached = localStorage.getItem(`ai_conversations_${authUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // Messages initial state — Defaults to fresh welcome state ("Mazungumzo Mapya"), unless explicitly requested via URL
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    if (initialConvParam && authUid) {
      try {
        const cached = localStorage.getItem(`ai_conv_messages_${authUid}_${initialConvParam}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [DEFAULT_WELCOME_MESSAGE];
  });

  const [input, setInput] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isAiOverflowOpen, setIsAiOverflowOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  // Close AI Assistant header overflow menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setIsAiOverflowOpen(false);
      }
    };
    if (isAiOverflowOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isAiOverflowOpen]);

  // AI Image Input & Validation state (V1.1.1 & V1.1.2)
  interface SelectedImageState {
    file: File;
    previewUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
  }
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);
  const [imageSelectError, setImageSelectError] = useState<string | null>(null);
  const [isValidatingImage, setIsValidatingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Video Input & Validation state (V1.2A Video Input Foundation)
  interface SelectedVideoState {
    file: File;
    previewUrl: string;
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    duration?: number;
    width?: number;
    height?: number;
  }
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideoState | null>(null);
  const [videoSelectError, setVideoSelectError] = useState<string | null>(null);
  const [videoInputState, setVideoInputState] = useState<VideoInputState>('NO_VIDEO');
  const isValidatingVideo = videoInputState === 'VIDEO_VALIDATING';
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Active processing type for truthful progress UI indicator (text | image | video)
  const [activeProcessingType, setActiveProcessingType] = useState<'text' | 'image' | 'video' | null>(null);
  // Abort controller ref for client-side cancellation of in-flight video requests
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Unified Media (Image & Video) Attachment Dropdown state
  const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false);
  const mediaMenuRef = useRef<HTMLDivElement>(null);

  // Multi-line Textarea input ref and dynamic height auto-expansion up to 6 lines
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Expands downward up to at least 6 lines of text (~150-160px; min 44px)
    const targetHeight = Math.max(44, Math.min(el.scrollHeight, 160));
    el.style.height = `${targetHeight}px`;
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Click outside to close media menu
  useEffect(() => {
    if (!isMediaMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mediaMenuRef.current && !mediaMenuRef.current.contains(e.target as Node)) {
        setIsMediaMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMediaMenuOpen]);

  // Synchronous submission lock to prevent double-send / rapid enter or touch repeats
  const isSendingRef = useRef(false);

  // Preserve failed request parameters for safe, non-duplicating retry
  const lastFailedRequestRef = useRef<{
    text: string;
    imageState?: SelectedImageState | null;
    videoState?: SelectedVideoState | null;
    userMessageId?: string;
  } | null>(null);

  // Keep track of active blob URLs for memory cleanup on unmount
  const activeBlobUrlsRef = useRef<Set<string>>(new Set());

  // V1.2D: In-memory session media attachment cache keyed by messageId to isolate attachments per conversation
  const sessionMediaBlobsRef = useRef<Map<string, {
    conversationId: string;
    videoPreviewUrl?: string;
    imagePreviewUrl?: string;
  }>>(new Map());

  // V1.8B: Server-authoritative Free Quota & Entitlement state
  interface UserQuotaInfo {
    freeLimit: number;
    freeUsed: number;
    freeRemaining: number;
    entitlementTier: string;
    canUseAdReward: boolean;
    mediaAllowed: boolean;
    isBlocked: boolean;
    remainingTextQueries?: number;
    adRewardRemaining?: number;
  }
  const [userQuotaInfo, setUserQuotaInfo] = useState<UserQuotaInfo | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const devId = localStorage.getItem('ufugaji_ai_device_id');
      const targetId = auth.currentUser?.uid || devId;
      if (targetId) {
        const cached = localStorage.getItem(`ufugaji_ai_quota_${targetId}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return null;
  });

  const updateUserQuota = useCallback((newQuota: UserQuotaInfo | null) => {
    setUserQuotaInfo(newQuota);
    if (newQuota && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`ufugaji_ai_quota_${effectiveUserId}`, JSON.stringify(newQuota));
      } catch {}
    }
  }, [effectiveUserId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cached = localStorage.getItem(`ufugaji_ai_quota_${effectiveUserId}`);
      if (cached) {
        setUserQuotaInfo(JSON.parse(cached));
      }
    } catch {}
  }, [effectiveUserId]);

  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [adRewardSuccessMessage, setAdRewardSuccessMessage] = useState<string | null>(null);

  // V1.9C-CORRECTIVE — Real Rewarded Ad Player Modal & Controlled Lifecycle States
  interface AdRewardNotice {
    type: 'success' | 'warning' | 'info' | 'error';
    message: string;
  }
  const [adRewardNotification, setAdRewardNotification] = useState<AdRewardNotice | null>(null);
  const [isAdModalOpen, setIsAdModalOpen] = useState<boolean>(false);
  const [adLifecycleState, setAdLifecycleState] = useState<AdPresentationLifecycleState>('AD_REQUESTED');
  const [activeAdSession, setActiveAdSession] = useState<{
    rewardId?: string;
    providerSessionId?: string;
    providerRewardId?: string;
    rewardToken?: string;
    adProvider: string;
    mode: AdProviderMode;
    platform: AdPlatform;
    adUnitId?: string;
    diagnostic?: any;
  } | null>(null);
  const [adModalError, setAdModalError] = useState<string | null>(null);
  const isVerifyingAdRewardRef = useRef<boolean>(false);
  const verifiedAdTokensRef = useRef<Set<string>>(new Set());

  // V1.8C: Authoritative Premium Product Catalog and Selection state
  interface AvailablePlan {
    id?: string;
    planId?: string;
    planType: 'WEEKLY' | 'MONTHLY' | 'ANNUAL';
    name?: string;
    displayName?: string;
    nameSwahili?: string;
    description?: string;
    descriptionSwahili?: string;
    priceAmount?: number;
    indicativePrice?: number;
    currency?: string;
    durationDays?: number;
    dailyQueryLimit?: number;
    dailyAiLimit?: number;
    mediaAllowed?: boolean;
    mediaAccess?: boolean;
    prioritySupport?: boolean;
  }
  interface UserPremiumDetails {
    tier: 'FREE' | 'PREMIUM';
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'REVOKED' | 'SUSPENDED' | 'PENDING';
    packageType: string;
    isPremiumActive: boolean;
    mediaAllowed: boolean;
    expiresAt: string | null;
    daysRemaining: number | null;
    dailyLimit: number;
    pendingPlan?: any;
  }
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
  const [userPremiumDetails, setUserPremiumDetails] = useState<UserPremiumDetails | null>(null);
  const [selectedPlanIntent, setSelectedPlanIntent] = useState<any | null>(null);
  const [planSelectionLoading, setPlanSelectionLoading] = useState(false);
  const [planSelectionError, setPlanSelectionError] = useState<string | null>(null);

  // V1.8E PlusPesa Payment Initiation & Tracking State
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<AvailablePlan | null>(null);
  const [paymentPhone, setPaymentPhone] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [paymentTransaction, setPaymentTransaction] = useState<any | null>(null);
  const [paymentPolling, setPaymentPolling] = useState<boolean>(false);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);

  // Synchronize phone with userProfile if available
  useEffect(() => {
    if (userProfile?.phoneNumber && !paymentPhone) {
      setPaymentPhone(userProfile.phoneNumber);
    }
  }, [userProfile?.phoneNumber]);

  // Helper to extract unified authentication headers and authoritative user UID
  const getAiAuthContext = useCallback(async () => {
    const activeAuthUser = currentUser || auth.currentUser;
    const resolvedUid = activeAuthUser?.uid || authUid || effectiveUserId;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (resolvedUid) {
      headers['x-user-id'] = resolvedUid;
    }

    if (activeAuthUser) {
      try {
        const idToken = await activeAuthUser.getIdToken();
        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }
      } catch {
        // non-blocking if token fetch fails
      }
      if (activeAuthUser.email) {
        headers['x-user-email'] = activeAuthUser.email;
      }
    } else if (userProfile?.email) {
      headers['x-user-email'] = userProfile.email;
    }

    if (userProfile?.role) {
      headers['x-user-role'] = userProfile.role;
    }

    return {
      headers,
      resolvedUid,
      customerEmail: activeAuthUser?.email || userProfile?.email || undefined,
      customerName: userProfile?.displayName || activeAuthUser?.displayName || undefined
    };
  }, [currentUser, authUid, effectiveUserId, userProfile]);

  // Refresh authoritative premium & entitlement helper
  const refreshAuthoritativeEntitlements = useCallback(() => {
    const targetUid = effectiveUserId;
    if (!targetUid) return;

    getAiAuthContext().then(({ headers }) => {
      fetch(`/api/ai/premium-status/${encodeURIComponent(targetUid)}`, { headers })
        .then((r) => r.json())
        .then((d) => {
          if (d.status === 'ok') {
            setUserPremiumDetails(d);
          }
        })
        .catch(() => {});

      fetch(`/api/ai/entitlement/${encodeURIComponent(targetUid)}`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (!data || data.error) return;
          const limit = typeof data.freeLimit === 'number' ? data.freeLimit : 10;
          const used = typeof data.freeUsed === 'number' ? data.freeUsed : 0;
          const remaining = typeof data.freeRemaining === 'number' ? data.freeRemaining : Math.max(0, limit - used);
          const adRewardRem = typeof data.adRewardRemaining === 'number'
            ? data.adRewardRemaining
            : (typeof data.summary?.currentAdRewardRemaining === 'number' ? data.summary.currentAdRewardRemaining : 0);
          const remainingQueries = typeof data.remainingTextQueries === 'number'
            ? data.remainingTextQueries
            : (remaining + adRewardRem);
          const tier = data.entitlementTier || 'FREE';
          updateUserQuota({
            freeLimit: limit,
            freeUsed: used,
            freeRemaining: remaining,
            adRewardRemaining: adRewardRem,
            remainingTextQueries: remainingQueries,
            entitlementTier: tier,
            canUseAdReward: Boolean(data.canUseAdReward),
            mediaAllowed: Boolean(data.mediaAllowed),
            isBlocked: tier === 'FREE' && remainingQueries <= 0
          });
        })
        .catch(() => {});
    });
  }, [effectiveUserId, getAiAuthContext, updateUserQuota]);

  // Load plans and authoritative premium status when modal opens
  useEffect(() => {
    if (!showPremiumModal) return;
    refreshAuthoritativeEntitlements();
    fetch('/api/ai/plans')
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok' && Array.isArray(d.plans)) {
          setAvailablePlans(d.plans);
        }
      })
      .catch(() => {});
  }, [showPremiumModal, refreshAuthoritativeEntitlements]);

  // Detect Tanzanian mobile carrier for payment UX
  const detectedCarrier = useMemo(() => {
    const clean = paymentPhone.replace(/\D/g, '');
    let prefix = '';
    if (clean.startsWith('255') && clean.length >= 5) {
      prefix = clean.slice(3, 5);
    } else if (clean.startsWith('0') && clean.length >= 3) {
      prefix = clean.slice(1, 3);
    } else if (clean.length >= 2) {
      prefix = clean.slice(0, 2);
    }
    if (['74', '75', '76'].includes(prefix)) {
      return { name: 'Vodacom M-Pesa', suggestedProvider: 'Mpesa', badgeClass: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (['71', '65', '67', '77'].includes(prefix)) {
      return { name: 'Tigo Pesa', suggestedProvider: 'Tigo', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (['78', '79', '68', '69'].includes(prefix)) {
      return { name: 'Airtel Money', suggestedProvider: 'Airtel', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (['62'].includes(prefix)) {
      return { name: 'Halopesa', suggestedProvider: 'Halopesa', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200' };
    }
    if (['73'].includes(prefix)) {
      return { name: 'Azampesa', suggestedProvider: 'Azampesa', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' };
    }
    return null;
  }, [paymentPhone]);

  const handleSelectPlan = async (planType: 'WEEKLY' | 'MONTHLY' | 'ANNUAL') => {
    setPlanSelectionLoading(true);
    setPlanSelectionError(null);
    setPaymentSuccess(false);
    setPaymentTransaction(null);
    try {
      const { headers, resolvedUid } = await getAiAuthContext();
      const res = await fetch('/api/ai/plans/select', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: resolvedUid, planType })
      });
      const data = await res.json();
      if (data.status === 'ok' && data.intent) {
        setSelectedPlanIntent(data);
        const matchingPlan = availablePlans.find((p) => p.planType === planType) || {
          planType,
          nameSwahili: planType === 'WEEKLY' ? 'Wiki Moja' : planType === 'MONTHLY' ? 'Mwezi Mmoja' : 'Mwaka Mmoja',
          priceAmount: planType === 'WEEKLY' ? 3000 : planType === 'MONTHLY' ? 10000 : 90000,
          currency: 'TZS',
          durationDays: planType === 'WEEKLY' ? 7 : planType === 'MONTHLY' ? 30 : 365,
          dailyQueryLimit: 50
        };
        setSelectedPlanForPayment(matchingPlan);
      } else {
        setPlanSelectionError(data.error || 'Haikuweza kuandaa ombi la kifurushi.');
      }
    } catch {
      setPlanSelectionError('Hitilafu ya mtandao wakati wa kuchagua kifurushi.');
    } finally {
      setPlanSelectionLoading(false);
    }
  };

  const handleInitiatePlusPesaPayment = async () => {
    if (!selectedPlanForPayment) return;
    setPaymentLoading(true);
    setPlanSelectionError(null);
    try {
      const { headers, resolvedUid, customerEmail, customerName } = await getAiAuthContext();
      const planId = selectedPlanForPayment.planId || selectedPlanForPayment.id || `plan_${selectedPlanForPayment.planType.toLowerCase()}`;
      const effectiveNetwork = selectedNetwork || detectedCarrier?.suggestedProvider || undefined;
      const res = await fetch('/api/ai/payment/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: resolvedUid,
          planId,
          planType: selectedPlanForPayment.planType,
          customerPhone: paymentPhone.trim(),
          providerNetwork: effectiveNetwork,
          customerEmail,
          customerName
        })
      });
      const data = await res.json();
      if (res.ok && data.transaction) {
        setPaymentTransaction(data.transaction);
        if (data.transaction.status === 'SUCCESS') {
          setPaymentSuccess(true);
          refreshAuthoritativeEntitlements();
        }
      } else {
        setPlanSelectionError(data.error || 'Haikuweza kuanzisha muamala wa malipo.');
      }
    } catch {
      setPlanSelectionError('Hitilafu ya mtandao wakati wa kuanzisha malipo ya PlusPesa.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePollPaymentStatus = async (paymentId: string) => {
    setPaymentPolling(true);
    try {
      const { headers, resolvedUid } = await getAiAuthContext();
      const res = await fetch(`/api/ai/payment/poll/${encodeURIComponent(paymentId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: resolvedUid })
      });
      const data = await res.json();
      if (res.ok && data.transaction) {
        setPaymentTransaction(data.transaction);
        if (data.transaction.status === 'SUCCESS' || data.entitlementActivated) {
          setPaymentSuccess(true);
          refreshAuthoritativeEntitlements();
        }
      }
    } catch {
      // ignore transient polling errors
    } finally {
      setPaymentPolling(false);
    }
  };

  // Auto-poll while payment is in PROCESSING or PENDING state
  useEffect(() => {
    if (!paymentTransaction) return;
    const status = paymentTransaction.status;
    if (status !== 'PROCESSING' && status !== 'PENDING') return;

    const timer = setInterval(() => {
      handlePollPaymentStatus(paymentTransaction.paymentId);
    }, 4000);

    return () => clearInterval(timer);
  }, [paymentTransaction]);

  // Load entitlement quota from server for active user
  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;
    const targetUid = effectiveUserId;
    fetch(`/api/ai/entitlement/${encodeURIComponent(targetUid)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted || !data || data.error) return;
        const limit = typeof data.freeLimit === 'number' ? data.freeLimit : 10;
        const used = typeof data.freeUsed === 'number' ? data.freeUsed : 0;
        const remaining = typeof data.freeRemaining === 'number' ? data.freeRemaining : Math.max(0, limit - used);
        const adRewardRem = typeof data.adRewardRemaining === 'number'
          ? data.adRewardRemaining
          : (typeof data.summary?.currentAdRewardRemaining === 'number' ? data.summary.currentAdRewardRemaining : 0);
        const remainingQueries = typeof data.remainingTextQueries === 'number'
          ? data.remainingTextQueries
          : (remaining + adRewardRem);
        const tier = data.entitlementTier || 'FREE';
        updateUserQuota({
          freeLimit: limit,
          freeUsed: used,
          freeRemaining: remaining,
          adRewardRemaining: adRewardRem,
          remainingTextQueries: remainingQueries,
          entitlementTier: tier,
          canUseAdReward: Boolean(data.canUseAdReward),
          mediaAllowed: Boolean(data.mediaAllowed),
          isBlocked: tier === 'FREE' && remainingQueries <= 0
        });
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [authLoading, effectiveUserId, updateUserQuota]);

  // V1.9C-CORRECTIVE — Real Rewarded Ad Presentation & Server-Authoritative Lifecycle Flow
  const handleWatchAdReward = async () => {
    setActiveAdSession(null);
    setAdRewardNotification(null);
    setAdRewardSuccessMessage(null);

    // 1. Client-Side Pre-Check: Premium users or users who still have remaining queries
    if (userQuotaInfo?.entitlementTier === 'PREMIUM') {
      const premiumNotice = 'Watumiaji wa Premium wana maswali ya kila siku na hawahitaji kutazama matangazo.';
      setAdRewardNotification({
        type: 'info',
        message: premiumNotice
      });
      setAdRewardSuccessMessage(premiumNotice);
      return;
    }

    if ((userQuotaInfo?.remainingTextQueries ?? 0) > 0) {
      const remainingNotice = `Bado una maswali ${userQuotaInfo?.remainingTextQueries} ya AI. Tangazo litapatikana utakapomaliza maswali yako ya sasa.`;
      setAdRewardNotification({
        type: 'info',
        message: remainingNotice
      });
      setAdRewardSuccessMessage(remainingNotice);
      return;
    }

    setIsWatchingAd(true);
    setAdLifecycleState('AD_REQUESTED');
    setAdModalError(null);

    try {
      const { headers, resolvedUid } = await getAiAuthContext();
      const targetUid = resolvedUid || effectiveUserId;

      // 2. Authoritative Eligibility Check
      try {
        const eligRes = await fetch(`/api/ai/ads/eligibility/${targetUid}`, { headers });
        if (eligRes.ok) {
          const eligData = await eligRes.json();
          if (!eligData.eligible) {
            setIsWatchingAd(false);
            const reason = eligData.reason || 'Huwezi kupokea zawadi ya tangazo kwa sasa.';
            setAdRewardNotification({
              type: 'warning',
              message: reason
            });
            setAdRewardSuccessMessage(reason);
            refreshAuthoritativeEntitlements();
            return;
          }
        }
      } catch (eligErr) {
        console.warn('Pre-eligibility check bypassed:', eligErr);
      }

      // 3. Open Modal in LOADING state
      setIsAdModalOpen(true);
      setAdLifecycleState('AD_LOADING');

      // 4. Initiate rewarded ad session with active provider
      const startRes = await fetch('/api/ai/ads/start', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: targetUid,
          requestId: `ad_req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        })
      });

      let startData: any = null;
      try {
        startData = await startRes.json();
      } catch (parseErr) {
        console.warn('Could not parse ad start response JSON:', parseErr);
      }

      if (!startRes.ok || !startData?.success) {
        setAdLifecycleState('AD_FAILED');
        const err = startData?.message || startData?.error || 'Huduma ya matangazo ya zawadi haipatikani kwa sasa. Tafadhali jaribu tena baadaye au tumia Premium.';
        setAdModalError(err);
        setAdRewardNotification({
          type: 'error',
          message: err
        });
        setAdRewardSuccessMessage(err);
        return;
      }

      // 5. Ad session successfully created! Set active session and present ad
      const session = {
        rewardId: startData.rewardId,
        providerSessionId: startData.providerSessionId,
        providerRewardId: startData.providerRewardId,
        rewardToken: startData.rewardToken,
        adProvider: startData.adProvider || (startData.diagnostic?.provider === 'MOCK' ? 'MOCK_REWARDED_AD' : 'GOOGLE_AD_MANAGER_WEB'),
        mode: (startData.mode || startData.diagnostic?.environment || 'TEST') as AdProviderMode,
        platform: 'WEB' as AdPlatform,
        adUnitId: startData.adUnitId || startData.diagnostic?.adUnitPath || '',
        diagnostic: startData.diagnostic
      };
      setActiveAdSession(session);

      // Transition: AD_LOADED -> AD_PRESENTED
      setAdLifecycleState('AD_PRESENTED');

      // Audit event: AD_PRESENTED
      fetch('/api/ai/ads/event', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUid,
          eventType: 'AD_PRESENTED',
          providerRewardId: session.providerRewardId,
          metadata: { mode: session.mode, platform: session.platform }
        })
      }).catch(() => {});

    } catch (err: any) {
      console.error('[AI Ad Reward] Error starting ad:', err);
      setAdLifecycleState('AD_FAILED');
      const msg = 'Hitilafu ya mtandao wakati wa kuanzisha tangazo la jaribio.';
      setAdModalError(msg);
      setAdRewardNotification({
        type: 'error',
        message: msg
      });
      setAdRewardSuccessMessage(msg);
    } finally {
      setIsWatchingAd(false);
    }
  };

  // Called when user closes/dismisses ad before timer completes: NO REWARD GRANTED!
  const handleAdDismissed = async () => {
    setAdLifecycleState('AD_DISMISSED');
    setIsAdModalOpen(false);

    try {
      const { headers, resolvedUid } = await getAiAuthContext();
      const targetUid = resolvedUid || effectiveUserId;

      if (activeAdSession) {
        fetch('/api/ai/ads/event', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUid,
            eventType: 'AD_DISMISSED',
            providerRewardId: activeAdSession.providerRewardId
          })
        }).catch(() => {});
      }
    } catch {}

    setActiveAdSession(null);

    // Deterministically NO reward is granted
    const dismissedNotice = 'Tangazo limefungwa kabla ya kukamilika. Hakuna zawadi iliyotolewa.';
    setAdRewardNotification({
      type: 'info',
      message: dismissedNotice
    });
    setAdRewardSuccessMessage(dismissedNotice);
  };

  // Called ONLY after user completely watches the rewarded ad: Verifies with server!
  const handleAdCompleted = async () => {
    if (!activeAdSession || !activeAdSession.rewardToken) return;

    // Prevent duplicate verification for a token already granted in this session
    if (verifiedAdTokensRef.current.has(activeAdSession.rewardToken)) {
      setAdLifecycleState('REWARD_GRANTED');
      return;
    }

    // Prevent concurrent verification calls
    if (isVerifyingAdRewardRef.current) {
      return;
    }
    isVerifyingAdRewardRef.current = true;

    setAdLifecycleState('AD_COMPLETED');
    setAdLifecycleState('REWARD_PENDING_VERIFICATION');

    try {
      const { headers, resolvedUid } = await getAiAuthContext();
      const targetUid = resolvedUid || effectiveUserId;

      // Audit event: AD_COMPLETED
      fetch('/api/ai/ads/event', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUid,
          eventType: 'AD_COMPLETED',
          providerRewardId: activeAdSession.providerRewardId
        })
      }).catch(() => {});

      // Authoritatively verify completed ad with provider proof on server
      const verifyRes = await fetch('/api/ai/ads/verify', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: targetUid,
          rewardToken: activeAdSession.rewardToken,
          providerRewardId: activeAdSession.providerRewardId,
          providerName: activeAdSession.adProvider,
          requestId: `verify_${Date.now()}`
        })
      });

      let verifyData: any = null;
      try {
        verifyData = await verifyRes.json();
      } catch (parseErr) {
        console.warn('Could not parse ad verify response JSON:', parseErr);
      }

      if (verifyRes.ok && verifyData?.success) {
        if (activeAdSession.rewardToken) {
          verifiedAdTokensRef.current.add(activeAdSession.rewardToken);
        }
        setAdLifecycleState('REWARD_VERIFIED');
        setAdLifecycleState('REWARD_GRANTED');

        // Authoritative reward remaining from server response
        const newRewardRemaining = typeof verifyData.newAdRewardRemaining === 'number'
          ? verifyData.newAdRewardRemaining
          : (typeof verifyData.adRewardRemaining === 'number' ? verifyData.adRewardRemaining : 5);
        const freeRem = typeof verifyData.freeRemaining === 'number'
          ? verifyData.freeRemaining
          : (userQuotaInfo?.freeRemaining ?? 0);
        const newTotalRemaining = typeof verifyData.remainingTextQueries === 'number'
          ? verifyData.remainingTextQueries
          : (freeRem + newRewardRemaining);

        updateUserQuota({
          freeLimit: userQuotaInfo?.freeLimit ?? 10,
          freeUsed: userQuotaInfo?.freeUsed ?? 10,
          freeRemaining: freeRem,
          adRewardRemaining: newRewardRemaining,
          remainingTextQueries: newTotalRemaining,
          entitlementTier: userQuotaInfo?.entitlementTier || 'FREE',
          canUseAdReward: false,
          mediaAllowed: userQuotaInfo?.mediaAllowed ?? false,
          isBlocked: false
        });

        // Exact Swahili confirmation as requested in V1.9C-CORRECTIVE
        const successNotice = 'Umefanikiwa kupata zawadi ya maswali 5 ya AI.';
        setAdRewardNotification({
          type: 'success',
          message: successNotice
        });
        setAdRewardSuccessMessage(successNotice);
        refreshAuthoritativeEntitlements();
      } else {
        // Guard against duplicate callback race: If reward was already granted, preserve success
        if (activeAdSession.rewardToken && verifiedAdTokensRef.current.has(activeAdSession.rewardToken)) {
          setAdLifecycleState('REWARD_GRANTED');
          return;
        }

        if (verifyData?.errorCode === 'AD_REWARD_DUPLICATE') {
          setAdLifecycleState('REWARD_DUPLICATE');
          const dupMsg = 'Zawadi hii tayari imeshathibitishwa na kutumika.';
          setAdRewardNotification({
            type: 'warning',
            message: dupMsg
          });
          setAdRewardSuccessMessage(dupMsg);
        } else {
          setAdLifecycleState('REWARD_REJECTED');
          const rejMsg = verifyData?.message || verifyData?.error || 'Tangazo limekamilika, lakini seva haikuweza kuthibitisha zawadi. Tafadhali jaribu tena.';
          setAdModalError(rejMsg);
          setAdRewardNotification({
            type: 'error',
            message: rejMsg
          });
          setAdRewardSuccessMessage(rejMsg);
        }
      }
    } catch (err: any) {
      console.error('[AI Ad Reward] Error verifying ad:', err);
      if (activeAdSession?.rewardToken && verifiedAdTokensRef.current.has(activeAdSession.rewardToken)) {
        setAdLifecycleState('REWARD_GRANTED');
        return;
      }
      setAdLifecycleState('REWARD_REJECTED');
      const netMsg = 'Hitilafu ya mtandao wakati wa kuthibitisha zawadi.';
      setAdModalError(netMsg);
      setAdRewardNotification({
        type: 'error',
        message: netMsg
      });
      setAdRewardSuccessMessage(netMsg);
    } finally {
      isVerifyingAdRewardRef.current = false;
    }
  };

  const handleCloseAdModal = () => {
    setIsAdModalOpen(false);
    setActiveAdSession(null);
    isVerifyingAdRewardRef.current = false;
  };

  useEffect(() => {
    const urls = activeBlobUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      urls.clear();
    };
  }, []);

  // Remove selected video and clean up memory (Stage: VIDEO_CLEANUP & VIDEO_STATE)
  const handleRemoveVideo = () => {
    if (selectedVideo?.previewUrl && selectedVideo.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(selectedVideo.previewUrl);
        activeBlobUrlsRef.current.delete(selectedVideo.previewUrl);
      } catch {}
    }
    setSelectedVideo(null);
    setVideoSelectError(null);
    setVideoInputState('NO_VIDEO');
    if (videoFileInputRef.current) videoFileInputRef.current.value = '';
  };

  // ============================================================================
  // V1.1 IMAGE FOUNDATION — FROZEN AFTER V1.1.7
  // STAGES: IMAGE_INPUT, IMAGE_VALIDATION_CLIENT, IMAGE_CLEANUP, IMAGE_STATE
  // INVARIANTS:
  // - Raw image data is never persisted.
  // - Client validation adheres strictly to 15MB, JPEG/PNG/WEBP, dimension bounds.
  // ============================================================================

  // Handle image file selection with comprehensive validation & security layer (STAGE: IMAGE_INPUT & IMAGE_VALIDATION_CLIENT)
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Crucial: Always clear the input value so selecting the same file again or re-trying
    // after an error triggers the change event without being ignored by the browser.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // Rule: Maximum ONE media attachment per message. Enforce mutual exclusion.
    handleRemoveVideo();

    setIsValidatingImage(true);
    setImageSelectError(null);

    try {
      // Stage: IMAGE_VALIDATION_CLIENT
      // Run deep client-side validation: MIME type, size <= 15MB, zero-byte check,
      // browser-native decoding validation, dimension & pixel bounds check
      const result = await validateImageFile(file);

      if (result.valid === false) {
        // Safe rejection: display friendly Swahili error, record internal diagnostic category
        console.warn(`[ImageDiagnostic] Stage: ${IMAGE_PIPELINE_STAGES.IMAGE_VALIDATION_CLIENT}, Category: ${result.diagnosticCategory}`);
        setImageSelectError(result.errorSwahili);
        setIsValidatingImage(false);
        return;
      }

      // Safe acceptance: revoke previous pending selection URL if not yet submitted (Stage: IMAGE_CLEANUP)
      if (selectedImage?.previewUrl && selectedImage.previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(selectedImage.previewUrl);
          activeBlobUrlsRef.current.delete(selectedImage.previewUrl);
        } catch {}
      }

      // Stage: IMAGE_STATE & IMAGE_RENDERING (composer preview)
      const previewUrl = URL.createObjectURL(file);
      activeBlobUrlsRef.current.add(previewUrl);
      setSelectedImage({
        file,
        previewUrl,
        fileName: result.sanitizedFileName,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        width: result.width,
        height: result.height,
      });
      setImageSelectError(null);
    } catch {
      console.warn(`[ImageDiagnostic] Stage: ${IMAGE_PIPELINE_STAGES.IMAGE_VALIDATION_CLIENT}, Category: ${IMAGE_ERROR_CATEGORIES.IMAGE_DECODE_FAILED}`);
      setImageSelectError('Hitilafu ya ghafla imetokea wakati wa kuhakiki picha. Tafadhali jaribu tena.');
    } finally {
      setIsValidatingImage(false);
    }
  };

  // Remove selected image and clean up memory (Stage: IMAGE_CLEANUP & IMAGE_STATE)
  const handleRemoveImage = () => {
    if (selectedImage?.previewUrl && selectedImage.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(selectedImage.previewUrl);
        activeBlobUrlsRef.current.delete(selectedImage.previewUrl);
      } catch {}
    }
    setSelectedImage(null);
    setImageSelectError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================================
  // V1.2A VIDEO INPUT FOUNDATION
  // STAGES: VIDEO_INPUT, VIDEO_VALIDATION_CLIENT, VIDEO_CLEANUP, VIDEO_STATE
  // INVARIANTS:
  // - Raw video data is strictly temporary (Blob URL only, never persisted).
  // - Client validation adheres strictly to 50MB, MP4/WEBM/QUICKTIME, duration <= 180s.
  // - Mutual exclusion: One media attachment per message (Image OR Video).
  // ============================================================================

  const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    if (!file) return;

    // Rule: Maximum ONE media attachment per message. Enforce mutual exclusion.
    handleRemoveImage();

    setVideoInputState('VIDEO_VALIDATING');
    setVideoSelectError(null);

    try {
      const result = await validateVideoFile(file);

      if (result.valid === false) {
        console.warn(`[VideoDiagnostic] Category: ${result.diagnosticCategory}`);
        setVideoSelectError(result.errorSwahili);
        setVideoInputState('VIDEO_ERROR');
        return;
      }

      // Safe acceptance: revoke previous pending video selection URL if not yet submitted
      if (selectedVideo?.previewUrl && selectedVideo.previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(selectedVideo.previewUrl);
          activeBlobUrlsRef.current.delete(selectedVideo.previewUrl);
        } catch {}
      }

      // Track active blob URL for safe memory cleanup
      if (result.attachment.localPreviewUrl) {
        activeBlobUrlsRef.current.add(result.attachment.localPreviewUrl);
      }

      setSelectedVideo({
        file,
        previewUrl: result.attachment.localPreviewUrl || '',
        id: result.attachment.id,
        fileName: result.attachment.fileName,
        mimeType: result.attachment.mimeType,
        fileSize: result.attachment.fileSize,
        duration: result.attachment.duration,
        width: result.attachment.width,
        height: result.attachment.height,
      });
      setVideoSelectError(null);
      setVideoInputState('VIDEO_READY');
    } catch {
      setVideoSelectError('Hitilafu ya ghafla imetokea wakati wa kuhakiki video. Tafadhali jaribu tena.');
      setVideoInputState('VIDEO_ERROR');
    }
  };

  // Modals
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    conversation: AiConversation | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    conversation: null,
    isDeleting: false,
  });

  const [renameModalState, setRenameModalState] = useState<{
    isOpen: boolean;
    conversation: AiConversation | null;
    newTitle: string;
    isSaving: boolean;
  }>({
    isOpen: false,
    conversation: null,
    newTitle: '',
    isSaving: false,
  });

  // Marketplace integration state
  const [marketplaceProducts, setMarketplaceProducts] = useState<MarketplaceProduct[]>([]);
  const [publishedShops, setPublishedShops] = useState<DigitalShop[]>([]);
  const [daktariProfiles, setDaktariProfiles] = useState<ProfessionalProfile[]>([]);
  const [selectedModalProduct, setSelectedModalProduct] = useState<MarketplaceProduct | null>(null);

  // Preload marketplace products & published shops & daktari profiles for instant retrieval
  useEffect(() => {
    let isMounted = true;
    const loadMarketData = async () => {
      try {
        const prods = await fetchMarketplaceProducts();
        if (isMounted) {
          setMarketplaceProducts(prods);
          const shops = await fetchAllPublishedShops(prods);
          if (isMounted) {
            setPublishedShops(shops);
          }
        }
      } catch (err) {
        console.warn('Could not preload marketplace products for AI assistant:', err);
      }

      try {
        const docs = await daktariService.getDoctors();
        if (isMounted && docs) {
          setDaktariProfiles(docs);
        }
      } catch (docErr) {
        console.warn('Could not preload daktari profiles for AI assistant:', docErr);
      }
    };
    loadMarketData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenProductDetail = useCallback((productId: string) => {
    const found = marketplaceProducts.find((p) => p.productId === productId);
    if (found) {
      setSelectedModalProduct(found);
    } else {
      navigate(`/market?product=${productId}`);
    }
  }, [marketplaceProducts, navigate]);

  const handleOpenShop = useCallback((shopId: string, catalogueId?: string | null) => {
    const queryParam = catalogueId ? `?shop=${shopId}&catalogue=${catalogueId}` : `?shop=${shopId}`;
    navigate(`/market${queryParam}`);
  }, [navigate]);

  const handleNavigateMarketplace = useCallback(() => {
    navigate('/market');
  }, [navigate]);

  // Helper to read cached records strictly for current authenticated user ONLY
  const getInitialRecords = (): LivestockRecord[] => {
    try {
      const currentUid = currentUser?.uid || auth.currentUser?.uid;
      if (!currentUid) return [];

      const cached = localStorage.getItem(`livestock_records_${currentUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  };

  const getInitialEventsMap = (): Record<string, LivestockEvent[]> => {
    const map: Record<string, LivestockEvent[]> = {};
    try {
      const currentUid = currentUser?.uid || auth.currentUser?.uid;
      if (!currentUid) return map;

      const keys = Object.keys(localStorage);
      const prefix = `livestock_events_${currentUid}_`;
      for (const k of keys) {
        if (k.startsWith(prefix)) {
          const recordId = k.substring(prefix.length);
          const cached = localStorage.getItem(k);
          if (cached && recordId) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed)) {
                map[recordId] = parsed;
              }
            } catch {}
          }
        }
      }
    } catch {}
    return map;
  };

  const [records, setRecords] = useState<LivestockRecord[]>(getInitialRecords);
  const [recordEventsMap, setRecordEventsMap] = useState<Record<string, LivestockEvent[]>>(getInitialEventsMap);
  const [dataError, setDataError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load cached livestock data strictly for target authenticated UID
  const loadLocalCache = useCallback((userId?: string) => {
    try {
      const targetUid = userId || currentUser?.uid || auth.currentUser?.uid;
      if (!targetUid) {
        setRecords([]);
        setRecordEventsMap({});
        return [];
      }

      let foundRecords: LivestockRecord[] = [];
      const cached = localStorage.getItem(`livestock_records_${targetUid}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            foundRecords = parsed;
          }
        } catch {}
      }

      setRecords(foundRecords);
      const eventsMap: Record<string, LivestockEvent[]> = {};

      if (foundRecords.length > 0) {
        for (const rec of foundRecords) {
          const evtsCached = localStorage.getItem(`livestock_events_${targetUid}_${rec.recordId}`);
          if (evtsCached) {
            try {
              const parsedEvts = JSON.parse(evtsCached);
              if (Array.isArray(parsedEvts)) {
                eventsMap[rec.recordId] = parsedEvts;
              }
            } catch {}
          }
        }
      }

      setRecordEventsMap(eventsMap);
      return foundRecords;
    } catch {
      return [];
    }
  }, [currentUser?.uid]);

  // Fetch live livestock records from Firestore
  const fetchFarmerData = useCallback(async () => {
    const uid = currentUser?.uid || auth.currentUser?.uid;
    loadLocalCache(uid);

    if (!uid) return;

    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken();
      }

      const recordsRef = collection(db, 'users', uid, 'livestockRecords');
      let snap;
      try {
        const q = query(recordsRef, orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch {
        snap = await getDocs(recordsRef);
      }

      const fetchedRecords: LivestockRecord[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          recordId: docSnap.id,
          userId: d.userId || uid,
          livestockCategory: d.livestockCategory || 'Poultry',
          livestockType: d.livestockType || d.customTypeName || 'Mifugo',
          quantity: typeof d.quantity === 'number' ? d.quantity : Number(d.quantity) || 1,
          recordName: d.recordName || d.livestockType || '',
          dateAdded: d.dateAdded || d.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
          notes: d.notes || '',
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString()
        };
      });

      if (fetchedRecords.length > 0) {
        setRecords(fetchedRecords);
        setDataError(null);
        try {
          localStorage.setItem(`livestock_records_${uid}`, JSON.stringify(fetchedRecords));
        } catch {}

        const eventsMap: Record<string, LivestockEvent[]> = {};
        await Promise.all(
          fetchedRecords.map(async (record) => {
            try {
              const cachedEvents = localStorage.getItem(`livestock_events_${uid}_${record.recordId}`);
              if (cachedEvents) {
                try {
                  eventsMap[record.recordId] = JSON.parse(cachedEvents);
                } catch {}
              }

              const eventsRef = collection(db, 'users', uid, 'livestockRecords', record.recordId, 'events');
              let eSnap;
              try {
                const eq = query(eventsRef, orderBy('eventDate', 'desc'));
                eSnap = await getDocs(eq);
              } catch {
                eSnap = await getDocs(eventsRef);
              }

              const evts: LivestockEvent[] = eSnap.docs.map((ed) => {
                const data = ed.data();
                const rawType = (data.eventType as any) || 'other';
                const notesValue = data.notes || data.description || '';
                return {
                  eventId: ed.id,
                  eventType: rawType,
                  eventDate: data.eventDate || data.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                  quantity:
                    data.quantity !== undefined && data.quantity !== null && data.quantity !== ''
                      ? Number(data.quantity)
                      : null,
                  title: data.title || '',
                  notes: notesValue,
                  description: notesValue,
                  cost: data.cost ? Number(data.cost) : undefined,
                  revenue: data.revenue ? Number(data.revenue) : undefined,
                  createdAt: data.createdAt || new Date().toISOString()
                };
              });

              eventsMap[record.recordId] = evts;
              try {
                localStorage.setItem(`livestock_events_${uid}_${record.recordId}`, JSON.stringify(evts));
              } catch {}
            } catch (eventErr) {
              console.warn(`Could not load events for record ${record.recordId}:`, eventErr);
            }
          })
        );
        setRecordEventsMap((prev) => ({ ...prev, ...eventsMap }));
      } else {
        // Authenticated user has zero records - ensure records and events state are clean
        setRecords([]);
        setRecordEventsMap({});
        setDataError(null);
        try {
          localStorage.setItem(`livestock_records_${uid}`, JSON.stringify([]));
        } catch {}
      }
    } catch (err: any) {
      const classified = classifyFirestoreError(err);
      console.debug(`[${classified.code}] Could not fetch livestock records from Firestore:`, classified.message);
      if (records.length === 0) {
        setDataError('Hitilafu ya kupakia rekodi kutoka kwenye seva.');
      }
    }
  }, [currentUser?.uid, loadLocalCache, records.length]);

  // Load messages for a specific conversation
  const loadConversationMessages = useCallback(
    async (convId: string, targetUid?: string, convOwnerUid?: string) => {
      const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
      const storageUid = targetUid || currentAuthUid || activeUid;
      if (!storageUid || !convId) return;

      // 1. Immediate local cache check for instant rendering
      let hadCachedMessages = false;
      try {
        const cached = localStorage.getItem(`ai_conv_messages_${storageUid}_${convId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            hadCachedMessages = true;
            const sanitized = parsed.map((m: AiChatMessage) => {
              let nextMsg = { ...m };
              const sessionMedia = sessionMediaBlobsRef.current.get(m.id);
              const validSession = Boolean(sessionMedia && sessionMedia.conversationId === convId);

              if (nextMsg.imageAttachment) {
                const candidateBlob = (validSession ? sessionMedia?.imagePreviewUrl : undefined) || nextMsg.imageAttachment.localPreviewUrl;
                const isBlobActive = Boolean(candidateBlob && activeBlobUrlsRef.current.has(candidateBlob));
                nextMsg = {
                  ...nextMsg,
                  imageAttachment: {
                    ...nextMsg.imageAttachment,
                    localPreviewUrl: isBlobActive ? candidateBlob : undefined,
                    imageAvailableForModel: isBlobActive,
                  },
                };
              }
              if (nextMsg.videoAttachment) {
                const candidateBlob = (validSession ? sessionMedia?.videoPreviewUrl : undefined) || nextMsg.videoAttachment.localPreviewUrl;
                const isBlobActive = Boolean(candidateBlob && activeBlobUrlsRef.current.has(candidateBlob));
                nextMsg = {
                  ...nextMsg,
                  videoAttachment: {
                    ...nextMsg.videoAttachment,
                    localPreviewUrl: isBlobActive ? candidateBlob : undefined,
                    videoAvailableForModel: isBlobActive,
                  },
                };
              }
              return nextMsg;
            });
            setMessages(sanitized);
          }
        }
      } catch {}

      // 2. Fetch from Firestore if user is authenticated
      if (!currentAuthUid || authLoading) return;

      setIsLoadingMessages(!hadCachedMessages);
      try {
        if (auth.currentUser) {
          await auth.currentUser.getIdToken();
        }

        const isUserAdmin = userProfile?.role === 'admin' || currentUser?.email === 'mkomwasaid53@gmail.com';
        const candidateUids = (isUserAdmin && convOwnerUid && convOwnerUid !== currentAuthUid)
          ? [currentAuthUid, convOwnerUid]
          : [currentAuthUid];

        let loadedSubDocs: any[] = [];
        let loadedDocArray: any[] = [];

        for (const uid of candidateUids) {
          // Attempt 1: Read from subcollection 'messages' (without restrictive orderBy so no docs are dropped)
          try {
            const msgsRef = collection(db, 'users', uid, 'aiConversations', convId, 'messages');
            let snap = await getDocs(msgsRef);
            if (!snap.empty) {
              loadedSubDocs = snap.docs;
              break;
            }
          } catch (subErr) {
            console.debug(`Could not read messages subcollection for user ${uid}:`, subErr);
          }

          // Attempt 2: Read from conversation document itself (dual-persistence fallback)
          try {
            const convDocRef = doc(db, 'users', uid, 'aiConversations', convId);
            const convSnap = await getDoc(convDocRef);
            if (convSnap.exists()) {
              const cData = convSnap.data();
              const docArr = cData?.messages || cData?.chatHistory || cData?.history;
              if (Array.isArray(docArr) && docArr.length > 0) {
                loadedDocArray = docArr;
                break;
              }
            }
          } catch (convDocErr) {
            console.debug(`Could not read conversation document for user ${uid}:`, convDocErr);
          }
        }

        if (loadedSubDocs.length > 0) {
          const loaded: AiChatMessage[] = loadedSubDocs.map((d) => {
            const data = d.data();
            const role = data.role === 'assistant' || data.role === 'model' ? 'model' : 'user';
            const rawDate = data.createdAt || '';
            let timeStr = new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
            if (rawDate) {
              try {
                timeStr = new Date(rawDate).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
              } catch {}
            }
            let rawContent = data.content || data.text || '';
            if (data.imageAttachment && typeof rawContent === 'string' && rawContent.startsWith('[Picha:') && rawContent.endsWith(']')) {
              rawContent = '';
            }
            if (data.videoAttachment && typeof rawContent === 'string' && rawContent.startsWith('[Video:') && rawContent.endsWith(']')) {
              rawContent = '';
            }
            const sessionMedia = sessionMediaBlobsRef.current.get(d.id);
            const isSessionValid = Boolean(sessionMedia && sessionMedia.conversationId === convId);

            const activeVideoBlob = isSessionValid ? sessionMedia?.videoPreviewUrl : undefined;
            const isVideoActive = Boolean(activeVideoBlob && activeBlobUrlsRef.current.has(activeVideoBlob));

            const activeImageBlob = isSessionValid ? sessionMedia?.imagePreviewUrl : undefined;
            const isImageActive = Boolean(activeImageBlob && activeBlobUrlsRef.current.has(activeImageBlob));

            return {
              id: d.id,
              role,
              text: rawContent,
              timestamp: timeStr,
              createdAt: rawDate || new Date().toISOString(),
              personalized: Boolean(data.personalized),
              marketplaceRecommendations: data.marketplaceRecommendations || undefined,
              doctorAction: data.doctorAction || undefined,
              historyQuestionResult: data.historyQuestionResult || undefined,
              contextBundle: data.contextBundle || undefined,
              visualMarketplaceIntent: data.visualMarketplaceIntent || undefined,
              visualMarketplaceQuery: data.visualMarketplaceQuery || undefined,
              actions: data.actions || undefined,
              imageAttachment: data.imageAttachment ? {
                fileName: data.imageAttachment.fileName,
                mimeType: data.imageAttachment.mimeType,
                sizeBytes: data.imageAttachment.sizeBytes,
                width: data.imageAttachment.width,
                height: data.imageAttachment.height,
                localPreviewUrl: isImageActive ? activeImageBlob : undefined,
                imageAvailableForModel: isImageActive,
              } : undefined,
              videoAttachment: data.videoAttachment ? {
                id: data.videoAttachment.id || d.id,
                fileName: data.videoAttachment.fileName,
                mimeType: data.videoAttachment.mimeType,
                fileSize: data.videoAttachment.fileSize,
                sizeBytes: data.videoAttachment.sizeBytes || data.videoAttachment.fileSize,
                duration: data.videoAttachment.duration,
                durationSeconds: data.videoAttachment.durationSeconds || data.videoAttachment.duration,
                width: data.videoAttachment.width,
                height: data.videoAttachment.height,
                localPreviewUrl: isVideoActive ? activeVideoBlob : undefined,
                videoAvailableForModel: isVideoActive,
              } : undefined,
            };
          });

          // Memory sort to handle any unordered or string timestamps cleanly
          loaded.sort((a, b) => {
            const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tA - tB;
          });

          // Merge with any cached messages that might exist locally to never lose turns
          let mergedMessages = [...loaded];
          try {
            const localCached = localStorage.getItem(`ai_conv_messages_${storageUid}_${convId}`);
            if (localCached) {
              const localParsed = JSON.parse(localCached);
              if (Array.isArray(localParsed) && localParsed.length > loaded.length) {
                const map = new Map<string, AiChatMessage>();
                for (const m of localParsed) {
                  if (m?.id) map.set(m.id, m);
                }
                for (const m of loaded) {
                  if (m?.id) map.set(m.id, m);
                }
                mergedMessages = Array.from(map.values());
              }
            }
          } catch {}

          mergedMessages.sort((a, b) => {
            const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tA - tB;
          });

          setMessages(mergedMessages);
          try {
            localStorage.setItem(`ai_conv_messages_${storageUid}_${convId}`, JSON.stringify(mergedMessages));
          } catch {}
        } else if (loadedDocArray.length > 0) {
          // Parse messages from the conversation document's internal array
          const loadedFromDoc: AiChatMessage[] = loadedDocArray.map((m: any, idx: number) => {
            const role = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
            const rawDate = m.createdAt || '';
            let timeStr = m.timestamp || new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
            if (rawDate && !m.timestamp) {
              try {
                timeStr = new Date(rawDate).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
              } catch {}
            }
            return {
              id: m.id || m.messageId || `doc-msg-${idx}-${Date.now()}`,
              role,
              text: m.text || m.content || '',
              timestamp: timeStr,
              createdAt: rawDate || new Date().toISOString(),
              personalized: Boolean(m.personalized),
              doctorAction: m.doctorAction || undefined,
              marketplaceRecommendations: m.marketplaceRecommendations || undefined,
              visualMarketplaceIntent: m.visualMarketplaceIntent || undefined,
              actions: m.actions || undefined,
              imageAttachment: m.imageAttachment || undefined,
              videoAttachment: m.videoAttachment || undefined,
            };
          });

          loadedFromDoc.sort((a, b) => {
            const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tA - tB;
          });

          setMessages(loadedFromDoc);
          try {
            localStorage.setItem(`ai_conv_messages_${storageUid}_${convId}`, JSON.stringify(loadedFromDoc));
          } catch {}
        } else {
          // If no messages found in Firestore, fallback to cached or welcome
          const cached = localStorage.getItem(`ai_conv_messages_${storageUid}_${convId}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setMessages(parsed);
                return;
              }
            } catch {}
          }
          setMessages([DEFAULT_WELCOME_MESSAGE]);
        }
      } catch (err: any) {
        console.warn(`Could not load messages for conversation ${convId}:`, err?.message || err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [activeUid, currentUser?.uid, authLoading]
  );

  // Account switch wipe: detect when the authenticated user changes and purge stale in-memory state
  const prevAuthUidRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUid = currentUser?.uid || auth.currentUser?.uid || null;
    if (prevAuthUidRef.current !== null && prevAuthUidRef.current !== currentUid) {
      setRecords([]);
      setRecordEventsMap({});
      setMessages([DEFAULT_WELCOME_MESSAGE]);
      setConversations([]);
      setCurrentConversationId(null);
      setSelectedImage(null);
      setSelectedVideo(null);
    }
    prevAuthUidRef.current = currentUid;
  }, [currentUser?.uid]);

  // Firestore Real-Time Listener for Conversations List
  useEffect(() => {
    if (authLoading) return;

    const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
    const storageUid = currentAuthUid || activeUid;
    if (!storageUid) return;

    // Load initial list from local cache
    try {
      const cached = localStorage.getItem(`ai_conversations_${storageUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
        }
      }
    } catch {}

    // Load active conversation ONLY if explicitly requested in URL param
    if (initialConvParam) {
      loadConversationMessages(initialConvParam, storageUid);
    }

    // Always load local cache on mount/update to guarantee instant availability
    loadLocalCache(storageUid);

    if (currentAuthUid) {
      fetchFarmerData();
    }

    if (!currentAuthUid) {
      setIsLoadingConversations(false);
      return;
    }

    let isListenerActive = true;
    let unsubscribeFn: (() => void) | null = null;

    const attachConversationListener = async () => {
      // Guard: Wait for active Firebase Auth session before attaching Firestore snapshot listener
      const activeUser = auth.currentUser;
      if (!activeUser || activeUser.uid !== currentAuthUid) {
        setIsLoadingConversations(false);
        return;
      }

      try {
        await activeUser.getIdToken();
      } catch {
        // Token refresh error, do not attach premature socket
        setIsLoadingConversations(false);
        return;
      }

      if (!isListenerActive) return;

      setIsLoadingConversations(true);
      const convsRef = collection(db, 'users', currentAuthUid, 'aiConversations');
      const q = query(convsRef, orderBy('updatedAt', 'desc'));

      const processDocs = (snapshotDocs: any[]) => {
        const list: AiConversation[] = snapshotDocs.map((d) => {
          const data = d.data();
          return {
            conversationId: d.id,
            uid: data.uid || currentAuthUid,
            title: data.title || 'Mazungumzo ya Mifugo',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
            lastMessageAt: data.lastMessageAt || data.updatedAt || new Date().toISOString(),
            messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
            status: data.status || 'active',
            isCustomTitle: Boolean(data.isCustomTitle),
          };
        });

        list.sort((a, b) => {
          const timeA = new Date(a.lastMessageAt || a.updatedAt).getTime();
          const timeB = new Date(b.lastMessageAt || b.updatedAt).getTime();
          return timeB - timeA;
        });

        setConversations(list);
        setIsLoadingConversations(false);

        try {
          localStorage.setItem(`ai_conversations_${currentAuthUid}`, JSON.stringify(list));
        } catch {}
      };

      try {
        unsubscribeFn = onSnapshot(
          q,
          (snapshot) => {
            processDocs(snapshot.docs);
          },
          (err) => {
            const classified = classifyFirestoreError(err);
            console.debug(`[${classified.code}] onSnapshot conversation notice:`, classified.message);
            setIsLoadingConversations(false);

            // If query fails due to ordering/index precondition, fallback to simple un-ordered query
            if (classified.code === 'FIRESTORE_INDEX_ERROR' && isListenerActive) {
              getDocs(convsRef)
                .then((fallbackSnap) => processDocs(fallbackSnap.docs))
                .catch(() => {});
            }
          }
        );
      } catch (attachErr) {
        const classified = classifyFirestoreError(attachErr);
        console.debug(`[${classified.code}] Failed to attach onSnapshot:`, classified.message);
        setIsLoadingConversations(false);
      }
    };

    attachConversationListener();

    return () => {
      isListenerActive = false;
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  }, [authLoading, currentUser?.uid, fetchFarmerData, loadConversationMessages, initialConvParam, activeUid]);

  // Select a conversation from History
  const handleSelectConversation = async (conv: AiConversation) => {
    handleRemoveImage();
    handleRemoveVideo();
    lastFailedRequestRef.current = null;
    setImageSelectError(null);
    setVideoSelectError(null);
    setInput('');
    const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
    const storageUid = currentAuthUid || activeUid;
    setCurrentConversationId(conv.conversationId);
    try {
      localStorage.setItem(`ai_active_conversation_${storageUid}`, conv.conversationId);
    } catch {}
    setIsHistoryDrawerOpen(false);
    await loadConversationMessages(conv.conversationId, storageUid, conv.uid);
  };

  // Start a new conversation session ("+ Mazungumzo Mapya")
  const handleStartNewConversation = () => {
    handleRemoveImage();
    handleRemoveVideo();
    lastFailedRequestRef.current = null;
    setImageSelectError(null);
    setVideoSelectError(null);
    const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
    const storageUid = currentAuthUid || activeUid;
    setCurrentConversationId(null);
    try {
      localStorage.removeItem(`ai_active_conversation_${storageUid}`);
    } catch {}
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setInput('');
    setSearchParams({});
    setIsHistoryDrawerOpen(false);
  };

  // Rename Conversation Modal handlers
  const handleOpenRename = (conv: AiConversation) => {
    setRenameModalState({
      isOpen: true,
      conversation: conv,
      newTitle: conv.title,
      isSaving: false,
    });
  };

  const handleSaveRename = async () => {
    const conv = renameModalState.conversation;
    const newTitle = renameModalState.newTitle.trim();
    if (!conv || !newTitle) return;

    setRenameModalState((prev) => ({ ...prev, isSaving: true }));
    const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
    const storageUid = currentAuthUid || activeUid;
    const nowIso = new Date().toISOString();

    // 1. Optimistically update local state & localStorage
    const updated = conversations.map((c) =>
      c.conversationId === conv.conversationId
        ? {
            ...c,
            title: newTitle,
            isCustomTitle: true,
            updatedAt: nowIso,
          }
        : c
    );
    setConversations(updated);

    try {
      localStorage.setItem(`ai_conversations_${storageUid}`, JSON.stringify(updated));
    } catch {}

    // 2. Persist to Firestore if authenticated
    if (currentAuthUid) {
      try {
        if (auth.currentUser) {
          await auth.currentUser.getIdToken();
        }
        await setDoc(
          doc(db, 'users', currentAuthUid, 'aiConversations', conv.conversationId),
          {
            title: newTitle,
            isCustomTitle: true,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Taarifa ya kubadili jina la mazungumzo kwenye seva:', err);
      }
    }

    setRenameModalState({
      isOpen: false,
      conversation: null,
      newTitle: '',
      isSaving: false,
    });
  };

  // Delete conversation handlers
  const handleDeleteConversation = (conv: AiConversation) => {
    setDeleteModalState({
      isOpen: true,
      conversation: conv,
      isDeleting: false,
    });
  };

  const confirmDeleteConversation = async () => {
    const conv = deleteModalState.conversation;
    if (!conv) return;

    setDeleteModalState((prev) => ({ ...prev, isDeleting: true }));
    const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
    const storageUid = currentAuthUid || activeUid;

    // 1. Optimistically clean up local state & localStorage immediately
    const updated = conversations.filter((c) => c.conversationId !== conv.conversationId);
    setConversations(updated);

    // Clean up in-memory blob URLs associated with this deleted conversation
    sessionMediaBlobsRef.current.forEach((val, msgId) => {
      if (val.conversationId === conv.conversationId) {
        if (val.videoPreviewUrl) {
          try { URL.revokeObjectURL(val.videoPreviewUrl); } catch {}
          activeBlobUrlsRef.current.delete(val.videoPreviewUrl);
        }
        if (val.imagePreviewUrl) {
          try { URL.revokeObjectURL(val.imagePreviewUrl); } catch {}
          activeBlobUrlsRef.current.delete(val.imagePreviewUrl);
        }
        sessionMediaBlobsRef.current.delete(msgId);
      }
    });

    try {
      localStorage.setItem(`ai_conversations_${storageUid}`, JSON.stringify(updated));
      localStorage.removeItem(`ai_conv_messages_${storageUid}_${conv.conversationId}`);
    } catch {}

    if (currentConversationId === conv.conversationId) {
      try {
        localStorage.removeItem(`ai_active_conversation_${storageUid}`);
      } catch {}
      handleStartNewConversation();
    }

    // 2. Safely delete from Firestore if user is authenticated
    if (currentAuthUid) {
      try {
        if (auth.currentUser) {
          await auth.currentUser.getIdToken();
        }

        const msgsRef = collection(db, 'users', currentAuthUid, 'aiConversations', conv.conversationId, 'messages');
        try {
          const snap = await getDocs(msgsRef);
          await Promise.all(
            snap.docs.map((d) =>
              deleteDoc(doc(db, 'users', currentAuthUid, 'aiConversations', conv.conversationId, 'messages', d.id))
            )
          );
        } catch (msgErr) {
          console.warn('Taarifa ya kufuta jumbe za mazungumzo:', msgErr);
        }

        await deleteDoc(doc(db, 'users', currentAuthUid, 'aiConversations', conv.conversationId));
      } catch (err) {
        console.warn('Taarifa ya kufuta mazungumzo Firestore:', err);
      }
    }

    setDeleteModalState({
      isOpen: false,
      conversation: null,
      isDeleting: false,
    });
  };

  // FarmerContext derivation
  const farmerContext = useMemo(() => {
    return buildFarmerContext(
      activeUid,
      userProfile,
      records,
      recordEventsMap,
      dataError
    );
  }, [activeUid, userProfile, records, recordEventsMap, dataError]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle auto-ask from query params
  useEffect(() => {
    if (initialQuery && messages.length === 1 && messages[0].id === 'welcome-1') {
      handleSend(initialQuery);
      setSearchParams({});
    }
  }, [initialQuery]);

  // Send message handler
  const handleSend = async (
    questionText?: string,
    explicitImage?: SelectedImageState | null,
    explicitVideo?: SelectedVideoState | null,
    isRetry?: boolean,
    existingUserMsgId?: string
  ) => {
    // Synchronous double-send prevention
    if (isSendingRef.current || isLoading) return;

    const textToSend = questionText !== undefined ? questionText : input;
    const currentSelectedImage = explicitImage !== undefined ? explicitImage : selectedImage; // snapshot active attachment
    const currentSelectedVideo = explicitVideo !== undefined ? explicitVideo : selectedVideo;

    // Either text, an image, or a video is required to send
    if (!textToSend.trim() && !currentSelectedImage && !currentSelectedVideo) return;

    // Mutual exclusion check: Cannot send both image and video simultaneously
    if (currentSelectedImage && currentSelectedVideo) {
      setVideoSelectError('Hairuhusiwi kutuma picha na video kwa wakati mmoja.');
      return;
    }

    // Video binary existence check
    if (currentSelectedVideo && (!currentSelectedVideo.file || !(currentSelectedVideo.file instanceof Blob))) {
      setVideoSelectError('Faili la video halipatikani kwenye kumbukumbu. Tafadhali chagua video tena.');
      return;
    }

    // Lock synchronous submission flag immediately
    isSendingRef.current = true;
    setIsLoading(true);
    if (adRewardNotification?.type === 'success') {
      setAdRewardNotification(null);
    }
    setAdRewardSuccessMessage(null);
    if (currentSelectedVideo) {
      setActiveProcessingType('video');
    } else if (currentSelectedImage) {
      setActiveProcessingType('image');
    } else {
      setActiveProcessingType('text');
    }

    const nowIso = new Date().toISOString();
    const nowTimeStr = new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });

    let updatedMessages: AiChatMessage[];
    let userMsgId: string;

    if (isRetry && existingUserMsgId) {
      userMsgId = existingUserMsgId;
      updatedMessages = messages.filter((m) => !m.id.startsWith('error-'));
      setMessages(updatedMessages);
    } else {
      userMsgId = `user-${Date.now()}`;
      const userMessage: AiChatMessage = {
        id: userMsgId,
        role: 'user',
        text: textToSend.trim(),
        timestamp: nowTimeStr,
        createdAt: nowIso,
        imageAttachment: currentSelectedImage ? {
          localPreviewUrl: currentSelectedImage.previewUrl,
          fileName: currentSelectedImage.fileName,
          mimeType: currentSelectedImage.mimeType,
          sizeBytes: currentSelectedImage.sizeBytes,
          width: currentSelectedImage.width,
          height: currentSelectedImage.height,
          imageAvailableForModel: true,
        } : undefined,
        videoAttachment: currentSelectedVideo ? {
          id: currentSelectedVideo.id,
          fileName: currentSelectedVideo.fileName,
          mimeType: currentSelectedVideo.mimeType,
          fileSize: currentSelectedVideo.fileSize,
          sizeBytes: currentSelectedVideo.fileSize,
          duration: currentSelectedVideo.duration,
          durationSeconds: currentSelectedVideo.duration,
          width: currentSelectedVideo.width,
          height: currentSelectedVideo.height,
          localPreviewUrl: currentSelectedVideo.previewUrl,
          videoAvailableForModel: true,
        } : undefined,
      };

      if (currentSelectedVideo?.previewUrl) {
        sessionMediaBlobsRef.current.set(userMsgId, {
          conversationId: currentConversationId || 'pending',
          videoPreviewUrl: currentSelectedVideo.previewUrl,
        });
      }
      if (currentSelectedImage?.previewUrl) {
        sessionMediaBlobsRef.current.set(userMsgId, {
          conversationId: currentConversationId || 'pending',
          imagePreviewUrl: currentSelectedImage.previewUrl,
        });
      }

      const baseMessages = messages.filter((m) => m.id !== 'welcome-1' && !m.id.startsWith('error-'));
      updatedMessages = [...baseMessages, userMessage];
      setMessages(updatedMessages);

      setInput('');
      setSelectedImage(null);
      setImageSelectError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setSelectedVideo(null);
      setVideoSelectError(null);
      setVideoInputState('NO_VIDEO');
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
    }

    let activeConvId = currentConversationId;
    const currentAuthUid = currentUser?.uid || auth.currentUser?.uid || null;
    const storageUid = currentAuthUid || activeUid;
    let abortController: AbortController | null = null;
    let errorAlreadyLogged = false;

    try {
      // 1. If no active conversation, create a new one persistently
      if (!activeConvId) {
        const newConvId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const titleSubject = textToSend.trim() || (currentSelectedImage ? `Picha: ${currentSelectedImage.fileName}` : (currentSelectedVideo ? `Video: ${currentSelectedVideo.fileName}` : 'Swali la Kilimo'));
        const title = generateConversationTitle(titleSubject);
        const newConv: AiConversation = {
          conversationId: newConvId,
          uid: currentAuthUid || storageUid,
          title,
          createdAt: nowIso,
          updatedAt: nowIso,
          lastMessageAt: nowIso,
          messageCount: 1,
          status: 'active',
          isCustomTitle: false,
        };

        activeConvId = newConvId;
        setCurrentConversationId(newConvId);

        const sessionMedia = sessionMediaBlobsRef.current.get(userMsgId);
        if (sessionMedia) {
          sessionMedia.conversationId = newConvId;
        }

        try {
          localStorage.setItem(`ai_active_conversation_${storageUid}`, newConvId);
          setConversations((prev) => {
            const currentList = prev.filter((c) => c.conversationId !== newConvId);
            const nextList = [newConv, ...currentList];
            try {
              localStorage.setItem(`ai_conversations_${storageUid}`, JSON.stringify(nextList));
            } catch {}
            return nextList;
          });
        } catch {}

        if (currentAuthUid) {
          try {
            const activeUser = auth.currentUser;
            if (activeUser && activeUser.uid === currentAuthUid) {
              await activeUser.getIdToken();
            }
            await setDoc(doc(db, 'users', currentAuthUid, 'aiConversations', newConvId), newConv);
          } catch (convSaveErr) {
            const classified = classifyFirestoreError(convSaveErr);
            console.debug(`[${classified.code}] Could not persist new conversation document in Firestore:`, classified.message);
          }
        }
      } else {
        // If conversation already exists, update metadata
        const existingConv = conversations.find((c) => c.conversationId === activeConvId);
        const isDefaultTitle = existingConv && (
          existingConv.title === 'Mazungumzo Mapya' ||
          existingConv.title === 'Mazungumzo ya Kilimo na Ufugaji' ||
          existingConv.title === 'Mazungumzo ya Mifugo'
        );
        const shouldUpdateTitle = existingConv && !existingConv.isCustomTitle && (isDefaultTitle || existingConv.messageCount <= 1);
        const titleSubject = textToSend.trim() || (currentSelectedImage ? `Picha: ${currentSelectedImage.fileName}` : (currentSelectedVideo ? `Video: ${currentSelectedVideo.fileName}` : 'Swali la Kilimo'));
        const updatedTitle = shouldUpdateTitle ? generateConversationTitle(titleSubject) : (existingConv?.title || 'Mazungumzo ya Mifugo');

        setConversations((prev) => {
          const next = prev.map((c) =>
            c.conversationId === activeConvId
              ? {
                  ...c,
                  title: updatedTitle,
                  updatedAt: nowIso,
                  lastMessageAt: nowIso,
                  messageCount: updatedMessages.length,
                }
              : c
          );
          try {
            localStorage.setItem(`ai_conversations_${storageUid}`, JSON.stringify(next));
          } catch {}
          return next;
        });

        if (currentAuthUid) {
          try {
            await setDoc(
              doc(db, 'users', currentAuthUid, 'aiConversations', activeConvId),
              {
                ...(shouldUpdateTitle ? { title: updatedTitle } : {}),
                updatedAt: nowIso,
                lastMessageAt: nowIso,
                messageCount: updatedMessages.length,
                status: 'active',
              },
              { merge: true }
            );
          } catch (updateConvErr) {
            console.warn('Could not update conversation metadata in Firestore:', updateConvErr);
          }
        }
      }

      // Cache user message safely immediately
      try {
        const safeMessagesToCache = updatedMessages.map((m) => ({
          ...m,
          imageAttachment: m.imageAttachment ? {
            ...m.imageAttachment,
            localPreviewUrl: undefined,
            imageAvailableForModel: false,
          } : undefined,
          videoAttachment: m.videoAttachment ? {
            ...m.videoAttachment,
            localPreviewUrl: undefined,
            videoAvailableForModel: false,
          } : undefined,
        }));
        localStorage.setItem(`ai_conv_messages_${storageUid}_${activeConvId}`, JSON.stringify(safeMessagesToCache));
      } catch {}

      // Persist user message to Firestore (without temporary local preview URLs or raw bytes)
      if (currentAuthUid && !isRetry) {
        try {
          const userMsgDoc: AiMessage = {
            messageId: userMsgId,
            role: 'user',
            content: textToSend.trim(),
            createdAt: nowIso,
            ...(currentSelectedImage ? {
              imageAttachment: {
                fileName: currentSelectedImage.fileName,
                mimeType: currentSelectedImage.mimeType,
                sizeBytes: currentSelectedImage.sizeBytes,
                width: currentSelectedImage.width,
                height: currentSelectedImage.height,
                imageAvailableForModel: false,
              }
            } : {}),
            ...(currentSelectedVideo ? {
              videoAttachment: {
                id: currentSelectedVideo.id,
                fileName: currentSelectedVideo.fileName,
                mimeType: currentSelectedVideo.mimeType,
                fileSize: currentSelectedVideo.fileSize,
                sizeBytes: currentSelectedVideo.fileSize,
                duration: currentSelectedVideo.duration,
                durationSeconds: currentSelectedVideo.duration,
                width: currentSelectedVideo.width,
                height: currentSelectedVideo.height,
                videoAvailableForModel: false,
              }
            } : {})
          };
          const activeUser = auth.currentUser;
          if (activeUser && activeUser.uid === currentAuthUid) {
            await activeUser.getIdToken();
          }
          await setDoc(
            doc(db, 'users', currentAuthUid, 'aiConversations', activeConvId, 'messages', userMsgId),
            sanitizeFirestoreData(userMsgDoc)
          );
        } catch (userMsgSaveErr) {
          const classified = classifyFirestoreError(userMsgSaveErr);
          console.debug(`[${classified.code}] Could not persist user message to Firestore:`, classified.message);
        }
      }

      // Context history for conversational awareness (send previous messages in conversation, up to 16)
      const validHistory = messages
        .filter((m) => m.id !== 'welcome-1' && !m.id.startsWith('error-'))
        .slice(-16)
        .map((m) => {
          let content = m.text;
          if (m.role === 'user' && m.imageAttachment) {
            const fileName = m.imageAttachment.fileName || 'Picha ya Mfugaji';
            if (!content || !content.trim()) {
              content = `[Picha iliyoambatanishwa hapo awali: ${fileName}]`;
            } else if (!content.includes('[Picha')) {
              content = `[Picha iliyoambatanishwa hapo awali: ${fileName}]\n${content}`;
            }
          }
          if (m.role === 'user' && m.videoAttachment) {
            const fileName = m.videoAttachment.fileName || 'Video ya Mfugaji';
            if (!content || !content.trim()) {
              content = `[Video iliyoambatanishwa hapo awali: ${fileName}]`;
            } else if (!content.includes('[Video')) {
              content = `[Video iliyoambatanishwa hapo awali: ${fileName}]\n${content}`;
            }
          }
          // Append concise recommendation references if previous model message showed marketplace results
          if (m.role === 'model' && m.marketplaceRecommendations && m.marketplaceRecommendations.status === 'has_results') {
            const rec = m.marketplaceRecommendations;
            if (rec.targetType === 'product' && rec.products && rec.products.length > 0) {
              const summaries = rec.products.map((p, idx) =>
                `Bidhaa #${idx + 1}: ${p.title} (Bei: ${p.price} ${p.currency || 'Tsh'}, Muuzaji: ${p.sellerBusinessName || p.sellerName}${p.sellerVerified ? ' [Aliyethibitishwa]' : ''}, Mahali: ${p.district ? p.district + ', ' : ''}${p.region || p.location}, Hali: ${p.inStock ? 'Ipo ghalani' : 'Imeisha'})`
              ).join('; ');
              content += `\n\n[Mapendekezo ya Gulio yaliyoonyeshwa: ${summaries}]`;
            } else if (rec.targetType === 'shop' && rec.shops && rec.shops.length > 0) {
              const summaries = rec.shops.map((s, idx) =>
                `Duka #${idx + 1}: ${s.shopName} (Mahali: ${s.region || s.location}${s.sellerVerified ? ', Muuzaji aliyethibitishwa' : ''})`
              ).join('; ');
              content += `\n\n[Maduka ya Gulio yaliyoonyeshwa: ${summaries}]`;
            }
          }

          return {
            role: m.role === 'model' ? 'assistant' : 'user',
            text: content,
            content,
            imageAttachment: m.imageAttachment ? {
              fileName: m.imageAttachment.fileName,
              mimeType: m.imageAttachment.mimeType,
              sizeBytes: m.imageAttachment.sizeBytes,
              width: m.imageAttachment.width,
              height: m.imageAttachment.height,
              imageAvailableForModel: false,
            } : undefined,
            videoAttachment: m.videoAttachment ? {
              id: m.videoAttachment.id,
              fileName: m.videoAttachment.fileName,
              mimeType: m.videoAttachment.mimeType,
              fileSize: m.videoAttachment.fileSize,
              sizeBytes: m.videoAttachment.sizeBytes || m.videoAttachment.fileSize,
              duration: m.videoAttachment.duration,
              durationSeconds: m.videoAttachment.durationSeconds || m.videoAttachment.duration,
              width: m.videoAttachment.width,
              height: m.videoAttachment.height,
              videoAvailableForModel: false,
            } : undefined,
            visualMarketplaceIntent: m.visualMarketplaceIntent,
            visualMarketplaceQuery: m.visualMarketplaceQuery,
          };
        });

      // Retrieve farmer records for context
      let activeRecords = records;
      let activeEventsMap = { ...recordEventsMap };

      // Strictly isolated: only check current authenticated user's cached records if activeRecords is empty
      if (currentAuthUid && activeRecords.length === 0) {
        try {
          const cached = localStorage.getItem(`livestock_records_${currentAuthUid}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              activeRecords = parsed;
            }
          }
        } catch {}
      }

      if (currentAuthUid && activeRecords.length > 0) {
        for (const rec of activeRecords) {
          if (!activeEventsMap[rec.recordId] || activeEventsMap[rec.recordId].length === 0) {
            try {
              const evtsCached = localStorage.getItem(`livestock_events_${currentAuthUid}_${rec.recordId}`);
              if (evtsCached) {
                const parsedEvts = JSON.parse(evtsCached);
                if (Array.isArray(parsedEvts) && parsedEvts.length > 0) {
                  activeEventsMap[rec.recordId] = parsedEvts;
                }
              }
            } catch {}
          }
        }
      }

      const activeFarmerContext = buildFarmerContext(
        currentAuthUid || 'guest_farmer',
        userProfile,
        activeRecords,
        activeEventsMap,
        activeRecords.length > 0 ? null : dataError
      );

      const serializedContext = serializeFarmerContextForAI(activeFarmerContext);

      const userFarmerLocation = userProfile?.location || userProfile?.region || '';

      // Call server AI proxy (multimodal via FormData when image or video is attached, JSON otherwise)
      abortController = new AbortController();
      activeAbortControllerRef.current = abortController;
      const clientTimeout = setTimeout(() => {
        abortController?.abort('TIMEOUT');
      }, currentSelectedVideo ? VIDEO_PROCESSING_LIMITS.PROCESSING_TIMEOUT_MS : 50000);

      let response: Response;
      try {
        let clientAuthToken = '';
        try {
          if (auth.currentUser) {
            clientAuthToken = await auth.currentUser.getIdToken();
          }
        } catch {}
        const authHeaders: Record<string, string> = {
          'x-user-id': effectiveUserId,
          ...(clientAuthToken ? { Authorization: `Bearer ${clientAuthToken}` } : {})
        };

        // Sanitize and compact context records to prevent oversized multipart payloads
        const compactMarketplaceProducts = marketplaceProducts.length > 0
          ? marketplaceProducts.slice(0, 30).map((p) => ({
              id: p.id,
              title: p.title,
              price: p.price,
              category: p.category,
              sellerName: p.sellerName,
              sellerBusinessName: p.sellerBusinessName,
              inStock: p.inStock,
              region: p.region,
              location: p.location,
              district: p.district,
              sellerVerified: p.sellerVerified,
            }))
          : undefined;

        const compactPublishedShops = publishedShops.length > 0
          ? publishedShops.slice(0, 20).map((s) => ({
              id: s.id,
              shopName: s.shopName,
              sellerName: s.sellerName,
              location: s.location,
              region: s.region,
              sellerVerified: s.sellerVerified,
            }))
          : undefined;

        const compactDaktariProfiles = daktariProfiles.length > 0
          ? daktariProfiles.slice(0, 20).map((d: any) => ({
              id: d.uid || d.id,
              name: d.fullName || d.name,
              fullName: d.fullName || d.name,
              professionalTitle: d.professionalTitle || d.title || 'Daktari wa Mifugo',
              specialization: d.specialization || d.livestockSpecialties?.[0] || 'Daktari wa Mifugo',
              livestockSpecialties: Array.isArray(d.livestockSpecialties) ? d.livestockSpecialties : [],
              livestockTypes: Array.isArray(d.livestockSpecialties) ? d.livestockSpecialties : (Array.isArray(d.livestockTypes) ? d.livestockTypes : []),
              region: d.region,
              district: d.district,
              phone: d.phone,
              whatsapp: d.whatsapp,
              isVerified: Boolean(d.isVerified || d.verificationStatus === 'verified' || d.verificationStatus === 'VERIFIED'),
              verificationStatus: d.verificationStatus,
            }))
          : undefined;

        const buildRequest = () => {
          if (currentSelectedImage?.file) {
            const formData = new FormData();
            formData.append('image', currentSelectedImage.file);
            formData.append('userId', effectiveUserId);
            if (textToSend.trim()) {
              formData.append('question', textToSend.trim());
            }
            formData.append('history', JSON.stringify(validHistory));
            formData.append('farmerContext', serializedContext);
            formData.append('farmerContextStatus', activeFarmerContext.status);
            formData.append('farmerLocation', userFarmerLocation);
            formData.append('farmerRecords', JSON.stringify(activeRecords));
            formData.append('recordEventsMap', JSON.stringify(activeEventsMap));
            if (compactMarketplaceProducts) {
              formData.append('marketplaceProducts', JSON.stringify(compactMarketplaceProducts));
            }
            if (compactPublishedShops) {
              formData.append('publishedShops', JSON.stringify(compactPublishedShops));
            }
            if (compactDaktariProfiles) {
              formData.append('daktariProfiles', JSON.stringify(compactDaktariProfiles));
            }
            formData.append('imageAttachment', JSON.stringify({
              fileName: currentSelectedImage.fileName,
              mimeType: currentSelectedImage.mimeType,
              sizeBytes: currentSelectedImage.sizeBytes,
              width: currentSelectedImage.width,
              height: currentSelectedImage.height,
            }));

            return fetch('/api/ai-assistant', {
              method: 'POST',
              headers: authHeaders,
              credentials: 'include',
              body: formData,
              signal: abortController.signal,
            });
          } else if (currentSelectedVideo?.file) {
            // Stage: VIDEO_PROCESSING_PREPARE & VIDEO_TRANSPORT
            // Direct binary multipart form upload. NO BASE64 encoding.
            const formData = new FormData();
            formData.append('video', currentSelectedVideo.file, currentSelectedVideo.fileName);
            formData.append('userId', effectiveUserId);
            if (textToSend.trim()) {
              formData.append('question', textToSend.trim());
            }
            formData.append('history', JSON.stringify(validHistory));
            formData.append('farmerContext', serializedContext);
            formData.append('farmerContextStatus', activeFarmerContext.status);
            formData.append('farmerLocation', userFarmerLocation);
            formData.append('farmerRecords', JSON.stringify(activeRecords));
            formData.append('recordEventsMap', JSON.stringify(activeEventsMap));
            if (compactMarketplaceProducts) {
              formData.append('marketplaceProducts', JSON.stringify(compactMarketplaceProducts));
            }
            if (compactPublishedShops) {
              formData.append('publishedShops', JSON.stringify(compactPublishedShops));
            }
            if (compactDaktariProfiles) {
              formData.append('daktariProfiles', JSON.stringify(compactDaktariProfiles));
            }
            formData.append('videoAttachment', JSON.stringify({
              id: currentSelectedVideo.id,
              fileName: currentSelectedVideo.fileName,
              mimeType: currentSelectedVideo.mimeType,
              fileSize: currentSelectedVideo.fileSize,
              duration: currentSelectedVideo.duration,
              width: currentSelectedVideo.width,
              height: currentSelectedVideo.height,
            }));

            return fetch('/api/ai-assistant', {
              method: 'POST',
              headers: authHeaders,
              credentials: 'include',
              body: formData,
              signal: abortController.signal,
            });
          } else {
            return fetch('/api/ai-assistant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              credentials: 'include',
              body: JSON.stringify({
                userId: effectiveUserId,
                question: textToSend.trim(),
                history: validHistory,
                farmerContext: serializedContext,
                farmerContextStatus: activeFarmerContext.status,
                farmerLocation: userFarmerLocation,
                farmerRecords: activeRecords,
                recordEventsMap: activeEventsMap,
                marketplaceProducts: compactMarketplaceProducts,
                publishedShops: compactPublishedShops,
                daktariProfiles: compactDaktariProfiles,
              }),
              signal: abortController.signal,
            });
          }
        };

        // Primary fetch attempt with automatic retries for transient socket drops / server warmup
        let resAttempt: Response | null = null;
        let lastFetchErr: any = null;
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            resAttempt = await buildRequest();
            if (resAttempt.ok) {
              break;
            }
            // If reverse proxy returns 502/503/504 during server boot, retry after backoff
            if ((resAttempt.status === 502 || resAttempt.status === 503 || resAttempt.status === 504) && attempt < maxAttempts && !abortController.signal.aborted) {
              await new Promise((r) => setTimeout(r, attempt * 1200));
              continue;
            }
            break;
          } catch (fetchErr: any) {
            lastFetchErr = fetchErr;
            const isTransientNetErr = fetchErr?.name === 'TypeError' ||
              fetchErr?.message?.includes('Failed to fetch') ||
              fetchErr?.message?.includes('NetworkError') ||
              fetchErr?.message?.includes('Load failed');

            if (isTransientNetErr && attempt < maxAttempts && !abortController.signal.aborted) {
              // Container proxy or dev server may be momentarily reconnecting; pause and retry
              await new Promise((r) => setTimeout(r, attempt * 1200));
              continue;
            }
            throw fetchErr;
          }
        }

        if (!resAttempt) {
          throw lastFetchErr || new Error('Hitilafu ya mtandao wakati wa kuwasiliana na huduma ya AI');
        }

        response = resAttempt;
      } finally {
        clearTimeout(clientTimeout);
      }

      // Robust response parsing protecting against non-JSON (e.g. HTML proxy errors or SPA index.html)
      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();

      let data: any = null;
      if (contentType.includes('application/json') || responseText.trim().startsWith('{')) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }

      if (!data || (!response.ok && !(data && data.allowed === false))) {
        errorAlreadyLogged = true;
        if (currentSelectedVideo) {
          const diagCategory = data?.diagnosticCategory || VIDEO_ERROR_CATEGORIES.VIDEO_TRANSPORT_FAILED;
          const swahiliMsg = mapVideoErrorToSwahili(diagCategory, data?.error);
          console.warn(`[VideoDiagnostic] Server error: stage=${data?.stage || VIDEO_PIPELINE_STAGES.VIDEO_TRANSPORT}, category=${diagCategory}`);
          throw new Error(swahiliMsg);
        }

        const diagStage = data?.stage || IMAGE_PIPELINE_STAGES.IMAGE_TRANSPORT;
        const diagCategory = data?.diagnosticCategory || IMAGE_ERROR_CATEGORIES.IMAGE_REQUEST_FAILED;
        console.warn(`[ImageDiagnostic] Server response error: stage=${diagStage}, category=${diagCategory}`);

        let serverErrorMsg: string | undefined;
        if (data && typeof data.error === 'string') {
          serverErrorMsg = data.error;
        } else if (responseText.includes('504') || responseText.includes('Gateway Time-out')) {
          serverErrorMsg = 'Mtandao umeshindwa kufikia huduma ya AI kwa wakati (Gateway Timeout). Tafadhali bonyeza kitufe cha kujaribu tena hapo chini.';
        } else if (responseText.includes('502') || responseText.includes('Bad Gateway')) {
          serverErrorMsg = 'Seva inajirekebisha kwa sasa (Bad Gateway). Tafadhali subiri sekunde chache kisha ubonyeze kitufe cha kujaribu tena.';
        } else if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<!DOCTYPE') || responseText.includes('<html')) {
          serverErrorMsg = 'Huduma ya AI inashughulikia maombi mengi au inajirekebisha kwa sasa. Tafadhali subiri kidogo kisha ubonyeze kitufe cha kujaribu tena.';
        } else {
          serverErrorMsg = `Kumetokea hitilafu ya mtandao (Hali: ${response.status}). Tafadhali hakiki muunganisho wako kisha ujaribu tena.`;
        }
        throw new Error(serverErrorMsg);
      }

      // Update local quota info from authoritative server response
      if (data && (data.freeLimit !== undefined || data.freeRemaining !== undefined || data.allowed === false || data.remainingTextQueries !== undefined)) {
        const limit = typeof data.freeLimit === 'number' ? data.freeLimit : 10;
        const used = typeof data.freeUsed === 'number' ? data.freeUsed : (data.allowed === false ? 10 : 0);
        const remaining = typeof data.freeRemaining === 'number' ? data.freeRemaining : (data.allowed === false ? 0 : Math.max(0, limit - used));
        const adRewardRem = typeof data.adRewardRemaining === 'number'
          ? data.adRewardRemaining
          : (typeof data.summary?.currentAdRewardRemaining === 'number' ? data.summary.currentAdRewardRemaining : 0);
        const remainingQueries = typeof data.remainingTextQueries === 'number'
          ? data.remainingTextQueries
          : (remaining + adRewardRem);
        const tier = data.entitlementTier || 'FREE';
        updateUserQuota({
          freeLimit: limit,
          freeUsed: used,
          freeRemaining: remaining,
          adRewardRemaining: adRewardRem,
          remainingTextQueries: remainingQueries,
          entitlementTier: tier,
          canUseAdReward: Boolean(data.canUseAdReward),
          mediaAllowed: Boolean(data.mediaAllowed),
          isBlocked: data.allowed === false || (tier === 'FREE' && remainingQueries <= 0)
        });
      }

      const botReply = data.reply || 'Samahani, sikuweza kupata jibu kwa sasa. Tafadhali jaribu tena.';
      const isPersonalized = Boolean(data.personalized);
      const botNowIso = new Date().toISOString();
      const botTimeStr = new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });

      // Process Marketplace Recommendations if intent was detected
      let marketplaceRecResult: AiMarketplaceRecommendationResult | undefined = undefined;
      if (data.marketplaceIntent?.detected) {
        try {
          let prods = marketplaceProducts;
          let shops = publishedShops;
          if (prods.length === 0) {
            prods = await fetchMarketplaceProducts();
            setMarketplaceProducts(prods);
          }
          if (shops.length === 0 && prods.length > 0) {
            shops = await fetchAllPublishedShops(prods);
            setPublishedShops(shops);
          }

          marketplaceRecResult = await getMarketplaceRecommendations(
            textToSend.trim(),
            prods,
            shops,
            userFarmerLocation
          );
        } catch (recErr) {
          console.warn('Marketplace recommendation retrieval issue:', recErr);
          marketplaceRecResult = {
            detected: true,
            intentType: data.marketplaceIntent.intentType || 'PRODUCT_SEARCH',
            confidence: data.marketplaceIntent.confidence || 'MEDIUM',
            targetType: data.marketplaceIntent.targetType || 'product',
            queryKeywords: data.marketplaceIntent.keywords || [],
            queryCategory: data.marketplaceIntent.category,
            queryLocation: data.marketplaceIntent.location,
            status: 'error',
            explanation: 'Gulio halikupatikana kwa sasa. Unaweza kuendelea kutafuta kwenye ukurasa wa Gulio.',
            products: [],
            shops: []
          };
        }
      }

      // Process Doctor Action if returned by server or detected from context (V1.2G AI ↔ Daktari Handoff)
      let resolvedDoctorAction: AiDoctorAction | undefined = undefined;
      if (data?.doctorAction || (Array.isArray(data?.actions) && data.actions.length > 0)) {
        const rawAction = data.doctorAction || data.actions.find((a: any) => a?.type === 'FIND_DOCTOR');
        resolvedDoctorAction = validateAndSanitizeDoctorAction(rawAction) || undefined;
      }

      // Safe fallback evaluation if server did not attach doctorAction
      if (!resolvedDoctorAction) {
        const clientDocEval = classifyDoctorIntent({
          userQuestion: textToSend.trim(),
          aiResponseText: botReply,
          hasImageAttachment: Boolean(currentSelectedImage),
          hasVideoAttachment: Boolean(currentSelectedVideo),
          farmerLocation: userFarmerLocation,
          farmerPrimaryLivestock: userProfile?.mainLivestock?.[0],
        });
        if (clientDocEval.detected && clientDocEval.action) {
          resolvedDoctorAction = validateAndSanitizeDoctorAction(clientDocEval.action) || undefined;
        }
      }

      // Process Visual Marketplace Intent (V1.3A & V1.3B Visual Product Intent & Query)
      let resolvedVisualIntent: VisualMarketplaceIntentResult | undefined = data?.visualMarketplaceIntent;
      if (!resolvedVisualIntent) {
        const clientHistory: VisualConversationHistoryMessage[] = validHistory.map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          text: m.text,
          hasImage: Boolean(m.imageAttachment),
          hasVideo: Boolean(m.videoAttachment),
          visualObject: m.visualMarketplaceIntent?.visualObject || m.visualMarketplaceQuery?.visualObject,
          visualIntent: m.visualMarketplaceIntent?.intent || m.visualMarketplaceIntent?.intentType,
          productConcept: m.visualMarketplaceQuery?.productConcept,
          structuredQuery: m.structuredVisualMarketplaceQuery || m.visualMarketplaceIntent?.structuredQuery || m.visualMarketplaceQuery?.structuredQuery
        }));

        resolvedVisualIntent = classifyVisualMarketplaceIntent({
          userText: textToSend.trim(),
          hasImageAttachment: Boolean(currentSelectedImage),
          hasVideoAttachment: Boolean(currentSelectedVideo),
          farmerLocation: userFarmerLocation,
          farmerPrimaryLivestock: userProfile?.mainLivestock?.[0],
          conversationHistory: clientHistory,
        });
      }

      if (resolvedVisualIntent) {
        resolvedVisualIntent = validateAndSanitizeVisualIntentResult(resolvedVisualIntent);
      }

      const resolvedStructuredQuery: StructuredVisualMarketplaceQuery | undefined =
        resolvedVisualIntent?.structuredQuery ||
        resolvedVisualIntent?.normalizedQuery?.structuredQuery ||
        data?.structuredVisualMarketplaceQuery ||
        undefined;

      // If no text-based recommendations were produced, but visual commerce intent exists, run visual recommendations
      if (!marketplaceRecResult && resolvedVisualIntent?.detected && resolvedStructuredQuery && !resolvedVisualIntent.isMedicalRestricted && !resolvedDoctorAction) {
        try {
          let prods = marketplaceProducts;
          let shops = publishedShops;
          if (prods.length === 0) {
            prods = await fetchMarketplaceProducts();
            setMarketplaceProducts(prods);
          }
          if (shops.length === 0 && prods.length > 0) {
            shops = await fetchAllPublishedShops(prods);
            setPublishedShops(shops);
          }
          marketplaceRecResult = getVisualMarketplaceRecommendations(
            resolvedStructuredQuery,
            prods,
            shops,
            userFarmerLocation
          );
        } catch (visRecErr) {
          console.warn('Error fetching visual marketplace recommendations:', visRecErr);
        }
      }

      const botActions: (AiDoctorAction | VisualMarketplaceAction)[] = [];
      if (resolvedDoctorAction) {
        botActions.push(resolvedDoctorAction);
      } else if (resolvedVisualIntent && resolvedVisualIntent.detected && resolvedVisualIntent.normalizedQuery && !resolvedVisualIntent.isMedicalRestricted) {
        botActions.push({
          type: 'VISUAL_MARKETPLACE_CTA',
          label: `🔎 Tafuta "${resolvedVisualIntent.normalizedQuery.productConcept}" Sokoni`,
          source: resolvedVisualIntent.source,
          query: resolvedVisualIntent.normalizedQuery,
          structuredQuery: resolvedStructuredQuery || null,
          status: 'foundation_ready'
        });
      }

      // V1.4G History Question Result resolution
      let resolvedHistoryQuestionResult = data?.historyQuestionResult;
      if (!resolvedHistoryQuestionResult && textToSend.trim()) {
        try {
          const clientHistoryEval = getHistoryQuestionResult(
            storageUid || 'user',
            activeRecords,
            activeEventsMap,
            textToSend.trim(),
            validHistory
          );
          if (clientHistoryEval && clientHistoryEval.detected) {
            resolvedHistoryQuestionResult = clientHistoryEval;
          }
        } catch {}
      }

      const botMessage: AiChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: botReply,
        timestamp: botTimeStr,
        createdAt: botNowIso,
        personalized: isPersonalized,
        marketplaceRecommendations: marketplaceRecResult,
        doctorAction: resolvedDoctorAction,
        daktariIntelligence: data?.daktariIntelligence || data?.contextBundle?.daktariIntelligenceResult || undefined,
        historyQuestionResult: resolvedHistoryQuestionResult || undefined,
        contextBundle: data?.contextBundle || undefined,
        visualMarketplaceIntent: resolvedVisualIntent,
        visualMarketplaceQuery: resolvedVisualIntent?.normalizedQuery || undefined,
        structuredVisualMarketplaceQuery: resolvedStructuredQuery || undefined,
        actions: botActions.length > 0 ? botActions : undefined,
      };

      const finalMessages = [...updatedMessages, botMessage];
      setMessages(finalMessages);
      lastFailedRequestRef.current = null; // Clear failed request on success

      // Persist assistant message in localStorage and Firestore
      try {
        const safeFinalMessagesToCache = finalMessages.map((m) => ({
          ...m,
          imageAttachment: m.imageAttachment ? {
            ...m.imageAttachment,
            localPreviewUrl: undefined,
            imageAvailableForModel: false,
          } : undefined,
          videoAttachment: m.videoAttachment ? {
            ...m.videoAttachment,
            localPreviewUrl: undefined,
            videoAvailableForModel: false,
          } : undefined,
        }));
        localStorage.setItem(`ai_conv_messages_${storageUid}_${activeConvId}`, JSON.stringify(safeFinalMessagesToCache));
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.conversationId === activeConvId
              ? {
                  ...c,
                  updatedAt: botNowIso,
                  lastMessageAt: botNowIso,
                  messageCount: finalMessages.length,
                }
              : c
          );
          localStorage.setItem(`ai_conversations_${storageUid}`, JSON.stringify(updated));
          return updated;
        });
      } catch {}

      if (currentAuthUid) {
        try {
          const assistantMsgDoc: AiMessage = {
            messageId: botMessage.id,
            role: 'assistant',
            content: botReply,
            createdAt: botNowIso,
            personalized: isPersonalized,
            marketplaceRecommendations: marketplaceRecResult,
            doctorAction: resolvedDoctorAction,
            historyQuestionResult: resolvedHistoryQuestionResult || undefined,
            contextBundle: data?.contextBundle || undefined,
            visualMarketplaceIntent: resolvedVisualIntent,
            visualMarketplaceQuery: resolvedVisualIntent?.normalizedQuery || undefined,
            actions: botActions.length > 0 ? botActions : undefined,
          };

          const activeUser = auth.currentUser;
          if (activeUser && activeUser.uid === currentAuthUid) {
            await activeUser.getIdToken();
          }

          await setDoc(
            doc(db, 'users', currentAuthUid, 'aiConversations', activeConvId, 'messages', botMessage.id),
            sanitizeFirestoreData(assistantMsgDoc)
          );

          await setDoc(
            doc(db, 'users', currentAuthUid, 'aiConversations', activeConvId),
            sanitizeFirestoreData({
              updatedAt: botNowIso,
              lastMessageAt: botNowIso,
              messageCount: finalMessages.length,
            }),
            { merge: true }
          );
        } catch (botMsgSaveErr) {
          const classified = classifyFirestoreError(botMsgSaveErr);
          console.debug(`[${classified.code}] Could not persist assistant message to Firestore:`, classified.message);
        }
      }
    } catch (err: any) {
      const isAborted = Boolean(abortController?.signal.aborted) || err?.name === 'AbortError';
      const isUserCancel = isAborted && abortController?.signal.reason === 'USER_CANCELLED';

      if (!errorAlreadyLogged) {
        if (currentSelectedVideo) {
          console.warn(`[VideoDiagnostic] Stage: ${VIDEO_PIPELINE_STAGES.VIDEO_TRANSPORT}, Category: ${isUserCancel ? 'CANCELLED' : VIDEO_ERROR_CATEGORIES.VIDEO_TRANSPORT_FAILED}`);
        } else if (currentSelectedImage && !isUserCancel && !isAborted) {
          console.warn(`[ImageDiagnostic] Stage: ${IMAGE_PIPELINE_STAGES.IMAGE_TRANSPORT}, Category: ${IMAGE_ERROR_CATEGORIES.IMAGE_REQUEST_FAILED}`);
        }
        if (!isUserCancel) {
          console.warn('AI assistant request issue:', err?.message || err);
        }
      }

      // Preserve failed request parameters for safe, non-duplicating retry
      lastFailedRequestRef.current = {
        text: textToSend,
        imageState: currentSelectedImage,
        videoState: currentSelectedVideo,
        userMessageId: userMsgId
      };

      let serverErrMsg = 'Samahani, kumetokea hitilafu wakati wa kuchakata jibu. Tafadhali jaribu tena baada ya sekunde chache.';
      if (isUserCancel) {
        serverErrMsg = 'Usafirishaji wa video umesitishwa. Unaweza kujaribu tena au kuchagua video nyingine.';
      } else if (isAborted) {
        serverErrMsg = currentSelectedVideo
          ? 'Muda wa kupakia na kuhakiki video umekwisha. Tafadhali hakiki mtandao wako au tuma video fupi zaidi.'
          : 'Muda wa kusubiri jibu la AI umekwisha. Tafadhali jaribu tena baada ya sekunde chache.';
      } else if (err?.message && typeof err.message === 'string') {
        const raw = err.message.trim();
        const isNetworkDrop = raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('Load failed');
        const isRateLimit = raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota');
        const isGatewayTimeout = raw.includes('504') || raw.includes('Gateway Timeout') || raw.includes('Timed out');
        const isBadGateway = raw.includes('502') || raw.includes('Bad Gateway') || raw.includes('503');

        if (isNetworkDrop) {
          serverErrMsg = 'Muunganisho wa mtandao ulikatika. Tafadhali hakiki intaneti yako kisha ujaribu tena.';
        } else if (isRateLimit) {
          serverErrMsg = 'Kuna maombi mengi kwa sasa kwenye huduma ya AI. Tafadhali subiri sekunde chache kisha uulize tena.';
        } else if (isGatewayTimeout) {
          serverErrMsg = 'Huduma ya AI imechukua muda mrefu kujibu. Tafadhali bonyeza kitufe cha kujaribu tena hapo chini.';
        } else if (isBadGateway) {
          serverErrMsg = 'Seva inajirekebisha kwa sasa. Tafadhali subiri sekunde chache kisha ubonyeze kitufe cha kujaribu tena.';
        } else if (
          raw.length > 0 &&
          !raw.includes('<!doctype') &&
          !raw.includes('<!DOCTYPE') &&
          !raw.includes('<html') &&
          !raw.includes('Unexpected token') &&
          !raw.includes('is not valid JSON')
        ) {
          serverErrMsg = raw;
        }
      }
      const errorMessage: AiChatMessage = {
        id: `error-${Date.now()}`,
        role: 'model',
        text: serverErrMsg,
        timestamp: new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString()
      };
      const errorMessages = [...updatedMessages, errorMessage];
      setMessages(errorMessages);
      if (activeConvId) {
        try {
          const safeErrorMessagesToCache = errorMessages.map((m) => ({
            ...m,
            imageAttachment: m.imageAttachment ? {
              ...m.imageAttachment,
              localPreviewUrl: undefined,
              imageAvailableForModel: false,
            } : undefined,
            videoAttachment: m.videoAttachment ? {
              ...m.videoAttachment,
              localPreviewUrl: undefined,
              videoAvailableForModel: false,
            } : undefined,
          }));
          localStorage.setItem(`ai_conv_messages_${storageUid}_${activeConvId}`, JSON.stringify(safeErrorMessagesToCache));
        } catch {}
      }
    } finally {
      activeAbortControllerRef.current = null;
      isSendingRef.current = false;
      setIsLoading(false);
      setActiveProcessingType(null);
    }
  };

  // User cancellation handler for in-flight video transport / verification
  const handleCancelUpload = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort('USER_CANCELLED');
      activeAbortControllerRef.current = null;
    }
  };

  // Retry last failed request handler
  const handleRetryLast = (errorMsgId?: string) => {
    if (!lastFailedRequestRef.current || isLoading || isSendingRef.current) return;
    const { text, imageState, videoState, userMessageId } = lastFailedRequestRef.current;

    // Remove the error message from current chat
    setMessages((prev) => prev.filter((m) => errorMsgId ? m.id !== errorMsgId : !m.id.startsWith('error-')));

    // If the user selected a new video or image in the composer after failure, prefer the new attachment (Section 22)
    const effectiveVideoState = selectedVideo || videoState;
    const effectiveImageState = selectedImage || imageState;

    // Re-dispatch send using the exact text and attachment without duplicating user message
    handleSend(text, effectiveImageState, effectiveVideoState, true, userMessageId);
  };

  // Sample prompts based on farmer context, video selection, & marketplace intent
  const samplePrompts = useMemo(() => {
    if (selectedVideo) {
      return [
        'Unaona nini kwenye video hii?',
        'Angalia tabia ya huyu mnyama au kuku.',
        'Ni nini kinachoendelea kwenye video?',
        'Je, kuna kitu kisicho cha kawaida unachokiona?',
        'Eleza mkao na mienendo inayoonekana hapa.',
      ];
    }

    if (farmerContext.status === 'ready' && farmerContext.livestock.totalGroups > 0) {
      const firstGroup = farmerContext.livestock.groups[0];
      return [
        'Mifugo yangu yote iko vipi kwa sasa?',
        `Nieleze kuhusu kundi la ${firstGroup.recordName || firstGroup.livestockType}`,
        'Tukio langu la mwisho la mifugo ni lipi?',
        'Dalili za ugonjwa wa sotoka (Newcastle)',
        'Tafuta daktari wa mifugo aliye karibu',
        'Natafuta chakula bora cha kuku sokoni',
      ];
    }

    return [
      'Ulishaji wa kuku wa kienyeji wanaotaga',
      'Dalili za ugonjwa wa sotoka (Newcastle)',
      'Tafuta daktari wa mifugo aliye karibu',
      "Jinsi ya kutengeneza chakula cha ng'ombe wa maziwa",
      'Natafuta chakula cha kuku wa mayai sokoni',
      'Natafuta incubator ya kutotolesha mayai',
    ];
  }, [farmerContext, selectedVideo]);

  // Current active conversation title
  const activeConversationTitle = useMemo(() => {
    if (!currentConversationId) return '';
    const found = conversations.find((c) => c.conversationId === currentConversationId);
    return found ? found.title : '';
  }, [currentConversationId, conversations]);

  // Filtered conversations for sidebar / drawer search
  const filteredConversations = useMemo(() => {
    if (!historySearchTerm.trim()) return conversations;
    const term = historySearchTerm.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(term));
  }, [conversations, historySearchTerm]);

  const totalRemainingQueries = userQuotaInfo
    ? (typeof userQuotaInfo.remainingTextQueries === 'number'
        ? userQuotaInfo.remainingTextQueries
        : Math.max(0, userQuotaInfo.freeRemaining + (userQuotaInfo.adRewardRemaining || 0)))
    : 10;

  const isQuotaBlocked = Boolean(
    userQuotaInfo &&
    userQuotaInfo.entitlementTier === 'FREE' &&
    totalRemainingQueries <= 0
  );

  return (
    <div className="flex-1 flex h-[calc(100vh-60px-65px)] bg-stone-50 overflow-hidden">
      {/* Desktop Persistent History Sidebar (Visible on lg: screens) */}
      <aside className="hidden lg:flex flex-col w-72 xl:w-80 bg-white border-r border-stone-200 shrink-0">
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-stone-200 bg-stone-50/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-emerald-700" />
            <h2 className="font-bold text-stone-900 text-xs uppercase tracking-wider">
              Historia ya Mazungumzo
            </h2>
          </div>
          {conversations.length > 0 && (
            <span className="bg-emerald-100 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full font-bold border border-emerald-300">
              {conversations.length}
            </span>
          )}
        </div>

        {/* New Chat Button */}
        <div className="p-3 border-b border-stone-100">
          <button
            id="desktop-new-conversation-btn"
            onClick={handleStartNewConversation}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Mazungumzo Mapya</span>
          </button>
        </div>

        {/* Search Input for History */}
        {conversations.length > 3 && (
          <div className="p-2.5 border-b border-stone-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
                placeholder="Tafuta mazungumzo..."
                className="w-full pl-8 pr-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-700"
              />
            </div>
          </div>
        )}

        {/* Sidebar Conversations List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {isLoadingConversations ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-2 text-stone-400">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
              <span className="text-xs">Inapakia historia...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-44 text-center p-3 space-y-2">
              <MessageSquareOff className="w-6 h-6 text-stone-300" />
              <p className="text-xs font-medium text-stone-500">
                {historySearchTerm ? 'Hakuna matokeo.' : 'Hujawa na mazungumzo bado.'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.conversationId === currentConversationId;
              const dateDisplay = formatSwahiliDate(conv.updatedAt || conv.createdAt);

              return (
                <div
                  key={conv.conversationId}
                  className={`group relative rounded-xl border p-2.5 transition-all cursor-pointer flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-emerald-50/90 border-emerald-400 shadow-2xs'
                      : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  }`}
                  onClick={() => handleSelectConversation(conv)}
                >
                  <div className="flex items-start space-x-2 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                        isSelected ? 'text-emerald-700' : 'text-stone-400 group-hover:text-stone-600'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <h3
                        className={`text-xs font-bold truncate leading-snug ${
                          isSelected ? 'text-emerald-950' : 'text-stone-900'
                        }`}
                      >
                        {conv.title}
                      </h3>
                      <div className="flex items-center space-x-1.5 mt-1 text-[10px] text-stone-500">
                        <span>{dateDisplay}</span>
                        {conv.messageCount > 0 && (
                          <span className="bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-medium text-[9px]">
                            {conv.messageCount} ujumbe
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenRename(conv);
                      }}
                      className="p-1 rounded text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                      title="Badili Jina"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv);
                      }}
                      className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Futa Mazungumzo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full bg-stone-50 relative overflow-hidden">
        {/* Top Header Bar */}
        <div className="bg-white border-b border-stone-200 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 shadow-2xs shrink-0">
          {/* Active Conversation Title */}
          <div className="flex items-center min-w-0 flex-1 mr-1">
            {currentConversationId && activeConversationTitle ? (
              <h2
                className="text-xs sm:text-sm font-bold text-stone-800 truncate leading-snug"
                title={activeConversationTitle}
              >
                {activeConversationTitle}
              </h2>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* AI Free Quota / Entitlement Badge */}
            {userQuotaInfo && (
              userQuotaInfo.entitlementTier === 'PREMIUM' ? (
                <div
                  id="ai-entitlement-badge-premium"
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500 text-white border border-amber-600 text-xs font-bold shadow-2xs"
                  title="Akaunti ya Premium — Matumizi Bila Kikomo"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Premium</span>
                </div>
              ) : (
                (() => {
                  const remaining = typeof userQuotaInfo.remainingTextQueries === 'number'
                    ? userQuotaInfo.remainingTextQueries
                    : Math.max(0, userQuotaInfo.freeRemaining + (userQuotaInfo.adRewardRemaining || 0));
                  const adRewardCount = typeof userQuotaInfo.adRewardRemaining === 'number'
                    ? userQuotaInfo.adRewardRemaining
                    : Math.max(0, remaining - userQuotaInfo.freeRemaining);
                  const hasRewardedBonus = adRewardCount > 0;

                  if (remaining <= 0) {
                    return (
                      <div
                        id="ai-entitlement-badge-free"
                        className="shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-bold shadow-2xs bg-amber-100 text-amber-900 border-amber-300"
                        title="Umefikia ukomo wa maswali: 0 yaliyosalia"
                      >
                        <Bot className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span className="hidden sm:inline">Maswali: 0/10</span>
                        <span className="sm:hidden">0/10</span>
                      </div>
                    );
                  }

                  if (hasRewardedBonus && userQuotaInfo.freeRemaining <= 0) {
                    return (
                      <div
                        id="ai-entitlement-badge-free"
                        className="shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-bold shadow-2xs bg-emerald-50 text-emerald-800 border-emerald-300"
                        title={`Maswali ya AI: ${remaining} yaliyosalia kutokana na zawadi ya tangazo (+${adRewardCount})`}
                      >
                        <Bot className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Maswali: {remaining}</span>
                      </div>
                    );
                  }

                  if (hasRewardedBonus && userQuotaInfo.freeRemaining > 0) {
                    return (
                      <div
                        id="ai-entitlement-badge-free"
                        className="shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-semibold shadow-2xs bg-emerald-50 text-emerald-800 border-emerald-300"
                        title={`Maswali: ${remaining} (${userQuotaInfo.freeRemaining} bure + ${adRewardCount} zawadi)`}
                      >
                        <Bot className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Maswali: {remaining}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      id="ai-entitlement-badge-free"
                      className="shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-semibold shadow-2xs bg-stone-100 text-stone-700 border-stone-300"
                      title={`Ukomo wa maswali ya bure: ${userQuotaInfo.freeRemaining} kati ya ${userQuotaInfo.freeLimit}`}
                    >
                      <Bot className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                      <span className="hidden sm:inline">Maswali: {userQuotaInfo.freeRemaining}/{userQuotaInfo.freeLimit}</span>
                      <span className="sm:hidden">{userQuotaInfo.freeRemaining}/{userQuotaInfo.freeLimit}</span>
                    </div>
                  );
                })()
              )
            )}

            {/* Farmer Context Connection Badge (compact on small screens) */}
            {farmerContext.status === 'ready' && (
              <div
                id="ai-farmer-livestock-badge"
                className="hidden md:flex shrink-0 items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-100/90 text-emerald-900 border border-emerald-300 text-xs font-bold shadow-2xs"
                title={`Mifugo iliyopo: ${farmerContext.livestock.totalCurrentQuantity}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="whitespace-nowrap">Mifugo: {farmerContext.livestock.totalCurrentQuantity}</span>
              </div>
            )}

            {/* AI Assistant Overflow Menu (⋮) */}
            <div className="relative shrink-0" ref={overflowMenuRef}>
              <button
                id="ai-overflow-menu-btn"
                type="button"
                onClick={() => setIsAiOverflowOpen((prev) => !prev)}
                className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 active:bg-stone-200 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
                title="Machaguo ya ziada"
                aria-label="Machaguo ya ziada ya mazungumzo"
                aria-expanded={isAiOverflowOpen}
              >
                <MoreVertical className="w-5 h-5 text-stone-600" />
              </button>

              {isAiOverflowOpen && (
                <div
                  id="ai-overflow-dropdown"
                  className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-stone-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-stone-100"
                >
                  <div className="py-1">
                    <button
                      id="ai-overflow-history-btn"
                      type="button"
                      onClick={() => {
                        setIsAiOverflowOpen(false);
                        setIsHistoryDrawerOpen(true);
                      }}
                      className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-xs text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 transition-colors text-left cursor-pointer"
                    >
                      <History className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <p className="font-semibold text-stone-800">Historia ya Mazungumzo</p>
                        <p className="text-[10px] text-stone-400">Tazama na dhibiti mazungumzo</p>
                      </div>
                    </button>
                  </div>

                  {currentConversationId && (
                    <div className="py-1">
                      <button
                        id="ai-overflow-rename-btn"
                        type="button"
                        onClick={() => {
                          setIsAiOverflowOpen(false);
                          const currentConv = conversations.find((c) => c.conversationId === currentConversationId);
                          if (currentConv) handleOpenRename(currentConv);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-xs text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 transition-colors text-left cursor-pointer"
                      >
                        <Pencil className="w-4 h-4 text-stone-500 shrink-0" />
                        <span>Badili Jina la Mazungumzo</span>
                      </button>

                      <button
                        id="ai-overflow-delete-btn"
                        type="button"
                        onClick={() => {
                          setIsAiOverflowOpen(false);
                          const currentConv = conversations.find((c) => c.conversationId === currentConversationId);
                          if (currentConv) handleDeleteConversation(currentConv);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Futa Mazungumzo Haya</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Disclaimer Header Box */}
        <div className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-1.5 flex items-center justify-between gap-2 text-amber-950 text-xs shrink-0">
          <div className="flex items-start space-x-2">
            <Stethoscope className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-tight text-[11px] sm:text-xs">
              <span className="font-bold">Kikumbusho cha Kitaalamu: </span>
              <span>
                Msaidizi hutoa miongozo na elimu ya ufugaji. Kwa utambuzi wa kitabibu au dawa za mifugo, wasiliana na Bwana Mifugo wa eneo lako.
              </span>
            </div>
          </div>
        </div>

        {/* Chat Messages Scroll Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoadingMessages ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-stone-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
              <span className="text-xs">Inapakia mazungumzo...</span>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isUser
                        ? 'bg-emerald-700 text-white'
                        : msg.id.startsWith('error-')
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {isUser ? (
                      <User className="w-4 h-4" />
                    ) : msg.id.startsWith('error-') ? (
                      <AlertCircle className="w-4 h-4 text-amber-800" />
                    ) : (
                      <Bot className="w-4 h-4 text-emerald-800" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[90%] sm:max-w-[80%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                      isUser
                        ? 'bg-emerald-700 text-white rounded-tr-none'
                        : msg.id.startsWith('error-')
                          ? 'bg-amber-50 border border-amber-200 text-amber-950 rounded-tl-none'
                          : 'bg-white border border-stone-200 text-stone-900 rounded-tl-none'
                    }`}
                  >
                    {/* Render attached image if present in message */}
                    {msg.imageAttachment && (
                      <AiMessageImageBubble
                        attachment={msg.imageAttachment}
                        isUser={isUser}
                        activeBlobUrls={activeBlobUrlsRef.current}
                      />
                    )}

                    {/* Render attached video if present in message */}
                    {msg.videoAttachment && (
                      <AiMessageVideoBubble
                        attachment={msg.videoAttachment}
                        isUser={isUser}
                        activeBlobUrls={activeBlobUrlsRef.current}
                      />
                    )}

                    {msg.text ? (
                      <AiMessageContent content={msg.text} isUser={isUser} />
                    ) : isUser && msg.imageAttachment ? (
                      <div className="text-xs text-emerald-100 flex items-center gap-1.5 font-medium mt-0.5">
                        <span className="text-sm">📷</span>
                        <span>Ukaguzi wa picha (bila maandishi ya ziada)</span>
                      </div>
                    ) : isUser && msg.videoAttachment ? (
                      <div className="text-xs text-emerald-100 flex items-center gap-1.5 font-medium mt-0.5">
                        <Film className="w-3.5 h-3.5" />
                        <span>Ukaguzi wa video (bila maandishi ya ziada)</span>
                      </div>
                    ) : null}

                    {/* Free Quota In-Bubble Action Buttons */}
                    {!isUser && (msg.text?.includes('Umefikia maswali 10 ya bure') || msg.text?.includes('FREE_QUOTA_EXHAUSTED')) && (
                      <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleWatchAdReward}
                          disabled={isWatchingAd}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isWatchingAd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          <span>Tazama Tangazo (+5 maswali)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPremiumModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Jiunge na Premium</span>
                        </button>
                      </div>
                    )}

                    {/* Controlled Marketplace Recommendations (Advisor First) */}
                    {!isUser && msg.marketplaceRecommendations && (
                      <div className="mt-3 pt-3 border-t border-stone-100">
                        <AiMarketplaceRecommendations
                          recommendations={msg.marketplaceRecommendations}
                          structuredQuery={
                            msg.structuredVisualMarketplaceQuery ||
                            msg.visualMarketplaceIntent?.structuredQuery ||
                            msg.visualMarketplaceIntent?.normalizedQuery?.structuredQuery
                          }
                          liveProducts={marketplaceProducts}
                          onOpenProduct={handleOpenProductDetail}
                          onOpenShop={handleOpenShop}
                          onNavigateMarketplace={handleNavigateMarketplace}
                          onNavigateDaktari={() => navigate('/daktari')}
                        />
                      </div>
                    )}

                    {/* Professional Livestock Doctor Action (V1.2G AI ↔ Daktari Handoff & V1.5G Daktari Loop) */}
                    {!isUser && (msg.doctorAction || msg.daktariIntelligence?.topRecommendation || msg.contextBundle?.daktariIntelligenceResult?.topRecommendation) && (
                      <AiDoctorActionCta
                        action={msg.doctorAction || {
                          type: 'FIND_DOCTOR',
                          urgency: (msg.daktariIntelligence || msg.contextBundle?.daktariIntelligenceResult)?.query?.emergency ? 'high' : 'normal',
                          specialty: (msg.daktariIntelligence || msg.contextBundle?.daktariIntelligenceResult)?.query?.specialty,
                          reason: (msg.daktariIntelligence || msg.contextBundle?.daktariIntelligenceResult)?.handoff?.explanatoryNoteSwahili || 'Ushauri wa daktari wa mifugo unasaidia uamuzi salama.',
                          autoPrompt: false
                        }}
                        daktariIntelligence={msg.daktariIntelligence || msg.contextBundle?.daktariIntelligenceResult}
                      />
                    )}

                    {/* Visual Marketplace Product Intent CTA & Clarification (V1.3A & V1.3B) */}
                    {!isUser && !msg.doctorAction && msg.visualMarketplaceIntent && (
                      <AiVisualMarketplaceCta
                        visualIntent={msg.visualMarketplaceIntent}
                        structuredQuery={msg.structuredVisualMarketplaceQuery || msg.visualMarketplaceIntent.structuredQuery || msg.visualMarketplaceIntent.normalizedQuery?.structuredQuery}
                        onClarify={(promptText) => {
                          setInput(promptText);
                        }}
                      />
                    )}

                    {/* Natural Language Historical Q&A Evidence Card (BUILD V1.4G) */}
                    {!isUser && msg.historyQuestionResult && msg.historyQuestionResult.detected && (
                      <AiHistoryQuestionProofCard
                        result={msg.historyQuestionResult}
                        onFollowUp={(chipText) => {
                          setInput(chipText);
                        }}
                      />
                    )}

                    {/* V1.5A — AI Context Orchestration & Provenance Card */}
                    {!isUser && msg.contextBundle && (
                      <AiContextOrchestrationCard bundle={msg.contextBundle} />
                    )}

                    {/* Retry action for error messages */}
                    {!isUser && msg.id.startsWith('error-') && (
                      <div className="mt-2.5 pt-2 border-t border-amber-200/80 space-y-2">
                        {lastFailedRequestRef.current?.imageState && !lastFailedRequestRef.current.imageState.file && (
                          <div className="text-[11px] text-amber-900 bg-amber-100/70 p-2 rounded-lg leading-snug">
                            Picha hii haipatikani tena kwenye kumbukumbu ya kivinjari. Tafadhali ambatisha picha tena kisha uulize.
                          </div>
                        )}
                        {lastFailedRequestRef.current?.videoState && !lastFailedRequestRef.current.videoState.file && (
                          <div className="text-[11px] text-amber-900 bg-amber-100/70 p-2 rounded-lg leading-snug">
                            Video hii haipatikani tena kwenye kumbukumbu ya kivinjari. Tafadhali ambatisha video tena kisha uulize.
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-amber-800 font-medium">Haikukamilika</span>
                          <button
                            type="button"
                            onClick={() => handleRetryLast(msg.id)}
                            disabled={
                              isLoading ||
                              isSendingRef.current ||
                              (Boolean(lastFailedRequestRef.current?.imageState) && !lastFailedRequestRef.current?.imageState?.file) ||
                              (Boolean(lastFailedRequestRef.current?.videoState) && !lastFailedRequestRef.current?.videoState?.file)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-40 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-emerald-700"
                            aria-label="Jaribu tena kutuma ombi lililofeli"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                            <span>Jaribu Tena</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div
                      className={`mt-1.5 flex items-center justify-between gap-2 text-[10px] ${
                        isUser ? 'text-emerald-200' : 'text-stone-400'
                      }`}
                    >
                      <span>{msg.timestamp}</span>
                      {!isUser && msg.personalized && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[9px]">
                          <Sparkles className="w-2.5 h-2.5" />
                          Muktadha wa Mifugo Yako
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-start space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-2xs flex items-center justify-between gap-3 text-stone-600 text-sm max-w-md">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700 shrink-0" />
                  <span>
                    {activeProcessingType === 'video'
                      ? 'Inapakia na kuchambua video kupitia AI (Gemini Video Understanding)...'
                      : activeProcessingType === 'image'
                      ? 'Msaidizi anachambua picha na swali lako...'
                      : 'Msaidizi anachakata jibu lako...'}
                  </span>
                </div>
                {activeProcessingType === 'video' && (
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 cursor-pointer shrink-0 transition-colors"
                  >
                    Sitisha
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Questions (Chips) */}
        <div className="px-4 py-2 bg-stone-100/80 border-t border-stone-200 overflow-x-auto shrink-0">
          <div className="flex items-center space-x-2 text-xs text-stone-600 mb-1">
            <Sparkles className="w-3 h-3 text-emerald-700 shrink-0" />
            <span className="font-medium">Mifano ya maswali unayoweza kuuliza:</span>
          </div>
          <div className="flex space-x-2 pb-1 overflow-x-auto no-scrollbar">
            {samplePrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                disabled={isLoading}
                className="shrink-0 bg-white hover:bg-emerald-50 text-stone-700 hover:text-emerald-900 border border-stone-200 hover:border-emerald-300 rounded-full px-3 py-1 text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input Box */}
        <div className="p-3 bg-white border-t border-stone-200 shrink-0">
          {/* Friendly Image Selection Error Notice */}
          {imageSelectError && (
            <div
              id="ai-image-selection-error"
              className="mb-2 p-2 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800 animate-in fade-in"
              role="alert"
            >
              <div className="flex items-center space-x-1.5 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="truncate">{imageSelectError}</span>
              </div>
              <button
                type="button"
                onClick={() => setImageSelectError(null)}
                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100/50 cursor-pointer"
                aria-label="Funga ujumbe wa hitilafu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Friendly Video Selection Error Notice */}
          {videoSelectError && (
            <div
              id="ai-video-selection-error"
              className="mb-2 p-2 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800 animate-in fade-in"
              role="alert"
            >
              <div className="flex items-center space-x-1.5 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="truncate">{videoSelectError}</span>
              </div>
              <button
                type="button"
                onClick={() => setVideoSelectError(null)}
                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-100/50 cursor-pointer"
                aria-label="Funga ujumbe wa hitilafu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Active Image Attachment Preview Banner */}
          {selectedImage && (
            <AiImageAttachmentPreview
              image={{
                localPreviewUrl: selectedImage.previewUrl,
                fileName: selectedImage.fileName,
                mimeType: selectedImage.mimeType,
                sizeBytes: selectedImage.sizeBytes,
                width: selectedImage.width,
                height: selectedImage.height,
              }}
              onRemove={handleRemoveImage}
              onReplace={() => fileInputRef.current?.click()}
              disabled={isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
            />
          )}

          {/* Active Video Attachment Preview Banner */}
          {selectedVideo && (
            <AiVideoAttachmentPreview
              video={{
                id: selectedVideo.id,
                fileName: selectedVideo.fileName,
                mimeType: selectedVideo.mimeType,
                fileSize: selectedVideo.fileSize,
                duration: selectedVideo.duration,
                width: selectedVideo.width,
                height: selectedVideo.height,
                localPreviewUrl: selectedVideo.previewUrl,
              }}
              onRemove={handleRemoveVideo}
              onReplace={() => videoFileInputRef.current?.click()}
              disabled={isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
            />
          )}

          {/* Free Quota Exhausted Alert Banner */}
          {isQuotaBlocked && (
            <div
              id="ai-free-quota-exhausted-banner"
              className="mb-3 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold block sm:inline">Umefikia matumizi yako ya AI: </span>
                  <span>
                    Chagua kuangalia tangazo upate maswali 5 zaidi, au jiunge na Premium kwa maswali yasiyo na kikomo.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {userQuotaInfo?.entitlementTier !== 'PREMIUM' && (
                  <button
                    type="button"
                    id="ai-watch-ad-button"
                    onClick={handleWatchAdReward}
                    disabled={isWatchingAd}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isWatchingAd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Angalia tangazo (+5)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPremiumModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Jiunge na Premium</span>
                </button>
              </div>
            </div>
          )}

          {/* Ad Reward Notification */}
          {(adRewardNotification || adRewardSuccessMessage) && (
            <div
              id="ai-ad-reward-notification"
              className={`mb-3 p-3.5 border rounded-xl text-xs flex items-center justify-between gap-2.5 ${
                (adRewardNotification?.type === 'success' || (!adRewardNotification && adRewardSuccessMessage?.includes('Umefanikiwa')))
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : (adRewardNotification?.type === 'error' || adRewardSuccessMessage?.includes('Hitilafu'))
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {(adRewardNotification?.type === 'success' || (!adRewardNotification && adRewardSuccessMessage?.includes('Umefanikiwa'))) ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                )}
                <span className="font-medium leading-relaxed">
                  {adRewardNotification?.message || adRewardSuccessMessage}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdRewardNotification(null);
                  setAdRewardSuccessMessage(null);
                }}
                className="p-1 hover:opacity-75 rounded cursor-pointer text-stone-500"
                title="Funga taarifa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <form
            id="ai-composer-form"
            role="form"
            aria-label="Fomu ya kutuma swali, picha au video kwa Msaidizi"
            aria-busy={isLoading || isSendingRef.current}
            onSubmit={(e) => {
              e.preventDefault();
              if (!isQuotaBlocked && !isLoading && !isSendingRef.current && (input.trim() || selectedImage || selectedVideo)) {
                handleSend();
              }
            }}
            className="flex items-end space-x-2 relative"
          >
            {/* Hidden image input for camera & gallery selection with allowed MIME types */}
            <input
              ref={fileInputRef}
              id="ai-image-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageFileSelect}
              disabled={isQuotaBlocked || isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
            />

            {/* Hidden video input for camera & gallery selection with allowed MIME types */}
            <input
              ref={videoFileInputRef}
              id="ai-video-file-input"
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/3gpp"
              className="hidden"
              onChange={handleVideoFileSelect}
              disabled={isQuotaBlocked || isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
            />

            {/* Unified Media (Image & Video) Attachment Dropdown */}
            <div className="relative shrink-0" ref={mediaMenuRef}>
              <button
                id="ai-attach-media-btn"
                type="button"
                onClick={() => {
                  if (isQuotaBlocked || isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo) return;
                  setIsMediaMenuOpen((prev) => !prev);
                }}
                disabled={isQuotaBlocked || isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-center shrink-0 w-11 h-11 focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                  selectedImage || selectedVideo
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 shadow-2xs'
                    : isQuotaBlocked
                    ? 'bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed opacity-50'
                    : isMediaMenuOpen
                    ? 'bg-stone-200 text-stone-900 border-stone-400'
                    : 'bg-stone-50 text-stone-600 border-stone-300 hover:bg-stone-100 hover:text-stone-900'
                }`}
                title={
                  isQuotaBlocked
                    ? 'Umefikia ukomo wa maswali ya bure'
                    : isValidatingImage
                    ? 'Inahakiki picha...'
                    : isValidatingVideo
                    ? 'Inahakiki video...'
                    : selectedImage
                    ? 'Picha imechaguliwa (Bofya kubadili)'
                    : selectedVideo
                    ? 'Video imechaguliwa (Bofya kubadili)'
                    : 'Ambatisha Picha au Video'
                }
                aria-label="Ambatisha Picha au Video kwa ajili ya Msaidizi"
                aria-haspopup="true"
                aria-expanded={isMediaMenuOpen}
              >
                {isValidatingImage || isValidatingVideo ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                ) : selectedImage ? (
                  <ImageIcon className="w-5 h-5 text-emerald-700" />
                ) : selectedVideo ? (
                  <Video className="w-5 h-5 text-emerald-700" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>

              {/* Media Options Popover Menu */}
              {isMediaMenuOpen && (
                <div
                  className="absolute bottom-13 left-0 bg-white border border-stone-200 rounded-2xl shadow-xl p-2 min-w-[240px] z-50 flex flex-col space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  role="menu"
                  aria-label="Chaguzi za kuambatisha faili"
                >
                  <div className="px-2.5 py-1 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                    Ambatisha Faili
                  </div>

                  {/* Option 1: Image */}
                  <button
                    id="ai-attach-image-btn"
                    type="button"
                    onClick={() => {
                      setIsMediaMenuOpen(false);
                      setImageSelectError(null);
                      fileInputRef.current?.click();
                    }}
                    disabled={Boolean(selectedVideo)}
                    className={`flex items-center space-x-3 w-full p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      selectedImage
                        ? 'bg-emerald-50 text-emerald-800'
                        : selectedVideo
                        ? 'opacity-40 cursor-not-allowed text-stone-400'
                        : 'hover:bg-emerald-50 text-stone-800 hover:text-emerald-900'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-stone-900">Picha (Image)</div>
                      <div className="text-[10px] text-stone-500 truncate">JPEG, PNG, WEBP (hadi 10MB)</div>
                    </div>
                  </button>

                  {/* Option 2: Video */}
                  <button
                    id="ai-attach-video-btn"
                    type="button"
                    onClick={() => {
                      setIsMediaMenuOpen(false);
                      setVideoSelectError(null);
                      videoFileInputRef.current?.click();
                    }}
                    disabled={Boolean(selectedImage)}
                    className={`flex items-center space-x-3 w-full p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      selectedVideo
                        ? 'bg-teal-50 text-teal-800'
                        : selectedImage
                        ? 'opacity-40 cursor-not-allowed text-stone-400'
                        : 'hover:bg-teal-50 text-stone-800 hover:text-teal-900'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                      <Video className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-stone-900">Video</div>
                      <div className="text-[10px] text-stone-500 truncate">MP4, WEBM, MOV, 3GP (hadi 30MB)</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Textarea Input - Expands downward up to at least 6 lines with multi-paragraph support */}
            <textarea
              ref={textareaRef}
              id="ai-assistant-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // If Shift, Alt, or Ctrl is pressed: allow newline for new paragraph
                  if (e.shiftKey || e.altKey || e.ctrlKey) {
                    return;
                  }
                  // On mobile touch devices without physical keyboard: allow Return key to break line
                  const isTouchMobile = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth < 768;
                  if (isTouchMobile) {
                    return;
                  }
                  // On desktop: plain Enter sends message
                  e.preventDefault();
                  if (!isQuotaBlocked && !isLoading && !isSendingRef.current && (input.trim() || selectedImage || selectedVideo)) {
                    handleSend();
                  }
                }
              }}
              placeholder={
                isQuotaBlocked
                  ? 'Umefikia maswali 10 ya bure ya AI. Tazama tangazo au jiunge na Premium...'
                  : selectedImage
                  ? 'Ongeza maelezo ya picha (si lazima)...'
                  : selectedVideo
                  ? 'Ongeza maelezo ya video (si lazima)...'
                  : 'Andika swali lako la kilimo au ufugaji hapa (Shift+Enter kuanza aya mpya)...'
              }
              disabled={isQuotaBlocked || isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
              className="flex-1 bg-stone-50 border border-stone-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white transition-all disabled:opacity-50 text-stone-900 min-h-[44px] max-h-[160px] resize-none leading-relaxed"
            />

            {/* Send Button with Double-Send & Quota Protection */}
            <button
              id="ai-assistant-send-btn"
              type="submit"
              disabled={isQuotaBlocked || (!input.trim() && !selectedImage && !selectedVideo) || isLoading || isSendingRef.current || isValidatingImage || isValidatingVideo}
              className="bg-emerald-700 hover:bg-emerald-800 text-white p-2.5 rounded-xl disabled:opacity-40 disabled:hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer flex items-center justify-center shrink-0 w-11 h-11 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              title={isQuotaBlocked ? 'Umefikia ukomo wa maswali ya bure' : isLoading || isSendingRef.current ? 'Msaidizi anachakata...' : 'Tuma Ujumbe'}
              aria-label={isQuotaBlocked ? 'Umefikia ukomo wa maswali ya bure' : isLoading || isSendingRef.current ? 'Msaidizi anachakata...' : 'Tuma Ujumbe'}
            >
              {isLoading || isSendingRef.current ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Mobile / Tablet History Drawer Overlay */}
      {isHistoryDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsHistoryDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-xs sm:max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-emerald-700" />
                <h2 className="font-bold text-stone-900 text-sm">Historia ya Mazungumzo</h2>
              </div>
              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200 transition-colors cursor-pointer"
                title="Funga"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* New Chat Button inside Drawer */}
            <div className="p-3 border-b border-stone-100 bg-emerald-50/50">
              <button
                onClick={handleStartNewConversation}
                className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs shadow-2xs transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Mazungumzo Mapya</span>
              </button>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {isLoadingConversations ? (
                <div className="flex flex-col items-center justify-center h-40 space-y-2 text-stone-400">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                  <span className="text-xs">Inapakia historia...</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-center p-4 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                    <MessageSquareOff className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">Hujawa na mazungumzo bado.</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Uliza swali lolote la kilimo au ufugaji kuanzisha historia yako.
                    </p>
                  </div>
                  <button
                    onClick={handleStartNewConversation}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    Anza Mazungumzo
                  </button>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isSelected = conv.conversationId === currentConversationId;
                  const dateDisplay = formatSwahiliDate(conv.updatedAt || conv.createdAt);

                  return (
                    <div
                      key={conv.conversationId}
                      className={`group relative rounded-xl border p-3 transition-all cursor-pointer flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-400 shadow-2xs'
                          : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                      }`}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                        <MessageSquare
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isSelected ? 'text-emerald-700' : 'text-stone-400 group-hover:text-stone-600'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <h3
                            className={`text-xs font-bold truncate ${
                              isSelected ? 'text-emerald-950' : 'text-stone-900'
                            }`}
                          >
                            {conv.title}
                          </h3>
                          <div className="flex items-center space-x-2 mt-1 text-[10px] text-stone-500">
                            <span>{dateDisplay}</span>
                            {conv.messageCount > 0 && (
                              <span className="bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-medium">
                                {conv.messageCount} ujumbe
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRename(conv);
                          }}
                          className="p-1 rounded text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="Badili Jina"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conv);
                          }}
                          className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Futa Mazungumzo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rename Conversation Modal */}
      {renameModalState.isOpen && renameModalState.conversation && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-emerald-700">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Pencil className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Badili Jina la Mazungumzo</h3>
                <p className="text-xs text-stone-500">Weka jina jipya la kumbukumbu</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveRename();
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Jina la Mazungumzo
                </label>
                <input
                  type="text"
                  value={renameModalState.newTitle}
                  onChange={(e) =>
                    setRenameModalState((prev) => ({ ...prev, newTitle: e.target.value }))
                  }
                  maxLength={60}
                  autoFocus
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white"
                  placeholder="Mfano: Chanjo ya Gumboro Kuku"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  disabled={renameModalState.isSaving}
                  onClick={() =>
                    setRenameModalState({
                      isOpen: false,
                      conversation: null,
                      newTitle: '',
                      isSaving: false,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Ghairi
                </button>
                <button
                  type="submit"
                  disabled={renameModalState.isSaving || !renameModalState.newTitle.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {renameModalState.isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Hifadhi Jina</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalState.isOpen && deleteModalState.conversation && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Futa Mazungumzo</h3>
                <p className="text-xs text-stone-500">Uthibitisho wa kufuta</p>
              </div>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed">
              Una uhakika unataka kufuta mazungumzo ya{' '}
              <span className="font-bold text-stone-900">"{deleteModalState.conversation.title}"</span>?
              <br />
              <span className="text-stone-500 mt-1 block">
                Hatua hii haitafuta rekodi wala matukio ya mifugo yako.
              </span>
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={deleteModalState.isDeleting}
                onClick={() => setDeleteModalState({ isOpen: false, conversation: null, isDeleting: false })}
                className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="button"
                disabled={deleteModalState.isDeleting}
                onClick={confirmDeleteConversation}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                {deleteModalState.isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ndio, Futa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal from Marketplace Recommendation */}
      {selectedModalProduct && (
        <ProductDetailModal
          product={selectedModalProduct}
          onClose={() => setSelectedModalProduct(null)}
          onOpenShop={(sellerId) => {
            setSelectedModalProduct(null);
            const shop = publishedShops.find((s) => s.sellerId === sellerId);
            if (shop) {
              navigate(`/market?shop=${shop.shopId}`);
            } else {
              navigate(`/market?seller=${sellerId}`);
            }
          }}
          onOpenShopCatalogue={(sellerId, catId, prodId) => {
            setSelectedModalProduct(null);
            const shop = publishedShops.find((s) => s.sellerId === sellerId);
            if (shop) {
              navigate(`/market?shop=${shop.shopId}${catId ? `&catalogue=${catId}` : ''}${prodId ? `&product=${prodId}` : ''}`);
            } else {
              navigate(`/market?product=${prodId}`);
            }
          }}
        />
      )}

      {/* Premium Subscription Information & Plan Selection Modal */}
      {showPremiumModal && (
        <div
          id="ai-premium-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-stone-200 my-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Ufugaji Smart AI Premium</h3>
                  <p className="text-xs text-stone-500">Kifurushi cha Kitaalamu na Maswali ya Kina</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPremiumModal(false);
                  setSelectedPlanIntent(null);
                  setPlanSelectionError(null);
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                title="Funga"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Identity Context & Verification Status */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600">
              <div className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span className="truncate">
                  {currentUser?.email ? (
                    <>Akaunti: <strong className="text-stone-900">{currentUser.email}</strong></>
                  ) : userProfile?.displayName ? (
                    <>Mtumiaji: <strong className="text-stone-900">{userProfile.displayName}</strong></>
                  ) : (
                    <>Kifaa cha Mtumiaji: <span className="font-mono text-[10px] text-stone-500">{effectiveUserId}</span></>
                  )}
                </span>
              </div>
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                {currentUser ? 'Akaunti Imethibitishwa' : 'Kifaa Kimeunganishwa'}
              </span>
            </div>

            {/* If user already has an active premium entitlement */}
            {userPremiumDetails?.isPremiumActive && (
              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-300 text-xs text-emerald-950 space-y-1">
                <div className="flex items-center justify-between font-bold text-emerald-900">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Kifurushi Chako Kipo Hai: {userPremiumDetails.packageType}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 text-[10px] uppercase tracking-wider">
                    {userPremiumDetails.status}
                  </span>
                </div>
                <p className="text-emerald-800">
                  Ukomo wa kila siku: <strong>maswali {userPremiumDetails.dailyLimit}</strong> | Picha na Video: <strong>Zinaruhusiwa</strong>
                </p>
                {userPremiumDetails.expiresAt && (
                  <p className="text-emerald-700 text-[11px]">
                    Kinaisha: {new Date(userPremiumDetails.expiresAt).toLocaleDateString('sw-TZ')} ({userPremiumDetails.daysRemaining ?? 0} siku zilizobaki)
                  </p>
                )}
              </div>
            )}

            {/* Selected Plan Intent Feedback */}
            {selectedPlanIntent && (
              <div className="p-3.5 bg-sky-50 rounded-xl border border-sky-300 text-xs text-sky-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sky-900">
                  <Clock className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>Ombi la Kifurushi Limepokelewa (PENDING)</span>
                </div>
                <p className="leading-relaxed">
                  {selectedPlanIntent.message || 'Ombi la kifurushi limepokelewa. Malipo yanahitajika kukamilisha uanzishaji.'}
                </p>
                <div className="p-2 rounded-lg bg-sky-100/60 font-mono text-[11px] text-sky-900 flex justify-between">
                  <span>Kumbukumbu ya Ombi:</span>
                  <span className="font-bold">{selectedPlanIntent.intent?.intentId}</span>
                </div>
                <p className="text-[11px] text-sky-800 italic">
                  Kumbuka: Kuchagua kifurushi hakianzishi Premium moja kwa moja hadi uthibitisho wa malipo utakapopokelewa.
                </p>
              </div>
            )}

            {planSelectionError && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800">
                {planSelectionError}
              </div>
            )}

            {/* Available Governed Plans */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-stone-800">Chagua Kifurushi Kinachokufaa:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(availablePlans.length > 0 ? availablePlans : [
                  { id: 'ai_plan_weekly', planType: 'WEEKLY' as const, nameSwahili: 'Wiki Moja', priceAmount: 3000, currency: 'TZS', durationDays: 7, dailyQueryLimit: 50 },
                  { id: 'ai_plan_monthly', planType: 'MONTHLY' as const, nameSwahili: 'Mwezi Mmoja', priceAmount: 10000, currency: 'TZS', durationDays: 30, dailyQueryLimit: 50 },
                  { id: 'ai_plan_annual', planType: 'ANNUAL' as const, nameSwahili: 'Mwaka Mmoja', priceAmount: 90000, currency: 'TZS', durationDays: 365, dailyQueryLimit: 50 }
                ]).map((plan) => {
                  const planKey = plan.planId || plan.id || plan.planType;
                  const planTitle = plan.nameSwahili || plan.displayName || plan.name || (plan.planType === 'WEEKLY' ? 'Wiki Moja' : plan.planType === 'MONTHLY' ? 'Mwezi Mmoja' : 'Mwaka Mmoja');
                  const price = Number(plan.priceAmount ?? plan.indicativePrice ?? (plan.planType === 'WEEKLY' ? 3000 : plan.planType === 'MONTHLY' ? 10000 : 90000));
                  const duration = plan.durationDays ?? (plan.planType === 'WEEKLY' ? 7 : plan.planType === 'MONTHLY' ? 30 : 365);
                  const dailyLimit = plan.dailyQueryLimit ?? plan.dailyAiLimit ?? 50;

                  return (
                    <div
                      key={planKey}
                      className="p-3 rounded-xl border border-stone-200 hover:border-amber-400 bg-stone-50/50 flex flex-col justify-between text-xs space-y-2 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-900">{planTitle}</span>
                          {plan.planType === 'MONTHLY' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Maarufu
                            </span>
                          )}
                        </div>
                        <p className="text-base font-extrabold text-stone-900 mt-1">
                          TSh {price.toLocaleString('sw-TZ')}
                        </p>
                        <p className="text-[10px] text-stone-500">
                          Siku {duration} | Maswali {dailyLimit}/siku
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={planSelectionLoading}
                        onClick={() => handleSelectPlan(plan.planType)}
                        className="w-full py-1.5 px-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {planSelectionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        <span>Chagua Kifurushi</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 py-1 text-xs text-stone-700">
              <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                <span>Maswali 50 kwa siku na utambuzi wa kina wa magonjwa ya mifugo</span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                <span>Uchambuzi kamili wa picha na video za mifugo bila vizuizi</span>
              </div>
            </div>

            {/* PlusPesa Real-Time Mobile Payment Initiation & Status Tracking */}
            {paymentSuccess ? (
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-300 text-xs text-emerald-950 space-y-2.5 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>Hongera! Malipo Yamethibitishwa na Premium Imewashwa!</span>
                </div>
                <p className="text-emerald-800 leading-relaxed text-[11px]">
                  Kifurushi chako cha <strong>{selectedPlanForPayment?.nameSwahili || selectedPlanForPayment?.planType}</strong> sasa kipo hai. Unaweza kuuliza maswali 50 ya AI kila siku na kupakia picha au video za mifugo.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPremiumModal(false);
                      setPaymentSuccess(false);
                      setPaymentTransaction(null);
                      setSelectedPlanForPayment(null);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer text-center"
                  >
                    Anza Kutumia AI Premium
                  </button>
                </div>
              </div>
            ) : paymentTransaction && (paymentTransaction.status === 'PROCESSING' || paymentTransaction.status === 'PENDING') ? (
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 text-xs text-blue-950 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-blue-900">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                    </span>
                    <span>Ombi la Malipo Limetumwa kwenye Simu</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-200 text-blue-800 font-bold text-[10px] uppercase">
                    {paymentTransaction.status}
                  </span>
                </div>

                <div className="p-3 bg-white/80 rounded-xl border border-blue-100 space-y-1.5 text-[11px]">
                  <p className="font-semibold text-stone-900">
                    Tafadhali kamilisha malipo kwenye simu yako:
                  </p>
                  <p className="text-stone-700 leading-relaxed">
                    1. Angalia ujumbe wa mtandao wako ({paymentTransaction.customerPhone || paymentPhone}).<br />
                    2. Weka namba yako ya siri (PIN) ya <strong>M-Pesa / Tigo Pesa / Airtel Money</strong> kuthibitisha malipo ya <strong>TSh {Number(paymentTransaction.amount).toLocaleString()}</strong>.
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-stone-500 font-mono">
                    <span>Kumbukumbu ya Muamala:</span>
                    <span className="font-bold text-stone-800">{paymentTransaction.providerTransactionReference || paymentTransaction.externalId || paymentTransaction.paymentId}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-blue-800">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Inasubiri uthibitisho wa mtandao...</span>
                  </div>
                  <button
                    type="button"
                    disabled={paymentPolling}
                    onClick={() => handlePollPaymentStatus(paymentTransaction.paymentId)}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {paymentPolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    <span>Hakiki Sasa</span>
                  </button>
                </div>
              </div>
            ) : paymentTransaction && paymentTransaction.status === 'FAILED' ? (
              <div className="p-3.5 bg-red-50 rounded-2xl border border-red-200 text-xs text-red-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-900">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>Malipo Hayakukamilika</span>
                </div>
                <p className="text-[11px] text-red-800">
                  Ombi la malipo halikukamilishwa au mtandao ulikatisha muamala. Tafadhali hakikisha salio linatosha na ujaribu tena.
                </p>
                <button
                  type="button"
                  onClick={() => setPaymentTransaction(null)}
                  className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold text-[11px] cursor-pointer"
                >
                  Jaribu Tena
                </button>
              </div>
            ) : selectedPlanForPayment ? (
              <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-300 text-xs text-amber-950 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Kifurushi Kilichochaguliwa</span>
                    <span className="font-bold text-stone-900 text-sm">{selectedPlanForPayment.nameSwahili || selectedPlanForPayment.planType}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-extrabold text-stone-900">
                      TSh {Number(selectedPlanForPayment.priceAmount ?? (selectedPlanForPayment.planType === 'WEEKLY' ? 3000 : selectedPlanForPayment.planType === 'MONTHLY' ? 10000 : 90000)).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-stone-500 block">Siku {selectedPlanForPayment.durationDays ?? (selectedPlanForPayment.planType === 'WEEKLY' ? 7 : selectedPlanForPayment.planType === 'MONTHLY' ? 30 : 365)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pluspesa-farmer-phone" className="block text-[11px] font-bold text-stone-800">
                    Namba ya Simu ya Malipo (M-Pesa / Tigo Pesa / Airtel Money / Halopesa):
                  </label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                    <input
                      id="pluspesa-farmer-phone"
                      type="tel"
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value)}
                      placeholder="Mfano: 0754123456 au 0681234567"
                      className="w-full pl-9 pr-24 py-2 text-xs rounded-xl border border-stone-300 focus:border-amber-500 focus:outline-hidden bg-white"
                    />
                    {detectedCarrier && (
                      <span className={`absolute right-2 top-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${detectedCarrier.badgeClass}`}>
                        {detectedCarrier.name}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-500">
                    Ombi la malipo (push notification) litatumwa moja kwa moja kwenye simu hii kupitia PlusPesa Collections.
                  </p>

                  <div className="pt-1 space-y-1">
                    <span className="text-[10px] font-semibold text-stone-600 block">Mtandao wa Malipo:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'Mpesa', label: 'Vodacom M-Pesa' },
                        { id: 'Tigo', label: 'Tigo Pesa' },
                        { id: 'Airtel', label: 'Airtel Money' },
                        { id: 'Halopesa', label: 'Halopesa' },
                        { id: 'Azampesa', label: 'AzamPesa' }
                      ].map((net) => {
                        const isChosen = (selectedNetwork === net.id) || (!selectedNetwork && detectedCarrier?.suggestedProvider === net.id);
                        return (
                          <button
                            key={net.id}
                            type="button"
                            onClick={() => setSelectedNetwork(net.id)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                              isChosen
                                ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {net.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={paymentLoading || !paymentPhone.trim()}
                  onClick={handleInitiatePlusPesaPayment}
                  className="w-full py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {paymentLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Inatuma ombi la malipo...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 text-amber-400" />
                      <span>Thibitisha na Lipa Kupitia Simu</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 leading-relaxed">
                <p className="font-bold text-amber-900 mb-1">Malipo ya Moja kwa Moja ya Simu:</p>
                <p>
                  Chagua kifurushi hapo juu ili kuingiza namba yako ya simu (M-Pesa, Tigo Pesa, Airtel Money, Halopesa) na kutuma ombi la malipo papo hapo kupitia mfumo rasmi wa PlusPesa.
                </p>
              </div>
            )}

            {(userProfile?.role === 'admin' || currentUser?.email === 'mkomwasaid53@gmail.com') && (
              <div className="p-3 bg-stone-900 text-stone-200 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border border-amber-500/40">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold">Mamlaka ya Msimamizi Mkuu (Said Mkomwa)</span>
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <Link
                    to="/admin?tab=readiness"
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] shrink-0 transition-colors"
                  >
                    Dashibodi ya Utayari (Readiness) &rarr;
                  </Link>
                  <Link
                    to="/admin"
                    className="px-2 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-[11px] shrink-0 transition-colors"
                  >
                    Admin &rarr;
                  </Link>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
              {userQuotaInfo?.entitlementTier !== 'PREMIUM' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPremiumModal(false);
                    handleWatchAdReward();
                  }}
                  disabled={isWatchingAd}
                  className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isWatchingAd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Tazama Tangazo (+5 maswali)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowPremiumModal(false);
                  setSelectedPlanIntent(null);
                  setPlanSelectionError(null);
                }}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Funga
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V1.9F-Corrective-2 — Real Rewarded Ad Presentation Modal */}
      <AiRewardedAdPlayerModal
        isOpen={isAdModalOpen}
        lifecycleState={adLifecycleState}
        providerName={activeAdSession?.adProvider || 'GOOGLE_AD_MANAGER_WEB'}
        mode={activeAdSession?.mode || 'TEST'}
        platform={activeAdSession?.platform || 'WEB'}
        adUnitId={activeAdSession?.adUnitId}
        diagnostic={activeAdSession?.diagnostic}
        errorMessage={adModalError}
        onAdCompleted={handleAdCompleted}
        onAdDismissed={handleAdDismissed}
        onClose={handleCloseAdModal}
      />
    </div>
  );
};
