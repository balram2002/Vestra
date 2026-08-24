/**
 * Fashion attribute taxonomy.
 *
 * These vocabularies are the single source for: seller product forms, storefront
 * filter facets, size charts, search synonyms and demo-data generation. Adding a
 * value here makes it available everywhere at once.
 *
 * The platform is deliberately generic -- `AttributeGroup` is keyed by category
 * family, so electronics or beauty can be added without touching fashion.
 */

export interface AttributeOption {
  value: string;
  label: string;
  /** Optional swatch for colour-like attributes. */
  hex?: string;
  /** Optional grouping used to collapse long facet lists. */
  group?: string;
}

/* --------------------------------------------------------------- colours */

/**
 * Colour families. Shoppers filter by family ("Blue"), sellers list a specific
 * shade ("Indigo"), so every shade maps to exactly one family.
 */
export interface ColorDefinition extends AttributeOption {
  family: string;
  hex: string;
}

export const COLORS: ColorDefinition[] = [
  { value: 'black', label: 'Black', family: 'Black', hex: '#16161A' },
  { value: 'charcoal', label: 'Charcoal', family: 'Grey', hex: '#3A3A3E' },
  { value: 'grey-melange', label: 'Grey Melange', family: 'Grey', hex: '#8E8E93' },
  { value: 'light-grey', label: 'Light Grey', family: 'Grey', hex: '#C7C7CC' },
  { value: 'white', label: 'White', family: 'White', hex: '#FFFFFF' },
  { value: 'off-white', label: 'Off White', family: 'White', hex: '#F3EFE7' },
  { value: 'ivory', label: 'Ivory', family: 'White', hex: '#EDE6D6' },
  { value: 'beige', label: 'Beige', family: 'Beige', hex: '#D9C7AC' },
  { value: 'khaki', label: 'Khaki', family: 'Beige', hex: '#B7A177' },
  { value: 'tan', label: 'Tan', family: 'Brown', hex: '#A9784F' },
  { value: 'coffee', label: 'Coffee', family: 'Brown', hex: '#5A3A2A' },
  { value: 'navy', label: 'Navy', family: 'Blue', hex: '#1F2A44' },
  { value: 'indigo', label: 'Indigo', family: 'Blue', hex: '#33456E' },
  { value: 'royal-blue', label: 'Royal Blue', family: 'Blue', hex: '#2B5BC4' },
  { value: 'sky-blue', label: 'Sky Blue', family: 'Blue', hex: '#8FBEE3' },
  { value: 'teal', label: 'Teal', family: 'Green', hex: '#146B6B' },
  { value: 'bottle-green', label: 'Bottle Green', family: 'Green', hex: '#1E4D3B' },
  { value: 'olive', label: 'Olive', family: 'Green', hex: '#6B6B3A' },
  { value: 'sage', label: 'Sage', family: 'Green', hex: '#A6B79A' },
  { value: 'mint', label: 'Mint', family: 'Green', hex: '#B9DFCB' },
  { value: 'mustard', label: 'Mustard', family: 'Yellow', hex: '#D2A017' },
  { value: 'lemon', label: 'Lemon', family: 'Yellow', hex: '#F0E06A' },
  { value: 'ochre', label: 'Ochre', family: 'Yellow', hex: '#C98B2B' },
  { value: 'rust', label: 'Rust', family: 'Orange', hex: '#B4552B' },
  { value: 'coral', label: 'Coral', family: 'Orange', hex: '#E2725B' },
  { value: 'peach', label: 'Peach', family: 'Orange', hex: '#F2C1A7' },
  { value: 'maroon', label: 'Maroon', family: 'Red', hex: '#6E1B2A' },
  { value: 'crimson', label: 'Crimson', family: 'Red', hex: '#B01B37' },
  { value: 'brick-red', label: 'Brick Red', family: 'Red', hex: '#9C3A2E' },
  { value: 'blush', label: 'Blush', family: 'Pink', hex: '#EBC2C4' },
  { value: 'fuchsia', label: 'Fuchsia', family: 'Pink', hex: '#B93A78' },
  { value: 'rose-gold', label: 'Rose Gold', family: 'Pink', hex: '#C9877A' },
  { value: 'wine', label: 'Wine', family: 'Purple', hex: '#5B2140' },
  { value: 'lavender', label: 'Lavender', family: 'Purple', hex: '#BCA9DB' },
  { value: 'aubergine', label: 'Aubergine', family: 'Purple', hex: '#43264A' },
  { value: 'gold', label: 'Gold', family: 'Metallic', hex: '#B99341' },
  { value: 'silver', label: 'Silver', family: 'Metallic', hex: '#B6B7BA' },
  { value: 'multi', label: 'Multicolour', family: 'Multi', hex: '#8E7CC3' },
];

export const COLOR_BY_VALUE = new Map(COLORS.map((c) => [c.value, c]));

export const COLOR_FAMILIES = Array.from(new Set(COLORS.map((c) => c.family))).map((family) => ({
  value: family,
  label: family,
  hex: COLORS.find((c) => c.family === family)!.hex,
}));

export function colorHex(value: string): string {
  return COLOR_BY_VALUE.get(value)?.hex ?? '#B6B7BA';
}

export function colorLabel(value: string): string {
  return COLOR_BY_VALUE.get(value)?.label ?? value;
}

/* ----------------------------------------------------------------- sizes */

export type SizeSystem =
  | 'ALPHA'
  | 'NUMERIC_WAIST'
  | 'INDIAN_WOMENS'
  | 'FOOTWEAR_UK'
  | 'FOOTWEAR_KIDS'
  | 'KIDS_AGE'
  | 'ONE_SIZE'
  | 'VOLUME';

export interface SizeScale {
  system: SizeSystem;
  label: string;
  sizes: string[];
  /** Ordering key so "XS < S < M" sorts correctly in facets and tables. */
  order: (size: string) => number;
}

const ALPHA_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

export const SIZE_SCALES: Record<SizeSystem, SizeScale> = {
  ALPHA: {
    system: 'ALPHA',
    label: 'Standard',
    sizes: ALPHA_ORDER,
    order: (s) => ALPHA_ORDER.indexOf(s),
  },
  NUMERIC_WAIST: {
    system: 'NUMERIC_WAIST',
    label: 'Waist (inches)',
    sizes: ['28', '30', '32', '34', '36', '38', '40', '42', '44'],
    order: (s) => Number(s),
  },
  INDIAN_WOMENS: {
    system: 'INDIAN_WOMENS',
    label: 'Indian size',
    sizes: ['32', '34', '36', '38', '40', '42', '44', '46'],
    order: (s) => Number(s),
  },
  FOOTWEAR_UK: {
    system: 'FOOTWEAR_UK',
    label: 'UK / India',
    sizes: ['5', '6', '7', '8', '9', '10', '11', '12'],
    order: (s) => Number(s),
  },
  FOOTWEAR_KIDS: {
    system: 'FOOTWEAR_KIDS',
    label: 'UK Kids',
    sizes: ['8C', '9C', '10C', '11C', '12C', '13C', '1Y', '2Y', '3Y'],
    order: (s) => parseInt(s, 10) + (s.endsWith('Y') ? 100 : 0),
  },
  KIDS_AGE: {
    system: 'KIDS_AGE',
    label: 'Age',
    sizes: ['0-6M', '6-12M', '1-2Y', '2-3Y', '3-4Y', '4-5Y', '5-6Y', '6-7Y', '7-8Y', '9-10Y', '11-12Y'],
    order: (s) => parseFloat(s) * (s.includes('M') ? 0.1 : 1),
  },
  ONE_SIZE: { system: 'ONE_SIZE', label: 'One size', sizes: ['Onesize'], order: () => 0 },
  VOLUME: {
    system: 'VOLUME',
    label: 'Volume',
    sizes: ['30 ml', '50 ml', '100 ml', '200 ml'],
    order: (s) => parseFloat(s),
  },
};

export function sortSizes(sizes: string[], system: SizeSystem = 'ALPHA'): string[] {
  const scale = SIZE_SCALES[system] ?? SIZE_SCALES.ALPHA;
  return [...sizes].sort((a, b) => {
    const oa = scale.order(a);
    const ob = scale.order(b);
    if (Number.isNaN(oa) || Number.isNaN(ob) || oa === -1 || ob === -1) return a.localeCompare(b);
    return oa - ob;
  });
}

/** Body measurement chart backing the "Size chart" drawer on the PDP. */
export interface SizeChartRow {
  size: string;
  chest?: number;
  waist?: number;
  hip?: number;
  length?: number;
  shoulder?: number;
  footLength?: number;
}

export interface SizeChart {
  system: SizeSystem;
  unit: 'in' | 'cm';
  /** Whether the numbers describe the BODY or the GARMENT laid flat. */
  measures: 'body' | 'garment';
  rows: SizeChartRow[];
  note?: string;
}

/* ------------------------------------------------------ garment attributes */

export const FITS: AttributeOption[] = [
  { value: 'slim', label: 'Slim Fit' },
  { value: 'regular', label: 'Regular Fit' },
  { value: 'relaxed', label: 'Relaxed Fit' },
  { value: 'oversized', label: 'Oversized' },
  { value: 'boxy', label: 'Boxy' },
  { value: 'tailored', label: 'Tailored' },
  { value: 'skinny', label: 'Skinny' },
  { value: 'straight', label: 'Straight' },
  { value: 'bootcut', label: 'Bootcut' },
  { value: 'wide-leg', label: 'Wide Leg' },
  { value: 'a-line', label: 'A-Line' },
  { value: 'bodycon', label: 'Bodycon' },
  { value: 'flared', label: 'Flared' },
];

export const MATERIALS: AttributeOption[] = [
  { value: 'cotton', label: 'Cotton', group: 'Natural' },
  { value: 'organic-cotton', label: 'Organic Cotton', group: 'Natural' },
  { value: 'linen', label: 'Linen', group: 'Natural' },
  { value: 'cotton-linen', label: 'Cotton Linen Blend', group: 'Natural' },
  { value: 'silk', label: 'Silk', group: 'Natural' },
  { value: 'chanderi', label: 'Chanderi', group: 'Natural' },
  { value: 'khadi', label: 'Khadi', group: 'Natural' },
  { value: 'wool', label: 'Wool', group: 'Natural' },
  { value: 'cashmere', label: 'Cashmere', group: 'Natural' },
  { value: 'denim', label: 'Denim', group: 'Woven' },
  { value: 'corduroy', label: 'Corduroy', group: 'Woven' },
  { value: 'twill', label: 'Twill', group: 'Woven' },
  { value: 'rayon', label: 'Rayon', group: 'Blended' },
  { value: 'viscose', label: 'Viscose', group: 'Blended' },
  { value: 'modal', label: 'Modal', group: 'Blended' },
  { value: 'polyester', label: 'Polyester', group: 'Synthetic' },
  { value: 'nylon', label: 'Nylon', group: 'Synthetic' },
  { value: 'lycra-blend', label: 'Lycra Blend', group: 'Synthetic' },
  { value: 'georgette', label: 'Georgette', group: 'Synthetic' },
  { value: 'crepe', label: 'Crepe', group: 'Synthetic' },
  { value: 'velvet', label: 'Velvet', group: 'Speciality' },
  { value: 'leather', label: 'Genuine Leather', group: 'Speciality' },
  { value: 'vegan-leather', label: 'Vegan Leather', group: 'Speciality' },
  { value: 'canvas', label: 'Canvas', group: 'Speciality' },
  { value: 'mesh', label: 'Mesh', group: 'Speciality' },
];

export const PATTERNS: AttributeOption[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'striped', label: 'Striped' },
  { value: 'checked', label: 'Checked' },
  { value: 'printed', label: 'Printed' },
  { value: 'floral', label: 'Floral' },
  { value: 'geometric', label: 'Geometric' },
  { value: 'colourblocked', label: 'Colourblocked' },
  { value: 'embroidered', label: 'Embroidered' },
  { value: 'block-print', label: 'Block Print' },
  { value: 'ikat', label: 'Ikat' },
  { value: 'bandhani', label: 'Bandhani' },
  { value: 'self-design', label: 'Self Design' },
  { value: 'graphic', label: 'Graphic' },
  { value: 'tie-dye', label: 'Tie & Dye' },
];

export const OCCASIONS: AttributeOption[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'party', label: 'Party' },
  { value: 'festive', label: 'Festive' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'workwear', label: 'Workwear' },
  { value: 'sports', label: 'Sports' },
  { value: 'lounge', label: 'Lounge' },
  { value: 'travel', label: 'Travel' },
  { value: 'beach', label: 'Beach & Resort' },
];

export const SEASONS: AttributeOption[] = [
  { value: 'ss', label: 'Spring / Summer' },
  { value: 'aw', label: 'Autumn / Winter' },
  { value: 'monsoon', label: 'Monsoon' },
  { value: 'all-season', label: 'All Season' },
];

export const SLEEVE_TYPES: AttributeOption[] = [
  { value: 'sleeveless', label: 'Sleeveless' },
  { value: 'cap', label: 'Cap Sleeves' },
  { value: 'short', label: 'Short Sleeves' },
  { value: 'three-quarter', label: 'Three-Quarter Sleeves' },
  { value: 'long', label: 'Long Sleeves' },
  { value: 'roll-up', label: 'Roll-Up Sleeves' },
  { value: 'puff', label: 'Puff Sleeves' },
  { value: 'bell', label: 'Bell Sleeves' },
  { value: 'flared', label: 'Flared Sleeves' },
];

export const NECK_TYPES: AttributeOption[] = [
  { value: 'round', label: 'Round Neck' },
  { value: 'v-neck', label: 'V-Neck' },
  { value: 'collar', label: 'Collared' },
  { value: 'mandarin', label: 'Mandarin Collar' },
  { value: 'boat', label: 'Boat Neck' },
  { value: 'square', label: 'Square Neck' },
  { value: 'sweetheart', label: 'Sweetheart' },
  { value: 'halter', label: 'Halter Neck' },
  { value: 'polo', label: 'Polo Collar' },
  { value: 'hooded', label: 'Hooded' },
  { value: 'keyhole', label: 'Keyhole' },
];

export const WAIST_TYPES: AttributeOption[] = [
  { value: 'low-rise', label: 'Low Rise' },
  { value: 'mid-rise', label: 'Mid Rise' },
  { value: 'high-rise', label: 'High Rise' },
  { value: 'elasticated', label: 'Elasticated' },
  { value: 'drawstring', label: 'Drawstring' },
  { value: 'paperbag', label: 'Paperbag Waist' },
];

export const LENGTHS: AttributeOption[] = [
  { value: 'crop', label: 'Crop' },
  { value: 'waist', label: 'Waist Length' },
  { value: 'hip', label: 'Hip Length' },
  { value: 'thigh', label: 'Thigh Length' },
  { value: 'knee', label: 'Knee Length' },
  { value: 'calf', label: 'Calf Length' },
  { value: 'ankle', label: 'Ankle Length' },
  { value: 'floor', label: 'Floor Length' },
  { value: 'mini', label: 'Mini' },
  { value: 'midi', label: 'Midi' },
  { value: 'maxi', label: 'Maxi' },
];

export const CARE_INSTRUCTIONS: AttributeOption[] = [
  { value: 'machine-wash-cold', label: 'Machine wash cold' },
  { value: 'machine-wash-gentle', label: 'Machine wash, gentle cycle' },
  { value: 'hand-wash', label: 'Hand wash only' },
  { value: 'dry-clean', label: 'Dry clean only' },
  { value: 'do-not-bleach', label: 'Do not bleach' },
  { value: 'tumble-dry-low', label: 'Tumble dry low' },
  { value: 'line-dry-shade', label: 'Line dry in shade' },
  { value: 'iron-low', label: 'Iron on low heat' },
  { value: 'iron-medium', label: 'Iron on medium heat' },
  { value: 'do-not-iron-print', label: 'Do not iron directly on print' },
  { value: 'wash-dark-separately', label: 'Wash dark colours separately' },
];

export const GENDERS = ['MEN', 'WOMEN', 'UNISEX', 'BOYS', 'GIRLS', 'BABY'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABEL: Record<Gender, string> = {
  MEN: 'Men',
  WOMEN: 'Women',
  UNISEX: 'Unisex',
  BOYS: 'Boys',
  GIRLS: 'Girls',
  BABY: 'Baby',
};

/**
 * Which attributes a category family exposes. Drives both the seller product
 * form and the storefront filter rail, so the two can never drift apart.
 */
export interface AttributeGroupDefinition {
  key: string;
  label: string;
  options: AttributeOption[];
  /** Show as a facet on listing pages. */
  facet: boolean;
  /** Required when a seller submits a product in an applicable category. */
  required?: boolean;
  multi?: boolean;
}

export const ATTRIBUTE_DEFINITIONS: Record<string, AttributeGroupDefinition> = {
  fit: { key: 'fit', label: 'Fit', options: FITS, facet: true, required: true },
  material: { key: 'material', label: 'Material', options: MATERIALS, facet: true, required: true },
  pattern: { key: 'pattern', label: 'Pattern', options: PATTERNS, facet: true },
  occasion: { key: 'occasion', label: 'Occasion', options: OCCASIONS, facet: true, multi: true },
  season: { key: 'season', label: 'Season', options: SEASONS, facet: false },
  sleeve: { key: 'sleeve', label: 'Sleeve', options: SLEEVE_TYPES, facet: true },
  neck: { key: 'neck', label: 'Neck', options: NECK_TYPES, facet: true },
  waist: { key: 'waist', label: 'Waist rise', options: WAIST_TYPES, facet: true },
  length: { key: 'length', label: 'Length', options: LENGTHS, facet: true },
  care: { key: 'care', label: 'Care', options: CARE_INSTRUCTIONS, facet: false, multi: true },
};

/** Attribute keys applicable per category family. */
export const CATEGORY_ATTRIBUTE_MAP: Record<string, string[]> = {
  topwear: ['fit', 'material', 'pattern', 'occasion', 'season', 'sleeve', 'neck', 'length', 'care'],
  bottomwear: ['fit', 'material', 'pattern', 'occasion', 'season', 'waist', 'length', 'care'],
  dresses: ['fit', 'material', 'pattern', 'occasion', 'season', 'sleeve', 'neck', 'length', 'care'],
  ethnic: ['fit', 'material', 'pattern', 'occasion', 'season', 'sleeve', 'neck', 'length', 'care'],
  outerwear: ['fit', 'material', 'pattern', 'occasion', 'season', 'sleeve', 'length', 'care'],
  innerwear: ['fit', 'material', 'pattern', 'season', 'care'],
  footwear: ['material', 'pattern', 'occasion', 'season', 'care'],
  accessories: ['material', 'pattern', 'occasion', 'care'],
  bags: ['material', 'pattern', 'occasion', 'care'],
  beauty: ['occasion'],
  home: ['material', 'pattern', 'care'],
  electronics: [],
};

export function attributesForFamily(family: string): AttributeGroupDefinition[] {
  return (CATEGORY_ATTRIBUTE_MAP[family] ?? [])
    .map((key) => ATTRIBUTE_DEFINITIONS[key])
    .filter(Boolean);
}

export function optionLabel(attributeKey: string, value: string): string {
  const def = ATTRIBUTE_DEFINITIONS[attributeKey];
  return def?.options.find((o) => o.value === value)?.label ?? value;
}
