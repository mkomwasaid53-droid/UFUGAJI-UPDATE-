/**
 * V1.3B — IMAGE → MARKETPLACE QUERY
 * Marketplace Category Taxonomy Mapper
 *
 * Maps visual product concepts and attributes to canonical Marketplace categories & subcategories.
 * Strict rules:
 * - Must strictly use canonical MARKETPLACE_CATEGORIES.
 * - Never invents non-existent categories.
 * - If no suitable category exists, falls back to a broader category (e.g. 'Vifaa vya Ufugaji') or null.
 * - Does NOT convert sick animal visual observations to medicine categories (veterinary safety).
 */

import { MARKETPLACE_CATEGORIES } from '../data/marketplaceData';

export interface CategoryMappingResult {
  category: string | null;
  subcategory: string | null;
  livestockUse: string | null;
  canonicalConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TaxonomyRule {
  patterns: RegExp[];
  category: string;
  subcategory?: string;
  defaultLivestock?: string;
  isMedical?: boolean;
}

const TAXONOMY_RULES: TaxonomyRule[] = [
  // 1. Incubators (Mashine za Kutotolesha)
  {
    patterns: [
      /\bincubator\b/i,
      /\binkubeta\b/i,
      /\bmashine ya kutotolesha\b/i,
      /\bmashine ya kutotoa\b/i,
      /\begg incubator\b/i,
      /\bkutotolesha mayai\b/i,
      /\bhatchery machine\b/i
    ],
    category: 'Vifaa vya Ufugaji',
    subcategory: 'Mashine za Kutotolesha (Incubators)',
    defaultLivestock: 'chicken'
  },

  // 2. Feeders (Vyombo vya Chakula)
  {
    patterns: [
      /\bfeeder\b/i,
      /\bfeeders\b/i,
      /\bchombo cha chakula\b/i,
      /\bvyombo vya chakula\b/i,
      /\bkulishia kuku\b/i,
      /\bkulishia mifugo\b/i,
      /\bfeed trough\b/i,
      /\bfeed bucket\b/i
    ],
    category: 'Vifaa vya Ufugaji',
    subcategory: 'Vyombo vya Chakula (Feeders)'
  },

  // 3. Drinkers (Vyombo vya Maji)
  {
    patterns: [
      /\bdrinker\b/i,
      /\bdrinkers\b/i,
      /\bnipple drinker\b/i,
      /\bbell drinker\b/i,
      /\bchombo cha maji\b/i,
      /\bvyombo vya maji\b/i,
      /\bkinywesheo\b/i,
      /\bvinywesheo\b/i,
      /\bwaterer\b/i,
      /\bwater trough\b/i
    ],
    category: 'Vifaa vya Ufugaji',
    subcategory: 'Vyombo vya Maji (Drinkers)'
  },

  // 4. Brooders and Heat Equipment (Vifaa vya Joto)
  {
    patterns: [
      /\bbrooder\b/i,
      /\bbruda\b/i,
      /\bchombo cha joto\b/i,
      /\bvifaa vya joto\b/i,
      /\btaa ya joto\b/i,
      /\bheat lamp\b/i,
      /\binfrared bulb\b/i,
      /\bheating plate\b/i
    ],
    category: 'Vifaa vya Ufugaji',
    subcategory: 'Vifaa vya Joto (Brooders & Bulbs)'
  },

  // 5. Cages and Housing (Mabanda & Vizimba)
  {
    patterns: [
      /\bcage\b/i,
      /\bcages\b/i,
      /\bkizimba\b/i,
      /\bvizimba\b/i,
      /\bwire mesh\b/i,
      /\bngome ya kuku\b/i,
      /\bbanda la chuma\b/i,
      /\bbattery cage\b/i
    ],
    category: 'Vifaa vya Ufugaji',
    subcategory: 'Mabanda & Vizimba (Cages)'
  },

  // 6. Farm & Milking Equipment (Vipima Uzito na Vifaa vya Shambani)
  {
    patterns: [
      /\bmilking machine\b/i,
      /\bmashine ya kukamua\b/i,
      /\bkukamulia maziwa\b/i,
      /\bmashine ya maziwa\b/i,
      /\bchaff cutter\b/i,
      /\bmashine ya kukata majani\b/i,
      /\bchopper machine\b/i,
      /\bweighing scale\b/i,
      /\bmizani\b/i,
      /\bkipima uzito\b/i
    ],
    category: 'Vifaa vya Ufugaji',
    subcategory: 'Vipima Uzito na Vifaa vya Shambani'
  },

  // 7. Livestock Feeds (Chakula cha Mifugo)
  {
    patterns: [
      /\bchakula cha kuku\b/i,
      /\bpoultry feed\b/i,
      /\bbroiler starter\b/i,
      /\bgrowers mash\b/i,
      /\blayers mash\b/i,
      /\bfinisher pellets\b/i,
      /\bmashudu\b/i,
      /\bpumba\b/i,
      /\bnyasi za malisho\b/i,
      /\bhay\b/i,
      /\bsilage\b/i,
      /\bconcentrate\b/i,
      /\bpremix\b/i
    ],
    category: 'Chakula cha Mifugo'
  },

  // 8. Chicks (Vifaranga)
  {
    patterns: [
      /\bvifaranga\b/i,
      /\bkifaranga\b/i,
      /\bdoc\b/i,
      /\bday old chicks\b/i,
      /\bkuroiler vifaranga\b/i,
      /\bsasso vifaranga\b/i,
      /\bvifaranga vya kienyeji\b/i,
      /\bvifaranga vya mayai\b/i,
      /\bvifaranga vya nyama\b/i
    ],
    category: 'Vifaranga'
  },

  // 9. Eggs (Mayai)
  {
    patterns: [
      /\bmayai ya mbegu\b/i,
      /\bhatching eggs\b/i,
      /\bfertilized eggs\b/i,
      /\bmayai ya kienyeji\b/i,
      /\btable eggs\b/i,
      /\btray ya mayai\b/i,
      /\bmayai ya kware\b/i
    ],
    category: 'Mayai'
  },

  // 10. Adult Chickens (Kuku)
  {
    patterns: [
      /\bkuku wa kienyeji\b/i,
      /\bjogoo\b/i,
      /\bmajogoo\b/i,
      /\bmitetea\b/i,
      /\bpoint of lay\b/i,
      /\bbroilers\b/i,
      /\bbata\b/i,
      /\bkanga\b/i
    ],
    category: 'Kuku',
    defaultLivestock: 'chicken'
  },

  // 11. Goats and Sheep (Mbuzi & Kondoo)
  {
    patterns: [
      /\bmbuzi wa maziwa\b/i,
      /\bmbuzi wa nyama\b/i,
      /\bmbuzi wa mbegu\b/i,
      /\bkondoo\b/i,
      /\bboer\b/i,
      /\bsaanen\b/i
    ],
    category: 'Mbuzi',
    defaultLivestock: 'goat'
  },

  // 12. Cattle (Ng'ombe)
  {
    patterns: [
      /\bng'ombe wa maziwa\b/i,
      /\bngombe wa maziwa\b/i,
      /\bng'ombe wa nyama\b/i,
      /\bndama\b/i,
      /\bfahari wa mbegu\b/i,
      /\bfriesian\b/i,
      /\bayrshire\b/i
    ],
    category: 'Ng\'ombe',
    defaultLivestock: 'cattle'
  },

  // 13. Pigs (Nguruwe)
  {
    patterns: [
      /\bvitoto vya nguruwe\b/i,
      /\bnguruwe wa mbegu\b/i,
      /\bnguruwe wa nyama\b/i,
      /\bpiglets\b/i,
      /\bnguruwe\b/i
    ],
    category: 'Nguruwe',
    defaultLivestock: 'pig'
  },

  // 14. Rabbits (Sungura)
  {
    patterns: [
      /\bsungura wa mbegu\b/i,
      /\bsungura wa nyama\b/i,
      /\bsungura\b/i,
      /\bvizimba vya sungura\b/i
    ],
    category: 'Sungura',
    defaultLivestock: 'rabbit'
  },

  // 15. Fish (Samaki)
  {
    patterns: [
      /\bvifaranga vya sato\b/i,
      /\btilapia fingerlings\b/i,
      /\bcatfish fingerlings\b/i,
      /\bkambale\b/i,
      /\bchakula cha samaki\b/i,
      /\bpond liner\b/i,
      /\bbwawa la samaki\b/i
    ],
    category: 'Samaki',
    defaultLivestock: 'fish'
  },

  // 16. Beekeeping (Nyuki)
  {
    patterns: [
      /\bmzinga wa nyuki\b/i,
      /\bmizinga ya nyuki\b/i,
      /\bsuti ya nyuki\b/i,
      /\bmoshi wa nyuki\b/i,
      /\basali safi\b/i
    ],
    category: 'Nyuki / Ufugaji wa Nyuki',
    defaultLivestock: 'bee'
  },

  // 17. Medical products (Dawa za Mifugo) - explicitly restricted for visual sick animals!
  {
    patterns: [
      /\bdawa ya minyoo\b/i,
      /\bchanjo ya\b/i,
      /\bvitamini ya mifugo\b/i,
      /\bantibiotics za mifugo\b/i
    ],
    category: 'Dawa za Mifugo',
    isMedical: true
  }
];

/**
 * Maps a visual product concept or user text to canonical Marketplace category and subcategory.
 */
export function mapToCanonicalCategory(
  productConcept: string,
  userText?: string,
  options?: {
    isMedicalSafetyRestricted?: boolean;
    primaryLivestock?: string;
  }
): CategoryMappingResult {
  const combinedText = `${productConcept} ${userText || ''}`.toLowerCase();

  // Check matching rules
  for (const rule of TAXONOMY_RULES) {
    if (rule.isMedical && options?.isMedicalSafetyRestricted) {
      // Guarded by veterinary safety: skip medical category mapping for sick animal observations
      continue;
    }

    for (const pattern of rule.patterns) {
      if (pattern.test(combinedText)) {
        // Validate against canonical categories
        const canonicalCat = MARKETPLACE_CATEGORIES.find((c) => c.name === rule.category);
        if (!canonicalCat) continue;

        let matchedSub: string | null = null;
        if (rule.subcategory && canonicalCat.subcategories.includes(rule.subcategory)) {
          matchedSub = rule.subcategory;
        }

        return {
          category: canonicalCat.name,
          subcategory: matchedSub,
          livestockUse: rule.defaultLivestock || options?.primaryLivestock || null,
          canonicalConfidence: 'HIGH'
        };
      }
    }
  }

  // Generic fallback if equipment/vifaa mentioned
  if (/vifaa|mashine|chombo|kifaa|machine|equipment|tool/i.test(combinedText)) {
    return {
      category: 'Vifaa vya Ufugaji',
      subcategory: null,
      livestockUse: options?.primaryLivestock || null,
      canonicalConfidence: 'MEDIUM'
    };
  }

  // Safe fallback: null (do not invent arbitrary category)
  return {
    category: null,
    subcategory: null,
    livestockUse: options?.primaryLivestock || null,
    canonicalConfidence: 'LOW'
  };
}
