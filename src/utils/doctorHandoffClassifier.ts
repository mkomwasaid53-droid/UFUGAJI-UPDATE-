/**
 * V1.2G — AI ASSISTANT ↔ DAKTARI MTAANI KWAKO INTEGRATION
 * Doctor Intent & Professional Handoff Classifier
 *
 * Implements strict boundaries:
 * - Detects explicit requests for veterinary doctors / extension officers
 * - Detects emergency veterinary situations (severe distress, bleeding, collapse, mass deaths)
 * - Detects professional assessment recommendations
 * - Extracts livestock type and region safely without guessing
 * - Generates allowlisted, structured FIND_DOCTOR action metadata
 * - Never executes arbitrary database operations or calls
 */

import {
  AiDoctorAction,
  DoctorHandoffReason,
  DoctorSearchFilters,
  DoctorClassifierResult
} from '../types/aiDoctorAction';
import { TANZANIA_REGIONS } from '../data/daktariData';

// Explicit cues where user is seeking a doctor or professional
const EXPLICIT_DOCTOR_PATTERNS = [
  /\b(daktari|dakatri|vet|veterinary|veterinarian)\b/i,
  /\b(bwana\s+mifugo|bibi\s+mifugo)\b/i,
  /\b(afisa\s+mifugo|afisa\s+ugani|afisa\s+wa\s+mifugo)\b/i,
  /\b(mtaalamu\s+wa\s+mifugo|wataalamu\s+wa\s+mifugo)\b/i,
  /\b(tabibu\s+wa\s+mifugo)\b/i,
  /\b(nipatie|nipe|natafuta|nahitaji|nataka|nisaidie\s+kupata)\s+(daktari|bwana\s+mifugo|afisa\s+mifugo|mtaalamu)\b/i,
  /\b(kuna\s+daktari|yupo\s+daktari|wapi\s+nitampata\s+daktari)\b/i,
  /\b(namba\s+ya\s+daktari|mawasiliano\s+ya\s+daktari)\b/i,
  /\b(nataka\s+kumuona\s+daktari|muone\s+daktari)\b/i,
  /\b(daktari\s+wa\s+kuku|daktari\s+wa\s+ng'ombe|daktari\s+wa\s+mbuzi|daktari\s+wa\s+mifugo)\b/i
];

// Emergency veterinary signals (severe distress, collapse, bleeding, sudden mortality)
const EMERGENCY_PATTERNS = [
  /\b(wanakufa|wamekufa|kufa)\s+(ghafla|kwa\s+wingi|mfululizo|wengi|ndani\s+ya)\b/i,
  /\bvifo\s+vya\s+ghafla\b/i,
  /\b(kuku|ng'ombe|mbuzi|mifugo)\s+\d+\s+(wamekufa|wameanza\s+kufa)\b/i,
  /\b(kuhema|anapumua)\s+kwa\s+(shida\s+sana|shida\s+kubwa|nguvu\s+mno)\b/i,
  /\b(anashindwa|hawezi)\s+kupumua\b/i,
  /\b(damu\s+nyingi|kutokwa\s+na\s+damu|inavuja\s+damu|damu\s+haikomi)\b/i,
  /\b(kushindwa\s+kusimama|hawezi\s+kusimama|hawezi\s+kutembea|amelala\s+haamki|ameanguka\s+chini)\b/i,
  /\b(amepooza|kupooza\s+miguu|kupooza\s+mwili)\b/i,
  /\b(anatetemeka\s+mwili\s+mzima|kifafa|mshtuko\s+wa\s+mwili|anarusha\s+miguu)\b/i,
  /\b(jeraha\s+kubwa|kidonda\s+kibaya|jeraha\s+wazi|kuvunjika\s+mfupa)\b/i,
  /\b(hali\s+ya\s+dharura|dharura\s+kubwa|yuko\s+karibu\s+kufa)\b/i,
  /\b(sumu|amekula\s+sumu|kuvimba\s+tumbo\s+sana)\b/i
];

// Symptoms or medical questions suggesting professional assessment is required
const PROFESSIONAL_RECOMMENDATION_PATTERNS = [
  /\b(ugonjwa\s+hauponi|hali\s+inazidi\s+kuwa\s+mbaya|ameugua\s+kwa\s+muda\s+mrefu)\b/i,
  /\b(dawa\s+haifanyi\s+kazi|ametumia\s+dawa\s+hajapona)\b/i,
  /\b(macho\s+yamevimba\s+sana|kinyesi\s+cheusi|kinyesi\s+chenye\s+damu)\b/i,
  /\b(nimchome\s+sindano\s+gani|dozi\s+ya\s+sindano|kiasi\s+gani\s+cha\s+dawa\s+ya\s+sindano)\b/i,
  /\b(dozi\s+ya\s+antibiotic|dozi\s+gani)\b/i,
  /\b(upasuaji|kushona|kutibu\s+jeraha)\b/i,
  /\b(chanjo\s+ya\s+dharura)\b/i
];

// Mapping of Swahili keywords to standard livestock categories
const LIVESTOCK_KEYWORD_MAP: { [keyword: string]: string } = {
  kuku: 'Kuku',
  kanga: 'Kuku',
  bata: 'Kuku',
  njiwa: 'Kuku',
  kware: 'Kuku',
  broiler: 'Kuku',
  layers: 'Kuku',
  kienyeji: 'Kuku',
  sasso: 'Kuku',
  vifaranga: 'Kuku',
  poultry: 'Kuku',

  "ng'ombe": "Ng'ombe",
  ngombe: "Ng'ombe",
  ndama: "Ng'ombe",
  mtamba: "Ng'ombe",
  dume: "Ng'ombe",
  friesian: "Ng'ombe",
  cattle: "Ng'ombe",
  cow: "Ng'ombe",

  mbuzi: 'Mbuzi',
  ndau: 'Mbuzi',
  boer: 'Mbuzi',
  goat: 'Mbuzi',

  kondoo: 'Kondoo',
  sheep: 'Kondoo',

  nguruwe: 'Nguruwe',
  pig: 'Nguruwe',

  sungura: 'Sungura',
  rabbit: 'Sungura',

  samaki: 'Samaki',
  fish: 'Samaki',

  nyuki: 'Nyuki',
  bee: 'Nyuki'
};

/**
 * Checks whether text explicitly seeks a doctor or veterinary professional
 */
export function isExplicitDoctorQuery(text: string): boolean {
  if (!text || !text.trim()) return false;
  return EXPLICIT_DOCTOR_PATTERNS.some((p) => p.test(text));
}

/**
 * Checks whether text indicates an emergency veterinary situation
 */
export function isEmergencyQuery(text: string): boolean {
  if (!text || !text.trim()) return false;
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

/**
 * Extracts a mentioned Tanzania region from text
 */
export function extractRegionFromText(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  for (const region of TANZANIA_REGIONS) {
    const regLower = region.toLowerCase();
    // Use word boundary check so "mara" doesn't match "mara moja"
    if (regLower === 'mara') {
      if (/\bmkoa\s+wa\s+mara\b/i.test(lower) || /\bmara\s+region\b/i.test(lower)) {
        return region;
      }
      continue;
    }
    const regex = new RegExp(`\\b${regLower}\\b`, 'i');
    if (regex.test(lower)) {
      return region;
    }
  }
  return undefined;
}

/**
 * Extracts mentioned livestock type from text
 */
export function extractLivestockTypeFromText(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  for (const [kw, standardType] of Object.entries(LIVESTOCK_KEYWORD_MAP)) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(lower)) {
      return standardType;
    }
  }
  return undefined;
}

/**
 * Checks if text is an educational question that should NOT trigger a doctor handoff
 * Example: "Chanjo ya Newcastle ni nini?", "Muda gani kuku wanataga?"
 */
export function isPurelyEducationalQuestion(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const educationalPatterns = [
    /\b(ni\s+nini|maana\s+yake|ni\s+kitu\s+gani)\b/i,
    /\bumuhimu\s+wa\b/i,
    /\bfaida\s+(za|gani)\b/i,
    /\bjinsi\s+ya\s+(kujenga|kulisha|kutengeneza)\b/i,
    /\bration\s+ya\s+chakula\b/i,
    /\bkuku\s+wanataga\s+baada\s+ya\s+muda\s+gani\b/i,
    /\baina\s+za\s+kuku\b/i,
    /\baina\s+za\s+mabanda\b/i
  ];
  return educationalPatterns.some((p) => p.test(lower));
}

export interface ClassifyDoctorIntentOptions {
  userQuestion: string;
  aiResponseText?: string;
  hasImageAttachment?: boolean;
  hasVideoAttachment?: boolean;
  farmerLocation?: string; // from userProfile / FarmerContext
  farmerPrimaryLivestock?: string; // from userProfile
}

/**
 * Comprehensive classification of Doctor Handoff intent.
 * Evaluates farmer question, media presence, emergency signals, and AI response cues.
 */
export function classifyDoctorIntent(
  options: ClassifyDoctorIntentOptions
): DoctorClassifierResult {
  const {
    userQuestion = '',
    aiResponseText = '',
    hasImageAttachment = false,
    hasVideoAttachment = false,
    farmerLocation,
    farmerPrimaryLivestock
  } = options;

  const combinedText = `${userQuestion} ${aiResponseText}`;
  const matchedKeywords: string[] = [];

  // Check 1: Explicit Doctor Request
  const isExplicit = isExplicitDoctorQuery(userQuestion);
  if (isExplicit) {
    matchedKeywords.push('EXPLICIT_DOCTOR_REQUEST');
  }

  // Check 2: Emergency signals
  const isEmergency = isEmergencyQuery(userQuestion) || isEmergencyQuery(combinedText);
  if (isEmergency) {
    matchedKeywords.push('EMERGENCY_DETECTED');
  }

  // Check 3: Medical / Professional assessment signals
  const hasMedicalTriggers = PROFESSIONAL_RECOMMENDATION_PATTERNS.some((p) =>
    p.test(userQuestion)
  );
  if (hasMedicalTriggers) {
    matchedKeywords.push('PROFESSIONAL_SYMPTOMS');
  }

  // Check 4: Media uncertainty with animal distress
  const hasMediaWithDistress =
    (hasImageAttachment || hasVideoAttachment) &&
    (isEmergency || hasMedicalTriggers || /\b(ugonjwa|anaumwa|hawezi|kuharisha|vimba)\b/i.test(userQuestion));
  if (hasMediaWithDistress) {
    matchedKeywords.push('MEDIA_DISTRESS_HANDOFF');
  }

  // Check 5: Did the AI response explicitly advise consulting a vet?
  const aiAdvisedVet =
    aiResponseText &&
    /\b(wasiliana\s+na\s+daktari|shirikiana\s+na\s+daktari|mtafute\s+daktari|muone\s+daktari|daktari\s+wa\s+mifugo|bwana\s+mifugo)\b/i.test(
      aiResponseText
    );
  if (aiAdvisedVet) {
    matchedKeywords.push('AI_ADVISED_VET');
  }

  // Purely educational questions without explicit doctor requests should remain normal
  if (!isExplicit && !isEmergency && isPurelyEducationalQuestion(userQuestion)) {
    return {
      detected: false,
      isEmergency: false,
      matchedKeywords: []
    };
  }

  // Determine if handoff is triggered
  const shouldHandoff =
    isExplicit ||
    isEmergency ||
    hasMedicalTriggers ||
    hasMediaWithDistress ||
    (aiAdvisedVet && !isPurelyEducationalQuestion(userQuestion));

  if (!shouldHandoff) {
    return {
      detected: false,
      isEmergency: false,
      matchedKeywords: []
    };
  }

  // Determine handoff reason
  let reason: DoctorHandoffReason = 'PROFESSIONAL_ASSESSMENT_RECOMMENDED';
  if (isEmergency) {
    reason = 'EMERGENCY_DETECTED';
  } else if (isExplicit) {
    reason = 'EXPLICIT_REQUEST';
  } else if (hasMediaWithDistress) {
    reason = 'INSUFFICIENT_VISUAL_EVIDENCE';
  }

  // Extract or fallback location safely (Do NOT guess!)
  let targetRegion = extractRegionFromText(userQuestion);
  if (!targetRegion && farmerLocation) {
    targetRegion = extractRegionFromText(farmerLocation) || farmerLocation;
  }

  // Extract or fallback livestock type
  let livestockType = extractLivestockTypeFromText(userQuestion);
  if (!livestockType && farmerPrimaryLivestock) {
    livestockType = extractLivestockTypeFromText(farmerPrimaryLivestock) || farmerPrimaryLivestock;
  }

  // Generate safe, context-appropriate Swahili CTA label
  let label = 'Tafuta Daktari';
  if (isEmergency) {
    label = livestockType
      ? `Tafuta Daktari wa Dharura (${livestockType})`
      : 'Tafuta Daktari wa Dharura';
  } else if (isExplicit) {
    if (livestockType && targetRegion) {
      label = `Tafuta Daktari wa ${livestockType} (${targetRegion})`;
    } else if (livestockType) {
      label = `Tafuta Daktari wa ${livestockType}`;
    } else if (targetRegion) {
      label = `Tafuta Daktari wa Mifugo (${targetRegion})`;
    } else {
      label = 'Tafuta Daktari';
    }
  } else {
    if (livestockType) {
      label = `Tafuta Daktari wa ${livestockType}`;
    } else if (targetRegion) {
      label = 'Tafuta Daktari wa Karibu';
    } else {
      label = 'Tafuta Daktari';
    }
  }

  const filters: DoctorSearchFilters = {};
  if (targetRegion) filters.region = targetRegion;
  if (livestockType) filters.livestockType = livestockType;
  if (isEmergency) filters.emergency = true;

  const action: AiDoctorAction = {
    type: 'FIND_DOCTOR',
    label,
    reason,
    filters
  };

  return {
    detected: true,
    action,
    isEmergency,
    reason,
    matchedKeywords
  };
}

/**
 * Strict allowlist validator to prevent arbitrary AI actions from reaching the client
 */
export function validateAndSanitizeDoctorAction(action: any): AiDoctorAction | null {
  if (!action || typeof action !== 'object') return null;

  // STRICT ALLOWLIST: Only FIND_DOCTOR is permitted
  if (action.type !== 'FIND_DOCTOR') {
    return null;
  }

  const validReasons: DoctorHandoffReason[] = [
    'PROFESSIONAL_ASSESSMENT_RECOMMENDED',
    'EXPLICIT_REQUEST',
    'EMERGENCY_DETECTED',
    'INSUFFICIENT_VISUAL_EVIDENCE'
  ];

  const reason: DoctorHandoffReason = validReasons.includes(action.reason)
    ? action.reason
    : 'PROFESSIONAL_ASSESSMENT_RECOMMENDED';

  // Sanitize label
  let label = typeof action.label === 'string' ? action.label.trim() : 'Tafuta Daktari';
  if (label.length === 0 || label.length > 70) {
    label = 'Tafuta Daktari';
  }

  // Sanitize filters
  const rawFilters = action.filters && typeof action.filters === 'object' ? action.filters : {};
  const sanitizedFilters: DoctorSearchFilters = {};

  if (typeof rawFilters.region === 'string' && rawFilters.region.trim()) {
    const cleanReg = rawFilters.region.trim();
    if (TANZANIA_REGIONS.includes(cleanReg)) {
      sanitizedFilters.region = cleanReg;
    }
  }

  if (typeof rawFilters.district === 'string' && rawFilters.district.trim()) {
    sanitizedFilters.district = rawFilters.district.trim().slice(0, 50);
  }

  if (typeof rawFilters.livestockType === 'string' && rawFilters.livestockType.trim()) {
    sanitizedFilters.livestockType = rawFilters.livestockType.trim().slice(0, 50);
  }

  if (typeof rawFilters.service === 'string' && rawFilters.service.trim()) {
    sanitizedFilters.service = rawFilters.service.trim().slice(0, 60);
  }

  if (rawFilters.emergency === true || rawFilters.emergency === 'true') {
    sanitizedFilters.emergency = true;
  }

  return {
    type: 'FIND_DOCTOR',
    label,
    reason,
    filters: sanitizedFilters
  };
}
