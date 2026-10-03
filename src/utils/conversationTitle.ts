/**
 * Deterministic Swahili Conversation Title Generator for UFUGAJI UPDATE AI Assistant.
 * Generates concise, accurate, and context-aware titles without making external AI calls.
 */

export function generateConversationTitle(question: string): string {
  if (!question || typeof question !== 'string') {
    return 'Mazungumzo ya Mifugo';
  }

  const cleanText = question.trim();
  const lower = cleanText.toLowerCase();

  // Guard against empty / non-meaningful strings
  if (lower.length === 0) {
    return 'Mazungumzo ya Mifugo';
  }

  // 1. Specific High-Priority Matchers

  // Pattern: Ukaguzi wa Picha (Image Inspections)
  if (/picha|photo|image/.test(lower)) {
    if (/kuku|vifaranga/.test(lower)) return 'Ukaguzi wa Picha: Kuku';
    if (/ng['’]?ombe|ndama|ng'ombe/.test(lower)) return "Ukaguzi wa Picha: Ng'ombe";
    if (/mbuzi/.test(lower)) return 'Ukaguzi wa Picha: Mbuzi';
    if (/nguruwe/.test(lower)) return 'Ukaguzi wa Picha: Nguruwe';
    if (/sungura/.test(lower)) return 'Ukaguzi wa Picha: Sungura';
    if (/ugonjwa|dalili|dawa|vidonda|kuvimba|afya/.test(lower)) return 'Ukaguzi wa Picha: Afya';
    if (/banda|mabanda|usafi/.test(lower)) return 'Ukaguzi wa Picha: Banda';
    return 'Ukaguzi wa Picha ya Mifugo';
  }

  // Pattern: Vifo / Kufa / Wanakufa (Mortality & Deaths)
  const isDeath = /kufa|wanakufa|zinakufa|kifo|vifo|wamekufa|kufariki|wanafariki/.test(lower);
  if (isDeath) {
    if (/vifaranga|chicks/.test(lower)) return 'Vifo vya Vifaranga';
    if (/kuku|kuchi|sasso|kienyeji|broiler|layer|jogoo|tetee/.test(lower)) return 'Vifo vya Kuku';
    if (/ng['’]?ombe|ndama|ng'ombe/.test(lower)) return "Vifo vya Ng'ombe";
    if (/mbuzi/.test(lower)) return 'Vifo vya Mbuzi';
    if (/kondoo/.test(lower)) return 'Vifo vya Kondoo';
    if (/nguruwe/.test(lower)) return 'Vifo vya Nguruwe';
    if (/sungura/.test(lower)) return 'Vifo vya Sungura';
    if (/samaki/.test(lower)) return 'Vifo vya Samaki';
    return 'Vifo vya Mifugo';
  }

  // Pattern: Dhaifu / Kudhoofika / Kukonda / Kulala chini (Weakness / Illness signs)
  const isWeak = /dhaifu|kukonda|wamekonda|dhoofu|ha(wa)?li|hanywi|ulemavu|kilema|kupooza/.test(lower);
  if (isWeak) {
    if (/ng['’]?ombe|ndama|ng'ombe/.test(lower)) return "Ng'ombe Dhaifu";
    if (/kuku|vifaranga/.test(lower)) return 'Kuku Dhaifu';
    if (/mbuzi/.test(lower)) return 'Mbuzi Dhaifu';
    if (/kondoo/.test(lower)) return 'Kondoo Dhaifu';
    if (/nguruwe/.test(lower)) return 'Nguruwe Dhaifu';
    if (/sungura/.test(lower)) return 'Sungura Dhaifu';
    return 'Mifugo Dhaifu';
  }

  // Pattern: Kuongeza Uzalishaji (Mayai / Maziwa / Uzito)
  const isIncrease = /ongeza|kuongeza|ongezeko|kuinua|kuboresha/.test(lower);
  if (isIncrease) {
    if (/mayai|yai|kutaga|utagaji/.test(lower)) return 'Kuongeza Uzalishaji wa Mayai';
    if (/maziwa|kukamua/.test(lower)) return 'Kuongeza Uzalishaji wa Maziwa';
    if (/uzito|kunenepesha|kunona/.test(lower)) return 'Kunenepesha Mifugo';
    if (/faida|mauzo|mapato/.test(lower)) return 'Kuongeza Faida ya Mifugo';
  }

  // Pattern: Mayai na Utagaji (Egg Production)
  if (/mayai|yai|kutaga|hawatagi|haitagi|utagaji|yamepungua/.test(lower)) {
    if (/kupungua|pungua|hawatagi|kudondoka/.test(lower)) return 'Kupungua kwa Mayai';
    return 'Uzalishaji wa Mayai';
  }

  // Pattern: Maziwa (Milk Production)
  if (/maziwa|kukamua|kiwele|chuchu|mastitis/.test(lower)) {
    if (/mastitis|chuchu kuvimba|ugonjwa/.test(lower)) return 'Ugonjwa wa Maziwa na Kiwele';
    return 'Uzalishaji wa Maziwa';
  }

  // Pattern: Chanjo na Kinga (Vaccination & Prevention)
  if (/chanjo|kuchanja|ratiba ya chanjo|kinga|gumboro|newcastle|kideri|mdondo|ndui|marek|anthrax|kimeta|cbpp|ccpp/.test(lower)) {
    if (/kuku|vifaranga/.test(lower)) return 'Chanjo za Kuku';
    if (/ng['’]?ombe|ndama|ng'ombe/.test(lower)) return "Chanjo za Ng'ombe";
    if (/mbuzi|kondoo/.test(lower)) return 'Chanjo za Mbuzi';
    if (/nguruwe/.test(lower)) return 'Chanjo za Nguruwe';
    return 'Ratiba na Chanjo za Mifugo';
  }

  // Pattern: Lishe na Ulishaji (Feeds & Nutrition)
  if (/chakula|lishe|kulisha|ulishaji|pumba|mashudu|starter|grower|finisher|layer mash|formula|kuchanganya chakula|hydroponics|azolla|malisho|nyasi/.test(lower)) {
    if (/kuku|vifaranga/.test(lower)) return 'Ulishaji wa Kuku';
    if (/ng['’]?ombe|ndama|ng'ombe/.test(lower)) return "Lishe ya Ng'ombe";
    if (/mbuzi|kondoo/.test(lower)) return 'Malisho ya Mbuzi na Kondoo';
    if (/nguruwe/.test(lower)) return 'Chakula cha Nguruwe';
    if (/samaki/.test(lower)) return 'Chakula cha Samaki';
    return 'Lishe na Ulishaji wa Mifugo';
  }

  // Pattern: Mabanda na Usafi (Housing & Hygiene)
  if (/banda|mabanda|ujenzi|sakafu|maranda|usafi|hewa|joto|baridi/.test(lower)) {
    if (/kuku/.test(lower)) return 'Banda Bora la Kuku';
    if (/ng['’]?ombe|ng'ombe/.test(lower)) return "Banda la Ng'ombe";
    if (/mbuzi/.test(lower)) return 'Banda la Mbuzi';
    if (/nguruwe/.test(lower)) return 'Banda la Nguruwe';
    return 'Ujenzi na Usafi wa Banda';
  }

  // Pattern: Magonjwa na Matibabu (Diseases & Symptoms)
  if (/kuharisha|mafua|kukohoa|kupumua|ugonjwa|magonjwa|dawa|kutibu|tiba|vidonda|kuvimba|minyoo|kupe|viroboto/.test(lower)) {
    if (/kuku|vifaranga/.test(lower)) return 'Magonjwa na Tiba ya Kuku';
    if (/ng['’]?ombe|ng'ombe/.test(lower)) return "Matibabu ya Ng'ombe";
    if (/mbuzi/.test(lower)) return 'Matibabu ya Mbuzi';
    if (/nguruwe/.test(lower)) return 'Matibabu ya Nguruwe';
    if (/sungura/.test(lower)) return 'Matibabu ya Sungura';
    return 'Matibabu na Afya ya Mifugo';
  }

  // Pattern: Utotoaji na Incubator (Incubation & Hatching)
  if (/incubator|kutotolesha|kuangua|kutotoa|vifaranga|mashine ya mayai/.test(lower)) {
    return 'Utotoaji na Vifaranga';
  }

  // Pattern: Uzazi na Mbegu (Breeding & Genetics)
  if (/mimba|kuzaa|uzazi|kupandikiza|dume|artificial insemination|mbegu/.test(lower)) {
    if (/ng['’]?ombe|ng'ombe/.test(lower)) return "Uzazi wa Ng'ombe";
    if (/mbuzi/.test(lower)) return 'Uzazi wa Mbuzi';
    if (/nguruwe/.test(lower)) return 'Uzazi wa Nguruwe';
    return 'Uzazi na Mbegu za Mifugo';
  }

  // Pattern: Soko, Bei na Mauzo (Market & Business)
  if (/bei|soko|kuuza|mauzo|faida|biashara|gharama|mtaji/.test(lower)) {
    if (/kuku/.test(lower)) return 'Soko na Bei ya Kuku';
    if (/mayai/.test(lower)) return 'Soko la Mayai';
    if (/ng['’]?ombe|ng'ombe/.test(lower)) return "Biashara ya Ng'ombe";
    return 'Soko na Biashara ya Mifugo';
  }

  // Pattern: Rekodi na Msaidizi Wangu
  if (/rekodi|idadi|hesabu|kundi|mifugo yangu|nimebakiwa|wamepungua/.test(lower)) {
    return 'Usimamizi wa Mifugo Yangu';
  }

  // 2. Animal-Specific Fallbacks
  if (/kuku|kuchi|sasso|kienyeji|broiler|layer/.test(lower)) return 'Ufugaji wa Kuku';
  if (/ng['’]?ombe|ndama|ng'ombe/.test(lower)) return "Ufugaji wa Ng'ombe";
  if (/mbuzi/.test(lower)) return 'Ufugaji wa Mbuzi';
  if (/kondoo/.test(lower)) return 'Ufugaji wa Kondoo';
  if (/nguruwe/.test(lower)) return 'Ufugaji wa Nguruwe';
  if (/sungura/.test(lower)) return 'Ufugaji wa Sungura';
  if (/samaki/.test(lower)) return 'Ufugaji wa Samaki';
  if (/nyuki/.test(lower)) return 'Ufugaji wa Nyuki';
  if (/bata/.test(lower)) return 'Ufugaji wa Bata';
  if (/kanga/.test(lower)) return 'Ufugaji wa Kanga';

  // 3. Fallback: Take first 4-5 words if readable, or standard fallback
  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 4) {
    const candidate = words.join(' ');
    // Ensure no special tokens or markdown
    const sanitized = candidate.replace(/[^\w\s\u00C0-\u017F'-]/gi, '').trim();
    if (sanitized.length >= 4 && sanitized.length <= 32) {
      return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }
  }

  return 'Mazungumzo ya Mifugo';
}
