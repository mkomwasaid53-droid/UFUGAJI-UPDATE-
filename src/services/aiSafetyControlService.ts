/**
 * V1.5F — SAFETY & HALLUCINATION CONTROL SERVICE
 * Centralized Safety, Grounding, and Hallucination Prevention Engine
 *
 * Core Principle:
 * "AI can explain verified information, but AI cannot manufacture verified information."
 * "AI can recommend a next step, but AI cannot silently perform the next step."
 *
 * Enforces the strict Source Authority Hierarchy:
 * - LEVEL 1: Authoritative System Data (Records, History, My Assistant, Marketplace live results, Verified Daktari)
 * - LEVEL 2: Derived Structured Data (Totals, Trends, Mortality rates, Aggregates)
 * - LEVEL 3: User Conversation (Intent, Questions, Preferences - NOT automatic history)
 * - LEVEL 4: Image/Video Evidence (Visual features - NOT diagnosis, NOT records)
 * - LEVEL 5: AI Interpretation (Explanations - NEVER promoted to FACT)
 */

import {
  SafetyValidationResult,
  SafetyViolation,
  SafetyViolationType,
  SourceConflict,
  SafetyTelemetry,
  SafetyRiskLevel,
  GroundedClaimAnchor
} from '../types/aiSafetyControl';
import { AIContextBundle } from '../types/contextOrchestration';

// ==============================================================================
// 1. REGEX PATTERNS FOR SAFETY VALIDATION
// ==============================================================================

// Definitive Medical Diagnosis Patterns (Banned without lab / veterinary exam)
const DEFINITIVE_DIAGNOSIS_PATTERNS = [
  /\b(kuku\s+wako\s+ana|ng'ombe\s+wako\s+ana|mbuzi\s+wako\s+ana)\s+(ugonjwa\s+wa\s+)?(newcastle|kideri|gumboro|coryza|mdondo|homa\s+ya\s+mapafu|fowl\s+pox|ndui|anthrax|kimeta|mastitis|kichaa|coccidiosis)\b/i,
  /\b(mnyama\s+wako\s+amepatwa\s+na|mnyama\s+ana|hawa\s+wana)\s+(newcastle|kideri|gumboro|coryza|mdondo|homa\s+ya\s+mapafu|fowl\s+pox|ndui|anthrax|kimeta|mastitis|kichaa|coccidiosis)\b/i,
  /\b(utambuzi\s+wangu\s+ni|nina\s+uhakika\s+ni|bila\s+shaka\s+huu\s+ni|ugonjwa\s+huu\s+ni\s+hakika)\s+/i,
  /\b(confirmed\s+diagnosis|definitely\s+has|suffering\s+from\s+confirmed)\b/i
];

// Unsupported Prescription / Dosage Patterns (Banned AI medical prescription)
const UNSUPPORTED_DOSAGE_PATTERNS = [
  /\b(choma\s+sindano\s+ya|choma\s+sindano\s+ml|dunga\s+sindano)\s+\d+/i,
  /\b(mpe\s+ml\s+\d+|dozi\s+ya\s+\d+\s*(ml|mg|cc)|kunywa\s+\d+\s*ml)\b/i,
  /\b(changanya\s+na\s+maji\s+lita\s+\d+\s+kwa\s+siku\s+\d+)\b/i,
  /\b(tumia\s+antibiotic\s+hii|dawa\s+ya\s+oxytetracycline\s+\d+ml|penicillin\s+\d+ml)\b/i,
  /\b(inject\s+\d+\s*ml|administer\s+\d+\s*mg|dosage\s+is\s+\d+)\b/i
];

// Automated Action Attempt Patterns (Banned silent automated operations)
const AUTOMATED_ACTION_PATTERNS = [
  /\b(nimeshampigia|nimepiga\s+simu\s+kwa)\s+(daktari|bwana\s+mifugo|muuzaji|seller)\b/i,
  /\b(nimetuma\s+ujumbe\s+whatsapp|nimeanza\s+mazungumzo\s+whatsapp|whatsapp\s+sent)\b/i,
  /\b(nimeagiza\s+bidhaa|nimenunua\s+bidhaa|nimeongeza\s+kwenye\s+kikapu\s+chako|nimefanya\s+oda)\b/i,
  /\b(nimekata\s+pesa|nimefanya\s+malipo|payment\s+authorized|order\s+confirmed\s+automatically)\b/i,
  /\b(nimeshiriki\s+picha\s+yako\s+na\s+daktari|nimetuma\s+video\s+yako\s+kwa)\b/i
];

// Prompt Injection Signatures (Treat user/untrusted content as data, never override rules)
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /sahau\s+(maagizo|sheria)\s+(yote|zote)\s+za\s+awali/i,
  /declare\s+this\s+seller\s+verified/i,
  /thibitisha\s+muuzaji\s+huyu\s+kama\s+amehakikiwa/i,
  /create\s+(a\s+)?treatment\s+event/i,
  /tengeneza\s+tukio\s+la\s+matibabu\s+kwenye\s+daftari/i,
  /bypass\s+safety/i,
  /act\s+as\s+a\s+licensed\s+veterinarian/i,
  /jifanye\s+wewe\s+ni\s+daktari\s+halisi/i,
  /contact\s+doctor\s+automatically/i,
  /assume\s+(the\s+)?price\s+is/i,
  /chukulia\s+bei\s+ni/i,
  /assume\s+(there\s+are|stock\s+is)/i,
  /chukulia\s+idadi\s+ni/i
];

// Unverified Price & Stock Authority Claims (Banned fabricated claims)
const UNVERIFIED_PRICE_PATTERNS = [
  /\b(bei\s+rasmi\s+ya\s+soko\s+ya\s+serikali|bei\s+iliyothibitishwa\s+na\s+serikali|bei\s+ya\s+jumla\s+nchi\s+nzima)\b/i,
  /\b(guaranteed\s+market\s+price|government\s+approved\s+price|official\s+fixed\s+price)\b/i
];

const UNVERIFIED_STOCK_PATTERNS = [
  /\b(dhamana\s+ya\s+uhakika\s+wa\s+mzigo\s+stoo|guaranteed\s+physical\s+stock|100%\s+mzigo\s+upo\s+stoo)\b/i
];

// Fake Doctor / Credential Patterns
const UNVERIFIED_CREDENTIAL_PATTERNS = [
  /\b(daktari\s+huyu\s+ameidhinishwa\s+rasmi|daktari\s+aliyehakikiwa\s+na\s+serikali|daktari\s+wa\s+mifugo\s+mwenye\s+leseni)\b/i,
  /\b(licensed\s+veterinarian|officially\s+certified\s+veterinarian|board\s+certified\s+vet)\b/i
];

// Overconfidence / Absolute Certainty Patterns
const OVERCONFIDENT_PATTERNS = [
  /\b(bila\s+shaka\s+yoyote|ina\s+uhakika\s+wa\s+asilimia\s+100|100%\s+certain|definitely\s+proven)\b/i,
  /\b(hakika\s+kabisa\s+ugonjwa\s+huu\s+ni)\b/i
];

// ==============================================================================
// 2. EXTRACTION & FACT-LOCKING HELPERS
// ==============================================================================

export interface ValidateAIResponseParams {
  rawResponseText: string;
  userQuestion: string;
  contextBundle?: AIContextBundle;
  farmerLocation?: string;
  hasImageAttachment?: boolean;
  hasVideoAttachment?: boolean;
}

/**
 * Extracts prices mentioned in text in format TSh xxx or Tsh xxx
 */
function extractMentionedPrices(text: string): number[] {
  const prices: number[] = [];
  const regex = /(?:TSh|Tsh|TSH|Sh)\s*([\d,]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const cleaned = match[1].replace(/,/g, '');
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num > 0) {
      prices.push(num);
    }
  }
  return prices;
}

/**
 * Checks if a specific price is grounded in the active marketplace retrieval result
 */
function isPriceGrounded(price: number, contextBundle?: AIContextBundle): boolean {
  if (!contextBundle?.marketplaceIntelligenceResult?.products) {
    return false;
  }
  const products = contextBundle.marketplaceIntelligenceResult.products;
  return products.some((p) => {
    if (typeof p.price === 'number') {
      // Exact or within 1% rounding
      return Math.abs(p.price - price) <= 1;
    }
    return false;
  });
}

/**
 * Checks if a product mentioned as a specific marketplace listing is grounded
 */
function isMarketplaceProductGrounded(text: string, contextBundle?: AIContextBundle): { grounded: boolean; ungroundedMentions: string[] } {
  // Look for phrases like "Kuna bidhaa X kwenye Gulio", "inapatikana sokoni kwa..."
  const productPhrases = [
    /(?:kwenye\s+Gulio|sokoni|inauzwa\s+sokoni|inapatikana\s+kwenye\s+Gulio)\s*:\s*["']?([^"',.\n]+)["']?/gi,
    /bidhaa\s+ya\s+["']([^"']+)["']\s+inapatikana/gi
  ];

  const ungroundedMentions: string[] = [];
  const validTitles = (contextBundle?.marketplaceIntelligenceResult?.products || []).map((p) => p.title.toLowerCase());

  for (const regex of productPhrases) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const mention = match[1].trim().toLowerCase();
      if (mention.length > 3) {
        const isMatched = validTitles.some((vt) => vt.includes(mention) || mention.includes(vt));
        if (!isMatched) {
          ungroundedMentions.push(match[1].trim());
        }
      }
    }
  }

  return {
    grounded: ungroundedMentions.length === 0,
    ungroundedMentions
  };
}

// ==============================================================================
// 3. CORE VALIDATION GATE: validateAIResponse
// ==============================================================================

/**
 * Central V1.5F Safety & Grounding Gate
 * Inspects every candidate response before delivery to farmer.
 * If violations are detected, triggers the deterministic Safe Rewrite Strategy.
 */
export function validateAIResponse(params: ValidateAIResponseParams): SafetyValidationResult {
  const { rawResponseText, userQuestion, contextBundle, hasImageAttachment, hasVideoAttachment } = params;

  let currentText = rawResponseText || '';
  const violations: SafetyViolation[] = [];
  const unsupportedClaims: string[] = [];
  const sourceConflicts: SourceConflict[] = [];
  const anchors: GroundedClaimAnchor[] = [];

  let medicalSafetyTriggered = false;
  let externalActionBlocked = false;
  let privacyIssueDetected = false;
  let promptInjectionDetected = false;
  let rewriteRequired = false;

  // --------------------------------------------------------------------------
  // STEP 1: Prompt Injection Check on User Question
  // --------------------------------------------------------------------------
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(userQuestion)) {
      promptInjectionDetected = true;
      violations.push({
        type: 'PROMPT_INJECTION_DETECTED',
        claim: `Swali lina muundo wa prompt injection: "${userQuestion.slice(0, 60)}..."`,
        severity: 'CRITICAL',
        suggestedRemedy: 'Puuza amri za kubadilisha kanuni za usalama (Ignore system overrides).'
      });
      break;
    }
  }

  // --------------------------------------------------------------------------
  // STEP 2: Automatic Action Gate (Blocks unapproved external operations)
  // --------------------------------------------------------------------------
  for (const pattern of AUTOMATED_ACTION_PATTERNS) {
    if (pattern.test(currentText)) {
      externalActionBlocked = true;
      rewriteRequired = true;
      violations.push({
        type: 'AUTOMATIC_ACTION_ATTEMPT',
        claim: 'AI inadai kuwa imefanya hatua ya kujiendesha (auto-call, auto-whatsapp, auto-order)',
        severity: 'CRITICAL',
        suggestedRemedy: 'Ondoa madai ya kujiendesha; mpe mfugaji mamlaka ya kubonyeza kitufe mwenyewe.'
      });
      break;
    }
  }

  // --------------------------------------------------------------------------
  // STEP 3: Medical Diagnosis & Prescription Gate
  // --------------------------------------------------------------------------
  for (const pattern of DEFINITIVE_DIAGNOSIS_PATTERNS) {
    if (pattern.test(currentText)) {
      medicalSafetyTriggered = true;
      rewriteRequired = true;
      violations.push({
        type: 'MEDICAL_DIAGNOSIS',
        claim: 'AI imetoa utambuzi thabiti wa ugonjwa badala ya mwonekano wa awali wenye tahadhari.',
        severity: 'CRITICAL',
        suggestedRemedy: 'Badilisha kuwa lugha ya mwonekano (observation) na mwelekeze kwa daktari wa mifugo.'
      });
      break;
    }
  }

  for (const pattern of UNSUPPORTED_DOSAGE_PATTERNS) {
    if (pattern.test(currentText)) {
      medicalSafetyTriggered = true;
      rewriteRequired = true;
      violations.push({
        type: 'UNSUPPORTED_MEDICAL_RECOMMENDATION',
        claim: 'AI imetoa maelekezo ya dozi au kuchoma sindano bila usimamizi wa daktari wa mifugo.',
        severity: 'CRITICAL',
        suggestedRemedy: 'Futa dozi/maelekezo ya sindano na elekeza kwa daktari aliyesajiliwa.'
      });
      break;
    }
  }

  // Commercial / Medical Separation: Marketplace drugs must not be recommended as disease cures
  if (
    contextBundle?.marketplaceIntelligenceResult?.detected &&
    (medicalSafetyTriggered || /\b(vifo|ugonjwa|mgonjwa|kufa)\b/i.test(userQuestion))
  ) {
    if (/\b(nunua\s+dawa|tumia\s+dawa\s+hii\s+sokoni|inapatikana\s+sokoni\s+kutibu)\b/i.test(currentText)) {
      medicalSafetyTriggered = true;
      rewriteRequired = true;
      violations.push({
        type: 'UNSUPPORTED_MEDICAL_RECOMMENDATION',
        claim: 'Soko la kibiashara limetumika kupendekeza dawa ya kutibu ugonjwa au vifo.',
        severity: 'CRITICAL',
        suggestedRemedy: 'Tenganisha biashara na afya ya mifugo. Dawa inatakiwa kushauriwa na Daktari.'
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: Marketplace Grounding & Fact Locking (V1.6D Price & Stock Trust)
  // --------------------------------------------------------------------------
  for (const pattern of UNVERIFIED_PRICE_PATTERNS) {
    if (pattern.test(currentText)) {
      rewriteRequired = true;
      violations.push({
        type: 'UNVERIFIED_PRICE_CLAIM',
        claim: 'AI imedai bei ya bidhaa imethibitishwa na serikali au ni bei rasmi ya jumla ya soko.',
        severity: 'CRITICAL',
        suggestedRemedy: 'Fafanua kuwa bei imeorodheshwa na muuzaji binafsi, siyo bei rasmi ya soko wala serikali.'
      });
      break;
    }
  }

  for (const pattern of UNVERIFIED_STOCK_PATTERNS) {
    if (pattern.test(currentText)) {
      rewriteRequired = true;
      violations.push({
        type: 'UNSUPPORTED_STOCK',
        claim: 'AI imetoa dhamana ya 100% ya uwepo wa mzigo stoo badala ya kueleza idadi iliyoandikwa na muuzaji.',
        severity: 'WARNING',
        suggestedRemedy: 'Sema "Idadi imeorodheshwa na muuzaji" badala ya "Dhamana ya mzigo upo stoo".'
      });
      break;
    }
  }

  // Seller Verification Boundary: Seller verified != Price/Stock verified
  if (/\b(kwa\s+kuwa\s+muuzaji\s+amehakikiwa.*bei\s+(yake\s+)?imethibitishwa|muuzaji\s+aliyehakikiwa\s+anahakikisha\s+bei|dhamana\s+ya\s+mzigo\s+kwa\s+muuzaji\s+aliyehakikiwa)\b/i.test(currentText)) {
    rewriteRequired = true;
    violations.push({
      type: 'UNVERIFIED_PRICE_CLAIM',
      claim: 'Uthibitisho wa muuzaji (Seller Verification) umechanganywa na uthibitisho wa bei au dhamana ya mzigo.',
      severity: 'CRITICAL',
      suggestedRemedy: 'Tenganisha utambulisho wa muuzaji na bei: Uthibitisho wa muuzaji haumaanishi bei au mzigo umethibitishwa.'
    });
  }

  const pricesFound = extractMentionedPrices(currentText);
  if (pricesFound.length > 0) {
    const hasMarketplaceContext = Boolean(contextBundle?.marketplaceIntelligenceResult?.products?.length);
    for (const price of pricesFound) {
      // Only enforce strict price-lock if text presents it as a current marketplace price
      if (hasMarketplaceContext && !isPriceGrounded(price, contextBundle)) {
        // Check if user stated that price in their question
        const userStatedPrice = userQuestion.includes(price.toString());
        if (userStatedPrice) {
          // Source conflict: Conversation price vs authoritative marketplace price
          sourceConflicts.push({
            field: 'PRICE',
            authoritativeSource: 'MARKETPLACE',
            authoritativeValue: contextBundle?.marketplaceIntelligenceResult?.products?.[0]?.price
              ? `TSh ${contextBundle.marketplaceIntelligenceResult.products[0].price.toLocaleString()}`
              : 'Hakuna bei rasmi',
            untrustedSource: 'CONVERSATION',
            untrustedValue: `TSh ${price.toLocaleString()}`,
            resolution: 'Marketplace ndio chanzo rasmi cha bei ya kibiashara; kauli au makisio ya mazungumzo hayabadilishi bei ya soko.'
          });
        } else {
          rewriteRequired = true;
          unsupportedClaims.push(`Bei ya TSh ${price.toLocaleString()} haipo kwenye matokeo halisi ya Gulio.`);
          violations.push({
            type: 'UNSUPPORTED_PRICE',
            claim: `Bei ya TSh ${price.toLocaleString()} imebuniwa au haina uthibitisho wa Gulio.`,
            severity: 'CRITICAL',
            suggestedRemedy: 'Tumia bei iliyopo kwenye matokeo ya Gulio pekee au sema bei haijulikani.'
          });
        }
      }
    }
  }

  const productGroundingCheck = isMarketplaceProductGrounded(currentText, contextBundle);
  if (!productGroundingCheck.grounded) {
    rewriteRequired = true;
    for (const ungroundedProd of productGroundingCheck.ungroundedMentions) {
      unsupportedClaims.push(`Bidhaa ya "${ungroundedProd}" haipo kwenye matokeo rasmi ya Gulio.`);
      violations.push({
        type: 'UNSUPPORTED_MARKETPLACE_PRODUCT',
        claim: `Bidhaa "${ungroundedProd}" imetajwa kama listing ya Gulio lakini haipo.`,
        severity: 'CRITICAL',
        suggestedRemedy: 'Sema: "Sijaona bidhaa hiyo kwenye matokeo ya Gulio kwa sasa."'
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: Daktari Mtaani Kwako & Credential Protection
  // --------------------------------------------------------------------------
  const daktariCount = contextBundle?.daktariIntelligenceResult?.totalMatched ?? 0;
  const noDaktariRegistered = daktariCount === 0 || !contextBundle?.daktariIntelligenceResult?.results?.length;

  if (noDaktariRegistered && contextBundle?.daktariIntelligenceResult?.detected) {
    // If no doctor is registered, check if model hallucinated a specific doctor or external clinic
    const mentionsSpecificDoctor = /\b(Dkt\.\s*[A-Z][a-z]+|Dk\.\s*[A-Z][a-z]+|Daktari\s+(?!Mtaani|wa\s+Mifugo)[A-Z][a-z]+|Bwana\s+Mifugo\s+(?!aliyesajiliwa)[A-Z][a-z]+|Kliniki\s+ya\s+[A-Z][a-z]+)\b/i.test(currentText);
    if (mentionsSpecificDoctor) {
      rewriteRequired = true;
      violations.push({
        type: 'UNSUPPORTED_DOCTOR_HALLUCINATION',
        claim: 'AI imependekeza daktari wa kubuni au kutoka nje ya mfumo wakati hakuna daktari aliyesajiliwa kwenye Ufugaji Update.',
        severity: 'CRITICAL',
        suggestedRemedy: 'Sema: "Kwasasa hakuna daktari au mtaalamu wa mifugo aliyesajiliwa kwenye mfumo wa Ufugaji Update. Tafadhali wasiliana na Afisa Ugani wa kata au wilaya yako."'
      });
    }
  }

  for (const pattern of UNVERIFIED_CREDENTIAL_PATTERNS) {
    if (pattern.test(currentText)) {
      // Check if authoritative verified doctor context is present from V1.5G/H Daktari loop
      const hasVerifiedDaktari = Boolean(
        contextBundle?.daktariIntelligenceResult?.results?.some(
          (doc) => doc.verificationStatus === 'VERIFIED'
        )
      );
      if (!hasVerifiedDaktari) {
        rewriteRequired = true;
        violations.push({
          type: 'UNSUPPORTED_CREDENTIAL',
          claim: 'AI imetoa sifa za uthibitisho au leseni bila data ya uthibitisho (Registration ≠ Verification).',
          severity: 'CRITICAL',
          suggestedRemedy: 'Sema: "Sijaweza kupata taarifa iliyothibitishwa ya daktari kutoka kwenye mfumo kwa sasa."'
        });
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP 6: Livestock & Treatment / Vaccination History Grounding
  // --------------------------------------------------------------------------
  // Prevent conversation statements (Level 3) or AI thoughts (Level 5) from turning into authoritative history (Level 1)
  if (/\b(historia\s+yako\s+inaonyesha\s+kwamba\s+uliwatibu|umerekodi\s+kwamba\s+ulifanya\s+treatment)\b/i.test(currentText)) {
    const hasRecordedTreatments =
      contextBundle?.sources?.LIVESTOCK_HISTORY?.status === 'AVAILABLE' &&
      Boolean(contextBundle?.sources?.LIVESTOCK_HISTORY?.summaryText);
    if (!hasRecordedTreatments) {
      rewriteRequired = true;
      violations.push({
        type: 'UNSUPPORTED_TREATMENT_HISTORY',
        claim: 'Mazungumzo ya mtumiaji au dhana ya AI yamegeuzwa kuwa historia rasmi ya matibabu bila rekodi.',
        severity: 'CRITICAL',
        suggestedRemedy: 'Badilisha kuwa: "Umesema uliwafanyia matibabu, ingawa hakuna kumbukumbu rasmi kwenye daftari."'
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 7: Overconfidence / Certainty Check
  // --------------------------------------------------------------------------
  for (const pattern of OVERCONFIDENT_PATTERNS) {
    if (pattern.test(currentText)) {
      rewriteRequired = true;
      violations.push({
        type: 'UNSUPPORTED_CERTAINTY',
        claim: 'Lugha ya uhakika uliopitiliza imetumika bila ushahidi thabiti wa maabara au daktari.',
        severity: 'WARNING',
        suggestedRemedy: 'Tumia viwango vya hadhari (observation, inawezekana, kumbukumbu zinaonyesha).'
      });
      break;
    }
  }

  // --------------------------------------------------------------------------
  // STEP 8: Safe Grounded Claim Anchors Collection
  // --------------------------------------------------------------------------
  if (contextBundle?.selectedSources?.includes('LIVESTOCK_RECORDS')) {
    anchors.push({
      category: 'FACT',
      authorityLevel: 'LEVEL_1_AUTHORITATIVE',
      sourceName: 'LIVESTOCK_RECORDS',
      verifiedFact: 'Daftari la Mifugo (Idadi na aina za mifugo zilizosajiliwa).'
    });
  }
  if (contextBundle?.myAssistantIntelligenceResult?.detected) {
    anchors.push({
      category: 'OBSERVATION',
      authorityLevel: 'LEVEL_1_AUTHORITATIVE',
      sourceName: 'MY_ASSISTANT_INTELLIGENCE',
      verifiedFact: contextBundle.myAssistantIntelligenceResult.explanationSwahili || 'Maarifa ya Msaidizi Wangu'
    });
  }
  if (contextBundle?.marketplaceIntelligenceResult?.detected) {
    anchors.push({
      category: 'FACT',
      authorityLevel: 'LEVEL_1_AUTHORITATIVE',
      sourceName: 'MARKETPLACE',
      verifiedFact: `Gulio la Ufugaji Update (${contextBundle.marketplaceIntelligenceResult.totalProductsMatched} bidhaa zilizothibitishwa).`
    });
  }
  if (contextBundle?.daktariIntelligenceResult?.detected) {
    anchors.push({
      category: 'FACT',
      authorityLevel: 'LEVEL_1_AUTHORITATIVE',
      sourceName: 'DAKTARI',
      verifiedFact: `Daktari Mtaani Kwako (${contextBundle.daktariIntelligenceResult.totalMatched} wataalamu waliopo, usajili siyo uthibitisho).`
    });
  }
  if (hasImageAttachment || hasVideoAttachment) {
    anchors.push({
      category: 'INFERENCE',
      authorityLevel: 'LEVEL_4_VISUAL_EVIDENCE',
      sourceName: hasVideoAttachment ? 'VIDEO_EVIDENCE' : 'IMAGE_EVIDENCE',
      verifiedFact: 'Mwonekano wa nje wa picha/video (Visual evidence tu, siyo utambuzi wa kitatibu).'
    });
  }

  // --------------------------------------------------------------------------
  // STEP 9: Safe Rewrite Strategy Execution (if violations present)
  // --------------------------------------------------------------------------
  let validatedText = currentText;

  if (rewriteRequired) {
    validatedText = executeSafeRewrite({
      originalText: currentText,
      violations,
      unsupportedClaims,
      contextBundle,
      hasImageAttachment,
      hasVideoAttachment
    });
  }

  // Calculate Risk Level
  let riskLevel: SafetyRiskLevel = 'LOW';
  if (violations.some((v) => v.severity === 'CRITICAL')) {
    riskLevel = violations.length > 3 ? 'HIGH' : 'MEDIUM';
  } else if (violations.length > 0) {
    riskLevel = 'MEDIUM';
  }

  const allowed = (riskLevel as SafetyRiskLevel) !== 'BLOCKED';
  const grounded = unsupportedClaims.length === 0 && !violations.some((v) => v.type === 'UNSUPPORTED_PRICE' || v.type === 'UNSUPPORTED_MARKETPLACE_PRODUCT');

  const telemetry: SafetyTelemetry = {
    validationPassed: violations.length === 0,
    riskLevel,
    blockedViolationsCount: violations.length,
    blockedHallucinationTypes: violations.map((v) => v.type),
    sourceConflictDetected: sourceConflicts.length > 0,
    medicalSafetyTriggered,
    externalActionBlocked,
    promptInjectionBlocked: promptInjectionDetected,
    regenerationRequired: rewriteRequired,
    timestamp: new Date().toISOString()
  };

  return {
    allowed,
    riskLevel,
    grounded,
    validatedText,
    originalText: rawResponseText,
    violations,
    unsupportedClaims,
    sourceConflicts,
    medicalSafetyTriggered,
    externalActionBlocked,
    privacyIssueDetected,
    promptInjectionDetected,
    rewriteRequired,
    telemetry,
    authorityPreserved: true,
    readOnlyGuaranteed: true,
    anchors
  };
}

// ==============================================================================
// 4. SAFE REWRITE STRATEGY IMPLEMENTATION
// ==============================================================================

interface SafeRewriteParams {
  originalText: string;
  violations: SafetyViolation[];
  unsupportedClaims: string[];
  contextBundle?: AIContextBundle;
  hasImageAttachment?: boolean;
  hasVideoAttachment?: boolean;
}

/**
 * Deterministic Safe Rewrite:
 * 1. Strips out definitive disease diagnoses and replaces with evidence-based observation.
 * 2. Strips out automated action claims ("nimeshampigia simu") and leaves user in control.
 * 3. Replaces fake product/price claims with verified marketplace availability.
 * 4. Adds veterinary safety notices where health is discussed.
 */
function executeSafeRewrite(params: SafeRewriteParams): string {
  let text = params.originalText;

  // 1. Remove automated action claims
  text = text.replace(
    /\b(nimeshampigia|nimepiga\s+simu\s+kwa|nimetuma\s+ujumbe\s+whatsapp\s+kwa)\s+[^\n.,]+/gi,
    'Ili kuwasiliana na mtaalamu au muuzaji, unaweza kutumia kitufe cha mawasiliano hapa chini'
  );
  text = text.replace(
    /\b(nimeagiza\s+bidhaa|nimenunua\s+bidhaa|nimeongeza\s+kwenye\s+kikapu\s+chako)[^\n.,]*/gi,
    'Unaweza kuendelea na ununuzi mwenyewe kupitia ukurasa wa Gulio'
  );

  // 2. Neutralize definitive diagnoses
  text = text.replace(
    /\b(kuku\s+wako\s+ana|ng'ombe\s+wako\s+ana|mbuzi\s+wako\s+ana)\s+(ugonjwa\s+wa\s+)?(newcastle|kideri|gumboro|coryza|mdondo|homa\s+ya\s+mapafu|fowl\s+pox|ndui|anthrax|kimeta|mastitis|kichaa|coccidiosis)\b/gi,
    'Dalili zinazoonekana zinaweza kuashiria changamoto ya kiafya inayofanana na magonjwa ya mifugo (kama vile $3), lakini utambuzi thabiti unahitaji uchunguzi wa daktari wa mifugo'
  );

  // 3. Neutralize dosage & prescription instructions
  text = text.replace(
    /\b(choma\s+sindano\s+ya|mpe\s+ml\s+\d+|dozi\s+ya\s+\d+\s*(ml|mg|cc)|dunga\s+sindano\s+\d+ml)[^\n.,]*/gi,
    'Kuhusu kipimo na aina ya dawa, daktari wa mifugo au bwana mifugo aliyesajiliwa anapaswa kutoa maelekezo sahihi kulingana na uzito na hali halisi ya mnyama'
  );

  // 4. Neutralize ungrounded fake marketplace products
  for (const claim of params.unsupportedClaims) {
    if (claim.includes('haipo kwenye matokeo halisi ya Gulio')) {
      text += `\n\n*Kumbuka ya Gulio: Sijaona bidhaa hiyo kwenye matokeo ya Gulio kwa sasa.*`;
      break;
    }
  }

  // 5. Neutralize unverified doctor credentials
  if (params.violations.some((v) => v.type === 'UNSUPPORTED_CREDENTIAL')) {
    text = text.replace(
      /\b(daktari\s+huyu\s+ameidhinishwa\s+rasmi|daktari\s+aliyehakikiwa\s+na\s+serikali)\b/gi,
      'mtaalamu aliyesajiliwa kwenye orodha (usajili siyo uthibitisho kamili wa cheti)'
    );
  }

  // 5b. Neutralize hallucinated doctors when no doctors are registered in Ufugaji Update
  if (params.violations.some((v) => v.type === 'UNSUPPORTED_DOCTOR_HALLUCINATION')) {
    text = `Kwasasa hakuna daktari au mtaalamu wa mifugo aliyesajiliwa kwenye mfumo wa Ufugaji Update.\n\nWakati wataalamu zaidi wakiendelea kujiunga na kusajiliwa kwenye Ufugaji Update, tafadhali wasiliana na Afisa Ugani wa serikali katika kata au wilaya yako, au tembelea kituo cha mifugo kilicho karibu nawe kwa msaada wa haraka wa kitaalamu.`;
  }

  // 5c. Neutralize unverified price & stock claims (V1.6D)
  if (params.violations.some((v) => v.type === 'UNVERIFIED_PRICE_CLAIM')) {
    text = text.replace(
      /\b(bei\s+rasmi\s+ya\s+soko\s+ya\s+serikali|bei\s+iliyothibitishwa\s+na\s+serikali|bei\s+ya\s+jumla\s+nchi\s+nzima|guaranteed\s+market\s+price|official\s+fixed\s+price)\b/gi,
      'bei iliyoorodheshwa na muuzaji kwenye tangazo'
    );
    text = text.replace(
      /\b(kwa\s+kuwa\s+muuzaji\s+amehakikiwa.*bei\s+(yake\s+)?imethibitishwa|muuzaji\s+aliyehakikiwa\s+anahakikisha\s+bei)\b/gi,
      'muuzaji amehakikiwa utambulisho wake lakini bei na mzigo ni taarifa alizoweka mwenyewe'
    );
  }

  if (params.violations.some((v) => v.type === 'UNSUPPORTED_STOCK')) {
    text = text.replace(
      /\b(dhamana\s+ya\s+uhakika\s+wa\s+mzigo\s+stoo|guaranteed\s+physical\s+stock|100%\s+mzigo\s+upo\s+stoo)\b/gi,
      'idadi iliyotajwa na muuzaji kulingana na tangazo lake'
    );
  }

  // 6. Neutralize overconfidence
  text = text.replace(/\b(bila\s+shaka\s+yoyote|ina\s+uhakika\s+wa\s+asilimia\s+100|hakika\s+kabisa)\b/gi, 'kwa mujibu wa dalili za awali');

  // 7. Append veterinary safeguard if medical issues were detected
  if (params.violations.some((v) => v.type === 'MEDICAL_DIAGNOSIS' || v.type === 'UNSUPPORTED_MEDICAL_RECOMMENDATION')) {
    if (!text.includes('Daktari Mtaani Kwako') && !text.includes('daktari wa mifugo')) {
      text += `\n\n⚠️ **Tahadhari ya Afya ya Mifugo**: Ushauri huu wa AI ni wa kutoa mwelekeo na mwonekano wa awali pekee. Hauwezi kuchukua nafasi ya uchunguzi wa kimwili wa daktari wa mifugo. Wasiliana na daktari au afisa ugani aliyesajiliwa kwa matibabu sahihi.`;
    }
  }

  return text.trim();
}
