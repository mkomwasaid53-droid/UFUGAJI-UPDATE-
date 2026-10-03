import { MarketplaceReview } from '../types/marketplaceReview';

/**
 * Initial curated sample reviews for V1.6F verification & demonstration.
 * These reflect realistic Tanzanian farmer marketplace interactions:
 * - prod-001: 3 reviews (Ratings: 5, 5, 4) with 1 seller response -> Average 4.7
 * - prod-002: 2 reviews (Ratings: 5, 4) -> Small sample warning (2 reviews)
 * - prod-003: 1 review (Rating: 5) -> Small sample warning (1 review)
 * - prod-004: 1 review (Rating: 3) with seller response
 * - prod-005: 0 reviews -> "Hakuna tathmini bado" (verifies no fake rating!)
 * - demo-removed-review: 1 removed review -> Not counted in public metrics
 */
export const INITIAL_SAMPLE_REVIEWS: MarketplaceReview[] = [
  {
    reviewId: 'rev_sample_001_prod-001',
    authorUserId: 'sample-user-juma',
    authorDisplayName: 'Juma K. (Arusha)',
    targetType: 'PRODUCT',
    targetId: 'prod-001',
    sellerId: 'demo-seller-001',
    shopId: 'demo-seller-001',
    productId: 'prod-001',
    rating: 5,
    title: 'Vifaranga wana afya tele na wamekua vizuri',
    body: 'Nilichukua batch ya vifaranga 100 wa Sasso kutoka Massawe Hatchery. Vifaranga walifika Tengeru wakiwa wachangamfu sana, vifo sifuri kwa wiki mbili za mwanzo. Nawapongeza kwa ushauri wa chanjo ya Gumboro.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 8,
    sellerResponse: 'Asante sana Ndugu Juma kwa uaminifu wako! Tunaendelea kuboresha ubora wa vifaranga ili wafugaji wetu wapate tija kubwa.',
    sellerResponseCreatedAt: '2026-08-20T10:30:00.000Z',
    sellerResponseSellerId: 'demo-seller-001',
    createdAt: '2026-08-18T14:20:00.000Z',
    updatedAt: '2026-08-18T14:20:00.000Z'
  },
  {
    reviewId: 'rev_sample_002_prod-001',
    authorUserId: 'sample-user-halima',
    authorDisplayName: 'Halima M. (Moshi)',
    targetType: 'PRODUCT',
    targetId: 'prod-001',
    sellerId: 'demo-seller-001',
    shopId: 'demo-seller-001',
    productId: 'prod-001',
    rating: 5,
    title: 'Huduma nzuri na mzigo ulifika kwa wakati',
    body: 'Niliwasiliana na muuzaji kabla ya safari, nilifika shambani nikakuta vifaranga tayari wamefungwa kwenye box za usalama. Nimeridhika sana na ushauri wa brooder.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 4,
    createdAt: '2026-08-25T09:15:00.000Z',
    updatedAt: '2026-08-25T09:15:00.000Z'
  },
  {
    reviewId: 'rev_sample_003_prod-001',
    authorUserId: 'sample-user-peter',
    authorDisplayName: 'Peter S. (Kilimanjaro)',
    targetType: 'PRODUCT',
    targetId: 'prod-001',
    sellerId: 'demo-seller-001',
    shopId: 'demo-seller-001',
    productId: 'prod-001',
    rating: 4,
    title: 'Vifaranga bora ila usafirishaji ulichelewa kidogo',
    body: 'Vifaranga ni wazuri sana na wanapokea chakula vizuri. Changamoto ilikuwa dereva alichelewa kufika stendi ya mabasi kwa saa 1, ila muuzaji alinipigia kunituliza.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 2,
    createdAt: '2026-09-02T16:40:00.000Z',
    updatedAt: '2026-09-02T16:40:00.000Z'
  },

  // prod-002: 2 reviews (Small sample demonstration)
  {
    reviewId: 'rev_sample_004_prod-002',
    authorUserId: 'sample-user-amani',
    authorDisplayName: 'Amani B. (Morogoro)',
    targetType: 'PRODUCT',
    targetId: 'prod-002',
    sellerId: 'demo-seller-002',
    shopId: 'demo-seller-002',
    productId: 'prod-002',
    rating: 5,
    title: 'Chakula cha Starter chenye ubora wa juu',
    body: 'Mifuko 5 niliyonunua ilisaidia sana ukuaji wa vifaranga wangu. Hakuna vumbi jingi, ni pellets zenye viini vizuri.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 3,
    createdAt: '2026-08-10T11:00:00.000Z',
    updatedAt: '2026-08-10T11:00:00.000Z'
  },
  {
    reviewId: 'rev_sample_005_prod-002',
    authorUserId: 'sample-user-neema',
    authorDisplayName: 'Neema L. (Mikumi)',
    targetType: 'PRODUCT',
    targetId: 'prod-002',
    sellerId: 'demo-seller-002',
    shopId: 'demo-seller-002',
    productId: 'prod-002',
    rating: 4,
    title: 'Maji safi na mifuko ilikuwa salama',
    body: 'Chakula kiko vizuri na kuku wanakula bila shida. Bei ilikuwa nzuri ukilinganisha na maduka mengine ya mtaani.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 1,
    createdAt: '2026-08-28T13:30:00.000Z',
    updatedAt: '2026-08-28T13:30:00.000Z'
  },

  // prod-003: 1 review (Small sample 1 review demonstration)
  {
    reviewId: 'rev_sample_006_prod-003',
    authorUserId: 'sample-user-shabani',
    authorDisplayName: 'Shabani T. (Hai)',
    targetType: 'PRODUCT',
    targetId: 'prod-003',
    sellerId: 'demo-seller-003',
    shopId: 'demo-seller-003',
    productId: 'prod-003',
    rating: 5,
    title: 'Mtamba wa Friesian mwenye historia nzuri',
    body: 'Nilitembelea shamba la Kibo Modern Dairy, nikaona mama yake anavyotoa lita 22 kwa siku. Nilinunua mtamba na nyaraka zote za daktari zilikuwepo.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 5,
    createdAt: '2026-07-22T08:00:00.000Z',
    updatedAt: '2026-07-22T08:00:00.000Z'
  },

  // Shop reviews
  {
    reviewId: 'rev_sample_007_shop-demo-seller-001',
    authorUserId: 'sample-user-rashid',
    authorDisplayName: 'Rashid F. (Arusha)',
    targetType: 'SHOP',
    targetId: 'demo-seller-001',
    sellerId: 'demo-seller-001',
    shopId: 'demo-seller-001',
    rating: 5,
    title: 'Duka la kuaminika sana Tengeru',
    body: 'Huduma za duka la Massawe Hatchery ni za kiwango cha juu. Wanatoa ushauri wa bure wa kitaalamu kwa wafugaji wachanga.',
    status: 'active',
    moderationStatus: 'PUBLISHED',
    reportCount: 0,
    helpfulCount: 6,
    sellerResponse: 'Karibu tena Massawe Hatchery, tupo kwa ajili ya maendeleo ya mfugaji.',
    sellerResponseCreatedAt: '2026-08-16T12:00:00.000Z',
    sellerResponseSellerId: 'demo-seller-001',
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z'
  },

  // Hidden/Removed test sample (to verify that removed reviews are NOT counted in public score)
  {
    reviewId: 'rev_sample_008_removed',
    authorUserId: 'sample-user-spam',
    authorDisplayName: 'Mtumiaji Asiyejulikana',
    targetType: 'PRODUCT',
    targetId: 'prod-001',
    sellerId: 'demo-seller-001',
    shopId: 'demo-seller-001',
    productId: 'prod-001',
    rating: 1,
    title: 'Maudhui yasiyofaa yaliyoondolewa',
    body: 'Hii ni review iliyoondolewa na msimamizi kutokana na kukiuka masharti ya soko.',
    status: 'deleted',
    moderationStatus: 'REMOVED',
    reportCount: 3,
    helpfulCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z'
  }
];
