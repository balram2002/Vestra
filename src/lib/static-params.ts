/**
 * Build-time params that are never empty.
 *
 * With Cache Components, `generateStaticParams` must return at least one entry
 * or `next build` stops with `empty-generate-static-params`. Every dynamic
 * route here lists its params from MongoDB, so a fresh production database
 * (no products, no categories yet) used to fail the build outright.
 *
 * With no rows, or if the lookup fails, one placeholder is returned instead.
 * It prerenders as a not-found page, and every real slug still renders on
 * first request, because dynamic params stay allowed.
 */
export const PLACEHOLDER_SLUG = '__vestrawab_placeholder__';

export async function atLeastOne<T extends Record<string, string>>(
  load: () => Promise<T[]>,
  placeholder: T,
): Promise<T[]> {
  try {
    const rows = await load();
    return rows.length > 0 ? rows : [placeholder];
  } catch (error) {
    console.warn(
      '[vestrawab:build] could not list params, prerendering a placeholder:',
      error instanceof Error ? error.message : error,
    );
    return [placeholder];
  }
}