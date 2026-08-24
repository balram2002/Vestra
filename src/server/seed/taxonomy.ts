import type { Gender, SizeSystem } from '@/domain/attributes';

/**
 * The category tree.
 *
 * Written out by hand rather than generated, because the taxonomy IS the
 * information architecture: it decides the mega menu, the facet sets, the
 * size system on each product form, and the GST slab applied at checkout.
 * Generated noise here would produce a shop nobody could navigate.
 *
 * Depth 0 is a department (what the mega menu columns are built from), depth 1
 * a shelf, depth 2 the leaf a product actually hangs on.
 */

export interface CategorySeed {
  slug: string;
  name: string;
  gender: Gender | null;
  sizeSystem: SizeSystem;
  attributeFamily: string;
  /** GST slab. Apparel splits by price at checkout; this is the fallback. */
  taxRatePercent: number;
  returnable: boolean;
  featured?: boolean;
  iconKey: string;
  description: string;
  seoIntro?: string;
  children?: CategorySeed[];
}

export const TAXONOMY: CategorySeed[] = [
  {
    slug: 'women',
    name: 'Women',
    gender: 'WOMEN',
    sizeSystem: 'ALPHA',
    attributeFamily: 'apparel',
    taxRatePercent: 12,
    returnable: true,
    featured: true,
    iconKey: 'women',
    description: 'Everyday and occasion wear for women.',
    seoIntro:
      'From block-printed cotton kurtas for a working week to hand-embroidered lehengas for a wedding, the women’s edit spans daily wear, workwear and occasion dressing across sizes XS to 5XL.',
    children: [
      {
        slug: 'womens-ethnic-wear',
        name: 'Ethnic Wear',
        gender: 'WOMEN',
        sizeSystem: 'INDIAN_WOMENS',
        attributeFamily: 'ethnic',
        taxRatePercent: 12,
        returnable: true,
        featured: true,
        iconKey: 'kurta',
        description: 'Kurtas, sarees, lehengas and suit sets.',
        children: [
          {
            slug: 'kurtas-and-suits',
            name: 'Kurtas & Suit Sets',
            gender: 'WOMEN',
            sizeSystem: 'INDIAN_WOMENS',
            attributeFamily: 'ethnic',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'kurta',
            description: 'Straight, A-line and Anarkali kurtas, with and without dupattas.',
            seoIntro:
              'Cotton for the commute, chanderi and silk blends for evenings. Every kurta lists its fabric, lining and sleeve length so the fit is no surprise.',
          },
          {
            slug: 'sarees',
            name: 'Sarees',
            gender: 'WOMEN',
            sizeSystem: 'ONE_SIZE',
            attributeFamily: 'ethnic',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'saree',
            description: 'Handloom, silk, georgette and ready-to-wear sarees.',
            seoIntro:
              'Handloom cottons, Banarasi silks and lightweight georgettes, each listed with blouse-piece details and drape weight.',
          },
          {
            slug: 'lehenga-cholis',
            name: 'Lehenga Cholis',
            gender: 'WOMEN',
            sizeSystem: 'INDIAN_WOMENS',
            attributeFamily: 'ethnic',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'lehenga',
            description: 'Bridal and festive lehenga sets.',
          },
          {
            slug: 'dupattas-and-stoles',
            name: 'Dupattas & Stoles',
            gender: 'WOMEN',
            sizeSystem: 'ONE_SIZE',
            attributeFamily: 'ethnic',
            taxRatePercent: 5,
            returnable: true,
            iconKey: 'dupatta',
            description: 'Phulkari, bandhani and plain chiffon dupattas.',
          },
        ],
      },
      {
        slug: 'womens-western-wear',
        name: 'Western Wear',
        gender: 'WOMEN',
        sizeSystem: 'ALPHA',
        attributeFamily: 'apparel',
        taxRatePercent: 12,
        returnable: true,
        featured: true,
        iconKey: 'dress',
        description: 'Dresses, tops, jeans and co-ord sets.',
        children: [
          {
            slug: 'womens-dresses',
            name: 'Dresses',
            gender: 'WOMEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'apparel',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'dress',
            description: 'Midi, maxi, shirt and wrap dresses.',
            seoIntro:
              'Midi and maxi lengths cut for Indian summers — breathable cottons, viscose blends and linens, with model height and worn size listed on every product.',
          },
          {
            slug: 'womens-tops',
            name: 'Tops & Shirts',
            gender: 'WOMEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'apparel',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'top',
            description: 'Blouses, shirts, tunics and crop tops.',
          },
          {
            slug: 'womens-jeans-trousers',
            name: 'Jeans & Trousers',
            gender: 'WOMEN',
            sizeSystem: 'NUMERIC_WAIST',
            attributeFamily: 'bottomwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'jeans',
            description: 'High-rise jeans, wide-leg trousers and cigarette pants.',
          },
          {
            slug: 'womens-co-ord-sets',
            name: 'Co-ord Sets',
            gender: 'WOMEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'apparel',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'coord',
            description: 'Matching two-piece sets for work and weekends.',
          },
        ],
      },
      {
        slug: 'womens-footwear',
        name: 'Footwear',
        gender: 'WOMEN',
        sizeSystem: 'FOOTWEAR_UK',
        attributeFamily: 'footwear',
        taxRatePercent: 12,
        returnable: true,
        iconKey: 'heels',
        description: 'Flats, heels, juttis and sneakers.',
        children: [
          {
            slug: 'womens-flats-and-juttis',
            name: 'Flats & Juttis',
            gender: 'WOMEN',
            sizeSystem: 'FOOTWEAR_UK',
            attributeFamily: 'footwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'jutti',
            description: 'Everyday flats, mojaris and embroidered juttis.',
          },
          {
            slug: 'womens-heels',
            name: 'Heels',
            gender: 'WOMEN',
            sizeSystem: 'FOOTWEAR_UK',
            attributeFamily: 'footwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'heels',
            description: 'Block heels, wedges and stilettos.',
          },
        ],
      },
    ],
  },
  {
    slug: 'men',
    name: 'Men',
    gender: 'MEN',
    sizeSystem: 'ALPHA',
    attributeFamily: 'apparel',
    taxRatePercent: 12,
    returnable: true,
    featured: true,
    iconKey: 'men',
    description: 'Shirts, tees, trousers and ethnic wear for men.',
    seoIntro:
      'Office shirts that survive a commute, weekend tees that hold their shape, and kurta sets for the festive calendar — sized S to 5XL with fabric and fit stated plainly.',
    children: [
      {
        slug: 'mens-topwear',
        name: 'Topwear',
        gender: 'MEN',
        sizeSystem: 'ALPHA',
        attributeFamily: 'apparel',
        taxRatePercent: 12,
        returnable: true,
        featured: true,
        iconKey: 'shirt',
        description: 'Shirts, T-shirts, polos and sweatshirts.',
        children: [
          {
            slug: 'mens-shirts',
            name: 'Shirts',
            gender: 'MEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'apparel',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'shirt',
            description: 'Formal, casual and linen shirts.',
            seoIntro:
              'Poplin and oxford weaves for the office, washed linen for the weekend. Collar type, cuff and fit are listed on every shirt so a size stays a size.',
          },
          {
            slug: 'mens-tshirts',
            name: 'T-Shirts',
            gender: 'MEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'apparel',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'tshirt',
            description: 'Round neck, polo and oversized T-shirts.',
          },
          {
            slug: 'mens-sweatshirts',
            name: 'Sweatshirts & Hoodies',
            gender: 'MEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'apparel',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'hoodie',
            description: 'Fleece and terry sweatshirts.',
          },
        ],
      },
      {
        slug: 'mens-bottomwear',
        name: 'Bottomwear',
        gender: 'MEN',
        sizeSystem: 'NUMERIC_WAIST',
        attributeFamily: 'bottomwear',
        taxRatePercent: 12,
        returnable: true,
        iconKey: 'trousers',
        description: 'Jeans, chinos, trousers and shorts.',
        children: [
          {
            slug: 'mens-jeans',
            name: 'Jeans',
            gender: 'MEN',
            sizeSystem: 'NUMERIC_WAIST',
            attributeFamily: 'bottomwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'jeans',
            description: 'Slim, straight and relaxed-fit denim.',
          },
          {
            slug: 'mens-trousers-chinos',
            name: 'Trousers & Chinos',
            gender: 'MEN',
            sizeSystem: 'NUMERIC_WAIST',
            attributeFamily: 'bottomwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'trousers',
            description: 'Cotton chinos and formal trousers.',
          },
        ],
      },
      {
        slug: 'mens-ethnic-wear',
        name: 'Ethnic Wear',
        gender: 'MEN',
        sizeSystem: 'ALPHA',
        attributeFamily: 'ethnic',
        taxRatePercent: 12,
        returnable: true,
        iconKey: 'kurta',
        description: 'Kurtas, kurta sets, nehru jackets and sherwanis.',
        children: [
          {
            slug: 'mens-kurtas',
            name: 'Kurtas & Kurta Sets',
            gender: 'MEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'ethnic',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'kurta',
            description: 'Cotton, silk-blend and linen kurtas.',
          },
          {
            slug: 'mens-nehru-jackets',
            name: 'Nehru Jackets',
            gender: 'MEN',
            sizeSystem: 'ALPHA',
            attributeFamily: 'ethnic',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'jacket',
            description: 'Bandhgala and quilted nehru jackets.',
          },
        ],
      },
      {
        slug: 'mens-footwear',
        name: 'Footwear',
        gender: 'MEN',
        sizeSystem: 'FOOTWEAR_UK',
        attributeFamily: 'footwear',
        taxRatePercent: 12,
        returnable: true,
        iconKey: 'sneaker',
        description: 'Sneakers, formal shoes, sandals and juttis.',
        children: [
          {
            slug: 'mens-sneakers',
            name: 'Sneakers',
            gender: 'MEN',
            sizeSystem: 'FOOTWEAR_UK',
            attributeFamily: 'footwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'sneaker',
            description: 'Court, runner and chunky sneakers.',
          },
          {
            slug: 'mens-formal-shoes',
            name: 'Formal Shoes',
            gender: 'MEN',
            sizeSystem: 'FOOTWEAR_UK',
            attributeFamily: 'footwear',
            taxRatePercent: 12,
            returnable: true,
            iconKey: 'derby',
            description: 'Oxfords, derbies and loafers in leather.',
          },
        ],
      },
    ],
  },
  {
    slug: 'kids',
    name: 'Kids',
    gender: 'UNISEX',
    sizeSystem: 'KIDS_AGE',
    attributeFamily: 'kids',
    taxRatePercent: 5,
    returnable: true,
    featured: true,
    iconKey: 'kids',
    description: 'Clothing and footwear for babies, boys and girls.',
    seoIntro:
      'Sized by age and checked for skin-safe dyes. Everything in the kids edit lists fabric weight and wash care, because a school uniform lives in the machine.',
    children: [
      {
        slug: 'girls-clothing',
        name: 'Girls Clothing',
        gender: 'GIRLS',
        sizeSystem: 'KIDS_AGE',
        attributeFamily: 'kids',
        taxRatePercent: 5,
        returnable: true,
        iconKey: 'girl',
        description: 'Frocks, ethnic sets and everyday separates.',
      },
      {
        slug: 'boys-clothing',
        name: 'Boys Clothing',
        gender: 'BOYS',
        sizeSystem: 'KIDS_AGE',
        attributeFamily: 'kids',
        taxRatePercent: 5,
        returnable: true,
        iconKey: 'boy',
        description: 'T-shirts, shorts, kurta sets and shirts.',
      },
      {
        slug: 'infants',
        name: 'Baby (0-2 yrs)',
        gender: 'BABY',
        sizeSystem: 'KIDS_AGE',
        attributeFamily: 'kids',
        taxRatePercent: 5,
        returnable: true,
        iconKey: 'baby',
        description: 'Bodysuits, rompers and sleepsuits in soft cotton.',
      },
    ],
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    gender: 'UNISEX',
    sizeSystem: 'ONE_SIZE',
    attributeFamily: 'accessories',
    taxRatePercent: 18,
    returnable: true,
    featured: true,
    iconKey: 'bag',
    description: 'Bags, belts, jewellery, watches and scarves.',
    children: [
      {
        slug: 'bags-and-backpacks',
        name: 'Bags & Backpacks',
        gender: 'UNISEX',
        sizeSystem: 'ONE_SIZE',
        attributeFamily: 'accessories',
        taxRatePercent: 18,
        returnable: true,
        iconKey: 'bag',
        description: 'Totes, slings, backpacks and laptop bags.',
      },
      {
        slug: 'jewellery',
        name: 'Jewellery',
        gender: 'WOMEN',
        sizeSystem: 'ONE_SIZE',
        attributeFamily: 'accessories',
        taxRatePercent: 18,
        returnable: true,
        iconKey: 'jewellery',
        description: 'Oxidised silver, kundan and everyday minimal pieces.',
      },
      {
        slug: 'belts-and-wallets',
        name: 'Belts & Wallets',
        gender: 'UNISEX',
        sizeSystem: 'ONE_SIZE',
        attributeFamily: 'accessories',
        taxRatePercent: 18,
        returnable: true,
        iconKey: 'wallet',
        description: 'Leather belts, card holders and wallets.',
      },
    ],
  },
  {
    slug: 'beauty',
    name: 'Beauty',
    gender: 'UNISEX',
    sizeSystem: 'VOLUME',
    attributeFamily: 'beauty',
    taxRatePercent: 18,
    // Opened cosmetics cannot go back on the shelf.
    returnable: false,
    iconKey: 'beauty',
    description: 'Skincare, haircare and fragrance.',
    seoIntro:
      'Ingredient lists, shelf life and patch-test guidance are printed on every product page. Beauty is non-returnable once the seal is broken.',
    children: [
      {
        slug: 'skincare',
        name: 'Skincare',
        gender: 'UNISEX',
        sizeSystem: 'VOLUME',
        attributeFamily: 'beauty',
        taxRatePercent: 18,
        returnable: false,
        iconKey: 'skincare',
        description: 'Cleansers, serums, moisturisers and sunscreen.',
      },
      {
        slug: 'fragrance',
        name: 'Fragrance',
        gender: 'UNISEX',
        sizeSystem: 'VOLUME',
        attributeFamily: 'beauty',
        taxRatePercent: 18,
        returnable: false,
        iconKey: 'fragrance',
        description: 'Attars, eau de parfum and body mists.',
      },
    ],
  },
  {
    slug: 'home-and-living',
    name: 'Home & Living',
    gender: null,
    sizeSystem: 'ONE_SIZE',
    attributeFamily: 'home',
    taxRatePercent: 12,
    returnable: true,
    iconKey: 'home',
    description: 'Bed linen, cushions, rugs and table linen.',
    children: [
      {
        slug: 'bed-linen',
        name: 'Bed Linen',
        gender: null,
        sizeSystem: 'ONE_SIZE',
        attributeFamily: 'home',
        taxRatePercent: 12,
        returnable: true,
        iconKey: 'bed',
        description: 'Bedsheets, duvet covers and pillow cases.',
      },
      {
        slug: 'cushions-and-throws',
        name: 'Cushions & Throws',
        gender: null,
        sizeSystem: 'ONE_SIZE',
        attributeFamily: 'home',
        taxRatePercent: 12,
        returnable: true,
        iconKey: 'cushion',
        description: 'Handwoven cushion covers and cotton throws.',
      },
    ],
  },
];

/** Flatten the tree into the rows that go into the `categories` collection. */
export interface FlatCategorySeed extends Omit<CategorySeed, 'children'> {
  path: string[];
  parentSlug: string | null;
  depth: number;
  position: number;
}

export function flattenTaxonomy(): FlatCategorySeed[] {
  const out: FlatCategorySeed[] = [];

  const walk = (nodes: CategorySeed[], parentSlug: string | null, path: string[], depth: number) => {
    nodes.forEach((node, index) => {
      const nextPath = [...path, node.slug];
      const { children, ...rest } = node;
      out.push({ ...rest, path: nextPath, parentSlug, depth, position: index });
      if (children?.length) walk(children, node.slug, nextPath, depth + 1);
    });
  };

  walk(TAXONOMY, null, [], 0);
  return out;
}

/** Leaves are where products actually hang. */
export function leafCategories(): FlatCategorySeed[] {
  const flat = flattenTaxonomy();
  const parents = new Set(flat.map((c) => c.parentSlug).filter(Boolean));
  return flat.filter((c) => !parents.has(c.slug));
}
