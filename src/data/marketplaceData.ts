import { MarketplaceCategory, MarketplaceProduct, DigitalShop, ShopCatalogue } from '../types/marketplace';

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  {
    id: 'dawa-za-mifugo',
    name: 'Dawa za Mifugo',
    swahiliName: 'Dawa za Mifugo',
    iconName: 'Pill',
    description: 'Chanjo, viua vijasumu (antibiotics), dawa za minyoo, na vitamini za mifugo.',
    subcategories: ['Chanjo (Vaccines)', 'Viua Vijasumu (Antibiotics)', 'Vitamini & Madini', 'Dawa za Minyoo (Dewormers)', 'Dawa za Kuogesha (Acaricides)', 'Vifaa vya Matibabu']
  },
  {
    id: 'chakula-cha-mifugo',
    name: 'Chakula cha Mifugo',
    swahiliName: 'Chakula cha Mifugo',
    iconName: 'Wheat',
    description: 'Mashudu, pumba, starter, growers, layers mash, broiler finisher na virutubisho.',
    subcategories: ['Chakula cha Kuku (Poultry Feeds)', 'Chakula cha Ng\'ombe (Dairy/Beef Feeds)', 'Mashudu ya Alizeti/Pamba', 'Pumba za Mahindi/Mchele', 'Nyasi & Malisho ya Mifugo', 'Virutubisho (Premix/Concentrate)']
  },
  {
    id: 'vifaa-vya-ufugaji',
    name: 'Vifaa vya Ufugaji',
    swahiliName: 'Vifaa vya Ufugaji',
    iconName: 'Wrench',
    description: 'Vyombo vya maji, vyombo vya chakula, mashine za kutotolesha (incubators), na vizimba.',
    subcategories: ['Vyombo vya Maji (Drinkers)', 'Vyombo vya Chakula (Feeders)', 'Mashine za Kutotolesha (Incubators)', 'Mabanda & Vizimba (Cages)', 'Vifaa vya Joto (Brooders & Bulbs)', 'Vipima Uzito na Vifaa vya Shambani']
  },
  {
    id: 'vifaranga',
    name: 'Vifaranga',
    swahiliName: 'Vifaranga',
    iconName: 'Egg',
    description: 'Vifaranga wa kienyeji, sasso, kuroiler, layers, na broiler wa siku 1 au zaidi.',
    subcategories: ['Vifaranga vya Siku 1 (DOC)', 'Vifaranga vya Wiki 2 - 4', 'Kuku Chotara (Kuroiler/Sasso)', 'Vifaranga wa Kienyeji Halisi', 'Vifaranga vya Mayai (Layers DOC)', 'Vifaranga vya Nyama (Broiler DOC)']
  },
  {
    id: 'mayai',
    name: 'Mayai',
    swahiliName: 'Mayai',
    iconName: 'CircleDot',
    description: 'Mayai ya mezani, mayai ya mbegu (fertilized eggs), na mayai ya kware.',
    subcategories: ['Mayai ya Mbegu (Fertilized Hatching Eggs)', 'Mayai ya Kienyeji ya Mezani', 'Mayai ya Kisasa ya Mezani (Table Eggs)', 'Mayai ya Kware / Kanga']
  },
  {
    id: 'kuku',
    name: 'Kuku',
    swahiliName: 'Kuku',
    iconName: 'Bird',
    description: 'Kuku wakubwa wa kienyeji, majogoo, mitetea, layers waliomaliza kutaga, na kanga.',
    subcategories: ['Kuku wa Kienyeji Wakubwa', 'Majogoo ya Mbegu', 'Kuku wa Mayai (Point of Lay)', 'Kuku wa Nyama (Broilers)', 'Bata & Kanga & Kware']
  },
  {
    id: 'mbuzi',
    name: 'Mbuzi',
    swahiliName: 'Mbuzi & Kondoo',
    iconName: 'Sparkles',
    description: 'Mbuzi wa maziwa (Saanen, Toggenburg), mbuzi wa nyama (Boer), na kondoo.',
    subcategories: ['Mbuzi wa Maziwa (Dairy Goats)', 'Mbuzi wa Nyama (Boer/Local)', 'Mbuzi wa Mbegu (Breeding Bucks)', 'Kondoo wa Nyama & Sufu']
  },
  {
    id: 'ngombe',
    name: 'Ng\'ombe',
    swahiliName: 'Ng\'ombe',
    iconName: 'Activity',
    description: 'Ng\'ombe wa maziwa (Friesian, Ayrshire, Jersey) na ng\'ombe wa nyama (Boran, Sahiwal).',
    subcategories: ['Ng\'ombe wa Maziwa (Dairy Cows & Heifers)', 'Ng\'ombe wa Nyama (Beef Steers)', 'Ndama Bora (Calves)', 'Fahari wa Mbegu (Bulls)']
  },
  {
    id: 'nguruwe',
    name: 'Nguruwe',
    swahiliName: 'Nguruwe',
    iconName: 'Box',
    description: 'Vitoto vya nguruwe (piglets), nguruwe wa mbegu (Landrace, Large White, Duroc).',
    subcategories: ['Vitoto vya Nguruwe (Weaners/Piglets)', 'Nguruwe wa Mbegu (Gilts & Boars)', 'Nguruwe wa Nyama (Fatteners)']
  },
  {
    id: 'sungura',
    name: 'Sungura',
    swahiliName: 'Sungura',
    iconName: 'Smile',
    description: 'Sungura wa mbegu (New Zealand White, California, Flemish Giant) na vizimba.',
    subcategories: ['Sungura wa Mbegu', 'Sungura wa Nyama', 'Vizimba & Vifaa vya Sungura']
  },
  {
    id: 'samaki',
    name: 'Samaki',
    swahiliName: 'Samaki',
    iconName: 'Fish',
    description: 'Vifaranga vya samaki (fingerlings za sato, kambale) na vyakula vya samaki.',
    subcategories: ['Vifaranga vya Sato (Tilapia Fingerlings)', 'Vifaranga vya Kambale (Catfish Fingerlings)', 'Chakula cha Samaki (Fish Pellets)', 'Mabwawa ya Turubai & Vifaa']
  },
  {
    id: 'nyuki',
    name: 'Nyuki / Ufugaji wa Nyuki',
    swahiliName: 'Nyuki / Ufugaji wa Nyuki',
    iconName: 'Hexagon',
    description: 'Mizinga ya kisasa, suti za nyuki, moshi, na asali safi ya asili.',
    subcategories: ['Mizinga ya Kisasa (Top Bar/Langstroth)', 'Suti na Vifaa vya Kuzuia Kung\'atwa', 'Moshi wa Nyuki & Vifaa vya Kuvuna', 'Asali Safi ya Nyuki']
  },
  {
    id: 'mazao-ya-mifugo',
    name: 'Mazao ya Mifugo',
    swahiliName: 'Mazao ya Mifugo',
    iconName: 'Layers',
    description: 'Maziwa safi, ngozi, mbolea ya samadi iliyochakatwa, na mazao mengine.',
    subcategories: ['Maziwa Safi (Fresh & Raw Milk)', 'Mbolea ya Samadi (Farmyard Manure)', 'Ngozi & Sufu']
  },
  {
    id: 'huduma-za-ufugaji',
    name: 'Huduma za Ufugaji',
    swahiliName: 'Huduma za Ufugaji',
    iconName: 'Stethoscope',
    description: 'Huduma za upandikizaji mbegu (AI), usafirishaji wa mifugo, ujenzi wa mabanda.',
    subcategories: ['Upandikizaji Mbegu (Artificial Insemination)', 'Ujenzi wa Mabanda ya Kisasa', 'Usafirishaji wa Mifugo (Livestock Transport)', 'Ushauri wa Kitaalamu Shambani']
  },
  {
    id: 'nyingine',
    name: 'Nyingine',
    swahiliName: 'Nyingine',
    iconName: 'HelpCircle',
    description: 'Bidhaa na huduma nyingine zote za kilimo na ufugaji nchini Tanzania.',
    subcategories: ['Mbegu za Malisho', 'Vitabu & Miongozo ya Ufugaji', 'Mengineyo']
  }
];

export const TANZANIA_REGIONS = [
  'Dar es Salaam',
  'Arusha',
  'Mbeya',
  'Morogoro',
  'Mwanza',
  'Dodoma',
  'Tanga',
  'Kilimanjaro',
  'Iringa',
  'Tabora',
  'Shinyanga',
  'Kagera',
  'Kigoma',
  'Mara',
  'Manyara',
  'Singida',
  'Ruvuma',
  'Njombe',
  'Rukwa',
  'Katavi',
  'Lindi',
  'Mtwara',
  'Pwani',
  'Songwe',
  'Geita',
  'Simiyu',
  'Zanzibar'
];

export const PRODUCT_UNITS = [
  'kuku',
  'kifaranga',
  'vifaranga 50',
  'vifaranga 100',
  'trei ya mayai',
  'trei',
  'mfuko 50kg',
  'mfuko 25kg',
  'lita',
  'kichwa / mnyama',
  'kilo (kg)',
  'kifurushi',
  'seti / chombo',
  'mzinga',
  'chupa 100ml',
  'ndoo 20L',
  'tani',
  'huduma / mwezi',
  'nyingine'
];

// Digital Shops (Only real registered sellers and verified shops operate in the marketplace)
export const INITIAL_SAMPLE_SHOPS: Record<string, DigitalShop> = {};

// Shop Catalogues (Only real sellers create and manage catalogues)
export const INITIAL_SAMPLE_CATALOGUES: Record<string, ShopCatalogue[]> = {};

// Marketplace Products (Only real sellers list products and supplies)
export const INITIAL_SAMPLE_PRODUCTS: MarketplaceProduct[] = [];
