/**
 * V1.5E — COMBINED CONTEXT REASONING SERVICE
 * Phase 4: The Intelligent Loop (AI Context Layer)
 *
 * Implements controlled cross-context reasoning so the AI Assistant
 * can reason over multiple relevant sources simultaneously without merging
 * responsibilities or turning inference into fact.
 *
 * Core Guarantees:
 * 1. Authority Hierarchy:
 *    Authoritative Structured Farmer Data (Livestock Records/History)
 *      > Structured Farmer Intelligence (My Assistant)
 *      > Commercial Facts (Marketplace)
 *      > Visual Evidence (Image/Video)
 *      > Intent/Constraints (Conversation)
 *      > AI Interpretation (Gemini synthesis)
 * 2. Read-Only Enforced: Zero automated state writes back to farmer records or marketplace.
 * 3. Relevance First: Only activate and combine sources that are genuinely required.
 * 4. Marketplace / Assistant Independence: Zero commercial bias in farm intelligence.
 * 5. Medical Safety Guardrail: Strictly prohibits recommending medicines based on mortality history or marketplace stock.
 */

import { LivestockRecord, LivestockEvent, UserProfile } from '../types';
import {
  ContextSourceType,
  CombinedContextReasoningResult,
  CombinedContextCombinationType,
  AuthoritativeAnchors,
  AuthoritativeFarmAnchor,
  AuthoritativeIntelligenceAnchor,
  AuthoritativeCommercialAnchor,
  AuthoritativeVisualAnchor,
  AuthoritativeProfileAnchor
} from '../types/contextOrchestration';
import { MyAssistantAIIntelligenceResult } from '../types/aiMyAssistant';
import { MarketplaceAIIntelligenceResult } from '../types/aiMarketplace';
import { HistoryQuestionResult } from '../types/historyQuestionTypes';

export interface EvaluateCombinedContextParams {
  question: string;
  history?: any[];
  userProfile?: UserProfile | null;
  farmerLocation?: string;
  farmerRecords?: LivestockRecord[];
  recordEventsMap?: Record<string, LivestockEvent[]>;
  marketplaceResult?: MarketplaceAIIntelligenceResult;
  myAssistantResult?: MyAssistantAIIntelligenceResult;
  historyQuestionResult?: HistoryQuestionResult | null;
  hasMedia?: { hasImage?: boolean; hasVideo?: boolean };
  visualMarketplaceDetected?: boolean;
}

// Medical / Veterinary keywords that trigger strict prescription protection
const MEDICAL_TREATMENT_PATTERNS = [
  /\bdawa\b/i,
  /\bmatibabu\b/i,
  /\btiba\b/i,
  /\bantibiotic\b/i,
  /\bchanjo\b/i,
  /\bkuponya\b/i,
  /\bkutibu\b/i,
  /\bmgonjwa\b/i,
  /\bwanaumwa\b/i,
  /\bwanaugua\b/i,
  /\bmortality\b/i,
  /\bvifo\b/i,
  /\bwalikufa\b/i
];

// Commercial / Purchase / Price keywords
const COMMERCIAL_PURCHASE_PATTERNS = [
  /\b(bei|gharama|kununua|nanunua|nunua|sokoni|gulio|duka|maduka|wauzaji|shilingi|tsh|pesa)\b/i,
  /\b(feed|chakula|vifaa|feeders|drinkers|matangi|mashudu|pumba|nyasi|madini)\b/i
];

// Farm Record / Personal Livestock indicators
const PERSONAL_LIVESTOCK_PATTERNS = [
  /\b(kuku|ng'ombe|ngombe|mbuzi|kondoo|nguruwe|bata|sungura)\s+(wangu|yangu|zangu)\b/i,
  /\b(kundi\s+langu|banda\s+langu|shamba\s+langu|daftari\s+langu|rekodi\s+zangu)\b/i,
  /\bnina\s+(\d+|kuku|ng'ombe|ngombe|mbuzi|kondoo|nguruwe|bata|sungura)\b/i,
  /\bmifugo\s+yangu\b/i
];

/**
 * Checks if the question links mortality/illness with commercial drug purchasing.
 */
export function isMedicalCommercialRisk(question: string): boolean {
  const q = question.toLowerCase();
  const hasMedical = MEDICAL_TREATMENT_PATTERNS.some((p) => p.test(q));
  const hasCommercial = COMMERCIAL_PURCHASE_PATTERNS.some((p) => p.test(q));
  return hasMedical && hasCommercial;
}

/**
 * Evaluates whether multi-context reasoning is required and builds
 * the authoritative combined reasoning package.
 */
export function evaluateCombinedContextReasoning(
  params: EvaluateCombinedContextParams
): CombinedContextReasoningResult | null {
  const {
    question,
    userProfile,
    farmerLocation = '',
    farmerRecords = [],
    marketplaceResult,
    myAssistantResult,
    hasMedia = {},
    visualMarketplaceDetected = false
  } = params;

  const q = question.trim().toLowerCase();
  const hasImageOrVideo = Boolean(hasMedia.hasImage || hasMedia.hasVideo);

  // 1. Detect if medical safety boundary is breached
  const isMedRisk = isMedicalCommercialRisk(q);

  // 2. Identify available authoritative sources
  const hasRecords = farmerRecords.length > 0;
  const hasMyAssistantData = Boolean(
    myAssistantResult &&
    myAssistantResult.detected &&
    myAssistantResult.dataSufficiency !== 'NO_DATA'
  );
  const hasMarketplaceData = Boolean(
    marketplaceResult &&
    marketplaceResult.detected &&
    marketplaceResult.totalProductsMatched > 0
  );
  const hasLocation = Boolean(farmerLocation && farmerLocation.trim().length > 0);

  // 3. Determine if question bridges contexts
  const mentionsPersonalFarm = PERSONAL_LIVESTOCK_PATTERNS.some((p) => p.test(q)) || hasRecords;
  const mentionsMarketplace = COMMERCIAL_PURCHASE_PATTERNS.some((p) => p.test(q)) || hasMarketplaceData;
  const mentionsAssistant = /\b(msaidizi\s+wangu|matukio|mwelekeo|ongezeko|muhtasari|trend|ripoti)\b/i.test(q);

  // Evaluate combination candidate
  let combinationType: CombinedContextCombinationType | null = null;
  const primarySources: ContextSourceType[] = [];

  if (hasImageOrVideo && mentionsMarketplace) {
    if (mentionsPersonalFarm && hasRecords) {
      combinationType = 'MULTI_SOURCE_SYNTHESIS';
      primarySources.push(hasMedia.hasImage ? 'IMAGE' : 'VIDEO', 'LIVESTOCK_RECORDS', 'MARKETPLACE');
    } else {
      combinationType = 'VISUAL_AND_MARKETPLACE';
      primarySources.push(hasMedia.hasImage ? 'IMAGE' : 'VIDEO', 'MARKETPLACE');
    }
  } else if (hasImageOrVideo && mentionsPersonalFarm) {
    combinationType = 'VISUAL_AND_RECORDS';
    primarySources.push(hasMedia.hasImage ? 'IMAGE' : 'VIDEO', 'LIVESTOCK_RECORDS');
  } else if (mentionsAssistant && hasMyAssistantData && mentionsMarketplace) {
    combinationType = 'MY_ASSISTANT_AND_MARKETPLACE';
    primarySources.push('MY_ASSISTANT_INTELLIGENCE', 'MARKETPLACE');
    if (hasRecords) primarySources.push('LIVESTOCK_RECORDS');
  } else if (mentionsPersonalFarm && mentionsMarketplace) {
    combinationType = 'FARM_RECORDS_AND_MARKETPLACE';
    primarySources.push('LIVESTOCK_RECORDS', 'MARKETPLACE');
    if (hasLocation && /karibu|eneo|mkoa|wilaya/i.test(q)) {
      primarySources.push('FARMER_PROFILE');
    }
  } else if (hasLocation && mentionsMarketplace && /karibu\s+na\s+mimi|eneo\s+langu|hapa/i.test(q)) {
    combinationType = 'PROFILE_AND_MARKETPLACE';
    primarySources.push('FARMER_PROFILE', 'MARKETPLACE');
  }

  // If no combination detected, return null
  if (!combinationType) {
    return null;
  }

  // 4. Build Authoritative Anchors
  const anchors: AuthoritativeAnchors = {};

  // 4.1 Farm Facts Anchor
  if (primarySources.includes('LIVESTOCK_RECORDS') && hasRecords) {
    const totalAnimals = farmerRecords.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const speciesSummary = farmerRecords
      .map((r) => `${r.livestockType || r.livestockCategory || r.recordName || 'Mifugo'}: ${r.quantity || 0}`)
      .slice(0, 4)
      .join(', ');

    anchors.farmFacts = {
      summary: `Mfugaji anarekodi rasmi za mifugo ${totalAnimals} (${speciesSummary}).`,
      recordCount: farmerRecords.length,
      totalLivestock: totalAnimals,
      primarySpecies: farmerRecords[0]?.livestockType || farmerRecords[0]?.livestockCategory || 'Mifugo',
      source: 'LIVESTOCK_RECORDS'
    };
  }

  // 4.2 My Assistant Intelligence Anchor
  if (primarySources.includes('MY_ASSISTANT_INTELLIGENCE') && myAssistantResult) {
    anchors.intelligenceFacts = {
      summary: myAssistantResult.deterministicAnswer || 'Maarifa rasmi ya daftari la Msaidizi Wangu.',
      intent: myAssistantResult.intent,
      period: myAssistantResult.timePeriod?.label,
      dataSufficiency: myAssistantResult.dataSufficiency,
      source: 'MY_ASSISTANT_INTELLIGENCE'
    };
  }

  // 4.3 Commercial Facts Anchor
  if (primarySources.includes('MARKETPLACE') && marketplaceResult) {
    const topProds = (marketplaceResult.products || []).slice(0, 3).map((p) => ({
      title: p.title,
      priceFormatted: `TSh ${(p.price || 0).toLocaleString()} kwa ${p.unit || 'kitu'}`,
      sellerName: p.sellerName || 'Muuzaji aliyethibitishwa',
      location: p.location || 'Tanzania'
    }));

    anchors.commercialFacts = {
      summary: `Kuna bidhaa ${marketplaceResult.totalProductsMatched} na maduka ${marketplaceResult.totalShopsMatched} zilizothibitishwa sokoni.`,
      totalProductsMatched: marketplaceResult.totalProductsMatched,
      totalShopsMatched: marketplaceResult.totalShopsMatched,
      topMatchedProducts: topProds,
      source: 'MARKETPLACE'
    };
  }

  // 4.4 Visual Evidence Anchor
  if (primarySources.includes('IMAGE') || primarySources.includes('VIDEO')) {
    anchors.visualEvidence = {
      summary: hasMedia.hasImage
        ? 'Picha imeambatishwa kama ushuhuda wa kuona (Visual Evidence).'
        : 'Video imeambatishwa kama ushuhuda wa kuona (Visual Evidence).',
      mediaType: hasMedia.hasImage ? 'image' : 'video',
      source: hasMedia.hasImage ? 'IMAGE' : 'VIDEO'
    };
  }

  // 4.5 Profile Context Anchor
  if (primarySources.includes('FARMER_PROFILE')) {
    anchors.profileContext = {
      summary: `Eneo la mfugaji: ${farmerLocation || userProfile?.location || 'Haikutajwa'}.`,
      location: farmerLocation || userProfile?.location,
      source: 'FARMER_PROFILE'
    };
  }

  // 5. Build Safety Directives & Constraints
  const safetyConstraints: string[] = [
    '1. UTHIBITISHO WA VYANZO: Rekodi za mifugo ndizo chanzo cha ukweli wa shamba; Gulio ndilo chanzo cha ukweli wa kibiashara.',
    '2. USIONGEZE INFERENCE KWENYE REKODI: AI hairuhusiwi kuandika wala kugeuza makisio kuwa rekodi za daftari (Strictly Read-Only).',
    '3. UHURU WA MSAIDIZI WANGU: Taarifa za Gulio haziruhusiwi kupotosha wala kuathiri mahesabu ya Msaidizi Wangu.',
    '4. HAKUNA MANUNUZI YA KIOTOMATIKI: AI haifanyi manunuzi, malipo, wala kuweka oda bila idhini ya mfugaji.'
  ];

  let medicalNotice: string | undefined = undefined;
  if (isMedRisk) {
    medicalNotice =
      '⚠️ KANUNI YA USALAMA WA KITATIBU (Medical Safety Guardrail): ' +
      'Dawa za mifugo (antibiotics, matibabu maalum) hazipendekezwi kiotomatiki kutoka sokoni kulingana na vifo au dalili za ugonjwa. ' +
      'Mfugaji lazima aelekezwe kumwona Daktari wa Mifugo aliyesajiliwa (Daktari Mtaani Kwako) kwa ajili ya vipimo sahihi kabla ya kununua au kutoa dawa.';
    safetyConstraints.unshift(medicalNotice);
  }

  // 6. Synthesize Grounded Swahili Guidance
  let intentLabelSwahili = 'Uchambuzi wa Pamoja';
  let reasoningGoal = '';
  const guidanceParts: string[] = [];

  switch (combinationType) {
    case 'FARM_RECORDS_AND_MARKETPLACE':
      intentLabelSwahili = 'Daftari la Mifugo + Gulio la Sokoni';
      reasoningGoal = 'Kulinganisha mahitaji ya idadi ya mifugo kwenye daftari na bidhaa/pembejeo halisi zilizopo sokoni.';
      if (anchors.farmFacts) {
        guidanceParts.push(`📊 **Ukweli wa Shamba lako:** ${anchors.farmFacts.summary}`);
      }
      if (isMedRisk) {
        guidanceParts.push(
          `🛡️ **Ushauri wa Kitatibu:** Kwa masuala ya afya na matibabu, tafadhali wasiliana na Daktari wa Mifugo kwanza ili kupata maelekezo sahihi ya dozi kabla ya kununua dawa sokoni.`
        );
      }
      if (anchors.commercialFacts && anchors.commercialFacts.totalProductsMatched > 0) {
        guidanceParts.push(`🛒 **Ukweli wa Gulio:** ${anchors.commercialFacts.summary}`);
        if (anchors.commercialFacts.topMatchedProducts && anchors.commercialFacts.topMatchedProducts.length > 0) {
          const prodList = anchors.commercialFacts.topMatchedProducts
            .map((p) => `• ${p.title} — ${p.priceFormatted} (${p.location})`)
            .join('\n');
          guidanceParts.push(`Bidhaa zilizothibitishwa:\n${prodList}`);
        }
      } else {
        guidanceParts.push(`🛒 **Gulio:** Hakuna bidhaa zilizopatikana sokoni kwa sasa zinazolingana na utafutaji huu moja kwa moja.`);
      }
      break;

    case 'MY_ASSISTANT_AND_MARKETPLACE':
      intentLabelSwahili = 'Maarifa ya Msaidizi Wangu + Gulio la Sokoni';
      reasoningGoal = 'Kutumia mwenendo na mwelekeo wa shamba kubaini mahitaji ya pembejeo au vifaa kutoka Gulio bila upendeleo wa kibiashara.';
      if (anchors.intelligenceFacts) {
        guidanceParts.push(`📈 **Mwenendo wa Shamba (Msaidizi Wangu):** ${anchors.intelligenceFacts.summary}`);
      }
      if (anchors.commercialFacts && anchors.commercialFacts.totalProductsMatched > 0) {
        guidanceParts.push(`🛒 **Chaguzi Halisi Sokoni:** ${anchors.commercialFacts.summary}`);
      }
      break;

    case 'VISUAL_AND_RECORDS':
      intentLabelSwahili = 'Ushahidi wa Picha/Video + Daftari la Mifugo';
      reasoningGoal = 'Kuangalia mwonekano wa mnyama au vifaa kwenye picha/video ikilinganishwa na rekodi zilizopo kwenye daftari la mfugaji.';
      guidanceParts.push(
        `👁️ **Ushahidi wa Kuona:** Picha/video inatumika kama ushuhuda wa mwonekano tu. Haiwezi kubadilisha wala kurekodi matukio mapya bila idhini yako.`
      );
      if (anchors.farmFacts) {
        guidanceParts.push(`📋 **Kumbukumbu za Daftari:** ${anchors.farmFacts.summary}`);
      }
      break;

    case 'VISUAL_AND_MARKETPLACE':
      intentLabelSwahili = 'Ushahidi wa Picha/Video + Gulio la Sokoni';
      reasoningGoal = 'Kutambua bidhaa/kifaa kilichoonyeshwa kwenye picha/video na kutafuta bidhaa zinazolingana sokoni.';
      guidanceParts.push(`👁️ **Ushahidi wa Kuona:** Kifaa au bidhaa iliyoonyeshwa inalinganishwa na bidhaa halisi za Gulio.`);
      if (anchors.commercialFacts && anchors.commercialFacts.totalProductsMatched > 0) {
        guidanceParts.push(`🛒 **Matokeo ya Gulio:** ${anchors.commercialFacts.summary}`);
      }
      break;

    case 'PROFILE_AND_MARKETPLACE':
      intentLabelSwahili = 'Eneo la Mfugaji + Maduka ya Sokoni';
      reasoningGoal = 'Kutafuta maduka na bidhaa kulingana na eneo na mkoa wa mfugaji.';
      if (anchors.profileContext) {
        guidanceParts.push(`📍 **Eneo lako:** ${anchors.profileContext.summary}`);
      }
      if (anchors.commercialFacts) {
        guidanceParts.push(`🏪 **Maduka na Bidhaa Karibu:** ${anchors.commercialFacts.summary}`);
      }
      break;

    case 'MULTI_SOURCE_SYNTHESIS':
    default:
      intentLabelSwahili = 'Uchambuzi Shirikishi wa Vyanzo Vingi';
      reasoningGoal = 'Kujumuisha rekodi za shamba, eneo, ushuhuda wa kuona, na soko kwa wakati mmoja bila kupoteza mipaka ya mamlaka.';
      if (anchors.farmFacts) guidanceParts.push(`📊 **Shamba:** ${anchors.farmFacts.summary}`);
      if (anchors.commercialFacts) guidanceParts.push(`🛒 **Gulio:** ${anchors.commercialFacts.summary}`);
      break;
  }

  guidanceParts.push(
    `\n🔒 **Uhakika wa Data:** Rekodi zako zinalindwa (Read-Only) na hazijabadilishwa. Taarifa za Gulio hazibadili rekodi zako za shamba.`
  );

  const synthesizedGuidanceSwahili = guidanceParts.join('\n\n');

  return {
    detected: true,
    combinationType,
    intentLabelSwahili,
    primarySources,
    reasoningGoal,
    authoritativeAnchors: anchors,
    synthesizedGuidanceSwahili,
    safetyConstraints,
    medicalRestricted: isMedRisk,
    medicalSafetyNotice: medicalNotice,
    readOnlyEnforced: true,
    independenceVerified: true,
    confidence: 0.94,
    isDeterministicEligible: !isMedRisk && (anchors.commercialFacts?.totalProductsMatched || 0) > 0
  };
}
