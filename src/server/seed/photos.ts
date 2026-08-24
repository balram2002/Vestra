import { hashString } from '@/lib/random';

import type { MediaShape } from './media';

/**
 * Representative product photography.
 *
 * The generated SVG in `/api/media` is honest — it reflects the product's real
 * colour and silhouette — but it is vector art, and a shop full of vector art
 * does not read as a shop. These are real photographs, which is what actually
 * makes a storefront look like one.
 *
 * WHAT THESE ARE AND ARE NOT
 *
 * Every id below is a real, verified Unsplash photograph, free to use under the
 * Unsplash licence. They stand in for seller photography that does not exist
 * yet. They are chosen to match the FAMILY of the product (apparel, footwear,
 * accessories, beauty, home) but they are NOT photographs of the specific
 * generated product, and they must be replaced with real seller uploads before
 * this is a live shop. That is the single caveat on this dataset, and it is
 * recorded in AGENTS.md too.
 *
 * The trade-off is deliberate: an obviously-representative photo communicates
 * "this is where the product shot goes" far better than a flat vector shape,
 * and every layout decision downstream — crop, aspect, hover, gallery — can
 * then be judged against something realistic.
 *
 * Set MEDIA_SOURCE=generated to fall back to the SVG renderer, which needs no
 * network at all.
 */

const UNSPLASH = 'https://images.unsplash.com/';

/**
 * Pools by product family.
 *
 * Grouped rather than mapped one-to-one so a category with forty styles does
 * not repeat the same three photographs down the grid.
 */
const POOLS: Record<string, string[]> = {
  apparel: [
    'photo-1490481651871-ab68de25d43d',
    'photo-1483985988355-763728e1935b',
    'photo-1441984904996-e0b6ba687e04',
    'photo-1469334031218-e382a71b716b',
    'photo-1539109136881-3be0616acf4b',
    'photo-1467043237213-65f2da53396f',
    'photo-1515886657613-9f3515b0c78f',
    'photo-1496747611176-843222e1e57c',
    'photo-1479064555552-3ef4979f8908',
    'photo-1434389677669-e08b4cac3105',
    'photo-1521572163474-6864f9cf17ab',
    'photo-1503342217505-b0a15ec3261c',
    'photo-1485462537746-965f33f7f6a7',
    'photo-1462927114214-6956d2fddd4e',
    'photo-1495121605193-b116b5b9c5fe',
    'photo-1524758631624-e2822e304c36',
    'photo-1512436991641-6745cdb1723f',
    'photo-1556905055-8f358a7a47b2',
    'photo-1594633312681-425c7b97ccd1',
    'photo-1571945153237-4929e783af4a',
    'photo-1607522370275-f14206abe5d3',
    'photo-1595950653106-6c9ebd614d3a',
    'photo-1600185365483-26d7a4cc7519',
    'photo-1596755094514-f87e34085b2c',
    'photo-1618354691373-d851c5c3a990',
    'photo-1591047139829-d91aecb6caea',
    'photo-1552346154-21d32810aba3',
    'photo-1549062572-544a64fb0c56',
    'photo-1611652022419-a9419f74343d',
    'photo-1576566588028-4147f3842f27',
    'photo-1598300042247-d088f8ab3a91',
    'photo-1617038220319-276d3cfab638',
    'photo-1585487000160-6ebcfceb0d03',
    'photo-1526170375885-4d8ecf77b99f',
  ],
  footwear: [
    'photo-1445205170230-053b83016050',
    'photo-1554568218-0f1715e72254',
    'photo-1544022613-e87ca75a784a',
    'photo-1608231387042-66d1773070a5',
    'photo-1560769629-975ec94e6a86',
    'photo-1587563871167-1ee9c731aefb',
    'photo-1595777457583-95e059d581b8',
    'photo-1549298916-b41d501d3772',
  ],
  accessory: [
    'photo-1523381210434-271e8be1f52b',
    'photo-1553062407-98eeb64c6a62',
    'photo-1620799140408-edc6dcb6d633',
    'photo-1591561954557-26941169b49e',
    'photo-1610030469983-98e550d6193c',
    'photo-1596462502278-27bfdc403348',
  ],
  beauty: [
    'photo-1556228720-195a672e8a03',
    'photo-1522335789203-aabd1fc54bc9',
    'photo-1563170351-be82bc888aa4',
    'photo-1550009158-9ebf69173e03',
    'photo-1571781926291-c477ebfd024b',
  ],
  home: [
    'photo-1583743814966-8936f5b7be1a',
    'photo-1490114538077-0a7f8cb49891',
    'photo-1522708323590-d24dbb6b0267',
    'photo-1616486338812-3dadae4b4ace',
    'photo-1567016432779-094069958ea5',
    'photo-1631214540553-ff044a3ff1d4',
  ],
};

/** Which pool a silhouette draws from. */
const FAMILY: Record<MediaShape, keyof typeof POOLS> = {
  kurta: 'apparel',
  saree: 'apparel',
  lehenga: 'apparel',
  dress: 'apparel',
  top: 'apparel',
  shirt: 'apparel',
  tshirt: 'apparel',
  jeans: 'apparel',
  jacket: 'apparel',
  shoe: 'footwear',
  sneaker: 'footwear',
  bag: 'accessory',
  jewellery: 'accessory',
  bottle: 'beauty',
  linen: 'home',
  generic: 'apparel',
};

/**
 * A stable photo for a given product/view.
 *
 * Keyed off the product AND the view index, so a gallery shows five different
 * photographs rather than the same one five times, and re-seeding produces the
 * identical assignment.
 */
export function photoFor(shape: MediaShape, key: string, view: number): string {
  const pool = POOLS[FAMILY[shape]] ?? POOLS.apparel!;
  // Offsetting by the view walks the pool rather than re-hashing, so the shots
  // in one gallery are guaranteed distinct as long as the pool is big enough.
  const index = (hashString(key) + view * 7) % pool.length;
  return pool[index]!;
}

/** Build a cropped, format-negotiated URL at the size the layout needs. */
export function photoUrl(
  shape: MediaShape,
  key: string,
  view: number,
  size: { w: number; h: number } = { w: 900, h: 1200 },
): string {
  const id = photoFor(shape, key, view);

  /*
   * The pool is smaller than the catalogue, so photographs necessarily repeat.
   * Varying the crop anchor per product makes two products sharing a source
   * image read as two different shots rather than as an obvious duplicate.
   */
  const anchors = ['entropy', 'faces', 'top', 'center', 'edges'] as const;
  const crop = anchors[hashString(`${key}:${view}:crop`) % anchors.length]!;

  const params = new URLSearchParams({
    auto: 'format',
    fit: 'crop',
    crop,
    w: String(size.w),
    h: String(size.h),
    q: '80',
  });
  return `${UNSPLASH}${id}?${params.toString()}`;
}

/**
 * Which pool a category slug belongs to.
 *
 * Without this every tile drew from `apparel` and the Fragrance tile showed a
 * sneaker — the single most obvious way a generated catalogue gives itself
 * away.
 */
function familyForKey(key: string): keyof typeof POOLS {
  const k = key.toLowerCase();
  if (/shoe|sneaker|footwear|jutti|heel|boot/.test(k)) return 'footwear';
  if (/bag|backpack|wallet|belt|jewel|earring|accessor/.test(k)) return 'accessory';
  if (/beauty|skincare|fragrance|serum|parfum|attar/.test(k)) return 'beauty';
  if (/home|linen|bed|cushion|throw|living/.test(k)) return 'home';
  return 'apparel';
}

/** Wide crop for heroes, banners and category tiles. */
export function scenePhotoUrl(key: string, size: { w: number; h: number }): string {
  const pool = POOLS[familyForKey(key)] ?? POOLS.apparel!;
  const id = pool[hashString(key) % pool.length]!;
  const params = new URLSearchParams({
    auto: 'format',
    fit: 'crop',
    crop: 'entropy',
    w: String(size.w),
    h: String(size.h),
    q: '80',
  });
  return `${UNSPLASH}${id}?${params.toString()}`;
}

/**
 * Whether to use photography.
 *
 * Defaults on. `MEDIA_SOURCE=generated` switches the whole catalogue back to
 * the first-party SVG renderer, which is what to use offline, in CI, or if the
 * external dependency is unacceptable.
 */
export function photosEnabled(): boolean {
  return (process.env.MEDIA_SOURCE ?? 'photo') !== 'generated';
}
