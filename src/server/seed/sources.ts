/**
 * Source vocabularies for the demo catalogue.
 *
 * Everything a shopper reads is composed from the lists below rather than from
 * a lorem generator, because filters, search relevance and sort orders only
 * behave realistically when the underlying words do. A product called
 * "Product 12" tells you nothing about whether faceted search works.
 *
 * The brands and stores are invented. They are written to sound like real
 * Indian labels so the shop reads as a going concern, but none of them
 * corresponds to an existing company.
 */

export interface BrandSeed {
  name: string;
  code: string;
  originCountry: string;
  foundedYear: number;
  isPremium: boolean;
  description: string;
  /**
   * Leaf categories this label actually makes things for.
   *
   * Without this a denim house ends up listing wallets and a bridal atelier
   * ends up listing sunscreen, which makes brand pages incoherent and the
   * whole catalogue read as generated. Every brand is deliberately narrow.
   */
  sells: string[];
}

export const BRANDS: BrandSeed[] = [
  {
    name: 'Mora Label',
    code: 'MORA',
    originCountry: 'India',
    foundedYear: 2016,
    isPremium: false,
    sells: [
      'kurtas-and-suits',
      'womens-dresses',
      'womens-tops',
      'dupattas-and-stoles',
      'mens-kurtas',
    ],
    description:
      'Block-printed cottons made with a printing cooperative in Bagru, cut for daily wear rather than occasion. Known for kurtas that survive a hot commute and forty washes.',
  },
  {
    name: 'Saanjh',
    code: 'SNJH',
    originCountry: 'India',
    foundedYear: 2014,
    isPremium: true,
    sells: [
      'kurtas-and-suits',
      'sarees',
      'lehenga-cholis',
      'dupattas-and-stoles',
      'mens-kurtas',
      'mens-nehru-jackets',
    ],
    description:
      'Occasion wear built around handloom silk and hand embroidery, produced in small runs with named karigars credited on every piece.',
  },
  {
    name: 'Indigo Rail',
    code: 'INRL',
    originCountry: 'India',
    foundedYear: 2018,
    isPremium: false,
    sells: ['mens-jeans', 'womens-jeans-trousers'],
    description:
      'Denim specialists working with rope-dyed indigo and selvedge weaves from Ahmedabad mills. Straightforward cuts, honest weights, no distressing gimmicks.',
  },
  {
    name: 'Thread & Tide',
    code: 'TTDE',
    originCountry: 'India',
    foundedYear: 2019,
    isPremium: false,
    sells: ['mens-shirts', 'womens-tops', 'womens-co-ord-sets'],
    description:
      'Linen and linen-blend shirting for the Indian summer, garment-dyed so the colour settles rather than fades.',
  },
  {
    name: 'Kolam',
    code: 'KOLM',
    originCountry: 'India',
    foundedYear: 2013,
    isPremium: true,
    sells: ['sarees', 'dupattas-and-stoles'],
    description:
      'South Indian handloom revived for contemporary wardrobes — Kanjeevaram, Chettinad cotton and Ilkal, woven to order.',
  },
  {
    name: 'Verano',
    code: 'VRNO',
    originCountry: 'India',
    foundedYear: 2020,
    isPremium: false,
    sells: ['womens-dresses', 'womens-tops', 'womens-co-ord-sets', 'womens-heels'],
    description:
      'Warm-weather western wear in viscose and cotton-modal, designed around 40°C rather than a European spring.',
  },
  {
    name: 'Ash & Oak',
    code: 'ASOK',
    originCountry: 'India',
    foundedYear: 2017,
    isPremium: true,
    sells: ['mens-shirts', 'mens-trousers-chinos', 'mens-nehru-jackets'],
    description:
      'Menswear tailoring with a restrained palette: structured shirting, unlined jackets, and trousers drafted for a seated day.',
  },
  {
    name: 'Peechu',
    code: 'PCHU',
    originCountry: 'India',
    foundedYear: 2021,
    isPremium: false,
    sells: ['girls-clothing', 'boys-clothing', 'infants'],
    description:
      'Childrenswear in GOTS-certified cotton with flat seams and no scratchy labels, sized generously because children grow mid-season.',
  },
  {
    name: 'Nakshi',
    code: 'NKSH',
    originCountry: 'India',
    foundedYear: 2015,
    isPremium: true,
    sells: ['kurtas-and-suits', 'sarees', 'dupattas-and-stoles'],
    description:
      'Hand-embroidered kantha and chikankari, sourced from artisan clusters in West Bengal and Lucknow.',
  },
  {
    name: 'Terra Form',
    code: 'TRFM',
    originCountry: 'India',
    foundedYear: 2019,
    isPremium: false,
    sells: ['mens-sneakers'],
    description:
      'Sneakers and everyday footwear built on a recycled-rubber outsole, resoleable rather than disposable.',
  },
  {
    name: 'Juttiwala',
    code: 'JTWL',
    originCountry: 'India',
    foundedYear: 2012,
    isPremium: false,
    sells: ['womens-flats-and-juttis'],
    description:
      'Punjabi juttis and mojaris from Patiala, hand-stitched on leather soles with zari and thread work.',
  },
  {
    name: 'Halcyon',
    code: 'HLCN',
    originCountry: 'India',
    foundedYear: 2018,
    isPremium: true,
    sells: ['jewellery'],
    description:
      'Minimal fine jewellery in recycled sterling silver and 14k gold vermeil, made to be worn daily rather than kept in a box.',
  },
  {
    name: 'Bagh',
    code: 'BAGH',
    originCountry: 'India',
    foundedYear: 2016,
    isPremium: false,
    sells: ['bags-and-backpacks', 'belts-and-wallets'],
    description:
      'Canvas and vegetable-tanned leather bags, built around a repair-first warranty and replaceable hardware.',
  },
  {
    name: 'Neem & Co',
    code: 'NEEM',
    originCountry: 'India',
    foundedYear: 2020,
    isPremium: false,
    sells: ['skincare'],
    description:
      'Ayurvedic-adjacent skincare with full INCI disclosure, formulated for humid climates and oily skin.',
  },
  {
    name: 'Attar House',
    code: 'ATHS',
    originCountry: 'India',
    foundedYear: 2011,
    isPremium: true,
    sells: ['fragrance'],
    description:
      'Traditional deg-bhapka attars from Kannauj alongside modern alcohol-based eau de parfum.',
  },
  {
    name: 'Charpai',
    code: 'CHRP',
    originCountry: 'India',
    foundedYear: 2017,
    isPremium: false,
    sells: ['bed-linen', 'cushions-and-throws'],
    description:
      'Home textiles in handwoven cotton — bed linen, throws and cushion covers from looms in Panipat and Bhuj.',
  },
  {
    name: 'Rukh',
    code: 'RUKH',
    originCountry: 'India',
    foundedYear: 2022,
    isPremium: false,
    sells: ['mens-tshirts', 'mens-sweatshirts', 'womens-tops'],
    description:
      'Gender-neutral basics in heavyweight cotton jersey, cut boxy and pre-shrunk so the first wash changes nothing.',
  },
  {
    name: 'Meher Studio',
    code: 'MHRS',
    originCountry: 'India',
    foundedYear: 2015,
    isPremium: true,
    sells: ['lehenga-cholis', 'sarees'],
    description:
      'Bridal and festive lehengas with hand-cut zardozi, made to measure with a six-week lead time.',
  },
  {
    name: 'Cobble Row',
    code: 'CBRW',
    originCountry: 'India',
    foundedYear: 2014,
    isPremium: true,
    sells: ['mens-formal-shoes', 'womens-heels'],
    description:
      'Goodyear-welted leather shoes from Kanpur tanneries, resoleable and sold with a lifetime recrafting service.',
  },
  {
    name: 'Palash',
    code: 'PLSH',
    originCountry: 'India',
    foundedYear: 2019,
    isPremium: false,
    sells: ['kurtas-and-suits', 'womens-dresses', 'mens-kurtas'],
    description:
      'Naturally dyed cotton using madder, indigo and pomegranate rind, with a stated tolerance for batch variation.',
  },
];

/* ----------------------------------------------------------------- stores */

export interface SellerSeed {
  displayName: string;
  legalName: string;
  code: string;
  city: string;
  state: string;
  pincode: string;
  tagline: string;
  about: string;
  /** Brand codes this store carries. */
  brandCodes: string[];
  isFlagship: boolean;
}

export const SELLERS: SellerSeed[] = [
  {
    displayName: 'Mora Label Official',
    legalName: 'Mora Lifestyle Private Limited',
    code: 'MORA01',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    tagline: 'Hand block prints from Bagru, direct from the workshop',
    about:
      'We print, cut and stitch in one facility outside Jaipur with a team of 60. Selling direct means a kurta that would carry a three-times markup in a department store reaches you at workshop price. Every order ships within 24 hours on working days.',
    brandCodes: ['MORA', 'PLSH'],
    isFlagship: true,
  },
  {
    displayName: 'Saanjh Atelier',
    legalName: 'Saanjh Handlooms LLP',
    code: 'SNJH01',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    pincode: '221001',
    tagline: 'Banarasi weaves and hand embroidery, made to order',
    about:
      'A weaving family in its fourth generation, working with 22 handlooms in Varanasi. Occasion pieces are made to order with a stated lead time on every listing — we would rather quote six weeks honestly than ship something machine-made in six days.',
    brandCodes: ['SNJH', 'NKSH'],
    isFlagship: true,
  },
  {
    displayName: 'The Denim Depot',
    legalName: 'Indigo Rail Apparel Private Limited',
    code: 'INRL01',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380015',
    tagline: 'Rope-dyed denim, honest weights',
    about:
      'We list the exact ounce weight, shrinkage and stretch percentage of every pair, because "slim fit" means nothing on its own. Free hemming on all orders, and a two-year seam warranty.',
    brandCodes: ['INRL'],
    isFlagship: true,
  },
  {
    displayName: 'Ash & Oak Menswear',
    legalName: 'Ash And Oak Clothing Private Limited',
    code: 'ASOK01',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    tagline: 'Tailored menswear for a working week',
    about:
      'Shirting drafted for a desk and a commute rather than a runway. Our fit guide lists chest, shoulder and sleeve for every size, and we accept exchanges on fit for 30 days rather than the usual 14.',
    brandCodes: ['ASOK', 'TTDE'],
    isFlagship: true,
  },
  {
    displayName: 'Kolam Handloom House',
    legalName: 'Kolam Weaves Private Limited',
    code: 'KOLM01',
    city: 'Kanchipuram',
    state: 'Tamil Nadu',
    pincode: '631502',
    tagline: 'South Indian handloom, woven to order',
    about:
      'We work with 40 weaver families across Kanchipuram, Chettinad and Ilkal. Each saree lists the weaver, the loom days and the silk mark certification number.',
    brandCodes: ['KOLM'],
    isFlagship: false,
  },
  {
    displayName: 'Verano Summer Store',
    legalName: 'Verano Retail Ventures LLP',
    code: 'VRNO01',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400050',
    tagline: 'Western wear built for 40 degrees',
    about:
      'Everything we stock is tested for breathability and opacity in Indian light before it goes live. Same-day dispatch within Mumbai, next-day across metros.',
    brandCodes: ['VRNO', 'RUKH'],
    isFlagship: false,
  },
  {
    displayName: 'Peechu Kids',
    legalName: 'Peechu Childrenswear Private Limited',
    code: 'PCHU01',
    city: 'Tiruppur',
    state: 'Tamil Nadu',
    pincode: '641604',
    tagline: 'GOTS cotton, flat seams, no scratchy labels',
    about:
      'Childrenswear knitted and stitched in Tiruppur with OEKO-TEX certified dyes. Sizes run one age generous on purpose, and we publish the actual garment measurements so you can compare against something that already fits.',
    brandCodes: ['PCHU'],
    isFlagship: false,
  },
  {
    displayName: 'Terra Form Footwear',
    legalName: 'Terra Form Shoes Private Limited',
    code: 'TRFM01',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600096',
    tagline: 'Resoleable sneakers on recycled rubber',
    about:
      'Our sneakers are built to be resoled, not replaced. Send a worn pair back and we will recraft it for a third of the price of a new one.',
    brandCodes: ['TRFM'],
    isFlagship: false,
  },
  {
    displayName: 'Juttiwala Patiala',
    legalName: 'Juttiwala Handicrafts',
    code: 'JTWL01',
    city: 'Patiala',
    state: 'Punjab',
    pincode: '147001',
    tagline: 'Hand-stitched juttis on leather soles',
    about:
      'Three generations of jutti-making in Patiala. Each pair takes two days to stitch by hand. Sizing runs small — our listings state the equivalent UK size against a measured foot length in centimetres.',
    brandCodes: ['JTWL'],
    isFlagship: false,
  },
  {
    displayName: 'Halcyon Fine Jewellery',
    legalName: 'Halcyon Jewels Private Limited',
    code: 'HLCN01',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302015',
    tagline: 'Recycled silver and gold vermeil, hallmarked',
    about:
      'Every piece is BIS hallmarked and comes with a certificate of metal purity. Free resizing for a year, and we buy back our own pieces at metal value.',
    brandCodes: ['HLCN'],
    isFlagship: false,
  },
  {
    displayName: 'Bagh Leather Goods',
    legalName: 'Bagh Accessories LLP',
    code: 'BAGH01',
    city: 'Kolkata',
    state: 'West Bengal',
    pincode: '700019',
    tagline: 'Repairable canvas and leather, replaceable hardware',
    about:
      'We stock spare zips, buckles and straps for everything we have ever sold. A broken zip is a repair, not a write-off.',
    brandCodes: ['BAGH'],
    isFlagship: false,
  },
  {
    displayName: 'Neem & Co Apothecary',
    legalName: 'Neem And Company Wellness Private Limited',
    code: 'NEEM01',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    tagline: 'Full ingredient disclosure, formulated for humidity',
    about:
      'Every formula publishes its complete INCI list and the percentage of each active. Beauty is non-returnable once opened, so we sell sample sizes of everything first.',
    brandCodes: ['NEEM', 'ATHS'],
    isFlagship: false,
  },
  {
    displayName: 'Charpai Home',
    legalName: 'Charpai Home Textiles Private Limited',
    code: 'CHRP01',
    city: 'Bhuj',
    state: 'Gujarat',
    pincode: '370001',
    tagline: 'Handwoven bed linen from Kutch and Panipat',
    about:
      'Thread counts stated honestly by the international standard, not the inflated one. Bed linen is pre-washed so the first wash does not cost you two centimetres.',
    brandCodes: ['CHRP'],
    isFlagship: false,
  },
  {
    displayName: 'Meher Bridal Studio',
    legalName: 'Meher Studio Couture LLP',
    code: 'MHRS01',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110048',
    tagline: 'Made-to-measure bridal, six-week lead time',
    about:
      'Bridal lehengas cut to your measurements with two fittings included. We publish the lead time on every listing and hold to it — a wedding date is not a soft deadline.',
    brandCodes: ['MHRS'],
    isFlagship: false,
  },
  {
    displayName: 'Cobble Row Shoemakers',
    legalName: 'Cobble Row Footwear Private Limited',
    code: 'CBRW01',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    pincode: '208001',
    tagline: 'Goodyear-welted leather, recraftable for life',
    about:
      'Welted construction means the sole can be replaced without touching the upper. We offer recrafting at cost for the life of the shoe.',
    brandCodes: ['CBRW'],
    isFlagship: false,
  },
];

/* -------------------------------------------------------------- garments */

/**
 * Product archetypes, keyed by the leaf category they belong to.
 *
 * Each archetype is a real garment with a plausible price band, fabric set and
 * silhouette vocabulary. Titles are composed as
 * `<brand> <colour> <pattern> <fabric> <garment>` which is how fashion retail
 * actually names things, and which gives search and facets something true to
 * work against.
 */
export interface ArchetypeSeed {
  /** Leaf category slug. */
  category: string;
  garment: string;
  /** Selling price band in rupees, before discount. */
  price: [number, number];
  fabrics: string[];
  patterns: string[];
  silhouettes: string[];
  colors: string[];
  occasions: string[];
  /** Grams, for shipping weight. */
  weight: [number, number];
  care: string[];
  highlights: string[];
}

const COTTON_CARE = [
  'Machine wash cold with like colours',
  'Do not bleach',
  'Tumble dry low',
  'Warm iron on reverse',
];

const DELICATE_CARE = [
  'Dry clean only',
  'Do not bleach',
  'Steam iron on low through a cloth',
  'Store folded in a muslin bag',
];

const LEATHER_CARE = [
  'Wipe with a dry cloth',
  'Condition every three months',
  'Keep away from direct heat',
  'Use shoe trees to hold the shape',
];

export const ARCHETYPES: ArchetypeSeed[] = [
  {
    category: 'kurtas-and-suits',
    garment: 'Kurta',
    price: [899, 3499],
    fabrics: ['Cotton', 'Chanderi', 'Rayon', 'Linen Blend', 'Muslin'],
    patterns: ['Block Print', 'Bandhani', 'Floral', 'Solid', 'Ikat', 'Striped'],
    silhouettes: ['Anarkali', 'Straight', 'A-Line', 'Kaftan', 'Angrakha'],
    colors: ['indigo', 'mustard', 'maroon', 'off-white', 'teal', 'rust', 'sage', 'wine'],
    occasions: ['Daily', 'Office', 'Festive'],
    weight: [220, 420],
    care: COTTON_CARE,
    highlights: [
      'Side pockets deep enough for a phone',
      'Pre-shrunk, so the length holds after washing',
      'Lined yoke to keep the print opaque',
    ],
  },
  {
    category: 'kurtas-and-suits',
    garment: 'Kurta Set with Dupatta',
    price: [1899, 6999],
    fabrics: ['Chanderi', 'Cotton Silk', 'Muslin', 'Georgette'],
    patterns: ['Chikankari', 'Block Print', 'Zari Work', 'Floral'],
    silhouettes: ['Anarkali', 'Straight', 'Sharara Set', 'Palazzo Set'],
    colors: ['ivory', 'blush', 'bottle-green', 'navy', 'lavender', 'gold'],
    occasions: ['Festive', 'Wedding', 'Party'],
    weight: [450, 900],
    care: DELICATE_CARE,
    highlights: [
      'Three-piece set: kurta, bottom and dupatta',
      'Concealed side zip for an easy fit',
      'Dupatta finished with a hand-rolled edge',
    ],
  },
  {
    category: 'sarees',
    garment: 'Saree',
    price: [1499, 24999],
    fabrics: ['Kanjeevaram Silk', 'Chettinad Cotton', 'Georgette', 'Linen', 'Tussar Silk'],
    patterns: ['Temple Border', 'Zari Buti', 'Solid', 'Checked', 'Floral'],
    silhouettes: ['Traditional', 'Ready to Wear', 'Half and Half'],
    colors: ['maroon', 'bottle-green', 'mustard', 'teal', 'crimson', 'ivory', 'wine'],
    occasions: ['Wedding', 'Festive', 'Daily'],
    weight: [500, 1200],
    care: DELICATE_CARE,
    highlights: [
      'Comes with an unstitched blouse piece',
      'Silk Mark certified',
      'Handwoven — slight irregularity is proof of the loom',
    ],
  },
  {
    category: 'lehenga-cholis',
    garment: 'Lehenga Choli',
    price: [7999, 84999],
    fabrics: ['Raw Silk', 'Velvet', 'Georgette', 'Net'],
    patterns: ['Zardozi', 'Sequin', 'Mirror Work', 'Thread Embroidery'],
    silhouettes: ['A-Line', 'Flared', 'Mermaid', 'Panelled'],
    colors: ['maroon', 'wine', 'bottle-green', 'blush', 'gold', 'navy'],
    occasions: ['Wedding', 'Reception', 'Sangeet'],
    weight: [1800, 4200],
    care: DELICATE_CARE,
    highlights: [
      'Canvas-lined waistband so the flare sits right',
      'Choli with adjustable back tie',
      'Made to measure — two fittings included',
    ],
  },
  {
    category: 'dupattas-and-stoles',
    garment: 'Dupatta',
    price: [499, 2999],
    fabrics: ['Chiffon', 'Cotton', 'Chanderi', 'Silk'],
    patterns: ['Phulkari', 'Bandhani', 'Solid', 'Gota Patti'],
    silhouettes: ['Rectangular'],
    colors: ['fuchsia', 'mustard', 'ivory', 'indigo', 'crimson'],
    occasions: ['Festive', 'Daily'],
    weight: [120, 260],
    care: DELICATE_CARE,
    highlights: ['2.5 metres long', 'Hand-rolled edges', 'Weightless drape'],
  },
  {
    category: 'womens-dresses',
    garment: 'Dress',
    price: [1199, 5999],
    fabrics: ['Viscose', 'Cotton Poplin', 'Linen', 'Cotton Modal'],
    patterns: ['Floral', 'Solid', 'Striped', 'Polka Dot', 'Abstract'],
    silhouettes: ['Midi', 'Maxi', 'Shirt Dress', 'Wrap', 'Tiered'],
    colors: ['navy', 'sage', 'blush', 'black', 'rust', 'off-white', 'teal'],
    occasions: ['Daily', 'Office', 'Brunch', 'Party'],
    weight: [260, 520],
    care: COTTON_CARE,
    highlights: [
      'Fully lined, opaque in daylight',
      'Side pockets set into the seam',
      'Model is 5\'7" and wears a size S',
    ],
  },
  {
    category: 'womens-tops',
    garment: 'Top',
    price: [699, 2499],
    fabrics: ['Cotton', 'Viscose', 'Linen Blend', 'Crepe'],
    patterns: ['Solid', 'Floral', 'Striped', 'Textured'],
    silhouettes: ['Boxy', 'Fitted', 'Peplum', 'Oversized', 'Tunic'],
    colors: ['white', 'black', 'sky-blue', 'coral', 'olive', 'lavender'],
    occasions: ['Daily', 'Office'],
    weight: [140, 300],
    care: COTTON_CARE,
    highlights: ['Non-transparent single layer', 'Reinforced shoulder seams', 'Holds shape after wash'],
  },
  {
    category: 'womens-jeans-trousers',
    garment: 'Jeans',
    price: [1499, 4499],
    fabrics: ['Stretch Denim', 'Rigid Denim', 'Cotton Twill'],
    patterns: ['Solid', 'Washed'],
    silhouettes: ['High-Rise Straight', 'Wide Leg', 'Mom Fit', 'Skinny', 'Bootcut'],
    colors: ['indigo', 'black', 'light-grey', 'off-white'],
    occasions: ['Daily', 'Office'],
    weight: [420, 720],
    care: COTTON_CARE,
    highlights: [
      '11 oz denim with 2% elastane',
      'Rise and inseam printed on the label',
      'Free hemming on every order',
    ],
  },
  {
    category: 'womens-co-ord-sets',
    garment: 'Co-ord Set',
    price: [1799, 5499],
    fabrics: ['Cotton', 'Viscose', 'Linen Blend'],
    patterns: ['Solid', 'Striped', 'Floral', 'Checked'],
    silhouettes: ['Shirt and Trouser', 'Crop and Skirt', 'Kaftan Set'],
    colors: ['sage', 'off-white', 'navy', 'rust', 'khaki'],
    occasions: ['Daily', 'Brunch', 'Travel'],
    weight: [380, 700],
    care: COTTON_CARE,
    highlights: ['Sold as a set, sizes can be mixed on request', 'Elasticated back waist', 'Machine washable'],
  },
  {
    category: 'womens-flats-and-juttis',
    garment: 'Jutti',
    price: [899, 3499],
    fabrics: ['Leather', 'Velvet', 'Raw Silk'],
    patterns: ['Zari Embroidery', 'Thread Work', 'Mirror Work', 'Solid'],
    silhouettes: ['Closed Toe', 'Mojari', 'Slip On'],
    colors: ['gold', 'maroon', 'ivory', 'royal-blue', 'fuchsia'],
    occasions: ['Festive', 'Wedding', 'Daily'],
    weight: [320, 560],
    care: LEATHER_CARE,
    highlights: ['Hand-stitched on a leather sole', 'Cushioned footbed', 'Runs small — size up one'],
  },
  {
    category: 'womens-heels',
    garment: 'Heels',
    price: [1299, 4999],
    fabrics: ['Faux Leather', 'Suede', 'Satin'],
    patterns: ['Solid', 'Metallic'],
    silhouettes: ['Block Heel', 'Wedge', 'Kitten Heel', 'Stiletto'],
    colors: ['black', 'tan', 'gold', 'maroon', 'silver'],
    occasions: ['Party', 'Office', 'Wedding'],
    weight: [420, 780],
    care: LEATHER_CARE,
    highlights: ['Padded insole', 'Non-slip outsole', 'Heel height stated on every listing'],
  },
  {
    category: 'mens-shirts',
    garment: 'Shirt',
    price: [999, 3999],
    fabrics: ['Cotton Poplin', 'Oxford Cotton', 'Linen', 'Cotton Twill'],
    patterns: ['Solid', 'Checked', 'Striped', 'Printed'],
    silhouettes: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Camp Collar'],
    colors: ['white', 'sky-blue', 'navy', 'olive', 'charcoal', 'beige'],
    occasions: ['Office', 'Daily', 'Party'],
    weight: [200, 380],
    care: COTTON_CARE,
    highlights: [
      'Single-needle stitching at the collar and cuff',
      'Spare buttons stitched inside the placket',
      'Chest, shoulder and sleeve stated for every size',
    ],
  },
  {
    category: 'mens-tshirts',
    garment: 'T-Shirt',
    price: [499, 1999],
    fabrics: ['Combed Cotton', 'Cotton Jersey', 'Pima Cotton', 'Cotton Lycra'],
    patterns: ['Solid', 'Striped', 'Printed', 'Colour Block'],
    silhouettes: ['Regular Fit', 'Oversized', 'Slim Fit', 'Polo'],
    colors: ['black', 'white', 'navy', 'olive', 'grey-melange', 'mustard'],
    occasions: ['Daily', 'Gym', 'Travel'],
    weight: [150, 280],
    care: COTTON_CARE,
    highlights: ['180 GSM bio-washed cotton', 'Ribbed collar that holds its shape', 'Pre-shrunk'],
  },
  {
    category: 'mens-sweatshirts',
    garment: 'Sweatshirt',
    price: [1199, 3499],
    fabrics: ['Cotton Fleece', 'French Terry', 'Poly Cotton'],
    patterns: ['Solid', 'Printed', 'Colour Block'],
    silhouettes: ['Hoodie', 'Crew Neck', 'Zip Through', 'Oversized'],
    colors: ['charcoal', 'navy', 'olive', 'maroon', 'grey-melange'],
    occasions: ['Daily', 'Travel'],
    weight: [420, 720],
    care: COTTON_CARE,
    highlights: ['320 GSM brushed inner', 'Kangaroo pocket', 'Ribbed hem and cuffs'],
  },
  {
    category: 'mens-jeans',
    garment: 'Jeans',
    price: [1499, 5499],
    fabrics: ['Rope-Dyed Denim', 'Stretch Denim', 'Selvedge Denim'],
    patterns: ['Solid', 'Washed'],
    silhouettes: ['Slim Fit', 'Straight Fit', 'Relaxed Fit', 'Tapered'],
    colors: ['indigo', 'black', 'charcoal', 'light-grey'],
    occasions: ['Daily', 'Office'],
    weight: [520, 880],
    care: COTTON_CARE,
    highlights: [
      '12.5 oz rope-dyed denim',
      'Shrinkage and stretch percentage on the label',
      'Two-year seam warranty',
    ],
  },
  {
    category: 'mens-trousers-chinos',
    garment: 'Chinos',
    price: [1299, 3999],
    fabrics: ['Cotton Twill', 'Stretch Cotton', 'Linen Blend'],
    patterns: ['Solid', 'Textured'],
    silhouettes: ['Slim Fit', 'Regular Fit', 'Tapered'],
    colors: ['khaki', 'navy', 'olive', 'charcoal', 'beige'],
    occasions: ['Office', 'Daily'],
    weight: [380, 620],
    care: COTTON_CARE,
    highlights: ['Drafted for a seated day', 'Hidden comfort waistband', 'Unhemmed option available'],
  },
  {
    category: 'mens-kurtas',
    garment: 'Kurta',
    price: [999, 4999],
    fabrics: ['Cotton', 'Linen', 'Silk Blend', 'Khadi'],
    patterns: ['Solid', 'Self Design', 'Printed', 'Embroidered'],
    silhouettes: ['Straight', 'Pathani', 'Short Kurta', 'Kurta Pyjama Set'],
    colors: ['off-white', 'navy', 'maroon', 'olive', 'mustard', 'black'],
    occasions: ['Festive', 'Wedding', 'Daily'],
    weight: [280, 620],
    care: COTTON_CARE,
    highlights: ['Side slits for easy movement', 'Wooden buttons', 'Matching pyjama included'],
  },
  {
    category: 'mens-nehru-jackets',
    garment: 'Nehru Jacket',
    price: [1799, 6999],
    fabrics: ['Raw Silk', 'Cotton Silk', 'Jacquard', 'Velvet'],
    patterns: ['Solid', 'Self Design', 'Brocade'],
    silhouettes: ['Bandhgala', 'Quilted', 'Regular'],
    colors: ['navy', 'maroon', 'bottle-green', 'black', 'gold'],
    occasions: ['Wedding', 'Festive'],
    weight: [420, 780],
    care: DELICATE_CARE,
    highlights: ['Fully lined', 'Mandarin collar', 'Inner pocket'],
  },
  {
    category: 'mens-sneakers',
    garment: 'Sneakers',
    price: [1999, 7999],
    fabrics: ['Canvas', 'Leather', 'Knit Mesh', 'Suede'],
    patterns: ['Solid', 'Colour Block'],
    silhouettes: ['Court', 'Runner', 'Chunky', 'Low Top'],
    colors: ['white', 'black', 'navy', 'grey-melange', 'olive'],
    occasions: ['Daily', 'Gym', 'Travel'],
    weight: [620, 980],
    care: ['Wipe with a damp cloth', 'Air dry away from sunlight', 'Do not machine wash'],
    highlights: ['Recycled rubber outsole', 'Removable insole', 'Resoleable — send them back when worn'],
  },
  {
    category: 'mens-formal-shoes',
    garment: 'Formal Shoes',
    price: [2999, 12999],
    fabrics: ['Full Grain Leather', 'Calf Leather', 'Suede'],
    patterns: ['Solid', 'Brogued'],
    silhouettes: ['Oxford', 'Derby', 'Loafer', 'Monk Strap'],
    colors: ['black', 'tan', 'coffee', 'charcoal'],
    occasions: ['Office', 'Wedding'],
    weight: [780, 1200],
    care: LEATHER_CARE,
    highlights: ['Goodyear welted', 'Leather lined', 'Recraftable for the life of the shoe'],
  },
  {
    category: 'girls-clothing',
    garment: 'Dress',
    price: [599, 2299],
    fabrics: ['Cotton', 'Cotton Modal', 'Poplin'],
    patterns: ['Floral', 'Polka Dot', 'Solid', 'Printed'],
    silhouettes: ['Fit and Flare', 'A-Line', 'Tiered'],
    colors: ['blush', 'mint', 'lemon', 'lavender', 'white'],
    occasions: ['Daily', 'Party', 'Festive'],
    weight: [160, 320],
    care: COTTON_CARE,
    highlights: ['GOTS certified cotton', 'Flat seams, no scratchy labels', 'Runs one age generous'],
  },
  {
    category: 'boys-clothing',
    garment: 'T-Shirt & Shorts Set',
    price: [599, 1999],
    fabrics: ['Cotton Jersey', 'Combed Cotton'],
    patterns: ['Printed', 'Striped', 'Solid'],
    silhouettes: ['Regular Fit'],
    colors: ['navy', 'royal-blue', 'olive', 'grey-melange', 'mustard'],
    occasions: ['Daily', 'Play'],
    weight: [180, 340],
    care: COTTON_CARE,
    highlights: ['Elasticated waist with drawcord', 'Reinforced knees', 'OEKO-TEX certified dyes'],
  },
  {
    category: 'infants',
    garment: 'Romper',
    price: [449, 1499],
    fabrics: ['Organic Cotton', 'Cotton Interlock', 'Muslin'],
    patterns: ['Printed', 'Solid', 'Striped'],
    silhouettes: ['Sleeveless', 'Full Sleeve', 'Half Sleeve'],
    colors: ['ivory', 'mint', 'peach', 'sky-blue', 'lemon'],
    occasions: ['Daily', 'Sleep'],
    weight: [90, 200],
    care: COTTON_CARE,
    highlights: ['Nickel-free press studs at the crotch', 'Envelope neckline', 'GOTS certified'],
  },
  {
    category: 'bags-and-backpacks',
    garment: 'Backpack',
    price: [1299, 5999],
    fabrics: ['Waxed Canvas', 'Vegetable-Tanned Leather', 'Recycled Nylon'],
    patterns: ['Solid', 'Colour Block'],
    silhouettes: ['Backpack', 'Tote', 'Sling', 'Laptop Bag'],
    colors: ['coffee', 'black', 'olive', 'tan', 'navy'],
    occasions: ['Daily', 'Work', 'Travel'],
    weight: [520, 1100],
    care: LEATHER_CARE,
    highlights: ['Padded 15" laptop sleeve', 'YKK hardware, replaceable', 'Spare parts stocked for life'],
  },
  {
    category: 'jewellery',
    garment: 'Earrings',
    price: [699, 8999],
    fabrics: ['Sterling Silver', 'Gold Vermeil', 'Oxidised Silver', 'Brass'],
    patterns: ['Minimal', 'Kundan', 'Filigree', 'Jhumka'],
    silhouettes: ['Stud', 'Drop', 'Hoop', 'Jhumka'],
    colors: ['gold', 'silver', 'rose-gold'],
    occasions: ['Daily', 'Festive', 'Wedding'],
    weight: [8, 60],
    care: ['Remove before swimming', 'Store in the pouch provided', 'Polish with the cloth included'],
    highlights: ['BIS hallmarked', 'Hypoallergenic posts', 'Free resizing for a year'],
  },
  {
    category: 'belts-and-wallets',
    garment: 'Wallet',
    price: [799, 3499],
    fabrics: ['Full Grain Leather', 'Vegetable-Tanned Leather'],
    patterns: ['Solid', 'Textured'],
    silhouettes: ['Bifold', 'Card Holder', 'Zip Around'],
    colors: ['black', 'coffee', 'tan'],
    occasions: ['Daily', 'Gifting'],
    weight: [60, 180],
    care: LEATHER_CARE,
    highlights: ['RFID blocking', 'Six card slots', 'Ages into a patina'],
  },
  {
    category: 'skincare',
    garment: 'Face Serum',
    price: [499, 2999],
    fabrics: ['Niacinamide', 'Vitamin C', 'Hyaluronic Acid', 'Salicylic Acid'],
    patterns: ['Lightweight', 'Gel', 'Oil-Free'],
    silhouettes: ['Serum', 'Moisturiser', 'Cleanser', 'Sunscreen'],
    colors: ['multi'],
    occasions: ['Daily'],
    weight: [60, 220],
    care: ['Patch test before first use', 'Store below 25°C', 'Use within 6 months of opening'],
    highlights: ['Full INCI list published', 'Fragrance-free', 'Formulated for humid climates'],
  },
  {
    category: 'fragrance',
    garment: 'Eau de Parfum',
    price: [899, 6999],
    fabrics: ['Oud', 'Rose', 'Sandalwood', 'Jasmine', 'Vetiver'],
    patterns: ['Woody', 'Floral', 'Oriental', 'Fresh'],
    silhouettes: ['Attar', 'Eau de Parfum', 'Body Mist'],
    colors: ['multi'],
    occasions: ['Daily', 'Festive', 'Gifting'],
    weight: [90, 340],
    care: ['Store away from direct sunlight', 'Do not shake', 'Keep the cap on'],
    highlights: ['Deg-bhapka distilled in Kannauj', '8-hour wear', 'Alcohol-free option available'],
  },
  {
    category: 'bed-linen',
    garment: 'Bedsheet Set',
    price: [1299, 5999],
    fabrics: ['Handwoven Cotton', 'Percale Cotton', 'Sateen Cotton', 'Linen'],
    patterns: ['Solid', 'Striped', 'Block Print', 'Checked'],
    silhouettes: ['Single', 'Double', 'Queen', 'King'],
    colors: ['ivory', 'sage', 'indigo', 'beige', 'charcoal'],
    occasions: ['Home'],
    weight: [900, 2200],
    care: COTTON_CARE,
    highlights: ['Pre-washed, so it will not shrink', 'Honest 300 thread count', 'Two pillow covers included'],
  },
  {
    category: 'cushions-and-throws',
    garment: 'Cushion Cover',
    price: [399, 1899],
    fabrics: ['Handwoven Cotton', 'Jute Blend', 'Velvet'],
    patterns: ['Kantha', 'Ikat', 'Solid', 'Geometric'],
    silhouettes: ['16 x 16 in', '18 x 18 in', '12 x 20 in'],
    colors: ['mustard', 'indigo', 'ivory', 'rust', 'sage'],
    occasions: ['Home'],
    weight: [120, 320],
    care: COTTON_CARE,
    highlights: ['Concealed zip', 'Sold as a pair', 'Handwoven in Kutch'],
  },
];

/* ----------------------------------------------------------------- people */

/** Customer names used for demo accounts, orders and review authors. */
export const CUSTOMER_NAMES = [
  'Ananya Iyer', 'Rohan Mehta', 'Priya Nair', 'Arjun Deshpande', 'Sneha Kulkarni',
  'Vikram Rathore', 'Meera Krishnan', 'Aditya Bose', 'Kavya Reddy', 'Siddharth Jain',
  'Ishita Chatterjee', 'Nikhil Menon', 'Tara Sharma', 'Karan Malhotra', 'Divya Pillai',
  'Rahul Verma', 'Nandini Rao', 'Aman Gupta', 'Shruti Joshi', 'Varun Sethi',
  'Pooja Bhat', 'Harsh Agarwal', 'Ritika Saxena', 'Manav Choudhary', 'Aisha Qureshi',
  'Gaurav Pandey', 'Lakshmi Venkatesh', 'Zoya Ahmed', 'Dev Anand Rao', 'Neha Bansal',
  'Farhan Sheikh', 'Anjali Dutta', 'Sameer Kapoor', 'Ruchi Trivedi', 'Yash Thakur',
  'Bhavna Shetty', 'Imran Khan', 'Swati Ghosh', 'Nitin Rawat', 'Preeti Chauhan',
];

export const CITIES: Array<{ city: string; state: string; pincode: string }> = [
  { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  { city: 'New Delhi', state: 'Delhi', pincode: '110001' },
  { city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
  { city: 'Kolkata', state: 'West Bengal', pincode: '700001' },
  { city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
  { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
  { city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
  { city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
  { city: 'Kochi', state: 'Kerala', pincode: '682001' },
  { city: 'Chandigarh', state: 'Chandigarh', pincode: '160001' },
  { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
  { city: 'Bhubaneswar', state: 'Odisha', pincode: '751001' },
  { city: 'Guwahati', state: 'Assam', pincode: '781001' },
];

export const STREET_NAMES = [
  'Nehru Road', 'MG Road', 'Bannerghatta Road', 'Linking Road', 'Park Street',
  'Residency Road', 'Anna Salai', 'Chandni Chowk', 'Koregaon Park', 'Marine Drive',
  'Jubilee Hills Road No. 5', 'Sector 17', 'Vasant Kunj Marg', 'Salt Lake Sector V',
];

export const LANDMARKS = [
  'Opposite the metro station', 'Near the water tank', 'Behind the community hall',
  'Next to the SBI ATM', 'Above the pharmacy', 'Near the bus depot',
];

/* ---------------------------------------------------------------- reviews */

/**
 * Review bodies, bucketed by star rating. Written as things people actually
 * complain about and praise in fashion — fit, fabric weight, colour accuracy,
 * delivery — so that the review summary and the "fit true to size" statistic
 * mean something.
 */
export const REVIEW_BODIES: Record<number, string[]> = {
  5: [
    'Fabric is exactly as described — thick enough to be opaque, light enough for Chennai humidity. Ordered my usual size and it fits.',
    'Third one I have bought from this seller. Stitching holds up, colour has not run after a dozen washes.',
    'Arrived two days early. The block print is slightly irregular in places, which is what hand printing looks like. Very happy.',
    'Fit is true to the size chart. I measured against a shirt I own and it matched to the centimetre.',
    'Worth the price. The lining makes a real difference and the pockets are deep enough to actually use.',
  ],
  4: [
    'Good quality overall. Sleeve length runs slightly long on me at 5\'4", easy enough to get altered.',
    'Colour is a shade darker than the photos but I like it more this way. Fabric and fit are spot on.',
    'Comfortable and well made. Took a week to arrive which was longer than the estimate said.',
    'Fits well after a wash — it was slightly stiff out of the packet. Would buy again.',
    'Solid piece for the price. Only wish it came in more colours.',
  ],
  3: [
    'Fabric is decent but the fit is boxier than the photos suggest. Sized down and it was better.',
    'It is fine. Nothing wrong with it, nothing special either. Delivery was quick.',
    'Colour matches, quality is average. The stitching at the hem was a little uneven.',
    'Runs large. I would recommend ordering one size below your usual.',
  ],
  2: [
    'Thinner than I expected from the description. Needs a slip underneath.',
    'The size chart is off for this one — ordered M as always and it was closer to an L.',
    'Colour was noticeably different from the listing photos. Returned it, refund came through in four days.',
  ],
  1: [
    'Seam came apart at the shoulder on the second wear. Raised a return, seller responded quickly.',
    'Wrong size delivered. The exchange was handled without fuss but I needed it for an event.',
  ],
};

export const REVIEW_TITLES: Record<number, string[]> = {
  5: ['Exactly as described', 'Buying another', 'Excellent fabric', 'True to size', 'Worth every rupee'],
  4: ['Very good, minor niggle', 'Happy with this', 'Good but runs long', 'Solid buy'],
  3: ['Average', 'Fit is off', 'Does the job', 'Just okay'],
  2: ['Not as pictured', 'Sizing is wrong', 'Thinner than expected'],
  1: ['Fell apart quickly', 'Wrong item sent'],
};
