/**
 * UFUGAJI UPDATE — V1.5G Daktari Mtaani Kwako Loop Integration Service
 * 
 * Implements the official professional-assistance module integration:
 * AI ↔ My Assistant ↔ Marketplace ecosystem
 * 
 * CORE RULES:
 * 1. AI/My Assistant guides the farmer to professional help; they are NOT the professional assessor.
 * 2. Registration ≠ Verification.
 * 3. Consultation/private medical data MUST NOT automatically flow back into AI context.
 * 4. Fake Doctor Protection: AI must never invent doctor names, qualifications, phone numbers, or locations.
 * 5. Deterministic ranking: AI model does not rank doctors; algorithm determines order.
 * 6. Explicit Contact Gate: AI must not automatically call or message the professional.
 * 7. Signal ≠ Diagnosis: Observations/mortality in My Assistant are signals, not disease diagnoses.
 */

import {
  DaktariSearchIntent,
  AuthoritativeDoctorVerificationStatus,
  DaktariQuery,
  DaktariContextProfile,
  DaktariHandoff,
  DaktariAIIntelligenceResult,
  DaktariSearchResult
} from '../types/aiDaktariLoop';
import { TANZANIA_REGIONS } from '../data/veterinarians';
import { daktariService } from './daktariService';
import { ProfessionalProfile } from '../types/daktari';

// Known livestock keywords mapped to normalized groups
const LIVESTOCK_KEYWORDS: Record<string, string> = {
  kuku: 'Kuku na Ndege',
  poultry: 'Kuku na Ndege',
  broiler: 'Kuku na Ndege',
  layers: 'Kuku na Ndege',
  kienyeji: 'Kuku na Ndege',
  ndege: 'Kuku na Ndege',
  bata: 'Kuku na Ndege',
  kanga: 'Kuku na Ndege',
  "ng'ombe": "Ng'ombe",
  ngombe: "Ng'ombe",
  cattle: "Ng'ombe",
  cow: "Ng'ombe",
  dume: "Ng'ombe",
  ndama: "Ng'ombe",
  maziwa: "Ng'ombe wa Maziwa",
  mbuzi: 'Mbuzi',
  goat: 'Mbuzi',
  kondoo: 'Mbuzi na Kondoo',
  sheep: 'Mbuzi na Kondoo',
  nguruwe: 'Nguruwe',
  pig: 'Nguruwe',
  pigs: 'Nguruwe',
  sungura: 'Sungura',
  rabbit: 'Sungura',
  samaki: 'Samaki',
  fish: 'Samaki',
  nyuki: 'Nyuki',
  bee: 'Nyuki'
};

const EMERGENCY_PATTERNS = [
  /\b(dharura|emergency|anakufa|wanakufa|mahututi|kifo|kufariki|kutokwa\s+na\s+damu)\b/i,
  /\b(amevimba\s+tumbo\s+ghafla|hawezi\s+kupumua|kukosa\s+hewa|hawezi\s+kuzaa|dystocia)\b/i,
  /\b(amevunjika|sumu|amelishwa\s+sumu|amekula\s+sumu|kichaa\s+cha\s+mbwa|rabies)\b/i,
  /\b(anahangaika\s+sana|anaugua\s+sana|hali\s+mbaya|critical\s+condition)\b/i
];

const EXPLICIT_DOCTOR_PATTERNS = [
  /\b(daktari|dakatri|vet|veterinarian|bwana\s+mifugo|afisa\s+mifugo|tabibu|daktari\s+wa\s+mifugo)\b/i,
  /\b(hospitali\s+ya\s+mifugo|kliniki\s+ya\s+mifugo|huduma\s+za\s+mifugo)\b/i,
  /\b(nitafutie\s+daktari|nahitaji\s+daktari|wapi\s+napata\s+daktari|daktari\s+mtaani)\b/i
];

const SPECIALTY_KEYWORDS: Record<string, string> = {
  'uzazi': 'Uzazi & A.I.',
  'a.i.': 'Uzazi & A.I.',
  'artificial insemination': 'Uzazi & A.I.',
  'mimba': 'Uzazi & A.I.',
  'upasuaji': 'Upasuaji & Chanjo',
  'surgery': 'Upasuaji & Chanjo',
  'chanjo': 'Chanjo & Kinga',
  'vaccine': 'Chanjo & Kinga',
  'kinga': 'Chanjo & Kinga',
  'lishe': 'Lishe Bora ya Mifugo',
  'nutrition': 'Lishe Bora ya Mifugo',
  'chakula': 'Lishe Bora ya Mifugo',
  'magonjwa': 'Tiba ya Magonjwa',
  'mastitis': 'Tiba ya Magonjwa'
};

/**
 * 1. Detect Daktari Search Intent from natural language and context
 */
export function detectDaktariSearchIntent(
  question: string,
  context?: { hasEmergency?: boolean; isExplicitDoctorSearch?: boolean }
): DaktariSearchIntent {
  const q = question.toLowerCase();

  // Check if question asks about non-doctor topic (e.g. buying feeds or selling eggs)
  const isDoctorRelated =
    EXPLICIT_DOCTOR_PATTERNS.some((p) => p.test(q)) ||
    Boolean(context?.isExplicitDoctorSearch);

  const isEmergency =
    EMERGENCY_PATTERNS.some((p) => p.test(q)) || Boolean(context?.hasEmergency);

  // If user asks about emergency
  if (isEmergency && isDoctorRelated) {
    return 'DAKTARI_EMERGENCY';
  }

  if (!isDoctorRelated && !isEmergency) {
    return 'NO_DAKTARI_INTENT';
  }

  // Check verified only intent
  if (/\b(aliyehakikiwa|verified|mwenye\s+cheti|walioidhinishwa|halali)\b/i.test(q)) {
    return 'DAKTARI_VERIFIED_ONLY';
  }

  // Check nearby intent
  if (/\b(karibu|eneo\s+langu|mtaani\s+kwangu|hapa\s+nilipo|jirani|wilaya\s+yangu)\b/i.test(q)) {
    return 'DAKTARI_NEARBY';
  }

  // Check location intent
  for (const region of TANZANIA_REGIONS) {
    if (region !== 'Zote (Tanzania Nzima)' && q.includes(region.toLowerCase())) {
      return 'DAKTARI_BY_LOCATION';
    }
  }

  // Check specialty intent
  for (const specKey of Object.keys(SPECIALTY_KEYWORDS)) {
    if (q.includes(specKey)) {
      return 'DAKTARI_BY_SPECIALTY';
    }
  }

  // Check livestock intent
  for (const liveKey of Object.keys(LIVESTOCK_KEYWORDS)) {
    if (q.includes(liveKey)) {
      return 'DAKTARI_BY_LIVESTOCK';
    }
  }

  // Check specific doctor profile lookup (e.g. "Dkt. Baraka yupo?")
  if (/\b(dkt\.|dokta|daktari)\s+[a-z]+/i.test(q)) {
    return 'DAKTARI_PROFILE';
  }

  if (isDoctorRelated) {
    return 'DAKTARI_SEARCH';
  }

  if (isEmergency) {
    return 'DAKTARI_EMERGENCY';
  }

  return 'AMBIGUOUS_DAKTARI_REQUEST';
}

/**
 * 2. Build Structured Daktari Query
 * Strictly extracts only what the user supplied or trusted context verifies.
 * Never invents location or constraints.
 */
export function buildDaktariQuery(
  question: string,
  context?: {
    farmerLocation?: string;
    farmerPrimaryLivestock?: string;
    hasEmergency?: boolean;
    forceVerifiedOnly?: boolean;
  }
): DaktariQuery {
  const q = question.toLowerCase();
  const intent = detectDaktariSearchIntent(question, {
    hasEmergency: context?.hasEmergency
  });

  let livestockType: string | undefined;
  for (const [key, val] of Object.entries(LIVESTOCK_KEYWORDS)) {
    if (q.includes(key)) {
      livestockType = val;
      break;
    }
  }
  if (!livestockType && context?.farmerPrimaryLivestock) {
    const primary = context.farmerPrimaryLivestock.toLowerCase();
    for (const [key, val] of Object.entries(LIVESTOCK_KEYWORDS)) {
      if (primary.includes(key)) {
        livestockType = val;
        break;
      }
    }
  }

  // Extract region safely
  let region: string | undefined;
  for (const reg of TANZANIA_REGIONS) {
    if (reg !== 'Zote (Tanzania Nzima)' && q.includes(reg.toLowerCase())) {
      region = reg;
      break;
    }
  }
  if (!region && context?.farmerLocation) {
    const loc = context.farmerLocation.trim();
    for (const reg of TANZANIA_REGIONS) {
      if (reg !== 'Zote (Tanzania Nzima)' && loc.toLowerCase().includes(reg.toLowerCase())) {
        region = reg;
        break;
      }
    }
  }

  // Extract specialty
  let specialty: string | undefined;
  for (const [key, val] of Object.entries(SPECIALTY_KEYWORDS)) {
    if (q.includes(key)) {
      specialty = val;
      break;
    }
  }

  // Check emergency
  const isEmergency =
    intent === 'DAKTARI_EMERGENCY' ||
    EMERGENCY_PATTERNS.some((p) => p.test(q)) ||
    Boolean(context?.hasEmergency);

  // Check nearby
  const isNearby =
    intent === 'DAKTARI_NEARBY' ||
    /\b(karibu|eneo\s+langu|mtaani\s+kwangu|jirani)\b/i.test(q);

  // Check verification preference
  const verificationPreference =
    intent === 'DAKTARI_VERIFIED_ONLY' ||
    Boolean(context?.forceVerifiedOnly) ||
    /\b(aliyehakikiwa|verified|halali)\b/i.test(q);

  // Specific doctor name lookup if present
  let specificDoctorName: string | undefined;
  const docMatch = q.match(/\b(?:dkt\.|dokta|daktari)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (docMatch && docMatch[1]) {
    const candidate = docMatch[1].trim();
    if (!['wa', 'ya', 'za', 'mifugo', 'kuku', 'ngombe'].includes(candidate.toLowerCase())) {
      specificDoctorName = candidate;
    }
  }

  return {
    intent,
    livestockType,
    specialty,
    region,
    nearby: isNearby,
    emergency: isEmergency,
    verificationPreference,
    specificDoctorName
  };
}

/**
 * Maps any profile verification status to the authoritative status enum.
 * STRICT RULE: Registration ≠ Verification.
 */
export function getDaktariVerificationStatus(profile: any): AuthoritativeDoctorVerificationStatus {
  if (!profile) return 'UNAVAILABLE';

  if (profile.registrationStatus === 'suspended' || profile.status === 'suspended') {
    return 'SUSPENDED';
  }

  if (profile.verificationStatus === 'rejected') {
    return 'REJECTED';
  }

  // Authoritative verified check
  if (
    profile.verificationStatus === 'verified' ||
    profile.isVerified === true ||
    profile.verified === true
  ) {
    return 'VERIFIED';
  }

  if (
    profile.verificationStatus === 'pending' ||
    profile.verificationStatus === 'submitted' ||
    profile.verificationStatus === 'in_review'
  ) {
    return 'PENDING_VERIFICATION';
  }

  // Default to registered (unverified)
  return 'REGISTERED';
}

/**
 * Convert raw Firestore ProfessionalProfile or initial seed Veterinarian to DaktariContextProfile
 */
export function normalizeToDaktariContextProfile(raw: any): DaktariContextProfile {
  if (!raw || typeof raw !== 'object') {
    return {
      profileId: 'unknown-vet',
      fullName: 'Mtaalamu wa Mifugo',
      professionalTitle: 'Daktari wa Mifugo',
      professionalType: 'Veterinary Surgeon',
      specialty: 'Afya ya Mifugo',
      livestockTypes: [],
      services: ['Ushauri wa Kitaalamu', 'Uchunguzi Shambani'],
      region: 'Tanzania',
      district: '',
      area: '',
      verificationStatus: 'REGISTERED',
      availability: 'busy',
      emergencyAvailability: false,
      profileCompleteness: 0,
      isStaleAvailability: false
    };
  }

  const verificationStatus = getDaktariVerificationStatus(raw);

  // Compute profile completeness
  let score = 30;
  if (raw.fullName || raw.name) score += 15;
  if (raw.phone) score += 15;
  if (raw.region) score += 10;
  if (raw.district) score += 10;
  if (raw.bio) score += 10;
  if (raw.specialties?.length || raw.livestockSpecialties?.length || raw.livestockTypes?.length) score += 10;

  const livestockTypes: string[] = Array.isArray(raw.livestockTypes)
    ? raw.livestockTypes
    : Array.isArray(raw.livestockSpecialties)
    ? raw.livestockSpecialties
    : Array.isArray(raw.specialties)
    ? raw.specialties
    : Array.isArray(raw.specialization)
    ? raw.specialization
    : typeof raw.specialization === 'string' && raw.specialization.trim()
    ? [raw.specialization.trim()]
    : [];

  const services: string[] = Array.isArray(raw.services)
    ? raw.services
    : Array.isArray(raw.serviceOptions)
    ? raw.serviceOptions
    : ['Ushauri wa Kitaalamu', 'Uchunguzi Shambani'];

  return {
    profileId: raw.uid || raw.id || 'unknown-vet',
    fullName: raw.fullName || raw.name || 'Mtaalamu wa Mifugo',
    professionalTitle: raw.professionalTitle || raw.title || raw.specialization || 'Daktari wa Mifugo',
    professionalType: raw.professionalType || (raw.title?.includes?.('Afisa') ? 'Livestock Officer' : 'Veterinary Surgeon'),
    specialty: livestockTypes[0] || (typeof raw.specialization === 'string' ? raw.specialization : 'Afya ya Mifugo'),
    livestockTypes: Array.isArray(livestockTypes) ? livestockTypes : [],
    services: Array.isArray(services) ? services : [],
    region: raw.region || 'Tanzania',
    district: raw.district || '',
    area: raw.wardOrArea || raw.ward || raw.location || '',
    phone: raw.phone || undefined,
    whatsapp: raw.whatsapp || raw.phone || undefined,
    verificationStatus,
    availability: raw.availabilityStatus || (raw.isAvailable ? 'available' : 'busy'),
    emergencyAvailability: Boolean(raw.emergencyAvailable ?? raw.isEmergencyAvailable),
    profileCompleteness: Math.min(score, 100),
    bio: raw.bio || undefined,
    isStaleAvailability: false
  };
}

/**
 * 3. Fetch Authoritative Registered Daktari Profiles
 * Sources from Firestore professionals collection or authoritative seed veterinarians.
 */
export async function getAuthoritativeDaktariProfiles(): Promise<DaktariContextProfile[]> {
  try {
    // Attempt Firestore retrieval through daktariService
    const liveDoctors = await daktariService.getDoctors();
    if (liveDoctors && liveDoctors.length > 0) {
      return liveDoctors.map(normalizeToDaktariContextProfile);
    }
  } catch (err) {
    console.warn('[DaktariLoopService] Firestore lookup failed or empty:', err);
  }

  // Strict Ufugaji Update Registry: return empty if no real professionals registered
  return [];
}

/**
 * 4. Deterministic Ranking of Daktari Profiles (Section 9)
 * Priority:
 * 1. Relevant specialty (+50)
 * 2. Relevant livestock type (+40)
 * 3. Verified status (+30 for VERIFIED, +10 for REGISTERED, -100 for SUSPENDED/REJECTED)
 * 4. Location relevance (+25 for district, +15 for region)
 * 5. Service relevance (+10)
 * 6. Availability (+5)
 * 7. Emergency availability (+35 when emergency requested)
 * 8. Profile completeness (+0 to +5)
 * Do NOT allow Gemini to decide ranking.
 */
export function rankDaktariResults(
  results: DaktariContextProfile[],
  query: DaktariQuery
): DaktariContextProfile[] {
  const scored = results.map((profile) => {
    let score = 0;

    // Filter out suspended or rejected profiles completely
    if (profile.verificationStatus === 'SUSPENDED' || profile.verificationStatus === 'REJECTED') {
      return { profile, score: -9999 };
    }

    // 1. Specialty match
    if (query.specialty) {
      const matchSpec = (Array.isArray(profile.services) && profile.services.some((s) =>
        s && s.toLowerCase().includes(query.specialty!.toLowerCase())
      )) || (profile.bio && profile.bio.toLowerCase().includes(query.specialty!.toLowerCase()));
      if (matchSpec) score += 50;
    }

    // 2. Livestock type match
    if (query.livestockType && Array.isArray(profile.livestockTypes)) {
      const matchLivestock = profile.livestockTypes.some((l) =>
        l && (
          l.toLowerCase().includes(query.livestockType!.toLowerCase()) ||
          query.livestockType!.toLowerCase().includes(l.toLowerCase())
        )
      );
      if (matchLivestock) score += 40;
    }

    // 3. Verified status (Registration ≠ Verification: Verified profiles get higher trust rank)
    if (profile.verificationStatus === 'VERIFIED') {
      score += 30;
    } else if (profile.verificationStatus === 'REGISTERED') {
      score += 10;
    }

    // 4. Location relevance
    if (query.region && profile.region && profile.region.toLowerCase().includes(query.region.toLowerCase())) {
      score += 15;
      if (query.district && profile.district && profile.district.toLowerCase().includes(query.district.toLowerCase())) {
        score += 25; // Exact district bonus
      }
    }

    // 5. Emergency availability bonus if requested
    if (query.emergency) {
      if (profile.emergencyAvailability) {
        score += 35;
      } else {
        score -= 20; // Penalize non-emergency doctors during emergencies
      }
    }

    // 6. Availability
    if (profile.availability === 'available') {
      score += 5;
    }

    // 7. Profile completeness tiebreaker (0 to 5 pts)
    score += Math.round((profile.profileCompleteness || 0) / 20);

    // 8. Specific doctor name search
    if (query.specificDoctorName && profile.fullName) {
      if (profile.fullName.toLowerCase().includes(query.specificDoctorName.toLowerCase())) {
        score += 200; // Exact doctor name match takes top priority
      }
    }

    return { profile, score };
  });

  // Filter out any suspended or rejected
  return scored
    .filter((s) => s.score > -100)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.profile);
}

/**
 * 5. Search Daktari Professionals
 */
export async function searchDaktariProfessionals(
  query: DaktariQuery,
  customProfiles?: any[]
): Promise<DaktariSearchResult> {
  try {
    const allProfiles: DaktariContextProfile[] = (Array.isArray(customProfiles) && customProfiles.length > 0)
      ? customProfiles.map(normalizeToDaktariContextProfile)
      : (await getAuthoritativeDaktariProfiles());

    // Basic pre-filtering
    let filtered = allProfiles.filter((p) => {
      // Exclude suspended
      if (p.verificationStatus === 'SUSPENDED' || p.verificationStatus === 'REJECTED') {
        return false;
      }

      // If user strictly requested verified only
      if (query.verificationPreference && p.verificationStatus !== 'VERIFIED') {
        return false;
      }

      // If user strictly asked for a specific region
      if (query.region && !p.region.toLowerCase().includes(query.region.toLowerCase())) {
        // If region is strict, only match if same region or nearby
        return false;
      }

      // If emergency required, prioritize but do not strictly eliminate if total is small
      return true;
    });

    // If filtered is empty because of region, try all available regions if not strictly forbidden
    if (filtered.length === 0 && !query.region) {
      filtered = allProfiles.filter(
        (p) => p.verificationStatus !== 'SUSPENDED' && p.verificationStatus !== 'REJECTED'
      );
    }

    if (filtered.length === 0) {
      return {
        status: 'NO_RESULT',
        results: [],
        totalMatched: 0,
        query
      };
    }

    // Deterministic ranking
    const ranked = rankDaktariResults(filtered, query);

    return {
      status: 'FOUND',
      results: ranked,
      totalMatched: ranked.length,
      query
    };
  } catch (err) {
    console.error('[DaktariLoopService] Search failed:', err);
    return {
      status: 'RETRIEVAL_ERROR',
      results: [],
      totalMatched: 0,
      query
    };
  }
}

/**
 * 6. Build Daktari Handoff Model (Section 39)
 * Explicitly guards:
 * OBSERVATION ≠ DIAGNOSIS
 * HISTORY ≠ DIAGNOSIS
 * MORTALITY ≠ DISEASE
 */
export function buildDaktariHandoff(params: {
  source: 'AI_CONVERSATION' | 'MY_ASSISTANT' | 'VISUAL_MEDIA' | 'LIVESTOCK_HISTORY';
  signalType: DaktariHandoff['signalType'];
  livestockType?: string;
  location?: string;
  urgency?: 'ROUTINE' | 'ADVISORY' | 'URGENT' | 'EMERGENCY';
}): DaktariHandoff {
  const urgency = params.urgency || (params.signalType === 'EMERGENCY_DETECTED' ? 'EMERGENCY' : 'ADVISORY');
  
  let suggestedAction: DaktariHandoff['suggestedAction'] = 'PROFESSIONAL_ASSESSMENT';
  if (urgency === 'EMERGENCY') {
    suggestedAction = 'EMERGENCY_CARE';
  } else if (params.signalType === 'EXPLICIT_REQUEST') {
    suggestedAction = 'CONSULTATION_SEARCH';
  }

  // Safe Swahili explanatory note that NEVER claims a disease diagnosis
  let note = '';
  switch (params.signalType) {
    case 'MORTALITY_PATTERN':
      note =
        'Kuna kumbukumbu za vifo kwenye historia ya mifugo yako. Historia hiyo pekee haiwezi kuthibitisha chanzo wala ugonjwa; inashauriwa kupata tathmini ya daktari wa mifugo.';
      break;
    case 'TREATMENT_ACTIVITY':
      note =
        'Kuna kumbukumbu za matibabu yaliyofanyika awali. Daktari anaweza kusaidia kutathmini ufanisi na ratiba sahihi ya ufuatiliaji.';
      break;
    case 'VACCINATION_ACTIVITY':
      note =
        'Kuna taarifa za chanjo shambani. Ushauri wa daktari unasaidia kuhakikisha kinga kamili kulingana na msimu na eneo lako.';
      break;
    case 'EMERGENCY_DETECTED':
      note =
        'Mwenendo unaonyesha dharura inayohitaji msaada wa haraka wa daktari wa mifugo shambani kwako.';
      break;
    case 'INSUFFICIENT_VISUAL_EVIDENCE':
      note =
        'Picha au video inaonyesha dalili za jumla zisizoweza kuthibitisha utambuzi wa ugonjwa. Ukaguzi wa daktari wa mifugo ni muhimu.';
      break;
    default:
      note =
        'Ushauri wa mtaalamu wa mifugo aliyesajiliwa utakusaidia kufanya uamuzi salama wa kiafya kwa mifugo yako.';
      break;
  }

  return {
    reason: 'Ushauri wa kitaalamu wa mifugo unasaidia uamuzi salama na sahihi.',
    source: params.source,
    signalType: params.signalType,
    livestockType: params.livestockType,
    location: params.location,
    urgency,
    suggestedAction,
    explanatoryNoteSwahili: note
  };
}

/**
 * 7. Build Daktari AI Intelligence Result for AI Context & Safe Observability
 */
export async function getDaktariIntelligenceForAI(params: {
  question: string;
  farmerLocation?: string;
  farmerPrimaryLivestock?: string;
  hasEmergency?: boolean;
  hasMediaWithDistress?: boolean;
  existingProfiles?: DaktariContextProfile[];
}): Promise<DaktariAIIntelligenceResult> {
  const query = buildDaktariQuery(params.question, {
    farmerLocation: params.farmerLocation,
    farmerPrimaryLivestock: params.farmerPrimaryLivestock,
    hasEmergency: params.hasEmergency
  });

  const isDetected = query.intent !== 'NO_DAKTARI_INTENT';

  if (!isDetected) {
    return {
      detected: false,
      intent: 'NO_DAKTARI_INTENT',
      query,
      status: 'NO_RESULT',
      totalMatched: 0,
      results: [],
      deterministicExplanationSwahili: '',
      safetyNotice: 'AI haipigi simu wala kuanzisha mawasiliano kiotomatiki bila idhini ya mfugaji.',
      authorityLevel: 'LEVEL_1_AUTHORITATIVE',
      consultationPrivacyConfirmed: true
    };
  }

  const searchOutcome = await searchDaktariProfessionals(query, params.existingProfiles);

  const topRec = searchOutcome.results[0];

  // Build Handoff if appropriate
  let handoff: DaktariHandoff | undefined;
  if (query.emergency) {
    handoff = buildDaktariHandoff({
      source: 'AI_CONVERSATION',
      signalType: 'EMERGENCY_DETECTED',
      livestockType: query.livestockType,
      location: query.region,
      urgency: 'EMERGENCY'
    });
  } else if (params.hasMediaWithDistress) {
    handoff = buildDaktariHandoff({
      source: 'VISUAL_MEDIA',
      signalType: 'INSUFFICIENT_VISUAL_EVIDENCE',
      livestockType: query.livestockType,
      location: query.region,
      urgency: 'ADVISORY'
    });
  } else if (isDetected) {
    handoff = buildDaktariHandoff({
      source: 'AI_CONVERSATION',
      signalType: 'EXPLICIT_REQUEST',
      livestockType: query.livestockType,
      location: query.region,
      urgency: 'ROUTINE'
    });
  }

  // Construct deterministic explanation in Swahili (No hallucinations!)
  let explanation = '';
  if (searchOutcome.status === 'NO_RESULT' || searchOutcome.results.length === 0) {
    const locPart = query.region ? ` katika eneo la ${query.region}` : '';
    const livePart = query.livestockType ? ` kwa mifugo ya ${query.livestockType}` : '';
    explanation = `Kwasasa hakuna daktari au mtaalamu wa mifugo aliyesajiliwa kwenye mfumo wa Ufugaji Update${locPart}${livePart}. Wakati wataalamu zaidi wakiendelea kujiunga na kusajiliwa kwenye Ufugaji Update, tafadhali wasiliana na Afisa Ugani wa kata au wilaya yako, au tembelea kituo cha mifugo kilicho karibu nawe kwa msaada wa haraka.`;
  } else if (searchOutcome.status === 'RETRIEVAL_ERROR') {
    explanation = 'Taarifa za Daktari Mtaani Kwako hazijaweza kupatikana kwa sasa kutokana na hitilafu ya mtandao.';
  } else {
    const count = searchOutcome.results.length;
    const top = searchOutcome.results[0];
    const verifText = top.verificationStatus === 'VERIFIED' ? ' (Aliyehakikiwa rasmi)' : ' (Amesajiliwa)';
    explanation = `Nimepata wataalamu ${count} wa mifugo waliosajiliwa kwenye Daktari Mtaani Kwako. Mtaalamu anayependekezwa ni ${top.fullName}${verifText}, ${top.professionalTitle} eneo la ${top.district || top.region}.`;
  }

  return {
    detected: true,
    intent: query.intent,
    query,
    status: searchOutcome.status,
    totalMatched: searchOutcome.totalMatched,
    results: searchOutcome.results.slice(0, 5), // Keep top 5 to respect token budget
    topRecommendation: topRec,
    handoff,
    deterministicExplanationSwahili: explanation,
    safetyNotice:
      'AI inakusaidia kuelewa na kupata wataalamu wa mifugo waliosajiliwa. AI si tabibu na haipigi simu au kutuma WhatsApp kiotomatiki.',
    authorityLevel: 'LEVEL_1_AUTHORITATIVE',
    consultationPrivacyConfirmed: true
  };
}

/**
 * Synchronous search for immediate orchestrator bundling
 */
export function searchDaktariProfessionalsSync(
  query: DaktariQuery,
  customProfiles?: any[]
): DaktariSearchResult {
  const allProfiles: DaktariContextProfile[] = (Array.isArray(customProfiles) && customProfiles.length > 0)
    ? customProfiles.map(normalizeToDaktariContextProfile)
    : [];

  if (allProfiles.length === 0) {
    return {
      status: 'NO_RESULT',
      results: [],
      totalMatched: 0,
      query
    };
  }

  let filtered = allProfiles.filter((p) => {
    if (p.verificationStatus === 'SUSPENDED' || p.verificationStatus === 'REJECTED') {
      return false;
    }
    if (query.verificationPreference && p.verificationStatus !== 'VERIFIED') {
      return false;
    }
    if (query.region && p.region && !p.region.toLowerCase().includes(query.region.toLowerCase())) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0 && !query.region) {
    filtered = allProfiles.filter(
      (p) => p.verificationStatus !== 'SUSPENDED' && p.verificationStatus !== 'REJECTED'
    );
  }

  if (filtered.length === 0) {
    return {
      status: 'NO_RESULT',
      results: [],
      totalMatched: 0,
      query
    };
  }

  const ranked = rankDaktariResults(filtered, query);
  return {
    status: 'FOUND',
    results: ranked,
    totalMatched: ranked.length,
    query
  };
}

/**
 * Synchronous Daktari Intelligence builder for aiContextOrchestrator
 */
export function getDaktariIntelligenceForAISync(params: {
  question: string;
  farmerLocation?: string;
  farmerPrimaryLivestock?: string;
  hasEmergency?: boolean;
  hasMediaWithDistress?: boolean;
  existingProfiles?: DaktariContextProfile[];
}): DaktariAIIntelligenceResult {
  const query = buildDaktariQuery(params.question, {
    farmerLocation: params.farmerLocation,
    farmerPrimaryLivestock: params.farmerPrimaryLivestock,
    hasEmergency: params.hasEmergency
  });

  const isDetected = query.intent !== 'NO_DAKTARI_INTENT';

  if (!isDetected) {
    return {
      detected: false,
      intent: 'NO_DAKTARI_INTENT',
      query,
      status: 'NO_RESULT',
      totalMatched: 0,
      results: [],
      deterministicExplanationSwahili: '',
      safetyNotice: 'AI haipigi simu wala kuanzisha mawasiliano kiotomatiki bila idhini ya mfugaji.',
      authorityLevel: 'LEVEL_1_AUTHORITATIVE',
      consultationPrivacyConfirmed: true
    };
  }

  const searchOutcome = searchDaktariProfessionalsSync(query, params.existingProfiles);
  const topRec = searchOutcome.results[0];

  let handoff: DaktariHandoff | undefined;
  if (query.emergency) {
    handoff = buildDaktariHandoff({
      source: 'AI_CONVERSATION',
      signalType: 'EMERGENCY_DETECTED',
      livestockType: query.livestockType,
      location: query.region,
      urgency: 'EMERGENCY'
    });
  } else if (params.hasMediaWithDistress) {
    handoff = buildDaktariHandoff({
      source: 'VISUAL_MEDIA',
      signalType: 'INSUFFICIENT_VISUAL_EVIDENCE',
      livestockType: query.livestockType,
      location: query.region,
      urgency: 'ADVISORY'
    });
  } else if (isDetected) {
    handoff = buildDaktariHandoff({
      source: 'AI_CONVERSATION',
      signalType: 'EXPLICIT_REQUEST',
      livestockType: query.livestockType,
      location: query.region,
      urgency: 'ROUTINE'
    });
  }

  let explanation = '';
  if (searchOutcome.status === 'NO_RESULT' || searchOutcome.results.length === 0) {
    const locPart = query.region ? ` katika eneo la ${query.region}` : '';
    const livePart = query.livestockType ? ` kwa mifugo ya ${query.livestockType}` : '';
    explanation = `Kwasasa hakuna daktari au mtaalamu wa mifugo aliyesajiliwa kwenye mfumo wa Ufugaji Update${locPart}${livePart}. Wakati wataalamu zaidi wakiendelea kujiunga na kusajiliwa kwenye Ufugaji Update, tafadhali wasiliana na Afisa Ugani wa kata au wilaya yako, au tembelea kituo cha mifugo kilicho karibu nawe kwa msaada wa haraka.`;
  } else {
    const count = searchOutcome.results.length;
    const top = searchOutcome.results[0];
    const verifText = top.verificationStatus === 'VERIFIED' ? ' (Aliyehakikiwa rasmi)' : ' (Amesajiliwa)';
    explanation = `Nimepata wataalamu ${count} wa mifugo waliosajiliwa kwenye Daktari Mtaani Kwako. Mtaalamu anayependekezwa ni ${top.fullName}${verifText}, ${top.professionalTitle} eneo la ${top.district || top.region}.`;
  }

  return {
    detected: true,
    intent: query.intent,
    query,
    status: searchOutcome.status,
    totalMatched: searchOutcome.totalMatched,
    results: searchOutcome.results.slice(0, 5),
    topRecommendation: topRec,
    handoff,
    deterministicExplanationSwahili: explanation,
    safetyNotice:
      'AI inakusaidia kuelewa na kupata wataalamu wa mifugo waliosajiliwa. AI si tabibu na haipigi simu au kutuma WhatsApp kiotomatiki.',
    authorityLevel: 'LEVEL_1_AUTHORITATIVE',
    consultationPrivacyConfirmed: true
  };
}
