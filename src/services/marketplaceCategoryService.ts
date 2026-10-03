/**
 * V1.7A — Governed Marketplace Category Service
 * Phase 6: Marketplace Governance
 *
 * This service implements the authoritative category governance engine for Ufugaji Update.
 *
 * Core Principles:
 * 1. Marketplace categories are platform-governed data.
 * 2. Categories do NOT belong to sellers.
 * 3. Seller free-text, AI, and images/videos must NOT create categories.
 * 4. Only authorized admin/governance workflows can create, edit, or deactivate categories.
 * 5. Category IDs are stable, authoritative identifiers (not category names).
 * 6. Marketplace domain remains strictly livestock and agriculture.
 */

import {
  GovernedCategory,
  CategoryType,
  CategoryStatus,
  CategoryHierarchyNode,
  CategoryValidationResult,
  ProductCategoryTrustResolution,
  CreateCategoryInput,
  UpdateCategoryInput
} from '../types/marketplaceCategory';
import { MarketplaceProduct } from '../types/marketplace';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';

const LOCAL_CATEGORIES_CACHE_KEY = 'ufugaji_governed_categories_v1_7a';

// ---------------------------------------------------------------------------
// 1. AUTHORITATIVE INITIAL GOVERNED TAXONOMY (SEED DATA)
// ---------------------------------------------------------------------------

export const SEED_GOVERNED_CATEGORIES: GovernedCategory[] = [
  // --- 1. Dawa za Mifugo (Veterinary Products) ---
  {
    categoryId: 'cat_dawa_za_mifugo',
    name: 'Dawa za Mifugo',
    slug: 'dawa-za-mifugo',
    description: 'Chanjo, viua vijasumu (antibiotics), dawa za minyoo, na vitamini za mifugo.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    iconName: 'Pill',
    livestockTypesAllowed: ['Kuku', 'Ng\'ombe', 'Mbuzi', 'Kondoo', 'Nguruwe'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_chanjo',
    name: 'Chanjo (Vaccines)',
    slug: 'chanjo-vaccines',
    description: 'Chanjo za kideri, gumboro, ndui, na magonjwa mengine ya mifugo.',
    parentCategoryId: 'cat_dawa_za_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_antibiotics',
    name: 'Viua Vijasumu (Antibiotics)',
    slug: 'viua-vijasumu-antibiotics',
    description: 'Dawa za kutibu maambukizi ya bakteria kwa mifugo.',
    parentCategoryId: 'cat_dawa_za_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vitamini',
    name: 'Vitamini & Madini',
    slug: 'vitamini-madini',
    description: 'Virutubisho vya vitamini na madini ya kuongeza kinga na ukuaji.',
    parentCategoryId: 'cat_dawa_za_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_minyoo',
    name: 'Dawa za Minyoo (Dewormers)',
    slug: 'dawa-za-minyoo-dewormers',
    description: 'Dawa za kuua minyoo ya ndani kwa mifugo yote.',
    parentCategoryId: 'cat_dawa_za_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kuogesha',
    name: 'Dawa za Kuogesha (Acaricides)',
    slug: 'dawa-za-kuogesha-acaricides',
    description: 'Dawa za kuua kupe, viroboto na wadudu wa nje.',
    parentCategoryId: 'cat_dawa_za_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vifaa_tiba',
    name: 'Vifaa vya Matibabu',
    slug: 'vifaa-vya-matibabu',
    description: 'Sindano, vipima joto, na vifaa vya afya ya mifugo.',
    parentCategoryId: 'cat_dawa_za_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 6,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 2. Chakula cha Mifugo (Feeds) ---
  {
    categoryId: 'cat_chakula_cha_mifugo',
    name: 'Chakula cha Mifugo',
    slug: 'chakula-cha-mifugo',
    description: 'Mashudu, pumba, starter, growers, layers mash, broiler finisher na virutubisho.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    iconName: 'Wheat',
    livestockTypesAllowed: ['Kuku', 'Ng\'ombe', 'Mbuzi', 'Nguruwe', 'Samaki'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_chakula_kuku',
    name: 'Chakula cha Kuku (Poultry Feeds)',
    slug: 'chakula-cha-kuku-poultry-feeds',
    description: 'Starter crumbs, growers mash, layers mash, broiler finisher na feeds zote za kuku.',
    parentCategoryId: 'cat_chakula_cha_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_chakula_ngombe',
    name: 'Chakula cha Ng\'ombe (Dairy/Beef Feeds)',
    slug: 'chakula-cha-ngombe-dairy-beef-feeds',
    description: 'Dairy meal, pumba za mahindi, na chakula cha kunenepesha ng\'ombe.',
    parentCategoryId: 'cat_chakula_cha_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mashudu',
    name: 'Mashudu ya Alizeti/Pamba',
    slug: 'mashudu-ya-alizeti-pamba',
    description: 'Mashudu ya alizeti na pamba yenye protini kwa uchanganyaji wa chakula.',
    parentCategoryId: 'cat_chakula_cha_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_pumba',
    name: 'Pumba za Mahindi/Mchele',
    slug: 'pumba-za-mahindi-mchele',
    description: 'Pumba safi za mahindi, mpunga, na ngano kwa mifugo.',
    parentCategoryId: 'cat_chakula_cha_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_nyasi_malisho',
    name: 'Nyasi & Malisho ya Mifugo',
    slug: 'nyasi-malisho-ya-mifugo',
    description: 'Marando ya napier, brachiaria, silaji, na mabua yaliyofungwa marobota.',
    parentCategoryId: 'cat_chakula_cha_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_virutubisho',
    name: 'Virutubisho (Premix/Concentrate)',
    slug: 'virutubisho-premix-concentrate',
    description: 'Broiler premix, layers premix, DCP, chokaa ya mifugo na amino acids.',
    parentCategoryId: 'cat_chakula_cha_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 6,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 3. Vifaa vya Ufugaji (Equipment) ---
  {
    categoryId: 'cat_vifaa_vya_ufugaji',
    name: 'Vifaa vya Ufugaji',
    slug: 'vifaa-vya-ufugaji',
    description: 'Vyombo vya maji, vyombo vya chakula, mashine za kutotolesha, na vizimba.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    iconName: 'Wrench',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vyombo_maji',
    name: 'Vyombo vya Maji (Drinkers)',
    slug: 'vyombo-vya-maji-drinkers',
    description: 'Auto-drinkers, nipple drinkers, na vyombo vya kawaida vya maji.',
    parentCategoryId: 'cat_vifaa_vya_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vyombo_chakula',
    name: 'Vyombo vya Chakula (Feeders)',
    slug: 'vyombo-vya-chakula-feeders',
    description: 'Feeders za bati na plastiki za ukubwa tofauti kwa kuku na mifugo.',
    parentCategoryId: 'cat_vifaa_vya_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_incubators',
    name: 'Mashine za Kutotolesha (Incubators)',
    slug: 'mashine-za-kutotolesha-incubators',
    description: 'Mashine za moja kwa moja (automatic) na manual za mayai 50 hadi 5000.',
    parentCategoryId: 'cat_vifaa_vya_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vizimba',
    name: 'Mabanda & Vizimba (Cages)',
    slug: 'mabanda-vizimba-cages',
    description: 'Battery cages za kuku wa mayai, vizimba vya sungura na vifaa vya mabanda.',
    parentCategoryId: 'cat_vifaa_vya_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_brooders',
    name: 'Vifaa vya Joto (Brooders & Bulbs)',
    slug: 'vifaa-vya-joto-brooders-bulbs',
    description: 'Taa za joto (infrared), gesi brooders na vyungu vya joto kwa vifaranga.',
    parentCategoryId: 'cat_vifaa_vya_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vipima_uzito',
    name: 'Vipima Uzito na Vifaa vya Shambani',
    slug: 'vipima-uzito-na-vifaa-vya-shambani',
    description: 'Mizani ya kupima mifugo, dehorners, tag applicators na vifaa vya kazi.',
    parentCategoryId: 'cat_vifaa_vya_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 6,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 4. Vifaranga (Chicks / Poultry DOC) ---
  {
    categoryId: 'cat_vifaranga',
    name: 'Vifaranga',
    slug: 'vifaranga',
    description: 'Vifaranga wa kienyeji, sasso, kuroiler, layers, na broiler wa siku 1 au zaidi.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    iconName: 'Egg',
    livestockTypesAllowed: ['Kuku', 'Bata', 'Kanga', 'Kware'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vifaranga_siku_1',
    name: 'Vifaranga vya Siku 1 (DOC)',
    slug: 'vifaranga-vya-siku-1-doc',
    description: 'Vifaranga wa siku moja kutoka mashamba yaliyothibitishwa.',
    parentCategoryId: 'cat_vifaranga',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vifaranga_wiki_2_4',
    name: 'Vifaranga vya Wiki 2 - 4',
    slug: 'vifaranga-vya-wiki-2-4',
    description: 'Vifaranga waliomaliza chanjo za kwanza na kuanza kujitegemea.',
    parentCategoryId: 'cat_vifaranga',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_chotara',
    name: 'Kuku Chotara (Kuroiler/Sasso)',
    slug: 'kuku-chotara-kuroiler-sasso',
    description: 'Vifaranga chotara wa sasso na kuroiler wenye ustahimilivu mkubwa.',
    parentCategoryId: 'cat_vifaranga',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kienyeji_halisi',
    name: 'Vifaranga wa Kienyeji Halisi',
    slug: 'vifaranga-wa-kienyeji-halisi',
    description: 'Vifaranga asilia wa kuku wa kienyeji kwa ufugaji huria.',
    parentCategoryId: 'cat_vifaranga',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_layers_doc',
    name: 'Vifaranga vya Mayai (Layers DOC)',
    slug: 'vifaranga-vya-mayai-layers-doc',
    description: 'Vifaranga wa kike wa kutaga mayai ya kibiashara.',
    parentCategoryId: 'cat_vifaranga',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_broiler_doc',
    name: 'Vifaranga vya Nyama (Broiler DOC)',
    slug: 'vifaranga-vya-nyama-broiler-doc',
    description: 'Vifaranga wa nyama wanaokua haraka kwa wiki 4-6.',
    parentCategoryId: 'cat_vifaranga',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 6,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 5. Mayai (Eggs) ---
  {
    categoryId: 'cat_mayai',
    name: 'Mayai',
    slug: 'mayai',
    description: 'Mayai ya mezani, mayai ya mbegu (fertilized eggs), na mayai ya kware.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 5,
    iconName: 'CircleDot',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mayai_mbegu',
    name: 'Mayai ya Mbegu (Fertilized Hatching Eggs)',
    slug: 'mayai-ya-mbegu-fertilized-hatching-eggs',
    description: 'Mayai yenye mbegu kwa ajili ya kutotolesha kwenye incubators.',
    parentCategoryId: 'cat_mayai',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mayai_kienyeji',
    name: 'Mayai ya Kienyeji ya Mezani',
    slug: 'mayai-ya-kienyeji-ya-mezani',
    description: 'Mayai asilia ya kienyeji kwa chakula na lishe.',
    parentCategoryId: 'cat_mayai',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mayai_kisasa',
    name: 'Mayai ya Kisasa ya Mezani (Table Eggs)',
    slug: 'mayai-ya-kisasa-ya-mezani-table-eggs',
    description: 'Mayai ya kisasa ya layers kwa matumizi ya hoteli na majumbani.',
    parentCategoryId: 'cat_mayai',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mayai_kware',
    name: 'Mayai ya Kware / Kanga',
    slug: 'mayai-ya-kware-kanga',
    description: 'Mayai madogo ya kware yenye virutubisho vingi na mayai ya kanga.',
    parentCategoryId: 'cat_mayai',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 6. Kuku (Adult Poultry / Live Chickens) ---
  {
    categoryId: 'cat_kuku',
    name: 'Kuku',
    slug: 'kuku',
    description: 'Kuku wakubwa wa kienyeji, majogoo, mitetea, layers waliomaliza kutaga, na kanga.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 6,
    iconName: 'Bird',
    livestockTypesAllowed: ['Kuku', 'Bata', 'Kanga', 'Kware', 'Uturuki'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kuku_kienyeji',
    name: 'Kuku wa Kienyeji Wakubwa',
    slug: 'kuku-wa-kienyeji-wakubwa',
    description: 'Kuku wakubwa wa kienyeji kwa nyama na ufugaji.',
    parentCategoryId: 'cat_kuku',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_majogoo',
    name: 'Majogoo ya Mbegu',
    slug: 'majogoo-ya-mbegu',
    description: 'Majogoo makubwa ya kuboresha mbegu shambani.',
    parentCategoryId: 'cat_kuku',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kuku_mayai',
    name: 'Kuku wa Mayai (Point of Lay)',
    slug: 'kuku-wa-mayai-point-of-lay',
    description: 'Mitetea iliyo tayari kuanza kutaga mayai.',
    parentCategoryId: 'cat_kuku',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kuku_nyama',
    name: 'Kuku wa Nyama (Broilers)',
    slug: 'kuku-wa-nyama-broilers',
    description: 'Kuku wa nyama walio tayari kuuzwa sokoni.',
    parentCategoryId: 'cat_kuku',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_bata_kanga',
    name: 'Bata & Kanga & Kware',
    slug: 'bata-kanga-kware',
    description: 'Bata bukini, bata maji, kanga, na kware wakubwa.',
    parentCategoryId: 'cat_kuku',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 7. Mbuzi & Kondoo ---
  {
    categoryId: 'cat_mbuzi_kondoo',
    name: 'Mbuzi & Kondoo',
    slug: 'mbuzi-kondoo',
    description: 'Mbuzi wa maziwa (Saanen, Toggenburg), mbuzi wa nyama (Boer), na kondoo.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 7,
    iconName: 'Sparkles',
    livestockTypesAllowed: ['Mbuzi', 'Kondoo'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mbuzi_maziwa',
    name: 'Mbuzi wa Maziwa (Dairy Goats)',
    slug: 'mbuzi-wa-maziwa-dairy-goats',
    description: 'Mbuzi wa kike wa maziwa jamii ya Saanen na Toggenburg.',
    parentCategoryId: 'cat_mbuzi_kondoo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mbuzi_nyama',
    name: 'Mbuzi wa Nyama (Boer/Local)',
    slug: 'mbuzi-wa-nyama-boer-local',
    description: 'Mbuzi wa nyama aina ya Boer, Red Maasai, na asilia.',
    parentCategoryId: 'cat_mbuzi_kondoo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mbuzi_mbegu',
    name: 'Mbuzi wa Mbegu (Breeding Bucks)',
    slug: 'mbuzi-wa-mbegu-breeding-bucks',
    description: 'Madume bora ya mbegu ya mbuzi.',
    parentCategoryId: 'cat_mbuzi_kondoo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kondoo',
    name: 'Kondoo wa Nyama & Sufu',
    slug: 'kondoo-wa-nyama-sufu',
    description: 'Kondoo aina ya Dorper, Blackhead Persian, na kienyeji.',
    parentCategoryId: 'cat_mbuzi_kondoo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 8. Ng'ombe ---
  {
    categoryId: 'cat_ngombe',
    name: 'Ng\'ombe',
    slug: 'ngombe',
    description: 'Ng\'ombe wa maziwa (Friesian, Ayrshire, Jersey) na ng\'ombe wa nyama (Boran, Sahiwal).',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 8,
    iconName: 'Activity',
    livestockTypesAllowed: ['Ng\'ombe'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ngombe_maziwa',
    name: 'Ng\'ombe wa Maziwa (Dairy Cows & Heifers)',
    slug: 'ngombe-wa-maziwa-dairy-cows-heifers',
    description: 'Mitamba na ng\'ombe wanaokamuliwa wa maziwa.',
    parentCategoryId: 'cat_ngombe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ngombe_nyama',
    name: 'Ng\'ombe wa Nyama (Beef Steers)',
    slug: 'ngombe-wa-nyama-beef-steers',
    description: 'Ng\'ombe wa kunenepesha na kuuzwa mnadani.',
    parentCategoryId: 'cat_ngombe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ndama',
    name: 'Ndama Bora (Calves)',
    slug: 'ndama-bora-calves',
    description: 'Ndama wa miezi 1 hadi 6 wa mbegu bora.',
    parentCategoryId: 'cat_ngombe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_fahari',
    name: 'Fahari wa Mbegu (Bulls)',
    slug: 'fahari-wa-mbegu-bulls',
    description: 'Madume ya mbegu bora ya ng\'ombe wa maziwa na nyama.',
    parentCategoryId: 'cat_ngombe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 9. Nguruwe ---
  {
    categoryId: 'cat_nguruwe',
    name: 'Nguruwe',
    slug: 'nguruwe',
    description: 'Vitoto vya nguruwe (piglets), nguruwe wa mbegu (Landrace, Large White, Duroc).',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 9,
    iconName: 'Box',
    livestockTypesAllowed: ['Nguruwe'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vitoto_nguruwe',
    name: 'Vitoto vya Nguruwe (Weaners/Piglets)',
    slug: 'vitoto-vya-nguruwe-weaners-piglets',
    description: 'Vitoto vilivyoachishwa ziwa tayari kuanza kulelewa.',
    parentCategoryId: 'cat_nguruwe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_nguruwe_mbegu',
    name: 'Nguruwe wa Mbegu (Gilts & Boars)',
    slug: 'nguruwe-wa-mbegu-gilts-boars',
    description: 'Mabwana na majike ya mbegu safi ya nguruwe.',
    parentCategoryId: 'cat_nguruwe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_nguruwe_nyama',
    name: 'Nguruwe wa Nyama (Fatteners)',
    slug: 'nguruwe-wa-nyama-fatteners',
    description: 'Nguruwe wakubwa walionenepeshwa kwa ajili ya machinjio.',
    parentCategoryId: 'cat_nguruwe',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 10. Sungura ---
  {
    categoryId: 'cat_sungura',
    name: 'Sungura',
    slug: 'sungura',
    description: 'Sungura wa mbegu (New Zealand White, California, Flemish Giant) na vizimba.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 10,
    iconName: 'Smile',
    livestockTypesAllowed: ['Sungura'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_sungura_mbegu',
    name: 'Sungura wa Mbegu',
    slug: 'sungura-wa-mbegu',
    description: 'Wazazi bora wa sungura wa mbegu za kisasa.',
    parentCategoryId: 'cat_sungura',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_sungura_nyama',
    name: 'Sungura wa Nyama',
    slug: 'sungura-wa-nyama',
    description: 'Sungura wakubwa wa nyama nyeupe na lishe.',
    parentCategoryId: 'cat_sungura',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vizimba_sungura',
    name: 'Vizimba & Vifaa vya Sungura',
    slug: 'vizimba-vifaa-vya-sungura',
    description: 'Vizimba vya waya, feeders, na vyombo vya maji vya sungura.',
    parentCategoryId: 'cat_sungura',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 11. Samaki (Fish Farming / Aquaculture) ---
  {
    categoryId: 'cat_samaki',
    name: 'Samaki',
    slug: 'samaki',
    description: 'Vifaranga vya samaki (fingerlings za sato, kambale) na vyakula vya samaki.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 11,
    iconName: 'Fish',
    livestockTypesAllowed: ['Samaki'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_sato',
    name: 'Vifaranga vya Sato (Tilapia Fingerlings)',
    slug: 'vifaranga-vya-sato-tilapia-fingerlings',
    description: 'Vifaranga vya sato wa kiume (monosex) kwa ajili ya mabwawa.',
    parentCategoryId: 'cat_samaki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_kambale',
    name: 'Vifaranga vya Kambale (Catfish Fingerlings)',
    slug: 'vifaranga-vya-kambale-catfish-fingerlings',
    description: 'Vifaranga vya kambale wanaokua haraka.',
    parentCategoryId: 'cat_samaki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_chakula_samaki',
    name: 'Chakula cha Samaki (Fish Pellets)',
    slug: 'chakula-cha-samaki-fish-pellets',
    description: 'Chakula kinachoelea (floating pellets) cha hatua mbalimbali za samaki.',
    parentCategoryId: 'cat_samaki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mabwawa',
    name: 'Mabwawa ya Turubai & Vifaa',
    slug: 'mabwawa-ya-turubai-vifaa',
    description: 'Turubai za mabwawa (dam liners), aerators na nyavu za kuvulia.',
    parentCategoryId: 'cat_samaki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 12. Nyuki (Apiculture) ---
  {
    categoryId: 'cat_nyuki',
    name: 'Nyuki / Ufugaji wa Nyuki',
    slug: 'nyuki-ufugaji-wa-nyuki',
    description: 'Mizinga ya kisasa, suti za nyuki, moshi, na asali safi ya asili.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 12,
    iconName: 'Hexagon',
    livestockTypesAllowed: ['Nyuki'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mizinga',
    name: 'Mizinga ya Kisasa (Top Bar/Langstroth)',
    slug: 'mizinga-ya-kisasa-top-bar-langstroth',
    description: 'Mizinga bora ya mbao inayodumu kwa ajili ya uzalishaji wa asali.',
    parentCategoryId: 'cat_nyuki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_suti_nyuki',
    name: 'Suti na Vifaa vya Kuzuia Kung\'atwa',
    slug: 'suti-na-vifaa-vya-kuzuia-kungatwa',
    description: 'Suti kamili, glavu za ngozi na kofia zenye wavu.',
    parentCategoryId: 'cat_nyuki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_moshi_nyuki',
    name: 'Moshi wa Nyuki & Vifaa vya Kuvuna',
    slug: 'moshi-wa-nyuki-vifaa-vya-kuvuna',
    description: 'Smokers za bati na vifaa vya kuchuja asali.',
    parentCategoryId: 'cat_nyuki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_asali',
    name: 'Asali Safi ya Nyuki',
    slug: 'asali-safi-ya-nyuki',
    description: 'Asali asilia isiyochakachuliwa moja kwa moja toka mizingani.',
    parentCategoryId: 'cat_nyuki',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 13. Mazao ya Mifugo ---
  {
    categoryId: 'cat_mazao_ya_mifugo',
    name: 'Mazao ya Mifugo',
    slug: 'mazao-ya-mifugo',
    description: 'Maziwa safi, ngozi, mbolea ya samadi iliyochakatwa, na mazao mengine.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 13,
    iconName: 'Layers',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_maziwa_safi',
    name: 'Maziwa Safi (Fresh & Raw Milk)',
    slug: 'maziwa-safi-fresh-raw-milk',
    description: 'Maziwa ghafi ya ng\'ombe na mbuzi yasiyoongezwa maji.',
    parentCategoryId: 'cat_mazao_ya_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mbolea_samadi',
    name: 'Mbolea ya Samadi (Farmyard Manure)',
    slug: 'mbolea-ya-samadi-farmyard-manure',
    description: 'Samadi iliyochakatwa na kupumzishwa tayari kwa bustani na mashamba.',
    parentCategoryId: 'cat_mazao_ya_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ngozi_sufu',
    name: 'Ngozi & Sufu',
    slug: 'ngozi-sufu',
    description: 'Ngozi zilizokaushwa za ng\'ombe, mbuzi na kondoo.',
    parentCategoryId: 'cat_mazao_ya_mifugo',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 14. Huduma za Ufugaji (Services) ---
  {
    categoryId: 'cat_huduma_za_ufugaji',
    name: 'Huduma za Ufugaji',
    slug: 'huduma-za-ufugaji',
    description: 'Huduma za upandikizaji mbegu (AI), usafirishaji wa mifugo, ujenzi wa mabanda.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 14,
    iconName: 'Stethoscope',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ai_upandikizaji',
    name: 'Upandikizaji Mbegu (Artificial Insemination)',
    slug: 'upandikizaji-mbegu-artificial-insemination',
    description: 'Huduma za AI ya ng\'ombe na mbuzi kwa madume ya kisasa.',
    parentCategoryId: 'cat_huduma_za_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ujenzi_mabanda',
    name: 'Ujenzi wa Mabanda ya Kisasa',
    slug: 'ujenzi-wa-mabanda-ya-kisasa',
    description: 'Ujenzi na usanifu wa mabanda bora ya kuku, ng\'ombe na mbuzi.',
    parentCategoryId: 'cat_huduma_za_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_usafirishaji_mifugo',
    name: 'Usafirishaji wa Mifugo (Livestock Transport)',
    slug: 'usafirishaji-wa-mifugo-livestock-transport',
    description: 'Usafirishaji salama wa kuku, ng\'ombe na mbuzi mikoani.',
    parentCategoryId: 'cat_huduma_za_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_ushauri_kitaalamu',
    name: 'Ushauri wa Kitaalamu Shambani',
    slug: 'ushauri-wa-kitaalamu-shambani',
    description: 'Ushauri wa wataalamu wa lishe na uendeshaji bora wa mashamba.',
    parentCategoryId: 'cat_huduma_za_ufugaji',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },

  // --- 15. Pembejeo Nyingine za Ufugaji (Other Inputs) ---
  {
    categoryId: 'cat_nyingine',
    name: 'Pembejeo Nyingine za Ufugaji',
    slug: 'pembejeo-nyingine',
    description: 'Bidhaa na pembejeo nyingine zote za kilimo na ufugaji nchini Tanzania.',
    parentCategoryId: null,
    categoryType: 'CATEGORY',
    status: 'ACTIVE',
    sortOrder: 15,
    iconName: 'HelpCircle',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mbegu_malisho',
    name: 'Mbegu za Malisho',
    slug: 'mbegu-za-malisho',
    description: 'Mbegu za nyasi na mikunde ya kulisha mifugo.',
    parentCategoryId: 'cat_nyingine',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_vitabu_miongozo',
    name: 'Vitabu & Miongozo ya Ufugaji',
    slug: 'vitabu-miongozo-ya-ufugaji',
    description: 'Miongozo ya kuku, ng\'ombe, na mbinu za kitaalamu za ufugaji.',
    parentCategoryId: 'cat_nyingine',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  },
  {
    categoryId: 'cat_sub_mengineyo',
    name: 'Mengineyo ya Kilimo & Ufugaji',
    slug: 'mengineyo-ya-kilimo-ufugaji',
    description: 'Vifaa na pembejeo mbalimbali za ziada.',
    parentCategoryId: 'cat_nyingine',
    categoryType: 'SUBCATEGORY',
    status: 'ACTIVE',
    sortOrder: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_governance'
  }
];

// In-memory runtime state for fast resolution & headless test suites
let inMemoryCategoriesCache: GovernedCategory[] = [...SEED_GOVERNED_CATEGORIES];

// ---------------------------------------------------------------------------
// 2. CACHE & RETRIEVAL HELPERS
// ---------------------------------------------------------------------------

export function getLocalCachedCategories(): GovernedCategory[] {
  if (inMemoryCategoriesCache && inMemoryCategoriesCache.length > 0) {
    return inMemoryCategoriesCache;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LOCAL_CATEGORIES_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryCategoriesCache = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Hitilafu ya kusoma akiba ya makundi:', err);
  }
  return inMemoryCategoriesCache;
}

export function saveCategoriesToLocalCache(categories: GovernedCategory[]): void {
  inMemoryCategoriesCache = [...categories];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_CATEGORIES_CACHE_KEY, JSON.stringify(categories));
    }
  } catch (err) {
    console.warn('Hitilafu ya kuhifadhi akiba ya makundi:', err);
  }
}

// ---------------------------------------------------------------------------
// 3. ASYNC FIRESTORE LOADER & SYNCHRONIZER
// ---------------------------------------------------------------------------

export async function fetchGovernedCategories(): Promise<GovernedCategory[]> {
  const localList = getLocalCachedCategories();
  try {
    const colRef = collection(db, 'marketplaceCategories');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const remoteList: GovernedCategory[] = [];
      snap.forEach((d) => {
        remoteList.push(d.data() as GovernedCategory);
      });
      // Sort by sortOrder
      remoteList.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      saveCategoriesToLocalCache(remoteList);
      return remoteList;
    }
  } catch (err) {
    console.warn('Firestore marketplaceCategories fetch fallback to cache/seed:', err);
  }
  return localList.length > 0 ? localList : SEED_GOVERNED_CATEGORIES;
}

// ---------------------------------------------------------------------------
// 4. HIERARCHY & QUERY ACCESSORS
// ---------------------------------------------------------------------------

export function getActiveRootCategories(
  categories: GovernedCategory[] = getLocalCachedCategories()
): GovernedCategory[] {
  return categories
    .filter((c) => (c.categoryType === 'ROOT' || c.categoryType === 'CATEGORY') && c.status === 'ACTIVE')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getAllRootCategories(
  categories: GovernedCategory[] = getLocalCachedCategories()
): GovernedCategory[] {
  return categories
    .filter((c) => c.categoryType === 'ROOT' || c.categoryType === 'CATEGORY')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getSubcategoriesForParent(
  parentCategoryId: string,
  categories: GovernedCategory[] = getLocalCachedCategories(),
  activeOnly: boolean = true
): GovernedCategory[] {
  if (!parentCategoryId) return [];
  return categories
    .filter((c) => {
      const matchesParent = c.parentCategoryId === parentCategoryId;
      const matchesActive = activeOnly ? c.status === 'ACTIVE' : true;
      return matchesParent && matchesActive;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function buildCategoryHierarchyTree(
  categories: GovernedCategory[] = getLocalCachedCategories()
): CategoryHierarchyNode[] {
  const roots = getAllRootCategories(categories);
  return roots.map((root) => {
    const children = getSubcategoriesForParent(root.categoryId, categories, false);
    return {
      ...root,
      children
    };
  });
}

export function findCategoryById(
  categoryId?: string | null,
  categories: GovernedCategory[] = getLocalCachedCategories()
): GovernedCategory | null {
  if (!categoryId || !categoryId.trim()) return null;
  const cleanId = categoryId.trim();
  return categories.find((c) => c.categoryId === cleanId) || null;
}

export function findCategoryBySlug(
  slug?: string | null,
  categories: GovernedCategory[] = getLocalCachedCategories()
): GovernedCategory | null {
  if (!slug || !slug.trim()) return null;
  const cleanSlug = slug.trim().toLowerCase();
  return categories.find((c) => c.slug.toLowerCase() === cleanSlug) || null;
}

// ---------------------------------------------------------------------------
// 5. DETERMINISTIC SLUG GENERATOR
// ---------------------------------------------------------------------------

export function generateDeterministicSlug(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove special punctuation
    .replace(/[\s_-]+/g, '-') // collapse spaces and underscores to single dash
    .replace(/^-+|-+$/g, ''); // trim outer dashes
}

// ---------------------------------------------------------------------------
// 6. VALIDATION ENGINE (ANTI-TAMPERING & HIERARCHY INTEGRITY)
// ---------------------------------------------------------------------------

/**
 * Checks if setting child.parentCategoryId creates a cycle in the taxonomy
 */
export function checkCircularHierarchy(
  targetCategoryId: string,
  proposedParentId: string | null,
  categories: GovernedCategory[] = getLocalCachedCategories()
): boolean {
  if (!proposedParentId) return false;
  if (targetCategoryId === proposedParentId) return true; // Direct self-parenting

  let currentParentId: string | null = proposedParentId;
  const visited = new Set<string>([targetCategoryId]);

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      return true; // Cycle detected
    }
    visited.add(currentParentId);

    const parentNode = categories.find((c) => c.categoryId === currentParentId);
    if (!parentNode) break;
    currentParentId = parentNode.parentCategoryId;
  }

  return false;
}

/**
 * Validates a category creation payload
 */
export function validateCategoryCreation(
  input: CreateCategoryInput,
  isAdmin: boolean,
  categories: GovernedCategory[] = getLocalCachedCategories()
): CategoryValidationResult {
  if (!isAdmin) {
    return {
      isValid: false,
      errorCode: 'UNAUTHORIZED_MUTATION',
      error: 'Huna ruhusa ya kubadilisha Marketplace categories. Lazima uwe msimamizi mkuu (Admin).'
    };
  }

  if (!input.categoryId || !input.categoryId.trim()) {
    return {
      isValid: false,
      errorCode: 'MALFORMED_CATEGORY_ID',
      error: 'categoryId lazima ijazwe na iwe sahihi.'
    };
  }

  const cleanId = input.categoryId.trim();
  // Alphanumeric with underscores or hyphens
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(cleanId)) {
    return {
      isValid: false,
      errorCode: 'MALFORMED_CATEGORY_ID',
      error: 'categoryId lazima iwe herufi au nambari na alama za - au _ (mfano: cat_vyakula_kuku).'
    };
  }

  if (categories.some((c) => c.categoryId === cleanId)) {
    return {
      isValid: false,
      errorCode: 'MALFORMED_CATEGORY_ID',
      error: `Category yenye ID "${cleanId}" tayari ipo.`
    };
  }

  if (!input.name || !input.name.trim()) {
    return {
      isValid: false,
      errorCode: 'MALFORMED_CATEGORY_ID',
      error: 'Jina la category (name) linahitajika.'
    };
  }

  const targetSlug = input.slug ? generateDeterministicSlug(input.slug) : generateDeterministicSlug(input.name);
  if (!targetSlug) {
    return {
      isValid: false,
      errorCode: 'DUPLICATE_SLUG',
      error: 'Slug halisi ya category haikuweza kutengenezwa.'
    };
  }

  if (categories.some((c) => c.slug.toLowerCase() === targetSlug.toLowerCase())) {
    return {
      isValid: false,
      errorCode: 'DUPLICATE_SLUG',
      error: `Slug "${targetSlug}" tayari inatumika na category nyingine.`
    };
  }

  // Hierarchy validation
  if (input.categoryType === 'SUBCATEGORY') {
    if (!input.parentCategoryId) {
      return {
        isValid: false,
        errorCode: 'INVALID_HIERARCHY_RELATION',
        error: 'Kundi dogo (SUBCATEGORY) lazima liwe na mzazi (parentCategoryId).'
      };
    }

    const parent = categories.find((c) => c.categoryId === input.parentCategoryId);
    if (!parent) {
      return {
        isValid: false,
        errorCode: 'CATEGORY_NOT_FOUND',
        error: 'Mzazi (parentCategoryId) aliyechaguliwa hayupo kwenye mfumo.'
      };
    }

    // Do not allow deep hierarchies (Subcategory cannot be parent of another subcategory)
    if (parent.categoryType === 'SUBCATEGORY') {
      return {
        isValid: false,
        errorCode: 'INVALID_HIERARCHY_RELATION',
        error: 'Ngazi za makundi zimezuiwa kuwa zaidi ya ngazi mbili (Root -> Subcategory).'
      };
    }

    if (input.parentCategoryId === cleanId) {
      return {
        isValid: false,
        errorCode: 'SELF_PARENTING_FORBIDDEN',
        error: 'Category haiwezi kuwa mzazi wa yenyewe.'
      };
    }
  }

  return {
    isValid: true
  };
}

/**
 * Validates a category update payload
 */
export function validateCategoryUpdate(
  categoryId: string,
  updates: UpdateCategoryInput,
  isAdmin: boolean,
  categories: GovernedCategory[] = getLocalCachedCategories()
): CategoryValidationResult {
  if (!isAdmin) {
    return {
      isValid: false,
      errorCode: 'UNAUTHORIZED_MUTATION',
      error: 'Huna ruhusa ya kubadilisha Marketplace categories.'
    };
  }

  const existing = categories.find((c) => c.categoryId === categoryId);
  if (!existing) {
    return {
      isValid: false,
      errorCode: 'CATEGORY_NOT_FOUND',
      error: 'Category haipo kwenye Marketplace.'
    };
  }

  if (updates.slug) {
    const cleanSlug = generateDeterministicSlug(updates.slug);
    if (categories.some((c) => c.categoryId !== categoryId && c.slug.toLowerCase() === cleanSlug.toLowerCase())) {
      return {
        isValid: false,
        errorCode: 'DUPLICATE_SLUG',
        error: `Slug "${cleanSlug}" tayari inatumika na category nyingine.`
      };
    }
  }

  if (updates.parentCategoryId !== undefined && updates.parentCategoryId !== null) {
    if (updates.parentCategoryId === categoryId) {
      return {
        isValid: false,
        errorCode: 'SELF_PARENTING_FORBIDDEN',
        error: 'Category haiwezi kuwa mzazi wa yenyewe.'
      };
    }

    const parent = categories.find((c) => c.categoryId === updates.parentCategoryId);
    if (!parent) {
      return {
        isValid: false,
        errorCode: 'CATEGORY_NOT_FOUND',
        error: 'Mzazi aliyechaguliwa hayupo kwenye mfumo.'
      };
    }

    const hasCycle = checkCircularHierarchy(categoryId, updates.parentCategoryId, categories);
    if (hasCycle) {
      return {
        isValid: false,
        errorCode: 'CIRCULAR_HIERARCHY_DETECTED',
        error: 'Mzunguko wa uzao (circular hierarchy) umegunduliwa. Huwezi kuweka mzazi anayejitegemea kupitia category hii.'
      };
    }
  }

  return {
    isValid: true,
    category: existing
  };
}

/**
 * Authoritative check when a seller creates or updates a product listing
 */
export function validateProductCategoryAssignment(
  categoryId?: string | null,
  subcategoryId?: string | null,
  isNewListing: boolean = true,
  categories: GovernedCategory[] = getLocalCachedCategories()
): CategoryValidationResult {
  if (!categoryId || !categoryId.trim()) {
    return {
      isValid: false,
      errorCode: 'CATEGORY_NOT_FOUND',
      error: 'Tafadhali chagua kundi la bidhaa lililoidhinishwa (Category).'
    };
  }

  const cleanCatId = categoryId.trim();
  const category = categories.find((c) => c.categoryId === cleanCatId);

  if (!category) {
    return {
      isValid: false,
      errorCode: 'CATEGORY_NOT_FOUND',
      error: 'Category haipo kwenye Marketplace.'
    };
  }

  if (isNewListing && category.status !== 'ACTIVE') {
    return {
      isValid: false,
      errorCode: 'CATEGORY_INACTIVE',
      error: 'Category hii haipatikani kwa listing mpya.'
    };
  }

  let subcategory: GovernedCategory | undefined = undefined;
  if (subcategoryId && subcategoryId.trim()) {
    const cleanSubId = subcategoryId.trim();
    subcategory = categories.find((c) => c.categoryId === cleanSubId);

    if (!subcategory) {
      return {
        isValid: false,
        errorCode: 'SUBCATEGORY_NOT_FOUND',
        error: 'Kundi dogo (Subcategory) halipo kwenye Marketplace.'
      };
    }

    // Verify parent-child relationship
    if (subcategory.parentCategoryId !== cleanCatId) {
      return {
        isValid: false,
        errorCode: 'INVALID_HIERARCHY_RELATION',
        error: `Kundi dogo "${subcategory.name}" halioani na kundi kuu "${category.name}".`
      };
    }

    if (isNewListing && subcategory.status !== 'ACTIVE') {
      return {
        isValid: false,
        errorCode: 'SUBCATEGORY_INACTIVE',
        error: 'Kundi dogo hili halipatikani kwa listing mpya.'
      };
    }
  }

  return {
    isValid: true,
    categoryId: category.categoryId,
    category,
    subcategoryId: subcategory?.categoryId,
    subcategory
  };
}

// ---------------------------------------------------------------------------
// 7. PRODUCT CATEGORY RESOLUTION (V1.7A AUTHORITATIVE RESOLUTION & LEGACY SAFETY)
// ---------------------------------------------------------------------------

/**
 * Resolves the authoritative category of any product deterministically.
 * Preserves legacy products without inventing unverified categories.
 */
export function resolveProductCategoryTrust(
  product: Partial<MarketplaceProduct>,
  categories: GovernedCategory[] = getLocalCachedCategories()
): ProductCategoryTrustResolution {
  // Case A: Product has authoritative categoryId
  if (product.categoryId && product.categoryId.trim()) {
    const category = categories.find((c) => c.categoryId === product.categoryId?.trim());
    if (category) {
      let subcategoryName: string | null = null;
      let subcategoryId: string | null = null;

      if (product.subcategoryId && product.subcategoryId.trim()) {
        const sub = categories.find(
          (c) => c.categoryId === product.subcategoryId?.trim() && c.parentCategoryId === category.categoryId
        );
        if (sub) {
          subcategoryId = sub.categoryId;
          subcategoryName = sub.name;
        }
      }

      const isSubActive = subcategoryId
        ? categories.find((c) => c.categoryId === subcategoryId)?.status === 'ACTIVE'
        : true;
      const isOverallActive = category.status === 'ACTIVE' && isSubActive;

      const displayCategory = subcategoryName
        ? `${category.name} • ${subcategoryName}`
        : category.name;

      return {
        state: isOverallActive ? 'GOVERNED_VALID' : 'GOVERNED_INACTIVE',
        isGoverned: true,
        categoryId: category.categoryId,
        categoryName: category.name,
        subcategoryId,
        subcategoryName,
        categoryType: category.categoryType,
        categoryStatus: category.status,
        displayCategory,
        isLegacyProduct: false,
        isSelectableForNewListing: isOverallActive,
        notice: isOverallActive
          ? undefined
          : 'Kundi hili limeondolewa kwa matangazo mapya lakini linabaki kwa kumbukumbu.'
      };
    }

    // Invalid categoryId submitted
    return {
      state: 'INVALID',
      isGoverned: false,
      categoryId: product.categoryId,
      categoryName: product.category || 'Unknown Category',
      subcategoryId: product.subcategoryId || null,
      subcategoryName: product.subcategory || null,
      displayCategory: product.category || 'Category haipo kwenye Marketplace',
      isLegacyProduct: false,
      isSelectableForNewListing: false,
      notice: 'Category haipo kwenye Marketplace.'
    };
  }

  // Case B: Legacy product with category string (no categoryId stored yet)
  if (product.category && product.category.trim()) {
    const cleanCategoryName = product.category.trim().toLowerCase();
    const matchedCategory = categories.find(
      (c) =>
        c.name.toLowerCase() === cleanCategoryName ||
        c.slug.toLowerCase() === cleanCategoryName ||
        c.categoryId.toLowerCase() === cleanCategoryName
    );

    if (matchedCategory) {
      let matchedSub: GovernedCategory | null = null;
      if (product.subcategory && product.subcategory.trim()) {
        const cleanSubName = product.subcategory.trim().toLowerCase();
        matchedSub =
          categories.find(
            (c) =>
              c.parentCategoryId === matchedCategory.categoryId &&
              (c.name.toLowerCase().includes(cleanSubName) ||
                cleanSubName.includes(c.name.toLowerCase()) ||
                c.slug.toLowerCase() === cleanSubName)
          ) || null;
      }

      const displayCategory = matchedSub
        ? `${matchedCategory.name} • ${matchedSub.name}`
        : matchedCategory.name;

      return {
        state: 'LEGACY_RESOLVED',
        isGoverned: true,
        categoryId: matchedCategory.categoryId,
        categoryName: matchedCategory.name,
        subcategoryId: matchedSub?.categoryId || null,
        subcategoryName: matchedSub?.name || product.subcategory || null,
        categoryType: matchedCategory.categoryType,
        categoryStatus: matchedCategory.status,
        displayCategory,
        isLegacyProduct: true,
        isSelectableForNewListing: matchedCategory.status === 'ACTIVE',
        notice: 'Kundi limethibitishwa kutoka rekodi za zamani za Marketplace.'
      };
    }
  }

  // Case C: Missing / legacy unresolvable category
  return {
    state: 'CATEGORY_NOT_PROVIDED',
    isGoverned: false,
    categoryId: null,
    categoryName: 'Kundi Halijawekwa',
    subcategoryId: null,
    subcategoryName: null,
    displayCategory: 'Kundi halijawekwa',
    isLegacyProduct: true,
    isSelectableForNewListing: false,
    notice: 'Taarifa za kundi la bidhaa hazijawekwa au hazikupatikana.'
  };
}

// ---------------------------------------------------------------------------
// 8. ADMIN GOVERNANCE WORKFLOWS (FIRESTORE MUTATIONS)
// ---------------------------------------------------------------------------

/**
 * Creates a new governed category. Authoritative admin check strictly enforced.
 */
export async function createGovernedCategory(
  input: CreateCategoryInput,
  adminUid: string,
  isAdmin: boolean
): Promise<GovernedCategory> {
  const currentCategories = getLocalCachedCategories();
  const validation = validateCategoryCreation(input, isAdmin, currentCategories);

  if (!validation.isValid) {
    throw new Error(validation.error || 'Uundaji wa category umekataliwa.');
  }

  const now = new Date().toISOString();
  const slug = input.slug
    ? generateDeterministicSlug(input.slug)
    : generateDeterministicSlug(input.name);

  const newCategory: GovernedCategory = {
    categoryId: input.categoryId.trim(),
    name: input.name.trim(),
    slug,
    description: input.description.trim(),
    parentCategoryId: input.parentCategoryId || null,
    categoryType: input.categoryType,
    status: input.status || 'ACTIVE',
    sortOrder: input.sortOrder !== undefined ? input.sortOrder : currentCategories.length + 1,
    iconName: input.iconName || undefined,
    livestockTypesAllowed: input.livestockTypesAllowed || [],
    createdAt: now,
    updatedAt: now,
    createdBy: adminUid,
    updatedBy: adminUid
  };

  // Persist to Firestore
  try {
    const docRef = doc(db, 'marketplaceCategories', newCategory.categoryId);
    await setDoc(docRef, newCategory);
  } catch (err) {
    console.warn('Firestore marketplaceCategories write notice (fallback to local):', err);
  }

  // Update local cache
  const updatedList = [...currentCategories, newCategory];
  saveCategoriesToLocalCache(updatedList);

  return newCategory;
}

/**
 * Updates an existing category. Authoritative admin check strictly enforced.
 */
export async function updateGovernedCategory(
  categoryId: string,
  updates: UpdateCategoryInput,
  adminUid: string,
  isAdmin: boolean
): Promise<GovernedCategory> {
  const currentCategories = getLocalCachedCategories();
  const validation = validateCategoryUpdate(categoryId, updates, isAdmin, currentCategories);

  if (!validation.isValid || !validation.category) {
    throw new Error(validation.error || 'Mabadiliko ya category yamekataliwa.');
  }

  const targetCategory = validation.category;
  const now = new Date().toISOString();

  const updatedCategory: GovernedCategory = {
    ...targetCategory,
    ...updates,
    categoryId: targetCategory.categoryId, // Strictly immutable
    createdAt: targetCategory.createdAt, // Strictly immutable
    createdBy: targetCategory.createdBy, // Strictly immutable
    updatedAt: now,
    updatedBy: adminUid
  };

  if (updates.name && !updates.slug) {
    // Keep slug stable unless explicitly updated
    updatedCategory.slug = targetCategory.slug;
  } else if (updates.slug) {
    updatedCategory.slug = generateDeterministicSlug(updates.slug);
  }

  // Persist to Firestore
  try {
    const docRef = doc(db, 'marketplaceCategories', categoryId);
    await updateDoc(docRef, {
      ...updates,
      slug: updatedCategory.slug,
      updatedAt: now,
      updatedBy: adminUid
    });
  } catch (err) {
    console.warn('Firestore marketplaceCategories update notice (fallback to local):', err);
  }

  // Update local cache
  const updatedList = currentCategories.map((c) =>
    c.categoryId === categoryId ? updatedCategory : c
  );
  saveCategoriesToLocalCache(updatedList);

  return updatedCategory;
}

/**
 * Deactivates a category. Soft deactivation preserving product historical links.
 */
export async function deactivateGovernedCategory(
  categoryId: string,
  adminUid: string,
  isAdmin: boolean
): Promise<GovernedCategory> {
  return updateGovernedCategory(
    categoryId,
    { status: 'INACTIVE' },
    adminUid,
    isAdmin
  );
}

/**
 * Activates a category.
 */
export async function activateGovernedCategory(
  categoryId: string,
  adminUid: string,
  isAdmin: boolean
): Promise<GovernedCategory> {
  return updateGovernedCategory(
    categoryId,
    { status: 'ACTIVE' },
    adminUid,
    isAdmin
  );
}

/**
 * Seeds default taxonomy to Firestore. Admin only.
 */
export async function seedDefaultMarketplaceTaxonomy(
  adminUid: string,
  isAdmin: boolean,
  forceReset: boolean = false
): Promise<GovernedCategory[]> {
  if (!isAdmin) {
    throw new Error('Ruhusa ya msimamizi (Admin) inahitajika kuingiza taxonomy.');
  }

  const existing = getLocalCachedCategories();
  const existingMap = new Map(existing.map((c) => [c.categoryId, c]));
  const results: GovernedCategory[] = [];

  for (const item of SEED_GOVERNED_CATEGORIES) {
    const shouldWrite = forceReset || !existingMap.has(item.categoryId);
    const categoryDoc: GovernedCategory = {
      ...item,
      createdBy: adminUid,
      updatedBy: adminUid,
      updatedAt: new Date().toISOString()
    };

    if (shouldWrite) {
      try {
        const docRef = doc(db, 'marketplaceCategories', item.categoryId);
        await setDoc(docRef, categoryDoc);
      } catch (err) {
        console.warn(`Firestore seed error for ${item.categoryId}:`, err);
      }
      results.push(categoryDoc);
    } else {
      const ex = existingMap.get(item.categoryId);
      if (ex) results.push(ex);
      else results.push(categoryDoc);
    }
  }

  saveCategoriesToLocalCache(results);
  return results;
}

