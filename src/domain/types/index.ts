// Status vocabularies live in domain/enums and attribute types in
// domain/attributes; both are re-exported here so consumers have a single
// import site for the whole domain vocabulary.
export type * from '../enums';
export type * from '../attributes';
export type * from '../live';

export type * from './identity';
export type * from './catalog';
export type * from './commerce';
export type * from './orders';
export type * from './ops';
export type * from './live';

// Value exports (const arrays / label maps) need a runtime re-export.
export { PERMISSIONS } from './identity';
export { PRODUCT_SORTS, PRODUCT_SORT_LABEL } from './catalog';
export { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL } from './ops';
export { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABEL } from './ops';
